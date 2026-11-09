/* 「今天」面板：把"今天该做什么、哪些到期、勾了没有"放在一屏里。
 *
 * 为什么需要它：星图回答的是"我脑子里是什么样"，回答不了"现在打开电脑该干嘛"。
 * 每日两页是纸上的形态，纸可以不带、打印机可以坏，但这一屏永远在。
 *
 * 数据全部来自宿主 `/neuroloop/today`（只读）与 `/neuroloop/state`（投影）；
 * 勾选写 `/neuroloop/event` kind=daily。面板本身不推断排程，避免和 plan/ 里的真源打架。
 */

var TODAY_ID = 'neuro-loop-today';

var TODAY_CSS = [
  '.nl-today{position:relative;width:100%;height:100%;overflow:auto;',
  '  background:radial-gradient(120% 90% at 18% 0%,#091220 0%,#050a12 60%,#03060b 100%);',
  '  color:#d7e6f6;font-family:Inter,"HarmonyOS Sans SC","Microsoft YaHei UI",system-ui,sans-serif}',
  '.nl-today *{box-sizing:border-box}',
  '.nl-today .hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;',
  '  padding:22px 30px 15px;border-bottom:1px solid rgba(120,160,210,0.14)}',
  '.nl-today .hd b{display:block;font-size:15px;letter-spacing:2.4px;font-weight:700;color:#e8f3ff}',
  '.nl-today .hd span{display:block;margin-top:5px;font-size:9px;letter-spacing:2px;',
  '  color:rgba(150,182,214,0.58);font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-today .hd i{font-style:normal;font-family:"JetBrains Mono",Consolas,monospace;',
  '  font-size:9.5px;letter-spacing:1.2px;color:rgba(150,186,222,0.6);text-align:right;line-height:1.9}',
  '.nl-today .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));',
  '  gap:16px;padding:20px 30px 34px;align-items:start}',
  '.nl-today .card{border:1px solid rgba(120,160,210,0.16);background:rgba(10,18,30,0.55);padding:14px 16px 16px}',
  '.nl-today .lbl{font-size:8.4px;letter-spacing:2.4px;color:rgba(140,174,208,0.56);',
  '  font-family:"JetBrains Mono",Consolas,monospace;margin-bottom:10px}',
  '.nl-today .big{font-size:15px;font-weight:600;color:#ecf7ff;letter-spacing:0.4px}',
  '.nl-today .sub{margin-top:5px;font-size:10.5px;line-height:1.7;color:rgba(160,192,220,0.66)}',
  '.nl-today .tag{display:inline-block;margin-left:8px;padding:1px 6px;font-size:8px;letter-spacing:1.4px;',
  '  border:1px solid rgba(111,210,255,0.35);color:#6fd2ff;font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-today .tag.warn{border-color:rgba(255,186,104,0.4);color:#ffba68}',
  '.nl-today .row{display:flex;align-items:center;gap:9px;padding:6px 0;',
  '  border-bottom:1px dashed rgba(120,160,210,0.1);font-size:11.5px}',
  '.nl-today .row:last-child{border-bottom:0}',
  '.nl-today .row u{text-decoration:none;flex:1;color:rgba(214,232,248,0.9)}',
  '.nl-today .row b{font-family:"JetBrains Mono",Consolas,monospace;font-size:9.5px;',
  '  color:rgba(150,186,222,0.66);font-weight:400}',
  '.nl-today button{cursor:pointer;background:transparent;border:1px solid rgba(120,160,210,0.24);',
  '  color:rgba(200,222,244,0.86);font-size:10px;padding:3px 8px;letter-spacing:1px;',
  '  font-family:"JetBrains Mono",Consolas,monospace;transition:all .16s}',
  '.nl-today button:hover{border-color:rgba(111,210,255,0.6);color:#a9e6ff}',
  '.nl-today button.on{border-color:rgba(111,210,255,0.75);color:#9fe4f2;background:rgba(111,210,255,0.1)}',
  '.nl-today .acts{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}',
  '.nl-today .note{margin-top:10px;font-size:10px;line-height:1.75;color:rgba(150,182,214,0.5)}'
].join('\n');

function todayPad(n) { return (n < 10 ? '0' : '') + n; }

function todayStamp() {
  var d = new Date();
  return d.getFullYear() + '-' + todayPad(d.getMonth() + 1) + '-' + todayPad(d.getDate());
}

function todayWeek(n) { return ['日', '一', '二', '三', '四', '五', '六'][n] || ''; }

function todayFetch(url, cb) {
  try {
    fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); })
      .then(cb).catch(function () { cb(null); });
  } catch (e) { cb(null); }
}

function todayPost(ev) {
  try {
    fetch('/neuroloop/event', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ev)
    }).catch(function () { /* 宿主没起也不该炸面板 */ });
  } catch (e) { /* noop */ }
}

function TodayPanel() {
  var s0 = React.useState(null); var data = s0[0]; var setData = s0[1];
  var s1 = React.useState({}); var marks = s1[0]; var setMarks = s1[1];
  var s2 = React.useState(''); var err = s2[0]; var setErr = s2[1];

  React.useEffect(function () {
    var date = todayStamp();
    todayFetch('/neuroloop/today?date=' + date, function (r) {
      if (!r || !r.ok) { setErr('宿主未响应 · 先确认插件已加载'); } else { setData(r.today); }
    });
  }, []);

  function mark(subject, status) {
    var next = Object.assign({}, marks);
    next[subject] = status;
    setMarks(next);
    todayPost({ kind: 'daily', date: data ? data.date : todayStamp(), subject: subject, minutes: 0, blocked: '' });
  }

  var head = h('div', { className: 'hd', key: 'hd' }, [
    h('div', { key: 'l' }, [
      h('b', { key: 'b' }, '今天 · TODAY'),
      h('span', { key: 's' }, 'NEURO-LOOP  ·  DAILY BOARD')
    ]),
    h('i', { key: 'r' }, [
      h('div', { key: 'a' }, data ? data.date + '  周' + todayWeek(data.weekday) : todayStamp()),
      h('div', { key: 'b' }, data ? '第 ' + data.dayNo + ' 天' : '—')
    ])
  ]);

  var cards = [];

  // 两张纸
  if (data) {
    function paperCard(key, title, line, paper) {
      var ok = paper && (paper.pdf || paper.docx);
      return h('div', { className: 'card', key: key }, [
        h('div', { className: 'lbl', key: 'l' }, title),
        h('div', { className: 'big', key: 'b' }, [line, h('span', {
          className: 'tag' + (ok ? '' : ' warn'), key: 't'
        }, ok ? '已生成' : '未生成')]),
        h('div', { className: 'sub', key: 's' }, ok
          ? 'PDF 在 daily/' + (key === 'pol' ? 'pol' : 'en') + '-' + data.date + '.pdf'
          : '这一份还没生成；打印不可用时不用等它，直接看上面的清单。')
      ]);
    }
    cards.push(h('div', { className: 'card', key: 'pl' }, [
      h('div', { className: 'lbl', key: 'l' }, '政治 / POLITICS'),
      data.politics
        ? h('div', { key: 'w' }, [
          h('div', { className: 'big', key: 'b' }, data.politics.unit),
          h('div', { className: 'sub', key: 's' }, data.politics.book + '  ' + data.politics.text + '  ·  ' + data.politics.pages + ' 页'),
          h('div', { className: 'sub', key: 's2' }, '第 ' + data.politics.day + ' / ' + data.total.politicsDays + ' 天')
        ])
        : h('div', { className: 'sub', key: 'e' }, '今天不在政治排程内')
    ]));
    cards.push(h('div', { className: 'card', key: 'en' }, [
      h('div', { className: 'lbl', key: 'l' }, '英语 / ENGLISH'),
      data.english
        ? h('div', { key: 'w' }, [
          h('div', { className: 'big', key: 'b' }, '词组 ' + data.english.from + '–' + data.english.to),
          h('div', { className: 'sub', key: 's' }, data.english.first + ' … ' + data.english.last + '  ·  ' + data.english.count + ' 条'),
          h('div', { className: 'sub', key: 's2' }, '第 ' + data.english.day + ' / ' + data.total.englishDays + ' 天')
        ])
        : h('div', { className: 'sub', key: 'e' }, '今天不在英语排程内')
    ]));
  }

  // 其他科目
  if (data && data.tasks.length) {
    cards.push(h('div', { className: 'card', key: 'tk' }, [
      h('div', { className: 'lbl', key: 'l' }, '其他科目 / OTHER SUBJECTS'),
      data.tasks.map(function (t, i) {
        return h('div', { className: 'row', key: 't' + i }, [
          h('u', { key: 'u' }, '□ ' + t.subject + '　' + t.text),
          h('b', { key: 'b' }, t.min + ' min')
        ]);
      }),
      h('div', { className: 'note', key: 'n' }, '这三科不出内容页，只在这里排队；完成后在下面勾。')
    ]));
  }

  // 到期
  if (data) {
    var p = data.progress;
    cards.push(h('div', { className: 'card', key: 'due' }, [
      h('div', { className: 'lbl', key: 'l' }, '到期复习 / DUE'),
      h('div', { className: 'big', key: 'b' }, [String(p.dueTotal) + ' 个考点', h('span', {
        className: 'tag' + (p.dueTotal ? ' warn' : ''), key: 't'
      }, p.dueTotal ? '待复习' : '已清空')]),
      p.due.slice(0, 5).map(function (d, i) {
        return h('div', { className: 'row', key: 'd' + i }, [
          h('u', { key: 'u' }, d.id),
          h('b', { key: 'b' }, String(d.dueAt || '').slice(0, 10))
        ]);
      }),
      h('div', { className: 'acts', key: 'a' }, [
        h('button', { key: 'go', onClick: function () { todayGo('neuro-loop'); } }, '去星图里复习 →')
      ])
    ]));
  }

  // 勾选
  if (data) {
    var subjects = ['politics', 'english', 'math', 'physics', 'chemistry'];
    var names = { politics: '政治', english: '英语', math: '数学', physics: '物理', chemistry: '化学' };
    cards.push(h('div', { className: 'card', key: 'mk' }, [
      h('div', { className: 'lbl', key: 'l' }, '今天做完了吗 / CHECK-IN'),
      subjects.map(function (s) {
        return h('div', { className: 'row', key: s }, [
          h('u', { key: 'u' }, names[s]),
          ['done', 'half', 'miss'].map(function (k) {
            var txt = k === 'done' ? '完' : k === 'half' ? '半' : '未';
            return h('button', {
              key: k, className: (marks[s] === k ? 'on' : ''),
              onClick: function () { mark(s, k); }
            }, txt);
          })
        ]);
      }),
      h('div', { className: 'note', key: 'n' },
        '点一下写一条事件；今天勾过的会出现在 daily 记录里，明天的心跳按它调整。')
    ]));
  }

  if (err) {
    cards.push(h('div', { className: 'card', key: 'err' }, [
      h('div', { className: 'lbl', key: 'l' }, '状态 / STATUS'),
      h('div', { className: 'big', key: 'b' }, err),
      h('div', { className: 'sub', key: 's' }, '刷新页面（F5）让客户端重新加载；若仍无响应，跑 python tools/activate.py 看插件挂载。')
    ]));
  }

  return h('div', { className: 'nl-today' }, [
    h('style', { key: 'css' }, TODAY_CSS),
    head,
    h('div', { className: 'grid', key: 'g' }, cards)
  ]);
}

function todayGo(panel) {
  try {
    if (TODAY_CTX && TODAY_CTX.layout && typeof TODAY_CTX.layout.selectPanel === 'function') {
      TODAY_CTX.layout.selectPanel(panel);
    }
  } catch (e) { /* noop */ }
}

var TODAY_CTX = null;

function TodayIcon(props) {
  var s = (props && props.size) || 18;
  return h('svg', {
    width: s, height: s, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round'
  },
    h('circle', { cx: 12, cy: 12, r: 4 }),
    h('path', { d: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4' }));
}

function registerToday(ctx) {
  TODAY_CTX = ctx;
  ctx.slots.inject('sidebar.panellist', function () {
    return ctx.slots.register({
      name: 'sidebar.panellist', id: TODAY_ID, order: 22,
      label: function () { return '今天'; }
    }, TodayIcon);
  });
  ctx.slots.inject('main', function () {
    return ctx.slots.register({ name: 'main', key: TODAY_ID }, TodayPanel);
  });
}
