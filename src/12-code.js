/* 编程通道（code mode）的最小落地：一块 DOM 面板，不画 canvas。
 *
 * 为什么不做成星图第二套：编程模式的价值是"把人送回会话/工具"，
 * 不是再造一个可视化。所以这里只有三件事——
 *   1) 一眼看见自己在哪个通道、用的是哪个 GitHub 身份；
 *   2) 一键回到原生会话（工具、终端、仓库都在那儿）；
 *   3) 一键切回学习模式或重播启动序列。
 * 全部 DOM + 内联样式：不占 canvas、不和主画布抢帧、崩了也只白掉这一块。
 */

var CODE_ID = 'neuro-loop-code';
var CODE_CTX = null;

var CODE_CSS = [
  '.nl-code{position:relative;width:100%;height:100%;min-height:420px;overflow:auto;',
  '  background:radial-gradient(120% 90% at 20% 0%,#0a1220 0%,#050a12 58%,#03060b 100%);',
  '  color:#d7e6f6;font-family:Inter,"HarmonyOS Sans SC","Microsoft YaHei UI",system-ui,sans-serif;',
  '  -webkit-font-smoothing:antialiased}',
  '.nl-code *{box-sizing:border-box}',
  '.nl-code .hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;',
  '  padding:22px 30px 16px;border-bottom:1px solid rgba(120,160,210,0.14)}',
  '.nl-code .hd b{display:block;font-size:15px;letter-spacing:2.6px;font-weight:700;color:#e8f3ff}',
  '.nl-code .hd span{display:block;margin-top:5px;font-size:9px;letter-spacing:2.2px;',
  '  color:rgba(150,182,214,0.6);font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-code .id{text-align:right;font-family:"JetBrains Mono",Consolas,monospace;font-size:9.5px;',
  '  line-height:1.9;letter-spacing:1.2px;color:rgba(150,186,222,0.62)}',
  '.nl-code .id em{color:#6fd2ff;font-style:normal}',
  '.nl-code .body{display:grid;grid-template-columns:minmax(280px,1fr) minmax(240px,0.85fr);',
  '  gap:22px;padding:24px 30px 30px}',
  '@media (max-width:820px){.nl-code .body{grid-template-columns:1fr}}',
  '.nl-code .col{display:flex;flex-direction:column;gap:12px}',
  '.nl-code .lbl{font-size:8.4px;letter-spacing:2.6px;color:rgba(140,174,208,0.56);',
  '  font-family:"JetBrains Mono",Consolas,monospace;margin-bottom:2px}',
  '.nl-code button{display:flex;align-items:center;justify-content:space-between;gap:14px;',
  '  width:100%;padding:14px 16px;background:rgba(12,22,36,0.72);cursor:pointer;',
  '  border:1px solid rgba(120,160,210,0.2);color:#dceaf8;text-align:left;',
  '  font-size:12.5px;letter-spacing:0.6px;transition:border-color .18s,background .18s,transform .18s}',
  '.nl-code button:hover{border-color:rgba(111,210,255,0.55);background:rgba(16,30,48,0.9);',
  '  transform:translateY(-1px)}',
  '.nl-code button span{font-size:9px;letter-spacing:1.8px;color:rgba(140,176,212,0.7);',
  '  font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-code .num{display:flex;justify-content:space-between;align-items:baseline;',
  '  padding:9px 2px;border-bottom:1px solid rgba(120,160,210,0.1)}',
  '.nl-code .num u{text-decoration:none;font-size:8.6px;letter-spacing:2px;',
  '  color:rgba(140,174,208,0.6);font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-code .num b{font-size:19px;font-weight:600;color:#eaf6ff;',
  '  font-family:"JetBrains Mono",Consolas,monospace}',
  '.nl-code .note{margin-top:6px;font-size:11px;line-height:1.85;color:rgba(160,190,218,0.62)}'
].join('\n');

function codeGh() {
  try { return localStorage.getItem('neuroloop.gh') || 'Canvilke'; } catch (e) { return 'Canvilke'; }
}

function codeGo(panel) {
  try {
    if (CODE_CTX && CODE_CTX.layout && typeof CODE_CTX.layout.selectPanel === 'function') {
      CODE_CTX.layout.selectPanel(panel);
    }
  } catch (e) { /* 面板切换失败不该影响渲染 */ }
}

function CodePanel() {
  var gh = codeGh();
  var actions = h('div', { className: 'col' }, [
    h('div', { className: 'lbl', key: 'l' }, '动作 / ACTIONS'),
    h('button', { key: 'a1', onClick: function () { codeGo('conversation'); } }, [
      h('div', { key: 't' }, '回到会话'), h('span', { key: 's' }, 'CONVERSATION →')
    ]),
    h('button', { key: 'a2', onClick: function () { codeGo('neuro-loop'); } }, [
      h('div', { key: 't' }, '切到学习模式'), h('span', { key: 's' }, 'COGNITION →')
    ]),
    h('button', { key: 'a3', onClick: function () { if (typeof bootOpen === 'function') bootOpen(); } }, [
      h('div', { key: 't' }, '重播启动序列'), h('span', { key: 's' }, 'M')
    ]),
    h('div', { className: 'note', key: 'n' },
      '工具、终端、仓库都在原生会话里——这个通道只负责把你送过去，不再造第二套界面。')
  ]);

  function row(k, u, v) {
    return h('div', { className: 'num', key: k }, [h('u', { key: 'u' }, u), h('b', { key: 'b' }, v)]);
  }

  var readout = h('div', { className: 'col' }, [
    h('div', { className: 'lbl', key: 'l' }, '读数 / READOUT'),
    row('r1', 'TOOLS', '18'),
    row('r2', 'REPO', '1'),
    row('r3', 'SESSION', '—'),
    row('r4', 'TASK', '0'),
    h('div', { className: 'note', key: 'n' }, '读数是静态占位：真实数字要等宿主侧提供会话/仓库统计后再接。')
  ]);

  var head = h('div', { className: 'hd', key: 'hd' }, [
    h('div', { key: 'l' }, [
      h('b', { key: 'b' }, '编程台 · ENGINEERING CONSOLE'),
      h('span', { key: 's' }, 'UEG//NL-550W  ·  CHANNEL 01  ·  TOOLCHAIN OFFLINE-FIRST')
    ]),
    h('div', { className: 'id', key: 'r' }, [
      h('div', { key: 'a' }, 'OPERATOR ', h('em', { key: 'e' }, '@' + gh)),
      h('div', { key: 'b' }, 'LINK 0.7M  ·  SYS 550W')
    ])
  ]);

  return h('div', { className: 'nl-code' }, [
    h('style', { key: 'css' }, CODE_CSS),
    head,
    h('div', { className: 'body', key: 'body' }, [actions, readout])
  ]);
}

function CodeIcon(props) {
  var s = (props && props.size) || 18;
  return h('svg', {
    width: s, height: s, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round'
  },
    h('path', { d: 'M8 7 4.5 12 8 17' }),
    h('path', { d: 'M16 7l3.5 5-3.5 5' }),
    h('path', { d: 'M13.2 5.5 10.8 18.5' }));
}

function registerCode(ctx) {
  CODE_CTX = ctx;
  ctx.slots.inject('sidebar.panellist', function () {
    return ctx.slots.register({
      name: 'sidebar.panellist', id: CODE_ID, order: 21,
      label: function () { return '编程台'; }
    }, CodeIcon);
  });
  ctx.slots.inject('main', function () {
    return ctx.slots.register({ name: 'main', key: CODE_ID }, CodePanel);
  });
}
