/* 「控制台」面板：让维护结构看得见（ADR-0002）。
 *
 * 为什么需要它：票单在磁盘上、角色在 roles.json 里，但如果只有文件，
 * 人（和下一个我）就得记得去翻。这一屏把"谁负责哪块、哪些票能领、哪些卡住"摊开。
 *
 * 读 /neuroloop/team（GET）；每张票右侧可以领取（CLAIM）或完成（DONE），
 * 写走 POST 同一路由。by 固定 'console'——这是人在面板上点的，不是某个子代理。
 * 动作失败只把宿主返回的 error 码显示在底栏，不弹 alert。
 */

var TEAM_ID = 'neuro-loop-team';

var TEAM_CSS = [
  '.nl-team{position:relative;width:100%;height:100%;overflow:auto;',
  '  background:radial-gradient(120% 90% at 82% 0%,#0a1522 0%,#050a12 58%,#03060b 100%);',
  '  color:#d7e6f6;font-family:Inter,"HarmonyOS Sans SC","Microsoft YaHei UI",system-ui,sans-serif}',
  '.nl-team *{box-sizing:border-box}',
  '.nl-team .hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;',
  '  padding:22px 30px 15px;border-bottom:1px solid rgba(120,160,210,0.14)}',
  '.nl-team .hd b{display:block;font-size:15px;letter-spacing:2.4px;font-weight:700;color:#e8f3ff}',
  '.nl-team .hd span{display:block;margin-top:5px;font-size:9px;letter-spacing:2px;',
  '  color:rgba(150,182,214,0.58);font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-team .nums{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:rgba(120,160,210,0.12)}',
  '.nl-team .num{background:#060c14;padding:12px 16px 13px}',
  '.nl-team .num u{text-decoration:none;display:block;font-size:8.2px;letter-spacing:2.2px;',
  '  color:rgba(140,174,208,0.55);font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-team .num b{display:block;margin-top:7px;font-size:19px;font-weight:600;color:#ecf7ff;',
  '  font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-team .num.warn b{color:#ffba68}',
  '.nl-team .body{display:grid;grid-template-columns:minmax(240px,300px) 1fr;gap:22px;padding:20px 30px 36px}',
  '.nl-team h4{margin:0 0 10px;font-size:8.4px;letter-spacing:2.4px;font-weight:600;',
  '  color:rgba(140,174,208,0.56);font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-team .role{padding:8px 10px;margin-bottom:6px;border:1px solid rgba(120,160,210,0.14);',
  '  background:rgba(10,18,30,0.5)}',
  '.nl-team .role b{display:block;font-size:11px;color:#dceafa;font-weight:600;letter-spacing:0.6px}',
  '.nl-team .role span{display:block;margin-top:4px;font-size:9px;line-height:1.6;',
  '  color:rgba(150,182,214,0.52);font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-team .ticket{display:grid;grid-template-columns:58px 1fr 84px 64px 118px;align-items:center;gap:10px;',
  '  padding:8px 0;border-bottom:1px dashed rgba(120,160,210,0.12);font-size:11.5px}',
  '.nl-team .ticket:last-child{border-bottom:0}',
  '.nl-team .ticket i{font-style:normal;font-family:"JetBrains Mono",Consolas,monospace;',
  '  font-size:9.5px;color:rgba(150,186,222,0.6)}',
  '.nl-team .ticket u{text-decoration:none;color:rgba(216,234,250,0.92)}',
  '.nl-team .ticket em{font-style:normal;font-size:9px;letter-spacing:1.2px;',
  '  font-family:"JetBrains Mono",Consolas,monospace;color:rgba(150,186,222,0.66)}',
  '.nl-team .st{font-family:"JetBrains Mono",Consolas,monospace;font-size:8.4px;letter-spacing:1.2px;',
  '  padding:2px 5px;border:1px solid rgba(120,160,210,0.24);color:rgba(170,200,228,0.8);text-align:center}',
  '.nl-team .st.ready{border-color:rgba(111,210,255,0.45);color:#7fd8ff}',
  '.nl-team .st.claimed{border-color:rgba(255,186,104,0.45);color:#ffc57e}',
  '.nl-team .st.done{border-color:rgba(120,220,170,0.4);color:#8fe0b6}',
  '.nl-team .st.blocked{border-color:rgba(255,120,120,0.45);color:#ff9a9a}',
  '.nl-team .acts{display:flex;gap:6px;justify-content:flex-end}',
  '.nl-team .acts button{padding:2px 7px;font-size:9px}',
  '.nl-team .acts button:disabled{opacity:.38;cursor:default;border-color:rgba(120,160,210,0.24);',
  '  color:rgba(200,222,244,0.6)}',
  '.nl-team .err{margin:0 30px 22px;padding:7px 12px;border:1px solid rgba(255,120,120,0.4);',
  '  background:rgba(60,16,16,0.35);color:#ff9a9a;font-size:10px;letter-spacing:1.2px;',
  '  font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-team .empty{padding:14px 0;font-size:10.5px;color:rgba(150,182,214,0.5);line-height:1.8}',
  '.nl-team button{cursor:pointer;background:transparent;border:1px solid rgba(120,160,210,0.24);',
  '  color:rgba(200,222,244,0.86);font-size:9.5px;padding:3px 9px;letter-spacing:1.4px;',
  '  font-family:"JetBrains Mono",Consolas,monospace;transition:all .16s}',
  '.nl-team button:hover{border-color:rgba(111,210,255,0.6);color:#a9e6ff}',
  '.nl-team .hint{margin-top:12px;font-size:9.6px;line-height:1.8;color:rgba(150,182,214,0.46)}'
].join('\n');

function teamFetch(cb) {
  try {
    fetch('/neuroloop/team', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) { cb(j && j.ok ? j : null); })
      .catch(function () { cb(null); });
  } catch (e) {
    cb(null);
  }
}

/* 写一条台账动作。cb 收到 null 表示成功，否则是宿主返回的 error 码。
 * 面板上点出来的动作，by 一律是 'console'。 */
function teamPost(id, action, note, cb) {
  var body = JSON.stringify({ id: id, action: action, by: 'console', note: note });
  try {
    fetch('/neuroloop/team', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: body
    }).then(function (r) { return r.json(); })
      .then(function (j) { cb(j && j.ok ? null : ((j && j.error) || 'request-failed')); })
      .catch(function () { cb('network'); });
  } catch (e) {
    cb('network');
  }
}

function TeamPanel() {
  var st = React.useState({ data: null, err: false, actionErr: null, busy: null });
  var s = st[0];
  var set = st[1];

  function load() {
    teamFetch(function (j) { set({ data: j, err: !j, actionErr: null, busy: null }); });
  }

  // 面板上的动作。note 用 prompt 取：取消就中止；complete 不接受空 note。
  function act(t, action) {
    var note;
    try {
      note = window.prompt(
        action === 'claim'
          ? '领取 ' + t.id + '：写一句说明（可留空）'
          : '完成 ' + t.id + '：写一句结论（必填）',
        '');
    } catch (e) {
      note = null;
    }
    if (note === null || note === undefined) return;
    if (action === 'complete' && !String(note).trim()) return;

    set({ data: s.data, err: s.err, actionErr: null, busy: t.id });
    teamPost(t.id, action, String(note), function (code) {
      if (!code) { load(); return; }
      set({ data: s.data, err: s.err, actionErr: code, busy: null });
    });
  }

  // 不用 setInterval：无头测试里定时器会把进程挂住（之前信件轮询踩过同一次）。
  // 需要更新时点 REFRESH；面板切走再回来会重新挂载，也会重新拉一次。
  React.useEffect(function () {
    load();
  }, []);

  var d = s.data || {};
  var counts = d.counts || { total: 0, ready: 0, claimed: 0, blocked: 0, done: 0 };
  var tickets = d.tickets || [];
  var roles = d.roles || [];

  var nums = [
    ['READY', counts.ready, false],
    ['CLAIMED', counts.claimed, false],
    ['BLOCKED', counts.blocked, counts.blocked > 0],
    ['DONE', counts.done, false],
    ['STALE', (d.stale || []).length, (d.stale || []).length > 0]
  ].map(function (it) {
    return h('div', { className: 'num' + (it[2] ? ' warn' : ''), key: it[0] },
      h('u', null, it[0]), h('b', null, String(it[1])));
  });

  var roleNodes = roles.map(function (r) {
    return h('div', { className: 'role', key: r.id },
      h('b', null, r.name + ' · ' + r.id),
      h('span', null, (r.owns || []).join('  ')));
  });

  var ticketNodes = tickets.length
    ? tickets.map(function (t) {
      var acts = [];
      if (t.status === 'ready' && t.claimable) {
        acts.push(h('button', {
          key: 'claim',
          disabled: s.busy === t.id,
          onClick: function () { act(t, 'claim'); }
        }, 'CLAIM'));
      }
      if (t.status === 'claimed') {
        acts.push(h('button', {
          key: 'done',
          disabled: s.busy === t.id,
          onClick: function () { act(t, 'complete'); }
        }, 'DONE'));
      }
      return h('div', { className: 'ticket', key: t.id },
        h('i', null, t.id),
        h('u', null, t.title + (t.depsOpen && t.depsOpen.length ? '（等 ' + t.depsOpen.join(',') + '）' : '')),
        h('em', null, t.role + ' · ' + t.ageH + 'h'),
        h('span', { className: 'st ' + t.status }, t.status.toUpperCase()),
        h('div', { className: 'acts' }, acts));
    })
    : [h('div', { className: 'empty', key: 'e' }, '台账为空。开工前先开票：POST /neuroloop/team {title, role}。')];

  return h('div', { className: 'nl-team' },
    h('style', null, TEAM_CSS),
    h('div', { className: 'hd' },
      h('div', null,
        h('b', null, '控制台 · 维护台账'),
        h('span', null, 'TEAM LEDGER · APPEND-ONLY')),
      h('div', null,
        h('button', { onClick: load }, 'REFRESH'))),
    h('div', { className: 'nums' }, nums),
    h('div', { className: 'body' },
      h('div', null,
        h('h4', null, 'ROLES / 角色契约'),
        roleNodes,
        h('div', { className: 'hint' },
          s.err
            ? '台账读不到：宿主路由未加载或页面未刷新。'
            : '票单只追加，不改写；状态由重放得出。CLAIM / DONE 以 console 身份写入台账。')),
      h('div', null,
        h('h4', null, 'TICKETS / 票单'),
        ticketNodes)),
    s.actionErr ? h('div', { className: 'err' }, '操作失败 · ' + s.actionErr) : null);
}

function TeamIcon(props) {
  var size = (props && props.size) || 18;
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' },
    h('rect', { x: 3.5, y: 4.5, width: 17, height: 15, stroke: 'currentColor', strokeWidth: 1.3 }),
    h('path', { d: 'M3.5 9.5h17M9 9.5v10', stroke: 'currentColor', strokeWidth: 1.3 }),
    h('path', { d: 'M11.5 13h6M11.5 16h4', stroke: 'currentColor', strokeWidth: 1.1 }));
}

function registerTeam(ctx) {
  ctx.slots.inject('sidebar.panellist', function () {
    return ctx.slots.register(
      { name: 'sidebar.panellist', id: TEAM_ID, order: 23, label: function () { return '控制台'; } },
      TeamIcon);
  });
  ctx.slots.inject('main', function () {
    return ctx.slots.register({ name: 'main', key: TEAM_ID }, TeamPanel);
  });
}
