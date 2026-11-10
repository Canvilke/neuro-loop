/* Headless smoke test for the Neuro-Loop client bundle.
 *
 * Stubs a 2d canvas context with a no-op Proxy so every draw call is exercised
 * without a browser. It cannot judge how anything looks — it only proves the
 * render pipeline runs without throwing.
 *
 *   node test/smoke.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ── canvas stub ─────────────────────────────────────────────────────────── */

const arcLog = [];
function makeCtx() {
  const target = { canvas: null };
  const handler = {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return function () {
          var a = Array.prototype.slice.call(arguments);
          for (var i = 0; i < a.length; i++) {
            if (typeof a[i] === 'number' && !isFinite(a[i])) {
              throw new Error(prop + ' received non-finite: [' + a.join(', ') + ']');
            }
          }
          return { addColorStop: function () {} };
        };
      }
      if (prop === 'createPattern' || prop === 'createConicGradient') {
        return () => ({ addColorStop() {} });
      }
      if (prop === 'arc') return function (x, y) { if (arcLog.length < 40000) arcLog.push([x, y]); };
      if (prop === 'getImageData') return () => ({ data: [] });
      return () => {};
    },
    set(t, prop, v) { t[prop] = v; return true; }
  };
  return new Proxy(target, handler);
}

let canvasCount = 0;
function makeCanvas() {
  canvasCount++;
  return {
    width: 300, height: 150,
    style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    _h: {},
    addEventListener(t, f) { this._h[t] = f; },
    removeEventListener(t) { delete this._h[t]; },
    fire(t, ev) { if (this._h[t]) this._h[t](ev); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 760 }; },
    _ctx: null,
    getContext() {
      if (!this._ctx) this._ctx = makeCtx();
      return this._ctx;
    }
  };
}

/* ── dom stubs ───────────────────────────────────────────────────────────── */

const rafQueue = [];
let now = 0;

global.window = {
  devicePixelRatio: 1.5,
  innerHeight: 800,
  innerWidth: 1280,
  _h: {},
  addEventListener(t, f) { this._h[t] = f; },
  removeEventListener(t) { delete this._h[t]; },
  fire(t, ev) { if (this._h[t]) this._h[t](ev); },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
    setItem(k, v) { this._d[k] = String(v); }
  },
  __ModuleLoader__: { load(def) { global.window.__plugin = def; } }
};

global.document = {
  hidden: false,
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return { style: {}, classList: { toggle() {} }, appendChild() {} };
  }
};

global.performance = { now: () => now };
global.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
global.cancelAnimationFrame = () => {};
global.ResizeObserver = class {
  constructor(cb) { global.__roCb = cb; }
  observe() {}
  disconnect() {}
};

/* ── react stub ──────────────────────────────────────────────────────────── */

const effects = [];
const React = {
  createElement(type, props) {
    const kids = Array.prototype.slice.call(arguments, 2);
    return { type, props: Object.assign({}, props, { children: kids }) };
  },
  useRef(v) { return { current: v }; },
  useEffect(fn) { effects.push(fn); },
  useState(v) { return [v, function () {}]; }
};

/* ── load the bundle ─────────────────────────────────────────────────────── */

const file = path.join(__dirname, '..', 'client.js');
vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });

const def = global.window.__plugin;
if (!def) throw new Error('bundle did not call __ModuleLoader__.load');
if (def.id !== '@local/neuro-loop') throw new Error('wrong id ' + def.id);

const mod = def.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});

const registrations = [];
const ctx = {
  slots: {
    inject(name, fn) { fn(); },
    register(reg, comp) { registrations.push({ reg, comp }); return () => {}; }
  }
};

mod.apply(ctx);
if (registrations.length !== 9) throw new Error('expected 9 registrations, got ' + registrations.length);
if (!registrations.filter((r) => r.reg.key === 'neuro-loop-code').length) throw new Error('code panel not registered');
if (!registrations.filter((r) => r.reg.key === 'neuro-loop-today').length) throw new Error('today panel not registered');
if (!registrations.filter((r) => r.reg.id === 'neuro-loop-code').length) throw new Error('code sidebar entry not registered');
if (!registrations.filter((r) => r.reg.name === 'shell.overlay').length) throw new Error('boot overlay not registered');

const main = registrations.filter((r) => r.reg.name === 'main')[0];
const side = registrations.filter((r) => r.reg.name === 'sidebar.panellist')[0];
if (!main || main.reg.key !== 'neuro-loop') throw new Error('main registration missing');
if (!side) throw new Error('sidebar registration missing');

/* sidebar icon */
const icon = side.comp({ size: 18 });
if (!icon || icon.type !== 'svg') throw new Error('icon did not return an svg');

/* panel: walk the element tree, bind refs, then run effects */
const tree = main.comp({});
function bind(el) {
  if (!el || typeof el !== 'object') return;
  const ref = el.props && el.props.ref;
  if (ref && typeof ref === 'object') {
    ref.current = el.type === 'canvas' ? makeCanvas() : {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 760 }),
      classList: { toggle() {}, remove() {} },
      addEventListener() {}, removeEventListener() {}
    };
  }
  const kids = (el.props && el.props.children) || [];
  kids.forEach(bind);
}
bind(tree);
if (tree.type !== 'div') throw new Error('panel root is not a div');

effects.forEach((fn) => {
  const cleanup = fn();
  if (typeof cleanup === 'function') global.__cleanup = cleanup;
});

/* pump frames */
let frames = 0;
function pump(n) {
  for (let i = 0; i < n; i++) {
    const cb = rafQueue.shift();
    if (!cb) break;
    now += 16.7;
    cb(now);
    frames++;
  }
}
pump(6);
pump(60);
pump(120);

if (global.window.__NL_ERR) { console.log("ERR>>\n" + global.window.__NL_ERR); }
if (frames < 100) throw new Error('animation loop stalled after ' + frames + ' frames');
if (typeof global.__cleanup !== 'function') throw new Error('mount did not return a cleanup');

/* ── interaction sweep: hover / click everything on a grid ───────────────── */
const cv = tree.props.children.filter((c) => c && c.type === 'canvas')[0];
const cref = cv.props.ref.current;
let hits = 0;
for (let gy = 1; gy < 14; gy++) {
  for (let gx = 1; gx < 22; gx++) {
    const x = Math.round(1280 * gx / 22);
    const y = Math.round(760 * gy / 14);
    cref.fire('pointermove', { clientX: x, clientY: y });
    if ((gx + gy) % 5 === 0) hits++;
    pump(1);
  }
}
for (let gy = 1; gy < 14; gy++) {
  for (let gx = 1; gx < 22; gx += 2) {
    const x = Math.round(1280 * gx / 22);
    const y = Math.round(760 * gy / 14);
    cref.fire('pointerdown', { clientX: x, clientY: y, button: 0 });
    pump(1);
  }
}
cref.fire('pointerleave', {});
pump(20);

/* ── resize ─────────────────────────────────────────────────────────────── */
if (global.__roCb) global.__roCb([{ contentRect: { width: 900, height: 620 } }]);
pump(20);

/* ── keyboard ───────────────────────────────────────────────────────────── */
global.window.fire('keydown', { key: 'Escape' });
pump(10);

global.__cleanup();

/* the knowledge field must actually be painted: arcs must reach the right half */
const maxArcX = arcLog.reduce((m, q) => Math.max(m, q[0]), 0);
if (!(maxArcX > 600)) throw new Error('knowledge field not painted: max arc x = ' + maxArcX.toFixed(1));
console.log('field extent ok, arcs=' + arcLog.length + ' maxx=' + maxArcX.toFixed(0));

/* the ring-cavity instrument must actually be painted (144 ticks + dial arcs) */
const iCx = 0.170 * 900, iCy = 0.492 * 620;
const dialArcs = arcLog.filter((q) => Math.abs(q[0] - iCx) < 100 && Math.abs(q[1] - iCy) < 100);
if (!(dialArcs.length > 200)) throw new Error('instrument not painted: ring-cavity arcs = ' + dialArcs.length);
console.log('instrument ok, ring-cavity arcs=' + dialArcs.length + ' center=' + iCx.toFixed(0) + ',' + iCy.toFixed(0));
console.log('smoke ok — %d frames, %d canvases, %d registrations, %d sweep points, store=%s',
  frames, canvasCount, registrations.length, hits,
  Object.keys(global.window.localStorage._d).length);
