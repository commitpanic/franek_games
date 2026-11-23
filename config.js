'use strict';
// =====================================================================
//  GWIEZDNY ODDZIAŁ – USTAWIENIA GRY
//  Tutaj łatwo zmienisz balans: jednostki, broń, ceny ulepszeń,
//  wrogów, planety i klawisze. Po zmianie odśwież stronę (F5).
// =====================================================================

const CONFIG = {
  width: 960,
  height: 540,
  groundY: 440,          // wysokość ziemi (piksele od góry ekranu)
  pxPerMeter: 30,        // ile pikseli to 1 metr dystansu
  gravity: 2300,
  jumpCut: 430,          // krótkie stuknięcie skoku = niższy skok
  accelGround: 2600,     // jak szybko postać rusza i hamuje na ziemi
  accelAir: 1500,        // ...i w powietrzu
  bossFirst: 600,        // pierwszy boss po tylu metrach
  bossEvery: 700,        // kolejny boss tyle metrów po pokonaniu poprzedniego
  enemyHpGrowth: 0.35,   // +35% życia wrogów na każde 1000 m
  enemyDamageGrowth: 0.2,// +20% obrażeń wrogów na każde 1000 m
  creditsPer10m: 1,      // bonus kredytów za każde 10 m dystansu
  healDropChance: 0.06,  // szansa, że wróg upuści apteczkę
  stompDamage: 35,       // obrażenia za wskoczenie wrogowi na głowę
  magnetRadius: 70,      // z jakiej odległości przyciągasz kredyty

  boss: { hp: 600, hpGrowth: 0.7, credits: 150, creditsGrowth: 100 },
};

// ---------------------------------------------------------------------
//  KLAWISZE (kody klawiszy: https://developer.mozilla.org/docs/Web/API/KeyboardEvent/code)
//  Mysz: lewy przycisk = strzał (celujesz kursorem), prawy = umiejętność.
// ---------------------------------------------------------------------
const KEYS = {
  left:    ['KeyA', 'ArrowLeft'],
  right:   ['KeyD', 'ArrowRight'],
  jump:    ['Space', 'KeyW', 'ArrowUp'],
  duck:    ['KeyS', 'ArrowDown'],
  shoot:   ['KeyJ', 'KeyX'],
  skill:   ['KeyK', 'KeyE', 'KeyC'],
  power1:  ['Digit1', 'Numpad1', 'KeyL', 'KeyQ', 'KeyV', 'ShiftLeft', 'ShiftRight'],
  power2:  ['Digit2', 'Numpad2', 'KeyI', 'KeyR'],
  power3:  ['Digit3', 'Numpad3', 'KeyO', 'KeyF'],
  pause:   ['KeyP', 'Escape'],
  mute:    ['KeyM'],
};

// ---------------------------------------------------------------------
//  JEDNOSTKI
//  hp = życie, speed = szybkość chodzenia, jump = siła skoku,
//  jumps = ile skoków (2 = podwójny), armor = ile obrażeń blokuje pancerz,
//  bars = paski na ekranie wyboru (0–5).
//  skill = umiejętność [K], powers = trzy moce specjalne [1] [2] [3].
//  cooldown = ile sekund trzeba czekać, duration = ile trwa, dmg = obrażenia.
// ---------------------------------------------------------------------
const UNITS = {
  light: {
    name: 'Zwiadowca', role: 'Lekka',
    desc: 'Najszybszy w oddziale. Podwójny skok od samego startu.',
    hp: 80, speed: 320, jump: 900, jumps: 2, armor: 0, w: 24, h: 60, magnet: 0,
    weapon: { name: 'Pistolet blasterowy', dmg: 7, cooldown: 0.14, speed: 1100, spread: 0.04, color: '#7dff6a', sound: 'pistol' },
    skill:  { name: 'Zryw z wibroostrzem', short: 'ZRYW', icon: '💨', desc: 'zryw z cięciem, chwilowa nietykalność', cooldown: 2.5, dmg: 30 },
    powers: [
      { id: 'cloak',     name: 'Maskowanie',     short: 'MASKA', icon: '👻', desc: 'niewidzialność – wrogowie nie strzelają, ty bijesz 2× mocniej', cooldown: 16, duration: 5 },
      { id: 'fan',       name: 'Seria z biodra', short: 'SERIA', icon: '🎯', desc: '12 błyskawicznych strzałów, które same trafiają we wrogów', cooldown: 9, shots: 12, dmgMult: 1.6 },
      { id: 'airstrike', name: 'Nalot',          short: 'NALOT', icon: '✈️', desc: 'myśliwiec zrzuca bomby na cały ekran', cooldown: 28, dmg: 80, bombs: 8 },
    ],
    bars: { hp: 2, speed: 5, power: 2, armor: 1 },
  },
  medium: {
    name: 'Żołnierz', role: 'Średnia',
    desc: 'Wszechstronny – dobry na każdą sytuację.',
    hp: 120, speed: 260, jump: 870, jumps: 1, armor: 0.1, w: 26, h: 62, magnet: 0,
    weapon: { name: 'Karabin blasterowy', dmg: 12, cooldown: 0.2, speed: 1250, spread: 0.015, color: '#ff8a3d', sound: 'rifle' },
    skill:  { name: 'Granat termiczny', short: 'GRANAT', icon: '💣', desc: 'granat, który rani wszystkich wokół', cooldown: 3.5, dmg: 60, radius: 95 },
    powers: [
      { id: 'stim',      name: 'Stymulant bojowy',     short: 'STYM',    icon: '💉', desc: 'leczy 35% życia i podwaja szybkostrzelność', cooldown: 18, duration: 6 },
      { id: 'reinforce', name: 'Posiłki',              short: 'POSIŁKI', icon: '🪖', desc: 'dwóch żołnierzy z oddziału walczy u twego boku', cooldown: 25, duration: 15, dmg: 10 },
      { id: 'artillery', name: 'Ostrzał artyleryjski', short: 'OSTRZAŁ', icon: '☄️', desc: '10 pocisków spada z nieba prosto na wrogów', cooldown: 30, dmg: 70, shells: 10 },
    ],
    bars: { hp: 3, speed: 3, power: 3, armor: 2 },
  },
  heavy: {
    name: 'Ciężkozbrojny', role: 'Ciężka',
    desc: 'Wolny, ale bardzo wytrzymały. Pancerz blokuje 30% obrażeń.',
    hp: 180, speed: 210, jump: 820, jumps: 1, armor: 0.3, w: 32, h: 68, magnet: 0,
    weapon: { name: 'Działko obrotowe', dmg: 8, cooldown: 0.085, speed: 1050, spread: 0.09, color: '#ffd23f', sound: 'minigun', spinUp: 0.7 },
    skill:  { name: 'Wyrzutnia rakiet', short: 'RAKIETA', icon: '🚀', desc: 'rakieta z potężnym wybuchem', cooldown: 3, dmg: 90, radius: 90 },
    powers: [
      { id: 'barrier',   name: 'Bariera energetyczna', short: 'BARIERA', icon: '🛡️', desc: 'ściana energii zatrzymuje wrogie strzały', cooldown: 15, duration: 7 },
      { id: 'slam',      name: 'Fala uderzeniowa',     short: 'FALA',    icon: '💥', desc: 'uderzenie w ziemię – fale rozrzucają i ogłuszają wrogów', cooldown: 9, dmg: 50 },
      { id: 'overdrive', name: 'Szał ognia',           short: 'SZAŁ',    icon: '🔥', desc: 'strzelasz 2× szybciej i mocniej, dostajesz o połowę mniej', cooldown: 28, duration: 6 },
    ],
    bars: { hp: 5, speed: 1, power: 4, armor: 5 },
  },
  specialist: {
    name: 'Technik', role: 'Specjalista',
    desc: 'Dron zbiera kredyty z daleka. Strzały jonowe przebijają wrogów i niszczą maszyny.',
    hp: 100, speed: 250, jump: 870, jumps: 1, armor: 0.1, w: 26, h: 62, magnet: 90,
    weapon: { name: 'Karabin jonowy', dmg: 20, cooldown: 0.42, speed: 1400, spread: 0, color: '#5ad8ff', sound: 'ion', pierce: 3, machineBonus: 1.5 },
    skill:  { name: 'Wieżyczka bojowa', short: 'WIEŻA', icon: '🛠️', desc: 'wieżyczka sama strzela przez 12 s', cooldown: 10, dmg: 8, duration: 12 },
    powers: [
      { id: 'emp',     name: 'Impuls EMP',       short: 'EMP',   icon: '⚡', desc: 'ogłusza wrogów na ekranie i niszczy ich pociski', cooldown: 16, duration: 3, dmg: 30 },
      { id: 'drone',   name: 'Dron bojowy',      short: 'DRON',  icon: '🛸', desc: 'twój dron sam strzela do wrogów przez 10 s', cooldown: 18, duration: 10, dmg: 9 },
      { id: 'orbital', name: 'Działo orbitalne', short: 'LASER', icon: '🛰️', desc: 'promień z orbity sunie po ziemi i spala wrogów', cooldown: 32, duration: 3, dmg: 160 },
    ],
    bars: { hp: 3, speed: 3, power: 3, armor: 2 },
  },
};
const UNIT_ORDER = ['light', 'medium', 'heavy', 'specialist'];

// ---------------------------------------------------------------------
//  ULEPSZENIA W SKLEPIE (działają na każdą jednostkę)
//  cost = cena 1. poziomu, growth = o ile drożeje każdy kolejny poziom,
//  per = ile daje jeden poziom, stat/fmt = co pokazać w sklepie.
// ---------------------------------------------------------------------
const UPGRADES = [
  { id: 'hp',         icon: '❤️', name: 'Wytrzymałość',         desc: '+15% maksymalnego zdrowia.',                    max: 10, cost: 40,  growth: 1.45, per: 0.15, stat: 'maxHp',     fmt: v => Math.round(v) + ' HP' },
  { id: 'armor',      icon: '🦺', name: 'Pancerz',               desc: 'Mniej obrażeń od każdego trafienia.',           max: 6,  cost: 80,  growth: 1.55, per: 0.05, stat: 'armor',     fmt: v => '-' + Math.round(v * 100) + '% obrażeń' },
  { id: 'shield',     icon: '🛡️', name: 'Tarcza energetyczna',  desc: 'Pochłania obrażenia i sama się odnawia.',       max: 8,  cost: 90,  growth: 1.5,  per: 15,   stat: 'maxShield', fmt: v => Math.round(v) + ' pkt' },
  { id: 'regen',      icon: '💉', name: 'Bacta',                 desc: 'Powoli leczy rany w trakcie walki.',            max: 5,  cost: 120, growth: 1.6,  per: 0.8,  stat: 'regen',     fmt: v => v.toFixed(1) + ' HP/s' },
  { id: 'speed',      icon: '👟', name: 'Serwomotory',           desc: 'Szybsze chodzenie.',                            max: 5,  cost: 70,  growth: 1.5,  per: 0.08, stat: 'speed',     fmt: v => Math.round(v) + ' px/s' },
  { id: 'weaponDmg',  icon: '🔫', name: 'Moc broni',             desc: 'Broń główna zadaje więcej obrażeń.',            max: 10, cost: 50,  growth: 1.45, per: 0.2,  stat: 'weaponDmg', fmt: v => v.toFixed(1) + ' obr.' },
  { id: 'fireRate',   icon: '⚡', name: 'Szybkostrzelność',      desc: 'Broń główna strzela szybciej.',                 max: 8,  cost: 60,  growth: 1.5,  per: 0.08, stat: 'fireRate',  fmt: v => v.toFixed(1) + ' strz./s' },
  { id: 'multishot',  icon: '🎯', name: 'Dodatkowe lufy',        desc: 'Kilka pocisków naraz – w wachlarzu.',           max: 3,  cost: 300, growth: 2.2,  per: 1,    stat: 'shots',     fmt: v => v + (v === 1 ? ' pocisk' : ' pociski') },
  { id: 'skill',      icon: '💥', name: 'Trening umiejętności',  desc: 'Umiejętność [K] mocniejsza i szybciej gotowa.', max: 8,  cost: 80,  growth: 1.5,  per: 0.25, stat: 'skillDmg',  fmt: v => Math.round(v) + ' obr.' },
  { id: 'special',    icon: '🌀', name: 'Moce specjalne',        desc: 'Moce [1] [2] [3] są silniejsze, trwają dłużej i szybciej się odnawiają.', max: 6, cost: 120, growth: 1.55, per: 0.15, stat: 'specialMult', fmt: v => '+' + Math.round((v - 1) * 100) + '% siły' },
  { id: 'doubleJump', icon: '🚀', name: 'Plecak odrzutowy',      desc: 'Dodatkowy skok w powietrzu.',                   max: 2,  cost: 250, growth: 2.5,  per: 1,    stat: 'jumps',     fmt: v => (v === 1 ? '1 skok' : v + ' skoki') },
  { id: 'magnet',     icon: '🧲', name: 'Magnes',                desc: 'Przyciąga kredyty z daleka.',                   max: 6,  cost: 60,  growth: 1.45, per: 35,   stat: 'magnet',    fmt: v => Math.round(v) + ' px' },
  { id: 'luck',       icon: '💰', name: 'Łowca nagród',          desc: 'Zdobywasz więcej kredytów.',                    max: 8,  cost: 100, growth: 1.5,  per: 0.15, stat: 'creditMult', fmt: v => '+' + Math.round((v - 1) * 100) + '%' },
];

// ---------------------------------------------------------------------
//  BARWY PANCERZA (kolor naramienników, hełmu i pasków)
// ---------------------------------------------------------------------
const PAINTS = [
  { id: 'red',    name: 'Czerwone',   color: '#d9483b', cost: 0,    desc: 'Barwy ruchu oporu.' },
  { id: 'blue',   name: 'Niebieskie', color: '#3f86e0', cost: 100,  desc: 'Barwy eskadry pilotów.' },
  { id: 'green',  name: 'Zielone',    color: '#4caf50', cost: 200,  desc: 'Kamuflaż leśny.' },
  { id: 'sand',   name: 'Pustynne',   color: '#d9a55a', cost: 300,  desc: 'Kamuflaż pustynny.' },
  { id: 'snow',   name: 'Zimowe',     color: '#e8eef5', cost: 500,  desc: 'Kamuflaż śnieżny.' },
  { id: 'purple', name: 'Fioletowe',  color: '#9b5de5', cost: 700,  desc: 'Barwy gwardii honorowej.' },
  { id: 'black',  name: 'Czarne',     color: '#25252d', cost: 900,  desc: 'Barwy oddziałów specjalnych.' },
  { id: 'gold',   name: 'Złote',      color: '#ffc83d', cost: 1500, desc: 'Dla prawdziwych bohaterów.' },
];

// ---------------------------------------------------------------------
//  WROGOWIE  (from = od którego metra się pojawiają, keep = z jakiej
//  odległości lubią strzelać, machine = maszyna – broń jonowa robi więcej)
// ---------------------------------------------------------------------
const ENEMIES = {
  crate:   { name: 'Skrzynia',         hp: 15,  w: 38, h: 38, credits: 4,  contact: 0,  from: 0 },
  trooper: { name: 'Szturmowiec',      hp: 30,  w: 28, h: 66, credits: 6,  contact: 15, from: 0,    walk: 60,  keep: 260, fireEvery: [1.8, 2.8], bolt: { dmg: 12, speed: 380 } },
  droid:   { name: 'Droid bojowy',     hp: 22,  w: 24, h: 64, credits: 5,  contact: 12, from: 200,  walk: 100, keep: 140, fireEvery: [1.3, 2.0], bolt: { dmg: 8,  speed: 420 }, machine: true },
  probe:   { name: 'Droid zwiadowczy', hp: 26,  w: 34, h: 36, credits: 8,  contact: 12, from: 450,  fireEvery: [1.6, 2.4], bolt: { dmg: 10, speed: 360 }, machine: true },
  turret:  { name: 'Wieżyczka',        hp: 55,  w: 42, h: 38, credits: 12, contact: 15, from: 900,  fireEvery: [2.4, 3.2], bolt: { dmg: 9,  speed: 440 }, machine: true },
  heavy:   { name: 'Ciężki droid',     hp: 140, w: 48, h: 84, credits: 25, contact: 25, from: 1500, walk: 40,  keep: 300, fireEvery: [2.2, 3.0], bolt: { dmg: 14, speed: 360 }, machine: true },
};
// jak często pojawia się dany wróg (wieżyczki stoją tylko na latających platformach)
const ENEMY_WEIGHTS = { crate: 3, trooper: 4, droid: 4, probe: 3, heavy: 1.5 };

// ---------------------------------------------------------------------
//  BONUSY DO ZEBRANIA W TRAKCIE GRY
// ---------------------------------------------------------------------
const POWERUPS = {
  invincible: { name: 'Nietykalność',     icon: '🛡️', color: '#7fd4ff', duration: 6,  weight: 1 },
  rapid:      { name: 'Szybki ogień',     icon: '⚡', color: '#ffa53d', duration: 8,  weight: 1.2 },
  magnet:     { name: 'Supermagnes',      icon: '🧲', color: '#ffd23f', duration: 10, weight: 1.2 },
  double:     { name: 'Podwójne kredyty', icon: '💰', color: '#7dff6a', duration: 12, weight: 1 },
  heal:       { name: 'Apteczka',         icon: '❤️', color: '#ff5a7a', duration: 0,  weight: 1.3 },
};

// ---------------------------------------------------------------------
//  PLANETY – po pokonaniu bossa lecisz na kolejną
// ---------------------------------------------------------------------
const BIOMES = [
  { name: 'Pustynna planeta',    sky: ['#e9884a', '#ffd9a0'], far: '#c77a4c', near: '#a65c36', ground: '#c98f55', top: '#efc27f', pit: '#3a1d0e', ridge: 'smooth', deco: ['suns'],                ambient: 'dust' },
  { name: 'Leśny księżyc',       sky: ['#16302a', '#5f9a7a'], far: '#2b5442', near: '#1c3b2d', ground: '#4b3824', top: '#5fa04e', pit: '#0b1510', ridge: 'smooth', deco: ['stars', 'planet'],     ambient: 'fireflies', trees: true },
  { name: 'Lodowa planeta',      sky: ['#86b6dd', '#eaf5ff'], far: '#a9c6e2', near: '#7f9fbf', ground: '#a9c1d8', top: '#ffffff', pit: '#2b4868', ridge: 'jagged', deco: ['moon'],                ambient: 'snow' },
  { name: 'Wulkaniczna planeta', sky: ['#1a0707', '#7a230e'], far: '#3b1510', near: '#240b09', ground: '#2e2421', top: '#ff6a1f', pit: '#ff4a10', ridge: 'jagged', deco: ['stars', 'redplanet'],  ambient: 'embers' },
  { name: 'Stacja bojowa',       sky: ['#04050c', '#161b30'], far: '#262c3f', near: '#353c52', ground: '#555c70', top: '#a7b0c6', pit: '#05060c', ridge: 'blocky', deco: ['stars', 'blueplanet'], ambient: 'none' },
];
