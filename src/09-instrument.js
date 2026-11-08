/* ────────────────────────────────────────────────────────────────────────────
 * 09 · instrument — 星环空腔里的星系仪表盘
 *   倾斜刻度盘 · 方位环 · 反向内环 · 学科指针 · 中央透镜 · 三行读数
 *   纯 Canvas 2D；与 01–07 共享闭包；ES5 / var；不碰宿主环境。
 *   对外唯一接口：drawInstrument(c, w, h, t, geo, subj, state)
 * ──────────────────────────────────────────────────────────────────────────── */

var INS_SILVER = '#dbe9ff';
var INS_MIST = '#9fb8cc';
var INS_CYAN = '#7fe3f2';
var INS_INK = 'rgba(4,8,15,0.86)';
var INS_R = 0;    /* 本帧仪表盘半径 */
var INS_GA = 1;   /* 本帧整体透明度（boot） */

function INS_num(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v : d;
}
function INS_pt(r, a) { return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }

function drawInstrument(c, w, h, t, geo, subj, state) {
  /* 顶层守卫：关键数非有限就直接退出，绝不把 NaN 送进 canvas */
  if (!c || !geo) return;
  if (!isFinite(w) || !isFinite(h) || !isFinite(t)) return;
  if (!isFinite(geo.cx) || !isFinite(geo.cy) ||
      !isFinite(geo.rx) || !isFinite(geo.rot)) return;

  var R = geo.rx * 0.58;                /* 整体半径：只占环内空腔 */
  if (!isFinite(R) || R < 10) return;
  INS_R = R;

  state = state || {};
  subj = subj || {};
  var boot = clamp(INS_num(state.boot, 1), 0, 1);
  if (boot <= 0.004) return;
  INS_GA = boot;
  var rev = smoothstep(0, 1, boot);     /* 描出进度 */

  var hue = (typeof subj.hue === 'string' && subj.hue) || '#9fe4f2';
  var glyph = subj.glyph || '·';
  var name = subj.name || '';

  /* 六科方位：优先 state.index，没有就用 id 的稳定散列 */
  var idx;
  if (typeof state.index === 'number' && isFinite(state.index)) {
    idx = Math.round(state.index);
  } else {
    idx = hashStr(String(subj.id || '')) % 6;
  }
  idx = ((idx % 6) + 6) % 6;
  var aim = -Math.PI / 2 + idx * TAU / 6;

  /* t 取模：3600 同时是 90s / 40s / 3.6s 的整数倍，相位不变、数值不漂 */
  var tt = t % 3600;
  if (tt < 0) tt += 3600;
  var RL = R * 0.35;                               /* 透镜半径 */
  var br = 1 + 0.05 * Math.sin(tt * TAU / 3.6);    /* 呼吸，幅度 ≤ 0.05 */

  /* 读数先算好：底部微型条在屏幕坐标里画，不随盘倾斜 */
  var hit = clamp(INS_num(state.hit, 0), 0, 1);
  var acc = clamp(INS_num(state.acc, 0), 0, 1);
  var blindN = Math.max(0, Math.round(INS_num(state.blind, 0)));
  var nodeN = Math.max(0, Math.round(INS_num(state.nodes, 0)));
  var blindR = clamp(blindN / Math.max(1, nodeN + blindN), 0, 1);

  c.save();
  try {
    c.globalAlpha = INS_GA;

    c.translate(geo.cx, geo.cy);
    c.rotate(geo.rot);
    c.scale(1, 0.94);                   /* 轻微透视，别夸张 */

    /* ── 1. 外圈：144 段刻度，90s 一圈 ───────────────────────────────── */
    c.beginPath(); c.arc(0, 0, R, 0, TAU);
    c.lineWidth = 0.7; c.strokeStyle = rgba(INS_SILVER, 0.30); c.stroke();

    var spin = tt * TAU / 90;
    var N = 144, step = TAU / N;
    var shown = Math.floor(N * rev);
    var i, a, r0;

    if (shown > 0) {
      c.beginPath();
      for (i = 0; i < shown; i++) {
        if (i % 6 === 0) continue;
        a = spin + i * step - Math.PI / 2;
        r0 = R * 0.972;
        c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        c.lineTo(Math.cos(a) * R * 0.996, Math.sin(a) * R * 0.996);
      }
      c.lineWidth = 0.6; c.strokeStyle = rgba(INS_MIST, 0.26); c.stroke();

      c.beginPath();
      for (i = 0; i < shown; i += 6) {
        a = spin + i * step - Math.PI / 2;
        r0 = R * 0.941;
        c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        c.lineTo(Math.cos(a) * R * 0.996, Math.sin(a) * R * 0.996);
      }
      c.lineWidth = 1.0; c.strokeStyle = rgba(INS_SILVER, 0.56); c.stroke();
    }

    /* ── 2. 方位角刻度环：8 个主方位短线 + 两道细弧 ─────────────────── */
    var RA = R * 0.878;
    c.beginPath(); c.arc(0, 0, RA, -Math.PI / 2, -Math.PI / 2 + TAU * rev);
    c.lineWidth = 0.8; c.strokeStyle = rgba(INS_MIST, 0.20); c.stroke();

    c.beginPath(); c.arc(0, 0, RA - R * 0.012, -Math.PI / 2, -Math.PI / 2 + TAU * rev);
    c.lineWidth = 0.6; c.strokeStyle = rgba(INS_MIST, 0.10); c.stroke();

    c.beginPath();
    for (i = 0; i < 8 && i / 8 <= rev; i++) {
      a = i * TAU / 8 - Math.PI / 2;
      r0 = RA - R * 0.020;
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      c.lineTo(Math.cos(a) * (RA + R * 0.030), Math.sin(a) * (RA + R * 0.030));
    }
    c.lineWidth = 0.9; c.strokeStyle = rgba(INS_SILVER, 0.50); c.stroke();

    /* ── 3. 内圈：40s 反向缓转，带三段弧线高光 ──────────────────────── */
    var RI = R * 0.735;
    var ti = -tt * TAU / 40;
    c.beginPath(); c.arc(0, 0, RI, ti, ti + TAU * rev);
    c.lineWidth = 0.7; c.strokeStyle = rgba(INS_MIST, 0.20); c.stroke();

    c.beginPath(); c.arc(0, 0, RI * 0.955, -ti * 1.3, -ti * 1.3 + TAU * rev);
    c.lineWidth = 0.55; c.strokeStyle = rgba(INS_MIST, 0.10); c.stroke();

    c.beginPath();
    for (i = 0; i < 3; i++) {
      var ha = ti + i * TAU / 3 + 0.5;
      var hp = INS_pt(RI, ha);
      c.moveTo(hp.x, hp.y);
      c.arc(0, 0, RI, ha, ha + 0.30);
    }
    c.lineWidth = 1.15; c.strokeStyle = rgba('#e8f6ff', 0.52); c.stroke();

    /* ── 4. 指针：细亮线 + 小三角，指向当前学科方位 ─────────────────── */
    var pl = INS_pt(R * 0.700, aim);
    var pr = INS_pt(R * 0.520, aim);
    c.beginPath(); c.moveTo(pl.x, pl.y); c.lineTo(pr.x, pr.y);
    c.lineWidth = 0.9; c.strokeStyle = rgba('#eef8ff', 0.72); c.stroke();

    var tip = INS_pt(R * 0.468, aim);
    var b1 = INS_pt(R * 0.520, aim - 0.052);
    var b2 = INS_pt(R * 0.520, aim + 0.052);
    c.beginPath(); c.moveTo(tip.x, tip.y);
    c.lineTo(b1.x, b1.y); c.lineTo(b2.x, b2.y); c.closePath();
    c.fillStyle = rgba(hue, 0.62); c.fill();

    c.beginPath(); c.arc(pl.x, pl.y, Math.max(0.8, R * 0.012), 0, TAU);
    c.fillStyle = rgba('#eef8ff', 0.55); c.fill();

    /* ── 5. 中央透镜：暗盘 + hue 微光 + 细亮环 ──────────────────────── */
    var glow = c.createRadialGradient(0, 0, RL * 0.92, 0, 0, RL * 1.55);
    glow.addColorStop(0, rgba(hue, 0.13 * br));
    glow.addColorStop(0.55, rgba(hue, 0.05 * br));
    glow.addColorStop(1, rgba(hue, 0));
    c.beginPath(); c.arc(0, 0, RL * 1.55, 0, TAU);
    c.fillStyle = glow; c.fill();

    c.beginPath(); c.arc(0, 0, RL, 0, TAU);
    c.fillStyle = INS_INK; c.fill();

    var lens = c.createRadialGradient(0, 0, 0, 0, 0, RL);
    lens.addColorStop(0, rgba(hue, 0.15 * br));
    lens.addColorStop(0.6, rgba(hue, 0.055 * br));
    lens.addColorStop(1, rgba(hue, 0));
    c.beginPath(); c.arc(0, 0, RL, 0, TAU);
    c.fillStyle = lens; c.fill();

    /* 六段环：一段一个学科，当前学科那段点亮且加粗（= 盘的方位刻度） */
    var segA = TAU / 6;
    var gapA = 0.130;
    for (var sg = 0; sg < 6; sg++) {
      var a0 = -Math.PI / 2 + sg * segA + gapA * 0.5;
      var a1 = -Math.PI / 2 + (sg + 1) * segA - gapA * 0.5;
      var on = (sg === idx);
      c.beginPath(); c.arc(0, 0, RL, a0, a1);
      c.lineWidth = on ? 2.0 : 0.8;
      c.strokeStyle = on ? rgba(hue, 0.92 * br) : rgba('#dfeeff', 0.19);
      c.stroke();
    }

    c.beginPath(); c.arc(0, 0, RL + 3.2, 0, TAU * rev);
    c.lineWidth = 0.5; c.strokeStyle = rgba('#cfe4f5', 0.13); c.stroke();

    /* ── 6. 中心符号与科名 ──────────────────────────────────────────── */
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    var gs = clamp(RL * 0.92, 11, 30);
    c.font = font(gs, 400);
    c.shadowColor = rgba(hue, 0.55 * br);
    c.shadowBlur = RL * 0.30;
    c.fillStyle = rgba('#f4fbff', 0.96);
    c.fillText(glyph, 0, -RL * 0.26);
    c.shadowBlur = 0;

    /* 发丝分隔线：极短、两端渐隐，只为把符号和科名分层 */
    var hw = RL * 0.34;
    var hg = c.createLinearGradient(-hw, 0, hw, 0);
    hg.addColorStop(0, rgba('#cfe4f5', 0));
    hg.addColorStop(0.5, rgba('#cfe4f5', 0.30));
    hg.addColorStop(1, rgba('#cfe4f5', 0));
    c.beginPath(); c.moveTo(-hw, RL * 0.26); c.lineTo(hw, RL * 0.26);
    c.lineWidth = 0.6; c.strokeStyle = hg; c.stroke();

    var ns = clamp(RL * 0.38, 8.5, 11.5);
    c.font = font(ns, 400);
    tracked(c, 2.2);
    c.fillStyle = rgba('#dbe9f6', 0.86);
    c.fillText(name, 0, RL * 0.64);
    tracked(c, 0);

  } finally {
    c.restore();                         /* save / restore 严格配平 */
  }
}
