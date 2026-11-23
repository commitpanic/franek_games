'use strict';
// =====================================================================
//  GWIEZDNY ODDZIAŁ – drobne funkcje pomocnicze
// =====================================================================

const W = CONFIG.width;
const H = CONFIG.height;
const GY = CONFIG.groundY;

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const easeOut = t => 1 - Math.pow(1 - t, 3);

// losowanie z wagami: [[coś, waga], [coś, waga], ...]
function pickWeighted(entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = Math.random() * total;
  for (const [item, w] of entries) {
    r -= w;
    if (r <= 0) return item;
  }
  return entries[entries.length - 1][0];
}

// "losowa", ale zawsze taka sama liczba 0..1 dla danego i (do tła)
function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// czy dwa prostokąty {x, y, w, h} na siebie nachodzą
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const _rgbCache = {};
function hexRgb(hex) {
  let c = _rgbCache[hex];
  if (!c) {
    const n = parseInt(hex.slice(1, 7), 16);
    c = _rgbCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return c;
}
function rgba(hex, a = 1) {
  const c = hexRgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
// mieszanie dwóch kolorów (t = 0 → a, t = 1 → b)
function mix(a, b, t, alpha = 1) {
  const A = hexRgb(a), B = hexRgb(b);
  t = clamp(t, 0, 1);
  return `rgba(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)},${alpha})`;
}

// rozjaśnienie (amt > 0) albo przyciemnienie (amt < 0) koloru
function shade(hex, amt) {
  return amt >= 0 ? mix(hex, '#ffffff', amt) : mix(hex, '#000000', -amt);
}

function fmt(n) {
  return Math.floor(n).toLocaleString('pl-PL');
}
