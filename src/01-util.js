/* ────────────────────────────────────────────────────────────────────────────
 * 01 · util — math, colour, tiny helpers
 * ──────────────────────────────────────────────────────────────────────────── */

var TAU = Math.PI * 2;
var DEG = Math.PI / 180;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  var t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
function approach(cur, target, rate, dt) {
  /* two call styles are used across the bundle:
   *   approach(cur, target, 0.2)        -> move 20% of the way
   *   approach(cur, target, 8, dtSec)   -> exponential ease at 8/s           */
  var k = dt === undefined ? rate : rate * dt;
  return cur + (target - cur) * clamp(k, 0, 1);
}

/* deterministic rng (mulberry32) */
function makeRng(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* colour ---------------------------------------------------------------- */
/* accepts '#rgb' | '#rrggbb' | 'rgb(r,g,b)' */
function toRgb(col) {
  if (col.charAt(0) === '#') {
    var s = col.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var m = col.match(/(\d+)\D+(\d+)\D+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [200, 220, 255];
}
function hexRgb(col) { return toRgb(col); }
function rgba(hex, a) {
  var c = toRgb(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}
/* mix toward white (t>0) or black (t<0) */
function shade(hex, t) {
  var c = toRgb(hex);
  var to = t > 0 ? 255 : 0, k = Math.abs(t);
  return 'rgb(' + Math.round(lerp(c[0], to, k)) + ',' +
    Math.round(lerp(c[1], to, k)) + ',' +
    Math.round(lerp(c[2], to, k)) + ')';
}
function rgbaMix(hex, white, a) {
  var c = hexRgb(hex);
  var r = Math.round(lerp(c[0], 255, white));
  var g = Math.round(lerp(c[1], 255, white));
  var b = Math.round(lerp(c[2], 255, white));
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

/* text ------------------------------------------------------------------ */
var FONT_STACK = '"Inter","Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
var MONO_STACK = '"JetBrains Mono","SFMono-Regular",Consolas,"Courier New",monospace';

function font(size, weight) {
  return (weight || 400) + ' ' + size + 'px ' + FONT_STACK;
}
function mono(size, weight) {
  return (weight || 400) + ' ' + size + 'px ' + MONO_STACK;
}
/* letterSpacing is Chromium 99+; degrade silently */
function tracked(ctx, px) {
  try { ctx.letterSpacing = px + 'px'; } catch (e) { /* noop */ }
}

function wrapLines(ctx, text, maxW) {
  var out = [], line = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    var test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line); line = ch;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/* misc ------------------------------------------------------------------ */
function nearest(list, x, y, maxD, posFn) {
  var best = null, bestD = maxD * maxD;
  for (var i = 0; i < list.length; i++) {
    var p = posFn(list[i]);
    var dx = p.x - x, dy = p.y - y, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = list[i]; }
  }
  return best;
}

function makeCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
