/* ────────────────────────────────────────────────────────────────────────────
 * 07 · fx — 全息后处理层
 *   CRT 扫描线 · 移动扫描带 · 边缘色差 · 四角角标 · 颗粒 · 低频闪烁 · 撕裂
 *
 * 由 build.py 原样拼接进 client.js，与 01–05 共享同一闭包：
 * ES5 only、无 import/export、不碰 window/document、只操作传入的 ctx。
 *
 *   fxPrepare(w, h, dpr)          尺寸 / dpr 变化时调用，烘焙图案
 *   fxDraw(c, w, h, t, opts)      每帧调用（bloom + 暗角之后、HUD 文字之前）
 *   opts = { boot: 0..1, hover: 0..1, glitch: 0..1 }，可整体缺省
 *
 * 坐标系：c 进入时按 CSS 像素缩放（dpr）；内部临时切到设备像素画扫描线，
 * 再切回 CSS 像素画几何。所有数值都过 FX_num / clamp，杜绝 NaN、Infinity。
 * ──────────────────────────────────────────────────────────────────────────── */

/* 调色：青 / 蓝 / 灰白；红色只允许在 glitch 的一瞬间出现 */
var FX_CYAN = '111,216,240';    /* #6fd8f0 */
var FX_BLUE = '95,125,255';     /* #5f7dff */
var FX_WHITE = '207,228,245';   /* #cfe4f5 */
var FX_RED = '255,74,94';       /* #ff4a5e */

var FX = {
  w: 0, h: 0, dpr: 1,
  scan: null,   /* 扫描线 pattern（设备像素空间） */
  noise: [],    /* 4 张颗粒 pattern，按 12Hz 轮换 */
  band: null,   /* 扫描带精灵（竖向渐变，8px 宽，横向拉伸） */
  edge: null    /* 预生成的边缘线段表 */
};

function FX_num(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v : d;
}

/* ── 烘焙 ──────────────────────────────────────────────────────────────────── */

/* 扫描线：1 CSS px 亮线 + 2 CSS px 暗带，一个图案里放整数个周期，避免接缝。
 * 画在设备像素上，dpr 下也是硬边（不做半透明缩放，不会糊成一片灰）。 */
function FX_makeScanTile(dpr) {
  var unit = Math.max(1, Math.round(dpr));
  var linePx = unit;
  var darkPx = unit * 2;
  var period = linePx + darkPx;

  var want = Math.max(period * 2, Math.round(9 * dpr));
  var reps = Math.max(2, Math.round(want / period));
  var th = period * reps;

  var cv = makeCanvas(8, th);
  var g = cv.getContext('2d');
  if (!g) return null;

  g.clearRect(0, 0, cv.width, cv.height);
  var y, i;
  for (i = 0; i < reps; i++) {
    y = i * period;
    g.fillStyle = 'rgba(' + FX_CYAN + ',0.020)';      /* 亮线 */
    g.fillRect(0, y, cv.width, linePx);
    g.fillStyle = 'rgba(2,6,12,0.014)';               /* 暗带 ×2 */
    g.fillRect(0, y + linePx, cv.width, darkPx);
  }
  /* 一个周期总 alpha = 0.020 + 0.014 * 2 = 0.048 ≤ 0.05 */
  return cv;
}

/* 颗粒：96 CSS px 见方的稀疏点阵，4 张不同种子轮换。单点 alpha 0.030，
 * 实际叠乘 globalAlpha 0.9 → 0.027。不用每帧画几千个点。 */
function FX_makeNoiseTile(dpr, seed) {
  var tw = Math.max(32, Math.round(96 * dpr));
  var cv = makeCanvas(tw, tw);
  var g = cv.getContext('2d');
  if (!g) return null;

  g.clearRect(0, 0, tw, tw);
  var rng = makeRng(seed);
  var light = Math.round(120 * dpr * dpr);
  var dark = Math.round(light * 0.22);
  var i, x, y;

  g.fillStyle = 'rgba(' + FX_WHITE + ',0.030)';
  for (i = 0; i < light; i++) {
    x = Math.floor(rng() * tw);
    y = Math.floor(rng() * tw);
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = 'rgba(0,2,8,0.024)';
  for (i = 0; i < dark; i++) {
    x = Math.floor(rng() * tw);
    y = Math.floor(rng() * tw);
    g.fillRect(x, y, 1, 1);
  }
  return cv;
}

/* 扫描带：竖向渐变，峰值 0.032（规格上限 0.04），横向拉伸后仍是一条
 * 柔和的带状亮区，不产生横向条纹。 */
function FX_makeBand(dpr) {
  var th = Math.max(8, Math.round(92 * dpr));
  var cv = makeCanvas(8, th);
  var g = cv.getContext('2d');
  if (!g) return null;

  var gr = g.createLinearGradient(0, 0, 0, th);
  if (!gr) return null;
  gr.addColorStop(0, 'rgba(' + FX_CYAN + ',0)');
  gr.addColorStop(0.32, 'rgba(' + FX_CYAN + ',0.011)');
  gr.addColorStop(0.52, 'rgba(' + FX_CYAN + ',0.032)');
  gr.addColorStop(0.70, 'rgba(' + FX_BLUE + ',0.010)');
  gr.addColorStop(1, 'rgba(' + FX_CYAN + ',0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, cv.width, th);
  return cv;
}

/* 边缘色差线段：每条边 4–5 段短划线，两条内缩带（5px 青 / 9px 蓝）。
 * 固定种子烘焙一次，每帧只复用，不做随机跳变。 */
function FX_buildEdge(seed) {
  var rng = makeRng(seed);
  var segs = [];
  var s, i, n, a, l;
  for (s = 0; s < 4; s++) {
    n = 4 + Math.floor(rng() * 2);
    for (i = 0; i < n; i++) {
      a = rng() * 0.82;
      l = 0.055 + rng() * 0.11;
      if (a + l > 0.97) a = 0.97 - l;
      segs.push({ s: s, a: a, l: l, o: rng() < 0.45 ? 0 : 1 });
    }
  }
  return segs;
}

function FX_segPath(c, sg, w, h, inset) {
  var a = sg.a, b = sg.a + sg.l;
  if (sg.s === 0) {
    c.moveTo(a * w, inset); c.lineTo(b * w, inset);
  } else if (sg.s === 1) {
    c.moveTo(w - inset, a * h); c.lineTo(w - inset, b * h);
  } else if (sg.s === 2) {
    c.moveTo(a * w, h - inset); c.lineTo(b * w, h - inset);
  } else {
    c.moveTo(inset, a * h); c.lineTo(inset, b * h);
  }
}

/* ── 尺寸变化 ─────────────────────────────────────────────────────────────── */

function fxPrepare(w, h, dpr) {
  w = FX_num(w, 0);
  h = FX_num(h, 0);
  dpr = FX_num(dpr, 1);

  FX.w = w > 0 ? w : 1000;
  FX.h = h > 0 ? h : 780;
  FX.dpr = clamp(dpr, 0.5, 4);

  FX.scan = null;
  FX.noise = [];
  FX.band = null;
  FX.edge = FX_buildEdge(0x1F35A7C1);

  var i, tile, tg, nt, ng, p;

  tile = FX_makeScanTile(FX.dpr);
  if (tile) {
    tg = tile.getContext('2d');
    if (tg && tg.createPattern) {
      try { FX.scan = tg.createPattern(tile, 'repeat'); } catch (e) { FX.scan = null; }
    }
  }

  for (i = 0; i < 4; i++) {
    nt = FX_makeNoiseTile(FX.dpr, (0x51ED270B + i * 0x9E3779B1) >>> 0);
    if (nt) {
      ng = nt.getContext('2d');
      if (ng && ng.createPattern) {
        try {
          p = ng.createPattern(nt, 'repeat');
          if (p) FX.noise.push(p);
        } catch (e2) { /* 忽略：该轮跳过颗粒 */ }
      }
    }
  }

  FX.band = FX_makeBand(FX.dpr);
}

/* ── 每帧 ─────────────────────────────────────────────────────────────────── */

function fxDraw(c, w, h, t, opts) {
  if (!c || typeof c.fillRect !== 'function') return;
  w = FX_num(w, 0);
  h = FX_num(h, 0);
  if (!(w > 0) || !(h > 0)) return;
  t = FX_num(t, 0);
  if (t < 0) t = 0;

  opts = opts || {};
  var boot = clamp(FX_num(opts.boot, 1), 0, 1);
  var hover = clamp(FX_num(opts.hover, 0), 0, 1);
  var glitch = clamp(FX_num(opts.glitch, 0), 0, 1);

  var fade = smoothstep(0.10, 0.72, boot);
  if (fade <= 0.0015) return;

  /* 全息闪烁：极低频、整层 ±1.6% 透明度抖动（上限 0.02） */
  var flick = 1 - 0.016 * (0.5 + 0.5 * Math.sin(t * 1.7 + Math.sin(t * 0.31) * 2.6));

  /* 设备像素尺寸：以 backing store 为准，变换是 dpr 缩放或恒等都能兜住 */
  var dw = 0, dh = 0;
  if (c.canvas && c.canvas.width > 0 && c.canvas.height > 0) {
    dw = c.canvas.width;
    dh = c.canvas.height;
  }
  if (!(dw > 0) || !(dh > 0)) {
    dw = Math.round(w * FX.dpr);
    dh = Math.round(h * FX.dpr);
  }
  var sx = dw / w, sy = dh / h;
  if (!isFinite(sx) || sx <= 0) sx = 1;
  if (!isFinite(sy) || sy <= 0) sy = 1;

  c.save();
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';
  c.globalAlpha = 1;

  /* ① 扫描线 —— 整屏一次 pattern 填充 */
  if (FX.scan) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = clamp(fade * flick, 0, 1);
    c.fillStyle = FX.scan;
    c.fillRect(0, 0, dw, dh);
  }

  /* ② 颗粒 —— 4 张预烘图 12Hz 轮换，同样整屏一次填充 */
  if (FX.noise.length) {
    var ni = Math.floor(t * 12) % FX.noise.length;
    if (ni < 0) ni += FX.noise.length;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = clamp(fade * flick * 0.9, 0, 1);
    c.fillStyle = FX.noise[ni];
    c.fillRect(0, 0, dw, dh);
  }

  /* 回到 CSS 像素空间画几何 */
  c.setTransform(sx, 0, 0, sy, 0, 0);
  c.globalAlpha = 1;

  /* ③ 扫描带 —— 8.6s 自顶向下走一遍，一次 drawImage */
  if (FX.band) {
    var bandH = 92;
    var per = 8.6;
    var ph = (t % per) / per;
    var by = -bandH + ph * (h + bandH * 2);
    c.globalAlpha = clamp(fade * flick, 0, 1);
    c.drawImage(FX.band, 0, by, w, bandH);
    c.globalAlpha = 1;
  }

  c.lineWidth = 1;
  c.lineJoin = 'miter';

  /* ④ 边缘色差 —— 两条内缩带，各一次 stroke（青 0.042 / 蓝 0.030） */
  var segs = FX.edge;
  if (segs && segs.length) {
    var ea = clamp(0.042 * (1 + hover * 0.4) * fade * flick, 0, 0.060);
    var eb = clamp(0.030 * (1 + hover * 0.3) * fade * flick, 0, 0.045);
    var i;

    c.beginPath();
    for (i = 0; i < segs.length; i++) {
      if (segs[i].o === 0) FX_segPath(c, segs[i], w, h, 5);
    }
    c.strokeStyle = 'rgba(' + FX_CYAN + ',' + ea.toFixed(3) + ')';
    c.stroke();

    c.beginPath();
    for (i = 0; i < segs.length; i++) {
      if (segs[i].o !== 0) FX_segPath(c, segs[i], w, h, 9);
    }
    c.strokeStyle = 'rgba(' + FX_BLUE + ',' + eb.toFixed(3) + ')';
    c.stroke();
  }

  /* ⑤ 四角 L 形角标 + 小刻度 —— 一次 stroke，缓慢呼吸（0.075–0.12） */
  var ca = clamp((0.075 + 0.035 * (0.5 + 0.5 * Math.sin(t * 0.62))) *
    (1 + hover * 0.15) * fade * flick, 0, 0.12);
  var arm = 19 + 3 * (0.5 + 0.5 * Math.sin(t * 0.55));
  var pad = 7;
  var ci, ox, oy, dx, dy;

  c.strokeStyle = 'rgba(' + FX_WHITE + ',' + ca.toFixed(3) + ')';
  c.beginPath();
  for (ci = 0; ci < 4; ci++) {
    ox = (ci === 0 || ci === 3) ? pad : w - pad;
    oy = (ci === 0 || ci === 1) ? pad : h - pad;
    dx = (ci === 0 || ci === 3) ? 1 : -1;
    dy = (ci === 0 || ci === 1) ? 1 : -1;
    c.moveTo(ox, oy + dy * arm);
    c.lineTo(ox, oy);
    c.lineTo(ox + dx * arm, oy);
    c.moveTo(ox + dx * (arm + 5), oy);
    c.lineTo(ox + dx * (arm + 9), oy);
  }
  c.stroke();

  /* ⑥ glitch 撕裂 —— 最多 2 条 2px 错位亮线，白 0.085 / 红 0.075；
   *    红色只在这里出现。父层应把它当 ≤150ms 的衰减包络传入。 */
  if (glitch > 0.02) {
    var ga = glitch * fade;
    var rng = makeRng((Math.floor(t * 30) * 2654435761) >>> 0);
    var n = ga > 0.55 ? 2 : 1;
    var t0x = 0, t0y = 0, t0l = 1;
    for (var k = 0; k < n; k++) {
      var ty = Math.floor(rng() * Math.max(1, h - 4));
      var tx = Math.floor(rng() * w * 0.4);
      var tl = Math.round(w * (0.16 + rng() * 0.44));
      if (tx + tl > w) tl = w - tx;
      if (tl < 2) tl = 2;
      if (k === 0) { t0x = tx; t0y = ty; t0l = tl; }
      c.fillStyle = 'rgba(' + FX_WHITE + ',' + (0.085 * ga).toFixed(3) + ')';
      c.fillRect(tx, ty, tl, 2);
    }
    /* 红色错位只补一条，避免 glitch 帧绘制次数超预算 */
    c.fillStyle = 'rgba(' + FX_RED + ',' + (0.075 * ga).toFixed(3) + ')';
    c.fillRect(t0x + 3, t0y + 2, Math.max(1, t0l * 0.55), 1);
  }

  c.restore();
}

/* 接线提示：
 *   resize() 末尾  -> fxPrepare(W, H, dpr)      （晚于 prepareWeb / bloom 重建）
 *   每帧          -> fxDraw(ctx, w, h, t, { boot: boot, hover: hover ? 1 : 0,
 *                                          glitch: fxGlitch })
 *   位置放在「暗角之后、drawHud 之前」，文字/DOM 永远压在本层上方；
 *   若放在 HUD 之后，扫描线与颗粒会轻微糊字（0.02 级别，仍可读但不划算）。
 */
