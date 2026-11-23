'use strict';
// =====================================================================
//  GWIEZDNY ODDZIAŁ – LOGIKA GRY
//  Pliki:  config.js (ustawienia i balans) · utils.js (pomocnicze)
//          sound.js (dźwięki) · draw.js (grafika) · game.js (ten plik)
// =====================================================================

const canvas = document.getElementById('game');
const mainCtx = canvas.getContext('2d');
let ctx = mainCtx; // draw.js rysuje na "ctx" (podgląd jednostek podmienia go na chwilę)
const $ = id => document.getElementById(id);
const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// ---------------------------------------------------------------------
//  Zapis postępu (w przeglądarce – localStorage)
// ---------------------------------------------------------------------
const SAVE_KEY = 'sciezka-mocy-zapis-v1';
const SAVE_VERSION = 2;

function defaultSave() {
  return {
    version: SAVE_VERSION, credits: 0, upgrades: {}, unit: 'medium', paint: 'red', ownedPaints: ['red'],
    best: 0, runs: 0, kills: 0, bosses: 0, muted: false, refund: 0,
  };
}

// stary zapis (wersja z rycerzem Jedi): zwracamy kredyty za ulepszenia, których już nie ma
function migrateSave(s, old) {
  const OLD = { saberDmg: [50, 1.45], saberRange: [80, 1.6], deflect: [100, 1.6], force: [120, 1.55] };
  const SABER_COST = { green: 150, purple: 400, yellow: 700, orange: 900, white: 1200, red: 1600 };
  let refund = 0;
  const up = Object.assign({}, old.upgrades || {});
  if (up.blasterDmg) { up.weaponDmg = up.blasterDmg; delete up.blasterDmg; }
  for (const id of Object.keys(up)) {
    if (UPG[id]) { up[id] = Math.min(UPG[id].max, up[id]); continue; }
    const o = OLD[id];
    if (o) for (let l = 0; l < up[id]; l++) refund += Math.round(o[0] * Math.pow(o[1], l));
    delete up[id];
  }
  for (const id of old.ownedSabers || []) refund += SABER_COST[id] || 0;
  delete s.saber;
  delete s.ownedSabers;
  s.upgrades = up;
  s.credits = (s.credits || 0) + refund;
  s.refund = refund;
  s.version = SAVE_VERSION;
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const s = Object.assign(defaultSave(), data);
      if (!data.version || data.version < SAVE_VERSION) migrateSave(s, data);
      if (!s.upgrades || typeof s.upgrades !== 'object') s.upgrades = {};
      if (!Array.isArray(s.ownedPaints)) s.ownedPaints = ['red'];
      if (!UNITS[s.unit]) s.unit = 'medium';
      if (!PAINTS.some(p => p.id === s.paint)) s.paint = 'red';
      return s;
    }
  } catch (e) { /* brak zapisu – zaczynamy od zera */ }
  return defaultSave();
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* tryb prywatny itp. */ }
}
let save = loadSave();
writeSave();

// ---------------------------------------------------------------------
//  Statystyki jednostki (z jednostki + poziomów ulepszeń)
// ---------------------------------------------------------------------
function lvl(id) { return save.upgrades[id] || 0; }
function upgradeCost(u, level) { return Math.round(u.cost * Math.pow(u.growth, level)); }
function paintColor() { return (PAINTS.find(p => p.id === save.paint) || PAINTS[0]).color; }

function computeStats(unitId = save.unit, L = lvl) {
  const U = UNITS[unitId];
  const per = id => UPG[id].per * L(id);
  const cd = U.weapon.cooldown * Math.pow(1 - UPG.fireRate.per, L('fireRate'));
  return {
    unit: unitId, U,
    maxHp: U.hp * (1 + per('hp')),
    armor: Math.min(0.6, U.armor + per('armor')),
    maxShield: per('shield'),
    regen: per('regen'),
    speed: U.speed * (1 + per('speed')),
    jumpVel: U.jump,
    jumps: U.jumps + L('doubleJump'),
    weaponDmg: U.weapon.dmg * (1 + per('weaponDmg')),
    weaponCd: cd,
    fireRate: 1 / cd,
    shots: 1 + L('multishot'),
    skillDmg: U.skill.dmg * (1 + per('skill')),
    skillCd: U.skill.cooldown * Math.pow(0.92, L('skill')),
    specialMult: 1 + per('special'),
    specialCd: U.powers[0].cooldown * Math.pow(0.92, L('special')),
    magnet: CONFIG.magnetRadius + per('magnet') + (U.magnet || 0),
    creditMult: 1 + per('luck'),
  };
}
function statsWith(id, level) { return computeStats(save.unit, k => (k === id ? level : lvl(k))); }

// ---------------------------------------------------------------------
//  Stan gry
// ---------------------------------------------------------------------
let state = 'menu'; // menu | select | shop | playing | paused | dying | gameover
let stats = computeStats();
let player = null, run = null, boss = null;
let platforms = [], enemies = [], bullets = [], coins = [], powerups = [], particles = [], texts = [];
let allies = [], barriers = [];
const gen = { x: 0 };
const cam = { x: 0, shake: 0, lock: null };
const sky = { from: 0, to: 0, t: 1 };
const attract = { x: 0, anim: 0, timer: 0 };
const mouse = { x: 0, y: 0, active: 0 };
let time = 0;
let viewScale = 1, dpr = 1;

// ---------------------------------------------------------------------
//  Sterowanie
// ---------------------------------------------------------------------
const CODE_ACTION = {};
for (const [action, codes] of Object.entries(KEYS)) for (const c of codes) CODE_ACTION[c] = action;
const input = { down: {}, pressed: {}, released: {} };

function pressAction(a) { if (!input.down[a]) input.pressed[a] = true; input.down[a] = true; }
function releaseAction(a) { if (input.down[a]) input.released[a] = true; input.down[a] = false; }
function releaseAll() { for (const a in input.down) releaseAction(a); }

window.addEventListener('keydown', e => {
  Sound.init();
  const a = CODE_ACTION[e.code];
  const inGame = state === 'playing' || state === 'dying' || state === 'paused';
  if (inGame && (a || e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
  if (e.repeat) return;
  if (state === 'select') {
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (i >= 0) { selectUnit(UNIT_ORDER[i]); return; }
    if (a === 'left' || a === 'right') {
      const j = UNIT_ORDER.indexOf(save.unit) + (a === 'left' ? -1 : 1);
      selectUnit(UNIT_ORDER[mod(j, UNIT_ORDER.length)]);
      return;
    }
  }
  if (a === 'pause') {
    if (state === 'playing' || state === 'paused') togglePause();
    else if (state === 'shop' || state === 'select') showMenu();
    return;
  }
  if (a === 'mute') { toggleMute(); return; }
  if (e.code === 'Enter') {
    if (state === 'menu') { e.preventDefault(); showSelect(); return; }
    if (state === 'select' || state === 'gameover' || state === 'shop') { e.preventDefault(); startRun(); return; }
  }
  if (a) pressAction(a);
});
window.addEventListener('keyup', e => {
  const a = CODE_ACTION[e.code];
  if (a) releaseAction(a);
});
window.addEventListener('blur', () => {
  releaseAll();
  if (state === 'playing') togglePause();
});
function trackMouse(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / viewScale;
  mouse.y = (e.clientY - r.top) / viewScale;
  mouse.active = 2;
}
canvas.addEventListener('mousemove', trackMouse);
canvas.addEventListener('mousedown', e => {
  Sound.init();
  if (state !== 'playing') return;
  trackMouse(e);
  if (e.button === 0) pressAction('shoot');
  if (e.button === 2) pressAction('skill');
  e.preventDefault();
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) releaseAction('shoot');
  if (e.button === 2) releaseAction('skill');
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------------------------------------------------------------------
//  Start misji
// ---------------------------------------------------------------------
function startRun() {
  Sound.init();
  Sound.play('click');
  releaseAll();
  stats = computeStats();
  const U = stats.U;
  platforms = []; enemies = []; bullets = []; coins = []; powerups = []; particles = []; texts = [];
  allies = []; barriers = [];
  boss = null;
  player = {
    x: 0, y: GY, prevY: GY, vx: 0, vy: 0, w: U.w, h: U.h, dir: 1, aim: 0,
    onGround: true, ducking: false, moving: false,
    jumpsLeft: stats.jumps, coyote: 0, jumpBuf: 0,
    hp: stats.maxHp, shield: stats.maxShield, shieldDelay: 0,
    invuln: 0, shootCd: 0, skillCd: 0, specialCd: 2, spin: 0, spinPhase: 0, recoil: 0,
    dashT: 0, dashId: 0, cloakT: 0, empFx: 0,
    muzzle: 0, anim: 0, dead: false, hurtFlash: 0, safeX: 0, safeY: GY,
  };
  run = {
    meters: 0, credits: 0, kills: 0, time: 0,
    combo: 0, comboT: 0, bestCombo: 0, bossesBeaten: 0,
    bossNext: CONFIG.bossFirst, bossIncoming: false, biome: 0,
    power: { invincible: 0, rapid: 0, magnet: 0, double: 0 },
    nextPowerAt: rand(180, 280), banner: null, dyingT: 0, hints: [],
  };
  sky.from = 0; sky.to = 0; sky.t = 1;
  addPlatform(-500, GY, 1700, true);
  coinLine(260, GY - 28, 8);
  gen.x = 1200;
  if (save.runs < 3) {
    run.hints = [
      { x: 150,  text: 'A / D albo ← / → – chodzenie' },
      { x: 560,  text: 'Spacja / W – skok (przytrzymaj = wyżej)' },
      { x: 980,  text: 'J / lewy przycisk – strzał (myszką celujesz)' },
      { x: 1420, text: `K / E / prawy przycisk – ${U.skill.name}` },
      { x: 1860, text: `1 / L / Q – ${U.powers[0].name}` },
      { x: 2300, text: 'S / ↓ – kucnięcie. Skacz wrogom na głowy!' },
    ];
  }
  cam.x = player.x - 380;
  cam.lock = null;
  cam.shake = 0;
  setBanner(BIOMES[0].name, `Planeta 1 · ${U.name}`, '#ffe81f');
  showOverlay(null);
  state = 'playing';
}

function setBanner(title, sub, color = '#ffe81f') {
  run.banner = { title, sub, color, t: 3.2, max: 3.2 };
}

// ---------------------------------------------------------------------
//  Budowanie świata (teren, wrogowie, kredyty) – powstaje przed graczem
// ---------------------------------------------------------------------
function addPlatform(x, y, w, solid) {
  const pl = { x, y, w, solid, seed: Math.random() * 1000 };
  platforms.push(pl);
  return pl;
}
function platformAt(x, y) {
  return platforms.find(pl => Math.abs(pl.y - y) < 3 && x >= pl.x && x <= pl.x + pl.w) || null;
}
function addCoin(x, y, value = 1, o = {}) {
  coins.push({ x, y, value, t: rand(0, 6), vx: o.vx || 0, vy: o.vy || 0, magnet: !!o.magnet, mag: 0, dead: false });
}
function coinLine(x, y, n, dx = 34) {
  for (let i = 0; i < n; i++) addCoin(x + i * dx, y);
}
function coinArc(x0, x1, yBase, height, n) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    addCoin(lerp(x0, x1, t), yBase - Math.sin(t * Math.PI) * height);
  }
}
function enemyPool(m) {
  const pool = [];
  for (const [type, w] of Object.entries(ENEMY_WEIGHTS)) if (m >= ENEMIES[type].from) pool.push([type, w]);
  return pool;
}

function genChunk() {
  const m = gen.x / CONFIG.pxPerMeter;
  const d = m / 1000;
  // przepaści dopasowane do skoku wybranej jednostki (ulepszona szybkość ułatwia skoki)
  const reach = stats.U.speed * ((2 * stats.jumpVel) / CONFIG.gravity);
  const jumpH = (stats.jumpVel * stats.jumpVel) / (2 * CONFIG.gravity);

  if (run.bossIncoming || boss) {
    addPlatform(gen.x, GY, 900, true);
    if (Math.random() < 0.4) coinLine(gen.x + rand(100, 500), GY - 28, randi(4, 7));
    gen.x += 900;
    return;
  }

  const r = Math.random();
  if (r < 0.45) {
    const gw = reach * rand(0.3, 0.5 + Math.min(0.15, d * 0.08));
    if (Math.random() < 0.55) coinArc(gen.x - 30, gen.x + gw + 30, GY - 45, Math.min(95, jumpH * 0.6), 6);
    gen.x += gw;
  } else if (r < 0.6 && m > 200) {
    const gw = reach * rand(0.35, 0.5);
    const pw = rand(110, 160);
    const fy = GY - rand(25, Math.min(70, jumpH * 0.45));
    addPlatform(gen.x + gw, fy, pw, false);
    coinLine(gen.x + gw + 18, fy - 30, Math.max(1, Math.floor((pw - 20) / 34)));
    gen.x += gw * 2 + pw;
  }
  const len = rand(600, 1100);
  const ground = addPlatform(gen.x, GY, len, true);
  populate(ground, m, d, jumpH);
  gen.x += len;
}

function populate(pl, m, d, jumpH) {
  const x0 = pl.x + 150, x1 = pl.x + pl.w - 90;
  if (x1 <= x0) return;

  // latająca platforma nad ziemią
  if (Math.random() < 0.35) {
    const fw = rand(150, 240);
    const fx = rand(x0, Math.max(x0, x1 - fw));
    const fy = GY - rand(90, Math.min(135, jumpH - 15));
    const fp = addPlatform(fx, fy, fw, false);
    if (m >= ENEMIES.turret.from && Math.random() < 0.45) spawnEnemy('turret', fx + fw / 2, fp);
    else coinLine(fx + 16, fy - 30, Math.max(1, Math.floor((fw - 20) / 34)));
  }

  // wrogowie
  const pool = enemyPool(m);
  const count = Math.min(5, Math.floor(rand(0.6, 2.0 + d * 1.5)));
  let x = x0 - 60;
  for (let i = 0; i < count; i++) {
    x += rand(170, 290);
    if (x > x1) break;
    const type = pickWeighted(pool);
    if (type === 'probe') spawnEnemy('probe', x, null, GY - rand(110, 165));
    else spawnEnemy(type, x, pl);
  }

  // kredyty
  if (Math.random() < 0.45) {
    const n = randi(4, 8);
    coinLine(rand(x0, Math.max(x0, x1 - n * 34)), GY - 28, n);
  }

  // bonus
  if (m >= run.nextPowerAt) {
    run.nextPowerAt = m + rand(220, 380);
    const type = pickWeighted(Object.entries(POWERUPS).map(([k, v]) => [k, v.weight]));
    spawnPowerup(type, rand(x0, x1), GY - 92);
  }
}

// ---------------------------------------------------------------------
//  Gracz: ruch
// ---------------------------------------------------------------------
function playerBox() {
  const p = player, h = p.ducking ? Math.round(p.h * 0.58) : p.h;
  return { x: p.x - p.w / 2, y: p.y - h, w: p.w, h };
}
// skrzynie są twarde – można na nich stanąć, ale nie da się przez nie przejść
function crateBoxes() {
  const out = [];
  for (const e of enemies) if (e.type === 'crate' && !e.dead && !e.falling) out.push({ x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h });
  return out;
}

function updatePlayer(dt) {
  const p = player, U = stats.U, C = CONFIG;
  p.prevY = p.y;
  p.invuln -= dt; p.shootCd -= dt; p.skillCd -= dt; p.specialCd -= dt;
  p.muzzle -= dt; p.hurtFlash -= dt; p.empFx -= dt;
  p.recoil = Math.max(0, p.recoil - dt * 9);
  if (p.cloakT > 0) p.cloakT -= dt;
  mouse.active -= dt;

  // leczenie i tarcza
  if (stats.regen > 0 && p.hp < stats.maxHp) p.hp = Math.min(stats.maxHp, p.hp + stats.regen * dt);
  if (p.shieldDelay > 0) p.shieldDelay -= dt;
  else if (p.shield < stats.maxShield) p.shield = Math.min(stats.maxShield, p.shield + stats.maxShield * 0.3 * dt);
  run.time += dt;

  // --- chodzenie ---
  const move = (input.down.right ? 1 : 0) - (input.down.left ? 1 : 0);
  p.ducking = !!input.down.duck && p.onGround && p.dashT <= 0;
  const hw = p.w / 2;
  const crates = crateBoxes();
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dir * 950;
    p.vy = 0;
    particles.push({ kind: 'streak', x: p.x, y: p.y - rand(10, p.h - 10), vx: -p.dir * 600, vy: 0, life: 0.2, max: 0.2, size: 3, color: paintColor() });
    dashHits();
  } else {
    let maxSp = stats.speed;
    if (p.ducking) maxSp *= 0.3;
    if (stats.unit === 'heavy' && input.down.shoot && p.onGround) maxSp *= 0.65;
    const target = move * maxSp;
    const acc = (p.onGround ? C.accelGround : C.accelAir) * dt;
    if (p.vx < target) p.vx = Math.min(target, p.vx + acc);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - acc);
    if (move !== 0) p.dir = move;
  }
  const oldX = p.x;
  p.x += p.vx * dt;
  // ściany przepaści i skrzynie
  for (const pl of platforms) {
    if (!pl.solid || p.y <= pl.y + 4) continue;
    if (oldX + hw <= pl.x + 1 && p.x + hw > pl.x) { p.x = pl.x - hw; p.vx = Math.min(p.vx, 0); }
    else if (oldX - hw >= pl.x + pl.w - 1 && p.x - hw < pl.x + pl.w) { p.x = pl.x + pl.w + hw; p.vx = Math.max(p.vx, 0); }
  }
  for (const c of crates) {
    if (p.y <= c.y + 4 || p.y - p.h >= c.y + c.h) continue;
    if (oldX + hw <= c.x + 1 && p.x + hw > c.x) { p.x = c.x - hw; p.vx = Math.min(p.vx, 0); }
    else if (oldX - hw >= c.x + c.w - 1 && p.x - hw < c.x + c.w) { p.x = c.x + c.w + hw; p.vx = Math.max(p.vx, 0); }
  }
  // brzegi ekranu (w lewo nie da się uciec, przy bossie także w prawo)
  const minX = cam.x + 15 + hw;
  if (p.x < minX) { p.x = minX; if (p.vx < 0) p.vx = 0; }
  if (cam.lock !== null && p.x > cam.x + W - 15 - hw) { p.x = cam.x + W - 15 - hw; if (p.vx > 0) p.vx = 0; }
  p.moving = Math.abs(p.vx) > 20;
  run.meters = Math.max(run.meters, p.x / C.pxPerMeter);

  // --- skok (z "coyote time" i buforem wciśnięcia) ---
  if (input.pressed.jump) p.jumpBuf = 0.13;
  else p.jumpBuf -= dt;
  if (p.onGround) {
    p.coyote = 0.1;
    p.jumpsLeft = stats.jumps;
  } else {
    p.coyote -= dt;
    if (p.coyote <= 0 && p.jumpsLeft === stats.jumps) p.jumpsLeft = stats.jumps - 1;
  }
  if (p.jumpBuf > 0 && p.jumpsLeft > 0 && p.dashT <= 0) {
    const fromGround = p.coyote > 0 && p.jumpsLeft === stats.jumps;
    p.vy = -stats.jumpVel * (fromGround ? 1 : 0.92);
    p.jumpsLeft--;
    p.jumpBuf = 0;
    p.coyote = 0;
    p.onGround = false;
    if (fromGround) { dust(p.x, p.y, 6); Sound.play('jump'); }
    else { ringFx(p.x, p.y - 8, '#9fd8ff', 34); burst(p.x, p.y, 8, '#ffb347', 160, 0.3, 3); Sound.play('jump2'); }
  }
  if (input.released.jump && p.vy < -C.jumpCut) p.vy = -C.jumpCut;

  // --- grawitacja i lądowanie (platformy i skrzynie) ---
  if (p.dashT <= 0) {
    let g = C.gravity;
    if (!p.onGround && input.down.duck) g *= 2.2;
    p.vy = Math.min(p.vy + g * dt, 1500);
  }
  let newY = p.y + p.vy * dt;
  p.onGround = false;
  if (p.vy >= 0) {
    let land = null;
    const tops = platforms.concat(crates.map(c => ({ x: c.x, y: c.y, w: c.w, crate: true })));
    for (const pl of tops) {
      if (p.x + hw - 3 > pl.x && p.x - hw + 3 < pl.x + pl.w && p.y <= pl.y + 1 && newY >= pl.y) {
        if (!land || pl.y < land.y) land = pl;
      }
    }
    if (land) {
      if (p.vy > 700) { dust(p.x, land.y, 8); Sound.play('land'); }
      newY = land.y;
      p.vy = 0;
      p.onGround = true;
      if (land.solid && p.x > land.x + 30 && p.x < land.x + land.w - 30) { p.safeX = p.x; p.safeY = land.y; }
    }
  }
  p.y = newY;
  if (p.y > H + 60) {
    pitFall();
    if (p.dead) return;
  }

  // --- celowanie: myszką albo automatycznie w najbliższego wroga ---
  let aimAng = 0;
  if (mouse.active > 0) {
    const sy = p.y - (p.ducking ? 27 : 46);
    const wx = mouse.x + cam.x;
    if (p.dashT <= 0 && Math.abs(wx - p.x) > 8) p.dir = wx > p.x ? 1 : -1;
    aimAng = clamp(Math.atan2(mouse.y - sy, Math.abs(wx - p.x)), -1.1, 1.1);
  } else {
    const t = aimAssist();
    if (t !== null) aimAng = t;
  }
  p.aim = lerp(p.aim, aimAng, Math.min(1, dt * 18));

  // --- broń główna ---
  const shooting = input.down.shoot && p.dashT <= 0;
  if (U.weapon.spinUp) {
    p.spin = shooting ? Math.min(1, p.spin + dt / U.weapon.spinUp) : Math.max(0, p.spin - dt * 1.5);
    p.spinPhase += dt * (4 + p.spin * 40);
  }
  if (shooting && p.shootCd <= 0) {
    fireWeapon();
    let cd = stats.weaponCd;
    if (U.weapon.spinUp) cd = lerp(cd * 3.5, cd, p.spin);
    if (run.power.rapid > 0) cd *= 0.5;
    p.shootCd = cd;
  }
  // --- umiejętność [K] i zdolność specjalna [L] ---
  if (input.pressed.skill) {
    if (p.skillCd <= 0) useSkill();
    else Sound.play('nope');
  }
  if (input.pressed.power1) {
    if (p.specialCd <= 0) useSpecial();
    else Sound.play('nope');
  }

  p.anim += dt * (p.onGround ? Math.abs(p.vx) / 38 : 4);
}

function aimAssist() {
  const p = player;
  const sy = p.y - (p.ducking ? 27 : 46);
  let best = null, bd = Infinity;
  const consider = (tx, ty) => {
    const dx = (tx - p.x) * p.dir;
    if (dx < 30 || dx > 650) return;
    const a = Math.atan2(ty - sy, dx);
    if (Math.abs(a) > 0.6) return;
    if (dx < bd) { bd = dx; best = a; }
  };
  for (const e of enemies) if (!e.dead && !e.falling && e.type !== 'crate') consider(e.x, e.y - e.h * 0.55);
  if (boss && boss.phase !== 'dying') consider(boss.x, boss.y - 150);
  return best;
}

function pitFall() {
  const p = player;
  hurt(Math.round(stats.maxHp * 0.25), { unblockable: true });
  if (p.dead) return;
  let x = Math.max(p.safeX, cam.x + 60), y = p.safeY;
  if (!platformAt(x, y)) {
    const pl = platforms.find(q => q.solid && q.x + q.w > cam.x + 90);
    if (pl) { x = Math.max(pl.x + 30, cam.x + 60); y = pl.y; }
  }
  p.x = x; p.y = y; p.vx = 0; p.vy = 0;
  p.onGround = true;
  p.invuln = 1.5;
  floatText(p.x, p.y - 95, 'Plecak odrzutowy cię ratuje!', '#9fd8ff', 16);
  ringFx(p.x, p.y - 30, '#9fd8ff', 60);
}

function hurt(dmg, opts = {}) {
  const p = player;
  if (p.dead) return false;
  if (!opts.unblockable && (p.invuln > 0 || run.power.invincible > 0)) return false;
  if (!opts.unblockable) dmg *= 1 - stats.armor;
  let rest = dmg;
  if (p.shield > 0) {
    const a = Math.min(p.shield, rest);
    p.shield -= a;
    rest -= a;
    if (a > 0) burst(p.x, p.y - 35, 8, '#6fc8ff', 180, 0.3, 3);
  }
  p.hp -= rest;
  p.shieldDelay = 3;
  p.invuln = 0.8;
  p.hurtFlash = 0.25;
  if (opts.kx) p.vx = opts.kx;
  cam.shake = Math.max(cam.shake, 7);
  floatText(p.x, Math.min(p.y, H - 20) - 80, '-' + Math.round(dmg), '#ff5a5a', 18);
  Sound.play('hurt');
  run.combo = 0;
  run.comboT = 0;
  if (p.hp <= 0) {
    p.hp = 0;
    playerDie();
  }
  return true;
}

function playerDie() {
  const p = player;
  p.dead = true;
  state = 'dying';
  run.dyingT = 1.5;
  const y = Math.min(p.y - 30, H - 30);
  explosion(p.x, y, 1.4);
  burst(p.x, y, 40, paintColor(), 400, 1, 4);
  Sound.play('death');
  cam.shake = 14;
}

// ---------------------------------------------------------------------
//  Gracz: broń i umiejętności
// ---------------------------------------------------------------------
function addBolt(x, y, vx, vy, dmg, from, color, src = 'weapon') {
  const b = { kind: 'bolt', x, y, px: x, py: y, vx, vy, dmg, from, color, src, len: from === 'player' ? 22 : 18, life: 3, dead: false };
  bullets.push(b);
  return b;
}

// gdzie jest wylot lufy (liczone tak samo jak w rysowaniu postaci)
function muzzlePos() {
  const p = player, L = UNIT_LOOK[stats.unit], s = L.scale;
  const armY = p.ducking ? -27 : -46;
  const sx = p.x + p.dir * 3 * s, sy = p.y + armY * s;
  const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
  const mx = L.muzzle[0], my = L.muzzle[1];
  return { x: sx + p.dir * (mx * ca - my * sa) * s, y: sy + (mx * sa + my * ca) * s };
}

function fireWeapon() {
  const p = player, w = stats.U.weapon;
  const mz = muzzlePos();
  const n = stats.shots;
  for (let i = 0; i < n; i++) {
    const a = p.aim + (i - (n - 1) / 2) * 0.1 + rand(-w.spread, w.spread);
    let dmg = stats.weaponDmg;
    if (p.cloakT > 0) dmg *= 2;
    const b = addBolt(mz.x, mz.y, p.dir * Math.cos(a) * w.speed, Math.sin(a) * w.speed, dmg, 'player', w.color);
    if (w.pierce) { b.pierce = w.pierce; b.hits = []; b.len = 32; b.ion = true; }
    if (w.spinUp) b.len = 14;
  }
  p.muzzle = 0.05;
  p.recoil = 1;
  // dymek z lufy
  if (Math.random() < (w.spinUp ? 0.35 : 0.8)) {
    particles.push({ kind: 'smoke', x: mz.x, y: mz.y, vx: p.dir * rand(10, 40) + p.vx * 0.5, vy: rand(-45, -15), life: 0.45, max: 0.45, size: rand(1.5, 3.5), color: '#c4c4c4' });
  }
  // łuski wylatujące z działka obrotowego
  if (w.spinUp) {
    const s = UNIT_LOOK.heavy.scale;
    particles.push({ kind: 'spark', x: p.x + p.dir * 20 * s, y: p.y - 42 * s, vx: -p.dir * rand(40, 130) + p.vx * 0.5, vy: rand(-260, -140), life: 0.55, max: 0.55, size: 2.2, color: '#d9b44a', g: 1300 });
  }
  Sound.play(w.sound);
}

function useSkill() {
  const p = player;
  p.skillCd = stats.skillCd;
  switch (stats.unit) {
    case 'light':
      p.dashT = 0.2;
      p.dashId++;
      p.invuln = Math.max(p.invuln, 0.3);
      Sound.play('dash');
      break;
    case 'medium': {
      const mz = muzzlePos();
      bullets.push({ kind: 'grenade', x: mz.x, y: mz.y - 4, px: mz.x, py: mz.y, vx: p.dir * 520 + p.vx * 0.5, vy: -480 + p.aim * 300, dmg: stats.skillDmg, radius: stats.U.skill.radius, from: 'player', life: 1.6, dead: false });
      Sound.play('throw');
      break;
    }
    case 'heavy': {
      const mz = muzzlePos();
      bullets.push({ kind: 'rocket', x: mz.x, y: mz.y, px: mz.x, py: mz.y, vx: p.dir * Math.cos(p.aim) * 500, vy: Math.sin(p.aim) * 500, dmg: stats.skillDmg, radius: stats.U.skill.radius, from: 'player', life: 2, dead: false });
      p.vx -= p.dir * 120;
      cam.shake = Math.max(cam.shake, 4);
      Sound.play('rocket');
      break;
    }
    case 'specialist': {
      if (allies.length >= 2) allies.shift();
      const dur = stats.U.skill.duration * (1 + 0.1 * lvl('skill'));
      allies.push({ x: p.x + p.dir * 34, y: p.y, vy: 0, t: dur, max: dur, fireT: 0.4, aim: p.dir > 0 ? 0 : Math.PI, onGround: p.onGround });
      ringFx(p.x + p.dir * 34, p.y - 15, '#5ad8ff', 30);
      Sound.play('turret');
      break;
    }
  }
}

function useSpecial() {
  const p = player, dur = stats.U.powers[0].duration * stats.specialMult;
  p.specialCd = stats.specialCd;
  switch (stats.unit) {
    case 'light':
      p.cloakT = dur;
      burst(p.x, p.y - 30, 20, '#bfe6ff', 200, 0.4, 3);
      floatText(p.x, p.y - 95, 'Maskowanie!', '#bfe6ff', 18);
      Sound.play('cloak');
      break;
    case 'medium': {
      const v = Math.round(stats.maxHp * 0.35);
      p.hp = Math.min(stats.maxHp, p.hp + v);
      run.power.rapid = Math.max(run.power.rapid, dur);
      floatText(p.x, p.y - 95, `+${v} HP · szybki ogień!`, '#7dff8a', 18);
      ringFx(p.x, p.y - 30, '#7dff8a', 50);
      Sound.play('stim');
      break;
    }
    case 'heavy':
      barriers.push({ x: p.x + p.dir * 55, y: p.y, h: 120, t: dur, max: dur });
      Sound.play('barrier');
      break;
    case 'specialist': {
      p.empFx = 0.6;
      const dmg = stats.U.powers[0].dmg * stats.specialMult;
      for (const e of enemies) {
        if (e.dead || e.falling || e.x < cam.x - 20 || e.x > cam.x + W + 20) continue;
        e.stun = dur;
        damageEnemy(e, dmg * (e.def.machine ? 1.5 : 1), 'emp');
      }
      if (boss && boss.phase !== 'dying') {
        boss.stun = Math.min(dur, 2);
        damageBoss(dmg * 2);
      }
      for (const b of bullets) {
        if (b.from === 'enemy' && !b.dead) { b.dead = true; burst(b.x, b.y, 4, '#7fd4ff', 120, 0.3, 2); }
      }
      cam.shake = Math.max(cam.shake, 8);
      Sound.play('emp');
      break;
    }
  }
}

function dashHits() {
  const p = player;
  const box = { x: p.x - 30, y: p.y - p.h, w: 60, h: p.h };
  for (const e of enemies) {
    if (e.dead || e.falling || e.dashHit === p.dashId || !overlap(box, enemyBox(e))) continue;
    e.dashHit = p.dashId;
    damageEnemy(e, stats.skillDmg * (p.cloakT > 0 ? 2 : 1), 'dash');
    e.kb += p.dir * 300;
    burst(e.x, e.y - e.h / 2, 8, paintColor(), 220, 0.3, 3);
  }
  if (boss && boss.phase !== 'dying' && boss.dashHit !== p.dashId && overlap(box, bossBox())) {
    boss.dashHit = p.dashId;
    damageBoss(stats.skillDmg);
  }
}

// wybuch granatu / rakiety – rani wszystkich wrogów w promieniu
function explodeArea(x, y, radius, dmg) {
  explosion(x, y, radius / 60);
  for (const e of enemies) {
    if (e.dead || e.falling) continue;
    const ex = e.x, ey = e.y - e.h / 2, reach = radius + e.w / 2;
    const d = Math.hypot(ex - x, ey - y);
    if (d < reach) {
      damageEnemy(e, dmg * (1 - (d / reach) * 0.5), 'blast');
      e.kb += (ex >= x ? 1 : -1) * 520;
    }
  }
  if (boss && boss.phase !== 'dying' && Math.hypot(boss.x - x, boss.y - 120 - y) < radius + 100) damageBoss(dmg);
}

// ---------------------------------------------------------------------
//  Sojusznicy: wieżyczki technika i bariery ciężkozbrojnego
// ---------------------------------------------------------------------
function nearestEnemy(x, y, range) {
  let best = null, bd = range;
  for (const e of enemies) {
    if (e.dead || e.falling || e.type === 'crate') continue;
    const ty = e.y - e.h / 2, d = Math.hypot(e.x - x, ty - y);
    if (d < bd) { bd = d; best = { x: e.x, y: ty }; }
  }
  if (boss && boss.phase !== 'dying') {
    const d = Math.hypot(boss.x - x, boss.y - 150 - y);
    if (d < bd) best = { x: boss.x, y: boss.y - 150 };
  }
  return best;
}

function updateAllies(dt) {
  for (const a of allies) {
    a.t -= dt;
    if (!a.onGround) {
      a.vy += CONFIG.gravity * dt;
      const ny = a.y + a.vy * dt;
      const pl = platforms.find(q => a.x >= q.x && a.x <= q.x + q.w && a.y <= q.y + 1 && ny >= q.y);
      if (pl) { a.y = pl.y; a.vy = 0; a.onGround = true; }
      else a.y = ny;
      if (a.y > H + 60) a.t = 0;
      continue;
    }
    a.fireT -= dt;
    const t = nearestEnemy(a.x, a.y - 23, 650);
    if (t) {
      a.aim = Math.atan2(t.y - (a.y - 23), t.x - a.x);
      if (a.fireT <= 0) {
        a.fireT = 0.3;
        const c = Math.cos(a.aim), s = Math.sin(a.aim);
        addBolt(a.x + c * 24, a.y - 23 + s * 24, c * 1100, s * 1100, stats.skillDmg, 'player', '#5ad8ff', 'turret');
        Sound.play('tshot');
      }
    }
  }
  for (const a of allies) if (a.t <= 0 && a.y < H) burst(a.x, a.y - 15, 10, '#b9c5d0', 160, 0.4, 3);
  allies = allies.filter(a => a.t > 0);
  for (const b of barriers) b.t -= dt;
  barriers = barriers.filter(b => b.t > 0);
}

// ---------------------------------------------------------------------
//  Wrogowie
// ---------------------------------------------------------------------
function dmgScale() { return 1 + (run.meters / 1000) * CONFIG.enemyDamageGrowth; }
function enemyBox(e) { return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h }; }

function spawnEnemy(type, x, plat, y) {
  const def = ENEMIES[type];
  const hp = def.hp * (1 + (run.meters / 1000) * CONFIG.enemyHpGrowth);
  const e = {
    type, def, x, y: plat ? plat.y : y, baseY: y, plat, w: def.w, h: def.h, hp, maxHp: hp, dir: -1,
    t: Math.random() * 10, kb: 0, vy: 0, falling: false, flash: 0, muzzle: 0, dead: false, stun: 0,
    fireT: def.fireEvery ? rand(0.6, 1.4) : 0, nextHigh: Math.random() < 0.6, burst: 0, burstT: 0,
    aim: Math.PI, armed: false, walking: false, dashHit: -1,
  };
  enemies.push(e);
  return e;
}

function moveEnemy(e, nx, knock) {
  if (!e.plat) { e.x = nx; return; }
  const pl = e.plat;
  if (nx >= pl.x + 2 && nx <= pl.x + pl.w - 2) { e.x = nx; return; }
  const other = platforms.find(q => q !== pl && Math.abs(q.y - pl.y) < 3 && nx >= q.x && nx <= q.x + q.w);
  if (other) { e.plat = other; e.x = nx; return; }
  if (knock) {
    // zepchnięty w przepaść!
    e.x = nx;
    e.falling = true;
    e.vy = -150;
    if (e.type !== 'crate') floatText(e.x, e.y - e.h - 10, 'Aaaa!', '#ffffff', 14);
  }
}

function updateEnemies(dt) {
  const p = player;
  const pb = p.dead ? null : playerBox();
  const hidden = p.cloakT > 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const def = e.def;
    e.t += dt; e.flash -= dt; e.muzzle -= dt;
    if (e.falling) {
      e.vy += CONFIG.gravity * dt;
      e.y += e.vy * dt;
      e.x += e.kb * dt;
      if (e.y > H + 120) killEnemy(e, 'fall');
      continue;
    }
    if (e.kb !== 0) {
      moveEnemy(e, e.x + e.kb * dt, true);
      e.kb *= Math.pow(0.004, dt);
      if (Math.abs(e.kb) < 8) e.kb = 0;
      if (e.falling) continue;
    }
    if (e.stun > 0) { e.stun -= dt; e.armed = false; e.walking = false; continue; }

    const dx = p.x - e.x, adx = Math.abs(dx);
    const onScreen = e.x + e.w / 2 > cam.x && e.x - e.w / 2 < cam.x + W;
    if (adx > 12 && e.type !== 'turret' && e.type !== 'crate') e.dir = dx > 0 ? 1 : -1;
    e.armed = onScreen && !p.dead && !hidden && adx > 70 && adx < 820;

    // ruch: podchodzą na swoją ulubioną odległość
    e.walking = false;
    if (def.walk && onScreen && !hidden && !p.dead) {
      if (adx > def.keep + 15) { moveEnemy(e, e.x + e.dir * def.walk * dt, false); e.walking = true; }
      else if (adx < def.keep - 80 && e.type === 'trooper') { moveEnemy(e, e.x - e.dir * def.walk * 0.6 * dt, false); e.walking = true; }
    }
    if (e.type === 'probe') {
      e.y = e.baseY + Math.sin(e.t * 2.3) * 14;
      if (onScreen && !hidden) {
        const side = e.x >= p.x ? 1 : -1;
        e.x += clamp(p.x + side * 200 - e.x, -70 * dt, 70 * dt);
      }
    }
    if (e.type === 'turret' && e.armed) e.aim = Math.atan2(p.y - 35 - (e.y - 24), p.x - e.x);

    // strzelanie
    if (def.fireEvery && e.armed) {
      e.fireT -= dt;
      if (e.fireT <= 0) {
        enemyShoot(e);
        e.fireT = rand(def.fireEvery[0], def.fireEvery[1]) / (1 + (run.meters / 1000) * 0.15);
        e.nextHigh = Math.random() < 0.6;
      }
    }
    if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burst--;
        e.burstT = 0.14;
        aimedBolt(e.x + Math.cos(e.aim) * 30, e.y - 24 + Math.sin(e.aim) * 30, def.bolt.speed, def.bolt.dmg * dmgScale());
        e.muzzle = 0.06;
        Sound.play('eshoot');
      }
    }

    if (pb && e.type !== 'crate' && overlap(pb, enemyBox(e))) touchEnemy(e);
  }
}

function aimedBolt(x, y, sp, dmg) {
  const p = player;
  const tx = p.x + p.vx * 0.25, ty = p.y - (p.ducking ? 20 : 38);
  const a = Math.atan2(ty - y, tx - x);
  addBolt(x, y, Math.cos(a) * sp, Math.sin(a) * sp, dmg, 'enemy', '#ff3b30');
}

function enemyShoot(e) {
  const p = player, def = e.def, dmg = def.bolt.dmg * dmgScale(), sp = def.bolt.speed, dir = e.dir;
  if (e.type === 'trooper' || e.type === 'droid') {
    // strzał wysoko → kucnij; nisko → skacz!
    const gx = e.x + dir * (e.type === 'trooper' ? 40 : 42), gy = e.y - (e.nextHigh ? 44 : 16);
    if (e.type === 'droid' || Math.abs(e.y - p.y) < 8) addBolt(gx, gy, dir * sp, 0, dmg, 'enemy', '#ff3b30');
    else aimedBolt(gx, gy, sp, dmg);
    e.muzzle = 0.08;
  } else if (e.type === 'probe') {
    aimedBolt(e.x + dir * 16, e.y - 18, sp, dmg);
    e.muzzle = 0.08;
  } else if (e.type === 'turret') {
    e.burst = 3;
    e.burstT = 0;
    return;
  } else if (e.type === 'heavy') {
    const ox = e.x + dir * 50, oy = e.y - 53.5;
    const base = Math.atan2(p.y - 35 - oy, p.x - ox);
    for (const da of [-0.16, 0, 0.16]) addBolt(ox, oy, Math.cos(base + da) * sp, Math.sin(base + da) * sp, dmg, 'enemy', '#ff3b30');
    e.muzzle = 0.1;
  }
  Sound.play('eshoot');
}

function touchEnemy(e) {
  const p = player;
  const top = e.y - e.h;
  // wskok na głowę
  if (p.vy > 0 && p.prevY <= top + 14) {
    damageEnemy(e, CONFIG.stompDamage * (stats.unit === 'heavy' ? 2 : 1), 'stomp');
    p.vy = -stats.jumpVel * 0.72;
    p.y = top;
    p.jumpsLeft = Math.max(p.jumpsLeft, stats.jumps - 1);
    burst(p.x, top, 10, '#ffffff', 200, 0.3, 3);
    Sound.play('stomp');
    return;
  }
  if (run.power.invincible > 0) { damageEnemy(e, 999, 'ram'); return; }
  if (p.invuln > 0) return;
  const away = p.x < e.x ? -1 : 1;
  hurt(e.def.contact * dmgScale(), { kx: away * 420 });
  e.kb = -away * 380;
}

function damageEnemy(e, dmg, src) {
  if (e.dead) return;
  if (e.type === 'heavy' && src === 'weapon' && stats.unit !== 'specialist') {
    dmg *= 0.5; // tarcza energetyczna – lepiej użyć umiejętności!
    burst(e.x + e.dir * 30, e.y - 45, 4, '#6ec8ff', 150, 0.25, 2.5);
  }
  e.hp -= dmg;
  e.flash = 0.08;
  burst(e.x, e.y - e.h / 2, 5, '#ffd27a', 180, 0.3, 2.5);
  floatText(e.x + rand(-8, 8), e.y - e.h - 18, Math.round(dmg), '#fff2b0', 14);
  Sound.play('hit');
  if (e.hp <= 0) killEnemy(e, src);
}

function killEnemy(e, cause) {
  if (e.dead) return;
  e.dead = true;
  run.kills++;
  const value = e.def.credits * (1 + (run.meters / 1000) * 0.3);
  if (cause === 'fall') {
    const v = value * stats.creditMult * (run.power.double > 0 ? 2 : 1);
    run.credits += v;
    floatText(clamp(e.x, cam.x + 40, cam.x + W - 40), GY - 30, `+${Math.round(v)}`, '#ffd23f', 16);
  } else {
    explosion(e.x, e.y - e.h / 2, e.type === 'heavy' ? 1.6 : e.type === 'crate' ? 0.8 : 1, false, e.type === 'crate');
    dropCoins(e.x, e.y - e.h / 2, value);
    if (Math.random() < CONFIG.healDropChance) spawnPowerup('heal', e.x, Math.min(e.y - 40, GY - 40));
  }
  if (e.type === 'crate') return;
  run.combo = run.comboT > 0 ? run.combo + 1 : 1;
  run.comboT = 2.5;
  run.bestCombo = Math.max(run.bestCombo, run.combo);
  if (run.combo >= 3) {
    const bonus = run.combo * stats.creditMult;
    run.credits += bonus;
    floatText(clamp(e.x, cam.x + 80, cam.x + W - 80), Math.min(e.y, GY) - e.h - 30, `COMBO x${run.combo}  +${Math.round(bonus)}`, '#ffe81f', 17);
  }
}

function dropCoins(x, y, value) {
  const n = clamp(Math.round(value / 3), 1, 7);
  for (let i = 0; i < n; i++) addCoin(x, y, value / n, { vx: rand(-190, 190), vy: rand(-320, -80) });
}

// ---------------------------------------------------------------------
//  Boss – Kroczący Kolos (walka na zamkniętej arenie)
// ---------------------------------------------------------------------
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const BOSS_TINTS = ['#8d95a3', '#6d6f7d', '#9a6b5a', '#b39b5a', '#5b6070'];

function bossBox() { return { x: boss.x - 66, y: boss.y - 232, w: 132, h: 232 }; }

function checkBoss() {
  if (boss) return;
  if (!run.bossIncoming && run.meters >= run.bossNext - 80) run.bossIncoming = true;
  if (run.bossIncoming && run.meters >= run.bossNext) spawnBoss();
}

function spawnBoss() {
  const idx = run.bossesBeaten;
  const hp = CONFIG.boss.hp * (1 + idx * CONFIG.boss.hpGrowth);
  cam.lock = cam.x;
  boss = {
    x: cam.x + W + 180, y: GY, jumpY: 0, vy: 0, hp, maxHp: hp, idx, dir: -1,
    phase: 'enter', t: 0, attackT: 1.5, attack: null, lastAttack: null, step: 0, stepT: 0,
    flash: 0, muzzle: 0, dashHit: -1, targetX: cam.x + 740, legPhase: 0, walking: true, wave2: 0, deathT: 0, stun: 0,
    name: `Kroczący Kolos ${ROMAN[idx] || idx + 1}`, tint: BOSS_TINTS[idx % BOSS_TINTS.length],
  };
  setBanner('UWAGA!', `Nadchodzi ${boss.name}`, '#ff5a4a');
  Sound.play('alarm');
}

function updateBoss(dt) {
  if (!boss) return;
  const b = boss, p = player;
  b.t += dt; b.flash -= dt; b.muzzle -= dt;
  if (b.phase === 'dying') {
    b.deathT -= dt;
    b.walking = false;
    if (Math.random() < 0.35) explosion(b.x + rand(-60, 60), b.y - rand(20, 220), rand(0.6, 1.2), true);
    if (b.deathT <= 0) bossDefeated();
    return;
  }
  if (b.stun > 0) { b.stun -= dt; b.walking = false; return; }

  // chodzenie do wybranego miejsca na arenie
  const sp = b.phase === 'enter' ? 230 : b.attack === 'charge' ? 340 : 170;
  if (b.attack === 'charge') b.targetX = p.x;
  const step = clamp(b.targetX - b.x, -sp * dt, sp * dt);
  b.x = clamp(b.x + step, cam.x + 100, cam.x + W + 200);
  b.walking = Math.abs(step) > 0.3;
  if (b.walking) b.legPhase += dt * 5;
  if (b.phase === 'enter' && Math.abs(b.targetX - b.x) < 6) b.phase = 'fight';
  if (Math.abs(p.x - b.x) > 30 && b.jumpY <= 0) b.dir = p.x < b.x ? -1 : 1;

  if (b.jumpY > 0 || b.vy !== 0) {
    b.vy += CONFIG.gravity * 0.9 * dt;
    b.jumpY -= b.vy * dt;
    if (b.jumpY <= 0) { b.jumpY = 0; b.vy = 0; bossLand(); }
  }
  b.y = GY - b.jumpY;
  if (b.wave2 > 0) {
    b.wave2 -= dt;
    if (b.wave2 <= 0) addWave(b.x + b.dir * 70, 16 * dmgScale(), b.dir);
  }
  if (b.phase !== 'fight' || p.dead) return;

  if (!b.attack) {
    b.attackT -= dt;
    if (b.attackT <= 0) startBossAttack(b);
  } else runBossAttack(b, dt);

  if (overlap(playerBox(), bossBox())) hurt(28 * dmgScale(), { kx: (p.x < b.x ? -1 : 1) * 560 });
}

function startBossAttack(b) {
  const opts = [['volley', 3], ['missiles', 2.5], ['stomp', 2], ['charge', 1.5]];
  if (b.idx >= 1) opts.push(['summon', 1.2]);
  let a = pickWeighted(opts);
  if (a === b.lastAttack && Math.random() < 0.6) a = pickWeighted(opts);
  b.attack = a;
  b.lastAttack = a;
  b.step = 0;
  b.stepT = 0.5;
  if (a === 'charge') {
    b.stepT = 2.2;
    floatText(b.x, b.y - 260, 'Szarża! Uciekaj albo skacz!', '#ffb8a8', 16);
  }
  if (a === 'stomp') b.stepT = 0.4;
}

function endBossAttack(b) {
  b.attack = null;
  b.attackT = Math.max(0.8, rand(1.3, 2.0) - b.idx * 0.15);
  // odejdź na drugą stronę areny niż gracz
  const left = cam.x, playerRight = player.x > left + W / 2;
  b.targetX = playerRight ? left + rand(150, 330) : left + rand(630, 820);
}

function runBossAttack(b, dt) {
  b.stepT -= dt;
  const s = dmgScale();
  switch (b.attack) {
    case 'volley': {
      const n = 4 + Math.min(4, b.idx);
      if (b.stepT <= 0) {
        if (b.step >= n) { endBossAttack(b); break; }
        aimedBolt(b.x + b.dir * 104, b.y - 168 + (b.step % 2) * 10, 400 + b.idx * 30, 12 * s);
        b.step++;
        b.stepT = 0.3;
        b.muzzle = 0.08;
        Sound.play('eshoot');
      }
      break;
    }
    case 'missiles': {
      const n = 3 + Math.min(3, b.idx);
      if (b.stepT <= 0) {
        if (b.step >= n) { endBossAttack(b); break; }
        launchMissile(b, 18 * s);
        b.step++;
        b.stepT = 0.42;
      }
      break;
    }
    case 'stomp':
      if (b.step === 0 && b.stepT <= 0) { b.vy = -760; b.step = 1; Sound.play('jump'); }
      if (b.step === 2 && b.stepT <= 0) endBossAttack(b);
      break;
    case 'charge':
      if (b.stepT <= 0) endBossAttack(b);
      break;
    case 'summon':
      if (b.stepT <= 0) {
        const n = b.idx >= 3 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const x = clamp(b.x + b.dir * (60 + i * 70), cam.x + 40, cam.x + W - 40);
          const pl = platformAt(x, GY);
          if (pl) {
            const e = spawnEnemy('droid', x, pl);
            e.fireT = 1 + i * 0.4;
            ringFx(x, GY - 30, '#ffd27a', 40);
          }
        }
        endBossAttack(b);
      }
      break;
  }
}

function addWave(x, dmg, dir) {
  bullets.push({ kind: 'wave', x, y: GY, px: x, py: GY, vx: dir * 480, vy: 0, h: 34, dmg, from: 'enemy', life: 3, dead: false });
}

function bossLand() {
  const b = boss;
  cam.shake = Math.max(cam.shake, 12);
  Sound.play('boom');
  dust(b.x - 30, GY, 14);
  dust(b.x + 30, GY, 14);
  if (b.attack === 'stomp') {
    addWave(b.x + b.dir * 70, 16 * dmgScale(), b.dir);
    if (b.idx >= 2) b.wave2 = 0.5;
    b.step = 2;
    b.stepT = 0.6;
  }
}

function launchMissile(b, dmg) {
  const p = player;
  const x = b.x - b.dir * 26, y = b.y - 250;
  const T = rand(1.0, 1.35);
  const tx = clamp(p.x + p.vx * T * 0.6 + rand(-50, 50), cam.x + 20, cam.x + W - 20);
  const vx = (tx - x) / T;
  const vy = (GY - y - 0.5 * 900 * T * T) / T;
  bullets.push({ kind: 'missile', x, y, px: x, py: y, vx, vy, dmg, from: 'enemy', tx, life: 4, dead: false });
  Sound.play('missile');
}

function explodeMissile(b, harmless) {
  b.dead = true;
  explosion(b.x, Math.min(b.y, GY - 6), 0.9);
  if (!harmless && !player.dead) {
    const d = Math.hypot(player.x - b.x, player.y - 30 - b.y);
    if (d < 75) hurt(b.dmg);
  }
}

function damageBoss(dmg) {
  const b = boss;
  if (!b || b.phase === 'dying') return;
  b.hp -= dmg;
  b.flash = 0.08;
  floatText(b.x + rand(-40, 40), b.y - 245, Math.round(dmg), '#ffe9a0', 16);
  Sound.play('hit');
  if (b.hp <= 0) {
    b.hp = 0;
    b.phase = 'dying';
    b.deathT = 1.6;
    b.attack = null;
    cam.shake = 16;
    Sound.play('bigboom');
    for (const x of bullets) if (x.from === 'enemy') x.dead = true;
  }
}

function bossDefeated() {
  const b = boss;
  explosion(b.x, b.y - 120, 3);
  const reward = CONFIG.boss.credits + CONFIG.boss.creditsGrowth * b.idx;
  for (let i = 0; i < 24; i++) {
    addCoin(b.x + rand(-60, 60), b.y - rand(40, 200), reward / 24, { vx: rand(-300, 300), vy: rand(-400, 0), magnet: true });
  }
  player.hp = Math.min(stats.maxHp, player.hp + stats.maxHp * 0.3);
  floatText(player.x, player.y - 95, '+30% HP', '#7dff8a', 18);
  run.bossesBeaten++;
  boss = null;
  cam.lock = null;
  run.bossIncoming = false;
  run.bossNext = run.meters + CONFIG.bossEvery;
  // lecimy na kolejną planetę
  sky.from = sky.to;
  run.biome = (run.biome + 1) % BIOMES.length;
  sky.to = run.biome;
  sky.t = 0;
  setBanner(BIOMES[run.biome].name, `Boss pokonany! Planeta ${run.bossesBeaten + 1}`, '#ffe81f');
  Sound.play('win');
}

// ---------------------------------------------------------------------
//  Pociski
// ---------------------------------------------------------------------
function updateBullets(dt) {
  const p = player;
  const pb = p.dead ? null : playerBox();
  for (const b of bullets) {
    if (b.dead) continue;
    b.px = b.x;
    b.py = b.y;
    if (b.kind === 'missile') {
      b.vy += 900 * dt;
      if (Math.random() < 0.7) particles.push({ kind: 'smoke', x: b.x, y: b.y, vx: rand(-20, 20), vy: rand(-20, 10), life: 0.5, max: 0.5, size: rand(4, 7), color: '#8a8a8a' });
    } else if (b.kind === 'grenade') {
      b.vy += 1500 * dt;
    } else if (b.kind === 'rocket') {
      const k = Math.min(1100 / (Math.hypot(b.vx, b.vy) || 1), 1 + 3 * dt);
      b.vx *= k;
      b.vy *= k;
      if (Math.random() < 0.8) particles.push({ kind: 'smoke', x: b.x, y: b.y, vx: rand(-20, 20), vy: rand(-20, 10), life: 0.45, max: 0.45, size: rand(4, 7), color: '#9a9a9a' });
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.kind === 'grenade' || b.kind === 'rocket') {
      if (b.life <= 0) { b.dead = true; explodeArea(b.x, b.y, b.radius, b.dmg); continue; }
      // granat odbija się od ziemi, rakieta wybucha
      let hitGround = false;
      for (const pl of platforms) {
        if (b.x >= pl.x && b.x <= pl.x + pl.w && b.py <= pl.y && b.y >= pl.y) {
          if (b.kind === 'grenade') { b.y = pl.y; b.vy *= -0.35; b.vx *= 0.6; }
          else hitGround = true;
          break;
        }
      }
      if (hitGround) { b.dead = true; explodeArea(b.x, b.y, b.radius, b.dmg); continue; }
    }
    if (b.life <= 0 || b.x < cam.x - 80 || b.x > cam.x + W + 120 || b.y > H + 40 || b.y < -150) { b.dead = true; continue; }
    if (b.kind === 'missile' && b.y >= GY - 4) { explodeMissile(b, false); continue; }

    // bariera zatrzymuje wrogie pociski
    if (b.from === 'enemy') {
      let blocked = false;
      for (const bar of barriers) {
        if ((b.px - bar.x) * (b.x - bar.x) <= 0 && b.y > bar.y - bar.h - 6 && b.y < bar.y + 4) { blocked = true; break; }
      }
      if (blocked) {
        if (b.kind === 'missile') explodeMissile(b, true);
        else { b.dead = true; burst(b.x, b.kind === 'wave' ? GY - 15 : b.y, 8, '#9fd8ff', 200, 0.3, 2.5); Sound.play('block'); }
        continue;
      }
    }

    if (b.kind === 'wave') {
      if (Math.random() < 0.5) dust(b.x, GY, 1);
      if (pb && overlap(pb, { x: b.x - 18, y: GY - b.h, w: 36, h: b.h })) hurt(b.dmg);
      continue;
    }
    const sb = { x: Math.min(b.px, b.x) - 2, y: Math.min(b.py, b.y) - 3, w: Math.abs(b.x - b.px) + 4, h: Math.abs(b.y - b.py) + 6 };
    if (b.from === 'player') {
      for (const e of enemies) {
        if (e.dead || e.falling || (b.hits && b.hits.includes(e))) continue;
        if (!overlap(sb, enemyBox(e))) continue;
        if (b.kind === 'grenade' || b.kind === 'rocket') { b.dead = true; explodeArea(b.x, b.y, b.radius, b.dmg); break; }
        damageEnemy(e, b.dmg * (b.ion && e.def.machine ? stats.U.weapon.machineBonus : 1), b.src);
        e.kb += Math.sign(b.vx || 1) * 60;
        if (b.pierce) {
          b.hits.push(e);
          b.pierce--;
          if (b.pierce <= 0) { b.dead = true; break; }
        } else { b.dead = true; break; }
      }
      if (!b.dead && boss && boss.phase !== 'dying' && overlap(sb, bossBox())) {
        b.dead = true;
        if (b.kind === 'grenade' || b.kind === 'rocket') explodeArea(b.x, b.y, b.radius, b.dmg);
        else {
          damageBoss(b.dmg * (b.ion ? stats.U.weapon.machineBonus : 1));
          burst(b.x, b.y, 5, '#ffd27a', 160, 0.25, 2.5);
        }
      }
      if (!b.dead && b.kind === 'bolt') {
        for (const m of bullets) {
          if (m.kind === 'missile' && !m.dead && Math.abs(m.x - b.x) < 22 && Math.abs(m.y - b.y) < 22) {
            explodeMissile(m, true);
            b.dead = true;
            break;
          }
        }
      }
    } else if (pb && overlap(sb, pb)) {
      if (run.power.invincible > 0) {
        b.dead = true;
        burst(b.x, b.y, 6, '#7fd4ff', 150, 0.25, 2);
      } else if (b.kind === 'missile') {
        explodeMissile(b, false);
      } else if (p.invuln <= 0) {
        hurt(b.dmg);
        b.dead = true;
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);
}

// ---------------------------------------------------------------------
//  Kredyty i bonusy
// ---------------------------------------------------------------------
function updateCoins(dt) {
  const p = player;
  const cx = p.x, cy = p.y - 32;
  const radius = run.power.magnet > 0 ? 420 : stats.magnet;
  for (const c of coins) {
    c.t += dt;
    if (c.vx || c.vy) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const f = Math.pow(0.02, dt);
      c.vx *= f;
      c.vy *= f;
      if (c.y > GY - 12) { c.y = GY - 12; c.vy = 0; }
    }
    if (p.dead) continue;
    const dx = cx - c.x, dy = cy - c.y, d = Math.hypot(dx, dy);
    if (c.magnet || d < radius) {
      c.magnet = true;
      c.mag = Math.min(c.mag + 2400 * dt, 1600);
      const sp = (stats.speed + c.mag) * dt;
      if (d <= sp + 24) { collectCoin(c); continue; }
      c.x += (dx / d) * sp;
      c.y += (dy / d) * sp;
    } else if (d < 26) collectCoin(c);
  }
  coins = coins.filter(c => !c.dead);
}

function collectCoin(c) {
  c.dead = true;
  run.credits += c.value * stats.creditMult * (run.power.double > 0 ? 2 : 1);
  burst(c.x, c.y, 4, '#ffd84a', 120, 0.25, 2);
  Sound.play('coin');
}

function spawnPowerup(type, x, y) {
  powerups.push({ type, x, y, t: rand(0, 6), dead: false });
}

function updatePowerups(dt) {
  if (player.dead) return;
  const pb = playerBox();
  for (const u of powerups) {
    u.t += dt;
    const y = u.y + Math.sin(u.t * 3) * 5;
    if (overlap(pb, { x: u.x - 18, y: y - 18, w: 36, h: 36 })) collectPowerup(u);
  }
  powerups = powerups.filter(u => !u.dead);
}

function collectPowerup(u) {
  u.dead = true;
  const d = POWERUPS[u.type];
  if (u.type === 'heal') {
    const v = Math.round(stats.maxHp * 0.35);
    player.hp = Math.min(stats.maxHp, player.hp + v);
    floatText(player.x, player.y - 95, `+${v} HP`, '#7dff8a', 20);
  } else {
    run.power[u.type] = Math.max(run.power[u.type], d.duration);
    floatText(player.x, player.y - 95, d.name + '!', d.color, 20);
  }
  burst(u.x, u.y, 20, d.color, 260, 0.5, 3);
  Sound.play('power');
}

// ---------------------------------------------------------------------
//  Efekty: iskry, dym, wybuchy, napisy
// ---------------------------------------------------------------------
function burst(x, y, n, color, speed = 200, life = 0.5, size = 3, grav = 300) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 700) return;
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.4), max: life, size, color, g: grav });
  }
}
function ringFx(x, y, color, r = 40) {
  particles.push({ kind: 'ring', x, y, r0: 4, r1: r, life: 0.35, max: 0.35, color });
}
function dust(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({ kind: 'smoke', x: x + rand(-10, 10), y: y - 4, vx: rand(-60, 60), vy: rand(-60, -10), life: 0.5, max: 0.5, size: rand(3, 7), color: '#ffffff' });
  }
}
function explosion(x, y, s = 1, quiet = false, wood = false) {
  burst(x, y, Math.round(18 * s), wood ? '#a0703a' : '#ffb340', 320 * s, 0.6, 3.5, 500);
  burst(x, y, Math.round(10 * s), wood ? '#6b4520' : '#fff1a8', 200 * s, 0.35, 2.5, 200);
  for (let i = 0; i < 6 * s; i++) {
    particles.push({ kind: 'smoke', x: x + rand(-12, 12) * s, y: y + rand(-12, 12) * s, vx: rand(-40, 40), vy: rand(-80, -20), life: rand(0.5, 0.9), max: 0.9, size: rand(10, 18) * s, color: wood ? '#5a4030' : '#555555' });
  }
  if (!wood) particles.push({ kind: 'flash', x, y, r: 36 * s, life: 0.12, max: 0.12, color: '#fff3c0' });
  cam.shake = Math.max(cam.shake, 4 * s);
  if (!quiet) Sound.play(s > 1.5 ? 'bigboom' : 'boom');
}
function updateParticles(dt) {
  const damp = Math.pow(0.15, dt);
  for (const q of particles) {
    q.life -= dt;
    if (q.kind === 'spark') {
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt;
    } else if (q.kind === 'smoke' || q.kind === 'streak') {
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= damp; q.vy *= damp;
    }
  }
  particles = particles.filter(q => q.life > 0);
}
function floatText(x, y, text, color = '#ffffff', size = 16) {
  texts.push({ x, y, text: String(text), color, size, life: 0.9, max: 0.9 });
  if (texts.length > 60) texts.shift();
}
function updateTexts(dt) {
  for (const t of texts) { t.life -= dt; t.y -= 45 * dt; }
  texts = texts.filter(t => t.life > 0);
}

// ---------------------------------------------------------------------
//  Aktualizacja całej gry (wywoływana co klatkę)
// ---------------------------------------------------------------------
function updateCamera(dt) {
  if (cam.lock !== null) { cam.x = cam.lock; return; }
  const target = player.x - 380;
  if (target > cam.x) cam.x += (target - cam.x) * Math.min(1, dt * 8);
}

function updateTimers(dt) {
  for (const k in run.power) if (run.power[k] > 0) run.power[k] = Math.max(0, run.power[k] - dt);
  if (run.comboT > 0) { run.comboT -= dt; if (run.comboT <= 0) run.combo = 0; }
  if (run.banner) { run.banner.t -= dt; if (run.banner.t <= 0) run.banner = null; }
  if (sky.t < 1) sky.t = Math.min(1, sky.t + dt / 3);
  cam.shake = Math.max(0, cam.shake - dt * 40);
}

function cleanup() {
  const left = cam.x - 250;
  platforms = platforms.filter(pl => pl.x + pl.w > left);
  enemies = enemies.filter(e => !e.dead && (e.x > left || e.falling));
  coins = coins.filter(c => c.x > left);
  powerups = powerups.filter(u => u.x > left);
  allies = allies.filter(a => a.x > left);
  barriers = barriers.filter(b => b.x > left);
  if (run.hints.length) run.hints = run.hints.filter(h => h.x > left);
}

function updateAttract(dt) {
  attract.x += dt * 240;
  attract.anim += (dt * 240) / 38;
  attract.timer += dt;
  if (attract.timer > 7) {
    attract.timer = 0;
    sky.from = sky.to;
    sky.to = (sky.to + 1) % BIOMES.length;
    sky.t = 0;
  }
  if (sky.t < 1) sky.t = Math.min(1, sky.t + dt / 2);
}

function update(dt, real) {
  time += real;
  if (state === 'menu' || state === 'shop' || state === 'select') { updateAttract(real); return; }
  if (state !== 'playing' && state !== 'dying') return;
  if (state === 'playing') updatePlayer(dt);
  if (state === 'playing') checkBoss();
  updateCamera(dt);
  while (gen.x < cam.x + W + 700) genChunk();
  updateEnemies(dt);
  updateBoss(dt);
  updateAllies(dt);
  updateBullets(dt);
  updateCoins(dt);
  updatePowerups(dt);
  updateParticles(dt);
  updateTexts(dt);
  updateTimers(dt);
  cleanup();
  if (state === 'dying') {
    run.dyingT -= real;
    if (run.dyingT <= 0) finishRun(false);
  }
}

// ---------------------------------------------------------------------
//  Koniec misji
// ---------------------------------------------------------------------
function finishRun(abandoned) {
  const m = Math.floor(run.meters);
  const bonus = Math.floor(m / 10) * CONFIG.creditsPer10m;
  const collected = Math.floor(run.credits);
  const total = collected + bonus;
  const record = m > save.best;
  save.credits += total;
  save.runs++;
  save.kills += run.kills;
  save.bosses += run.bossesBeaten;
  if (record) save.best = m;
  writeSave();

  $('go-title').textContent = abandoned ? 'Misja zakończona' : pick(['Koniec misji!', 'Żołnierz poległ...', 'Oddział musi się przegrupować!', 'Spróbuj jeszcze raz!']);
  $('go-unit').textContent = `${stats.U.name} (${stats.U.role.toLowerCase()})`;
  $('go-distance').textContent = fmt(m) + ' m';
  $('go-kills').textContent = fmt(run.kills);
  $('go-bosses').textContent = fmt(run.bossesBeaten);
  $('go-combo').textContent = 'x' + run.bestCombo;
  $('go-collected').textContent = fmt(collected);
  $('go-bonus').textContent = fmt(bonus);
  $('go-total').textContent = fmt(total);
  $('go-wallet').textContent = fmt(save.credits);
  $('go-record').classList.toggle('hidden', !record);
  state = 'gameover';
  releaseAll();
  showOverlay('gameover');
}

// ---------------------------------------------------------------------
//  Menu, wybór jednostki, sklep, pauza
// ---------------------------------------------------------------------
const OVERLAYS = ['menu', 'select', 'shop', 'gameover', 'pause'];
let shopTab = 'upgrades';

function showOverlay(id) {
  for (const o of OVERLAYS) $(o).classList.toggle('hidden', o !== id);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function showMenu() {
  state = 'menu';
  $('menu-best').textContent = fmt(save.best) + ' m';
  $('menu-credits').textContent = fmt(save.credits);
  $('menu-unit').textContent = UNITS[save.unit].name;
  const note = $('menu-refund');
  if (save.refund > 0) {
    note.textContent = `🎁 Rycerz Jedi odszedł na emeryturę – zwrócono ci ${fmt(save.refund)} kredytów za jego ulepszenia!`;
    note.classList.remove('hidden');
    save.refund = 0;
    writeSave();
  } else note.classList.add('hidden');
  updateMuteButtons();
  showOverlay('menu');
}
function showSelect() {
  Sound.init();
  Sound.play('click');
  state = 'select';
  renderSelect();
  showOverlay('select');
}
function selectUnit(id) {
  if (!UNITS[id]) return;
  if (save.unit !== id) Sound.play('click');
  save.unit = id;
  stats = computeStats();
  writeSave();
  renderSelect();
}
function showShop() {
  state = 'shop';
  renderShop();
  showOverlay('shop');
}
function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    releaseAll();
    updateMuteButtons();
    showOverlay('pause');
  } else if (state === 'paused') {
    state = 'playing';
    showOverlay(null);
  }
}
function toggleMute() {
  save.muted = !save.muted;
  writeSave();
  updateMuteButtons();
  Sound.play('click');
}
function updateMuteButtons() {
  const t = save.muted ? '🔇 Dźwięk: wył.' : '🔊 Dźwięk: wł.';
  $('btn-mute').textContent = t;
  $('btn-pause-mute').textContent = t;
}

function renderSelect() {
  const bar = (label, v) => `<div class="ubar"><span>${label}</span><div class="ubar-track">${'<i class="on"></i>'.repeat(v)}${'<i></i>'.repeat(5 - v)}</div></div>`;
  let html = '';
  UNIT_ORDER.forEach((id, i) => {
    const U = UNITS[id];
    html += `<div class="unit${save.unit === id ? ' selected' : ''}" data-unit="${id}">
      <div class="unit-key">${i + 1}</div>
      <canvas class="unit-cv" width="220" height="240" data-unit="${id}"></canvas>
      <div class="unit-role">${U.role} jednostka</div>
      <div class="unit-name">${U.name}</div>
      ${bar('Życie', U.bars.hp)}${bar('Szybkość', U.bars.speed)}${bar('Siła ognia', U.bars.power)}${bar('Pancerz', U.bars.armor)}
      <div class="unit-line">🔫 <b>${U.weapon.name}</b></div>
      <div class="unit-line"><kbd>K</kbd> <b>${U.skill.name}</b> – ${U.skill.desc}</div>
      <div class="unit-line"><kbd>1</kbd> <b>${U.powers[0].name}</b> – ${U.powers[0].desc}</div>
      <div class="unit-pass">⭐ ${U.desc}</div>
    </div>`;
  });
  $('unit-grid').innerHTML = html;
}

function renderShop() {
  $('shop-credits').textContent = fmt(save.credits);
  $('shop-unit').textContent = UNITS[save.unit].name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === shopTab));
  let html = '';
  if (shopTab === 'upgrades') {
    for (const u of UPGRADES) {
      const l = lvl(u.id), maxed = l >= u.max, cost = upgradeCost(u, l);
      const cur = u.fmt(statsWith(u.id, l)[u.stat]);
      const next = maxed ? '' : u.fmt(statsWith(u.id, l + 1)[u.stat]);
      let pips = '';
      for (let i = 0; i < u.max; i++) pips += `<i class="${i < l ? 'on' : ''}"></i>`;
      html += `<div class="card${maxed ? ' maxed' : ''}">
        <div class="card-icon">${u.icon}</div>
        <div class="card-body">
          <div class="card-name">${u.name}</div>
          <div class="pips">${pips}</div>
          <div class="card-desc">${u.desc}</div>
          <div class="card-eff">${cur}${maxed ? ' <span class="max">MAKS.</span>' : ` → <b>${next}</b>`}</div>
        </div>
        <button class="buy" data-buy="${u.id}"${maxed || save.credits < cost ? ' disabled' : ''}>${maxed ? '✓' : `<span class="coin"></span>${fmt(cost)}`}</button>
      </div>`;
    }
  } else {
    for (const s of PAINTS) {
      const owned = save.ownedPaints.includes(s.id), selected = save.paint === s.id;
      const label = selected ? '✓ Wybrane' : owned ? 'Wybierz' : `<span class="coin"></span>${fmt(s.cost)}`;
      html += `<div class="card paint${selected ? ' selected' : ''}">
        <div class="swatch" style="--c:${s.color}"></div>
        <div class="card-body">
          <div class="card-name">${s.name}</div>
          <div class="card-desc">${s.desc}</div>
        </div>
        <button class="buy" data-paint="${s.id}"${selected || (!owned && save.credits < s.cost) ? ' disabled' : ''}>${label}</button>
      </div>`;
    }
  }
  $('shop-grid').innerHTML = html;
}

function buyUpgrade(id) {
  const u = UPG[id], l = lvl(id);
  if (l >= u.max) return;
  const cost = upgradeCost(u, l);
  if (save.credits < cost) { Sound.play('nope'); return; }
  save.credits -= cost;
  save.upgrades[id] = l + 1;
  writeSave();
  Sound.play('buy');
  renderShop();
}

function choosePaint(id) {
  const s = PAINTS.find(x => x.id === id);
  if (!s) return;
  if (!save.ownedPaints.includes(id)) {
    if (save.credits < s.cost) { Sound.play('nope'); return; }
    save.credits -= s.cost;
    save.ownedPaints.push(id);
    Sound.play('buy');
  } else Sound.play('click');
  save.paint = id;
  writeSave();
  renderShop();
}

$('btn-play').onclick = () => showSelect();
$('btn-shop').onclick = () => { Sound.init(); Sound.play('click'); showShop(); };
$('btn-mute').onclick = () => { Sound.init(); toggleMute(); };
$('btn-sel-back').onclick = () => { Sound.play('click'); showMenu(); };
$('btn-sel-shop').onclick = () => { Sound.play('click'); showShop(); };
$('btn-sel-play').onclick = () => startRun();
$('unit-grid').addEventListener('click', e => {
  const card = e.target.closest('.unit');
  if (card) selectUnit(card.dataset.unit);
});
$('unit-grid').addEventListener('dblclick', e => {
  const card = e.target.closest('.unit');
  if (card) { selectUnit(card.dataset.unit); startRun(); }
});
$('btn-shop-back').onclick = () => { Sound.play('click'); showMenu(); };
$('btn-shop-units').onclick = () => showSelect();
$('btn-shop-play').onclick = () => startRun();
$('btn-reset').onclick = () => {
  if (confirm('Na pewno usunąć cały postęp? (kredyty, ulepszenia, barwy i rekord)')) {
    const muted = save.muted, unit = save.unit;
    save = defaultSave();
    save.muted = muted;
    save.unit = unit;
    writeSave();
    renderShop();
  }
};
$('btn-go-menu').onclick = () => { Sound.play('click'); showMenu(); };
$('btn-go-shop').onclick = () => { Sound.play('click'); showShop(); };
$('btn-go-units').onclick = () => showSelect();
$('btn-go-again').onclick = () => startRun();
$('btn-resume').onclick = () => togglePause();
$('btn-pause-mute').onclick = () => toggleMute();
$('btn-quit').onclick = () => finishRun(true);
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => { shopTab = t.dataset.tab; Sound.play('click'); renderShop(); };
});
$('shop-grid').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.buy) buyUpgrade(b.dataset.buy);
  else if (b.dataset.paint) choosePaint(b.dataset.paint);
});
document.addEventListener('pointerdown', () => Sound.init(), true);

// ---------------------------------------------------------------------
//  Rozmiar ekranu i główna pętla
// ---------------------------------------------------------------------
function resize() {
  viewScale = Math.min(window.innerWidth / W, window.innerHeight / H);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * viewScale * dpr);
  canvas.height = Math.round(H * viewScale * dpr);
  const wrap = $('wrap');
  wrap.style.width = W * viewScale + 'px';
  wrap.style.height = H * viewScale + 'px';
  wrap.style.setProperty('--s', viewScale);
}
window.addEventListener('resize', resize);

let lastNow = performance.now();
function frame(now) {
  const real = Math.min(0.033, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  try {
    update(state === 'dying' ? real * 0.35 : real, real);
    render();
    if (state === 'select') document.querySelectorAll('.unit-cv').forEach(cv => drawUnitPreview(cv, cv.dataset.unit, time));
  } catch (err) {
    console.error(err);
  }
  input.pressed = {};
  input.released = {};
  requestAnimationFrame(frame);
}

resize();
showMenu();
requestAnimationFrame(frame);
