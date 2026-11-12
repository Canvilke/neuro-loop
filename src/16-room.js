// 会议室：夜间协作的对话页签。
// 为什么放在 hub 里而不是另开侧栏图标：侧栏是全局资源，我们已经收敛到 1 个入口。
// 交互只两件事：说话（say）、请人拍板（ask）；拍板由 lead 用 decide 回答（面板里也能回）。
// 不用 setInterval：无头测试里定时器会把进程挂住（015/team 都踩过）。

var ROOM_ID = 'neuro-loop-room'

var ROOM_CSS = [
  '.nl-room{display:flex;flex-direction:column;height:100%;min-height:520px;background:#04060d;color:#dbe8f6;',
  '  font-family:' + TY.sans + ';}',
  '.nl-room-head{flex:0 0 auto;display:flex;align-items:baseline;gap:12px;padding:14px 18px 10px;',
  '  border-bottom:1px solid rgba(126,168,214,0.14);}',
  '.nl-room-title{font-size:13px;font-weight:700;letter-spacing:0.26em;}',
  '.nl-room-sub{font-size:8.2px;font-weight:600;letter-spacing:0.18em;color:rgba(150,186,220,0.55);}',
  '.nl-room-spacer{flex:1 1 auto;}',
  '.nl-room-btn{appearance:none;cursor:pointer;background:rgba(14,28,46,0.7);color:#cfe6fb;',
  '  border:1px solid rgba(120,168,214,0.28);border-radius:2px;padding:5px 10px;font-size:11px;}',
  '.nl-room-btn:hover{border-color:rgba(95,216,238,0.7);color:#eaf8ff;}',
  '.nl-room-btn[disabled]{opacity:0.45;cursor:default;}',
  '.nl-room-asks{flex:0 0 auto;padding:10px 18px;border-bottom:1px solid rgba(126,168,214,0.12);',
  '  background:rgba(38,26,12,0.35);}',
  '.nl-room-asks .t{font-size:9px;font-weight:700;letter-spacing:0.2em;color:rgba(255,190,110,0.85);}',
  '.nl-room-ask{display:flex;gap:10px;align-items:baseline;padding:4px 0;font-size:11.5px;color:#f0dcbe;}',
  '.nl-room-ask .id{font-family:' + TY.mono + ';font-size:10px;color:rgba(255,190,110,0.75);}',
  '.nl-room-list{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 18px 16px;}',
  '.nl-room-row{display:grid;grid-template-columns:64px 132px 1fr;gap:10px;padding:6px 0;',
  '  border-bottom:1px dashed rgba(126,168,214,0.09);font-size:11.8px;line-height:1.55;}',
  '.nl-room-row .tm{font-family:' + TY.mono + ';font-size:10px;color:rgba(140,178,214,0.55);padding-top:2px;}',
  '.nl-room-row .who{font-size:10.5px;color:rgba(170,206,240,0.8);}',
  '.nl-room-row .who b{font-weight:600;color:#e6f4ff;}',
  '.nl-room-row .tx{color:rgba(226,240,255,0.94);white-space:pre-wrap;}',
  '.nl-room-row.ask .tx{color:#ffd9a3;}',
  '.nl-room-row.decision .tx{color:#9fe6c8;}',
  '.nl-room-tag{display:inline-block;margin-left:6px;padding:0 4px;border:1px solid rgba(255,190,110,0.5);',
  '  border-radius:2px;font-size:8.5px;letter-spacing:0.1em;color:rgba(255,190,110,0.9);}',
  '.nl-room-empty{padding:28px 4px;font-size:11.5px;color:rgba(150,186,220,0.5);}',
  '.nl-room-compose{flex:0 0 auto;display:flex;gap:8px;padding:10px 18px 14px;',
  '  border-top:1px solid rgba(126,168,214,0.14);background:rgba(8,16,28,0.7);}',
  '.nl-room-input{flex:1 1 auto;min-width:0;background:rgba(4,10,20,0.9);color:#e6f4ff;',
  '  border:1px solid rgba(120,168,214,0.26);border-radius:2px;padding:7px 10px;font-size:11.8px;',
  '  font-family:' + TY.sans + ';outline:none;}',
  '.nl-room-input:focus{border-color:rgba(95,216,238,0.62);}',
  '.nl-room-foot{flex:0 0 auto;padding:0 18px 9px;font-size:9px;color:rgba(140,178,214,0.5);}',
  '.nl-room-err{color:#ff8f9f;}'
].join('')

function roomFetch(path, init) {
  return fetch(path, Object.assign({ credentials: 'same-origin' }, init || {}))
}

function roomTime(iso) {
  var s = String(iso || '');
  return s.length >= 19 ? s.slice(11, 19) : s;
}

function RoomPanel() {
  var sMsgs = React.useState([]);
  var msgs = sMsgs[0], setMsgs = sMsgs[1];
  var sOpen = React.useState([]);
  var open = sOpen[0], setOpen = sOpen[1];
  var sErr = React.useState('');
  var err = sErr[0], setErr = sErr[1];
  var sText = React.useState('');
  var text = sText[0], setText = sText[1];
  var sBusy = React.useState(false);
  var busy = sBusy[0], setBusy = sBusy[1];

  function apply(data) {
    setMsgs(Array.isArray(data && data.msgs) ? data.msgs : []);
    setOpen(Array.isArray(data && data.open) ? data.open : []);
  }

  function load() {
    return roomFetch('/neuroloop/room?limit=120').then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.ok === false) throw new Error((j && j.error) || 'load-failed');
        apply(j.data || j);
        setErr('');
      })
      .catch(function (e) { setErr('读不到会议室：' + String(e.message || e)); });
  }

  function post(kind, body, ref) {
    setBusy(true);
    return roomFetch('/neuroloop/room', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'lead', role: 'architect', kind: kind, text: body, ref: ref })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.ok === false) throw new Error((j && j.error) || 'post-failed');
        setText('');
        setErr('');
        return load();
      })
      .catch(function (e) { setErr('发不出去：' + String(e.message || e)); })
      .then(function () { setBusy(false); });
  }

  React.useEffect(function () { load(); }, []);

  var askRows = open.map(function (a) {
    return h('div', { key: 'a-' + a.id, className: 'nl-room-ask' },
      h('span', { className: 'id' }, a.id),
      h('span', null, (a.role ? a.from + '/' + a.role : a.from) + '：' + a.text),
      h('button', {
        className: 'nl-room-btn',
        type: 'button',
        onClick: function () {
          var v = window.prompt('决定（写清结论，会挂在 ' + a.id + ' 下）：', '');
          if (v === null) return;
          var t = String(v).trim();
          if (!t) return;
          post('decision', t, a.id);
        }
      }, '拍板'));
  });

  var rows = msgs.map(function (m) {
    return h('div', { key: m.id, className: 'nl-room-row ' + m.kind },
      h('span', { className: 'tm' }, roomTime(m.at)),
      h('span', { className: 'who' }, h('b', null, m.from), m.role ? ' / ' + m.role : '',
        m.kind === 'ask' ? h('span', { className: 'nl-room-tag' }, '待拍板') : null),
      h('span', { className: 'tx' }, m.text, m.ref ? '  (' + m.ref + ')' : null));
  });

  function send(kind) {
    var t = String(text).trim();
    if (!t || busy) return;
    post(kind, t);
  }

  return h('div', { className: 'nl-room' },
    h('style', { key: 'room-css' }, ROOM_CSS),
    h('div', { className: 'nl-room-head' },
      h('span', { className: 'nl-room-title' }, '会议室'),
      h('span', { className: 'nl-room-sub' }, 'WAR ROOM · 夜间协作'),
      h('span', { className: 'nl-room-spacer' }),
      h('span', { className: 'nl-room-sub' }, '待拍板 ' + open.length),
      h('button', { className: 'nl-room-btn', type: 'button', onClick: load, disabled: busy }, '刷新')),
    open.length ? h('div', { className: 'nl-room-asks' },
      h('div', { className: 't' }, '需要你决定的'),
      askRows) : null,
    h('div', { className: 'nl-room-list' },
      rows.length ? rows : h('div', { className: 'nl-room-empty' }, '会议室还没有人说话。')),
    h('div', { className: 'nl-room-compose' },
      h('input', {
        className: 'nl-room-input',
        value: text,
        placeholder: '说点什么…（回车发言，Shift+回车换行）',
        onChange: function (e) { setText(e.target.value); },
        onKeyDown: function (e) {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send('say'); }
        }
      }),
      h('button', { className: 'nl-room-btn', type: 'button', onClick: function () { send('say'); }, disabled: busy }, '发言'),
      h('button', { className: 'nl-room-btn', type: 'button', onClick: function () { send('ask'); }, disabled: busy }, '请拍板')),
    h('div', { className: 'nl-room-foot' + (err ? ' nl-room-err' : '') },
      err || '会议记录只追加：没人能改历史；需要我停手时在这里说一句。'));
}
