/* Headless check for the two-level knowledge field.
 *
 * It cannot judge looks — it only proves that level 0 really shows knowledge
 * blocks, that entering a block swaps in its own constellation, and that
 * coming back restores the blocks without throwing.
 *
 *   node test/levels.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
      if (prop === 'createPattern' || prop === 'createConicGradient') return () => ({ addColorStop() {} });
      if (prop === 'getImageData') return () => ({ data: [] });
      return () => {};
    },
    set(t, prop, v) { t[prop] = v; return true; }
  });
}

function makeCanvas() {
  return {
    width: 300, height: 150, style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    _h: {},
    addEventListener(t, f) { this._h[t] = f; },
    removeEventListener(t) { delete this._h[t]; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 760 }; },
    _ctx: null,
    getContext() { return (this._ctx = this._ctx || makeCtx()); }
  };
}

const rafQueue = [];
let now = 0;

global.window = {
  devicePixelRatio: 1.5,
  innerHeight: 800,
  innerWidth: 1280,
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
global.ResizeObserver = class { constructor(cb) { global.__roCb = cb; } observe() {} disconnect() {} };

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

const file = path.join(__dirname, '..', 'client.js');
let src = fs.readFileSync(file, 'utf8');
const anchor = "  return { inject: ['slots', 'layout'], apply: install };";
if (src.indexOf(anchor) < 0) throw new Error('could not find the module return statement');
src = src.replace(anchor,
  '  window.__NL_PROBE = { WEB: WEB, enter: enterGroup, back: backGroup };\n' + anchor);
vm.runInThisContext(src, { filename: file });

const def = global.window.__plugin;
const mod = def.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});

const regs = [];
mod.apply({
  slots: { inject(n, fn) { fn(); }, register(reg, comp) { regs.push({ reg, comp }); return () => {}; } }
});

const main = regs.filter((r) => r.reg.name === 'main')[0];
if (!main) throw new Error('main panel not registered');
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
  ((el.props && el.props.children) || []).forEach(bind);
}
bind(tree);
effects.forEach((fn) => fn());

function pump(n) {
  for (let i = 0; i < n; i++) {
    const cb = rafQueue.shift();
    if (!cb) break;
    now += 16.7;
    cb(now);
  }
}

pump(40);
const P = global.window.__NL_PROBE;
if (!P) throw new Error('probe not installed');

if (P.WEB.level !== 0) throw new Error('expected level 0, got ' + P.WEB.level);
if (!P.WEB.g || !P.WEB.g.isGroups) throw new Error('level 0 is not showing knowledge blocks');
if (P.WEB.g.nodes.some((n) => !n.isGroup)) throw new Error('level 0 leaked leaf nodes');
if (P.WEB.g.nodes.length < 3) throw new Error('too few blocks: ' + P.WEB.g.nodes.length);
const blockIds = P.WEB.g.nodes.map((n) => n.id);

P.enter(blockIds[0]);
pump(40);
if (P.WEB.level !== 1) throw new Error('enter did not switch level');
if (!P.WEB.g || P.WEB.g.isGroups) throw new Error('level 1 still shows blocks');
if (P.WEB.g.nodes.some((n) => n.isGroup)) throw new Error('level 1 shows a block node');
if (!P.WEB.g.core) throw new Error('level 1 has no core star');
const leafCount = P.WEB.g.nodes.length;

P.back();
pump(40);
if (P.WEB.level !== 0) throw new Error('back did not return to level 0');
if (!P.WEB.g.isGroups) throw new Error('back did not restore the blocks');
if (global.window.__NL_ERR) throw global.window.__NL_ERR;

console.log('levels ok — %d blocks, first block holds %d nodes, %d frames',
  blockIds.length, leafCount, Math.round(now / 16.7));
