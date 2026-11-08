/* ────────────────────────────────────────────────────────────────────────────
 * 06 · deep — the deep-field plate
 *
 * The old plate was a black sheet: too empty, but a colourful wallpaper would
 * fight the star chart and the instruments. This keeps the void and adds depth
 * at the edge of perception, back to front:
 *
 *   base    gradient void + one hairline every 3 px of "glass"   (baked)
 *   band    a single thin galactic smear with grain,  alpha ≤0.05 (baked)
 *   nebula  cool teal/blue + a trace of warm brown,   alpha 0.06–0.16
 *   stars   three parallax tiers, slow sine drift, a few crosses
 *   grid    holographic floor under h*0.66,            alpha ≤0.05
 *   dust    46 motes rising, a few with a short tail
 *   sweep   one 0.05 band crossing the plate every 10.5 s
 *
 * deepPrepare() bakes every static layer once per resize; deepDraw() is a
 * handful of drawImage calls plus ~55 arcs. No filters, no gradients, and no
 * large allocations inside deepDraw.
 *
 * deepDraw() draws in LOGICAL units: the caller is expected to have applied
 * the device-pixel-ratio transform already (same convention as SP.far).
 * ──────────────────────────────────────────────────────────────────────────── */

var DEEP = {
  w: 0, h: 0, dpr: 1, ready: false, error: null,
  pad: 24,                 /* margin around the star layers, for drift */
  base: null, band: null, nebCool: null, nebWarm: null,
  far: null, mid: null, near: null,
  grid: null, gridScan: null, sweep: null, sweepH: 0,
  spark: [], dust: []
};

/* ── helpers ──────────────────────────────────────────────────────────────── */

function deepFin(v, def) {
  return isFinite(v) ? v : (isFinite(def) ? def : 0);
}

/* positive modulo — the drifts wrap forever without a visible seam */
function deepMod(v, m) {
  if (!isFinite(v) || !isFinite(m) || m <= 0) return 0;
  var r = v % m;
  return r < 0 ? r + m : r;
}

/* an offscreen canvas addressed in logical units: 0..w, 0..h */
function deepSurface(w, h, dpr) {
  var cv = makeCanvas(w * dpr, h * dpr);
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { cv: cv, c: c };
}

/* ── 1 · base plate ───────────────────────────────────────────────────────── */

function deepBase(w, h, dpr) {
  var surf = deepSurface(w, h, dpr);
  var c = surf.c;

  var g = c.createLinearGradient(0, 0, w * 0.30, h);
  g.addColorStop(0.00, '#070d18');
  g.addColorStop(0.34, '#060b16');
  g.addColorStop(0.70, '#04080f');
  g.addColorStop(1.00, '#03050b');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  /* a breath of atmosphere hanging just above the frame */
  var rg = Math.max(w, h);
  var top = c.createRadialGradient(w * 0.46, -h * 0.14, 0, w * 0.46, -h * 0.14, rg * 0.92);
  top.addColorStop(0, 'rgba(44,82,138,0.085)');
  top.addColorStop(0.52, 'rgba(28,52,98,0.032)');
  top.addColorStop(1, 'rgba(10,20,40,0)');
  c.fillStyle = top;
  c.fillRect(0, 0, w, h);

  /* the plate is glass — a hairline every three logical pixels */
  c.strokeStyle = 'rgba(150,196,236,0.012)';
  c.lineWidth = 0.5;
  c.beginPath();
  for (var y = 0.5; y < h; y += 3) { c.moveTo(0, y); c.lineTo(w, y); }
  c.stroke();

  return surf;
}

/* ── 2 · galactic band ────────────────────────────────────────────────────── */

function deepBand(w, h) {
  var bw = Math.max(24, Math.round(w * 0.55));
  var bh = Math.max(24, Math.round(h * 0.55));
  var cv = makeCanvas(bw, bh);
  var c = cv.getContext('2d');

  var cx = bw * 0.50, cy = bh * 0.44;
  var rad = Math.max(bw, bh) * 0.62;
  var rot = -0.44, cr = Math.cos(rot), sr = Math.sin(rot);

  c.save();
  c.translate(cx, cy);
  c.rotate(rot);
  c.scale(1, 0.30);
  var g = c.createRadialGradient(0, 0, 0, 0, 0, rad);
  g.addColorStop(0.00, 'rgba(132,164,214,0.34)');
  g.addColorStop(0.40, 'rgba(96,126,180,0.20)');
  g.addColorStop(0.72, 'rgba(58,84,140,0.09)');
  g.addColorStop(1.00, 'rgba(24,40,80,0)');
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, rad, 0, TAU); c.fill();
  c.restore();

  /* grain: the band is dust, so it must not be perfectly smooth */
  var rng = makeRng(0x51ED0A);
  for (var i = 0; i < 520; i++) {
    var a = rng() * TAU;
    var rr = Math.sqrt(rng()) * rad * 0.92;
    var px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.30;
    var gx = cx + px * cr - py * sr;
    var gy = cy + px * sr + py * cr;
    c.fillStyle = 'rgba(196,216,246,' + (0.04 + rng() * 0.16).toFixed(3) + ')';
    c.beginPath(); c.arc(gx, gy, 0.35 + rng() * 0.9, 0, TAU); c.fill();
  }

  return cv;
}

/* ── 3 · nebulae ──────────────────────────────────────────────────────────── */

/* painted small, then softened by a down/up resample — the baked "blur" */
function deepNebula(w, h, blobs, seed) {
  var nw = Math.max(24, Math.round(w * 0.32));
  var nh = Math.max(24, Math.round(h * 0.32));
  var raw = makeCanvas(nw, nh);
  var c = raw.getContext('2d');
  c.globalCompositeOperation = 'lighter';

  var rng = makeRng(seed);
  var i, k;

  for (i = 0; i < blobs.length; i++) {
    var b = blobs[i];
    var bx = nw * b.x, by = nh * b.y, br = Math.max(nw, nh) * b.r;
    var rgb = toRgb(b.hex);
    var c0 = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',';

    var g = c.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0.00, c0 + b.a.toFixed(3) + ')');
    g.addColorStop(0.38, c0 + (b.a * 0.55).toFixed(3) + ')');
    g.addColorStop(0.72, c0 + (b.a * 0.17).toFixed(3) + ')');
    g.addColorStop(1.00, c0 + '0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill();

    /* noise puffs — the cloud must not read as a perfect circle */
    for (k = 0; k < 22; k++) {
      var ang = rng() * TAU;
      var rr = Math.sqrt(rng()) * br * 0.82;
      var px = bx + Math.cos(ang) * rr;
      var py = by + Math.sin(ang) * rr;
      var pr = br * (0.10 + rng() * 0.22);
      var pa = b.a * (0.10 + rng() * 0.18);
      var pg = c.createRadialGradient(px, py, 0, px, py, pr);
      pg.addColorStop(0, c0 + pa.toFixed(3) + ')');
      pg.addColorStop(1, c0 + '0)');
      c.fillStyle = pg;
      c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
    }
  }

  var qw = Math.max(4, Math.round(nw * 0.34));
  var qh = Math.max(4, Math.round(nh * 0.34));
  var tiny = makeCanvas(qw, qh);
  var tc = tiny.getContext('2d');
  tc.imageSmoothingEnabled = true;
  tc.drawImage(raw, 0, 0, qw, qh);

  var soft = makeCanvas(nw, nh);
  var sc = soft.getContext('2d');
  sc.imageSmoothingEnabled = true;
  sc.drawImage(tiny, 0, 0, nw, nh);
  return soft;
}

/* ── 4 · stars ────────────────────────────────────────────────────────────── */

function deepStars(w, h, dpr, cfg) {
  var pad = DEEP.pad;
  var W = w + pad * 2, H = h + pad * 2;
  var surf = deepSurface(W, H, dpr);
  var c = surf.c;
  var rng = makeRng(cfg.seed);

  c.globalCompositeOperation = 'lighter';
  for (var i = 0; i < cfg.count; i++) {
    var x = rng() * W, y = rng() * H;
    var r = cfg.rmin + rng() * (cfg.rmax - cfg.rmin);
    var a = cfg.amin + rng() * (cfg.amax - cfg.amin);
    var roll = rng();
    var tint = roll < cfg.warm ? '201,160,106'
      : (roll < cfg.warm + 0.20 ? '150,208,242' : '206,228,246');

    c.fillStyle = 'rgba(' + tint + ',' + a.toFixed(3) + ')';
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();

    /* only the biggest carry a halo */
    if (r > cfg.halo) {
      c.fillStyle = 'rgba(' + tint + ',' + (a * 0.13).toFixed(3) + ')';
      c.beginPath(); c.arc(x, y, r * 2.8, 0, TAU); c.fill();
    }

    /* diffraction: four hairlines, near layer only */
    if (cfg.cross && rng() < cfg.cross) {
      var len = r * (3.6 + rng() * 3.2);
      c.strokeStyle = 'rgba(206,232,255,0.085)';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(x - len, y); c.lineTo(x + len, y);
      c.moveTo(x, y - len); c.lineTo(x, y + len);
      c.stroke();
    }
  }
  c.globalCompositeOperation = 'source-over';

  /* a few hot points that are re-lit every frame (the only live stars) */
  if (cfg.sparkle) {
    DEEP.spark = [];
    for (var k = 0; k < 7; k++) {
      var sx = pad + rng() * w, sy = pad + rng() * h;
      var sr = 0.9 + rng() * 0.7;
      c.fillStyle = 'rgba(224,242,255,0.50)';
      c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(214,238,255,0.10)';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(sx - 6.5, sy); c.lineTo(sx + 6.5, sy);
      c.moveTo(sx, sy - 6.5); c.lineTo(sx, sy + 6.5);
      c.stroke();
      DEEP.spark.push({
        x: sx - pad, y: sy - pad, r: sr,
        ph: rng() * TAU, sp: 0.6 + rng() * 1.1
      });
    }
  }

  return surf.cv;
}

/* ── 5 · holographic floor ────────────────────────────────────────────────── */

function deepGrid(w, h, dpr) {
  var surf = deepSurface(w, h, dpr);
  var c = surf.c;
  var hy = Math.round(h * 0.66);        /* horizon, one third up from below */
  var bottom = h * 1.06;
  var vx = w * 0.5;
  var i;

  /* the floor is lit from behind */
  var glow = c.createLinearGradient(0, hy - h * 0.13, 0, hy + h * 0.03);
  glow.addColorStop(0.00, 'rgba(92,150,210,0)');
  glow.addColorStop(0.68, 'rgba(96,164,222,0.040)');
  glow.addColorStop(1.00, 'rgba(140,200,240,0)');
  c.fillStyle = glow;
  c.fillRect(0, hy - h * 0.13, w, h * 0.16);

  c.strokeStyle = 'rgba(126,192,232,0.070)';
  c.lineWidth = 0.7;
  c.beginPath(); c.moveTo(0, hy + 0.5); c.lineTo(w, hy + 0.5); c.stroke();

  /* radials run to a vanishing point well below the plate */
  var N = 22;
  for (i = 0; i <= N; i++) {
    var u = i / N;
    var xb = vx + (u - 0.5) * w * 3.6;
    var amax = 0.020 + 0.016 * Math.abs(u - 0.5) * 2;
    var lg = c.createLinearGradient(vx, hy, xb, bottom);
    lg.addColorStop(0.00, 'rgba(110,198,238,0)');
    lg.addColorStop(0.42, 'rgba(110,198,238,' + (amax * 0.55).toFixed(4) + ')');
    lg.addColorStop(1.00, 'rgba(110,198,238,' + amax.toFixed(4) + ')');
    c.strokeStyle = lg;
    c.lineWidth = 0.55;
    c.beginPath(); c.moveTo(vx, hy); c.lineTo(xb, bottom); c.stroke();
  }

  /* rungs bunch up at the horizon, so distance reads as depth */
  var M = 20;
  for (i = 1; i <= M; i++) {
    var v = i / M;
    var y = hy + (bottom - hy) * Math.pow(v, 2.4);
    var a = 0.008 + 0.034 * Math.pow(v, 1.5);
    c.strokeStyle = 'rgba(104,180,228,' + a.toFixed(4) + ')';
    c.lineWidth = 0.45 + 0.30 * v;
    c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
  }

  /* let the floor dissolve instead of ending on a hard edge */
  var fade = c.createLinearGradient(0, h * 0.80, 0, h);
  fade.addColorStop(0, 'rgba(3,5,11,0)');
  fade.addColorStop(1, 'rgba(3,5,11,0.55)');
  c.fillStyle = fade;
  c.fillRect(0, h * 0.80, w, h * 0.20);

  return surf.cv;
}

/* a soft horizontal strip used for both scanner effects */
function deepStrip(w, h, dpr, tall, peak) {
  var surf = deepSurface(w, tall, dpr);
  var c = surf.c;

  var g = c.createLinearGradient(0, 0, 0, tall);
  g.addColorStop(0.00, 'rgba(126,180,226,0)');
  g.addColorStop(0.30, 'rgba(126,180,226,' + (peak * 0.40).toFixed(3) + ')');
  g.addColorStop(0.50, 'rgba(176,226,255,' + peak.toFixed(3) + ')');
  g.addColorStop(0.66, 'rgba(126,180,226,' + (peak * 0.45).toFixed(3) + ')');
  g.addColorStop(1.00, 'rgba(126,180,226,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, tall);

  /* a hairline core */
  c.fillStyle = 'rgba(190,232,255,' + Math.min(1, peak * 1.05).toFixed(3) + ')';
  c.fillRect(0, Math.round(tall * 0.5), w, 0.75);

  /* fade the ends so it never reads as a rectangle */
  c.globalCompositeOperation = 'destination-in';
  var hg = c.createLinearGradient(0, 0, w, 0);
  hg.addColorStop(0.00, 'rgba(0,0,0,0)');
  hg.addColorStop(0.16, 'rgba(0,0,0,1)');
  hg.addColorStop(0.84, 'rgba(0,0,0,1)');
  hg.addColorStop(1.00, 'rgba(0,0,0,0)');
  c.fillStyle = hg;
  c.fillRect(0, 0, w, tall);
  c.globalCompositeOperation = 'source-over';

  return surf.cv;
}

/* ── 6 · dust ─────────────────────────────────────────────────────────────── */

function deepSeedDust(w, h) {
  var rng = makeRng(0xD0571);
  DEEP.dust = [];
  for (var i = 0; i < 46; i++) {
    var near = rng() < 0.32;
    DEEP.dust.push({
      x: rng() * w,
      y: rng() * h,
      r: near ? 0.9 + rng() * 1.0 : 0.45 + rng() * 0.7,
      a: 0.05 + rng() * 0.15,
      vx: (rng() - 0.5) * 2.6,
      vy: 1.4 + rng() * 4.2,
      ph: rng() * TAU,
      sp: 0.14 + rng() * 0.42,
      trail: rng() < 0.24
    });
  }
}

/* ── prepare ──────────────────────────────────────────────────────────────── */

function deepPrepare(w, h, dpr) {
  w = Math.max(1, Math.round(deepFin(w, 1)));
  h = Math.max(1, Math.round(deepFin(h, 1)));
  if (!isFinite(dpr) || dpr <= 0) dpr = 1;
  dpr = Math.min(2, dpr);

  DEEP.w = w; DEEP.h = h; DEEP.dpr = dpr;
  DEEP.ready = false;
  DEEP.error = null;

  try {
    DEEP.base = deepBase(w, h, dpr).cv;
    DEEP.band = deepBand(w, h);

    DEEP.nebCool = deepNebula(w, h, [
      { x: 0.22, y: 0.28, r: 0.54, hex: '#2a6f8f', a: 0.40 },
      { x: 0.60, y: 0.62, r: 0.48, hex: '#2b3f7a', a: 0.36 },
      { x: 0.86, y: 0.22, r: 0.38, hex: '#2a6f8f', a: 0.26 },
      { x: 0.40, y: 0.86, r: 0.42, hex: '#26406f', a: 0.24 }
    ], 0x2A6F8F);

    DEEP.nebWarm = deepNebula(w, h, [
      { x: 0.70, y: 0.76, r: 0.34, hex: '#6b5240', a: 0.30 },
      { x: 0.16, y: 0.64, r: 0.28, hex: '#5c4a3a', a: 0.22 }
    ], 0x6B5240);

    DEEP.far = deepStars(w, h, dpr, {
      seed: 0x15EE7, count: 620,
      rmin: 0.25, rmax: 0.75, amin: 0.08, amax: 0.26,
      warm: 0.10, halo: 1.40, cross: 0, sparkle: false
    });
    DEEP.mid = deepStars(w, h, dpr, {
      seed: 0x2B4C9, count: 190,
      rmin: 0.60, rmax: 1.15, amin: 0.14, amax: 0.36,
      warm: 0.12, halo: 1.00, cross: 0.05, sparkle: false
    });
    DEEP.near = deepStars(w, h, dpr, {
      seed: 0x3C7A1, count: 48,
      rmin: 1.00, rmax: 2.00, amin: 0.20, amax: 0.52,
      warm: 0.16, halo: 1.20, cross: 0.20, sparkle: true
    });

    DEEP.grid = deepGrid(w, h, dpr);
    DEEP.gridScan = deepStrip(w, h, dpr, Math.max(8, Math.round(h * 0.07)), 0.050);
    DEEP.sweepH = Math.max(10, Math.round(h * 0.12));
    DEEP.sweep = deepStrip(w, h, dpr, DEEP.sweepH, 0.55);

    deepSeedDust(w, h);
    DEEP.ready = true;
  } catch (e) {
    /* a dead backdrop must never take the plate down with it */
    DEEP.error = e;
    DEEP.ready = false;
  }
}

/* ── draw ─────────────────────────────────────────────────────────────────── */

function deepDraw(c, w, h, t) {
  var s = DEEP;
  if (!s.ready || !c) return;

  w = deepFin(w, s.w); h = deepFin(h, s.h);
  if (!(w > 0)) w = s.w;
  if (!(h > 0)) h = s.h;
  t = deepFin(t, 0);

  c.save();
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';

  /* 1 · the void */
  c.drawImage(s.base, 0, 0, w, h);

  /* a ~48 s breath of ambient light */
  var breath = 0.5 + 0.5 * Math.sin(t * 0.131);
  c.fillStyle = 'rgba(22,48,86,' + (0.010 + breath * 0.014).toFixed(4) + ')';
  c.fillRect(0, 0, w, h);

  /* 2 · galactic band, barely there */
  c.globalAlpha = 0.036 + 0.010 * Math.sin(t * 0.087 + 2.1);
  c.drawImage(s.band, 0, 0, w, h);

  /* 3 · nebulae — two independent breaths, ~40 s and ~52 s */
  var nDriftX = Math.sin(t * 0.013) * 6;
  var nDriftY = Math.cos(t * 0.017 + 1.2) * 4;

  c.globalAlpha = 0.128 + 0.026 * Math.sin(t * 0.158 + 0.4);
  c.drawImage(s.nebCool,
    -w * 0.03 + nDriftX, -h * 0.03 + nDriftY, w * 1.06, h * 1.06);

  c.globalAlpha = 0.062 + 0.016 * Math.sin(t * 0.121 + 2.6);
  c.drawImage(s.nebWarm,
    -w * 0.02 - nDriftX * 0.6, -h * 0.02 - nDriftY * 0.5, w * 1.04, h * 1.04);

  /* 4 · stars — sine drift instead of unbounded travel, so edges never show */
  var pad = s.pad, W2 = w + pad * 2, H2 = h + pad * 2;
  var farX = Math.sin(t * 0.0072 + 3.1) * 2.4;
  var farY = Math.cos(t * 0.0061 + 0.7) * 1.4;
  var midX = Math.sin(t * 0.0138 + 1.2) * 4.4;
  var midY = Math.cos(t * 0.0113) * 2.2;
  var nearX = Math.sin(t * 0.0300 + 2.4) * 10.0;
  var nearY = Math.cos(t * 0.0210 + 1.1) * 4.2;

  c.globalAlpha = 1;
  c.drawImage(s.far, -pad + farX, -pad + farY, W2, H2);

  c.globalAlpha = 0.96 + 0.04 * Math.sin(t * 0.33);
  c.drawImage(s.mid, -pad + midX, -pad + midY, W2, H2);

  c.globalAlpha = 0.94 + 0.06 * Math.sin(t * 0.41 + 1.9);
  c.drawImage(s.near, -pad + nearX, -pad + nearY, W2, H2);

  /* 5 · the seven live points */
  var i, sp;
  c.fillStyle = 'rgba(220,240,255,1)';
  for (i = 0; i < s.spark.length; i++) {
    sp = s.spark[i];
    var sa = 0.12 + 0.28 * Math.max(0, Math.sin(t * sp.sp + sp.ph));
    var sx = sp.x + nearX, sy = sp.y + nearY;
    c.globalAlpha = sa;
    c.beginPath(); c.arc(sx, sy, sp.r, 0, TAU); c.fill();
    c.globalAlpha = sa * 0.30;
    c.beginPath(); c.arc(sx, sy, sp.r * 3.4, 0, TAU); c.fill();
  }

  /* 6 · the floor */
  c.globalAlpha = 1;
  c.drawImage(s.grid, 0, 0, w, h);

  /* a scan line crawling down the floor every 17 s */
  var gph = deepMod(t, 17) / 17;
  var genv = Math.sin(Math.PI * gph);
  if (genv > 0.02) {
    var gsh = s.gridScan.height / (s.dpr || 1);
    var gy = h * 0.66 + gph * (h * 0.36);
    c.globalAlpha = 0.60 * genv;
    c.globalCompositeOperation = 'lighter';
    c.drawImage(s.gridScan, 0, gy - gsh * 0.5, w, gsh);
    c.globalCompositeOperation = 'source-over';
  }

  /* 7 · dust rising */
  c.fillStyle = 'rgba(188,220,248,1)';
  c.strokeStyle = 'rgba(188,220,248,1)';
  var spanY = h + 16, spanX = w + 8;
  for (i = 0; i < s.dust.length; i++) {
    var m = s.dust[i];
    var mx = deepMod(m.x + m.vx * t, spanX) - 4;
    var my = deepMod(m.y - m.vy * t, spanY) - 8;
    var ma = m.a * (0.62 + 0.38 * Math.sin(t * m.sp + m.ph));
    c.globalAlpha = ma;
    c.beginPath(); c.arc(mx, my, m.r, 0, TAU); c.fill();
    if (m.trail) {
      c.globalAlpha = ma * 0.42;
      c.lineWidth = m.r * 0.55;
      c.beginPath();
      c.moveTo(mx, my + m.r * 1.2);
      c.lineTo(mx, my + m.r * 1.2 + 5 + m.r * 2);
      c.stroke();
    }
  }

  /* 8 · the sweep — one pass every 10.5 s, never brighter than 0.05 */
  var sph = deepMod(t, 10.5) / 10.5;
  var senv = Math.sin(Math.PI * sph);
  if (senv > 0.02) {
    var sy2 = -s.sweepH + sph * (h + s.sweepH * 2);
    c.globalAlpha = 0.05 * senv;
    c.globalCompositeOperation = 'lighter';
    c.drawImage(s.sweep, 0, sy2, w, s.sweepH);
    c.globalCompositeOperation = 'source-over';
  }

  c.globalAlpha = 1;
  c.restore();
}
