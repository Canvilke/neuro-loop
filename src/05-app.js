/* ────────────────────────────────────────────────────────────────────────────
 * 05 · app — the React panel, the render loop, and the console deck
 * ──────────────────────────────────────────────────────────────────────────── */

/* Nothing below may escape: a throw while this bundle evaluates takes the whole
   client down to a black window. Everything is caught and shown on the plate. */
var NL_ERR = null;
/* set by mountScene; lets the boot overlay replay the ring assembly */
var NL_ReplayBoot = null;

function errText(e) {
  try { return String((e && (e.stack || e.message)) || e); }
  catch (x) { return 'unprintable error'; }
}

function paintError(c, w, h, msg) {
  if (!c) return;
  try {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#05070c';
    c.fillRect(0, 0, w || 800, h || 400);
    c.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    c.fillStyle = '#ff8b98';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    String(msg).split('\n').slice(0, 24).forEach(function (ln, i) {
      c.fillText(ln.slice(0, 140), 14, 14 + i * 15);
    });
  } catch (x) { /* the report itself must never throw */ }
}

try {
  buildData(SEED);
  loadStore();
  buildPlanets(0, 0);
  if (STORE.selected && BY_SUBJECT[STORE.selected]) {
    SP.selected = STORE.selected;
    var _p0 = SP.planets.filter(function (p) { return p.id === SP.selected; })[0];
    SP.spin = SP.spinTarget = Math.PI / 2 - (_p0 ? _p0.base : 0);
  }
  /* 后端是加分项，不是前置条件：先让星图画出来，再去问它。 */
  nlQueueLoad();
  nlSync(function () { nlFlush(); });
} catch (e) {
  NL_ERR = e;
}

var PANEL_ID = 'neuro-loop';
var CONSOLE_H = 88;
var consoleHot = null;

var CSS = [
  '.nl-root{position:relative;width:100%;height:100%;min-height:520px;overflow:hidden;',
  'background:#04060d;contain:paint;isolation:isolate;}',
  '.nl-canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline:none;}',
  '.nl-canvas.is-live{cursor:pointer;}',
  '.nl-canvas.is-drag{cursor:grabbing;}',
  '.nl-err{position:absolute;inset:0;margin:0;padding:22px;overflow:auto;',
  'color:#ff8b98;background:#05070c;white-space:pre-wrap;word-break:break-word;',
  'font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}'
].join('');

function cached(w, h, dpr, draw) {
  var cv = makeCanvas(w * dpr, h * dpr);
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(c);
  return cv;
}

/* ── console deck ──────────────────────────────────────────────────────────── */

function consoleLayout(w, h) {
  var y0 = h - CONSOLE_H;
  var subj = BY_SUBJECT[SP.selected] || {};
  var stat = subj.stat || { hit: 0, acc: 0, blind: 0, nodes: 0 };
  var fp = subj.fp || 0;
  var mods = [
    { label: 'HIT · 命中率', value: stat.hit.toFixed(2), bar: stat.hit },
    { label: 'ACC · 准确率', value: stat.acc.toFixed(2), bar: stat.acc },
    { label: 'BLIND · 盲区', value: String(stat.blind), tone: stat.blind > 0 ? 'alarm' : null },
    { label: 'FALSE+ · 假阳性', value: String(fp), tone: fp > 0 ? 'alarm' : null },
    { label: 'NODE · 考点', value: String(stat.nodes) }
  ];
  var cols = w < 780 ? 2 : (w < 1060 ? 3 : 5);
  mods = mods.slice(0, cols);
  var colW = cols === 5 ? 128 : (cols === 3 ? 124 : 112);
  var bw1 = 96, bw2 = 44, gap = 8;
  var upW = WEB.level === 1 ? 88 : 0;
  var total = (upW ? upW + gap : 0) + bw1 + gap + bw2 + gap + bw2;
  var bx = Math.max(34 + cols * colW + 16, w - 34 - total);
  var by = y0 + 26;
  var btns = [];
  var cur = bx;
  if (upW) { btns.push({ id: 'up', x: cur, y: by, w: upW, h: 26, label: '↑ 返回' }); cur += upW + gap; }
  btns.push({ id: 'reset', x: cur, y: by, w: bw1, h: 26, label: 'RESET' });
  cur += bw1 + gap;
  btns.push({ id: 'zoomout', x: cur, y: by, w: bw2, h: 26, label: '−' });
  cur += bw2 + gap;
  btns.push({ id: 'zoomin', x: cur, y: by, w: bw2, h: 26, label: '+' });
  return { y0: y0, mods: mods, btns: btns, colW: colW, x0: 34 };
}

function drawConsole(c, w, h) {
  var L = consoleLayout(w, h);
  var y0 = L.y0;

  var line = c.createLinearGradient(0, 0, w, 0);
  line.addColorStop(0, 'rgba(150,190,235,0)');
  line.addColorStop(0.12, 'rgba(150,190,235,0.22)');
  line.addColorStop(0.88, 'rgba(150,190,235,0.22)');
  line.addColorStop(1, 'rgba(150,190,235,0)');
  c.fillStyle = line;
  c.fillRect(0, y0, w, 1);

  var wash = c.createLinearGradient(0, y0, 0, h);
  wash.addColorStop(0, 'rgba(5,9,17,0.40)');
  wash.addColorStop(1, 'rgba(4,7,14,0.82)');
  c.fillStyle = wash;
  c.fillRect(0, y0 + 1, w, CONSOLE_H - 1);

  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';

  L.mods.forEach(function (m, i) {
    var x = L.x0 + i * L.colW;
    if (i > 0) {
      c.fillStyle = 'rgba(150,190,235,0.09)';
      c.fillRect(x - 18, y0 + 16, 1, 56);
    }

    c.font = mono(8.6, 600);
    tracked(c, 2.0);
    c.fillStyle = 'rgba(172,206,240,0.78)';
    c.fillText(m.label, x, y0 + 24);
    tracked(c, 0);

    c.font = mono(22, 600);
    c.shadowColor = m.tone === 'alarm' ? 'rgba(255,80,100,0.45)' : 'rgba(120,205,255,0.30)';
    c.shadowBlur = 14;
    c.fillStyle = m.tone === 'alarm' ? 'rgba(255,132,146,1)' : 'rgba(240,250,255,0.98)';
    c.fillText(m.value, x, y0 + 52);

    var barW = 92, by = y0 + 62;
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.fillRect(x, by, barW, 2);
    if (m.bar !== undefined) {
      c.fillStyle = m.tone === 'alarm' ? 'rgba(255,110,126,0.92)' : 'rgba(150,225,255,0.88)';
      c.fillRect(x, by, barW * clamp(m.bar, 0, 1), 2);
    }
    c.fillStyle = 'rgba(255,255,255,0.10)';
    for (var k = 1; k < 10; k++) c.fillRect(x + barW * k / 10, by - 2, 1, 6);
  });

  /* controls */
  L.btns.forEach(function (b) {
    var hot = consoleHot === b.id;
    c.strokeStyle = hot ? 'rgba(160,232,255,0.75)' : 'rgba(158,198,238,0.34)';
    c.lineWidth = 1;
    c.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    c.font = mono(9.5, 600);
    tracked(c, 1.8);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = hot ? 'rgba(222,246,255,1)' : 'rgba(190,218,244,0.88)';
    c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
    tracked(c, 0);
  });

  /* the manual, in one line */
  var last = L.btns[L.btns.length - 1];
  c.textAlign = 'right';
  c.textBaseline = 'alphabetic';
  c.font = mono(8.2, 500);
  tracked(c, 1.4);
  c.fillStyle = 'rgba(158,190,224,0.62)';
  c.fillText('拖动 旋转　·　滚轮 缩放　·　双击 复位　·　点击 换科', last.x + last.w, y0 + 74);
  tracked(c, 0);
  c.textAlign = 'left';
}

/* ── scene ─────────────────────────────────────────────────────────────────── */

function mountScene(root, cv) {
  var ctx = cv.getContext('2d', { alpha: false });
  if (NL_ERR) throw NL_ERR;
  var bloom = makeCanvas(2, 2), bctx = bloom.getContext('2d');
  var vig = null;
  var w = 0, h = 0, dpr = 1;
  var bootT = 0, boot = 0, t = 0, last = 0, raf = 0, glitchT = 0, mailAt = 0;
  var hover = null;

  /* the overlay calls this while it is still fading, so the ring re-assembles
   * underneath it instead of the panel just appearing */
  NL_ReplayBoot = function () {
    bootT = 0;
    boot = 0;
    WEB.reveal = 0;
    glitchT = 1;
  };
  var shardList = [];
  var planets = SP.planets;
  var drag = { on: false, x: 0, y: 0, moved: 0 };

  function resize() {
    var rect = root.getBoundingClientRect();
    var W = Math.max(360, Math.round(rect.width || 0));
    var H = Math.max(360, Math.round((rect.height || 0) || (window.innerHeight - 96)));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = W; h = H;

    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    SP.w = W; SP.h = H; SP.dpr = dpr;
    SP.geom = ringGeom(W, H);
    SP.ringBack = cached(W, H, dpr, function (c) { drawRingHalf(c, SP.geom, W, H, false); });
    SP.ringFront = cached(W, H, dpr, function (c) { drawRingHalf(c, SP.geom, W, H, true); });

    bloom = makeCanvas(W * dpr * 0.25, H * dpr * 0.25);
    bctx = bloom.getContext('2d');

    vig = ctx.createRadialGradient(W * 0.54, H * 0.44, Math.min(W, H) * 0.22,
      W * 0.54, H * 0.44, Math.max(W, H) * 0.82);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.58, 'rgba(1,2,6,0.20)');
    vig.addColorStop(1, 'rgba(0,1,4,0.72)');

    deepPrepare(W, H, dpr);
    fxPrepare(W, H, dpr);

    prepareWeb(W, H);
    planetPositions(0.016);
    WEB.reveal = WEB.reveal > 0.2 ? WEB.reveal : 0;
  }

  /* ── picking ─────────────────────────────────────────────────────────────── */

  function local(e) {
    var rect = cv.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitTest(x, y) {
    var i, dx, dy;
    for (i = 0; i < SP.planets.length; i++) {
      var p = SP.planets[i];
      dx = x - p.x; dy = y - p.y;
      if (dx * dx + dy * dy <= 900) return { kind: 'planet', ref: p, x: p.x, y: p.y };
    }
    for (i = 0; i < shardList.length; i++) {
      var s = shardList[i];
      dx = x - s.x; dy = y - s.y;
      if (dx * dx + dy * dy <= 196) return { kind: 'shard', ref: s, x: s.x, y: s.y };
    }
    var g = WEB.g;
    if (g) {
      for (i = 0; i < g.nodes.length; i++) {
        var nd = g.nodes[i];
        if (nd.x === undefined) continue;
        var hr = (nd.rr || 8) + (nd.isGroup ? 13 : 7);
        dx = x - nd.x; dy = y - nd.y;
        if (dx * dx + dy * dy <= hr * hr) {
          return { kind: nd.isGroup ? 'block' : 'node', ref: nd, x: nd.x, y: nd.y };
        }
      }
    }
    return null;
  }

  function consoleAt(x, y) {
    var L = consoleLayout(w, h);
    for (var i = 0; i < L.btns.length; i++) {
      var b = L.btns[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  }

  function applyConsole(id) {
    if (id === 'up') backGroup();
    else if (id === 'reset') resetView();
    else if (id === 'zoomin') WEB.zoomT = clamp(WEB.zoomT * 1.18, 0.62, 2.4);
    else if (id === 'zoomout') WEB.zoomT = clamp(WEB.zoomT * 0.855, 0.62, 2.4);
    WEB.ripples.push({ x: WEB.cx, y: WEB.cy, t0: performance.now() / 1000, hue: '#9fe4f2', max: 40 });
  }

  function switchSubject(id) {
    if (!BY_SUBJECT[id] || id === SP.selected) return;
    var p = SP.planets.filter(function (q) { return q.id === id; })[0];
    SP.selected = id;
    STORE.selected = id;
    saveStore();
    if (p) SP.spinTarget = Math.PI / 2 - p.base;
    glitchT = 1;
    prepareWeb(w, h);
    WEB.reveal = 0;
    WEB.pinned = null;
    WEB.ask = null;
    WEB.level = 0;
    WEB.group = null;
    hover = null;
    shardList = [];
    WEB.ripples.push({
      x: p ? p.x : WEB.cx, y: p ? p.y : WEB.cy,
      t0: performance.now() / 1000, hue: p ? p.subject.hue : '#9fe4f2',
      max: p ? Math.max(40, p.r * 9) : 90
    });
  }

  /* ── pointer ─────────────────────────────────────────────────────────────── */

  function onMove(e) {
    var q = local(e);
    if (drag.on) {
      var ddx = q.x - drag.x, ddy = q.y - drag.y;
      drag.moved += Math.abs(ddx) + Math.abs(ddy);
      WEB.rotYT += ddx * 0.0072;
      WEB.rotXT = clamp(WEB.rotXT + ddy * 0.0052, -WEB_TILT, WEB_TILT);
      drag.x = q.x; drag.y = q.y;
      hover = null;
      return;
    }
    consoleHot = consoleAt(q.x, q.y);
    hover = consoleHot ? null : hitTest(q.x, q.y);
    cv.classList.toggle('is-live', !!hover || !!consoleHot);
  }

  function onDown(e) {
    var q = local(e);
    var btn = consoleAt(q.x, q.y);
    if (btn) { applyConsole(btn); return; }
    drag.on = true; drag.x = q.x; drag.y = q.y; drag.moved = 0;
    cv.classList.add('is-drag');
  }

  function onUp(e) {
    var q = local(e);
    var wasClick = drag.on && drag.moved < 6;
    drag.on = false;
    cv.classList.remove('is-drag');
    if (!wasClick) return;
    var hit = hitTest(q.x, q.y);
    if (!hit) { WEB.pinned = null; WEB.ask = null; return; }
    if (hit.kind === 'planet') {
      switchSubject(hit.ref.id);
    } else if (hit.kind === 'shard') {
      if (hit.ref.state !== 'smooth') {
        flattenShard(hit.ref.sh);
        var p = selectedPlanet();
        WEB.ripples.push({
          x: hit.ref.x, y: hit.ref.y, t0: performance.now() / 1000,
          hue: hit.ref.state === 'fp' ? '#ff6a7a' : '#9fe4f2', max: 54
        });
      }
    } else if (hit.kind === 'block') {
      if (WEB.ask === hit.ref.id) enterGroup(hit.ref.id);
      else { WEB.ask = hit.ref.id; WEB.pinned = null; }
    } else if (hit.kind === 'node') {
      WEB.pinned = hit.ref;
    }
  }

  function onLeave() {
    hover = null;
    consoleHot = null;
    drag.on = false;
    cv.classList.remove('is-drag');
    cv.classList.remove('is-live');
  }

  function onWheel(e) {
    if (e.preventDefault) e.preventDefault();
    WEB.zoomT = clamp(WEB.zoomT * (e.deltaY > 0 ? 0.918 : 1.09), 0.62, 2.4);
  }

  function onDbl() {
    if (WEB.level === 0 && WEB.ask) { enterGroup(WEB.ask); return; }
    resetView();
  }

  function onKey(e) {
    if (!e) return;
    if (e.key === 'Escape') {
      if (WEB.ask) { WEB.ask = null; return; }
      if (WEB.level === 1) { backGroup(); return; }
      WEB.pinned = null; drag.on = false;
    } else if (e.key === 'Enter') {
      if (WEB.level === 0 && WEB.ask) enterGroup(WEB.ask);
    } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
      if (WEB.level === 1) backGroup();
    } else if (e.key === 'm' || e.key === 'M') {
      bootOpen();
    } else if (e.key === 'r' || e.key === 'R') {
      /* R = 跳到今天最该看的那个点。不开新面板，只把镜头推过去。 */
      var list = nlDueNodes(SP.selected);
      if (!list.length) return;
      var nd = list[0];
      if (WEB.level === 0 && nd.grp) enterGroup(nd.grp);
      var gg = WEB.g;
      if (gg && gg.nodes) {
        for (var qi = 0; qi < gg.nodes.length; qi++) {
          if (gg.nodes[qi].id === nd.id) { WEB.pinned = gg.nodes[qi]; WEB.ask = null; break; }
        }
      }
    } else if (e.key === '1' || e.key === '2') {
      /* 1 = 记得，2 = 没想起来。没有 pin 就不动作，不抢焦点。 */
      if (!WEB.pinned || !WEB.pinned.id) return;
      nlRecordRecall(WEB.pinned, e.key === '1');
    }
  }

  /* ── frame ───────────────────────────────────────────────────────────────── */

  function frame(now) {
    try { frameBody(now); }
    catch (e) {
      NL_ERR = e;
      paintError(cv.getContext('2d'), cv.width, cv.height, errText(e));
    }
  }

  function frameBody(now) {
    var ts = now / 1000;
    var dt = Math.min(0.05, last ? ts - last : 0.016);
    last = ts;
    t = ts;
    bootT += dt;
    boot = clamp(bootT / 2.6, 0, 1);

    if (glitchT > 0) glitchT = Math.max(0, glitchT - dt * 6.5);

    /* 信箱：每 60 秒问一次，挂在帧循环里而不是定时器——页面切走就自然停。 */
    if (ts - mailAt > 60) {
      mailAt = ts;
      nlMailSync();
    }

    /* the knowledge field unfolds out of the core once the ring is up */
    WEB.reveal = approach(WEB.reveal, boot < 0.34 ? 0 : 1, 2.4, dt);

    planetPositions(dt);

    var hoverNode = hover && hover.kind === 'node' ? hover.ref : null;
    var hoverShard = hover && hover.kind === 'shard' ? hover.ref : null;
    var hoverPlanet = hover && hover.kind === 'planet' ? hover.ref : null;

    SP.planets.forEach(function (p) {
      p.hover = approach(p.hover, p === hoverPlanet ? 1 : 0, 12 * dt);
      p.sel = approach(p.sel, p.id === SP.selected ? 1 : 0, 8 * dt);
    });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';

    if (typeof DEEP !== 'undefined' && DEEP.ready) {
      deepDraw(ctx, w, h, t);
      drawWarpResidue(ctx, w, h, boot);
    } else {
      /* background module unavailable: never leave stale pixels behind */
      ctx.fillStyle = '#03060b';
      ctx.fillRect(0, 0, w, h);
    }
    drawMotes(ctx, w, h, t);
    ctx.drawImage(SP.ringBack, 0, 0, w, h);

    /* the dial living in the hollow of the ring */
    if (typeof drawInstrument === 'function') {
      var sNow = BY_SUBJECT[SP.selected] || {};
      var stNow = sNow.stat || {};
      drawInstrument(ctx, w, h, t, SP.geom, {
        id: sNow.id, name: sNow.name, glyph: sNow.glyph, hue: sNow.hue
      }, {
        boot: smoothstep(0.55, 1.0, boot),
        index: sNow.index || 0,
        hit: stNow.hit || 0, acc: stNow.acc || 0,
        nodes: stNow.nodes || 0, fp: sNow.fp || 0, blind: stNow.blind || 0
      });
    }

    var order = SP.planets.slice().sort(function (a, b) { return a.z - b.z; });
    order.forEach(function (p) {
      var i = SP.planets.indexOf(p);
      drawPlanet(ctx, p, t, smoothstep(0.10 + i * 0.05, 0.34 + i * 0.05, boot));
    });
    ctx.drawImage(SP.ringFront, 0, 0, w, h);

    drawWeb(ctx, w, h, t, boot, hoverNode);
    shardList = drawShards(ctx, t, hoverShard) || [];

    if (boot > 0.5) {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, bloom.width, bloom.height);
      bctx.drawImage(cv, 0, 0, bloom.width, bloom.height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.52 * smoothstep(0.5, 1, boot);
      ctx.filter = 'blur(9px)';
      ctx.drawImage(bloom, 0, 0, w, h);
      ctx.filter = 'none';
      ctx.restore();
    }

    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    drawHud(ctx, w, h, boot);
    drawArrival(ctx, w, h, boot);
    drawCards(ctx, w, h, t, boot, hover);
    drawConsole(ctx, w, h);
    fxDraw(ctx, w, h, t, { boot: boot, glitch: glitchT, hover: hover ? 1 : 0 });
    raf = requestAnimationFrame(frame);
  }

  /* ── boot ────────────────────────────────────────────────────────────────── */

  resize();
  prepareWeb(w, h);
  WEB.reveal = 0;
  planetPositions(0.016);

  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('pointerleave', onLeave);
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('dblclick', onDbl);
  window.addEventListener('keydown', onKey);

  var ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(function () { resize(); });
    ro.observe(root);
  }
  raf = requestAnimationFrame(frame);

  return function destroy() {
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointerup', onUp);
    cv.removeEventListener('pointercancel', onUp);
    cv.removeEventListener('pointerleave', onLeave);
    cv.removeEventListener('wheel', onWheel);
    cv.removeEventListener('dblclick', onDbl);
    window.removeEventListener('keydown', onKey);
  };
}

/* ── ambient ───────────────────────────────────────────────────────────────── */

var MOTES = null;
function drawMotes(c, w, h, t) {
  if (!MOTES) {
    var rng = makeRng(99173);
    MOTES = [];
    for (var i = 0; i < 26; i++) {
      MOTES.push({
        x: rng(), y: rng(), r: 0.55 + rng() * 1.05,
        v: 0.35 + rng() * 0.8, a: 0.08 + rng() * 0.20, p: rng() * TAU
      });
    }
  }
  c.save();
  c.globalCompositeOperation = 'lighter';
  MOTES.forEach(function (m) {
    var x = (m.x * w + Math.sin(t * 0.06 + m.p) * 13 + t * 2.4 * m.v) % w;
    var y = (m.y * h + Math.cos(t * 0.05 + m.p) * 9) % h;
    if (x < 0) x += w;
    if (y < 0) y += h;
    c.fillStyle = 'rgba(190,214,255,' + m.a.toFixed(3) + ')';
    c.beginPath();
    c.arc(x, y, m.r, 0, TAU);
    c.fill();
  });
  c.restore();
}

/* ── instrument chrome ─────────────────────────────────────────────────────── */

/* 跃迁的余波：进入后的头 0.22s，几条射线还在往外散，接住启动序列的收尾 */
function drawWarpResidue(c, w, h, boot) {
  if (boot >= 0.24) return;
  var k = 1 - boot / 0.24;
  var cx = w * 0.5, cy = h * 0.5;
  var i, a, r0, r1;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (i = 0; i < 64; i++) {
    a = (i / 64) * TAU + i * 0.37;
    r0 = Math.max(w, h) * (0.10 + 0.5 * k);
    r1 = r0 + Math.max(w, h) * (0.06 + 0.16 * k) * (0.4 + ((i * 29) % 100) / 100);
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    c.lineWidth = 0.8;
    c.strokeStyle = 'rgba(122,206,240,' + (0.20 * k).toFixed(3) + ')';
    c.stroke();
  }
  c.restore();
}

/* 从启动序列接过来的那一句：只存在两秒，然后彻底消失 */
function drawArrival(c, w, h, boot) {
  var a = smoothstep(0.02, 0.18, boot) * (1 - smoothstep(0.52, 0.74, boot));
  if (a <= 0.01) return;
  var y = h - CONSOLE_H - 42;
  c.save();
  c.globalAlpha = a;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = mono(9, 500);
  tracked(c, 4.2);
  c.fillStyle = 'rgba(208,236,255,0.86)';
  c.fillText('学习通道 · 认知星图已接入', w / 2, y);
  tracked(c, 0);
  c.font = mono(7.6, 400);
  tracked(c, 2.6);
  c.fillStyle = 'rgba(126,190,222,0.62)';
  c.fillText('COGNITION CHANNEL · FIELD ONLINE', w / 2, y + 15);
  tracked(c, 0);
  /* 两侧短线，随 alpha 一起淡出 */
  var half = 78;
  c.beginPath();
  c.moveTo(w / 2 - half - 22, y); c.lineTo(w / 2 - half, y);
  c.moveTo(w / 2 + half, y); c.lineTo(w / 2 + half + 22, y);
  c.lineWidth = 0.8;
  c.strokeStyle = 'rgba(126,190,222,0.42)';
  c.stroke();
  c.restore();
}

function drawHud(c, w, h, boot) {
  var a0 = smoothstep(0.42, 1.0, boot);
  if (a0 <= 0.01) return;
  c.save();

  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.globalAlpha = a0 * 0.94;
  c.font = mono(11.5, 700);
  tracked(c, 5.2);
  c.shadowColor = 'rgba(110,200,255,0.55)';
  c.shadowBlur = 16;
  c.fillStyle = 'rgba(236,248,255,1)';
  c.fillText('NEURO-LOOP', 34, 40);
  tracked(c, 0);

  c.globalAlpha = a0 * 0.66;
  c.font = mono(8.6, 500);
  tracked(c, 2.6);
  c.fillStyle = 'rgba(168,200,234,1)';
  c.fillText('COGNITION SURVEY · 高三', 35, 56);
  tracked(c, 0);

  var subj = BY_SUBJECT[SP.selected];
  if (subj) {
    c.textAlign = 'right';
    c.globalAlpha = a0 * 0.96;
    c.font = font(15, 600);
    tracked(c, 3.2);
    c.fillStyle = rgbaMix(subj.hue, 0.60, 0.96);
    c.fillText(subj.name, w - 34, 40);
    tracked(c, 0);

    var g = WEB.g || { nodes: [], links: [] };
    var counts = WEB.level === 0
      ? 'BLOCKS ' + g.nodes.length + ' · LINKS ' + g.links.length
      : 'NODES ' + g.nodes.length + ' · EDGES ' + g.links.length;
    c.globalAlpha = a0 * 0.68;
    c.font = mono(8.6, 500);
    tracked(c, 1.5);
    c.fillStyle = 'rgba(172,204,238,1)';
    c.fillText(counts + ' · ZOOM ' + WEB.zoom.toFixed(2) + '\u00d7', w - 34, 56);
    tracked(c, 0);

    /* 今天的债务。0 的时候是灰的——它在，但不喊你。 */
    var due = nlDueCount(SP.selected);
    c.globalAlpha = a0 * (due > 0 ? 0.94 : 0.30);
    c.font = mono(8.6, 700);
    tracked(c, 2.2);
    c.fillStyle = due > 0 ? 'rgba(255,186,104,1)' : 'rgba(150,180,214,1)';
    c.fillText('DUE ' + due + (due > 0 ? ' · 待复习' : ' · 已清空'), w - 34, 72);
    tracked(c, 0);

    /* 信箱：别的会话寄来的信。0 封时不画——不当噪音。 */
    var mail = (typeof NL_NET !== 'undefined' && NL_NET && NL_NET.mail) ? NL_NET.mail : 0;
    if (mail > 0) {
      c.globalAlpha = a0 * 0.94;
      c.font = mono(8.6, 700);
      tracked(c, 2.2);
      c.fillStyle = 'rgba(120,232,200,1)';
      c.fillText('\u2709 MAIL ' + mail + ' \u00b7 来信', w - 34, 88);
      tracked(c, 0);
    }
  }

  c.globalAlpha = a0 * 0.40;
  c.textAlign = 'left';
  c.font = mono(8, 500);
  tracked(c, 2.4);
  c.fillStyle = 'rgba(146,180,216,1)';
  c.fillText('SUBJECT ORBIT', 34, 92);
  c.fillText(WEB.level === 0 ? 'KNOWLEDGE FIELD · BLOCKS' : 'KNOWLEDGE FIELD · INSIDE',
    WEB.cx - WEB.R, WEB.cy - WEB.R - 26);
  tracked(c, 0);

  c.restore();
}

function drawCards(c, w, h, t, boot, hover) {
  var a0 = smoothstep(0.55, 1.0, boot);
  if (a0 < 0.02) return;
  var drawn = {};

  function paint(kind, ref) {
    if (!ref) return;
    var key = kind + ':' + (ref.id || (ref.sh ? ref.sh.subject + '/' + ref.sh.i : ''));
    if (drawn[key]) return;
    drawn[key] = 1;
    c.save();
    c.globalAlpha = a0;
    if (kind === 'node') {
      var subj = BY_SUBJECT[SP.selected];
      drawReadout(c, w, h, ref.x, ref.y, (subj && subj.hue) || '#9fe4f2', ref.label, [
        { label: '核心考点', text: ref.core || '—' },
        { label: '设错陷阱', text: ref.trap || '—' },
        { label: '方法判据', text: ref.method || '—' },
        { label: '复习', text: nlDueText(ref) }
      ], [
        { label: 'HIT', value: ref.hit || 0, color: 'rgba(150,225,255,0.80)' },
        { label: 'ACC', value: ref.acc || 0, color: 'rgba(255,255,255,0.42)' }
      ]);
    } else if (kind === 'shard') {
      var sh = ref.sh;
      var fp = ref.state === 'fp';
      var hue = fp ? '#ff6a7a' : (ref.state === 'unknown' ? '#9fb4cc' : '#5ad2c8');
      var sn = (BY_SUBJECT[sh.subject] && BY_SUBJECT[sh.subject].name) || '';
      drawReadout(c, w, h, ref.x, ref.y, hue,
        (fp ? '假阳性碎片' : (ref.state === 'unknown' ? '未命中碎片' : '已磨平碎片')) + ' · ' + sn, [
          { label: '题干', text: sh.text }
        ], [
          { label: 'HIT', value: sh.hit || 0, color: 'rgba(150,225,255,0.80)' },
          { label: 'ACC', value: sh.acc || 0, color: fp ? 'rgba(255,110,126,0.9)' : 'rgba(255,255,255,0.42)' }
        ]);
    } else if (kind === 'block') {
      var sb = BY_SUBJECT[SP.selected] || {};
      var mem = (sb.nodes || []).filter(function (n) { return n.grp === ref.id; });
      var blind = 0, hit2 = 0, acc2 = 0;
      mem.forEach(function (n) {
        if (n.stability <= 0.35) blind++;
        hit2 += n.hit || 0; acc2 += n.acc || 0;
      });
      var cnt = mem.length || 1;
      drawReadout(c, w, h, ref.x, ref.y, sb.hue || '#9fe4f2', ref.label, [
        { label: '知识块', text: cnt + ' 个考点 · ' + blind + ' 个盲区' },
        { label: '下一层', text: '点击进入 · 双击直接进入' }
      ], [
        { label: 'HIT', value: hit2 / cnt, color: 'rgba(150,225,255,0.80)' },
        { label: 'ACC', value: acc2 / cnt, color: 'rgba(255,255,255,0.42)' }
      ]);
    } else if (kind === 'planet') {
      var sub = ref.subject;
      var st = sub.stat || {};
      drawReadout(c, w, h, ref.x, ref.y, sub.hue, sub.name, [
        { label: '核心考点', text: sub.core || '—' },
        { label: '缓存带', text: (sub.shards ? sub.shards.length : 0) + ' 片在轨 · ' + (sub.fp || 0) + ' 片假阳性' }
      ], [
        { label: 'HIT', value: st.hit || 0, color: 'rgba(150,225,255,0.80)' },
        { label: 'ACC', value: st.acc || 0, color: 'rgba(255,255,255,0.42)' }
      ]);
    }
    c.restore();
  }

  if (hover) paint(hover.kind, hover.ref);
  if (WEB.pinned && (!hover || WEB.pinned !== hover.ref)) paint('node', WEB.pinned);
}

/* ── React surface ─────────────────────────────────────────────────────────── */

function NeuroLoopIcon(props) {
  var size = (props && props.size) || 18;
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    'aria-hidden': 'true', focusable: 'false'
  },
    h('ellipse', {
      cx: 12, cy: 12.4, rx: 10.2, ry: 4.4, transform: 'rotate(-24 12 12.4)',
      stroke: 'currentColor', strokeWidth: 1.1, opacity: 0.82
    }),
    h('circle', { cx: 12, cy: 12.4, r: 2.0, fill: 'currentColor' }),
    h('circle', { cx: 20.4, cy: 8.1, r: 1.25, fill: 'currentColor', opacity: 0.9 }),
    h('circle', { cx: 3.5, cy: 16.9, r: 0.95, fill: 'currentColor', opacity: 0.55 })
  );
}

function NeuroLoopPanel() {
  var rootRef = React.useRef(null);
  var cvRef = React.useRef(null);
  var s = React.useState(null);
  var err = s[0], setErr = s[1];

  React.useEffect(function () {
    var root = rootRef.current, cv = cvRef.current;
    if (!root || !cv) return undefined;
    var stop = null;
    try {
      stop = mountScene(root, cv);
    } catch (e) {
      var msg = errText(e);
      try { paintError(cv.getContext('2d'), cv.width, cv.height, msg); } catch (x) {}
      setErr(msg);
    }
    return function () { if (stop) stop(); };
  }, []);

  if (err) {
    return h('div', { className: 'nl-root' },
      h('style', { key: 'nl-css' }, CSS),
      h('pre', { className: 'nl-err' }, err)
    );
  }

  return h('div', { className: 'nl-root', ref: rootRef },
    h('style', { key: 'nl-css' }, CSS),
    h('canvas', { className: 'nl-canvas', ref: cvRef, tabIndex: 0 })
  );
}

function install(ctx) {
  try { registerBoot(ctx); } catch (e) { NL_ERR = NL_ERR || e; }

  try {
    ctx.slots.inject('sidebar.panellist', function () {
      return ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: function () { return '认知巡检'; }
      }, NeuroLoopIcon);
    });
  } catch (e) { NL_ERR = NL_ERR || e; }

  try {
    ctx.slots.inject('main', function () {
      return ctx.slots.register({ name: 'main', key: PANEL_ID }, NeuroLoopPanel);
    });
  } catch (e) { NL_ERR = NL_ERR || e; }

  /* 编程通道：独立 key，崩了不连累学习面板 */
  try { registerCode(ctx); } catch (e) { NL_ERR = NL_ERR || e; }
}
