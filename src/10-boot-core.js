/* ────────────────────────────────────────────────────────────────────────────
 * 10 · boot — UEG 风格启动序列 + 模式通道选择
 *   启动动画（自检 / 地球线框 / 发动机光柱）→ 两条通道（编程 / 学习）→ 接入
 *   纯 Canvas 2D；注册在 shell.overlay（整帧浮层）；ES5 / var；
 *   对外：bootOpen()（重新拉起）、registerBoot(ctx)
 * ──────────────────────────────────────────────────────────────────────────── */

var UEG = {
  ink: '#04070c',
  steel: '#7f98b4',
  ice: '#d3e8ff',
  amber: '#ffb552',
  cyan: '#5fd8ee',
  code: '#6fd2ff',
  study: '#8fa8ff'
};

var BOOT = {
  open: false,
  phase: 'boot',   /* boot | sync | auth | brief | choose | enter | dive */
  t: 0,
  sel: 1,
  mode: 'study',
  rects: [],
  hot: -1,
  cmd: '',
  promptHot: false,
  promptRect: null,
  auth: 0,          /* 0 待输账号 · 1 校验中 · 2 已通过 */
  authAt: 0,
  authHint: -1,
  authMsg: '',
  gh: '',
  avatar: '',
  avatarRect: null,
  grantAt: 0,
  switchAt: 0,
  lastPhase: 'boot',
  lastInput: 0,
  auto: null,
  autoDoneAt: 0,
  done: false,
  setOpen: null,
  layout: null
};

function bootModeGet() {
  try {
    return localStorage.getItem('neuroloop.mode') === 'code' ? 'code' : 'study';
  } catch (e) { return 'study'; }
}
function bootModeSet(m) {
  try { localStorage.setItem('neuroloop.mode', m); } catch (e) { /* noop */ }
}

function bootGhGet() {
  try { return localStorage.getItem('neuroloop.gh') || ''; } catch (e) { return ''; }
}
function bootGhSet(v) {
  try { localStorage.setItem('neuroloop.gh', v); } catch (e) { /* noop */ }
}

function bootAvatarGet() {
  try { return localStorage.getItem('neuroloop.avatar') || ''; } catch (e) { return ''; }
}
function bootAvatarSet(v) {
  try {
    if (v) localStorage.setItem('neuroloop.avatar', v);
    else localStorage.removeItem('neuroloop.avatar');
  } catch (e) { /* 配额满了就只留当前会话 */ }
}

/* 头像图片是异步解码的；没装好就退回按账号生成的方块头像 */
var BOOT_AVATAR = { img: null, src: '', ready: false };
function bootAvatarLoad(v) {
  BOOT_AVATAR.src = v || '';
  BOOT_AVATAR.img = null;
  BOOT_AVATAR.ready = false;
  if (!v || typeof Image === 'undefined') return;
  try {
    var im = new Image();
    im.onload = function () { BOOT_AVATAR.ready = true; };
    im.onerror = function () { BOOT_AVATAR.ready = false; };
    im.src = v;
    BOOT_AVATAR.img = im;
  } catch (e) { /* noop */ }
}

function bootOpen() {
  if (!BOOT.setOpen) return;
  BOOT.phase = 'boot';
  BOOT.t = 0;
  BOOT.cmd = '';
  BOOT.promptHot = false;
  BOOT.auth = 0;
  BOOT.authHint = -1;
  BOOT.authMsg = '';
  BOOT.gh = bootGhGet();
  BOOT.avatar = bootAvatarGet();
  bootAvatarLoad(BOOT.avatar);
  BOOT.switchAt = 0;
  BOOT.lastPhase = 'boot';
  BOOT.lastInput = 0;
  BOOT.auto = null;
  BOOT.autoDoneAt = 0;
  BOOT.done = false;
  BOOT.committed = false;
  BOOT.sel = bootModeGet() === 'study' ? 1 : 0;
  BOOT.setOpen(true);
}

var BOOT_LOG = [
  ['00:00.2', 'UEG//NL-550W 认知终端 上电', 'CORE ONLINE'],
  ['00:00.6', '内存阵列 自检', 'MEM .... OK'],
  ['00:01.0', '认知星图 载入', 'GRAPH ... OK'],
  ['00:01.4', '六科轨道 校准', 'ORBIT ... OK'],
  ['00:01.8', '偏差探针 上线', 'KV-PROBE ... OK'],
  ['00:02.2', '接入通道 枚举', 'CHANNEL ... 2'],
  ['00:02.6', '记忆缓存 索引', 'KV-CACHE ... OK'],
  ['00:03.1', '偏差阈值 收敛', 'THRESHOLD ... 0.50'],
  ['00:03.6', '通道密钥 绑定', 'KEYBIND ... OK'],
  ['00:04.1', '等待操作员确认', 'AWAITING OPERATOR']
];

var BOOT_MODES = [
  { id: 'code', idx: '01', glyph: '</>', name: '编程模式', en: 'ENGINEERING',
    sub: '代码 · 工具 · 会话', accent: UEG.code, handle: '星海漫游',
    stats: [['TOOLS', '18'], ['SESSION', 'ON DEMAND']],
    note: '工具链 / 会话 / 仓库' },
  { id: 'study', idx: '02', glyph: 'Σ', name: '学习模式', en: 'COGNITION',
    sub: '六科 · 偏差 · 复习', accent: UEG.study, handle: '残梦潇伤',
    stats: [['POINTS', '42'], ['FALSE+', '3']],
    note: '认知星图 / 六科轨道 / 偏差带' }
];

function BootLayer(props) {
  /* the overlay is the terminal's power-on sequence: it owns the first frame
   * of every page load, not only the first time the panel is opened */
  var st = React.useState(true);
  var open = st[0], setOpen = st[1];
  var wrapRef = React.useRef(null);
  var cvRef = React.useRef(null);
  var bgRef = React.useRef(null);
  var fileRef = React.useRef(null);
  var pickRef = React.useRef(null);   /* onPick 定义在 effect 里，渲染期只能通过它拿 */

  React.useEffect(function () {
    BOOT.setOpen = setOpen;
    BOOT.layout = props.layout || null;
    BOOT.sel = bootModeGet() === 'study' ? 1 : 0;
    if (!open) {
      BOOT.open = false;
      return undefined;
    }
    BOOT.open = true;

    var wrap = wrapRef.current, cv = cvRef.current, bg = bgRef.current;
    if (!wrap || !cv) return undefined;

    var c = cv.getContext('2d');
    var W = 0, H = 0, DPR = 1;
    var raf = 0, last = 0, t = 0;

    function resize() {
      var r = wrap.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(240, Math.round(r.height));
      DPR = clamp(window.devicePixelRatio || 1, 1, 2);
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function commit(mode) {
      try {
        if (BOOT.layout && typeof BOOT.layout.selectPanel === 'function') {
          BOOT.layout.selectPanel(mode === 'study' ? 'neuro-loop' : 'neuro-loop-code');
        }
      } catch (e) { /* noop */ }
      /* 如果学习面板已经挂在那儿，让它重播一次入场（环重新组装） */
      if (mode === 'study' && typeof NL_ReplayBoot === 'function') {
        try { NL_ReplayBoot(); } catch (e) { /* noop */ }
      }
    }

    function bootCommit() {
      if (BOOT.committed) return;
      BOOT.committed = true;
      commit(BOOT_MODES[BOOT.sel].id);
    }

    function finish() {
      if (BOOT.done) return;
      BOOT.done = true;
      bootCommit();
      bootModeSet(BOOT_MODES[BOOT.sel].id);
      /* 浮层撤走的同一刻让面板重播入场：星环重新组装、碎片从远处入轨，
       * 这样"选择之后"是接着动画，而不是一下子静下来 */
      if (BOOT_MODES[BOOT.sel].id === 'study' && typeof NL_ReplayBoot === 'function') {
        try { NL_ReplayBoot(); } catch (e) { /* noop */ }
      }
      setOpen(false);
    }

    function frame(now) {
      if (!BOOT.open) return;
      if (!last) last = now;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      BOOT.t = t;

      /* 换屏：记时间点，用来淡入 / 重排入场 */
      if (BOOT.phase !== BOOT.lastPhase) {
        BOOT.lastPhase = BOOT.phase;
        BOOT.switchAt = t;
        BOOT.lastInput = t;
        BOOT.auto = null;
        BOOT.autoDoneAt = 0;
      }

      /* 刻意放慢：每一步都留够看清的时间；嫌慢就按 ESC 逐级跳过 */
      if (BOOT.phase === 'boot' && t > 5.0) {
        BOOT.phase = 'sync';
      } else if (BOOT.phase === 'sync' && t - BOOT.switchAt > 2.8) {
        BOOT.phase = 'auth';
        BOOT.cmd = '';
      } else if (BOOT.phase === 'auth' && BOOT.auth === 1 && t - BOOT.authAt > 1.9) {
        BOOT.auth = 2;
        BOOT.grantAt = t;
      } else if (BOOT.phase === 'auth' && BOOT.auth === 2 && t - BOOT.grantAt > 1.3) {
        BOOT.phase = 'brief';
        BOOT.cmd = '';
      } else if (BOOT.phase === 'brief' && t - BOOT.switchAt > 2.6) {
        BOOT.phase = 'choose';
      } else if (BOOT.phase === 'enter' && t - BOOT.turnAt > 1.6) {
        /* 先切面板，让星图在浮层底下先长出来，然后再退场 */
        BOOT.phase = 'dive';
        BOOT.diveAt = t;
        bootCommit();
      } else if (BOOT.phase === 'dive' && t - BOOT.diveAt > 2.8) {
        finish(); return;
      }

      /* 身份验证：静置 3 秒后自己开始打字，节奏带一点抖动，像有人在敲 */
      if (BOOT.phase === 'auth' && BOOT.auth === 0) {
        if (!BOOT.auto && !BOOT.cmd && t - BOOT.lastInput > 3.0) {
          BOOT.auto = { text: (BOOT.gh || bootGhGet() || 'Canvilke'), i: 0, next: t + 0.42 };
        }
        if (BOOT.auto) {
          var au = BOOT.auto;
          if (t >= au.next && au.i < au.text.length) {
            au.i++;
            BOOT.cmd = au.text.slice(0, au.i);
            var beat = 0.085 + Math.random() * 0.115;
            if (au.i === 4 || au.i === 8) beat += 0.34;   /* 换气 */
            au.next = t + beat;
          }
          if (au.i >= au.text.length && !BOOT.autoDoneAt) BOOT.autoDoneAt = t;
        }
        if (BOOT.autoDoneAt && t - BOOT.autoDoneAt > 1.05) {
          BOOT.autoDoneAt = 0;
          BOOT.auto = null;
          authSubmit();
        }
      }

      /* 通道清单：9 秒不动就自己走。
       * 不给人卡在门外的机会——但也不一进来就冲进去。 */
      if (BOOT.phase === 'choose' && t - BOOT.lastInput > 9) {
        go();
      }

      /* 跃迁阶段把不透明底衬逐渐撤掉，让下面的星图透上来 */
      if (bg) {
        var ba = BOOT.phase === 'dive'
          ? clamp(1 - (t - BOOT.diveAt) / 2.8, 0.04, 1)
          : 1;
        bg.style.opacity = ba.toFixed(3);
      }

      try {
        bootFrameBody(c, W, H, t, DPR);
      } catch (e) {
        c.fillStyle = '#04070c'; c.fillRect(0, 0, W, H);
        c.fillStyle = '#ff6b5a';
        c.font = mono(11, 500);
        c.textAlign = 'left';
        c.fillText(errText(e).split('\n')[0], 24, 24);
      }
      raf = requestAnimationFrame(frame);
    }

    function authSubmit() {
      if (BOOT.auth !== 0) return;
      var raw = (BOOT.cmd || '').trim().replace(/^@+/, '');
      if (!raw) {
        BOOT.authMsg = '需要 GitHub 账号才能通过验证 · HANDLE REQUIRED';
        BOOT.authHint = t;
        return;
      }
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(raw)) {
        BOOT.authMsg = '账号格式不符 · INVALID HANDLE';
        BOOT.authHint = t;
        return;
      }
      BOOT.gh = raw;
      bootGhSet(raw);
      BOOT.auth = 1;
      BOOT.authAt = t;
    }

    function go() {
      if (BOOT.phase === 'boot') { BOOT.phase = 'sync'; return; }
      if (BOOT.phase === 'sync') { BOOT.phase = 'auth'; BOOT.cmd = ''; return; }
      if (BOOT.phase === 'brief') { BOOT.phase = 'choose'; return; }
      if (BOOT.phase === 'auth') { authSubmit(); return; }
      if (BOOT.phase === 'choose') {
        BOOT.phase = 'enter';
        BOOT.turnAt = t;
        BOOT.t = t;
      }
    }

    function parseCmd(text) {
      var s = (text || '').trim().toLowerCase();
      if (!s) return BOOT.sel;
      if (s === '1' || s === 'code' || s === '编程' || s === '工程' || s === 'engineering') return 0;
      if (s === '2' || s === 'study' || s === '学习' || s === '认知' || s === 'cognition') return 1;
      return -1;
    }

    function onKey(e) {
      var k = e.key;
      BOOT.lastInput = t;
      if (BOOT.auto) { BOOT.auto = null; BOOT.autoDoneAt = 0; }
      if (k === 'Escape') {
        if (BOOT.phase === 'boot') { BOOT.phase = 'sync'; return; }
        if (BOOT.phase === 'sync') { BOOT.phase = 'auth'; return; }
        if (BOOT.phase === 'brief') { BOOT.phase = 'choose'; return; }
        if (BOOT.phase === 'auth' && BOOT.auth === 0) { BOOT.phase = 'brief'; return; }
        if (BOOT.phase === 'choose') {
          if (BOOT.cmd) { BOOT.cmd = ''; return; }
          go(); return;
        }
      }
      if (BOOT.phase === 'auth') {
        if (BOOT.auth !== 0) return;
        if (k === 'Enter') {
          e.preventDefault();
          authSubmit();
        } else if (k === 'Backspace') {
          if (BOOT.cmd) { e.preventDefault(); BOOT.cmd = BOOT.cmd.slice(0, -1); }
        } else if (k && k.length === 1 && /[A-Za-z0-9\u4e00-\u9fa5]/.test(k)) {
          if (BOOT.cmd.length < 18) { e.preventDefault(); BOOT.cmd += k; }
        }
        return;
      }
      if (BOOT.phase !== 'boot' && BOOT.phase !== 'choose') return;

      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'Tab') {
        e.preventDefault();
        BOOT.sel = (BOOT.sel + 1) % BOOT_MODES.length;
      } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
        e.preventDefault();
        BOOT.sel = (BOOT.sel + BOOT_MODES.length - 1) % BOOT_MODES.length;
      } else if (k === 'Enter') {
        e.preventDefault();
        if (BOOT.phase === 'choose') {
          var pick = parseCmd(BOOT.cmd);
          if (pick >= 0) BOOT.sel = pick;
          BOOT.cmd = '';
        }
        go();
      } else if (k === 'Backspace') {
        if (BOOT.phase === 'choose' && BOOT.cmd) {
          e.preventDefault();
          BOOT.cmd = BOOT.cmd.slice(0, -1);
        }
      } else if (k && k.length === 1 && /[A-Za-z0-9\u4e00-\u9fa5]/.test(k)) {
        if (BOOT.phase === 'choose' && BOOT.cmd.length < 18) {
          e.preventDefault();
          BOOT.cmd += k;
        }
      }
    }

    function onMove(e) {
      var r = wrap.getBoundingClientRect();
      var mx = e.clientX - r.left;
      var my = e.clientY - r.top;
      BOOT.hot = bootHit(mx, my);
      if (BOOT.hot >= 0 && BOOT.phase === 'choose') BOOT.sel = BOOT.hot;
      var pr = BOOT.promptRect;
      BOOT.promptHot = !!(pr && mx >= pr.x && mx <= pr.x + pr.w && my >= pr.y && my <= pr.y + pr.h);
    }

    function onClick(e) {
      var r = wrap.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var ar = BOOT.avatarRect;
      if (BOOT.phase === 'auth' && ar && BOOT.auth === 0 &&
          mx >= ar.x && mx <= ar.x + ar.w && my >= ar.y && my <= ar.y + ar.h) {
        if (fileRef.current) fileRef.current.click();
        return;
      }
      var i = bootHit(mx, my);
      if (i >= 0 && BOOT.phase === 'choose') { BOOT.sel = i; go(); }
    }

    /* 选一张图 → 缩到 192×192 存进 localStorage；太大就不收 */
    function onPick(e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 6 * 1024 * 1024) {
        BOOT.authMsg = '图片超过 6MB · IMAGE TOO LARGE';
        return;
      }
      if (typeof FileReader === 'undefined') return;
      var fr = new FileReader();
      fr.onload = function () {
        var src = String(fr.result || '');
        if (typeof Image === 'undefined') {
          BOOT.avatar = src; bootAvatarSet(src); bootAvatarLoad(src); return;
        }
        var im = new Image();
        im.onload = function () {
          try {
            var n = 192, cv2 = document.createElement('canvas');
            cv2.width = n; cv2.height = n;
            var g2 = cv2.getContext('2d');
            var sc = Math.max(n / (im.width || 1), n / (im.height || 1));
            var dw = (im.width || 1) * sc, dh = (im.height || 1) * sc;
            g2.drawImage(im, (n - dw) / 2, (n - dh) / 2, dw, dh);
            var out = cv2.toDataURL('image/jpeg', 0.86);
            BOOT.avatar = out; bootAvatarSet(out); bootAvatarLoad(out);
          } catch (err) {
            BOOT.avatar = src; bootAvatarSet(src); bootAvatarLoad(src);
          }
        };
        im.onerror = function () { BOOT.authMsg = '图片读取失败 · IMAGE ERROR'; };
        im.src = src;
      };
      fr.readAsDataURL(f);
    }

    pickRef.current = onPick;

    resize();
    var ro = null;
    try {
      ro = new ResizeObserver(function () { resize(); });
      ro.observe(wrap);
    } catch (e) { /* noop */ }

    window.addEventListener('keydown', onKey, true);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerdown', onClick);
    raf = requestAnimationFrame(frame);

    return function () {
      BOOT.open = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerdown', onClick);
      if (ro) ro.disconnect();
    };
  }, [open]);

  if (!open) return null;

  return h('div', { className: 'nl-boot', ref: wrapRef },
    h('style', { key: 'nl-boot-css' }, BOOT_CSS),
    h('div', { className: 'nl-boot-bg', ref: bgRef, key: 'bg' }),
    h('canvas', { className: 'nl-boot-cv', ref: cvRef }),
    h('input', {
      key: 'avatar-file', type: 'file', accept: 'image/*',
      ref: fileRef,
      onChange: function (e) { if (pickRef.current) pickRef.current(e); },
      style: { display: 'none' }
    })
  );
}

var BOOT_CSS = [
  '.nl-boot{position:fixed;inset:0;z-index:9998;background:transparent;',
  '  cursor:default;user-select:none;overflow:hidden;isolation:isolate}',
  '.nl-boot-bg{position:absolute;inset:0;background:#04070c;pointer-events:none}',
  '.nl-boot-cv{position:relative;display:block;width:100%;height:100%}'
].join('\n');

function registerBoot(ctx) {
  try {
    ctx.slots.inject('shell.overlay', function () {
      return ctx.slots.register({
        name: 'shell.overlay',
        id: 'neuro-loop-boot',
        order: 90
      }, function () { return h(BootLayer, { layout: ctx.layout }); });
    });
  } catch (e) { NL_ERR = NL_ERR || e; }
}
