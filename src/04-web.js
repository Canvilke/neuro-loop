/* ────────────────────────────────────────────────────────────────────────────
 * 04 · web — the knowledge constellation: a rotatable, zoomable 3D star field,
 *             the gravity bands, and the shard belt around the selected world
 * ──────────────────────────────────────────────────────────────────────────── */

var WEB = {
  g: null,
  cx: 0, cy: 0, R: 0,
  focus: null,
  pinned: null,
  ripples: [],
  reveal: 0,
  rotY: 0, rotX: 0, rotYT: 0, rotXT: 0,
  zoom: 1, zoomT: 1,
  drag: false,
  level: 0,      /* 0 = the blocks orbiting, 1 = inside one block */
  group: null,   /* block we are inside */
  ask: null      /* block we are asking about ("enter it?") */
};

var WEB_F = 1050;          /* focal length of the little lens we look through */
var WEB_TILT = 0.60;       /* how far you may pitch before it breaks */

var STORE_KEY = 'neuroloop.v1';
var STORE = { selected: null, flattened: [] };

function loadStore() {
  try {
    var raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        STORE.selected = o.selected || null;
        STORE.flattened = Array.isArray(o.flattened) ? o.flattened : [];
        migrateFlattened();
      }
    }
  } catch (e) { /* first run, private mode, whatever */ }
}

/* 旧键是 `subject:序号`，序号会随 seed 增删漂移，换个数据就指到别人身上。
 * 新键用内容哈希，然后按当时的顺序把老数据翻译一次。 */
function migrateFlattened() {
  var out = [];
  for (var i = 0; i < STORE.flattened.length; i++) {
    var k = STORE.flattened[i];
    var m = /^([a-z]+):(\d+)$/.exec(k);
    if (!m) { out.push(k); continue; }
    var sub = BY_SUBJECT[m[1]];
    var sh = sub && sub.shards ? sub.shards[Number(m[2])] : null;
    out.push(sh ? shardKey(sh) : k);
  }
  STORE.flattened = out;
}
function saveStore() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      selected: STORE.selected, flattened: STORE.flattened.slice(-200)
    }));
  } catch (e) { /* noop */ }
}

function shardKey(sh) {
  return 'sh:' + sh.subject + ':' + hashStr(String(sh.text || '')).toString(36);
}
function isFlattened(sh) { return STORE.flattened.indexOf(shardKey(sh)) >= 0; }
function flattenShard(sh) {
  if (isFlattened(sh)) return;
  var key = shardKey(sh);
  STORE.flattened.push(key);
  saveStore();
  /* 先改本地（界面立刻反应），再尽力告诉宿主；失败会进队列下次补发。 */
  nlPost({ kind: 'flatten', shard: key });
}

/* ── geometry ───────────────────────────────────────────────────────────────── */

function webGeom(w, h) {
  var R = Math.min(w * 0.185, h * 0.285);
  return { cx: w * 0.615, cy: h * 0.452, R: R };
}

function prepareWeb(w, h) {
  var geo = webGeom(w, h);
  WEB.cx = geo.cx; WEB.cy = geo.cy; WEB.R = geo.R;
  var sid = STORE.selected || SP.selected;
  if (WEB.level === 1 && WEB.group) {
    WEB.g = subGraphFor(sid, WEB.group, geo.R);
    if (!WEB.g) { WEB.level = 0; WEB.group = null; }
  }
  if (WEB.level === 0) {
    WEB.g = groupGraphFor(sid, geo.R);
    if (!WEB.g) { WEB.g = graphFor(sid, geo.R); WEB.level = 1; }
  }
  if (!WEB.g) return;
  WEB.g.nodes.forEach(function (nd, i) {
    nd.delay = i * 0.028;
    if (nd.hoverT === undefined) nd.hoverT = 0;
    if (nd.lz === undefined) nd.lz = ((hashStr(nd.id) % 997) / 997) - 0.5;
  });
}

/* the lens: yaw, then pitch, then perspective */
function projectLocal(x, y, z) {
  var cy = Math.cos(WEB.rotY), sy = Math.sin(WEB.rotY);
  var x1 = x * cy + z * sy;
  var z1 = -x * sy + z * cy;
  var cx = Math.cos(WEB.rotX), sx = Math.sin(WEB.rotX);
  var y1 = y * cx - z1 * sx;
  var z2 = y * sx + z1 * cx;
  var k = (WEB_F / (WEB_F + z2)) * WEB.zoom;
  return { x: WEB.cx + x1 * k, y: WEB.cy + y1 * k, k: k, z: z2 };
}

function resetView() {
  WEB.rotYT = 0; WEB.rotXT = 0; WEB.zoomT = 1;
}

function enterGroup(id) {
  var s = BY_SUBJECT[STORE.selected || SP.selected];
  var g2 = s ? (s.groups || []).filter(function (g) { return g.id === id; })[0] : null;
  if (!g2) return;
  WEB.level = 1; WEB.group = id; WEB.ask = null;
  WEB.pinned = null;
  WEB.g = null;
  prepareWeb(SP.w || 1200, SP.h || 800);
  WEB.reveal = 0;
  WEB.ripples.push({ x: WEB.cx, y: WEB.cy, t0: performance.now() / 1000, hue: '#9fe4f2', max: 120 });
}

function backGroup() {
  if (WEB.level !== 1) return;
  WEB.level = 0; WEB.group = null; WEB.ask = null; WEB.pinned = null;
  WEB.g = null;
  prepareWeb(SP.w || 1200, SP.h || 800);
  WEB.reveal = 0;
  WEB.ripples.push({ x: WEB.cx, y: WEB.cy, t0: performance.now() / 1000, hue: '#9fe4f2', max: 90 });
}

/* ── colour ─────────────────────────────────────────────────────────────────── */

/* Cold ramp only. Red is reserved for alarms (shard belt, blind rings) — a star
   itself never turns pink, no matter how unstable it is. */
function stabilityColor(s) {
  if (s <= 0.18) return lerpHex('#3d4a63', '#5c6e91', clamp(s / 0.18, 0, 1));
  if (s <= 0.45) return lerpHex('#5c6e91', '#8aa8cc', (s - 0.18) / 0.27);
  if (s <= 0.72) return lerpHex('#8aa8cc', '#9fe4f2', (s - 0.45) / 0.27);
  return lerpHex('#9fe4f2', '#f2fbff', clamp((s - 0.72) / 0.28, 0, 1));
}

function lerpHex(a, b, t) {
  var A = hexRgb(a), B = hexRgb(b);
  return 'rgb(' + Math.round(lerp(A[0], B[0], t)) + ',' +
    Math.round(lerp(A[1], B[1], t)) + ',' +
    Math.round(lerp(A[2], B[2], t)) + ')';
}

/* colour string (#rrggbb or rgb()) → rgba with alpha */
function rgbaMixStrip(col, white, alpha) {
  var c = col.indexOf('#') === 0 ? hexRgb(col) : (function () {
    var m = col.match(/(\d+)\D+(\d+)\D+(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : [200, 220, 255];
  })();
  var r = Math.round(lerp(c[0], 255, white));
  var g = Math.round(lerp(c[1], 255, white));
  var b = Math.round(lerp(c[2], 255, white));
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

/* ── ripples ────────────────────────────────────────────────────────────────── */

function addRipple(x, y, hue, max) {
  WEB.ripples.push({ x: x, y: y, t0: performance.now() / 1000, hue: hue, max: max || 130 });
}

function nodeAlpha(nd) {
  var dl = nd.delay || 0;
  return smoothstep(dl * 0.9, dl * 0.9 + 0.45, WEB.reveal);
}

/* ── bands ──────────────────────────────────────────────────────────────────── */

function bandSamples(A, B, bow, n) {
  var ax = A.lx, ay = A.ly, az = (A.lz || 0) * WEB.R;
  var bx = B.lx, by = B.ly, bz = (B.lz || 0) * WEB.R;
  var mx = (ax + bx) / 2, my = (ay + by) / 2;
  var dx = bx - ax, dy = by - ay;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var qx = mx + (-dy / len) * bow * len;
  var qy = my + (dx / len) * bow * len;
  var qz = (az + bz) / 2;
  var pts = [];
  for (var i = 0; i <= n; i++) {
    var u = i / n, mu = 1 - u;
    pts.push(projectLocal(
      mu * mu * ax + 2 * mu * u * qx + u * u * bx,
      mu * mu * ay + 2 * mu * u * qy + u * u * by,
      mu * mu * az + 2 * mu * u * qz + u * u * bz
    ));
  }
  return pts;
}

function strokeSamples(c, pts, t0, t1) {
  var a = Math.floor(t0 * (pts.length - 1));
  var b = Math.ceil(t1 * (pts.length - 1));
  if (b <= a) b = a + 1;
  c.beginPath();
  c.moveTo(pts[a].x, pts[a].y);
  for (var i = a + 1; i <= b && i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
}

/* ── drawing ───────────────────────────────────────────────────────────────── */

/* a quiet guide orbit for level 0 — nothing to read, just a sense of scale */
function drawFieldGuide(c, t) {
  var pulse = 0.5 + 0.5 * Math.sin(t * 0.8);
  c.save();
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(150,196,240,' + (0.045 + pulse * 0.03) + ')';
  c.beginPath(); c.arc(WEB.cx, WEB.cy, WEB.R, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(150,196,240,0.035)';
  c.beginPath(); c.arc(WEB.cx, WEB.cy, WEB.R * 0.62, 0, TAU); c.stroke();
  /* four compass ticks */
  for (var i = 0; i < 4; i++) {
    var a = i * Math.PI / 2 + t * 0.02;
    var x0 = WEB.cx + Math.cos(a) * (WEB.R - 6), y0 = WEB.cy + Math.sin(a) * (WEB.R - 6);
    c.strokeStyle = 'rgba(170,214,250,0.16)';
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(WEB.cx + Math.cos(a) * (WEB.R + 4), WEB.cy + Math.sin(a) * (WEB.R + 4));
    c.stroke();
  }
  c.restore();
}

/* a knowledge block: a small instrument with its own satellites */
function drawBlockNode(c, nd, t, r, alpha) {
  var asked = WEB.ask === nd.id;
  c.save();
  c.globalAlpha = clamp(alpha, 0, 1);

  c.globalCompositeOperation = 'lighter';
  var hg = c.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, r * 5.4);
  hg.addColorStop(0, 'rgba(176,224,255,0.26)');
  hg.addColorStop(0.36, 'rgba(120,182,242,0.075)');
  hg.addColorStop(1, 'rgba(120,182,242,0)');
  c.fillStyle = hg;
  c.beginPath(); c.arc(nd.x, nd.y, r * 5.4, 0, TAU); c.fill();
  c.globalCompositeOperation = 'source-over';

  var body = c.createRadialGradient(nd.x - r * 0.36, nd.y - r * 0.42, 0, nd.x, nd.y, r);
  body.addColorStop(0, 'rgba(240,251,255,0.97)');
  body.addColorStop(0.52, 'rgba(156,206,244,0.62)');
  body.addColorStop(1, 'rgba(34,58,92,0.92)');
  c.fillStyle = body;
  c.beginPath(); c.arc(nd.x, nd.y, r, 0, TAU); c.fill();

  c.strokeStyle = 'rgba(196,236,255,' + (0.26 + nd.hoverT * 0.42) + ')';
  c.lineWidth = 1;
  c.beginPath(); c.arc(nd.x, nd.y, r + 3.4, 0, TAU); c.stroke();

  /* the block's members tick around it — the only hint that it holds more */
  var m = Math.min(nd.count, 6);
  for (var i = 0; i < m; i++) {
    var a = t * (0.20 + 0.05 * (i % 3)) + (i / m) * TAU;
    var rad = r * 2.15 + 0.8 * Math.sin(t * 0.7 + i);
    c.fillStyle = 'rgba(200,238,255,' + (0.22 + 0.16 * Math.sin(t * 1.7 + i * 1.3)) + ')';
    c.beginPath();
    c.arc(nd.x + Math.cos(a) * rad, nd.y + Math.sin(a) * rad * 0.84, 0.85, 0, TAU);
    c.fill();
  }

  if (asked) {
    var bR = r + 10;
    c.lineWidth = 1.2;
    c.strokeStyle = 'rgba(206,242,255,' + (0.40 + 0.30 * Math.sin(t * 3.4)) + ')';
    for (var q = 0; q < 4; q++) {
      var base = q * Math.PI / 2 + Math.PI / 4;
      c.beginPath();
      c.arc(nd.x, nd.y, bR, base - 0.30, base + 0.30);
      c.stroke();
    }
  }

  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.font = font(12, 600);
  tracked(c, 1.6);
  c.shadowColor = 'rgba(2,5,12,0.92)';
  c.shadowBlur = 6;
  c.fillStyle = 'rgba(228,246,255,' + (0.72 + nd.hoverT * 0.26) + ')';
  c.fillText(nd.label, nd.x, nd.y + r + 9);
  c.shadowBlur = 0;
  c.font = mono(8.4, 500);
  tracked(c, 1.2);
  c.fillStyle = 'rgba(158,196,232,0.62)';
  c.fillText(nd.count + ' 考点', nd.x, nd.y + r + 25);
  tracked(c, 0);
  c.restore();
}

/* the "enter this block?" question — one line, no box */
function drawAsk(c, t, nd) {
  var x = WEB.cx, y = WEB.cy + WEB.R + 52;
  var pulse = 0.5 + 0.5 * Math.sin(t * 3.0);
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = font(11.5, 500);
  tracked(c, 1.6);
  c.fillStyle = 'rgba(214,244,255,' + (0.72 + 0.16 * pulse) + ')';
  c.fillText('进入「' + nd.label + '」？', x, y);
  tracked(c, 0);
  c.font = mono(9, 500);
  tracked(c, 1.2);
  c.fillStyle = 'rgba(164,202,238,0.72)';
  c.fillText('ENTER / 双击 进入　·　ESC 取消', x, y + 18);
  tracked(c, 0);
  c.strokeStyle = 'rgba(164,214,255,' + (0.14 + 0.10 * pulse) + ')';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(x - 116, y - 17); c.lineTo(x - 30, y - 17); c.stroke();
  c.beginPath(); c.moveTo(x + 30, y - 17); c.lineTo(x + 116, y - 17); c.stroke();
  c.restore();
}

/* where am I — level 1 only */
function drawBreadcrumb(c) {
  var s = BY_SUBJECT[STORE.selected || SP.selected];
  if (!s) return;
  var g2 = (s.groups || []).filter(function (q) { return q.id === WEB.group; })[0];
  var x = Math.max(24, WEB.cx - WEB.R - 34), y = Math.max(74, WEB.cy - WEB.R - 40);
  c.save();
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.font = font(10, 500);
  tracked(c, 2.0);
  c.fillStyle = 'rgba(158,198,234,0.66)';
  c.fillText(s.name, x, y);
  var wname = c.measureText(s.name).width;
  c.fillStyle = 'rgba(158,198,234,0.34)';
  c.fillText('/', x + wname + 9, y);
  c.font = font(10.5, 600);
  c.fillStyle = 'rgba(226,246,255,0.92)';
  c.fillText(g2 ? g2.label : '', x + wname + 22, y);
  tracked(c, 0);
  c.textAlign = 'right';
  c.font = mono(8.6, 500);
  tracked(c, 1.4);
  c.fillStyle = 'rgba(150,188,224,0.58)';
  c.fillText('ESC 返回', WEB.cx + WEB.R, y);
  tracked(c, 0);
  c.restore();
}

function drawWeb(c, w, h, t, boot, hoverNode) {
  var g = WEB.g;
  if (!g || WEB.reveal <= 0.01) return;

  WEB.rotY = approach(WEB.rotY, WEB.rotYT, 7, 1 / 60);
  WEB.rotX = approach(WEB.rotX, WEB.rotXT, 7, 1 / 60);
  WEB.zoom = approach(WEB.zoom, WEB.zoomT, 7, 1 / 60);

  var focusId = hoverNode ? hoverNode.id : WEB.pinned;
  var adj = focusId ? (g.adj[focusId] || {}) : null;

  if (WEB.level === 0) drawFieldGuide(c, t);

  /* positions */
  g.nodes.forEach(function (nd) {
    var pr = projectLocal(nd.lx, nd.ly, (nd.lz || 0) * WEB.R);
    nd.x = pr.x; nd.y = pr.y; nd.k = pr.k; nd.zz = pr.z;
    nd.rr = nd.r * pr.k;
    nd.depth = clamp(0.66 + (pr.k - 1) * 1.25, 0.44, 1.10);
    var target = (focusId && (nd.id === focusId || adj[nd.id])) ? 1 : (focusId ? 0 : 0.55);
    nd.hoverT = approach(nd.hoverT, target, 6, 1 / 60);
  });

  var order = g.nodes.slice().sort(function (a, b) { return b.zz - a.zz; });

  /* core star — only when we are inside a block */
  var core = WEB.level === 1 ? g.core : null;
  if (core) {
    var subjNow = BY_SUBJECT[SP.selected] || SUBJECTS[0];
    var cHue = subjNow ? subjNow.hue : '#8fd0ff';
    var ca = nodeAlpha(core) * core.depth;
    var cr = (9.0 + Math.sin(t * 1.1) * 0.8) * core.k;
    c.save();
    c.globalAlpha = ca;
    c.globalCompositeOperation = 'lighter';
    var cg = c.createRadialGradient(core.x, core.y, 0, core.x, core.y, cr * 4.2);
    cg.addColorStop(0, 'rgba(255,255,252,0.94)');
    cg.addColorStop(0.07, rgbaMix(cHue, 0.62, 0.66));
    cg.addColorStop(0.24, rgba(cHue, 0.15));
    cg.addColorStop(0.58, rgba(cHue, 0.045));
    cg.addColorStop(1, rgba(cHue, 0));
    c.fillStyle = cg;
    c.beginPath(); c.arc(core.x, core.y, cr * 4.2, 0, TAU); c.fill();

    var st = c.createLinearGradient(core.x - cr * 7, core.y, core.x + cr * 7, core.y);
    st.addColorStop(0, 'rgba(255,255,255,0)');
    st.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    st.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = st;
    c.fillRect(core.x - cr * 7, core.y - 0.6, cr * 14, 1.2);

    for (var k = 0; k < 12; k++) {
      var ang = (k / 12) * TAU + t * 0.045;
      var len = cr * (1.32 + 0.45 * Math.sin(t * 0.9 + k * 1.7));
      c.beginPath();
      c.moveTo(core.x + Math.cos(ang) * cr * 1.05, core.y + Math.sin(ang) * cr * 1.05);
      c.lineTo(core.x + Math.cos(ang) * len, core.y + Math.sin(ang) * len);
      c.strokeStyle = rgba(cHue, 0.08 + 0.05 * Math.sin(t * 1.3 + k));
      c.lineWidth = 1;
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(255,254,250,0.98)';
    c.beginPath(); c.arc(core.x, core.y, cr * 0.44, 0, TAU); c.fill();
    c.strokeStyle = rgba(cHue, 0.7);
    c.lineWidth = 1;
    c.beginPath(); c.arc(core.x, core.y, cr * 0.7, 0, TAU); c.stroke();
    c.restore();
  }

  /* bands */
  g.links.forEach(function (l) {
    var A = l.A, B = l.B;
    var aA = nodeAlpha(A), aB = nodeAlpha(B);
    var a = Math.min(aA, aB);
    if (a <= 0.01) return;
    var touched = focusId && (l.a === focusId || l.b === focusId);
    var inside = focusId && (adj[l.a] || l.a === focusId) && (adj[l.b] || l.b === focusId);

    var alpha = (0.06 + l.w * 0.30) * a * Math.min(A.depth, B.depth);
    if (focusId) alpha *= inside ? 1.9 : 0.14;
    if (touched) alpha *= 1.45 + 0.45 * Math.sin(t * 4);

    var hA = stabilityColor(A.stability), hB = stabilityColor(B.stability);
    var grad = c.createLinearGradient(A.x, A.y, B.x, B.y);
    grad.addColorStop(0, hA);
    grad.addColorStop(1, hB);

    var pts = bandSamples(A, B, l.bow, 12);
    c.save();
    c.globalAlpha = clamp(alpha, 0, 1);
    c.strokeStyle = grad;
    c.lineWidth = 0.5 + l.w * (touched ? 2.6 : 1.8);
    strokeSamples(c, pts, 0, 1);
    c.stroke();
    c.restore();

    /* photons riding the band */
    if (l.w > 0.42 && a > 0.5) {
      var nP = l.w > 0.75 ? 2 : 1;
      for (var p = 0; p < nP; p++) {
        var prog = ((t * (0.09 + l.w * 0.16) + l.phase * 7 + p * 0.5) % 1);
        var idx = Math.min(pts.length - 1, Math.round(prog * (pts.length - 1)));
        var pt = pts[idx];
        var fade = Math.sin(prog * Math.PI);
        var pa = (inside || !focusId ? 0.85 : 0.22) * fade * a;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = 'rgba(196,238,255,' + (pa * 0.9) + ')';
        c.beginPath(); c.arc(pt.x, pt.y, 1.35 * pt.k, 0, TAU); c.fill();
        var pg = c.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 6.5);
        pg.addColorStop(0, 'rgba(150,220,255,' + (pa * 0.38) + ')');
        pg.addColorStop(1, 'rgba(150,220,255,0)');
        c.fillStyle = pg;
        c.beginPath(); c.arc(pt.x, pt.y, 6.5, 0, TAU); c.fill();
        c.restore();
      }
    }
  });

  /* nodes / blocks, far to near */
  order.forEach(function (nd) {
    var a = nodeAlpha(nd);
    if (a <= 0.01) return;

    if (nd.isGroup) {
      var gdim = (focusId && nd.id !== focusId) ? 0.42 : 1;
      var galpha = a * nd.depth * gdim * (WEB.ask && WEB.ask !== nd.id ? 0.55 : 1);
      var gr = nd.rr * (1 + nd.hoverT * 0.10);
      drawBlockNode(c, nd, t, gr, galpha);
      return;
    }

    var focused = !focusId || nd.id === focusId || !!adj[nd.id];
    var dim = focused ? 1 : 0.14;
    var r = nd.rr * (1 + nd.hoverT * 0.22) * (focused ? 1 : 0.86);
    var col = stabilityColor(nd.stability);
    var aa = a * dim * nd.depth;

    c.save();
    c.globalAlpha = clamp(aa, 0, 1);

    /* glow */
    c.globalCompositeOperation = 'lighter';
    var gg = c.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, r * 5.6);
    gg.addColorStop(0, rgbaMixStrip(col, 0.10, nd.id === focusId ? 0.44 : 0.20));
    gg.addColorStop(0.35, rgbaMixStrip(col, 0.10, 0.07));
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gg;
    c.beginPath(); c.arc(nd.x, nd.y, r * 5.6, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';

    /* body */
    c.fillStyle = col;
    c.beginPath(); c.arc(nd.x, nd.y, r, 0, TAU); c.fill();

    var sgc = c.createRadialGradient(nd.x - r * 0.3, nd.y - r * 0.3, 0, nd.x, nd.y, r * 1.05);
    sgc.addColorStop(0, 'rgba(255,255,255,0.68)');
    sgc.addColorStop(0.55, 'rgba(255,255,255,0.08)');
    sgc.addColorStop(1, 'rgba(0,0,0,0.38)');
    c.fillStyle = sgc;
    c.beginPath(); c.arc(nd.x, nd.y, r, 0, TAU); c.fill();

    /* blind alarm — the only red on a star */
    if (nd.stability <= 0.34) {
      var pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + nd.delay * 20);
      c.beginPath();
      c.arc(nd.x, nd.y, r + 3.5 + pulse * 3, 0, TAU);
      c.strokeStyle = 'rgba(255,74,94,' + (0.14 + pulse * 0.26) + ')';
      c.lineWidth = 1;
      c.stroke();
    }

    if (nd.id === focusId) {
      c.beginPath();
      c.arc(nd.x, nd.y, r + 7, 0, TAU);
      c.strokeStyle = rgbaMixStrip(col, 0.45, 0.32);
      c.lineWidth = 1;
      c.stroke();
    }

    /* labels: only where they earn their place */
    var wants = nd.isCore || nd.hoverT > 0.5 || (focusId && nd.id === focusId);
    if (!focusId && !wants && nd.attn > 0.78) wants = true;
    if (wants) {
      var la = (focusId ? 1 : 0.70) * a * clamp(nd.depth, 0.55, 1);
      c.font = font(11, 500);
      tracked(c, 1.2);
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.shadowColor = 'rgba(2,5,12,0.92)';
      c.shadowBlur = 5;
      c.fillStyle = rgbaMixStrip(col, 0.62, la);
      c.fillText(nd.label, nd.x, nd.y + r + 7);
      c.shadowBlur = 0;
      c.shadowColor = 'rgba(0,0,0,0)';
      tracked(c, 0);
    }
    c.restore();
  });

  if (WEB.level === 0 && WEB.ask) {
    var asked = g.nodes.filter(function (q) { return q.id === WEB.ask; })[0];
    if (asked) drawAsk(c, t, asked);
  }
  if (WEB.level === 1) drawBreadcrumb(c);

  /* ripples */
  var now = performance.now() / 1000;
  WEB.ripples = WEB.ripples.filter(function (rp) { return now - rp.t0 < 1.5; });
  WEB.ripples.forEach(function (rp) {
    var k = (now - rp.t0) / 1.5;
    var rr = 8 + easeOutCubic(k) * rp.max;
    c.save();
    c.globalAlpha = (1 - k) * 0.42;
    c.beginPath();
    c.arc(rp.x, rp.y, rr, 0, TAU);
    c.strokeStyle = rgba(rp.hue, 0.8);
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();
  });
}

/* ── shard belt ────────────────────────────────────────────────────────────── */

function selectedPlanet() {
  return SP.planets.filter(function (p) { return p.id === SP.selected; })[0] || null;
}

function shardPositions(t, p) {
  var list = [];
  var subj = BY_SUBJECT[p.id];
  if (!subj || !subj.shards) return list;
  var base = p.r * p.sc * 3.6 + 34;
  subj.shards.forEach(function (sh, i) {
    var ph = i * 2.399963;
    var spd = 0.16 + (i % 5) * 0.026;
    var a = t * spd + ph;
    var rad = base * (0.90 + 0.34 * ((i * 0.618) % 1));
    var flat = 0.44;
    var x = p.x + Math.cos(a) * rad;
    var y = p.y + Math.sin(a) * rad * flat;
    var state = isFlattened(sh) ? 'smooth' : sh.state;
    list.push({ sh: sh, x: x, y: y, a: a, r: rad, state: state, ph: ph, i: i });
  });
  return list;
}

function beltDebris(p) {
  if (p.debris) return p.debris;
  var rng = makeRng(hashStr(p.id + ':belt') || 7);
  var out = [];
  for (var i = 0; i < 34; i++) {
    out.push({
      a: rng() * TAU, k: 0.90 + rng() * 0.24,
      r: 0.4 + rng() * 1.1, al: 0.09 + rng() * 0.24,
      sp: 0.018 + rng() * 0.05
    });
  }
  p.debris = out;
  return out;
}

function drawShards(c, t, hoverShard) {
  var p = selectedPlanet();
  if (!p) return [];
  var list = shardPositions(t, p);
  var base = p.r * p.sc * 3.6 + 34;
  var cx = p.x, cy = p.y;
  if (!isFinite(cx) || !isFinite(cy) || !isFinite(base) || !isFinite(t)) return [];

  c.save();
  c.strokeStyle = 'rgba(150,182,224,0.13)';
  c.lineWidth = 0.7;
  c.beginPath();
  c.ellipse(cx, cy, base * 1.06, base * 0.46, -0.10, 0, TAU);
  c.stroke();
  c.restore();

  c.save();
  beltDebris(p).forEach(function (d) {
    var a = d.a + t * d.sp;
    c.globalAlpha = d.al;
    c.fillStyle = 'rgba(178,200,232,1)';
    c.beginPath();
    c.arc(cx + Math.cos(a) * base * 1.06 * d.k, cy + Math.sin(a) * base * 0.46 * d.k, d.r, 0, TAU);
    c.fill();
  });
  c.restore();

  list.forEach(function (s) {
    var hot = hoverShard && hoverShard.sh === s.sh;
    var pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + s.ph);
    var col = s.state === 'fp' ? '#ff4a5e' : (s.state === 'unknown' ? '#8fa4bd' : '#5ad2c8');
    var a = { fp: 0.95, unknown: 0.50, smooth: 0.11 }[s.state] || 0.5;
    var len = s.state === 'fp' ? 9 : (s.state === 'unknown' ? 6 : 4);
    var ang = Math.atan2(Math.sin(s.a) * 0.44, Math.cos(s.a));

    c.save();
    c.globalAlpha = clamp(a * (hot ? 1.6 : 1) * (s.state === 'fp' ? 0.78 + pulse * 0.22 : 1), 0, 1);

    if (s.state === 'fp') {
      c.globalCompositeOperation = 'lighter';
      var gg = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, 13 + pulse * 6);
      gg.addColorStop(0, 'rgba(255,74,94,' + (0.32 + pulse * 0.22) + ')');
      gg.addColorStop(0.5, 'rgba(255,74,94,0.09)');
      gg.addColorStop(1, 'rgba(255,74,94,0)');
      c.fillStyle = gg;
      c.beginPath(); c.arc(s.x, s.y, 13 + pulse * 6, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
    }

    c.translate(s.x, s.y);
    c.rotate(ang + 0.45);
    c.fillStyle = col;
    c.fillRect(-len / 2, -0.9, len, 1.8);
    if (s.state === 'fp') {
      var tr = c.createLinearGradient(-len * 2.4, 0, -len / 2, 0);
      tr.addColorStop(0, 'rgba(255,74,94,0)');
      tr.addColorStop(1, 'rgba(255,120,132,0.45)');
      c.fillStyle = tr;
      c.fillRect(-len * 2.4, -0.5, len * 1.9, 1);
    }
    c.restore();
  });

  return list;
}

/* ── holographic readout ───────────────────────────────────────────────────── */

var READOUT_FONT = { title: 13, tag: 8.4, body: 10.8, stat: 8.4 };
var RD_W = 226;

function drawReadout(c, w, h, anchorX, anchorY, hue, title, rows, stats) {
  c.font = font(READOUT_FONT.body, 400);
  var wrapped = rows.map(function (r) {
    return { label: r.label, color: r.color, lines: wrapLines(c, r.text, RD_W) };
  });
  var bodyH = 0;
  wrapped.forEach(function (r) { bodyH += 11 + r.lines.length * 15 + 8; });
  var totalH = 28 + bodyH + (stats ? 30 : 0);

  var x = anchorX;
  if (x + RD_W > w - 26) x = anchorX - RD_W - 40;
  if (x < 22) x = 22;
  var y = clamp(anchorY - totalH * 0.5, 26, h - totalH - 96);

  var px = x + RD_W * 0.45, py = y + totalH * 0.5;
  var pull = c.createRadialGradient(px, py, 0, px, py, RD_W * 0.96);
  pull.addColorStop(0, 'rgba(3,6,12,0.66)');
  pull.addColorStop(0.52, 'rgba(3,6,12,0.34)');
  pull.addColorStop(1, 'rgba(3,6,12,0)');
  c.fillStyle = pull;
  c.fillRect(x - RD_W * 0.6, y - totalH * 0.2, RD_W * 2.2, totalH * 1.4);

  c.save();
  c.globalAlpha = 0.32;
  c.strokeStyle = rgba(hue, 0.9);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(anchorX - 9, anchorY);
  c.lineTo(x - 7, y + 13);
  c.lineTo(x, y + 13);
  c.stroke();
  c.restore();

  c.strokeStyle = rgba(hue, 0.55);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, y); c.lineTo(x, y + 10);
  c.moveTo(x, y); c.lineTo(x + 10, y);
  c.stroke();

  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';

  var ty = y + 15;
  c.font = font(READOUT_FONT.title, 600);
  tracked(c, 2.2);
  c.fillStyle = 'rgba(240,248,255,0.96)';
  c.fillText(title, x + 14, ty);
  tracked(c, 0);

  var hl = c.createLinearGradient(x + 14, 0, x + RD_W, 0);
  hl.addColorStop(0, rgba(hue, 0.5));
  hl.addColorStop(1, rgba(hue, 0));
  c.fillStyle = hl;
  c.fillRect(x + 14, ty + 7, RD_W - 20, 1);

  ty += 24;
  wrapped.forEach(function (r) {
    c.font = font(READOUT_FONT.tag, 600);
    tracked(c, 2.6);
    c.fillStyle = rgba(hue, 0.44);
    c.fillText(r.label, x + 14, ty);
    tracked(c, 0);
    ty += 15;
    c.font = font(READOUT_FONT.body, 400);
    tracked(c, 0.35);
    c.fillStyle = r.color || 'rgba(206,226,246,0.86)';
    r.lines.forEach(function (ln) { c.fillText(ln, x + 14, ty); ty += 15; });
    tracked(c, 0);
    ty += 8;
  });

  if (stats) {
    stats.forEach(function (s, i) {
      var by = ty + 4 + i * 11;
      c.font = mono(READOUT_FONT.stat, 500);
      tracked(c, 1.2);
      c.fillStyle = 'rgba(150,190,230,0.46)';
      c.fillText(s.label, x + 14, by);
      tracked(c, 0);
      var bx = x + 48, bw = RD_W - 48 - 44;
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.fillRect(bx, by - 3.2, bw, 2);
      c.fillStyle = s.color || rgba(hue, 0.8);
      c.fillRect(bx, by - 3.2, bw * clamp(s.value, 0, 1), 2);
      c.fillStyle = 'rgba(255,255,255,0.10)';
      for (var k = 1; k < 10; k++) c.fillRect(bx + bw * k / 10, by - 5, 1, 1.4);
      c.font = mono(7.6, 500);
      c.textAlign = 'right';
      c.fillStyle = 'rgba(190,215,240,0.6)';
      c.fillText((s.value * 100).toFixed(0), x + RD_W - 6, by);
      c.textAlign = 'left';
    });
  }
}
