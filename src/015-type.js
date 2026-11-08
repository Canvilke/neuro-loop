/* ────────────────────────────────────────────────────────────────────────────
 * 015 · type — 一套字，全终端共用
 *   之前每个模块自己写 px 和 weight，越改越散。这里收成 role 表：
 *   display / title / subtitle / body / label / micro / mono
 *   每个 role 带 [size, weight, tracking, alpha]，要改风格只改这张表。
 * ──────────────────────────────────────────────────────────────────────────── */

var TY = {
  /* 中文优先：先找系统里最“紧”的那几款，找不到再退回雅黑 */
  sans: '"Inter","HarmonyOS Sans SC","MiSans","Microsoft YaHei UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif',
  mono: '"JetBrains Mono","Cascadia Mono","SFMono-Regular",Consolas,"Courier New",monospace',
  role: {
    display:  [26, 800, 9.0, 0.98],
    title:    [19, 800, 1.4, 0.97],
    subtitle: [12.5, 650, 0.2, 0.80],
    body:     [11.5, 500, 0.05, 0.72],
    label:    [8.6, 700, 2.4, 0.66],
    micro:    [7.4, 600, 1.4, 0.44],
    mono:     [12, 600, 0.6, 0.92]
  }
};

/* 让 util 里的 font()/mono() 也用这套栈：同一份界面不留第二种字体观 */
FONT_STACK = TY.sans;
MONO_STACK = TY.mono;

function isMonoRole(role) {
  return role === 'mono' || role === 'label' || role === 'micro';
}

/* 只设字体 */
function tf(c, role, size, weight) {
  var r = TY.role[role] || TY.role.body;
  c.font = (weight || r[1]) + ' ' + (size || r[0]) + 'px ' + (isMonoRole(role) ? TY.mono : TY.sans);
}

/* 只设字距 */
function tt(c, role, extra) {
  var r = TY.role[role] || TY.role.body;
  tracked(c, extra === undefined ? r[2] : extra);
}

/* 只设颜色 */
function tc(c, role, alpha, tint) {
  var r = TY.role[role] || TY.role.body;
  var a = alpha === undefined ? r[3] : alpha;
  c.fillStyle = tint ? rgba(tint, a) : 'rgba(232,244,255,' + a + ')';
}

/* 一次设齐：字体 + 字距 + 颜色 */
function type(c, role, size, alpha, tint, weight) {
  tf(c, role, size, weight);
  tt(c, role);
  tc(c, role, alpha, tint);
}
