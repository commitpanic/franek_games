'use strict';
// =====================================================================
//  GWIEZDNY ODDZIAŁ – GRAFIKA
//  Wszystko jest rysowane kodem (bez obrazków), więc łatwo to zmieniać.
// =====================================================================

const FONT = '"Exo 2", "Segoe UI", sans-serif';
const FONT_TITLE = '"Russo One", "Segoe UI", sans-serif';

const STARS = Array.from({ length: 160 }, (_, i) => ({
  x: hash(i) * W, y: hash(i + 500) * H * 0.8, r: 0.6 + hash(i + 900) * 1.5, tw: hash(i + 1300) * 6.28,
}));
const AMBIENT = Array.from({ length: 70 }, (_, i) => ({
  x: hash(i + 2000) * W, y: hash(i + 3000) * H, v: hash(i + 4000), ph: hash(i + 5000) * 6.28,
}));

// wygląd jednostek: kolory munduru i pancerza, skala, wylot lufy
const UNIT_LOOK = {
  light:      { scale: 0.95, suit: '#1c1e23', armor: '#eef1f4', dark: '#121317', legW: 6,   muzzle: [26.5, -1.95], trigger: [11.5, 2.5], grip: null,      plates: true },
  medium:     { scale: 1.0,  suit: '#1c1e23', armor: '#eef1f4', dark: '#121317', legW: 6.5, muzzle: [48, -0.8],   trigger: [8, 4],     grip: [29.5, 4], plates: true },
  heavy:      { scale: 1.1,  suit: '#1c1e23', armor: '#e2e6eb', dark: '#121317', legW: 8.5, muzzle: [52, 0],      trigger: [10, 5],    grip: [21, 8.5], plates: true },
  specialist: { scale: 1.0,  suit: '#1c1e23', armor: '#e9eef4', dark: '#121317', legW: 6.5, muzzle: [50, -0.7],   trigger: [9, 4],     grip: [25, 4],   plates: true },
};
const SEAM = 'rgba(0,0,0,0.18)'; // linie łączenia płyt pancerza
const GUNMETAL = '#4b525d', POLYMER = '#2a2d33', DARKMETAL = '#33373f';

// ---------------------------------------------------------------------
//  Proste kształty
// ---------------------------------------------------------------------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, r));
  else ctx.rect(x, y, w, h);
}
function fillCircle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fill();
}
function fillEllipse(x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, Math.PI * 2);
  ctx.fill();
}
function seg(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function outlined(text, x, y, fill, lw = 4, stroke = 'rgba(0,0,0,0.65)') {
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
function drawBar(x, y, w, h, frac, color, back) {
  frac = clamp(frac, 0, 1);
  ctx.fillStyle = back;
  roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    roundRect(x, y, Math.max(h, w * frac), h, h / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(x + h * 0.3, y + 2, Math.max(0, w * frac - h * 0.6), h * 0.3, h * 0.15);
    ctx.fill();
  }
}
function drawCoin(x, y, t, r = 7) {
  const sx = Math.max(0.25, Math.abs(Math.cos(t * 3)));
  ctx.fillStyle = '#9c6a12';
  fillEllipse(x, y, r * sx + 1.2, r + 1.2);
  ctx.fillStyle = '#ffd23f';
  fillEllipse(x, y, r * sx, r);
  ctx.fillStyle = '#fff3b0';
  fillEllipse(x - r * 0.25 * sx, y - r * 0.3, r * 0.35 * sx, r * 0.3);
}

// ---------------------------------------------------------------------
//  Tło: niebo, planety, góry, drzewa, pogoda
// ---------------------------------------------------------------------
function palette() {
  const A = BIOMES[sky.from], B = BIOMES[sky.to], t = sky.t;
  const m = (k, i) => (i === undefined ? mix(A[k], B[k], t) : mix(A[k][i], B[k][i], t));
  return {
    A, B, t,
    sky0: m('sky', 0), sky1: m('sky', 1), far: m('far'), near: m('near'),
    ground: m('ground'), top: m('top'),
    pit0: mix(A.pit, B.pit, t, 0), pit1: mix(A.pit, B.pit, t, 0.95),
  };
}

function drawBackground(camX, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, GY);
  g.addColorStop(0, pal.sky0);
  g.addColorStop(1, pal.sky1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  drawSkyDeco(pal.A, 1 - pal.t, camX);
  if (pal.t > 0) drawSkyDeco(pal.B, pal.t, camX);

  const kind = pal.t < 0.5 ? pal.A.ridge : pal.B.ridge;
  drawRidge(camX * 0.1, 300, 120, pal.far, 1.3, kind);
  const treesA = (pal.A.trees ? 1 - pal.t : 0) + (pal.B.trees ? pal.t : 0);
  if (treesA > 0.01) drawTrees(camX * 0.3, pal.near, treesA);
  drawRidge(camX * 0.3, 392, 70, pal.near, 4.7, kind);

  const pg = ctx.createLinearGradient(0, GY + 10, 0, H);
  pg.addColorStop(0, pal.pit0);
  pg.addColorStop(1, pal.pit1);
  ctx.fillStyle = pg;
  ctx.fillRect(0, GY + 10, W, H - GY - 10);
}

function drawSkyDeco(b, a, camX) {
  if (a <= 0.01) return;
  ctx.save();
  for (const d of b.deco) {
    ctx.globalAlpha = a;
    if (d === 'stars') {
      ctx.fillStyle = '#ffffff';
      for (const s of STARS) {
        ctx.globalAlpha = a * (0.45 + 0.55 * Math.abs(Math.sin(time * 1.3 + s.tw)));
        ctx.fillRect(mod(s.x - camX * 0.02, W), s.y, s.r, s.r);
      }
    } else if (d === 'suns') {
      drawSun(690, 110, 42, '#fff6d0');
      drawSun(800, 165, 26, '#ffd9a0');
    } else if (d === 'planet') drawPlanet(770, 125, 90, '#e8c9a0', '#8a5a3a', true);
    else if (d === 'moon') drawPlanet(180, 95, 34, '#f4f6ff', '#9aa6c0', false);
    else if (d === 'redplanet') drawPlanet(800, 110, 60, '#ff9a5a', '#5a1a0a', true);
    else if (d === 'blueplanet') drawPlanet(220, 150, 110, '#6fb0ff', '#0a1a4a', true);
  }
  ctx.restore();
}
function drawSun(x, y, r, c) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  g.addColorStop(0, rgba(c, 1));
  g.addColorStop(0.3, rgba(c, 1));
  g.addColorStop(0.36, rgba(c, 0.35));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  fillCircle(x, y, r * 3);
}
function drawPlanet(x, y, r, c1, c2, bands) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (bands) {
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(90,50,30,0.25)' : 'rgba(255,240,210,0.16)';
      ctx.fillRect(x - r, y - r + i * r * 0.3 + 6, r * 2, r * 0.13);
    }
  }
  const sh = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.2, x, y, r * 1.1);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = sh;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

function drawRidge(off, base, amp, color, seed, kind) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  const step = kind === 'blocky' ? 4 : 12;
  for (let sx = 0; sx <= W + step; sx += step) {
    const x = sx + off;
    let n;
    if (kind === 'blocky') {
      const cell = Math.floor(x / 60);
      n = 0.25 + hash(cell + seed * 100) * 0.6;
      if (hash(cell * 3 + seed) > 0.8) n += 0.35;
    } else {
      n = (Math.sin(x * 0.0043 + seed) + 1) * 0.3 + (Math.sin(x * 0.0117 + seed * 2.3) + 1) * 0.15 + (Math.sin(x * 0.0021 + seed * 4.1) + 1) * 0.2;
      if (kind === 'jagged') n += Math.abs(mod(x * 0.013 + seed, 2) - 1) * 0.35 - 0.15;
    }
    ctx.lineTo(sx, base - n * amp);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function drawTrees(off, color, a) {
  ctx.save();
  ctx.globalAlpha = a * 0.85;
  ctx.fillStyle = color;
  const sp = 110;
  const i0 = Math.floor(off / sp) - 1;
  for (let i = i0; i < i0 + W / sp + 3; i++) {
    const x = i * sp - off + hash(i) * 50;
    const h = 150 + hash(i + 77) * 120;
    const base = 420;
    ctx.fillRect(x - 6, base - h, 12, h);
    for (let k = 0; k < 3; k++) fillCircle(x + (k - 1) * 18, base - h + 10 + (k % 2) * 12, 26 - k * 2);
  }
  ctx.restore();
}

function drawAmbient(pal, camX) {
  drawAmbientKind(pal.A.ambient, 1 - pal.t, camX);
  if (pal.t > 0) drawAmbientKind(pal.B.ambient, pal.t, camX);
}
function drawAmbientKind(kind, a, camX) {
  if (a <= 0.01 || kind === 'none') return;
  ctx.save();
  for (const p of AMBIENT) {
    let x, y;
    switch (kind) {
      case 'snow':
        x = mod(p.x - time * 25 - camX * 0.5, W);
        y = mod(p.y + time * (35 + p.v * 45), H);
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = '#ffffff';
        fillCircle(x, y, 1.5 + p.v * 2.5);
        break;
      case 'embers':
        x = mod(p.x - camX * 0.45 + Math.sin(time + p.ph) * 12, W);
        y = mod(p.y - time * (25 + p.v * 50), H);
        ctx.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(time * 3 + p.ph)));
        ctx.fillStyle = p.v > 0.5 ? '#ffb347' : '#ff5a1f';
        ctx.fillRect(x, y, 2 + p.v * 2, 2 + p.v * 2);
        break;
      case 'dust':
        x = mod(p.x - time * (160 + p.v * 220) - camX * 0.6, W);
        y = mod(p.y, GY);
        ctx.globalAlpha = a * 0.35;
        ctx.strokeStyle = '#fff2d0';
        ctx.lineWidth = 1.2;
        seg(x, y, x + 10 + p.v * 14, y);
        break;
      case 'fireflies':
        x = mod(p.x - camX * 0.35 + Math.sin(time * 0.7 + p.ph) * 30, W);
        y = 220 + mod(p.y, 200) + Math.cos(time * 0.9 + p.ph) * 18;
        ctx.globalAlpha = a * Math.max(0, Math.sin(time * 2 + p.ph * 3));
        ctx.fillStyle = '#d8ff7a';
        fillCircle(x, y, 1.8);
        break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Świat: platformy, tabliczki, kredyty, bonusy
// ---------------------------------------------------------------------
function drawPlatforms(pal) {
  for (const pl of platforms) {
    if (pl.x > cam.x + W + 40 || pl.x + pl.w < cam.x - 40) continue;
    if (pl.solid) {
      ctx.fillStyle = pal.ground;
      ctx.fillRect(pl.x, pl.y, pl.w, H - pl.y + 30);
      const g = ctx.createLinearGradient(0, pl.y, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(pl.x, pl.y, pl.w, H - pl.y + 30);
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      const n = Math.floor(pl.w / 40);
      for (let i = 0; i < n; i++) {
        ctx.fillRect(pl.x + hash(pl.seed + i) * (pl.w - 24), pl.y + 18 + hash(pl.seed + i * 7 + 3) * 70, 8 + hash(pl.seed + i * 3 + 1) * 16, 4);
      }
      ctx.fillStyle = pal.top;
      ctx.fillRect(pl.x, pl.y, pl.w, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(pl.x, pl.y, pl.w, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(pl.x, pl.y + 8, pl.w, 3);
      ctx.fillRect(pl.x, pl.y, 4, H);
      ctx.fillRect(pl.x + pl.w - 4, pl.y, 4, H);
    } else {
      // platforma antygrawitacyjna
      ctx.fillStyle = `rgba(120,200,255,${0.25 + 0.1 * Math.sin(time * 4 + pl.seed)})`;
      fillEllipse(pl.x + pl.w / 2, pl.y + 24, pl.w * 0.42, 9);
      ctx.fillStyle = pal.ground;
      roundRect(pl.x, pl.y, pl.w, 16, 6); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(pl.x, pl.y + 9, pl.w, 7, 4); ctx.fill();
      ctx.fillStyle = pal.top;
      roundRect(pl.x, pl.y, pl.w, 6, 3); ctx.fill();
      ctx.fillStyle = '#8fe0ff';
      ctx.fillRect(pl.x + 10, pl.y + 15, 12, 3);
      ctx.fillRect(pl.x + pl.w - 22, pl.y + 15, 12, 3);
    }
  }
}

function drawHints() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 15px ${FONT}`;
  for (const h of run.hints) {
    if (h.x < cam.x - 300 || h.x > cam.x + W + 300) continue;
    ctx.fillStyle = 'rgba(160,170,190,0.7)';
    ctx.fillRect(h.x - 2, GY - 128, 4, 128);
    const tw = ctx.measureText(h.text).width + 26;
    ctx.fillStyle = 'rgba(30,120,255,0.28)';
    roundRect(h.x - tw / 2, GY - 168, tw, 36, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(130,210,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    outlined(h.text, h.x, GY - 149, '#e6f6ff', 3);
  }
}

function drawCoins() {
  for (const c of coins) {
    if (c.x < cam.x - 20 || c.x > cam.x + W + 20) continue;
    drawCoin(c.x, c.magnet ? c.y : c.y + Math.sin(c.t * 2.5) * 3, c.t, 7);
  }
}

function drawPowerups() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const u of powerups) {
    if (u.x < cam.x - 40 || u.x > cam.x + W + 40) continue;
    const d = POWERUPS[u.type];
    const y = u.y + Math.sin(u.t * 3) * 5;
    const g = ctx.createRadialGradient(u.x, y, 4, u.x, y, 30);
    g.addColorStop(0, rgba(d.color, 0.7));
    g.addColorStop(1, rgba(d.color, 0));
    ctx.fillStyle = g;
    fillCircle(u.x, y, 30);
    ctx.fillStyle = 'rgba(10,15,30,0.75)';
    fillCircle(u.x, y, 17);
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(u.x, y, 17, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(d.icon, u.x, y + 1);
  }
}

// ---------------------------------------------------------------------
//  Jednostki gracza (zwiadowca, żołnierz, ciężkozbrojny, technik)
//  Rysowane twarzą w prawo – przy patrzeniu w lewo obraz jest odbijany.
// ---------------------------------------------------------------------
function drawLeg(hipY, a, bend, color, lw, plate) {
  const kx = Math.sin(a) * 13, ky = hipY + Math.cos(a) * 13;
  const fa = a - bend;
  const fx = kx + Math.sin(fa) * 14, fy = ky + Math.cos(fa) * 14;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(0, hipY);
  ctx.lineTo(kx, ky);
  ctx.lineTo(fx, fy);
  ctx.stroke();
  // białe płyty pancerza na udzie i goleni
  if (plate) {
    ctx.strokeStyle = plate;
    ctx.lineWidth = lw * 0.9;
    seg(kx * 0.3, hipY + (ky - hipY) * 0.3, kx * 0.85, hipY + (ky - hipY) * 0.85);
    seg(lerp(kx, fx, 0.15), lerp(ky, fy, 0.15), lerp(kx, fx, 0.72), lerp(ky, fy, 0.72));
  }
  ctx.fillStyle = '#16120e';
  fillEllipse(fx + 2, fy, lw * 0.95, 3.3);
}

function drawBackpack(id, L, paint) {
  if (id === 'medium') {
    ctx.fillStyle = '#2a2d33';
    roundRect(-16, -55, 8, 20, 3); ctx.fill();
    ctx.fillStyle = L.armor;
    roundRect(-16, -55, 8, 6, 2); ctx.fill();
  } else if (id === 'heavy') {
    ctx.fillStyle = '#3a3d44';
    roundRect(-24, -60, 13, 30, 4); ctx.fill();
    ctx.fillStyle = L.armor;
    roundRect(-24, -60, 13, 7, 3); ctx.fill();
    ctx.fillStyle = paint;
    ctx.fillRect(-24, -50, 13, 3);
  } else if (id === 'specialist') {
    ctx.fillStyle = '#2a2d33';
    roundRect(-16, -56, 8, 22, 3); ctx.fill();
    ctx.fillStyle = L.armor;
    ctx.fillRect(-15, -50, 6, 8);
    ctx.fillStyle = '#5ad8ff';
    ctx.fillRect(-13.5, -48, 3, 1.2);
    ctx.strokeStyle = '#7a8591';
    ctx.lineWidth = 1.5;
    seg(-13, -56, -15, -82);
    ctx.fillStyle = Math.sin(time * 6) > 0 ? '#7dff6a' : '#2b6b2a';
    fillCircle(-15, -83, 2);
  }
}

function drawTorso(id, L, paint, ph) {
  if (id === 'light') {
    // czarny kombinezon pod białym pancerzem
    ctx.fillStyle = L.suit;
    roundRect(-8, -56, 16, 31, 4); ctx.fill();
    ctx.fillStyle = L.armor;
    roundRect(-7.5, -55, 15, 14, 4); ctx.fill();          // napierśnik
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-7.5, -45.5, 15, 1.2);
    ctx.fillRect(-1, -55, 1, 9);
    ctx.fillStyle = L.dark;
    ctx.fillRect(1.5, -52, 4, 3);                          // panel na piersi
    ctx.fillStyle = '#7dff6a';
    ctx.fillRect(2.3, -51.2, 1, 1);
    ctx.fillStyle = L.armor;
    roundRect(-6.5, -40.5, 13, 6, 2); ctx.fill();          // płyta brzuszna
    ctx.fillStyle = '#d4d9e0';
    ctx.fillRect(-8, -33.5, 16, 4);                        // pas
    ctx.fillStyle = L.suit;
    ctx.fillRect(-6, -33, 3, 3);
    ctx.fillRect(3, -33, 3, 3);
    ctx.fillStyle = L.armor;
    fillEllipse(-4, -54, 6, 4.5);                          // naramiennik
    ctx.fillStyle = paint;
    ctx.fillRect(-9.5, -54, 11, 1.7);                      // pasek w barwach oddziału
  } else if (id === 'medium') {
    // żołnierz: pełny napierśnik i płyta brzuszna
    ctx.fillStyle = L.suit;
    roundRect(-10, -57, 20, 32, 4); ctx.fill();
    ctx.fillStyle = L.armor;
    roundRect(-9.5, -56, 19, 15, 5); ctx.fill();          // napierśnik
    ctx.fillStyle = SEAM;
    ctx.fillRect(-9.5, -47.5, 19, 1.2);
    ctx.fillRect(-0.6, -56, 1.2, 8.5);
    ctx.fillStyle = paint;
    ctx.fillRect(-9.5, -44.5, 19, 2);                      // pas w barwach oddziału
    ctx.fillStyle = L.armor;
    roundRect(-8, -40, 16, 6.5, 2); ctx.fill();            // płyta brzuszna
    ctx.fillStyle = SEAM;
    ctx.fillRect(-8, -37, 16, 0.9);
    ctx.fillStyle = '#d4d9e0';
    ctx.fillRect(-10, -32, 20, 4);                         // pas
    ctx.fillStyle = L.suit;
    ctx.fillRect(-8, -31.5, 3.5, 3);
    ctx.fillRect(4.5, -31.5, 3.5, 3);
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(-1.5, -31.5, 3, 3);                       // klamra
    ctx.fillStyle = L.armor;
    fillEllipse(-5, -54, 7, 5);                            // naramiennik
    ctx.fillStyle = paint;
    ctx.fillRect(-11.5, -54.5, 13, 1.8);
  } else if (id === 'heavy') {
    // ciężkozbrojny: masywne płyty i wielki naramiennik
    ctx.fillStyle = L.suit;
    roundRect(-13, -60, 26, 35, 5); ctx.fill();
    ctx.fillStyle = L.armor;
    roundRect(-13, -60, 26, 21, 6); ctx.fill();           // masywny napierśnik
    ctx.fillStyle = SEAM;
    ctx.fillRect(-13, -50, 26, 1.3);
    ctx.fillRect(-7, -60, 1.2, 10);
    ctx.fillRect(6, -60, 1.2, 10);
    ctx.fillStyle = paint;
    ctx.fillRect(-3.5, -60, 7, 21);                        // pionowy pas w barwach oddziału
    ctx.fillStyle = L.dark;
    ctx.fillRect(-2, -56, 4, 4);                           // gniazdo zasilania
    ctx.fillStyle = '#ffb347';
    fillCircle(0, -54, 1);
    ctx.fillStyle = L.armor;
    roundRect(-12, -38, 24, 8, 3); ctx.fill();             // płyta brzuszna
    ctx.fillStyle = SEAM;
    ctx.fillRect(-12, -34.5, 24, 1);
    ctx.fillStyle = L.dark;
    ctx.fillRect(-13, -30, 26, 5);
    ctx.fillStyle = '#c9a24a';
    for (let i = 0; i < 5; i++) ctx.fillRect(-11 + i * 5, -29, 3, 3);
    ctx.fillStyle = L.armor;
    fillEllipse(-7, -57, 11, 8, -0.2);                     // wielki naramiennik
    ctx.fillStyle = SEAM;
    fillEllipse(-7, -54, 10, 2, -0.2);
    ctx.fillStyle = paint;
    ctx.fillRect(-17, -59, 17, 2.4);
  } else {
    // technik: lżejszy pancerz z panelem technicznym i szelkami na narzędzia
    ctx.fillStyle = L.suit;
    roundRect(-9, -56, 18, 31, 4); ctx.fill();
    ctx.fillStyle = L.armor;
    roundRect(-8.5, -55, 17, 13, 4); ctx.fill();          // napierśnik
    ctx.fillStyle = SEAM;
    ctx.fillRect(-8.5, -47, 17, 1);
    ctx.fillStyle = L.dark;
    ctx.fillRect(1, -53, 5.5, 4);                          // panel techniczny
    ctx.fillStyle = '#5ad8ff';
    ctx.fillRect(2, -52, 1.3, 1.3);
    ctx.fillStyle = '#7dff6a';
    ctx.fillRect(4.2, -52, 1.3, 1.3);
    ctx.strokeStyle = paint;
    ctx.lineWidth = 2.5;
    seg(-7, -55, 6, -35);                                  // szelka
    ctx.fillStyle = L.armor;
    roundRect(-7, -40, 14, 5.5, 2); ctx.fill();            // płyta brzuszna
    ctx.fillStyle = '#d4d9e0';
    ctx.fillRect(-9, -32.5, 18, 4.5);                      // pas narzędziowy
    ctx.fillStyle = '#5b636e';
    ctx.fillRect(-8, -29, 5, 6);
    ctx.fillRect(3, -29, 5, 6);
    ctx.fillStyle = L.armor;
    fillEllipse(-4, -54, 6, 4.5);                          // naramiennik
    ctx.fillStyle = paint;
    ctx.fillRect(-9.5, -54.5, 11, 1.6);
  }
}

// pasek w barwach oddziału na czubku hełmu (przycięty do kształtu hełmu)
function helmetStripe(x, y, w, h, r, paint, sh) {
  ctx.save();
  roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x, y, w * 0.3, h);                          // cień z tyłu hełmu
  ctx.fillStyle = paint;
  ctx.fillRect(x, y, w, sh);
  ctx.restore();
}

function drawHead(id, L, paint) {
  if (id === 'light') {
    // biały hełm zwiadowcy z daszkiem i szerokim czarnym wizjerem
    ctx.fillStyle = L.suit;
    ctx.fillRect(-2, -59, 6, 4);                           // szyja
    ctx.fillStyle = L.armor;
    fillCircle(1, -67, 8);                                 // kopuła
    ctx.beginPath();                                       // osłona karku
    ctx.moveTo(-7, -68); ctx.lineTo(-8.5, -60); ctx.lineTo(-1, -59.5); ctx.lineTo(0, -66);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.arc(1, -67, 8, Math.PI * 0.6, Math.PI * 1.15); ctx.lineTo(1, -67); ctx.fill();
    ctx.fillStyle = L.armor;
    ctx.beginPath();                                       // daszek
    ctx.moveTo(1.5, -70.5); ctx.lineTo(12.8, -68.8); ctx.lineTo(11.8, -66.6); ctx.lineTo(3, -66.6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0c0d10';
    roundRect(3, -66.8, 8.6, 4.2, 1); ctx.fill();          // wizjer
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(5, -65.9, 4.5, 0.8);
    ctx.fillStyle = L.armor;
    ctx.beginPath();                                       // osłona ust
    ctx.moveTo(2, -62.6); ctx.lineTo(10.8, -62.6); ctx.lineTo(9.2, -58.4); ctx.lineTo(2, -58.4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = L.dark;
    for (let i = 0; i < 3; i++) ctx.fillRect(4.5 + i * 1.6, -61.4, 0.8, 2.2);
    ctx.fillStyle = '#9aa2ac';
    fillCircle(-2, -64.5, 1.8);                            // słuchawka
    ctx.strokeStyle = paint;
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(1, -67, 7, Math.PI * 1.2, Math.PI * 1.7); ctx.stroke();
  } else if (id === 'medium') {
    // zaokrąglony hełm z poziomym wizjerem i kratką oddechową
    ctx.fillStyle = L.suit;
    ctx.fillRect(-2, -59, 6, 4);
    ctx.fillStyle = L.armor;
    roundRect(-7.5, -76, 18, 18, 7); ctx.fill();
    helmetStripe(-7.5, -76, 18, 18, 7, paint, 2.6);
    ctx.fillStyle = '#0c0d10';
    roundRect(1.5, -70, 9.5, 4.6, 1.5); ctx.fill();        // wizjer
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(3.5, -69, 5, 0.8);
    ctx.fillStyle = L.dark;
    for (let i = 0; i < 3; i++) ctx.fillRect(4.5 + i * 1.8, -63.5, 0.9, 3); // kratka
    ctx.fillStyle = '#9aa2ac';
    fillCircle(-2.5, -66, 2);                              // słuchawka
  } else if (id === 'heavy') {
    // kanciasty hełm z czerwoną szczeliną wizjera
    ctx.fillStyle = L.suit;
    ctx.fillRect(-2, -61, 7, 4);
    ctx.fillStyle = L.armor;
    roundRect(-8.5, -80, 21, 21, 5); ctx.fill();
    helmetStripe(-8.5, -80, 21, 21, 5, paint, 3.5);
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(2, -72, 10.5, 5);                         // wizjer
    ctx.fillStyle = 'rgba(255,70,50,0.9)';
    ctx.fillRect(3, -71, 8.5, 2);
    ctx.fillStyle = L.dark;
    for (let i = 0; i < 4; i++) ctx.fillRect(3.5 + i * 2.4, -65, 1.2, 4); // kratka
    ctx.fillStyle = '#9aa2ac';
    ctx.fillRect(-6, -74, 3, 7);                           // boczny moduł
  } else {
    // okrągły hełm technika ze świecącym wizjerem-goglami
    ctx.fillStyle = L.suit;
    ctx.fillRect(-2, -59, 6, 4);
    ctx.fillStyle = L.armor;
    fillCircle(1, -67, 8.2);
    ctx.beginPath();                                       // osłona karku
    ctx.moveTo(-7, -68); ctx.lineTo(-8.5, -60); ctx.lineTo(-1, -59.5); ctx.lineTo(0, -66);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.arc(1, -67, 8.2, Math.PI * 0.6, Math.PI * 1.15); ctx.lineTo(1, -67); ctx.fill();
    ctx.fillStyle = 'rgba(90,216,255,0.25)';
    fillCircle(7, -67, 6);
    ctx.fillStyle = '#0c0d10';
    roundRect(2, -69.5, 9, 5, 2); ctx.fill();              // gogle
    ctx.fillStyle = 'rgba(90,216,255,0.9)';
    roundRect(3, -68.6, 7.5, 3.2, 1.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(4, -68.2, 3, 0.7);
    ctx.fillStyle = L.armor;
    ctx.beginPath();                                       // osłona ust
    ctx.moveTo(2, -63.5); ctx.lineTo(9.5, -63.5); ctx.lineTo(8.5, -59); ctx.lineTo(2, -59);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b636e';
    ctx.fillRect(-4, -69, 3, 5);                           // czujnik z boku
    ctx.fillStyle = '#7dff6a';
    ctx.fillRect(-3.2, -68, 1.4, 1.4);
    ctx.strokeStyle = paint;
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(1, -67, 7.2, Math.PI * 1.2, Math.PI * 1.7); ctx.stroke();
  }
}

// ---------------------------------------------------------------------
//  Broń – rysowana w układzie ręki: x do przodu, y w dół, (0,0) = bark.
//  Metalowe części mają połysk u góry i cień u dołu, jak prawdziwa stal.
// ---------------------------------------------------------------------
function metalPart(x, y, w, h, base, r = 1) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(base, 0.45));
  g.addColorStop(0.35, base);
  g.addColorStop(1, shade(base, -0.5));
  ctx.fillStyle = g;
  roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
}
function polyPart(pts, base) {
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(base, 0.35));
  g.addColorStop(1, shade(base, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
}
function holes(x, y, n, dx, r = 0.8) {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  for (let i = 0; i < n; i++) fillCircle(x + i * dx, y, r);
}
// soczewka lunety widziana z boku (wąska elipsa z odblaskiem)
function lensEdge(x, y, ry, color) {
  const g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, color);
  g.addColorStop(1, shade(color, -0.6));
  ctx.fillStyle = g;
  fillEllipse(x, y, 1, ry);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  fillCircle(x - 0.2, y - ry * 0.45, 0.5);
}
// błysk z lufy: poświata + gwiazda z dłuższym promieniem do przodu
function muzzleFlash(x, y, size, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, size * 2.6);
  g.addColorStop(0, rgba(color, 0.6));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  fillCircle(x, y, size * 2.6);
  const rot = (Math.random() - 0.5) * 0.4;
  ctx.fillStyle = rgba(color, 0.95);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * Math.PI * 2;
    const r = i % 2 ? size * 0.38 : i === 0 ? size * (1.8 + Math.random() * 0.6) : size * (0.8 + Math.random() * 0.4);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  fillCircle(x, y, size * 0.42);
}

// krótki, smukły pistolet blasterowy zwiadowcy
function drawPistol(o, paint) {
  polyPart([[10, -0.6], [13.4, -0.6], [12.7, 8], [9.9, 8.3]], '#1f2227'); // wąska rękojeść
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) seg(10.5, 2 + i * 2, 12.9 - i * 0.2, 2 + i * 2);
  ctx.strokeStyle = DARKMETAL;
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.arc(15.2, 0.4, 1.9, 0, Math.PI); ctx.stroke();     // cienka osłona spustu
  metalPart(8.5, -3.6, 12, 3.4, '#5b636e', 1.2);                          // krótki zamek
  ctx.fillStyle = paint;
  ctx.fillRect(10, -1.3, 4, 0.7);
  metalPart(20.2, -2.9, 4.6, 1.9, '#3a3f47', 0.6);                        // krótka lufa
  metalPart(24.6, -3.2, 1.6, 2.5, '#1e2227', 0.4);                        // pierścień wylotu
  metalPart(10.5, -5, 7.5, 1.4, POLYMER, 0.5);                            // szyna celownika
  ctx.fillStyle = '#1e2227';
  ctx.fillRect(22.5, -4.1, 0.9, 1.3);                                     // muszka
  ctx.fillStyle = rgba(o.color, 0.95);
  fillCircle(16.5, -1.9, 0.6);                                            // dioda zasilania
}

// karabin blasterowy żołnierza
function drawRifle(o, paint) {
  polyPart([[-7, -2.5], [3, -3.5], [3, 3], [-6, 5.5], [-7.5, 5]], POLYMER); // kolba
  ctx.fillStyle = paint;
  ctx.fillRect(-5, -1, 6, 1.6);
  polyPart([[6, 2], [10, 2], [9, 9], [5.5, 9]], POLYMER);                    // chwyt
  polyPart([[13, 2.5], [18, 2.5], [19.5, 10], [14.5, 10.5]], '#3a3f47');      // ogniwo energetyczne
  ctx.fillStyle = rgba(o.color, 0.85);
  ctx.fillRect(15.2, 6.5, 3, 1);
  metalPart(2, -4.5, 22, 7, GUNMETAL, 1.5);                                  // komora
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.6;
  seg(6, -0.8, 20, -0.8);
  metalPart(17, -3.2, 4, 1.4, '#9aa2ac', 0.5);                               // rączka przeładowania
  metalPart(23, -4, 14, 6.5, DARKMETAL, 1.5);                                // łoże
  holes(25.6, -0.9, 4, 3, 0.9);                                              // otwory chłodzące
  polyPart([[28, 2.5], [31.5, 2.5], [31, 9], [28.5, 9]], POLYMER);            // chwyt przedni
  metalPart(36.5, -2.6, 8.5, 3.6, '#5b636e', 0.8);                           // lufa
  metalPart(44.5, -3.4, 3.5, 5.2, '#262a30', 0.8);                           // hamulec wylotowy
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(45.4, -2.6, 0.7, 3.6);
  ctx.fillRect(46.7, -2.6, 0.7, 3.6);
  metalPart(9, -6.6, 2, 2.2, DARKMETAL, 0.3);                                // montaż lunety
  metalPart(16, -6.6, 2, 2.2, DARKMETAL, 0.3);
  metalPart(5, -10.2, 16, 3.8, '#2b2f36', 1.8);                              // luneta
  metalPart(4, -10.8, 3, 5, '#1d2025', 1);                                   // muszla oczna
  lensEdge(21.2, -8.3, 1.8, '#7fd4ff');
}

// działko obrotowe ciężkozbrojnego
function drawMinigun(o, paint) {
  const spin = o.spin || 0, ph = o.spinPhase || 0;
  // taśma z amunicją idąca do plecaka
  ctx.strokeStyle = '#3a3220';
  ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(14, 6); ctx.quadraticCurveTo(6, 16, -8, 12); ctx.stroke();
  ctx.fillStyle = '#d9b44a';
  const shift = (ph * 0.6) % 1;
  for (let i = 0; i < 6; i++) {
    const t = (i + shift) / 6;
    const bx = (1 - t) * (1 - t) * 14 + 2 * (1 - t) * t * 6 + t * t * -8;
    const by = (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * 16 + t * t * 12;
    ctx.fillRect(bx - 0.8, by - 1.6, 1.6, 3.2);
  }
  metalPart(-1, -7.5, 15, 15, DARKMETAL, 3);                                 // obudowa silnika
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) seg(1.5 + i * 3, -5.5, 1.5 + i * 3, 5.5);      // żeberka chłodzące
  ctx.fillStyle = paint;
  ctx.fillRect(0.5, -7, 12, 1.6);
  ctx.strokeStyle = '#2b2f36';                                                // rączka do noszenia
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(5, -7.5); ctx.lineTo(7, -12.5); ctx.lineTo(20, -12.5); ctx.lineTo(22, -7.5); ctx.stroke();
  metalPart(13, -6.5, 14, 13, GUNMETAL, 2);                                  // komora
  polyPart([[19, 6], [23, 6], [22.5, 12.5], [19.5, 12.5]], POLYMER);          // chwyt przedni
  // lufy – obracają się, te z tyłu są ciemniejsze
  const barrels = [];
  for (let i = 0; i < 3; i++) {
    const a = ph + i * 2.094;
    barrels.push({ y: Math.sin(a) * 3.3, z: Math.cos(a) });
  }
  barrels.sort((a, b) => a.z - b.z);
  for (const b of barrels) {
    metalPart(26, b.y - 1.4, 25, 2.8, b.z > 0 ? '#808792' : '#4a5059', 1);
    if (spin > 0.25) {
      const g = ctx.createLinearGradient(30, 0, 51, 0);
      g.addColorStop(0, 'rgba(255,90,30,0)');
      g.addColorStop(1, `rgba(255,110,40,${(spin - 0.25) * 0.8})`);
      ctx.fillStyle = g;
      ctx.fillRect(30, b.y - 1.4, 21, 2.8);
    }
  }
  metalPart(29, -5.2, 2.5, 10.4, '#2b2f36', 0.8);                            // obejmy luf
  metalPart(47.5, -5.2, 3, 10.4, '#2b2f36', 0.8);
}

// karabin jonowy technika
function drawIonRifle(o, paint) {
  const pulse = 0.55 + 0.35 * Math.sin(time * 8);
  ctx.strokeStyle = '#7a8591';                                               // kolba szkieletowa
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(-6, -2); ctx.lineTo(-7, 5); ctx.lineTo(4, 3); ctx.stroke();
  polyPart([[7, 2], [11, 2], [10, 9], [6.5, 9]], '#59626d');                  // chwyt
  metalPart(3, -4.5, 27, 8, '#cfd7e0', 3);                                    // korpus
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.6;
  seg(12, -4.5, 12, 3.5);
  ctx.fillStyle = paint;
  ctx.fillRect(4, -1, 6, 1.5);
  // okienko z cewką energetyczną
  ctx.fillStyle = '#0d1a22';
  roundRect(14, -3.2, 13, 4.6, 1.5); ctx.fill();
  const g = ctx.createLinearGradient(14, 0, 27, 0);
  g.addColorStop(0, rgba(o.color, 0.25));
  g.addColorStop(0.5, rgba(o.color, pulse));
  g.addColorStop(1, rgba(o.color, 0.25));
  ctx.fillStyle = g;
  roundRect(14.5, -2.6, 12, 3.4, 1.2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  for (let i = 0; i < 4; i++) seg(16 + i * 3, -2.6, 16 + i * 3, 0.8);
  // ogniwo z paskiem naładowania
  metalPart(14, 3.5, 9, 4, '#59626d', 1);
  ctx.fillStyle = rgba(o.color, 0.95);
  ctx.fillRect(15, 4.7, 7 * clamp(o.charge === undefined ? 1 : o.charge, 0, 1), 1.6);
  metalPart(29, -2.4, 17, 3.4, '#8a95a1', 0.8);                               // lufa
  holes(31.5, -0.7, 4, 3.2, 0.5);
  metalPart(45.5, -3.6, 3.5, 5.8, '#3a4550', 1);                              // emiter
  ctx.fillStyle = rgba(o.color, 0.45 + 0.35 * pulse);
  fillEllipse(49.2, -0.7, 0.9, 2.2);
  metalPart(8, -6.8, 2, 2.4, '#59626d', 0.3);                                 // montaż lunety
  metalPart(19, -6.8, 2, 2.4, '#59626d', 0.3);
  metalPart(6, -10.2, 19, 3.6, '#3a4550', 1.8);                               // luneta
  lensEdge(25.2, -8.4, 1.7, o.color);
}

function drawWeapon(id, o, paint) {
  if (id === 'light') drawPistol(o, paint);
  else if (id === 'medium') drawRifle(o, paint);
  else if (id === 'heavy') drawMinigun(o, paint);
  else drawIonRifle(o, paint);
}

// o = { dir, aim, anim, onGround, ducking, moving, muzzle, paint, spinPhase, alpha }
function drawUnit(id, x, y, o) {
  const L = UNIT_LOOK[id];
  const paint = o.paint || PAINTS[0].color;
  const ph = o.anim || 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale((o.dir || 1) * L.scale, L.scale);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // --- ciało (przy kucaniu spłaszczone) ---
  ctx.save();
  if (o.ducking) ctx.scale(1.12, 0.6);
  let a1, a2, b1, b2;
  if (!o.onGround) { a1 = 0.6; b1 = 1.2; a2 = -0.35; b2 = 0.5; }
  else if (o.moving) {
    a1 = Math.sin(ph) * 0.8; a2 = -a1;
    b1 = 0.25 + Math.max(0, -Math.cos(ph)) * 1.1;
    b2 = 0.25 + Math.max(0, Math.cos(ph)) * 1.1;
  } else { a1 = 0.16; a2 = -0.16; b1 = 0.2; b2 = 0.2; }
  drawLeg(-27, a2, b2, L.dark, L.legW, L.plates ? '#c3c9d2' : null);
  drawBackpack(id, L, paint);
  drawLeg(-27, a1, b1, L.suit, L.legW, L.plates ? L.armor : null);
  drawTorso(id, L, paint, ph);
  drawHead(id, L, paint);
  ctx.restore();

  // --- ręce z bronią (obracają się przy celowaniu, odskakują przy strzale) ---
  const armY = o.ducking ? -27 : -46;
  const heavy = id === 'heavy';
  const rec = o.recoil || 0;
  const wo = { color: UNITS[id].weapon.color, spin: o.spin, spinPhase: o.spinPhase, charge: o.charge };
  ctx.save();
  ctx.translate(3, armY);
  ctx.rotate((o.aim || 0) - rec * (heavy ? 0.02 : 0.09));
  ctx.translate(-rec * (heavy ? 1.2 : 2.5), heavy ? Math.sin(time * 70) * rec * 0.6 : 0);
  const grip = L.grip, trig = L.trigger;
  // ręka podtrzymująca broń z przodu (zgięta w łokciu)
  if (grip) {
    const ex = (grip[0] - 5) * 0.5, ey = grip[1] + 5; // łokieć
    ctx.strokeStyle = L.dark;
    ctx.lineWidth = heavy ? 6 : 4.5;
    ctx.beginPath();
    ctx.moveTo(-5, -2);
    ctx.lineTo(ex, ey);
    ctx.lineTo(grip[0], grip[1]);
    ctx.stroke();
    if (L.plates) {                                       // płyta na przedramieniu
      ctx.strokeStyle = '#c3c9d2';
      ctx.lineWidth = heavy ? 4.8 : 3.4;
      seg(lerp(ex, grip[0], 0.2), lerp(ey, grip[1], 0.2), lerp(ex, grip[0], 0.7), lerp(ey, grip[1], 0.7));
    }
  }
  // ręka na spuście
  ctx.strokeStyle = L.suit;
  ctx.lineWidth = heavy ? 7 : 5;
  seg(-2, -1, trig[0] - 1, trig[1] - 1);
  if (L.plates) {                                         // płyta na ramieniu
    ctx.strokeStyle = L.armor;
    ctx.lineWidth = heavy ? 5.6 : 3.6;
    seg(lerp(-2, trig[0] - 1, 0.2), lerp(-1, trig[1] - 1, 0.2), lerp(-2, trig[0] - 1, 0.7), lerp(-1, trig[1] - 1, 0.7));
  }
  drawWeapon(id, wo, paint);
  // dłonie w rękawicach
  ctx.fillStyle = L.dark;
  fillCircle(trig[0], trig[1], heavy ? 3.6 : 3);
  if (grip) fillCircle(grip[0], grip[1], heavy ? 3.6 : 3);
  // naramiennik (biały z paskiem w barwach oddziału)
  if (id !== 'light') {
    const rx = heavy ? 8.5 : 6, ry = heavy ? 6.5 : 4.5;
    ctx.fillStyle = L.armor;
    fillEllipse(0, -1, rx, ry);
    ctx.fillStyle = SEAM;
    fillEllipse(0, 1.5, rx * 0.9, ry * 0.3);
    ctx.fillStyle = paint;
    ctx.fillRect(-rx, -2.2, rx * 2, heavy ? 2.2 : 1.6);
  }
  if (o.muzzle) muzzleFlash(L.muzzle[0] + 1, L.muzzle[1], heavy ? 5.5 : id === 'light' ? 3 : 4.6, wo.color);
  ctx.restore();
  ctx.restore();
}

function drawDrone(x, y, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(200,220,240,0.35)';
  fillEllipse(x, y - 8, 13 * Math.abs(Math.sin(time * 40)) + 3, 1.6);
  ctx.strokeStyle = '#7a8591';
  ctx.lineWidth = 1.5;
  seg(x, y - 8, x, y - 4);
  ctx.fillStyle = '#c9d3dd';
  fillEllipse(x, y, 9, 6);
  ctx.fillStyle = '#5ad8ff';
  fillCircle(x + 4 * player.dir, y, 2.2);
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  // fala EMP
  if (p.empFx > 0) {
    const k = 1 - p.empFx / 0.6;
    ctx.strokeStyle = `rgba(120,210,255,${0.85 * (1 - k)})`;
    ctx.lineWidth = 14 * (1 - k) + 2;
    ctx.beginPath(); ctx.arc(p.x, p.y - 35, 30 + k * 700, 0, Math.PI * 2); ctx.stroke();
  }
  if (run.power.invincible > 0) {
    const g = ctx.createRadialGradient(p.x, p.y - 32, 10, p.x, p.y - 32, 54);
    g.addColorStop(0, 'rgba(127,212,255,0)');
    g.addColorStop(0.7, `rgba(127,212,255,${0.25 + 0.15 * Math.sin(time * 10)})`);
    g.addColorStop(1, 'rgba(127,212,255,0)');
    ctx.fillStyle = g;
    fillCircle(p.x, p.y - 32, 54);
  }
  if (p.invuln > 0 && p.dashT <= 0 && run.power.invincible <= 0 && Math.floor(time * 18) % 2 === 0) return;
  const alpha = p.cloakT > 0 ? 0.22 + 0.08 * Math.sin(time * 12) : 1;
  drawUnit(stats.unit, p.x, p.y, {
    dir: p.dir, aim: p.aim, anim: p.anim, onGround: p.onGround, ducking: p.ducking, moving: p.moving,
    muzzle: p.muzzle > 0, paint: paintColor(), spinPhase: p.spinPhase, alpha,
    recoil: p.recoil, spin: p.spin, charge: 1 - Math.max(0, p.shootCd) / stats.weaponCd,
  });
  if (stats.unit === 'specialist') drawDrone(p.x - p.dir * 26, p.y - 94 + Math.sin(time * 3) * 4, alpha);
}

// sojusznicze wieżyczki technika
function drawAllies() {
  for (const a of allies) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.strokeStyle = '#5b636e';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    seg(0, -14, -11, 0);
    seg(0, -14, 11, 0);
    ctx.fillStyle = '#b9c5d0';
    roundRect(-10, -28, 20, 15, 4); ctx.fill();
    ctx.fillStyle = paintColor();
    ctx.fillRect(-10, -22, 20, 3);
    ctx.save();
    ctx.translate(0, -23);
    ctx.rotate(a.aim);
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(2, -2.5, 20, 5);
    ctx.restore();
    ctx.fillStyle = '#5ad8ff';
    fillCircle(0, -23, 2.8);
    drawBar(-14, -38, 28, 4, a.t / a.max, '#5ad8ff', 'rgba(0,0,0,0.5)');
    ctx.restore();
  }
}

// bariery ciężkozbrojnego
function drawBarriers() {
  for (const b of barriers) {
    const a = Math.min(1, b.t / 0.5) * (0.75 + 0.25 * Math.sin(time * 10));
    const top = b.y - b.h;
    const g = ctx.createLinearGradient(b.x - 12, 0, b.x + 12, 0);
    g.addColorStop(0, 'rgba(110,190,255,0)');
    g.addColorStop(0.5, `rgba(140,210,255,${0.55 * a})`);
    g.addColorStop(1, 'rgba(110,190,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x - 12, top, 24, b.h);
    ctx.strokeStyle = `rgba(200,235,255,${0.9 * a})`;
    ctx.lineWidth = 2;
    seg(b.x, top, b.x, b.y);
    ctx.lineWidth = 1;
    for (let yy = top + 6; yy < b.y - 6; yy += 14) {
      seg(b.x - 7, yy, b.x + 7, yy + 7);
      seg(b.x + 7, yy, b.x - 7, yy + 7);
    }
    ctx.fillStyle = '#3a3e46';
    ctx.fillRect(b.x - 9, b.y - 6, 18, 6);
    ctx.fillStyle = '#8fe0ff';
    ctx.fillRect(b.x - 5, b.y - 5, 10, 2);
  }
}

// ---------------------------------------------------------------------
//  Wrogowie (rysowani twarzą w lewo, odbijani gdy patrzą w prawo)
// ---------------------------------------------------------------------
function drawTelegraph(e, x, y) {
  if (e.muzzle > 0) {
    ctx.fillStyle = 'rgba(255,210,170,0.95)';
    fillCircle(x, y, 7);
  } else if (e.armed && e.fireT < 0.45 && e.burst <= 0) {
    const k = 1 - e.fireT / 0.45;
    ctx.fillStyle = `rgba(255,50,30,${0.3 + 0.6 * k})`;
    fillCircle(x, y, 2 + k * 5);
  }
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.falling) ctx.rotate(clamp(e.vy * 0.0015, -1.5, 1.5) * (e.kb >= 0 ? 1 : -1));
  if (e.type !== 'turret' && e.dir > 0) ctx.scale(-1, 1);
  const fl = e.flash > 0;
  switch (e.type) {
    case 'crate': drawCrate(fl); break;
    case 'trooper': drawTrooper(e, fl); break;
    case 'droid': drawDroid(e, fl); break;
    case 'probe': drawProbe(e, fl); break;
    case 'turret': drawTurret(e, fl); break;
    case 'heavy': drawHeavy(e, fl); break;
  }
  ctx.restore();
  // ogłuszenie (EMP)
  if (e.stun > 0 && !e.falling) {
    ctx.strokeStyle = 'rgba(140,220,255,0.9)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a = time * 9 + i * 2.1;
      const cx = e.x + Math.cos(a) * e.w * 0.6, cy = e.y - e.h * 0.6 + Math.sin(a * 1.3) * e.h * 0.35;
      ctx.beginPath(); ctx.moveTo(cx - 5, cy - 4); ctx.lineTo(cx, cy); ctx.lineTo(cx - 3, cy + 1); ctx.lineTo(cx + 4, cy + 5); ctx.stroke();
    }
  }
  if (e.hp < e.maxHp && !e.falling && e.type !== 'crate') {
    drawBar(e.x - 20, e.y - e.h - 12, 40, 5, e.hp / e.maxHp, '#ff5a4a', 'rgba(0,0,0,0.55)');
  }
}

function drawCrate(fl) {
  ctx.fillStyle = fl ? '#ffffff' : '#8b5a2b';
  ctx.fillRect(-19, -38, 38, 38);
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 3;
  ctx.strokeRect(-17.5, -36.5, 35, 35);
  ctx.beginPath();
  ctx.moveTo(-17, -36); ctx.lineTo(17, -2);
  ctx.moveTo(17, -36); ctx.lineTo(-17, -2);
  ctx.stroke();
  ctx.fillStyle = '#ffcf3a';
  ctx.fillRect(-7, -23, 14, 8);
}

function drawTrooper(e, fl) {
  const A = fl ? '#ffffff' : '#e8edf1', D = '#16181d', G = '#8d96a1';
  const wk = e.walking ? Math.sin(e.t * 9) * 3 : 0;
  ctx.fillStyle = D;
  ctx.fillRect(-9 + wk, -30, 8, 30);
  ctx.fillRect(1 - wk, -30, 8, 30);
  ctx.fillStyle = A;
  ctx.fillRect(-8.5 + wk, -29, 7, 12);
  ctx.fillRect(1.5 - wk, -29, 7, 12);
  ctx.fillRect(-8.5 + wk, -14, 7, 10);
  ctx.fillRect(1.5 - wk, -14, 7, 10);
  ctx.fillStyle = D;
  ctx.fillRect(-11, -54, 22, 26);
  ctx.fillStyle = A;
  ctx.fillRect(-10, -53, 20, 13);
  ctx.fillRect(-9, -38, 18, 6);
  ctx.fillStyle = G;
  ctx.fillRect(-10, -32, 20, 3);
  ctx.fillStyle = D;
  ctx.fillRect(-6, -50, 4, 4);
  ctx.fillStyle = A;
  roundRect(-9, -68, 18, 16, 6); ctx.fill();
  ctx.strokeStyle = D; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = D;
  ctx.fillRect(-9, -62, 9, 4);
  ctx.fillRect(-7, -57, 5, 3);
  // ręka z bronią (wysoko albo nisko – patrz, gdzie celuje!)
  const gy = e.nextHigh ? -44 : -16;
  ctx.strokeStyle = A;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  seg(-4, -50, -14, gy + 1);
  drawEnemyRifle(gy, 'trooper');
  ctx.fillStyle = D;
  fillCircle(-13, gy + 2, 2.6);
  drawTelegraph(e, -40, gy - 0.3);
}

// karabiny wrogów (skierowane w lewo)
function drawEnemyRifle(gy, kind) {
  if (kind === 'trooper') {
    metalPart(-10, gy - 2.6, 7, 4, POLYMER, 1);                                        // kolba
    polyPart([[-14, gy + 1], [-10.5, gy + 1], [-11, gy + 6.5], [-14.5, gy + 6.5]], POLYMER); // chwyt
    metalPart(-31, gy - 3, 22, 5, '#22262c', 1.2);                                     // korpus
    holes(-28, gy - 0.5, 4, 3, 0.7);                                                    // otwory chłodzące
    polyPart([[-21, gy + 2], [-17.5, gy + 2], [-16.5, gy + 8], [-20, gy + 8]], '#3a3f47'); // magazynek
    metalPart(-38, gy - 1.8, 8, 3, '#3a3f47', 0.8);                                    // lufa
    metalPart(-25, gy - 6.2, 11, 2.6, '#1a1d22', 1);                                   // celownik
    lensEdge(-25, gy - 4.9, 1.1, '#ff6b5a');
  } else {
    metalPart(-13, gy - 2, 9, 3.6, '#6b5a3e', 1);                                      // kolba
    metalPart(-33, gy - 2.3, 21, 4.2, '#4a4032', 1);                                   // korpus
    holes(-30, gy - 0.2, 3, 4, 0.6);
    metalPart(-40, gy - 1.4, 8, 2.8, '#2f2a22', 0.6);                                  // lufa
    metalPart(-25, gy - 5, 7, 2.2, '#2f2a22', 0.8);                                    // celownik
    polyPart([[-20, gy + 1.8], [-17, gy + 1.8], [-17.5, gy + 6], [-20.5, gy + 6]], '#2f2a22');
  }
}

function drawDroid(e, fl) {
  const C = fl ? '#ffffff' : '#cdb57f', D = '#8a744a';
  const wk = e.walking ? Math.sin(e.t * 12) * 0.5 : 0;
  ctx.strokeStyle = C;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-5 + wk * 8, -15); ctx.lineTo(-4 + wk * 12, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(5 - wk * 8, -15); ctx.lineTo(4 - wk * 12, 0); ctx.stroke();
  ctx.fillStyle = C;
  ctx.fillRect(-6, -50, 12, 20);
  ctx.fillStyle = D;
  ctx.fillRect(1, -48, 8, 14);
  seg(0, -50, -2, -57);
  ctx.fillStyle = C;
  fillEllipse(-8, -61, 12, 4.5, -0.25);
  ctx.fillStyle = D;
  fillCircle(-12, -61, 1.8);
  const gy = e.nextHigh ? -44 : -16;
  ctx.strokeStyle = C;
  ctx.lineWidth = 3;
  seg(-2, -47, -12, gy);
  drawEnemyRifle(gy, 'droid');
  drawTelegraph(e, -42, gy - 0.2);
}

function drawProbe(e, fl) {
  ctx.strokeStyle = '#3a3a44';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) seg(i * 6, -8, i * 9 + Math.sin(e.t * 3 + i) * 3, 14);
  seg(4, -32, 10, -46);
  ctx.fillStyle = 'rgba(120,200,255,0.35)';
  fillCircle(0, 16, 5 + Math.sin(e.t * 20) * 1.5);
  ctx.fillStyle = fl ? '#ffffff' : '#26262e';
  fillCircle(0, -18, 15);
  ctx.fillStyle = '#41414d';
  ctx.fillRect(-15, -20, 30, 4);
  ctx.fillStyle = 'rgba(255,40,40,0.35)';
  fillCircle(-9, -18, 7);
  ctx.fillStyle = '#ff3030';
  fillCircle(-9, -18, 3.5);
  drawTelegraph(e, -16, -18);
}

function drawTurret(e, fl) {
  const C = fl ? '#ffffff' : '#5d6470';
  ctx.fillStyle = C;
  ctx.beginPath();
  ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.lineTo(14, -16); ctx.lineTo(-14, -16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fl ? '#ffffff' : '#79818f';
  ctx.beginPath(); ctx.arc(0, -18, 14, Math.PI, 0); ctx.fill();
  ctx.save();
  ctx.translate(0, -24);
  ctx.rotate(e.aim);
  ctx.fillStyle = '#2b2e35';
  ctx.fillRect(0, -3.5, 28, 7);
  ctx.restore();
  ctx.fillStyle = Math.sin(e.t * 8) > 0 ? '#ff3b30' : '#7a1a14';
  fillCircle(0, -10, 2.5);
  drawTelegraph(e, Math.cos(e.aim) * 30, -24 + Math.sin(e.aim) * 30);
}

function drawHeavy(e, fl) {
  const C = fl ? '#ffffff' : '#4d4a52', A = '#8a6f4a';
  const wk = e.walking ? Math.sin(e.t * 5) * 3 : 0;
  ctx.fillStyle = C;
  ctx.fillRect(-17 + wk, -32, 13, 32);
  ctx.fillRect(4 - wk, -32, 13, 32);
  ctx.fillStyle = '#2b2a2e';
  ctx.fillRect(-20 + wk, -5, 18, 5);
  ctx.fillRect(2 - wk, -5, 18, 5);
  ctx.fillStyle = C;
  roundRect(-24, -74, 48, 44, 8); ctx.fill();
  ctx.fillStyle = A;
  ctx.fillRect(-20, -68, 40, 8);
  ctx.fillStyle = C;
  roundRect(-14, -86, 26, 14, 4); ctx.fill();
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-12, -81, 9, 3);
  metalPart(-30, -61, 16, 14, '#3a3940', 3);   // działo na ramieniu
  metalPart(-45, -57, 17, 7, '#2b2b30', 1.5);
  holes(-41, -53.5, 3, 4, 0.8);
  metalPart(-48, -58, 4, 9, '#1d1d21', 1);
  ctx.strokeStyle = `rgba(110,190,255,${0.45 + 0.2 * Math.sin(time * 5)})`;
  ctx.fillStyle = 'rgba(110,190,255,0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, -42, 38, 50, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  drawTelegraph(e, -50, -53.5);
}

// ---------------------------------------------------------------------
//  Boss – Kroczący Kolos (rysowany twarzą w lewo)
// ---------------------------------------------------------------------
function drawBoss(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.dir > 0) ctx.scale(-1, 1);
  const fl = b.flash > 0;
  const C = fl ? '#ffffff' : b.tint;
  const D = fl ? '#dddddd' : '#3d424c';
  if (b.attack === 'stomp' && b.step === 0) {
    ctx.fillStyle = `rgba(255,80,40,${0.3 + 0.3 * Math.sin(time * 30)})`;
    fillEllipse(0, b.jumpY, 90, 12);
  }
  for (const side of [-1, 1]) {
    const ph = b.legPhase + (side > 0 ? Math.PI : 0);
    const hipX = side * 20, hipY = -140;
    const footX = side * 20 + Math.sin(ph) * 26;
    const footY = b.walking ? -Math.max(0, Math.cos(ph)) * 16 : 0;
    const kneeX = (hipX + footX) / 2 + 26, kneeY = -78 + footY * 0.5;
    ctx.strokeStyle = side < 0 ? D : C;
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kneeX, kneeY); ctx.lineTo(footX, footY - 6); ctx.stroke();
    ctx.fillStyle = '#23262d';
    fillCircle(kneeX, kneeY, 8);
    ctx.fillStyle = side < 0 ? D : C;
    ctx.fillRect(footX - 24, footY - 9, 48, 10);
  }
  ctx.translate(0, b.walking ? Math.sin(b.legPhase * 2) * 3 : 0);
  ctx.fillStyle = C;
  ctx.beginPath();
  ctx.moveTo(-78, -196); ctx.lineTo(-56, -234); ctx.lineTo(52, -234); ctx.lineTo(64, -204); ctx.lineTo(54, -150); ctx.lineTo(-52, -150);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  seg(-40, -234, -30, -150);
  seg(20, -234, 26, -150);
  ctx.fillStyle = '#141414';
  ctx.fillRect(-66, -210, 46, 11);
  ctx.fillStyle = b.stun > 0 ? 'rgba(120,200,255,0.8)' : `rgba(255,60,40,${0.6 + 0.4 * Math.sin(time * 6)})`;
  ctx.fillRect(-64, -208, 42, 7);
  ctx.fillStyle = '#2b2e35';
  ctx.fillRect(-102, -172, 42, 8);
  ctx.fillRect(-96, -160, 36, 7);
  if (b.muzzle > 0) {
    ctx.fillStyle = 'rgba(255,200,150,0.95)';
    fillCircle(-104, -168, 9);
  }
  ctx.fillStyle = D;
  ctx.fillRect(8, -252, 36, 19);
  ctx.fillStyle = '#111111';
  for (let i = 0; i < 3; i++) fillCircle(16 + i * 10, -243, 3);
  ctx.restore();
  if (b.stun > 0) {
    ctx.strokeStyle = 'rgba(140,220,255,0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = time * 7 + i * 1.6;
      const cx = b.x + Math.cos(a) * 70, cy = b.y - 150 + Math.sin(a * 1.2) * 80;
      ctx.beginPath(); ctx.moveTo(cx - 7, cy - 6); ctx.lineTo(cx, cy); ctx.lineTo(cx - 4, cy + 2); ctx.lineTo(cx + 6, cy + 8); ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------
//  Pociski, cząsteczki, napisy
// ---------------------------------------------------------------------
function drawRocketShape(b, body, tip) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(Math.atan2(b.vy, b.vx));
  ctx.fillStyle = '#ffb347';
  ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(-20 - Math.random() * 8, 0); ctx.lineTo(-10, 3); ctx.fill();
  ctx.fillStyle = body;
  ctx.fillRect(-11, -3.5, 18, 7);
  ctx.fillStyle = tip;
  ctx.beginPath(); ctx.moveTo(7, -3.5); ctx.lineTo(13, 0); ctx.lineTo(7, 3.5); ctx.fill();
  ctx.restore();
}

function drawBullets() {
  ctx.lineCap = 'round';
  for (const b of bullets) {
    if (b.kind === 'bolt') {
      const l = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / l, uy = b.vy / l, L = b.len;
      const wide = b.ion ? 11 : 8;
      ctx.strokeStyle = rgba(b.color, 0.35); ctx.lineWidth = wide; seg(b.x - ux * L, b.y - uy * L, b.x, b.y);
      ctx.strokeStyle = b.color; ctx.lineWidth = b.ion ? 5 : 4; seg(b.x - ux * L, b.y - uy * L, b.x, b.y);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; seg(b.x - ux * L * 0.8, b.y - uy * L * 0.8, b.x - ux * 2, b.y - uy * 2);
    } else if (b.kind === 'missile') {
      const pulse = 0.5 + 0.5 * Math.sin(time * 14);
      ctx.strokeStyle = `rgba(255,60,40,${0.45 + pulse * 0.5})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(b.tx, GY - 2, 30, 7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(b.tx, GY - 2, 13, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
      drawRocketShape(b, '#9aa0aa', '#ff3b30');
    } else if (b.kind === 'rocket') {
      drawRocketShape(b, '#5b636e', paintColor());
    } else if (b.kind === 'grenade') {
      ctx.fillStyle = '#3a3e46';
      fillCircle(b.x, b.y, 5.5);
      ctx.fillStyle = Math.sin(time * 25) > 0 ? '#ff3b30' : '#ffd23f';
      fillCircle(b.x + 1.5, b.y - 1.5, 2);
    } else if (b.kind === 'wave') {
      const g = ctx.createLinearGradient(0, GY - b.h * 1.6, 0, GY);
      g.addColorStop(0, 'rgba(255,190,80,0)');
      g.addColorStop(1, 'rgba(255,220,120,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(b.x - 30, GY); ctx.quadraticCurveTo(b.x, GY - b.h * 2, b.x + 30, GY); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,245,210,0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(b.x - 26, GY); ctx.quadraticCurveTo(b.x, GY - b.h * 1.8, b.x + 26, GY); ctx.stroke();
    }
  }
}

function drawParticles() {
  for (const q of particles) {
    const a = clamp(q.life / q.max, 0, 1);
    if (q.kind === 'spark') {
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    } else if (q.kind === 'smoke') {
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = q.color;
      fillCircle(q.x, q.y, q.size * (1.6 - a * 0.6));
    } else if (q.kind === 'ring') {
      ctx.globalAlpha = a;
      ctx.strokeStyle = q.color;
      ctx.lineWidth = 3 * a + 1;
      ctx.beginPath(); ctx.arc(q.x, q.y, lerp(q.r1, q.r0, a), 0, Math.PI * 2); ctx.stroke();
    } else if (q.kind === 'flash') {
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = q.color;
      fillCircle(q.x, q.y, q.r * (1.3 - a * 0.3));
    } else if (q.kind === 'streak') {
      ctx.globalAlpha = a * 0.6;
      ctx.strokeStyle = q.color;
      ctx.lineWidth = q.size;
      seg(q.x, q.y, q.x - q.vx * 0.05, q.y);
    }
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of texts) {
    ctx.globalAlpha = clamp((t.life / t.max) * 1.5, 0, 1);
    ctx.font = `800 ${t.size}px ${FONT}`;
    outlined(t.text, t.x, t.y, t.color, 3.5);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------
//  HUD – życie, umiejętności, dystans, kredyty
// ---------------------------------------------------------------------
function abilityRow(y, key, label, frac, color) {
  const ready = frac >= 1;
  ctx.textAlign = 'left';
  ctx.font = `800 11px ${FONT}`;
  outlined(`[${key}] ${label}`, 24, y + 6.5, ready ? '#ffffff' : '#8a97a8', 3);
  drawBar(112, y + 1, 150, 11, frac, ready ? color : rgba(color, 0.45), 'rgba(20,30,50,0.85)');
  if (ready) {
    ctx.textAlign = 'center';
    ctx.font = `800 9px ${FONT}`;
    outlined('GOTOWE', 187, y + 7, '#ffffff', 2.5);
  }
}

function drawHUD() {
  const p = player, U = stats.U;
  ctx.save();
  ctx.textBaseline = 'middle';

  // czerwona winieta przy obrażeniach / niskim życiu
  const low = p.hp / stats.maxHp < 0.25 && !p.dead ? 0.18 + 0.12 * Math.sin(time * 6) : 0;
  const vig = Math.max(low, p.hurtFlash > 0 ? p.hurtFlash * 1.6 : 0);
  if (vig > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(255,0,0,${vig})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // --- lewy panel ---
  const hasShield = stats.maxShield > 0;
  const ph = hasShield ? 98 : 86;
  ctx.fillStyle = 'rgba(5,8,18,0.55)';
  roundRect(12, 12, 262, ph, 12); ctx.fill();
  ctx.textAlign = 'left';
  ctx.font = `800 11px ${FONT}`;
  outlined(`${U.name.toUpperCase()} · ${U.role.toUpperCase()}`, 24, 24, paintColor() === '#25252d' ? '#cfd6e2' : paintColor(), 3);
  drawBar(24, 32, 238, 16, p.hp / stats.maxHp, '#ff4d5e', 'rgba(120,20,35,0.85)');
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = 'center';
  outlined(`${Math.ceil(p.hp)} / ${Math.round(stats.maxHp)}`, 143, 40.5, '#ffffff', 3);
  let y = 54;
  if (hasShield) {
    drawBar(24, y, 238, 7, p.shield / stats.maxShield, '#5ec8ff', 'rgba(20,50,80,0.85)');
    y += 12;
  }
  abilityRow(y, 'K', U.skill.short, 1 - Math.max(0, p.skillCd) / stats.skillCd, '#ffb347');
  abilityRow(y + 18, '1', U.powers[0].short, 1 - Math.max(0, p.specialCd) / stats.specialCd, '#9fd8ff');

  // --- aktywne bonusy ---
  let px = 30;
  const py = 12 + ph + 26;
  ctx.textAlign = 'center';
  for (const k in run.power) {
    const left = run.power[k];
    if (left <= 0) continue;
    const d = POWERUPS[k];
    ctx.fillStyle = 'rgba(5,8,18,0.6)';
    fillCircle(px, py, 17);
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, left / d.duration)); ctx.stroke();
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(d.icon, px, py + 1);
    px += 44;
  }
  if (p.cloakT > 0) {
    ctx.textAlign = 'left';
    ctx.font = `800 13px ${FONT}`;
    outlined(`NIEWIDZIALNY ${p.cloakT.toFixed(1)} s`, px - 10, py, '#bfe6ff', 3);
  }

  // --- prawa strona ---
  ctx.textAlign = 'right';
  ctx.font = `30px ${FONT_TITLE}`;
  outlined(`${fmt(run.meters)} m`, W - 22, 36, '#ffffff', 5);
  ctx.font = `800 20px ${FONT}`;
  const ct = fmt(run.credits);
  outlined(ct, W - 22, 68, '#ffd23f', 4);
  drawCoin(W - 36 - ctx.measureText(ct).width, 68, time, 8);
  ctx.font = `600 13px ${FONT}`;
  outlined(`Rekord: ${fmt(save.best)} m`, W - 22, 92, 'rgba(255,255,255,0.85)', 3);
  if (run.combo >= 2 && run.comboT > 0) {
    ctx.font = `24px ${FONT_TITLE}`;
    outlined(`COMBO x${run.combo}`, W - 22, 124, '#ffe81f', 5);
  }

  // --- boss ---
  if (boss) {
    const bw = 420, bx = (W - bw) / 2;
    ctx.textAlign = 'center';
    ctx.font = `16px ${FONT_TITLE}`;
    outlined(boss.name, W / 2, 22, '#ffb8a8', 4);
    drawBar(bx, 34, bw, 14, boss.hp / boss.maxHp, '#ff3b30', 'rgba(60,10,10,0.85)');
  }

  // --- baner (nowa planeta, boss) ---
  if (run.banner) {
    const b = run.banner;
    ctx.globalAlpha = clamp(Math.min(b.t / 0.5, (b.max - b.t) / 0.3), 0, 1);
    ctx.textAlign = 'center';
    ctx.font = `44px ${FONT_TITLE}`;
    outlined(b.title, W / 2, 170, b.color, 7);
    ctx.font = `700 20px ${FONT}`;
    outlined(b.sub, W / 2, 212, '#ffffff', 4);
    ctx.globalAlpha = 1;
  }

  if (save.muted) {
    ctx.textAlign = 'right';
    ctx.font = `600 13px ${FONT}`;
    outlined('🔇 dźwięk wyłączony (M)', W - 14, H - 16, '#ffffff', 3);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Podgląd jednostki na ekranie wyboru (małe płótno w karcie)
// ---------------------------------------------------------------------
function drawUnitPreview(cv, id, t) {
  const c = cv.getContext('2d');
  const saved = ctx;
  ctx = c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  const k = cv.width / 110;
  c.setTransform(k, 0, 0, k, 0, 0);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  fillEllipse(55, 112, 30, 5);
  const shooting = Math.sin(t * 2) > 0.3;
  const shot = shooting && Math.sin(t * 30) > 0.3;
  drawUnit(id, 50, 111, {
    dir: 1, aim: Math.sin(t * 1.3) * 0.12, anim: t * 7, onGround: true, moving: !shooting,
    muzzle: shot, recoil: shot ? 1 : 0, spin: shooting ? 1 : 0, charge: (t * 1.5) % 1,
    paint: paintColor(), spinPhase: t * (shooting ? 40 : 4),
  });
  ctx = saved;
}

// ---------------------------------------------------------------------
//  Główne rysowanie klatki
// ---------------------------------------------------------------------
function renderAttract(pal) {
  drawBackground(attract.x, pal);
  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, GY, W, H - GY);
  ctx.fillStyle = pal.top;
  ctx.fillRect(0, GY, W, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, GY + 8, W, 3);
  drawUnit(save.unit, 250, GY, { dir: 1, anim: attract.anim, onGround: true, moving: true, paint: paintColor(), spinPhase: time * 20 });
  drawAmbient(pal, attract.x);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, 0, W, H);
}

function render() {
  ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, 0, 0);
  const pal = palette();
  if (!run || state === 'menu' || state === 'shop' || state === 'select') {
    renderAttract(pal);
    return;
  }
  drawBackground(cam.x, pal);
  const sx = cam.shake ? rand(-1, 1) * cam.shake : 0;
  const sy = cam.shake ? rand(-1, 1) * cam.shake : 0;
  ctx.save();
  ctx.translate(Math.round(-cam.x + sx), Math.round(sy));
  drawPlatforms(pal);
  drawHints();
  drawCoins();
  drawPowerups();
  drawAllies();
  for (const e of enemies) if (!e.dead) drawEnemy(e);
  if (boss) drawBoss(boss);
  if (!player.dead) drawPlayer();
  drawBarriers();
  drawBullets();
  drawParticles();
  drawTexts();
  ctx.restore();
  drawAmbient(pal, cam.x);
  drawHUD();
}
