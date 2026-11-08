/* ────────────────────────────────────────────────────────────────────────────
 * 03 · space — far field (nebula + stars), the silver ring, the six planets
 * ──────────────────────────────────────────────────────────────────────────── */

var SP = {
  w: 0, h: 0, dpr: 1,
  far: null, ringBack: null, ringFront: null,
  vignette: null,
  stars: [], motes: [],
  geom: null,
  planets: [],
  spin: 0, spinTarget: 0,
  selected: null
};

function ringGeom(w, h) {
  var rx = Math.min(w * 0.128, h * 0.190);
  var ry = rx * 1.34;
  return { cx: w * 0.170, cy: h * 0.492, rx: rx, ry: ry, rot: -14 * DEG };
}

function ringPoint(g, a) {
  var x = Math.cos(a) * g.rx, y = Math.sin(a) * g.ry;
  var c = Math.cos(g.rot), s = Math.sin(g.rot);
  return { x: g.cx + x * c - y * s, y: g.cy + x * s + y * c, z: Math.sin(a), a: a };
}

/* ── far field ─────────────────────────────────────────────────────────────── */

function drawFar(c, w, h) {
  var rng = makeRng(0x9E3779B1);

  var bg = c.createLinearGradient(0, 0, w * 0.35, h);
  bg.addColorStop(0, '#04060d');
  bg.addColorStop(0.42, '#070c1a');
  bg.addColorStop(0.72, '#05090f');
  bg.addColorStop(1, '#03050a');
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);

  /* galactic band — one very long soft smear across the plate */
  c.save();
  c.translate(w * 0.56, h * 0.46);
  c.rotate(-0.42);
  var band = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.72);
  band.addColorStop(0, 'rgba(74,104,168,0.115)');
  band.addColorStop(0.45, 'rgba(48,72,132,0.055)');
  band.addColorStop(1, 'rgba(20,32,64,0)');
  c.scale(1, 0.34);
  c.fillStyle = band;
  c.beginPath(); c.arc(0, 0, w * 0.72, 0, TAU); c.fill();
  c.restore();

  /* nebula blooms */
  var blooms = [
    { x: 0.20, y: 0.30, r: 0.46, hx: '#1b3268', a: 0.20 },
    { x: 0.44, y: 0.72, r: 0.40, hx: '#123a4a', a: 0.15 },
    { x: 0.78, y: 0.24, r: 0.44, hx: '#2a2159', a: 0.17 },
    { x: 0.88, y: 0.78, r: 0.36, hx: '#0f2c46', a: 0.13 },
    { x: 0.60, y: 0.50, r: 0.52, hx: '#101d3c', a: 0.16 },
    { x: 0.32, y: 0.86, r: 0.30, hx: '#241d4d', a: 0.12 }
  ];
  c.globalCompositeOperation = 'lighter';
  blooms.forEach(function (b) {
    var g = c.createRadialGradient(w * b.x, h * b.y, 0, w * b.x, h * b.y, Math.max(w, h) * b.r);
    var rgb = hexRgb(b.hx);
    g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + b.a + ')');
    g.addColorStop(0.55, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (b.a * 0.32) + ')');
    g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });

  /* stars */
  SP.stars = [];
  function tier(count, rmin, rmax, amin, amax, twinkle) {
    for (var i = 0; i < count; i++) {
      var s = {
        x: rng() * w, y: rng() * h,
        r: rmin + rng() * (rmax - rmin),
        a: amin + rng() * (amax - amin),
        ph: rng() * TAU, sp: 0.35 + rng() * 1.1,
        tw: twinkle ? 1 : 0,
        warm: rng() < 0.18
      };
      SP.stars.push(s);
      if (!twinkle) {
        c.fillStyle = 'rgba(' + (s.warm ? '255,236,208' : '214,230,255') + ',' + s.a + ')';
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill();
      }
    }
  }
  tier(760, 0.35, 0.9, 0.12, 0.32, false);
  tier(190, 0.85, 1.5, 0.20, 0.48, true);
  tier(42, 1.5, 2.5, 0.35, 0.78, true);

  /* diffraction crosses on a handful */
  for (var k = 0; k < 10; k++) {
    var sx = rng() * w, sy = rng() * h, len = 4 + rng() * 9;
    c.strokeStyle = 'rgba(200,222,255,0.16)';
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(sx - len, sy); c.lineTo(sx + len, sy);
    c.moveTo(sx, sy - len); c.lineTo(sx, sy + len);
    c.stroke();
  }

  /* distant dust motes (drawn live, positions seeded here) */
  SP.motes = [];
  for (var m = 0; m < 26; m++) {
    SP.motes.push({ x: rng() * w, y: rng() * h, r: 0.6 + rng() * 1.6, a: 0.06 + rng() * 0.12, ph: rng() * TAU, sp: 0.05 + rng() * 0.16 });
  }

  c.globalCompositeOperation = 'source-over';
}

/* ── ring ──────────────────────────────────────────────────────────────────── */

function ellipsePt(g, a, dr) {
  var rx = g.rx + (dr || 0), ry = g.ry + (dr || 0) * 1.55;
  var x = Math.cos(a) * rx, y = Math.sin(a) * ry;
  var c = Math.cos(g.rot), s = Math.sin(g.rot);
  return { x: g.cx + x * c - y * s, y: g.cy + x * s + y * c };
}

function drawRingHalf(c, g, w, h, front) {
  /* the near half catches the light, the far half falls away */
  c.save();
  c.globalAlpha = front ? 1 : 0.78;
  var a0 = front ? 0.0001 : Math.PI + 0.0001;
  var a1 = front ? Math.PI - 0.0001 : TAU - 0.0001;

  var pL = ellipsePt(g, Math.PI), pR = ellipsePt(g, 0);

  /* 1. soft outer glow, three widening passes */
  c.globalCompositeOperation = 'lighter';
  [[26, 0.030], [12, 0.045], [4.5, 0.055]].forEach(function (pass) {
    c.beginPath();
    c.ellipse(g.cx, g.cy, g.rx, g.ry, g.rot, a0, a1);
    c.lineWidth = pass[0];
    c.strokeStyle = 'rgba(126,158,206,' + pass[1] + ')';
    c.stroke();
  });
  c.globalCompositeOperation = 'source-over';

  /* 2. the metal itself */
  var metal = c.createLinearGradient(pL.x, pL.y, pR.x, pR.y);
  metal.addColorStop(0.00, 'rgba(78,92,114,0.55)');
  metal.addColorStop(0.16, 'rgba(150,168,196,0.85)');
  metal.addColorStop(0.34, 'rgba(226,238,255,0.98)');
  metal.addColorStop(0.42, 'rgba(255,255,255,1)');
  metal.addColorStop(0.58, 'rgba(188,204,228,0.92)');
  metal.addColorStop(0.78, 'rgba(118,136,164,0.75)');
  metal.addColorStop(1.00, 'rgba(62,74,96,0.45)');
  c.beginPath();
  c.ellipse(g.cx, g.cy, g.rx, g.ry, g.rot, a0, a1);
  c.lineWidth = 2.1;
  c.strokeStyle = metal;
  c.stroke();

  /* 2b. chromatic edges — the metal refracts a little */
  c.beginPath();
  c.ellipse(g.cx, g.cy, g.rx + 1.7, g.ry + 2.6, g.rot, a0, a1);
  c.lineWidth = 0.8;
  c.strokeStyle = 'rgba(108,160,255,0.22)';
  c.stroke();
  c.beginPath();
  c.ellipse(g.cx, g.cy, g.rx - 1.7, g.ry - 2.6, g.rot, a0, a1);
  c.lineWidth = 0.8;
  c.strokeStyle = 'rgba(255,204,168,0.15)';
  c.stroke();

  /* 3. hairlines: one inside, one outside — gives it thickness */
  c.beginPath();
  c.ellipse(g.cx, g.cy, g.rx + 5.5, g.ry + 8.5, g.rot, a0, a1);
  c.lineWidth = 0.7;
  c.strokeStyle = 'rgba(196,216,246,0.26)';
  c.stroke();
  c.beginPath();
  c.ellipse(g.cx, g.cy, g.rx - 5, g.ry - 7.8, g.rot, a0, a1);
  c.lineWidth = 0.6;
  c.strokeStyle = 'rgba(255,255,255,0.20)';
  c.stroke();

  /* 4. ticks */
  for (var i = 0; i < 180; i++) {
    var a = (i / 180) * TAU;
    var sgn = Math.sin(a) >= 0 ? 1 : -1;
    if ((front && sgn < 0) || (!front && sgn > 0)) continue;
    var major = i % 15 === 0;
    var p0 = ellipsePt(g, a, major ? 4 : 2.6);
    var p1 = ellipsePt(g, a, major ? 12 : 7);
    c.beginPath();
    c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y);
    c.lineWidth = major ? 0.9 : 0.6;
    c.strokeStyle = 'rgba(206,226,255,' + (major ? 0.26 : 0.11) + ')';
    c.stroke();
  }

  /* 5. specular sweep on the lit flank */
  var sA = front ? -0.15 : Math.PI * 1.06;
  var sB = front ? Math.PI * 0.30 : Math.PI * 1.42;
  var pS0 = ellipsePt(g, sA), pS1 = ellipsePt(g, sB);
  var sheen = c.createLinearGradient(pS0.x, pS0.y, pS1.x, pS1.y);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  c.beginPath();
  c.ellipse(g.cx, g.cy, g.rx, g.ry, g.rot, sA, sB);
  c.lineWidth = 5.4;
  c.strokeStyle = sheen;
  c.stroke();

  /* the flare where the sheen peaks */
  var pMidS = ellipsePt(g, (sA + sB) / 2);
  c.globalCompositeOperation = 'lighter';
  var fl = c.createRadialGradient(pMidS.x, pMidS.y, 0, pMidS.x, pMidS.y, 30);
  fl.addColorStop(0, 'rgba(238,246,255,0.30)');
  fl.addColorStop(0.45, 'rgba(190,216,255,0.07)');
  fl.addColorStop(1, 'rgba(190,216,255,0)');
  c.fillStyle = fl;
  c.beginPath(); c.arc(pMidS.x, pMidS.y, 30, 0, TAU); c.fill();
  c.globalCompositeOperation = 'source-over';

  c.restore();
}

/* ── planets ───────────────────────────────────────────────────────────────── */

var LIGHT = { x: 0.52, y: -0.62 };

function buildPlanets(w, h) {
  SP.planets = SUBJECTS.map(function (s, i) {
    return {
      id: s.id,
      subject: s,
      base: (i / Math.max(1, SUBJECTS.length)) * TAU,
      r: 5.4 + s.weight * 5.6,
      hover: 0,
      sel: 0,
      x: 0, y: 0, z: 0, sc: 1,
      hasRing: i === 3
    };
  });
  SP.selected = SP.selected || (BY_SUBJECT['math'] ? 'math' : SUBJECTS[0] && SUBJECTS[0].id);
  var sel = SP.planets.filter(function (p) { return p.id === SP.selected; })[0];
  SP.spin = SP.spinTarget = Math.PI / 2 - (sel ? sel.base : 0);
}

function planetPositions(dt) {
  var g = SP.geom;
  var n = Math.max(1, SP.planets.length);
  /* rotate the short way */
  var diff = SP.spinTarget - SP.spin;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  SP.spin += diff * clamp(2.2 * dt, 0, 1);

  SP.planets.forEach(function (p) {
    var a = SP.spin + p.base;
    var pt = ringPoint(g, a);
    var z = Math.sin(a);
    var depth = 0.80 + 0.34 * (z + 1) / 2;
    var lift = p.r * depth * 1.15 + p.hover * 8 + p.sel * 3;
    var nx = pt.x - g.cx, ny = pt.y - g.cy;
    var nl = Math.sqrt(nx * nx + ny * ny) || 1;
    p.x = pt.x + (nx / nl) * lift;
    p.y = pt.y + (ny / nl) * lift;
    p.z = z;
    p.sc = depth * (1 + p.hover * 0.16 + p.sel * 0.05);
    p.ang = a;
  });
}

function drawPlanet(c, p, t, boot) {
  var r = p.r * p.sc;
  if (r < 0.5) return;
  var hue = p.subject.hue;
  var x = p.x, y = p.y;
  var a = clamp((0.52 + 0.48 * (p.z + 1) / 2) * boot, 0, 1);
  if (a <= 0.01) return;

  c.save();
  c.globalAlpha = a;

  /* atmosphere */
  var glowR = r * (4.4 + p.hover * 1.6 + p.sel * 0.8);
  var g1 = c.createRadialGradient(x, y, r * 0.6, x, y, glowR);
  g1.addColorStop(0, rgbaMix(hue, 0.15, 0.30 + p.hover * 0.16 + p.sel * 0.06));
  g1.addColorStop(0.4, rgba(hue, 0.09));
  g1.addColorStop(1, rgba(hue, 0));
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = g1;
  c.beginPath(); c.arc(x, y, glowR, 0, TAU); c.fill();
  c.globalCompositeOperation = 'source-over';

  /* body */
  var lx = LIGHT.x * r * 0.42, ly = LIGHT.y * r * 0.42;
  var g2 = c.createRadialGradient(x + lx, y + ly, r * 0.08, x, y, r * 1.02);
  g2.addColorStop(0.00, rgbaMix(hue, 0.62, 1));
  g2.addColorStop(0.32, rgbaMix(hue, 0.22, 1));
  g2.addColorStop(0.68, hue);
  g2.addColorStop(0.92, shade(hue, -0.62));
  g2.addColorStop(1.00, shade(hue, -0.84));
  c.fillStyle = g2;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();

  /* terminator */
  var g3 = c.createRadialGradient(x - lx * 1.9, y - ly * 1.9, r * 0.2, x - lx * 0.5, y - ly * 0.5, r * 1.5);
  g3.addColorStop(0, 'rgba(0,0,0,0)');
  g3.addColorStop(0.55, 'rgba(2,4,10,0.28)');
  g3.addColorStop(1, 'rgba(2,4,10,0.86)');
  c.fillStyle = g3;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();

  /* specular hotspot */
  var hx = x + lx * 1.35, hy = y + ly * 1.35;
  var g4 = c.createRadialGradient(hx, hy, 0, hx, hy, r * 0.42);
  g4.addColorStop(0, 'rgba(255,255,255,0.55)');
  g4.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g4;
  c.beginPath(); c.arc(hx, hy, r * 0.42, 0, TAU); c.fill();

  /* rim light on the lit limb */
  var lang = Math.atan2(LIGHT.y, LIGHT.x);
  c.beginPath();
  c.arc(x, y, r * 0.97, lang - 1.05, lang + 1.05);
  c.lineWidth = 0.9;
  c.strokeStyle = 'rgba(255,255,255,' + (0.55 + p.hover * 0.25) + ')';
  c.stroke();

  /* atmosphere limb all the way round */
  c.beginPath();
  c.arc(x, y, r + 0.7, 0, TAU);
  c.lineWidth = 1.1;
  c.strokeStyle = rgba(hue, 0.28 + p.hover * 0.2);
  c.stroke();

  /* optional planet ring */
  if (p.hasRing) {
    c.save();
    c.translate(x, y);
    c.rotate(-0.42);
    c.beginPath();
    c.ellipse(0, 0, r * 2.1, r * 0.62, 0, 0, TAU);
    c.lineWidth = 1.1;
    c.strokeStyle = rgba(hue, 0.30 + p.hover * 0.2);
    c.stroke();
    c.restore();
  }

  /* reticle for the selected one */
  if (p.sel > 0.02) {
    var R = r * 2.35 + 6;
    c.globalAlpha = a * p.sel;
    c.strokeStyle = rgba(hue, 0.55);
    c.lineWidth = 1;
    var br = R * 0.30;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      c.beginPath();
      c.moveTo(x + q[0] * R, y + q[1] * (R - br));
      c.lineTo(x + q[0] * R, y + q[1] * R);
      c.lineTo(x + q[0] * (R - br), y + q[1] * R);
      c.stroke();
    });
    /* breathing halo */
    var pulse = 0.5 + 0.5 * Math.sin(t * 1.9);
    c.beginPath();
    c.arc(x, y, R + 3 + pulse * 3, 0, TAU);
    c.strokeStyle = rgba(hue, 0.10 + pulse * 0.10);
    c.lineWidth = 1;
    c.stroke();
    c.globalAlpha = a;
  }

  /* label */
  var lab = p.subject.name;
  var la = p.hover > 0.5 ? 1 : (p.sel > 0.5 ? 0.78 : 0.46);
  c.font = font(10.5, 500);
  tracked(c, 2.2);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = 'rgba(2,5,12,0.9)';
  c.shadowBlur = 6;
  c.fillStyle = rgbaMix(hue, 0.42, la * a);
  c.fillText(lab, x, y + r * 2.4 + (p.sel > 0.5 ? 18 : 9));
  tracked(c, 0);

  c.restore();
}
