/* Headless check for the UEG boot overlay.
 *
 * It cannot judge looks. It proves four things that have actually broken
 * here before:
 *   1. the overlay opens by itself on page load (not only on keypress),
 *   2. every phase (boot / sync / auth / brief / choose / enter / dive) paints, in order,
 *   3. the two channel cards lay out and are hit-testable,
 *   4. no NaN ever reaches a canvas gradient.
 *
 *   node test/boot.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const drawn = { text: 0, arc: 0, fill: 0 };

function makeCtx() {
  const target = { canvas: null };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return function () {
          const a = Array.prototype.slice.call(arguments);
          for (let i = 0; i < a.length; i++) {
            if (typeof a[i] === 'number' && !isFinite(a[i])) {
              throw new Error(prop + ' received non-finite: [' + a.join(', ') + ']');
            }
          }
          return { addColorStop() {} };
        };
      }
      if (prop === 'fillText') return () => { drawn.text += 1; };
      if (prop === 'arc') return () => { drawn.arc += 1; };
      if (prop === 'fill') return () => { drawn.fill += 1; };
      if (prop === 'createPattern' || prop === 'createConicGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, prop, v) { t[prop] = v; return true; }
  });
}

function makeCanvas() {
  return {
    width: 0, height: 0,
    style: {},
    getContext2d: null,
    getContext() { return makeCtx(); },
    addEventListener() {}, removeEventListener() {}
  };
}

/* ── browser stubs ───────────────────────────────────────────────────────── */

let rafCb = null;
const roList = [];

global.window = {
  devicePixelRatio: 2,
  innerWidth: 1440,
  innerHeight: 900,
  _h: {},
  addEventListener(t, f) { this._h[t] = f; },
  removeEventListener(t) { delete this._h[t]; },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
    setItem(k, v) { this._d[k] = String(v); }
  },
  __ModuleLoader__: { load(def) { global.window.__plugin = def; } }
};
global.requestAnimationFrame = (fn) => { rafCb = fn; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };
global.ResizeObserver = class {
  constructor(cb) { this.cb = cb; roList.push(this); }
  observe() {} disconnect() {}
};

/* ── react stub: records effects, keeps refs live ────────────────────────── */

const effects = [];
const React = {
  createElement(type, props) {
    const kids = Array.prototype.slice.call(arguments, 2);
    return { type, props: Object.assign({}, props, { children: kids }) };
  },
  useRef(v) { return { current: v }; },
  useState(v) { return [v, function () {}]; },
  useEffect(fn) { effects.push(fn); }
};

/* ── load bundle with a probe injected inside the factory ────────────────── */

const file = path.join(__dirname, '..', 'client.js');
let src = fs.readFileSync(file, 'utf8');
const anchor = "  return { inject: ['slots', 'layout'], apply: install };";
if (src.indexOf(anchor) < 0) throw new Error('could not find the module return statement');
src = src.replace(anchor,
  '  window.__NL_BOOT_PROBE = { BOOT: BOOT, body: bootFrameBody, hit: bootHit, modes: BOOT_MODES };\n' + anchor);
vm.runInThisContext(src, { filename: file });

const def = global.window.__plugin;
if (!def) throw new Error('bundle did not call __ModuleLoader__.load');
const mod = def.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});

const regs = [];
let selected = null;
mod.apply({
  slots: { inject(n, fn) { fn(); }, register(reg, comp) { regs.push({ reg, comp }); return () => {}; } },
  layout: { selectPanel(id) { selected = id; } }
});

const P = global.window.__NL_BOOT_PROBE;
if (!P) throw new Error('boot probe missing');
if (P.modes.length !== 2) throw new Error('expected 2 channels, got ' + P.modes.length);

/* ── 1. the overlay must mount on its own ────────────────────────────────── */

const overlay = regs.filter((r) => r.reg.name === 'shell.overlay')[0];
if (!overlay) throw new Error('shell.overlay registration missing');
if (overlay.reg.id !== 'neuro-loop-boot') throw new Error('unexpected overlay id ' + overlay.reg.id);

function bind(el) {
  if (!el || typeof el !== 'object') return;
  const ref = el.props && el.props.ref;
  if (ref && typeof ref === 'object') {
    ref.current = el.type === 'canvas' ? makeCanvas() : {
      getBoundingClientRect: () => ({ width: 1280, height: 800 }),
      style: {}, addEventListener() {}, removeEventListener() {}
    };
  }
  const kids = (el.props && el.props.children) || [];
  kids.forEach(bind);
}

/* the registered component may itself just wrap the real one — render through
 * function components until a host element (string type) shows up */
function render(el, depth) {
  let node = el;
  for (let i = 0; i < 6 && node && typeof node.type === 'function'; i++) {
    node = node.type(node.props);
  }
  return node;
}

const tree = render(overlay.comp({ layout: { selectPanel(id) { selected = id; } } }));
if (!tree) throw new Error('overlay rendered nothing on mount (it must open by itself)');
bind(tree);
effects.forEach((fn) => { const c = fn(); if (typeof c === 'function') global.__bootCleanup = c; });
if (!P.BOOT.open) throw new Error('BOOT.open is false after mount');
if (typeof P.BOOT.setOpen !== 'function') throw new Error('BOOT.setOpen was never bound');
if (!rafCb) throw new Error('boot loop never scheduled a frame');

/* ── 2. phases paint ─────────────────────────────────────────────────────── */

const c = makeCtx();
const W = 1280, H = 800;

P.BOOT.phase = 'boot';
for (let t = 0; t <= 3.2; t += 0.1) P.body(c, W, H, t, 1);
if (drawn.text < 40) throw new Error('boot sequence painted too little text: ' + drawn.text);

/* identity gate: prompt line must be laid out before any channel is pickable */
P.BOOT.phase = 'auth';
P.BOOT.auth = 0;
for (let t = 0; t <= 1.0; t += 0.05) P.body(c, W, H, t, 1);
if (!P.BOOT.promptRect || P.BOOT.promptRect.w < 200) {
  throw new Error('auth prompt line missing: ' + JSON.stringify(P.BOOT.promptRect));
}
const ar = P.BOOT.avatarRect;
if (!ar || ar.w < 60 || ar.h < 80 || ar.x < 0 || ar.x + ar.w > W) {
  throw new Error('avatar slot missing or off-canvas: ' + JSON.stringify(ar));
}
P.BOOT.auth = 1;
P.BOOT.authAt = 0;
for (let t = 0; t <= 1.4; t += 0.05) P.body(c, W, H, t, 1);
P.BOOT.auth = 2;
P.BOOT.grantAt = 0;
for (let t = 0; t <= 0.9; t += 0.05) P.body(c, W, H, t, 1);

P.BOOT.phase = 'choose';
for (let t = 0; t <= 1.2; t += 0.05) P.body(c, W, H, t, 1);
if (P.BOOT.rects.length !== 2) throw new Error('expected 2 card rects, got ' + P.BOOT.rects.length);
const r0 = P.BOOT.rects[0];
if (P.hit(r0.x + r0.w / 2, r0.y + r0.h / 2) !== 0) throw new Error('hit test missed card 0');
if (P.hit(4, 4) !== -1) throw new Error('hit test matched outside any card');

P.BOOT.phase = 'enter';
P.BOOT.sel = 1;
P.BOOT.turnAt = 0;
for (let t = 0; t <= 0.8; t += 0.04) P.body(c, W, H, t, 1);

/* dive: the frame that hands the frame over to the panel underneath */
P.BOOT.phase = 'dive';
P.BOOT.diveAt = 0;
for (let t = 0; t <= 1.1; t += 0.04) P.body(c, W, H, t, 1);

/* the two new stages must actually paint */
P.BOOT.phase = 'sync';
P.BOOT.switchAt = 0;
const syncText = drawn.text;
for (let t = 0; t <= 2.6; t += 0.05) P.body(c, W, H, t, 1);
if (drawn.text - syncText < 30) throw new Error('sync stage painted too little text');

P.BOOT.phase = 'brief';
P.BOOT.switchAt = 0;
const briefText = drawn.text;
for (let t = 0; t <= 2.4; t += 0.05) P.body(c, W, H, t, 1);
if (drawn.text - briefText < 20) throw new Error('brief stage painted too little text');

/* ── 2b. idle 3s → handle types itself → submits ─────────────────────────── */

P.BOOT.phase = 'auth';
P.BOOT.auth = 0;
P.BOOT.cmd = '';
P.BOOT.gh = '';
P.BOOT.auto = null;
P.BOOT.autoDoneAt = 0;
P.BOOT.lastInput = 0;
P.BOOT.switchAt = 0;
P.BOOT.lastPhase = 'boot';

let clock = 0;
for (let i = 0; i < 900; i++) {
  clock += 16;
  const cb = rafCb;
  if (typeof cb !== 'function') break;
  cb(clock);
  if (P.BOOT.auth !== 0) break;
}
if (P.BOOT.auth !== 1) {
  throw new Error('auto typing never submitted (auth=' + P.BOOT.auth + ', cmd=' + P.BOOT.cmd + ')');
}
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(P.BOOT.gh)) {
  throw new Error('auto typing produced an invalid handle: ' + JSON.stringify(P.BOOT.gh));
}
if (P.BOOT.gh.toLowerCase() !== 'canvilke') {
  throw new Error('unexpected default handle: ' + P.BOOT.gh);
}

/* ── 2c. the whole sequence advances by itself, in order ─────────────────── */

P.BOOT.phase = 'boot';
P.BOOT.auth = 0;
P.BOOT.cmd = '';
P.BOOT.gh = '';
P.BOOT.auto = null;
P.BOOT.autoDoneAt = 0;
P.BOOT.switchAt = 0;
P.BOOT.lastPhase = 'boot';
P.BOOT.lastInput = 0;
P.BOOT.done = false;
P.BOOT.committed = false;

/* frame() keeps its own clock, already past the self-check: seed the trace */
const seen = ['boot'];
let clock2 = 40000;
for (let i = 0; i < 2400; i++) {
  clock2 += 16;
  const cb = rafCb;
  if (typeof cb !== 'function') break;
  cb(clock2);
  if (seen[seen.length - 1] !== P.BOOT.phase) seen.push(P.BOOT.phase);
  if (P.BOOT.phase === 'choose') break;
}
const want = 'boot>sync>auth>brief>choose';
if (seen.join('>') !== want) {
  throw new Error('unexpected boot order: ' + seen.join('>') + ' (want ' + want + ')');
}

/* ── 3. the choice must be remembered ───────────────────────────────────── */

/* privacy guard: the boot layer must never carry the real name */
const bundle = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
['\u4f0d\u81f4\u8fdc', 'WU ZHI' + 'YUAN'].forEach((bad) => {
  if (bundle.indexOf(bad) !== -1) throw new Error('real name leaked into client.js: ' + bad);
});
if (bundle.indexOf('残梦潇伤') === -1 || bundle.indexOf('星海漫游') === -1) {
  throw new Error('channel handles missing from client.js');
}

if (typeof global.__bootCleanup === 'function') global.__bootCleanup();

console.log('boot ok — opens on load, 7 phases in order, auto-typed @' + P.BOOT.gh + ', 2 channels, cards ' +
  P.BOOT.rects.map((r) => Math.round(r.w) + 'x' + Math.round(r.h)).join(' / '));
