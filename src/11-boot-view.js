/* ────────────────────────────────────────────────────────────────────────────
 * 11 · boot view — 启动序列的所有绘制
 *   只画，不管状态机；状态在 10-boot-core.js，两边在同一个闭包里。
 * ──────────────────────────────────────────────────────────────────────────── */

function bootBrackets(c, x, y, w, h, len, color, lw) {
  c.beginPath();
  c.moveTo(x, y + len); c.lineTo(x, y); c.lineTo(x + len, y);
  c.moveTo(x + w - len, y); c.lineTo(x + w, y); c.lineTo(x + w, y + len);
  c.moveTo(x + w, y + h - len); c.lineTo(x + w, y + h); c.lineTo(x + w - len, y + h);
  c.moveTo(x + len, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - len);
  c.lineWidth = lw || 1;
  c.strokeStyle = color;
  c.stroke();
}

function bootBackdrop(c, w, h, t, alpha) {
  c.save();
  c.globalAlpha = alpha === undefined ? 1 : alpha;
  c.fillStyle = UEG.ink;
  c.fillRect(0, 0, w, h);

  var g = c.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, Math.max(w, h) * 0.62);
  g.addColorStop(0, 'rgba(28,52,78,0.42)');
  g.addColorStop(0.55, 'rgba(10,20,32,0.20)');
  g.addColorStop(1, 'rgba(2,4,8,0.94)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  /* 细网格：24px，极低对比 */
  c.beginPath();
  var gx;
  for (gx = 0; gx <= w; gx += 24) { c.moveTo(gx + 0.5, 0); c.lineTo(gx + 0.5, h); }
  var gy;
  for (gy = 0; gy <= h; gy += 24) { c.moveTo(0, gy + 0.5); c.lineTo(w, gy + 0.5); }
  c.lineWidth = 0.5;
  c.strokeStyle = 'rgba(120,160,200,0.045)';
  c.stroke();

  /* 地平线弧光 */
  c.beginPath();
  c.ellipse(w * 0.5, h * 1.28, w * 0.72, h * 0.52, 0, Math.PI * 1.04, Math.PI * 1.96);
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(120,190,235,0.16)';
  c.stroke();
  c.restore();
}

function bootGlobe(c, cx, cy, R, t) {
  var tilt = 0.42;
  var rot = t * 0.55;

  /* 外圈轨道 + 卫星点 */
  c.beginPath();
  c.ellipse(cx, cy, R * 1.42, R * 0.46, -0.34, 0, TAU);
  c.lineWidth = 0.8;
  c.strokeStyle = 'rgba(110,200,230,0.24)';
  c.stroke();
  var sa = t * 0.9, sp = { x: cx + Math.cos(sa) * R * 1.42, y: cy + Math.sin(sa) * R * 0.46 };
  c.save();
  c.translate(cx, cy); c.rotate(-0.34); c.translate(-cx, -cy);
  sp = { x: cx + Math.cos(sa) * R * 1.42, y: cy + Math.sin(sa) * R * 0.46 };
  c.restore();

  /* 球体：暗盘 + 边缘光 */
  var body = c.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
  body.addColorStop(0, 'rgba(46,86,120,0.62)');
  body.addColorStop(0.62, 'rgba(14,30,46,0.86)');
  body.addColorStop(1, 'rgba(5,10,18,0.96)');
  c.beginPath(); c.arc(cx, cy, R, 0, TAU);
  c.fillStyle = body; c.fill();

  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
  c.translate(cx, cy); c.rotate(tilt);

  /* 纬线 */
  var i, k, ly, lr, a;
  for (i = -3; i <= 3; i++) {
    ly = i / 3.4;
    ly = Math.sin(ly * Math.PI * 0.5) * R * 0.94;
    lr = Math.sqrt(Math.max(0, R * R - ly * ly));
    c.beginPath(); c.ellipse(0, ly, lr, lr * 0.16, 0, 0, TAU);
    c.lineWidth = 0.6;
    c.strokeStyle = 'rgba(126,196,226,' + (0.10 + 0.07 * (1 - Math.abs(i) / 3.4)).toFixed(3) + ')';
    c.stroke();
  }

  /* 经线：随 rot 相位变化，值取模到 [0,π] 避免突变 */
  for (k = 0; k < 8; k++) {
    a = rot + k * Math.PI / 8;
    var s = Math.abs(Math.sin(a));
    c.beginPath();
    c.ellipse(0, 0, R * Math.max(0.05, s), R, 0, 0, TAU);
    c.lineWidth = 0.55;
    c.strokeStyle = 'rgba(126,196,226,' + (0.05 + 0.10 * s).toFixed(3) + ')';
    c.stroke();
  }

  c.restore();

  /* 边缘光 + 顶部受光 */
  c.beginPath(); c.arc(cx, cy, R, 0, TAU);
  c.lineWidth = 1.1;
  c.strokeStyle = 'rgba(150,220,250,0.46)';
  c.stroke();

  c.beginPath(); c.arc(cx - R * 0.18, cy - R * 0.2, R * 0.92, Math.PI * 0.92, Math.PI * 1.62);
  c.lineWidth = 1.6;
  c.strokeStyle = 'rgba(196,238,255,0.30)';
  c.stroke();

  /* 卫星 */
  c.beginPath(); c.arc(sp.x, sp.y, 2.2, 0, TAU);
  c.fillStyle = 'rgba(150,232,255,0.85)'; c.fill();
  c.beginPath(); c.arc(sp.x, sp.y, 6.5, 0, TAU);
  c.fillStyle = 'rgba(110,220,255,0.12)'; c.fill();
}

function bootBeam(c, cx, cy, R, t) {
  var top = cy - R * 4.2;
  var flick = 0.82 + 0.18 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
  var g = c.createLinearGradient(0, cy - R * 0.9, 0, top);
  g.addColorStop(0, 'rgba(255,196,120,' + (0.30 * flick).toFixed(3) + ')');
  g.addColorStop(0.35, 'rgba(255,170,90,' + (0.13 * flick).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(255,150,70,0)');
  c.beginPath();
  c.moveTo(cx - R * 0.16, cy - R * 0.9);
  c.lineTo(cx + R * 0.16, cy - R * 0.9);
  c.lineTo(cx + R * 0.62, top);
  c.lineTo(cx - R * 0.62, top);
  c.closePath();
  c.fillStyle = g; c.fill();

  c.beginPath();
  c.moveTo(cx - R * 0.035, cy - R * 0.92);
  c.lineTo(cx + R * 0.035, cy - R * 0.92);
  c.lineTo(cx + R * 0.10, top);
  c.lineTo(cx - R * 0.10, top);
  c.closePath();
  c.fillStyle = 'rgba(255,235,205,' + (0.28 * flick).toFixed(3) + ')';
  c.fill();
}

function bootLogs(c, x, y, t, dpr) {
  var i, row, ty;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  for (i = 0; i < BOOT_LOG.length; i++) {
    row = BOOT_LOG[i];
    var at = 0.22 + i * 0.46;
    if (t < at) break;
    var a = clamp((t - at) / 0.26, 0, 1);
    ty = y + i * 19;
    c.globalAlpha = a;
    c.font = mono(9.5, 400);
    c.fillStyle = 'rgba(120,150,178,0.66)';
    c.fillText(row[0], x, ty);
    c.fillStyle = 'rgba(196,222,246,0.82)';
    c.fillText(row[1], x + 44, ty);
    c.fillStyle = 'rgba(110,220,235,0.66)';
    c.fillText(row[2], x + 214, ty);
    c.globalAlpha = 1;
  }
}

function bootProgress(c, x, y, w, p) {
  var n = 42, i, seg = w / n;
  c.beginPath();
  for (i = 0; i < n; i++) {
    if (i / n > p) break;
    c.rect(x + i * seg, y, seg - 2.2, 3.2);
  }
  c.fillStyle = 'rgba(255,181,82,0.78)';
  c.fill();

  c.beginPath(); c.rect(x, y - 1, w, 0.6);
  c.fillStyle = 'rgba(120,150,178,0.22)'; c.fill();

  c.textAlign = 'right'; c.textBaseline = 'middle';
  c.font = mono(9.5, 500);
  c.fillStyle = 'rgba(255,196,120,0.86)';
  c.fillText('自检 SELF-CHECK  ' + Math.round(p * 100) + '%', x + w, y - 12);
}

function bootCorners(c, w, h, t) {
  var m = 22, L = 26;
  bootBrackets(c, m, m, w - m * 2, h - m * 2, L, 'rgba(150,190,225,0.22)', 0.9);

  /* 底部警示斜纹 */
  var sh = 10, sx;
  c.save();
  c.beginPath(); c.rect(0, h - sh, w, sh); c.clip();
  c.fillStyle = 'rgba(255,181,82,0.07)';
  c.fillRect(0, h - sh, w, sh);
  c.strokeStyle = 'rgba(255,181,82,0.20)';
  c.lineWidth = 3;
  for (sx = -sh; sx < w + sh; sx += 16) {
    c.beginPath(); c.moveTo(sx, h); c.lineTo(sx + sh, h - sh); c.stroke();
  }
  c.restore();
}

function bootHeader(c, w, h, t, phase) {
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.font = mono(11.5, 700);
  tracked(c, 3.4);
  c.fillStyle = 'rgba(224,242,255,0.94)';
  c.fillText('联合政府 · 行政终端', 44, 52);
  tracked(c, 0);

  c.font = mono(8.6, 600);
  tracked(c, 2.6);
  c.fillStyle = 'rgba(150,186,218,0.80)';
  c.fillText('UNITED EARTH GOVERNMENT · ADMINISTRATIVE TERMINAL', 44, 69);
  tracked(c, 0);

  c.textAlign = 'right';
  c.font = mono(9.8, 700);
  c.fillStyle = 'rgba(170,204,234,0.78)';
  c.fillText('UEG//NL-550W', w - 44, 52);
  c.font = mono(8.8, 600);
  c.fillStyle = 'rgba(255,181,82,0.80)';
  var st = phase === 'boot' ? '系统自检中 / CHECKING'
    : (phase === 'sync' ? '轨道同步中 / SYNCING'
      : (phase === 'auth' ? '等待验证 / AWAITING AUTH'
        : (phase === 'brief' ? '简报就绪 / BRIEFED'
          : (phase === 'choose' ? '等待接入 / STANDBY'
            : (phase === 'enter' ? '通道已锁定 / LOCKED' : '链路建立中 / LINKING')))));
  c.fillText(st, w - 44, 69);

  /* 顶部分隔线 + 左端短刻度 */
  c.beginPath(); c.moveTo(44, 88); c.lineTo(w - 44, 88);
  c.lineWidth = 0.7; c.strokeStyle = 'rgba(126,158,188,0.24)'; c.stroke();
  c.beginPath();
  var i;
  for (i = 0; i < 5; i++) { c.moveTo(44 + i * 10, 88); c.lineTo(44 + i * 10, 84); }
  c.lineWidth = 0.8; c.strokeStyle = 'rgba(150,190,225,0.32)'; c.stroke();
}

/* 通道行：不是卡片，是清单里的一条 */
function bootRow(c, x, y, w, h, m, on, hot, t) {
  c.save();

  var bg = c.createLinearGradient(x, 0, x + w, 0);
  if (on) {
    bg.addColorStop(0, rgba(m.accent, 0.17));
    bg.addColorStop(0.55, rgba(m.accent, 0.05));
    bg.addColorStop(1, rgba(m.accent, 0.01));
  } else {
    bg.addColorStop(0, hot ? 'rgba(14,24,36,0.72)' : 'rgba(10,18,28,0.52)');
    bg.addColorStop(0.55, hot ? 'rgba(10,18,28,0.50)' : 'rgba(8,14,22,0.34)');
    bg.addColorStop(1, 'rgba(8,14,22,0.06)');
  }
  c.fillStyle = bg;
  c.fillRect(x, y, w, h);

  /* 左色条 */
  c.fillStyle = on ? m.accent : 'rgba(126,158,188,' + (hot ? 0.42 : 0.26) + ')';
  c.fillRect(x, y, on ? 2.6 : 1, h);

  /* 上下发丝线 */
  c.beginPath();
  c.moveTo(x, y + 0.5); c.lineTo(x + w, y + 0.5);
  c.moveTo(x, y + h - 0.5); c.lineTo(x + w, y + h - 0.5);
  c.lineWidth = 0.7;
  c.strokeStyle = on ? rgba(m.accent, 0.30) : 'rgba(126,158,188,0.12)';
  c.stroke();

  c.textBaseline = 'middle';

  /* 序号 */
  c.textAlign = 'left';
  c.font = mono(12, 700);
  c.fillStyle = on ? rgba(m.accent, 0.95) : 'rgba(126,158,188,0.42)';
  c.fillText(m.idx, x + 20, y + h * 0.5);

  /* 符号 */
  c.font = mono(31, 700);
  c.fillStyle = on ? rgba(m.accent, 0.96) : rgba(m.accent, 0.42);
  if (on) { c.shadowColor = rgba(m.accent, 0.6); c.shadowBlur = 20; }
  c.fillText(m.glyph, x + 68, y + h * 0.5 + 1);
  c.shadowBlur = 0;

  /* 名称 + 英文：两种通道用两套字形 */
  var isCode = m.id === 'code';
  c.shadowColor = 'rgba(2,6,12,0.9)'; c.shadowBlur = 12;
  if (isCode) {
    c.font = mono(19, 700);
    tracked(c, 1.2);
    c.fillStyle = on ? 'rgba(236,250,255,1)' : 'rgba(178,200,222,0.60)';
    c.fillText(m.name, x + 132, y + h * 0.40);
    tracked(c, 0);
  } else {
    c.font = font(20, 800);
    tracked(c, 2.6);
    c.fillStyle = on ? 'rgba(242,246,255,1)' : 'rgba(186,196,230,0.62)';
    c.fillText(m.name, x + 132, y + h * 0.40);
    tracked(c, 0);
  }
  c.shadowBlur = 0;
  c.font = mono(8.4, 600);
  tracked(c, 2.8);
  c.fillStyle = on ? rgba(m.accent, 0.80) : 'rgba(126,158,188,0.42)';
  c.fillText(m.en, x + 132, y + h * 0.68);
  tracked(c, 0);

  /* 这条通道挂的身份代号 */
  if (m.handle) {
    c.font = font(11, 700);
    c.fillStyle = on ? rgba(m.accent, 0.72) : 'rgba(126,158,188,0.34)';
    c.fillText(m.handle, x + 132 + 96, y + h * 0.68);
  }

  /* 说明 */
  c.font = font(11.5, 500);
  c.fillStyle = on ? 'rgba(176,204,232,0.82)' : 'rgba(126,158,188,0.44)';
  c.fillText(m.sub, x + w * 0.52, y + h * 0.44);

  c.font = mono(8.2, 500);
  tracked(c, 1.2);
  c.fillStyle = on ? 'rgba(150,182,210,0.62)' : 'rgba(126,158,188,0.32)';
  c.fillText(m.note, x + w * 0.52, y + h * 0.70);
  tracked(c, 0);

  /* 右侧数字 */
  var si;
  for (si = 0; si < m.stats.length; si++) {
    var sx = x + w - 22;
    var sy = y + h * (0.36 + si * 0.30);
    c.textAlign = 'right';
    c.font = mono(13, 600);
    c.fillStyle = on ? 'rgba(236,248,255,0.94)' : 'rgba(126,158,188,0.46)';
    c.fillText(m.stats[si][1], sx, sy);
    var tw = c.measureText(m.stats[si][1]).width;
    c.font = mono(7.2, 500);
    tracked(c, 1.4);
    c.fillStyle = on ? 'rgba(150,182,210,0.58)' : 'rgba(126,158,188,0.30)';
    c.fillText(m.stats[si][0], sx - tw - 8, sy);
    tracked(c, 0);
  }

  /* 选中：一条沿底边跑的光 */
  if (on) {
    var pw = w - 40;
    var px = x + 20 + ((t * 0.42) % 1) * pw;
    c.beginPath();
    c.moveTo(px, y + h - 1); c.lineTo(px + 34, y + h - 1);
    c.lineWidth = 2; c.strokeStyle = rgba(m.accent, 0.85);
    c.stroke();
  }

  c.restore();
}

/* 侧栏：整条竖直的机柜，不是一句小字 */
function bootRail(c, x, y, w, h, t, side) {
  c.save();
  c.fillStyle = 'rgba(6,12,20,0.42)';
  c.fillRect(x, y, w, h);
  c.beginPath();
  c.rect(x + 0.5, y + 0.5, w - 1, h - 1);
  c.lineWidth = 0.8;
  c.strokeStyle = 'rgba(126,158,188,0.14)';
  c.stroke();

  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = mono(8.2, 600);
  tracked(c, 2.6);
  c.fillStyle = 'rgba(150,186,218,0.66)';
  c.fillText(side === 'L' ? 'OPERATOR / 操作员' : 'CHANNEL NOTES / 通道说明', x + 14, y + 18);
  tracked(c, 0);

  c.beginPath();
  c.moveTo(x + 14, y + 30); c.lineTo(x + w - 14, y + 30);
  c.lineWidth = 0.7; c.strokeStyle = 'rgba(126,158,188,0.16)'; c.stroke();

  var rowsL = [
    ['上次接入', '学习通道', 0],
    ['累计会话', '128', 0],
    ['认知负载', '62%', 0.62],
    ['对接带宽', '48%', 0.48]
  ];
  var rowsR = [
    ['CH-A 学习', '星图 / 六科 / 偏差', 0],
    ['CH-B 编程', '工具 / 会话 / 仓库', 0],
    ['提示', '输入 1 / 2 后回车', 0]
  ];
  var rows = side === 'L' ? rowsL : rowsR;
  var i, ry, frac;
  for (i = 0; i < rows.length; i++) {
    ry = y + 52 + i * 46;
    c.textAlign = 'left';
    c.font = mono(8.4, 500);
    tracked(c, 1.6);
    c.fillStyle = 'rgba(126,158,188,0.46)';
    c.fillText(rows[i][0], x + 14, ry);
    tracked(c, 0);
    c.font = mono(11, 600);
    c.fillStyle = 'rgba(222,240,255,0.86)';
    c.fillText(rows[i][1], x + 14, ry + 16);

    frac = rows[i][2];
    if (frac > 0) {
      c.beginPath();
      c.moveTo(x + 14, ry + 26); c.lineTo(x + w - 14, ry + 26);
      c.lineWidth = 2; c.strokeStyle = 'rgba(126,158,188,0.16)'; c.stroke();
      c.beginPath();
      c.moveTo(x + 14, ry + 26); c.lineTo(x + 14 + (w - 28) * frac, ry + 26);
      c.strokeStyle = 'rgba(108,196,232,0.78)'; c.stroke();
    }
  }

  /* 底部：设备号 */
  c.font = mono(7.6, 500);
  tracked(c, 1.4);
  c.fillStyle = 'rgba(126,158,188,0.34)';
  c.fillText('SYS 550W · LINK 0.7M', x + 14, y + h - 16);
  tracked(c, 0);
  c.restore();
}

/* 指令行：可以点，也可以直接敲 */
function bootPrompt(c, x, y, w, t) {
  var h = 46;
  var hot = BOOT.promptHot;
  BOOT.promptRect = { x: x, y: y, w: w, h: h };
  c.save();
  c.fillStyle = 'rgba(6,12,20,0.72)';
  c.fillRect(x, y, w, h);
  c.beginPath();
  c.rect(x + 0.5, y + 0.5, w - 1, h - 1);
  c.lineWidth = 0.9;
  c.strokeStyle = hot ? 'rgba(255,181,82,0.60)' : 'rgba(126,158,188,0.22)';
  c.stroke();

  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = mono(12, 700);
  c.fillStyle = 'rgba(255,181,82,0.90)';
  c.fillText('>', x + 14, y + h / 2);

  var cmd = BOOT.cmd || '';
  var cx = x + 34;
  c.font = mono(12.5, 600);
  if (cmd) {
    c.fillStyle = 'rgba(232,246,255,0.96)';
    c.fillText(cmd, cx, y + h / 2);
    cx += c.measureText(cmd).width + 2;
    if (((t * 2.2) % 1) < 0.55) {
      c.fillStyle = 'rgba(232,246,255,0.85)';
      c.fillRect(cx, y + h / 2 - 8, 7, 16);
    }
  } else {
    c.fillStyle = 'rgba(126,158,188,0.58)';
    c.fillText('输入 1 / 2 · study / code · 回车接入', cx, y + h / 2);
  }

  c.textAlign = 'right';
  c.font = mono(8, 500);
  tracked(c, 1.8);
  c.fillStyle = 'rgba(126,158,188,0.44)';
  c.fillText('COMMAND', x + w - 14, y + h / 2);
  tracked(c, 0);
  c.restore();
}

/* 身份验证：口令 → 校验 → 通过，才允许选通道 */
/* ── 证件照：真实图片优先，没有就按账号生成方块头像 ─────────────────────── */
function bootAvatar(c, x, y, w, h, gh, t) {
  BOOT.avatarRect = { x: x, y: y, w: w, h: h };

  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();

  var ready = (typeof BOOT_AVATAR !== 'undefined' && BOOT_AVATAR.ready && BOOT_AVATAR.img);
  if (ready) {
    var iw = BOOT_AVATAR.img.width || 1, ih = BOOT_AVATAR.img.height || 1;
    var sc = Math.max(w / iw, h / ih);
    var dw = iw * sc, dh = ih * sc;
    c.drawImage(BOOT_AVATAR.img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    /* 压一点对比，免得照片在冷色终端里太跳 */
    c.fillStyle = 'rgba(8,18,30,0.24)';
    c.fillRect(x, y, w, h);
  } else {
    /* identicon：5×5 镜像格子，由账号决定，换账号就换头像 */
    c.fillStyle = 'rgba(5,11,19,0.94)';
    c.fillRect(x, y, w, h);
    var key = gh || 'guest';
    var cell = Math.floor(w * 0.155);
    var ox = x + Math.round((w - cell * 5) / 2);
    var oy = y + Math.round((h - cell * 5) / 2) - 8;
    var gx, gy, bit;
    for (gx = 0; gx < 3; gx++) {
      for (gy = 0; gy < 5; gy++) {
        bit = (hashStr(key + ':' + gx + ':' + gy) >>> 0) % 100;
        if (bit < 46) continue;
        var a = 0.26 + (bit % 52) / 100;
        c.fillStyle = 'rgba(148,200,238,' + a.toFixed(2) + ')';
        c.fillRect(ox + gx * cell, oy + gy * cell, cell - 1, cell - 1);
        c.fillRect(ox + (4 - gx) * cell, oy + gy * cell, cell - 1, cell - 1);
      }
    }
  }

  /* 底部提示条：告示这张照片是可以换的 */
  var hy = y + h - 20;
  var g2 = c.createLinearGradient(0, hy, 0, y + h);
  g2.addColorStop(0, 'rgba(3,8,14,0)');
  g2.addColorStop(1, 'rgba(3,8,14,0.86)');
  c.fillStyle = g2;
  c.fillRect(x, hy, w, 20);

  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = mono(7, 600); tracked(c, 0.8);
  c.fillStyle = 'rgba(190,222,248,0.72)';
  c.fillText('点击更换 · CHANGE', x + w / 2, y + h - 9);
  tracked(c, 0);

  /* 取景框四角 */
  var m = 4, L = 9;
  c.strokeStyle = 'rgba(170,212,244,0.34)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x + m, y + m + L); c.lineTo(x + m, y + m); c.lineTo(x + m + L, y + m);
  c.moveTo(x + w - m - L, y + m); c.lineTo(x + w - m, y + m); c.lineTo(x + w - m, y + m + L);
  c.moveTo(x + m, y + h - m - L); c.lineTo(x + m, y + h - m); c.lineTo(x + m + L, y + h - m);
  c.moveTo(x + w - m - L, y + h - m); c.lineTo(x + w - m, y + h - m); c.lineTo(x + w - m, y + h - m - L);
  c.stroke();

  c.restore();
}

function bootAuth(c, w, h, t) {
  var st = BOOT.auth;
  var cw = Math.min(760, w - 140);
  var x0 = (w - cw) / 2;
  var top = h * 0.175;

  /* 蒙板：把底下的网格/地球压下去，只留一点点 */
  c.fillStyle = 'rgba(3,6,11,0.82)';
  c.fillRect(0, 0, w, h);

  /* 标题 */
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = font(clamp(w * 0.020, 20, 26), 800);
  tracked(c, 10);
  c.shadowColor = 'rgba(2,6,12,0.9)'; c.shadowBlur = 14;
  c.fillStyle = st === 2 ? 'rgba(190,246,224,0.98)' : 'rgba(236,248,255,0.98)';
  c.fillText(st === 2 ? '身份验证通过' : '身份验证', w / 2, top);
  c.shadowBlur = 0;
  tracked(c, 0);

  c.font = mono(9.2, 700);
  tracked(c, 5);
  c.fillStyle = st === 2 ? 'rgba(120,220,180,0.80)' : 'rgba(140,176,210,0.72)';
  c.fillText(st === 2 ? 'IDENTITY VERIFIED' : 'IDENTITY VERIFICATION', w / 2, top + 26);
  tracked(c, 0);

  c.beginPath();
  c.moveTo(w / 2 - 132, top + 46); c.lineTo(w / 2 + 132, top + 46);
  c.lineWidth = 0.9; c.strokeStyle = 'rgba(150,190,225,0.28)'; c.stroke();

  /* ── 证件卡 ── */
  var cardW = Math.min(400, cw * 0.50);
  var cardH = 248;
  var cardX = x0;
  var cardY = top + 86;

  c.fillStyle = 'rgba(8,15,24,0.78)';
  c.fillRect(cardX, cardY, cardW, cardH);
  c.beginPath();
  c.rect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);
  c.lineWidth = 1; c.strokeStyle = 'rgba(140,180,215,0.30)'; c.stroke();

  /* 四角刻线 */
  var kx, ky;
  for (kx = 0; kx < 2; kx++) {
    for (ky = 0; ky < 2; ky++) {
      var px0 = cardX + (kx ? cardW - 14 : 6);
      var py0 = cardY + (ky ? cardH - 14 : 6);
      c.beginPath();
      c.moveTo(px0, py0 + (ky ? 0 : 8)); c.lineTo(px0, py0);
      c.lineTo(px0 + 8, py0);
      c.lineWidth = 1.2; c.strokeStyle = 'rgba(150,196,230,0.42)'; c.stroke();
    }
  }

  /* 证件照位 */
  var phX = cardX + 18, phY = cardY + 20, phW = 96, phH = 124;
  c.fillStyle = 'rgba(4,10,18,0.9)';
  c.fillRect(phX, phY, phW, phH);
  c.beginPath();
  c.rect(phX + 0.5, phY + 0.5, phW - 1, phH - 1);
  c.lineWidth = 0.8; c.strokeStyle = 'rgba(126,158,188,0.34)'; c.stroke();

  /* 证件照：可点换图；没有图就按账号生成 identicon */
  bootAvatar(c, phX, phY, phW, phH, BOOT.gh || '', t);

  /* 照片扫描线（校验时上下扫） */
  if (st >= 1) {
    var sy = phY + ((Math.sin((t - BOOT.authAt) * 3.4) * 0.5 + 0.5) * phH);
    c.fillStyle = 'rgba(120,220,190,0.16)';
    c.fillRect(phX, sy - 10, phW, 20);
    c.fillStyle = 'rgba(150,240,210,0.85)';
    c.fillRect(phX, sy, phW, 1.4);
  }

  /* 账号与编号（不放真名，只认 GitHub） */
  var gh = BOOT.gh || '';
  c.textAlign = 'left';
  c.font = font(gh ? 19 : 15, 800);
  tracked(c, 1.2);
  c.fillStyle = gh ? 'rgba(238,248,255,0.97)' : 'rgba(126,158,188,0.40)';
  c.fillText(gh ? '@' + gh : '待接入账号', phX + phW + 20, cardY + 48);
  tracked(c, 0);

  c.font = mono(8.4, 700);
  tracked(c, 2.4);
  c.fillStyle = 'rgba(150,186,218,0.68)';
  c.fillText('GITHUB HANDLE', phX + phW + 20, cardY + 70);
  tracked(c, 0);

  var sig = (hashStr(gh || 'guest') >>> 0);
  var hex4 = ('0000' + sig.toString(16).toUpperCase()).slice(-4);
  c.font = mono(9, 600);
  c.fillStyle = 'rgba(160,196,226,0.62)';
  c.fillText('ID  NL-550W-' + hex4, phX + phW + 20, cardY + 96);
  c.fillText('权限  LEVEL-3 / 认知终端', phX + phW + 20, cardY + 114);
  c.fillText('通道  学习 · 编程', phX + phW + 20, cardY + 132);

  /* 卡底条码 */
  var bi;
  for (bi = 0; bi < 34; bi++) {
    var bh2 = 4 + ((bi * 37) % 13);
    c.fillStyle = 'rgba(150,196,230,' + (0.18 + ((bi * 13) % 5) * 0.05) + ')';
    c.fillRect(cardX + 18 + bi * 5.6, cardY + cardH - 28, 2.4, bh2);
  }
  c.font = mono(7.4, 600);
  c.textAlign = 'right';
  c.fillStyle = 'rgba(150,186,218,0.42)';
  c.fillText('CH-550W / 0.7M', cardX + cardW - 16, cardY + cardH - 34);

  /* ── 右侧校验清单 ── */
  var lx = cardX + cardW + 44;
  var ly = cardY + 4;
  c.textAlign = 'left';
  c.font = mono(8.4, 700);
  tracked(c, 2.6);
  c.fillStyle = 'rgba(150,186,218,0.62)';
  c.fillText('VERIFICATION / 校验流程', lx, ly);
  tracked(c, 0);

  var items = ['生物特征', '权限核验', '链路协商'];
  var en = ['BIOMETRIC', 'CLEARANCE', 'HANDSHAKE'];
  var i2;
  for (i2 = 0; i2 < items.length; i2++) {
    var iy = ly + 34 + i2 * 44;
    var done = st >= 1 && (t - BOOT.authAt) > 0.28 + i2 * 0.34;
    var active = st >= 1 && !done && (t - BOOT.authAt) > i2 * 0.34;
    c.beginPath();
    c.arc(lx + 6, iy, 4.2, 0, TAU);
    c.lineWidth = 1.2;
    c.strokeStyle = done ? 'rgba(120,224,184,0.95)'
      : (active ? 'rgba(255,181,82,0.9)' : 'rgba(126,158,188,0.34)');
    c.stroke();
    if (done) {
      c.fillStyle = 'rgba(120,224,184,0.95)';
      c.beginPath(); c.arc(lx + 6, iy, 2.2, 0, TAU); c.fill();
    }
    c.font = font(12.5, 700);
    c.fillStyle = done ? 'rgba(214,244,232,0.92)' : 'rgba(180,206,232,0.62)';
    c.fillText(items[i2], lx + 20, iy);
    c.font = mono(7.6, 600);
    tracked(c, 1.3);
    c.fillStyle = 'rgba(126,158,188,0.44)';
    c.fillText(en[i2], lx + 96, iy + 1);
    tracked(c, 0);
    c.font = mono(8, 700);
    c.textAlign = 'right';
    c.fillStyle = done ? 'rgba(120,224,184,0.85)' : 'rgba(126,158,188,0.40)';
    c.fillText(done ? 'OK' : (active ? '...' : '--'), lx + 232, iy);
    c.textAlign = 'left';
  }

  /* 状态词 */
  c.font = mono(9.4, 700);
  tracked(c, 2.2);
  c.fillStyle = st === 2 ? 'rgba(120,224,184,0.9)'
    : (st === 1 ? 'rgba(255,181,82,0.9)' : 'rgba(126,158,188,0.55)');
  c.fillText(st === 2 ? '接入许可 · GRANTED' : (st === 1 ? '校验中 · VERIFYING' : '待输入口令 · AWAITING INPUT'),
    lx, cardY + cardH - 18);
  tracked(c, 0);

  /* ── 口令行 ── */
  var py = cardY + cardH + 34;
  var hot2 = BOOT.promptHot;
  c.fillStyle = 'rgba(6,12,20,0.82)';
  c.fillRect(x0, py, cw, 48);
  c.beginPath();
  c.rect(x0 + 0.5, py + 0.5, cw - 1, 47);
  c.lineWidth = 1;
  c.strokeStyle = st === 2 ? 'rgba(120,224,184,0.42)'
    : (hot2 ? 'rgba(255,181,82,0.62)' : 'rgba(126,158,188,0.28)');
  c.stroke();
  BOOT.promptRect = { x: x0, y: py, w: cw, h: 48 };

  c.font = mono(13, 700);
  c.textAlign = 'left';
  c.fillStyle = 'rgba(255,181,82,0.92)';
  c.fillText('>', x0 + 16, py + 24);

  var cmd2 = BOOT.cmd || '';
  c.font = mono(13, 700);
  if (cmd2) {
    c.fillStyle = 'rgba(236,248,255,0.97)';
    c.fillText(cmd2, x0 + 38, py + 24);
    if (((t * 2.2) % 1) < 0.55 && st === 0) {
      c.fillStyle = 'rgba(236,248,255,0.85)';
      c.fillRect(x0 + 40 + c.measureText(cmd2).width, py + 16, 7.5, 17);
    }
  } else {
    c.fillStyle = 'rgba(150,186,218,0.66)';
    c.fillText(st === 2 ? '验证通过 · 正在打开通道清单' : '输入 GitHub 账号 · 例如 Canvilke', x0 + 38, py + 24);
  }

  /* 提示：空口令回车 */
  if (BOOT.authHint > 0 && t - BOOT.authHint < 2.4) {
    c.textAlign = 'center';
    c.font = mono(8.6, 700);
    c.fillStyle = 'rgba(255,140,110,' + (1 - (t - BOOT.authHint) / 2.4).toFixed(2) + ')';
    c.fillText(BOOT.authMsg || '需要 GitHub 账号才能通过验证', w / 2, py + 66);
  }

  /* 底部提示 */
  c.textAlign = 'center';
  c.font = mono(9.4, 600);
  tracked(c, 2.4);
  c.fillStyle = 'rgba(150,186,218,0.55)';
  c.fillText('ENTER  核验 GitHub 账号      ESC  跳过验证', w / 2, h - 62);
  tracked(c, 0);
}

function bootChoose(c, w, h, t) {
  var i, m, bw, bh, gap, x0, y0, railY, railH, railW, colGap, cw;
  var top = h * 0.175;

  /* 蒙板：先压一层暗，再给中心一点极淡的托底，避免和底下的星图打架 */
  c.fillStyle = 'rgba(3,6,11,0.80)';
  c.fillRect(0, 0, w, h);
  var scrim = c.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, Math.max(w, h) * 0.62);
  scrim.addColorStop(0, 'rgba(10,18,28,0.34)');
  scrim.addColorStop(0.55, 'rgba(6,11,19,0.16)');
  scrim.addColorStop(1, 'rgba(3,6,11,0.10)');
  c.fillStyle = scrim;
  c.fillRect(0, 0, w, h);

  /* 入场：整块往上浮 10px，和淡入一起做完 */
  var age = t - (BOOT.switchAt || 0);
  var rise = (1 - clamp(age / 0.62, 0, 1)) * 10;
  c.save();
  c.translate(0, rise);

  /* 标题 */
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = font(clamp(w * 0.020, 20, 26), 700);
  tracked(c, 10);
  c.fillStyle = 'rgba(232,246,255,0.96)';
  c.fillText('选择接入通道', w / 2, top);
  tracked(c, 0);

  c.font = mono(9.2, 600);
  tracked(c, 5);
  c.fillStyle = 'rgba(126,158,188,0.66)';
  c.fillText('SELECT ACCESS CHANNEL', w / 2, top + 26);
  tracked(c, 0);

  c.beginPath();
  c.moveTo(w / 2 - 132, top + 46); c.lineTo(w / 2 + 132, top + 46);
  c.lineWidth = 0.8; c.strokeStyle = 'rgba(150,190,225,0.26)'; c.stroke();
  c.beginPath();
  c.moveTo(w / 2 - 5, top + 42); c.lineTo(w / 2 + 5, top + 50);
  c.lineWidth = 1.8; c.strokeStyle = 'rgba(255,181,82,0.78)'; c.stroke();

  /* 三栏 */
  cw = Math.min(760, Math.max(520, w - 2 * (56 + 250 + 40)));
  x0 = (w - cw) / 2;
  y0 = Math.max(top + 92, h * 0.335);
  bh = clamp(h * 0.108, 78, 96);
  gap = 14;
  railW = clamp(w * 0.152, 210, 250);
  colGap = clamp(w * 0.024, 26, 44);
  railY = y0 - 46;
  railH = Math.min(h - railY - 118, 2 * bh + gap + 150);

  /* 清单标题 */
  c.textAlign = 'left';
  c.font = mono(8.6, 600);
  tracked(c, 2.6);
  c.fillStyle = 'rgba(150,186,218,0.62)';
  c.fillText('CHANNEL MANIFEST / 通道清单', x0 + 2, y0 - 16);
  tracked(c, 0);

  BOOT.rects = [];
  for (i = 0; i < BOOT_MODES.length; i++) {
    m = BOOT_MODES[i];
    BOOT.rects.push({ x: x0, y: y0 + i * (bh + gap), w: cw, h: bh, i: i });
    bootRow(c, x0, y0 + i * (bh + gap), cw, bh, m, BOOT.sel === i, BOOT.hot === i, t);
  }

  /* 指令行 */
  bootPrompt(c, x0, y0 + 2 * bh + gap + 26, cw, t);

  /* 两侧机柜 */
  if (w > 1180) {
    bootRail(c, 56, railY, railW, railH, t, 'L');
    bootRail(c, w - 56 - railW, railY, railW, railH, t, 'R');
  }

  /* 底部 */
  c.textAlign = 'center';
  c.font = mono(9.6, 600);
  tracked(c, 2.6);
  c.fillStyle = 'rgba(150,186,218,0.62)';
  var _left = Math.max(0, Math.ceil(9 - (t - BOOT.lastInput)));
  c.fillText('↑ ↓  切换通道      ENTER  接入      ESC  按上次选择直接进入      ' + _left + 's 后自动接入', w / 2, h - 62);
  tracked(c, 0);

  c.font = mono(8.6, 500);
  c.fillStyle = 'rgba(255,181,82,0.52)';
  c.fillText('注意：接入后仍可在终端内切换通道', w / 2, h - 42);
  c.restore();
}

function bootEnter(c, w, h, t, sel) {
  var m = BOOT_MODES[sel] || BOOT_MODES[0];
  var k = clamp(t / 1.6, 0, 1);

  /* 扫描线：自上而下扫过，扫过的区域压暗，线本身发光 */
  var py = -0.08 * h + k * 1.18 * h;
  if (py > -40) {
    c.fillStyle = 'rgba(3,6,12,0.62)';
    c.fillRect(0, 0, w, Math.max(0, py - 6));

    var trail = c.createLinearGradient(0, py - 120, 0, py);
    trail.addColorStop(0, 'rgba(6,12,20,0)');
    trail.addColorStop(1, rgba(m.accent, 0.20));
    c.fillStyle = trail;
    c.fillRect(0, Math.max(0, py - 120), w, Math.min(120, py));

    c.fillStyle = rgba(m.accent, 0.92);
    c.fillRect(0, py - 1, w, 2.4);
    c.fillStyle = 'rgba(236,252,255,0.55)';
    c.fillRect(0, py - 1, w, 0.8);
  }

  /* 被扫过之后，整幅压到很暗 */
  c.fillStyle = 'rgba(3,6,12,' + (0.30 * k).toFixed(3) + ')';
  c.fillRect(0, 0, w, h);

  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = mono(10.5, 600);
  tracked(c, 5);
  c.fillStyle = 'rgba(232,248,255,' + (0.50 + 0.40 * k).toFixed(3) + ')';
  c.fillText('接入' + m.name + ' · ' + m.en, w / 2, h * 0.5);
  tracked(c, 0);

  /* 扫描过半后再提示一句，让人知道接下来会发生什么 */
  var a2 = clamp((k - 0.42) / 0.26, 0, 1);
  if (a2 > 0) {
    c.globalAlpha = a2;
    c.font = mono(8.4, 600); tracked(c, 3.2);
    c.fillStyle = 'rgba(150,200,232,0.72)';
    c.fillText('设备自检完成 · 正在建立认知链路', w / 2, h * 0.5 + 26);
    tracked(c, 0);
    c.globalAlpha = 1;
  }

  /* 右下角：一行跃迁进度读数的刻度尺 */
  var bw = Math.min(320, w * 0.26);
  c.beginPath(); c.rect(w / 2 - bw / 2, h * 0.5 + 52, bw, 1.4);
  c.fillStyle = 'rgba(126,158,188,0.24)'; c.fill();
  c.beginPath(); c.rect(w / 2 - bw / 2, h * 0.5 + 52, bw * k, 1.4);
  c.fillStyle = rgba(m.accent, 0.82); c.fill();
}

/* 跃迁：星点从中心向外拉成线，背景让位给下面的星图，最后一道白闪 */
function bootDive(c, w, h, t, sel) {
  var m = BOOT_MODES[sel] || BOOT_MODES[0];
  var k = clamp(t / 2.8, 0, 1);

  /* 起跳冲击波：一圈从中心推出、迅速变淡，接住扫描线的尾巴 */
  var wv = clamp(t / 1.1, 0, 1);
  if (wv < 1) {
    c.beginPath();
    c.arc(w * 0.5, h * 0.5, wv * Math.max(w, h) * 0.62, 0, TAU);
    c.lineWidth = 40 * (1 - wv);
    c.strokeStyle = rgba(m.accent, 0.16 * (1 - wv));
    c.stroke();
  }
  var cx = w * 0.5, cy = h * 0.50;
  var i, a, r0, r1, sp;

  /* 光速线 */
  for (i = 0; i < 108; i++) {
    a = (i / 108) * TAU + i * 0.7;
    sp = 0.35 + ((i * 37) % 100) / 100;
    r0 = (0.05 + k * k * sp * 1.1) * Math.max(w, h) * 0.5;
    r1 = r0 + (14 + 90 * k * k * sp);
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    c.lineWidth = 0.7 + 1.4 * k * sp;
    c.strokeStyle = rgba(m.accent, (0.10 + 0.42 * k) * (0.35 + sp * 0.65));
    c.stroke();
  }

  /* 收缩的通道环 */
  var rr;
  for (i = 0; i < 3; i++) {
    rr = (1 - k) * (0.55 + i * 0.16);
    c.beginPath();
    c.arc(cx, cy, rr * Math.max(w, h) * 0.6 + i * 6, 0, TAU);
    c.lineWidth = 1.4 * (1 - k);
    c.strokeStyle = rgba(m.accent, 0.34 * (1 - k));
    c.stroke();
  }

  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = mono(9, 500);
  tracked(c, 5);
  c.fillStyle = 'rgba(214,238,255,' + (0.30 + 0.45 * k).toFixed(3) + ')';
  c.fillText(k < 0.34 ? '建立星图链路 · LINKING'
    : (k < 0.70 ? '同步认知缓存 · SYNCING'
      : '链路已建立 · LINK ESTABLISHED'), cx, cy + Math.max(w, h) * 0.20);
  tracked(c, 0);

  /* 三个节点依次点亮，作为"同步"的可视凭据 */
  var si;
  for (si = 0; si < 3; si++) {
    var sp2 = clamp((k - 0.28 - si * 0.14) / 0.16, 0, 1);
    var px = cx + (si - 1) * 46;
    var pyy = cy + Math.max(w, h) * 0.20 + 22;
    c.beginPath(); c.arc(px, pyy, 2.6, 0, TAU);
    c.fillStyle = rgba(m.accent, 0.14 + sp2 * 0.72);
    c.fill();
    if (sp2 > 0.5) {
      c.beginPath(); c.arc(px, pyy, 5.4 + (sp2 - 0.5) * 6, 0, TAU);
      c.lineWidth = 0.9; c.strokeStyle = rgba(m.accent, 0.30 * (1 - sp2));
      c.stroke();
    }
  }

  /* 收尾白闪 */
  if (k > 0.88) {
    var f = (k - 0.88) / 0.12;
    c.fillStyle = rgba(m.accent, 0.30 * f);
    c.fillRect(0, 0, w, h);
  }
}


/* ── 认知图同步：自检通过后，把六科轨道一条条接起来 ─────────────────────── */
function bootSync(c, w, h, t) {
  var el = t - (BOOT.switchAt || 0);
  var cx = w * 0.5, cy = h * 0.43;
  var i, R = Math.min(w, h) * 0.105;

  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = font(20, 800); tracked(c, 8.1);
  c.fillStyle = 'rgba(226,242,255,0.96)';
  c.fillText('认知图同步', cx, h * 0.235);
  tracked(c, 0);
  c.font = mono(8.8, 600); tracked(c, 2.8);
  c.fillStyle = 'rgba(150,188,220,0.72)';
  c.fillText('FIELD SYNC · REBUILDING SIX ORBITS', cx, h * 0.235 + 24);
  tracked(c, 0);

  /* 三层环：外圈刻度、中圈扫描、内圈百分比 */
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2);
  c.lineWidth = 0.8; c.strokeStyle = 'rgba(126,158,188,0.22)'; c.stroke();

  c.save();
  c.translate(cx, cy); c.rotate(el * 0.55);
  c.beginPath();
  for (i = 0; i < 64; i++) {
    var a0 = i / 64 * Math.PI * 2;
    var r0 = R * (i % 4 === 0 ? 0.90 : 0.95);
    c.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    c.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
  }
  c.strokeStyle = 'rgba(150,200,235,0.30)'; c.lineWidth = 0.8; c.stroke();
  c.restore();

  c.save();
  c.translate(cx, cy); c.rotate(-el * 0.85);
  c.beginPath(); c.arc(0, 0, R * 0.82, -0.35, 1.75);
  c.lineWidth = 2.2; c.strokeStyle = 'rgba(111,210,255,0.88)'; c.stroke();
  c.beginPath(); c.arc(0, 0, R * 0.82, 2.35, 3.35);
  c.lineWidth = 1.2; c.strokeStyle = 'rgba(111,210,255,0.34)'; c.stroke();
  c.restore();

  var sum = 0;
  for (i = 0; i < 6; i++) sum += clamp((el - 0.24 - i * 0.26) / 1.15, 0, 1) / 6;
  c.font = mono(24, 700);
  c.fillStyle = 'rgba(238,250,255,0.96)';
  c.fillText(Math.round(sum * 100) + '%', cx, cy + 2);
  c.font = mono(7.6, 600); tracked(c, 2.2);
  c.fillStyle = 'rgba(140,180,212,0.62)';
  c.fillText('SYNC', cx, cy + 24);
  tracked(c, 0);

  /* 六科条：两列三行 */
  var subs = (typeof SUBJECTS !== 'undefined' && SUBJECTS.length) ? SUBJECTS : [
    { name: '语文', hue: '#56d6b0', glyph: '¶' }, { name: '数学', hue: '#6f8bff', glyph: 'Σ' },
    { name: '英语', hue: '#b58cff', glyph: 'Æ' }, { name: '物理', hue: '#61d5ff', glyph: 'φ' },
    { name: '化学', hue: '#2fb6d8', glyph: '⌬' }, { name: '政治', hue: '#ffb45c', glyph: '§' }
  ];
  var colW = Math.min(300, (w - 160) / 2 - 24);
  var x0 = cx - colW - 18, x1 = cx + 18;
  var y0 = cy + R + 54;
  for (i = 0; i < subs.length && i < 6; i++) {
    var sj = subs[i];
    var sp = clamp((el - 0.24 - i * 0.26) / 1.15, 0, 1);
    var bx = (i % 2 === 0) ? x0 : x1;
    var by = y0 + Math.floor(i / 2) * 34;
    var hue = sj.hue || '#8fa8ff';

    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = font(13, 600);
    c.fillStyle = rgba(hue, 0.42 + sp * 0.58);
    c.fillText(sj.glyph || '·', bx, by);
    c.font = font(11, 500);
    c.fillStyle = 'rgba(214,234,252,' + (0.50 + sp * 0.44).toFixed(3) + ')';
    c.fillText(sj.name, bx + 20, by);

    var bw = colW - 74;
    c.beginPath(); c.rect(bx + 56, by - 1.4, bw, 2.6);
    c.fillStyle = 'rgba(126,158,188,0.16)'; c.fill();
    c.beginPath(); c.rect(bx + 56, by - 1.4, bw * sp, 2.6);
    c.fillStyle = rgba(hue, 0.30 + sp * 0.55); c.fill();

    c.textAlign = 'right';
    c.font = mono(8.4, 600);
    c.fillStyle = 'rgba(200,226,248,' + (0.34 + sp * 0.52).toFixed(3) + ')';
    c.fillText(sp >= 1 ? 'OK' : (Math.round(sp * 100) + '%'), bx + colW, by);
  }

  c.textAlign = 'center';
  c.font = mono(8.4, 500); tracked(c, 1.8);
  c.fillStyle = 'rgba(255,181,82,0.62)';
  c.fillText('六科轨道重建完成后将要求身份验证 · ESC 跳过', cx, h - 96);
  tracked(c, 0);
}

/* ── 通道简报：验证通过之后，给一眼这次接入会看到什么 ───────────────────── */
function bootBrief(c, w, h, t) {
  var el = t - (BOOT.switchAt || 0);
  var m = BOOT_MODES[BOOT.sel] || BOOT_MODES[1];
  var cx = w * 0.5;
  var bw = Math.min(720, w - 220);
  var bx = cx - bw / 2, by = h * 0.30;
  var accent = m.accent;

  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = font(20, 800); tracked(c, 8.1);
  c.fillStyle = 'rgba(226,242,255,0.96)';
  c.fillText('通道简报', cx, h * 0.215);
  tracked(c, 0);
  c.font = mono(8.8, 600); tracked(c, 2.8);
  c.fillStyle = 'rgba(150,188,220,0.72)';
  c.fillText('MISSION BRIEF · OPERATOR ' + (BOOT.gh || bootGhGet() || 'CANVILKE').toUpperCase(), cx, h * 0.215 + 24);
  tracked(c, 0);

  /* 通道条：左侧色条 + 名称 + 代号 */
  c.beginPath(); c.rect(bx, by, 3, 44);
  c.fillStyle = rgba(accent, 0.86); c.fill();

  c.textAlign = 'left';
  c.font = font(17, 800); tracked(c, 1.2);
  c.fillStyle = 'rgba(236,248,255,0.97)';
  c.fillText(m.name, bx + 18, by + 14);
  tracked(c, 0);
  c.font = mono(8.4, 600); tracked(c, 2.4);
  c.fillStyle = rgba(accent, 0.78);
  c.fillText(m.en + ' · ' + m.handle, bx + 18, by + 34);
  tracked(c, 0);

  c.textAlign = 'right';
  c.font = mono(9.2, 700);
  c.fillStyle = 'rgba(255,181,82,0.82)';
  c.fillText('身份验证通过 / VERIFIED', bx + bw, by + 14);

  /* 两行说明 */
  var lines = m.id === 'study'
    ? ['六科轨道已就绪：42 个考点、16 条引力带、3 片假阳性碎片等待巡视。',
       '进入后可随时用 M 键重新打开启动序列，或在操控台切换通道。']
    : ['工具链已就绪：18 个工具、会话按需建立、仓库挂载在终端内。',
       '进入后可随时用 M 键重新打开启动序列，或在操控台切换通道。'];
  c.textAlign = 'left';
  c.font = font(11.4, 500);
  for (var i = 0; i < lines.length; i++) {
    c.fillStyle = 'rgba(200,224,246,0.62)';
    c.fillText(lines[i], bx, by + 76 + i * 20);
  }

  /* 四个读数 */
  var stats = (m.id === 'study'
    ? [['考点', '42', 'POINTS'], ['引力带', '16', 'BANDS'], ['假阳性', '3', 'FALSE+'], ['盲区', '2', 'BLIND']]
    : [['工具', '18', 'TOOLS'], ['会话', '—', 'SESSION'], ['仓库', '1', 'REPO'], ['待办', '0', 'TASK']]);
  var sw = (bw - 36) / 4;
  for (i = 0; i < 4; i++) {
    var sx = bx + i * (sw + 12), sy = by + 132;
    c.font = mono(7.4, 600); tracked(c, 1.6);
    c.fillStyle = 'rgba(150,188,220,0.58)';
    c.fillText(stats[i][0] + ' · ' + stats[i][2], sx, sy);
    tracked(c, 0);
    c.font = mono(26, 700);
    c.fillStyle = 'rgba(240,250,255,0.97)';
    c.fillText(stats[i][1], sx, sy + 24);
    c.beginPath(); c.moveTo(sx, sy + 42); c.lineTo(sx + sw - 12, sy + 42);
    c.lineWidth = 0.7; c.strokeStyle = 'rgba(126,158,188,0.24)'; c.stroke();
  }

  /* 自动进入倒计时 */
  var p = clamp(el / 2.6, 0, 1);
  c.textAlign = 'center';
  c.font = mono(8.6, 600); tracked(c, 1.8);
  c.fillStyle = 'rgba(170,204,234,0.66)';
  c.fillText('ENTER 立即进入通道清单 · ' + Math.max(0, Math.ceil(2.6 - el)) + ' 秒后自动继续', cx, h - 128);
  tracked(c, 0);

  c.beginPath(); c.rect(cx - bw / 2, h - 108, bw, 1.6);
  c.fillStyle = 'rgba(126,158,188,0.18)'; c.fill();
  c.beginPath(); c.rect(cx - bw / 2, h - 108, bw * p, 1.6);
  c.fillStyle = rgba(accent, 0.72); c.fill();
}

function bootFrameBody(c, w, h, t, dpr) {
  var phase = BOOT.phase;
  var fade = phase === 'dive' ? clamp(1 - (t - BOOT.diveAt) / 1.5, 0.10, 1) : 1;
  bootBackdrop(c, w, h, t, fade);

  var R = Math.min(w, h) * 0.145;
  var cx = w * 0.5, cy = h * 0.50;

  if (phase === 'boot') {
    var p = clamp(t / 5.0, 0, 1);
    bootBeam(c, cx, cy, R, t);
    bootGlobe(c, cx, cy, R, t);

    c.globalAlpha = clamp((t - 0.1) / 0.4, 0, 1);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = font(clamp(w * 0.013, 12, 16), 400);
    tracked(c, 6);
    c.fillStyle = 'rgba(214,236,255,0.86)';
    c.fillText('认知终端 启动序列', cx, cy + R * 1.9);
    tracked(c, 0);
    c.font = mono(8, 400);
    tracked(c, 2.6);
    c.fillStyle = 'rgba(126,158,188,0.58)';
    c.fillText('COGNITIVE TERMINAL · BOOT SEQUENCE', cx, cy + R * 1.9 + 18);
    tracked(c, 0);
    c.globalAlpha = 1;

    bootLogs(c, 44, h * 0.60, t, dpr);
    bootProgress(c, 44, h - 62, w - 88, p);
  } else if (phase === 'sync') {
    bootSync(c, w, h, t);
  } else if (phase === 'auth') {
    c.globalAlpha = 0.30;
    bootGlobe(c, cx, cy, R * 0.66, t);
    bootBeam(c, cx, cy, R * 0.66, t);
    c.globalAlpha = 1;
    bootAuth(c, w, h, t);
  } else if (phase === 'brief') {
    c.globalAlpha = 0.16;
    bootGlobe(c, cx, cy, R * 0.60, t);
    c.globalAlpha = 1;
    bootBrief(c, w, h, t);
  } else if (phase === 'choose') {
    c.globalAlpha = 0.22;
    bootGlobe(c, cx, cy, R * 0.62, t);
    c.globalAlpha = 0.30;
    bootBeam(c, cx, cy, R * 0.62, t);
    c.globalAlpha = 1;
    bootChoose(c, w, h, t);
  } else if (phase === 'enter') {
    bootChoose(c, w, h, t);
    bootEnter(c, w, h, t - BOOT.turnAt, BOOT.sel);
  } else {
    bootGlobe(c, cx, cy, R * 0.52, t);
    bootDive(c, w, h, t - BOOT.diveAt, BOOT.sel);
  }

  bootHeader(c, w, h, t, phase);
  bootCorners(c, w, h, t);

  /* 右下：坐标读数，纯装饰 */
  c.textAlign = 'right'; c.textBaseline = 'middle';
  c.font = mono(8, 400);
  c.fillStyle = 'rgba(110,150,180,0.40)';
  c.fillText('37.42°N 122.16°E · 550W/0.7M', w - 44, h - 34);

  /* 转场：每换一屏都从黑里浮上来（不是硬切），跃迁那一段不盖，免得盖住星图 */
  if (phase !== 'dive') {
    var sw = clamp((t - (BOOT.switchAt || 0)) / 0.42, 0, 1);
    if (sw < 1) {
      c.fillStyle = 'rgba(2,5,10,' + (0.94 * (1 - sw) * (1 - sw)).toFixed(3) + ')';
      c.fillRect(0, 0, w, h);
    }
  }
}

function bootHit(mx, my) {
  var i, r;
  for (i = 0; i < BOOT.rects.length; i++) {
    r = BOOT.rects[i];
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return i;
  }
  return -1;
}

