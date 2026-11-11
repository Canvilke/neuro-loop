// 认知终端的总入口：把原来侧边栏上的四个图标（认知巡检 / 编程台 / 今天 / 控制台）
// 收成一个，内部用页签切换。
// 为什么合并：侧边栏是全局资源，四个入口占掉三分之一，人一眼看不出它们是一件事。
// 之所以不删各自的组件，是因为「崩了不连累别人」——页签里只有当前那个在挂载。

var HUB_ID = 'neuro-loop';
var HUB_TAB_KEY = 'neuroloop.tab';

var HUB_TABS = [
  { id: 'today', label: '今天', en: 'TODAY', make: function () { return h(TodayPanel, {}); } },
  { id: 'map', label: '认知星图', en: 'FIELD', make: function () { return h(NeuroLoopPanel, {}); } },
  { id: 'team', label: '控制台', en: 'CONSOLE', make: function () { return h(TeamPanel, {}); } },
  { id: 'code', label: '编程台', en: 'ENGINEERING', make: function () { return h(CodePanel, {}); } },
  { id: 'nav', label: '导航', en: 'ALL PANELS', make: function () { return h(NavPanel, {}); } }
];

var HUB_CSS = [
  '.nl-hub{display:flex;flex-direction:column;width:100%;height:100%;min-height:520px;background:#04060d;color:#dbe8f6;',
  '  font-family:' + TY.sans + ';}',
  '.nl-hub-tabs{display:flex;align-items:stretch;gap:2px;padding:0 10px;border-bottom:1px solid rgba(126,168,214,0.16);',
  '  background:linear-gradient(180deg,rgba(10,20,34,0.94),rgba(6,12,22,0.72));flex:0 0 auto;}',
  '.nl-hub-tab{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;',
  '  color:rgba(168,196,224,0.62);padding:10px 14px 9px;cursor:pointer;display:flex;flex-direction:column;',
  '  align-items:flex-start;gap:2px;line-height:1;}',
  '.nl-hub-tab:hover{color:rgba(226,240,255,0.92);background:rgba(120,180,255,0.05);}',
  '.nl-hub-tab.on{color:rgba(236,248,255,0.98);border-bottom-color:rgba(95,216,238,0.9);}',
  '.nl-hub-tab .t{font-size:12.5px;font-weight:600;letter-spacing:0.02em;}',
  '.nl-hub-tab .e{font-size:7.4px;font-weight:600;letter-spacing:0.16em;color:rgba(140,178,214,0.5);}',
  '.nl-hub-tab.on .e{color:rgba(95,216,238,0.78);}',
  '.nl-hub-body{flex:1 1 auto;min-height:0;position:relative;overflow:hidden;}',
  '.nl-hub-body>*{width:100%;height:100%;}',
  '.nl-nav{height:100%;overflow:auto;padding:18px 20px 28px;}',
  '.nl-nav h4{margin:16px 0 8px;font-size:9px;font-weight:700;letter-spacing:0.22em;color:rgba(150,186,220,0.55);}',
  '.nl-nav h4:first-child{margin-top:0;}',
  '.nl-nav-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));}',
  '.nl-nav-tile{appearance:none;text-align:left;cursor:pointer;background:rgba(12,24,40,0.55);',
  '  border:1px solid rgba(120,168,214,0.16);border-radius:2px;padding:11px 12px;color:#dceaf8;',
  '  display:flex;flex-direction:column;gap:4px;transition:border-color .14s,background .14s,transform .14s;}',
  '.nl-nav-tile:hover{border-color:rgba(95,216,238,0.55);background:rgba(18,38,58,0.78);transform:translateY(-1px);}',
  '.nl-nav-tile .n{font-size:12.5px;font-weight:600;}',
  '.nl-nav-tile .k{font-size:8.2px;letter-spacing:0.14em;color:rgba(146,182,216,0.62);}',
  '.nl-nav-tile .id{font-size:7.6px;letter-spacing:0.06em;color:rgba(126,160,196,0.42);}',
  '.nl-nav-note{margin-top:16px;font-size:8.6px;line-height:1.75;color:rgba(146,182,216,0.5);}'
].join('');

// 导航：别的插件的面板不归我管，但可以替它们做一页入口。
// 点一下等于调用 layout.selectPanel('<key>')，和点侧边栏图标是同一个动作。
var HUB_LAYOUT = null;

var HUB_NAV = [
  { group: '常用', items: [
    { key: 'conversation', label: '会话', en: 'CONVERSATION' },
    { key: 'task-board', label: '任务看板', en: 'TASK BOARD' },
    { key: 'schedules', label: '自动化任务', en: 'SCHEDULES' }
  ] },
  { group: '知识与记忆', items: [
    { key: 'lingshu', label: '灵枢', en: 'COGNITION GRAPH' },
    { key: 'engram', label: '记忆宫殿', en: 'ENGRAM' },
    { key: 'dsh-context', label: '上下文洞察', en: 'CONTEXT' },
    { key: 'skill-explorer', label: '技能中心', en: 'SKILLS' }
  ] },
  { group: '扩展', items: [
    { key: 'plugins', label: '插件', en: 'PLUGINS' },
    { key: 'dsh-market', label: '插件市场', en: 'MARKET' }
  ] }
];

function hubGo(key) {
  try {
    if (HUB_LAYOUT && typeof HUB_LAYOUT.selectPanel === 'function') {
      HUB_LAYOUT.selectPanel(key);
      return true;
    }
  } catch (e) { /* 面板可能已卸载：不炸，交给调用方的提示 */ }
  return false;
}

function NavPanel() {
  var st = React.useState(null);
  var msg = st[0], setMsg = st[1];

  function tile(item) {
    return h('button', {
      key: item.key,
      type: 'button',
      className: 'nl-nav-tile',
      onClick: function () {
        if (!hubGo(item.key)) setMsg('这个面板现在打不开：' + item.label + '（' + item.key + '）');
      }
    },
      h('span', { className: 'n' }, item.label),
      h('span', { className: 'k' }, item.en),
      h('span', { className: 'id' }, item.key));
  }

  var sections = HUB_NAV.map(function (sec) {
    return h('div', { key: sec.group },
      h('h4', null, sec.group),
      h('div', { className: 'nl-nav-grid' }, sec.items.map(tile))
    );
  });

  return h('div', { className: 'nl-nav' },
    sections,
    msg ? h('div', { className: 'nl-nav-note' }, msg) : null,
    h('div', { className: 'nl-nav-note' },
      '这些面板属于别的插件，这里只是替它们做入口；想彻底少几个图标，去「插件」里关掉不用的。'));
}

function hubTabGet() {
  try {
    var v = window.localStorage.getItem(HUB_TAB_KEY);
    for (var i = 0; i < HUB_TABS.length; i++) if (HUB_TABS[i].id === v) return v;
  } catch (e) { /* 隐私模式或测试环境：回到默认 */ }
  return 'today';
}

function hubTabSet(id) {
  try { window.localStorage.setItem(HUB_TAB_KEY, id); } catch (e) { /* 同上 */ }
}

function HubPanel() {
  var st = React.useState(hubTabGet());
  var tab = st[0], setTab = st[1];
  var cur = HUB_TABS[0];
  for (var i = 0; i < HUB_TABS.length; i++) if (HUB_TABS[i].id === tab) cur = HUB_TABS[i];

  var tabs = HUB_TABS.map(function (t) {
    return h('button', {
      key: t.id,
      type: 'button',
      className: 'nl-hub-tab' + (t.id === tab ? ' on' : ''),
      onClick: function () { hubTabSet(t.id); setTab(t.id); },
      title: t.label
    }, h('span', { className: 't' }, t.label), h('span', { className: 'e' }, t.en));
  });

  return h('div', { className: 'nl-hub' },
    h('style', { key: 'hub-css' }, HUB_CSS),
    h('div', { className: 'nl-hub-tabs', role: 'tablist' }, tabs),
    h('div', { className: 'nl-hub-body', role: 'tabpanel' }, cur.make())
  );
}

function registerHub(ctx) {
  HUB_LAYOUT = ctx.layout || HUB_LAYOUT;
  ctx.slots.inject('sidebar.panellist', function () {
    return ctx.slots.register({
      name: 'sidebar.panellist',
      id: HUB_ID,
      order: 20,
      label: function () { return '认知终端'; }
    }, NeuroLoopIcon);
  });
  ctx.slots.inject('main', function () {
    return ctx.slots.register({ name: 'main', key: HUB_ID }, HubPanel);
  });
}
