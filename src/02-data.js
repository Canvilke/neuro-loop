/* ────────────────────────────────────────────────────────────────────────────
 * 02 · data — turn the seed into planets, a laid-out knowledge graph, shards
 * ──────────────────────────────────────────────────────────────────────────── */

var SUBJECTS = [];
var BY_SUBJECT = {};
var GRAPH = {};

function classifyShard(s) {
  if (s.state === 'fp' || (!s.state && s.hit >= 0.65 && s.acc <= 0.5)) return 'fp';
  if (s.state === 'unknown') return 'unknown';
  if (s.state === 'smooth') return 'smooth';
  return s.hit >= 0.65 && s.acc <= 0.5 ? 'fp' : 'unknown';
}

/* A small deterministic force layout. 14 nodes → 91 pairs, ~360 iterations,
   computed once per subject and cached. */
function layoutGraph(subject, R) {
  var rng = makeRng(hashStr(subject.id));
  var raw = subject.nodes || [];
  var n = raw.length;
  var edgeMap = {};
  var edges = (subject.edges || []).filter(function (e) {
    return e && e.a && e.b && e.a !== e.b;
  }).map(function (e, i) {
    edgeMap[e.a + '>' + e.b] = true;
    return { a: e.a, b: e.b, kind: e.kind || 'derive', w: clamp(e.w == null ? 0.5 : e.w, 0.12, 1), bow: (rng() * 2 - 1) * 0.34 };
  });

  var idx = {};
  var pts = raw.map(function (nd, i) {
    idx[nd.id] = i;
    var a = i * 2.399963 * 3 + rng() * 0.5;
    var rr = R * (0.34 + 0.62 * rng());
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.82, vx: 0, vy: 0 };
  });

  /* pick the core node: subject.core matches a label, else strongest attn */
  var coreIdx = -1;
  for (var i = 0; i < n; i++) if (raw[i].label === subject.core) { coreIdx = i; break; }
  if (coreIdx < 0) {
    var best = -1;
    for (var j = 0; j < n; j++) if ((raw[j].attn || 0) > best) { best = raw[j].attn || 0; coreIdx = j; }
  }
  if (coreIdx >= 0) { pts[coreIdx].x = 0; pts[coreIdx].y = 0; }

  var radii = raw.map(function (nd) { return 2.5 + clamp(nd.attn == null ? 0.5 : nd.attn, 0, 1) * 3.4; });

  var ITERS = 380;
  for (var it = 0; it < ITERS; it++) {
    var damp = 0.86;
    /* repulsion */
    for (var a1 = 0; a1 < n; a1++) {
      for (var b1 = a1 + 1; b1 < n; b1++) {
        var dx = pts[b1].x - pts[a1].x, dy = pts[b1].y - pts[a1].y;
        var d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { d2 = 0.01; dx = 0.1 * (b1 - a1); }
        var minD = radii[a1] + radii[b1] + 34;
        var f = (minD * minD) / (d2 * 9);
        var d = Math.sqrt(d2);
        var ux = dx / d, uy = dy / d;
        pts[a1].vx -= ux * f; pts[a1].vy -= uy * f;
        pts[b1].vx += ux * f; pts[b1].vy += uy * f;
      }
    }
    /* springs */
    for (var e1 = 0; e1 < edges.length; e1++) {
      var ed = edges[e1];
      var ia = idx[ed.a], ib = idx[ed.b];
      if (ia == null || ib == null) continue;
      var ex = pts[ib].x - pts[ia].x, ey = pts[ib].y - pts[ia].y;
      var len = Math.sqrt(ex * ex + ey * ey) || 1;
      var rest = (radii[ia] + radii[ib]) * 3.4 + 58;
      var k = (len - rest) / len * 0.055 * (0.4 + ed.w);
      pts[ia].vx += ex * k; pts[ia].vy += ey * k;
      pts[ib].vx -= ex * k; pts[ib].vy -= ey * k;
    }
    /* gravity to the core */
    for (var g = 0; g < n; g++) {
      pts[g].vx -= pts[g].x * 0.0032;
      pts[g].vy -= pts[g].y * 0.0032;
      pts[g].x += pts[g].vx * damp;
      pts[g].y += pts[g].vy * damp;
      pts[g].vx *= 0.72; pts[g].vy *= 0.72;
    }
  }

  if (coreIdx >= 0) { pts[coreIdx].x = 0; pts[coreIdx].y = 0; }

  /* normalise into the disc */
  var maxR = 1;
  for (var m = 0; m < n; m++) {
    var rr2 = Math.sqrt(pts[m].x * pts[m].x + pts[m].y * pts[m].y);
    if (rr2 > maxR) maxR = rr2;
  }
  var scale = (R * 0.98) / maxR;

  var nodes = raw.map(function (nd, i2) {
    return {
      id: nd.id,
      label: nd.label,
      core: nd.core || '',
      trap: nd.trap || '',
      method: nd.method || '',
      attn: clamp(nd.attn == null ? 0.5 : nd.attn, 0, 1),
      stability: clamp(nd.stability == null ? 0.5 : nd.stability, 0, 1),
      hit: clamp(nd.hit == null ? 0.6 : nd.hit, 0, 1),
      acc: clamp(nd.acc == null ? 0.6 : nd.acc, 0, 1),
      grp: nd.grp || null,
      r: radii[i2],
      lx: pts[i2].x * scale,
      ly: pts[i2].y * scale * 0.9,
      x: 0, y: 0,
      appear: 0,
      hoverT: 0,
      isCore: i2 === coreIdx
    };
  });

  var byId = {};
  nodes.forEach(function (nd) { byId[nd.id] = nd; });

  var links = edges.filter(function (e) { return byId[e.a] && byId[e.b]; }).map(function (e, i) {
    var A = byId[e.a], B = byId[e.b];
    return { a: e.a, b: e.b, A: A, B: B, kind: e.kind, w: e.w, bow: e.bow, phase: rng(), i: i };
  });

  var adj = {};
  nodes.forEach(function (nd) { adj[nd.id] = {}; });
  links.forEach(function (l) { adj[l.a][l.b] = 1; adj[l.b][l.a] = 1; });

  return { nodes: nodes, links: links, adj: adj, core: nodes[coreIdx] || nodes[0], R: R };
}

function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function buildData(seed) {
  SUBJECTS = (seed.subjects || []).map(function (s, i) {
    var ns0 = s.nodes || [];
    var gs = (s.groups || []).map(function (g2, gi) {
      var ids = {};
      (g2.nodes || []).forEach(function (id) { ids[id] = 1; });
      return { id: g2.id, label: g2.label, short: g2.short || g2.label, index: gi, ids: ids };
    });
    if (!gs.length && ns0.length) {
      /* no hierarchy in the data yet: split into three readable blocks */
      var cut = Math.ceil(ns0.length / 3);
      for (var gi0 = 0; gi0 < 3; gi0++) {
        var mem = ns0.slice(gi0 * cut, (gi0 + 1) * cut);
        if (!mem.length) continue;
        var gg = { id: 'g' + gi0, label: '知识块 ' + (gi0 + 1), short: '块' + (gi0 + 1), index: gi0, ids: {} };
        mem.forEach(function (m) { gg.ids[m.id] = 1; m.grp = gg.id; });
        gs.push(gg);
      }
    }
    return {
      id: s.id, name: s.name, glyph: s.glyph || s.name[0], hue: s.hue || '#6f8bff',
      weight: clamp(s.weight == null ? 0.7 : s.weight, 0.3, 1),
      coreName: s.core || '',
      index: i,
      nodes: ns0,
      edges: s.edges || [],
      groups: gs
    };
  });
  SUBJECTS.forEach(function (s) { BY_SUBJECT[s.id] = s; });

  var shards = (seed.shards || []).map(function (sh, i) {
    return {
      i: i,
      subject: sh.subject,
      text: sh.text || '',
      hit: clamp(sh.hit == null ? 0.5 : sh.hit, 0, 1),
      acc: clamp(sh.acc == null ? 0.5 : sh.acc, 0, 1),
      state: classifyShard(sh)
    };
  });

  /* aggregate per subject */
  SUBJECTS.forEach(function (s) {
    var ns = s.nodes;
    var hit = 0, acc = 0, blind = 0;
    ns.forEach(function (nd) {
      hit += clamp(nd.hit == null ? 0.6 : nd.hit, 0, 1);
      acc += clamp(nd.acc == null ? 0.6 : nd.acc, 0, 1);
      if (clamp(nd.stability == null ? 0.5 : nd.stability, 0, 1) <= 0.35) blind++;
    });
    s.stat = {
      hit: ns.length ? hit / ns.length : 0,
      acc: ns.length ? acc / ns.length : 0,
      blind: blind,
      nodes: ns.length
    };
    s.shards = shards.filter(function (x) { return x.subject === s.id; });
    s.fp = s.shards.filter(function (x) { return x.state === 'fp'; }).length;
    s.blindNodes = ns.filter(function (nd) { return nd.stability <= 0.35; }).length;
  });

  return { subjects: SUBJECTS, shards: shards };
}

/* graph cache keyed by subject id + radius bucket */
var GRAPH_CACHE = {};
function graphFor(subjectId, R) {
  var bucket = Math.round(R / 8) * 8;
  var key = subjectId + '@' + bucket;
  if (GRAPH_CACHE[key]) return GRAPH_CACHE[key];
  var s = BY_SUBJECT[subjectId];
  if (!s) return null;
  var g = layoutGraph(s, bucket);
  GRAPH_CACHE[key] = g;
  GRAPH = g;
  return g;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Levels: the field shows knowledge blocks first (level 0), and only opens a
 * block into its own constellation when you ask for it (level 1).
 * ──────────────────────────────────────────────────────────────────────────── */

var GLAYOUT = {}, SUBCACHE = {};

function groupGraphFor(subjectId, R) {
  var s = BY_SUBJECT[subjectId];
  if (!s || !s.groups || !s.groups.length) return null;
  var bucket = Math.round(R / 8) * 8;
  var key = subjectId + '@' + bucket;
  if (GLAYOUT[key]) return GLAYOUT[key];

  var n = s.groups.length;
  var nodes = s.groups.map(function (g2, i) {
    var ang = -Math.PI / 2 + (i / n) * TAU + 0.22 * Math.sin(hashStr(g2.id) % 100);
    var rr = bucket * (0.62 + 0.05 * Math.sin(i * 1.7));
    var mem = s.nodes.filter(function (nd) { return nd.grp === g2.id; });
    var attn = 0, stab = 0;
    mem.forEach(function (m) {
      attn += clamp(m.attn == null ? 0.5 : m.attn, 0, 1);
      stab += clamp(m.stability == null ? 0.5 : m.stability, 0, 1);
    });
    var cnt = mem.length || 1;
    var lz = ((hashStr(g2.id) % 97) / 97 - 0.5) * 0.30;
    return {
      id: g2.id, label: g2.label, short: g2.short, isGroup: true, count: mem.length,
      attn: attn / cnt, stability: stab / cnt,
      lx: Math.cos(ang) * rr, ly: Math.sin(ang) * rr * 0.94, lz: lz,
      grp: g2.id, hoverT: 0, appear: 0,
      r: 6.4 + Math.min(2.4, mem.length * 0.42)
    };
  });

  /* aggregate the edges that cross block boundaries */
  var pair = {};
  s.nodes.forEach(function (nd) { if (!nd.grp) nd.grp = s.groups[0].id; });
  (s.edges || []).forEach(function (e) {
    var A = s.nodes.filter(function (x) { return x.id === e.a; })[0];
    var B = s.nodes.filter(function (x) { return x.id === e.b; })[0];
    if (!A || !B || A.grp === B.grp) return;
    var k = A.grp + '>' + B.grp;
    pair[k] = (pair[k] || 0) + clamp(e.w == null ? 0.5 : e.w, 0.12, 1);
  });
  var maxSum = 0.0001;
  Object.keys(pair).forEach(function (k) { if (pair[k] > maxSum) maxSum = pair[k]; });
  var byId = {};
  nodes.forEach(function (nd) { byId[nd.id] = nd; });
  var links = Object.keys(pair).map(function (k, i) {
    var ab = k.split('>');
    var A = byId[ab[0]], B = byId[ab[1]];
    if (!A || !B) return null;
    return { a: ab[0], b: ab[1], A: A, B: B, kind: 'derive',
      w: clamp(pair[k] / maxSum, 0.22, 1), bow: ((hashStr(k) % 100) / 100 - 0.5) * 0.5,
      phase: (hashStr(k) % 1000) / 1000, i: i };
  }).filter(Boolean);

  var adj = {};
  nodes.forEach(function (nd) { adj[nd.id] = {}; });
  links.forEach(function (l) { adj[l.a][l.b] = 1; adj[l.b][l.a] = 1; });

  var g = { nodes: nodes, links: links, adj: adj, core: null, R: bucket, isGroups: true };
  GLAYOUT[key] = g;
  return g;
}

function subGraphFor(subjectId, groupId, R) {
  var s = BY_SUBJECT[subjectId];
  if (!s) return null;
  var bucket = Math.round(R / 8) * 8;
  var key = subjectId + '|' + groupId + '@' + bucket;
  if (SUBCACHE[key]) return SUBCACHE[key];
  var ids = {};
  s.nodes.forEach(function (nd) { if (nd.grp === groupId) ids[nd.id] = 1; });
  var nodes = s.nodes.filter(function (nd) { return ids[nd.id]; });
  if (!nodes.length) return null;
  var edges = (s.edges || []).filter(function (e) { return ids[e.a] && ids[e.b]; });
  var g = layoutGraph({ id: subjectId + ':' + groupId, nodes: nodes, edges: edges, core: '' }, bucket * 0.88);
  g.isSub = true;
  g.groupIds = ids;
  SUBCACHE[key] = g;
  return g;
}
