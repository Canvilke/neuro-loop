# Neuro-Loop · 任务台账

> 这份文件是项目的唯一进度真源。每轮改动后更新；「已完成」只写验证过的，
> 没验证的一律进「待验证」。

最后更新：2026-11-08 12:43

---

## 0. 怎么读这张表

| 状态 | 含义 |
| --- | --- |
| `DONE` | 已实现，且通过了构建 + 自动化测试（**不等于**视觉已确认） |
| `WIP` | 正在做，代码可能半截 |
| `TODO` | 排期但未开始 |
| `BLOCKED` | 卡在外部条件（需要截图、需要用户拍板） |
| `DROP` | 明确不做，留原因 |

验证手段分三级，**任何一条视觉结论都必须来自 L3**：

- **L1 构建**：`python build.py --check`（拼包 + `node --check`）
- **L2 无头**：`node test/smoke.cjs`（渲染不抛错）、`node test/levels.cjs`（层级切换契约）
- **L3 真机**：用户刷新后截图。我无法自己截图，**所有"看起来怎样"的判断都只能引用 L3**。

---

## 1. 里程碑

| ID | 目标 | 状态 | 备注 |
| --- | --- | --- | --- |
| M1 | 六科星环 + 行星 + 知识星图骨架，装进 DSH 侧栏 | `DONE` L3 | 2026-11-08 上午 |
| M2 | 去掉"廉价 tooltip"，冷色阶，陨石带可见 | `DONE` L3 | v2 |
| M3 | 布局重排：环缩小、底部操控台、3D 可旋转/缩放 | `DONE` L3 | v3，含两次黑屏修复 |
| M4 | 字体对比度 + 动态特效 + 背景不空 | `DONE` L3 | 2026-11-08 11:55 截图已确认 |
| M5 | 知识点分层（主节点 → 组内考点）+ 环心星系仪表盘 | `DONE` L3 | 12:43 截图已确认；盘心改用学科符号 |
| M6 | 启动序列：UEG 风格开场 + 编程/学习双通道 | `WIP` | 代码就位，L1+L2 全绿（`client.js 182574 B`），**待 L3 截图** |

---

## 2. 任务清单

### M4 · 观感（用户 11:46 反馈）

| ID | 任务 | 状态 | 验证 |
| --- | --- | --- | --- |
| M4-1 | 操控台/HUD/行星名/节点名整体提亮 | `DONE` | L1+L2 |
| M4-2 | 背景模块 `src/06-bg.js`（星云、银河、星场、尘埃、扫描） | `DONE` | 子代理自测 + 接入 L2 |
| M4-3 | 后处理模块 `src/07-fx.js`（扫描线、色散、噪声、角标、glitch） | `DONE` | 子代理自测 + 接入 L2 |
| M4-4 | glitch 时长 476ms → 150ms；hover 传给角标 | `DONE` | L1+L2 |
| M4-5 | 背景模块失败时的兜底底色（防残影） | `DONE` | L1+L2 |
| M4-6 | **等用户截图确认**，若仍空旷/偏暗再迭代 | `BLOCKED` | 需要 L3 |

### M5 · 分层与仪表盘（用户 11:59 反馈）

| ID | 任务 | 状态 | 验证 |
| --- | --- | --- | --- |
| M5-1 | seed 加 `groups` / 节点 `grp`（真实高三知识块） | `DONE` | 子代理自检；6 科 4/4/4/4/4/3 组，组内边≈组间边 2–3 倍 |
| M5-2 | `groupGraphFor()`：主节点按椭圆环排布 + 跨组边聚合 | `DONE` | L2 |
| M5-3 | `subGraphFor()`：组内子图独立力导向布局 | `DONE` | L2 |
| M5-4 | 层级 0 = 只显示主节点（带微卫星，暗示"里面还有东西"） | `DONE` | L2 `test/levels.cjs` |
| M5-5 | 点主节点 → 出「进入『X』？」确认 → ENTER/双击进入 | `DONE` | L2 |
| M5-6 | 层级 1 = 组内考点 + 主序星 + 面包屑 + ESC/`↑ 返回` 回退 | `DONE` | L2 |
| M5-7 | 节点半径缩小（`2.5 + attn*3.4`，原 `3.2 + attn*5.4`） | `DONE` | L2（视觉待 L3） |
| M5-8 | 环心星系仪表盘 `src/09-instrument.js` | `DONE` | 229 行，144 刻度+方位环+反向内环+指针+透镜+三条微条 |
| M5-9 | 仪表盘接入 `frameBody`（环后半之后、行星之前） | `DONE` L2 | smoke 断言环腔内有 1311 条 arc；有模块才生效 |
| M5-10 | 盘心美化：字形缩小、六段方位环、去掉盘下重复微条、指针不戳透镜 | `DONE` L1+L2 | 用户 12:35 反馈"中间的字符太奇怪"，待 L3 |
| M5-11 | 汉字字形 → 学科符号（¶ Σ Æ φ ⌬ §），字重 300→400 | `DONE` L1+L2 | 用户 12:40 选 A；`⌬` 若显示豆腐块则换 `⌁` |


### M6 · 启动序列（用户 12:46 反馈）

| ID | 任务 | 状态 | 验证 |
| --- | --- | --- | --- |
| M6-1 | `src/10-boot.js`：三阶段（自检 3.1s → 选择通道 → 接入 0.9s），线框地球 + 发动机光柱 + 自检日志 + 42 段进度 | `DONE` L1+L2 | 约 520 行，纯手绘 |
| M6-2 | 挂到 `shell.overlay`（id `neuro-loop-boot`, order 90），wrapper `inject: ['slots','layout']` | `DONE` L2 | smoke 断言 3 个注册且含 `shell.overlay` |
| M6-3 | 通道落盘 `localStorage['neuroloop.mode']` + `ctx.layout.selectPanel()`：学习→`neuro-loop`、编程→`conversation` | `DONE` L2 | `boot.cjs` 断言 mount 后 `BOOT.open` 为真 |
| M6-4 | **每次页面加载自动开场**（`useState(true)`），`m` 键可重新拉起 | `DONE` L2 | 曾经写成 `useState(false)`，导致只有按 `m` 才出现 |
| M6-5 | `test/boot.cjs`：三阶段绘制 + 卡片命中 + 自动开场 | `DONE` L2 | `boot ok — opens on load, 3 phases, 2 channels` |
| M6-6 | 真机观感：地球线框密度、光柱亮度、高 DPI 下字号是否发虚 | `BLOCKED` | 需要 L3 |
| M6-8 | 选择屏去「简陋」：两侧操作员读数栏（上次接入/累计会话/认知负载/对接带宽 + 条形）、三道极淡轨道 + 轨道光点、卡片增数据块（POINTS 42 / FALSE+ 3）、底部提示分层 | `DONE` L1+L2 | 用户 13:11「进入界面有点简陋」 |
| M6-9 | 接入改成三步：`enter` 卡片收拢 0.72s → `dive` 光速线 + 通道环收缩 + 白闪 1.05s → 退场；`dive` 一开始就 `selectPanel`，星图在浮层底下先长出来 | `DONE` L1+L2 | 用户 13:11「进入学习模式不够沉浸」 |
| M6-10 | 面板接住跃迁：`NL_ReplayBoot()`（已挂载时重播入场）、开头 0.24s 的射线余波、底部「学习通道·认知星图已接入」字幕淡出 | `DONE` L1+L2 | 同上 |
| M6-7 | 编程模式进入后是否要一套同风格界面 | `DONE` L2 | 已做 `src/12-code.js`（独立 key 的 DOM 面板），启动序列选「编程模式」直接进它 |
| M6-11 | 选择屏去「两大块」：两个矩形卡改成清单行（`bootRow`，左色条 + 上下发丝线 + 序号/符号/名称/英文/说明/右侧数值，选中时底边跑一条光） | `DONE` L1+L2 | 用户 13:23「两大块太突兀」 |
| M6-12 | 接入改**扫描线擦除**：`py = -0.08h + k*1.18h` 自上而下扫过，扫过处压暗、线上 2.4px 光带 + 白芯、120px 渐亮拖尾 | `DONE` L1+L2 | 用户 13:23「进入时可以用扫描线」 |
| M6-13 | 指令问答行 `bootPrompt`：`>` 提示符 + 输入回显 + 闪烁块光标；`Enter` 解析 `1/2`、`study/code/学习/编程/认知/工程`；`Backspace` 退格、`Esc` 先清空再退出 | `DONE` L1+L2 | 用户 13:23「简单的指令问答界面」 |
| M6-14 | 字体整体加粗加大：标题 20–26px/700、行名 18px/700、序号 12px/700、符号 30px/600、英文 8.4px/600、页眉 11.5px/700 | `DONE` L1+L2 | 用户 13:23「字体太细」 |
| M6-15 | 左右不再空旷：两侧机柜改成满高（`railY = y0-46`，`railH` 到 `h-118`），左侧 4 行读数带进度条、右侧 3 条通道说明 | `DONE` L1+L2 | 用户 13:23「左右过于空旷」 |
| M6-16 | 选择屏加蒙板：整屏 `rgba(3,6,11,0.80)` + 中心径向托底，底部地球/光柱降到 alpha 0.22/0.30，不再和清单打架 | `DONE` L1+L2 | 用户 13:31「后面要个蒙板」 |
| M6-17 | 字重加厚并在两通道上分开字形：`code` 用 Consolas 19px/700 + 1.2 字距；`study` 用雅黑 20px/800 + 2.6 字距；两者都带暗色 shadowBlur 12 | `DONE` L1+L2 | 用户 13:31「字体太细」「两个都不太明显」 |
| M6-18 | 新增 **`auth` 身份验证阶段**（排在 boot 之后、choose 之前）：证件卡（头像轮廓 + 姓名 （已隐去） / NAME REDACTED / ID NL-550W-2413 / 权限 高三 LEVEL-3 / 条码）、右侧三项校验（生物特征 / 权限核验 / 链路协商，逐项点亮）、口令行 `>`、状态词 AWAITING INPUT → VERIFYING → GRANTED、校验时证件照上下扫描线 | `DONE` L1+L2 | 用户 13:31「输入指令应该在前面，验证通过再进入」 |
| M6-19 | 口令流程：空口令回车会出「需要口令才能通过验证」并 2.4s 淡出；有效口令 → 1.35s 校验（三项依次亮）→ 0.85s「身份验证通过 / IDENTITY VERIFIED」→ 自动进入选择屏；`ESC` 可跳过验证 | `DONE` L1+L2 | `boot.cjs` 断言 auth 的 promptRect 与校验时序 |
| M6-20 | 去掉真名：验证卡改为 **GitHub 账号**（`@Canvilke`），ID 由 `hashStr(gh)` 生成 `NL-550W-XXXX`；账号存 `localStorage['neuroloop.gh']`；校验规则同 GitHub（`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`），空/格式错分别给提示 | `DONE` L1+L2 | 用户 13:34「别把我真名放上去」 |
| M6-21 | 两条通道各挂自己的代号：学习=`残梦潇伤`、编程=`星海漫游`（`BOOT_MODES[].handle`，画在英文名右侧）；`boot.cjs` 加隐私守卫，`client.js` 里出现真名直接判失败 | `DONE` L1+L2 | 同上 |
| M6-22 | **静置 2s 自动输入**：逐字 58–140ms，第 4/8 字多停 170ms，打完停 0.62s 自动提交验证；任意按键立刻取消 | `DONE` L1+L2 | 用户 13:41「停留 2s 自动输入」；`boot.cjs` 断言自动打出 `@Canvilke` 并提交 |
| M6-23 | **屏间平滑转场**：每次换屏 0.42s 从黑浮起（`(1-sw)^2`）+ 选择屏整体上浮 10px；`dive` 不盖，免得挡住底下星图 | `DONE` L1+L2 | 用户 13:41「每个页面之间平滑链接」 |
| M6-24 | **样式集 `src/015-type.js`**：7 个 role（display/title/subtitle/body/label/micro/mono）带 size/weight/tracking/alpha；`FONT_STACK`/`MONO_STACK` 改为 `Inter → HarmonyOS Sans SC → MiSans → 雅黑`，等宽 `JetBrains Mono → Cascadia Mono → Consolas` | `DONE` L1+L2 | 用户 13:41「自己设计一个样式集」 |
| M6-25 | **代码重整**：`10-boot.js` 拆成 `10-boot-core.js`（状态机 + React 外壳，12.3KB）与 `11-boot-view.js`（全部绘制，28.8KB）；`build.py` ORDER 同步 | `DONE` L1+L2 | 三个测试全绿 |
| M6-28 | **选择之后的过渡放慢**：扫描线 1.0→1.6s（过半加「正在建立认知链路」+ 进度尺）、跃迁 1.5→2.8s（冲击波、三拍文字 LINKING→SYNCING→LINK ESTABLISHED、三个节点依次点亮、白闪收到 0.88）；`finish()` 时再触发一次 `NL_ReplayBoot()`，让面板的星环组装接在浮层撤走的同一刻 | `DONE` L1+L2 | 用户 14:03「学习模式选完后面的过渡太快」 |
| M6-29 | **证件照可换**：点照片选本地图片（≤6MB）→ 缩到 192×192 存 `localStorage['neuroloop.avatar']`；没图时按 GitHub 账号生成 identicon（5×5 镜像格），换账号即换头像 | `DONE` L1+L2 | 用户 14:03「我的头像那里可以改一下」；`boot.cjs` 断言 `avatarRect` 在画布内 |
| M6-27 | **整体放慢 + 加两个环节**：自检 3.1→5.0s（日志 7→10 条）、新增 `sync` 六科同步 2.8s、静置 2.0→3.0s、打字 58–140→85–200ms/字、输入后等 0.62→1.05s、验证 1.35→1.9s、通过后 0.85→1.3s、新增 `brief` 通道简报 2.6s、扫描线 0.72→1.0s、跃迁 1.05→1.5s；`ESC` 逐级跳过 | `DONE` L1+L2 | 用户 13:49「整个流程太快，降低速度增加几个环节」；`boot.cjs` 断言七阶段顺序 |
| M6-26 | **设计文档 `DESIGN.md`**：隐喻→字段映射表、色彩/字阶/空间/动效四节、启动序列图、架构与后端三层路线 | `DONE` — | 用户 13:41「整理设计文档」 |

### M7 · 后端（未开工）

| ID | 任务 | 状态 | 说明 |
| --- | --- | --- | --- |
| M7-1 | 宿主 `GET /neuroloop/state` 只读投影 | `DONE` L2 | 打包插件没有 `host.call`，只能走 HTTP；失败时客户端退回内联 seed |
| M7-2 | 间隔重复调度（错→8h / 对→`min(45, 2^(streak-1))` 天） | `DONE` L2 | 只排 68 个考点、不排题；参数标 `calibrated:false` |
| M7-3 | `POST /neuroloop/event` 记判定/磨平，`state.json.tmp` + rename | `DONE` L2 | 先写 L1 再改 L2；写入同步 `subject.stat` 由投影负责 |
| M7-4 | `tools/import_proto_db.py` 只读导 `neuro_loop.db` → `imports/*.json` | `DONE` | 见 §4.3：原型库其实是**机器学习概念**演示数据，与高考考点 0 映射 |
| M7-5 | 学习模式设为主模式（默认 `study`、简报默认学习、进入即 `selectPanel`） | `DONE` L2 | 高三主要入口 |
| M7-6 | 编程模式面板（`src/12-code.js`，独立 key `neuro-loop-code`） | `DONE` L2 | DOM 面板：身份/通道读数 + 三个动作（回会话、切学习、重播启动）；不占 canvas，崩了不连累学习面板 |

### 待办（未排期）

| ID | 任务 | 状态 | 说明 |
| --- | --- | --- | --- |
| T-1 | 层级 2：单个考点的三表征（核心考点/设错陷阱/方法判据）可视化 | `TODO` | 现在靠全息铭牌呈现文字，尚未做成星体 |
| T-2 | 分层里的"入口动画"（主节点展开成星图） | `TODO` | 现在用 reveal 淡入，偏简单 |
| T-3 | 真机性能守门（DPR=2、大屏时帧率） | `TODO` | 尚无实测数据 |
| T-4 | 数据落盘（宿主侧读写工作区 JSON、错题入库） | `TODO` | 用户明确说**先不接错题数据** |
| T-5 | 开发文档补架构图 | `TODO` | 用 archify 生成 |

---

## 3. 架构与模块边界

一个客户端插件，**没有打包器**，`build.py` 把 `src/0*.js` 按序拼成单文件 `client.js`：

```
01-util.js      数学/颜色/字体工具（无副作用）
02-data.js      seed → 行星/图布局/分组/层级图（纯函数 + 缓存）
03-space.js     星环、行星、背景星场（左半屏）
04-web.js       知识场：层级状态、3D 投影、引力带、碎片带、全息铭牌
05-app.js       场景壳：画布挂载、输入、HUD、操控台、React 组件、slot 注册
06-bg.js        深空背景（子代理 A）
07-fx.js        后处理/科技感（子代理 B）
09-instrument.js 环心星系仪表盘（子代理 C，待接入）
```

拼装顺序 = 同一闭包内的声明顺序；函数声明会提升，**顶层 `var` 初始化按顺序执行**，所以模块之间的顶层调用必须靠后。

数据契约见 `data/seed.json`：`subjects[].nodes[] {id,label,attn,stability,core,trap,method,hit,acc,grp}`、
`subjects[].groups[] {id,label,short,nodes[]}`、`subjects[].edges[] {a,b,kind,w}`、`shards[] {subject,text,hit,acc,state}`。

## 4. 关键决策（别轻易推翻）

| # | 决策 | 原因 |
| --- | --- | --- |
| D1 | 交互存 `localStorage`，**真数据走宿主事件流** | v1 纯客户端是为了先做出东西；M7 起改为「本地队列 + 宿主 JSONL」，因为高三的记录不能只活在一个浏览器里 |
| D2 | 手写 Canvas 2D，不用 three.js | 客户端半边没有 npm/打包器 |
| D3 | 红色只用于警报（碎片、盲区环） | 用户两次说"颜色奇怪"；红→石板蓝插值会穿过粉紫 |
| D4 | 碎片只标"假阳性"（hit≥0.65 且 acc≤0.5） | 系统的价值是"只在你以为会的地方报警"，不是错题本 |
| D5 | 环分前后两半绘制 | 唯一能靠 2D 做出"行星穿过环"景深的方法 |
| D6 | 主节点默认只显示 4-5 个 | 用户："界面太过拥挤"、"左侧太满了" |

## 4.1 测试覆盖现状

| 断言 | 在哪 | 防的是什么 |
| --- | --- | --- |
| 渐变参数必须有限 | `test/smoke.cjs` canvas stub | NaN 进 canvas 导致整页黑（踩过两次） |
| 星图必须画到右半屏 | `test/smoke.cjs` `maxArcX > 600` | `WEB.reveal` 没人递增，星图整块不画 |
| 仪表盘必须画进环腔 | `test/smoke.cjs` 环心 ±100px 内 arc > 200 | 仪表盘 `typeof` 保护静默跳过 |
| 层级契约 | `test/levels.cjs` | 主节点层/组内层切换、`enterGroup`/`backGroup` 状态机 |
| 启动层必须自己开场 | `test/boot.cjs` | `useState(false)` 导致启动动画永不出现 |
| 三阶段绘制 + 卡片命中 | `test/boot.cjs` | 任一阶段 NaN/异常、卡片 rect 没算出来、点不中 |

## 4.2 盘心为什么曾"很奇怪"（记录，避免重犯）

第一版盘心是：**30px 的单个汉字**塞进半径 26px 的透镜 + 一圈完整同心圆 + 一根从外圈直插进来的指针 + 盘下三条 7px 的 HIT/ACC/盲区微条。
四件事叠起来读成了"靶心/印章"，而不是仪表。修法：
- 字形 `R*0.40 → RL*0.86`（约 30px → 22px），加 hue 辉光、去掉第二层重描；
- 完整同心圆 → **六段方位环**，当前学科那一段加粗点亮（方向与指针一致，盘才有"刻度"的含义）；
- 指针内端从 `R*0.430` 退到 `R*0.520`，不再戳进透镜；
- 删掉盘下三条微条——底部操控台已经有同样的数值，盘上再画一遍只是噪点。

## 5. 已知坑

- `ctx.arc/lineTo` 收到 NaN 会**静默跳过**；只有 `createRadialGradient/createLinearGradient/createPattern` 会抛 `non-finite`。所有渐变参数必须保证有限。
- 冒烟测试的 canvas stub 必须**主动校验**渐变参数，否则 NaN 会被 Proxy 吞掉、测试全绿（这个坑踩过两次）。
- 本包 `package.json` 有 `"type":"module"`，测试文件必须是 `.cjs`，且 `client.js` 用 `vm.runInThisContext` 加载，不能 `require`。
- 改完 `client.js` 必须**让用户刷新页面**才生效（没有 HMR）。
- 启动层的不透明底衬拆成独立 `div.nl-boot-bg`，靠 `style.opacity` 在 `dive` 阶段撤掉；**不能**把底色留在 `.nl-boot` 上，否则星图透不上来。
- `selectPanel` 必须在 `dive` 开始时调用（不能等 `finish`），否则浮层退场那一刻下面是空的，会出现半秒黑屏。
- `shell.overlay` 的启动层是全屏浮层，渲染崩了会**盖住整个 shell**；`frame()` 必须自带 try/catch，只把错误行画在屏幕上，不能让异常打死 entry。
- React stub 的 `useState` 不会触发重新渲染，所以测「自动开场」只能断言 effect 跑完后 `BOOT.open === true`，不能断言后续帧。

## 6. 数据模型（M7 之后的合同）

三层，职责不重叠：

| 层 | 位置 | 内容 | 可删吗 |
| --- | --- | --- | --- |
| L0 静态星图 | `data/seed.json` | 6 科 / 23 块 / 69 考点 / 连线 / core·trap·method | 不行（它是图纸） |
| L1 事件流 | `%USERPROFILE%\.dsh\neuro-loop\events-YYYY-MM.jsonl` | append-only：`recall` / `note` / `flatten` / `unflatten` | 不行（它是历史） |
| L2 投影 | 同目录 `state.json` | hits / misses / streak / dueAt / hitRate / accRate / flattened | **可以**，删了自动重建 |

- `rev` = 事件条数。在线写与离线重建得到同一个 `rev`，这是"投影可信"的唯一证明。
- **假阳性是查询不是字段**：`hitRate ≥ .65 && accRate ≤ .5 && misses ≥ 2`。
- 客户端断网时事件进 `localStorage` 队列，下次 `nlSync` 成功后补发；同一条 `flatten` 只发一次。

## 4.3 原型库到底是什么（S5 的结论）

`neuro_loop.db` 里 8 个 `params` 是 **梯度下降 / 反向传播 / 过拟合 / 注意力机制 / 位置编码 / 泛化 / 正则化 / 学习率调度**——是那份"大模型与人脑同构"理论的演示数据，不是化学，也不是高考考点。
所以自动映射 0 命中是**正确结果**，不是脚本坏了。结论：
- 不并入 seed；快照留在 `imports/proto-<时间戳>/`，`summary.json` 里记了候选映射（全为空）。
- 真正要用的映射是**理论五条**（预训练/MLA/KV/幻觉/RLHF）→ 字段，那是 DESIGN.md 的事，不是数据导入的事。

## 5.1 新踩的坑（M7）

- 插件 `inject` **不能写 `{ optional: ['webServer'] }`**：当前 loader 会把键名 `optional` 当成服务名去等，插件永远 `pending`，宿主路由整块不存在。写成 `inject: ['webServer']`。
- `ops_edit_file` 在本机对本目录返回 `PUBLICATION_DENIED`；改用 `edit` 工具或 python 写文件。
- Windows 控制台是 GBK，`python` 打印中文会乱码，但文件本身是 UTF-8，别据此判断写坏了。

---

## 7. M8 —— v2 引擎（2026-11-08 23:47 用户口述后新增）

> 完整设计见 **`ENGINE.md`**。这一节只记排期与状态。
> 判定：当前系统是"皮"（星图 + 事件流 + 我编的 seed），缺"引擎"（四层库 / 方法层 / 解析还原度 / 每日一页闭环）。

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| M8-1 | 方法卡 CRUD + 10 张真实卡（物理/数学各 5） | `DONE`（数据层） | `content/method/*.json` 10 张 + `tools/check_methods.py` 全绿；UI 版 CRUD 并到 M8-6 一起做 |
| M8-2 | 每日一页生成 + 打印（扁平样式，无渐变） | `WIP`（政治 + 英语已闭环） | 政治 `daily/pol-2026-11-10b.docx`、英语 `daily/en-2026-11-10.docx` 各一页并已打印；英语 20 条/天 × 58 天 + 5 句翻译 |
| M8-3 | 回来自评 Recon(0-3) / Hint(0-2) → 事件流 | `TODO` | 闭环第三段 |
| M8-4 | 题目录入（拍照 + top2-4 考点 + top1-3 方法） | `TODO` | 稀疏连接是纪律，不是优化 |
| M8-5 | `学习资料/` 解析（化学两份 docx + 数学配极原理 md 先行） | `TODO` | 真数据替换 scaffold |
| M8-6 | 星图加"方法星"层（L3 可视化） | `TODO` | 视觉跟上引擎 |
| M8-7 | 压缩归档（>3000 事件或跨月 → snapshot） | `TODO` | ROADMAP 里已有草案 |

### 7.1 已确认的接口/字段（写代码前先对齐）

- 方法卡 = 记忆向量；`judge`（何时用）与 `traps`（常错）是核心，没有 judge 的方法只是名词。
- 四个 head：审题 / 建模 / 运算 / 表达，各自独立记录 hit/acc，**不平均成一个掌握度**。
- 三维指标：Recon↑、Hint↓、Comp↓（claim 字数），外加已有 Hit/Acc。
- 内容与事件分离：正文进 `content/`，事件流只放 id 与数字。
- 打印必须扁平：含渐变的页实测 `printed=0` 被 spooler purge；纯色块 + 细线 + 文字才成功。

### 7.2 待用户拍板

1. ~~`学习资料/` 里的解析是他自己写的还是标准答案~~ → 已定：他提供的 `source:"self"`；我生成的 `source:"ai"` + `confidence` + `verified:false`，界面标「AI 生成 · 待审」，他审过后才升为 self。
2. **仍待答**：每日一页的"三条方法"——系统按 DUE 自动挑，还是他前一晚手选？（默认按 DUE 自动挑，他可在页上划掉）

### 7.3 明确不做

- 全连接知识图（会变成一坨发光的雾）
- 向量嵌入检索（在没有方法层之前没有意义）
- 自动出题（会生成废题）
- 总分 / 排名类指标（用户明确反对指标反噬）

### 7.4 新增（M8-8）

| M8-8 | 每日一页回填（`daily` 事件 + `tools/record.py`） | DONE | 38 checks 全绿；live 路由返回 `daily` |

## 8. M9 —— 信箱（跨会话通讯）

| id | 事项 | 状态 | 证据 |
| --- | --- | --- | --- |
| M9-1 | `host/mail.js`：按收件人 append-only jsonl + 已读侧表 + 500 封截断 | DONE | — |
| M9-2 | 路由 `GET/POST /neuroloop/mail`（取信/寄信/标已读；loopback + 同源守卫） | DONE | host 47 checks, routes 3 |
| M9-3 | CLI `tools/mail.py`（send/check/read；宿主不在则直写文件） | DONE | 实测 http 与 file 两条路径 |
| M9-4 | 客户端 MAIL 灯：`nlMailSync()` + HUD 右上未读计数（挂在帧循环，60s 一次） | DONE | `client.js 241823 B`；待 F5 看效果 |
| M9-5 | 写进 `AGENTS.md` §2.1（IM 会话先寄信给 lead） | DONE | — |
| M9-6 | 心跳 prompt 第 0 步改为查信箱 | DONE | `schedule-6478f707` |
| M9-7 | 安装 GitHub CLI | DONE | `C:\Program Files\GitHub CLI\gh.exe` 2.103.3 |
| M9-8 | `gh auth login` + `watch_start`（主理鱼 watcher） | **等用户** | 设备码需本人确认 |

### M9 —— 数据模型 v2 研究与提案（2026-11-10）
- [x] M9-1 调研教育测量/间隔重复/LLM 机制/智能体记忆四类先例，引用逐条核对。
- [x] M9-2 产出 `docs/RESEARCH-PLAN.pdf`（8 页）：CNS v2 五实体六不变量、稀疏检索、缓存与假阳性、指标、S1–S6 路线、四问。
- [ ] M9-3 等用户拍板后开工 S1（schema + 迁移脚本）。

### M10 —— core 领域层（2026-11-10，DONE）
- [x] M10-1 `core/contract.js`：事件白名单、id 正则、上限、`DomainError`。
- [x] M10-2 `core/events.js`：九种事件规范化；v1 的 `recall/review` 自动映射为 `attempt`。
- [x] M10-3 `core/metrics.js`：间隔（1/2/4/…/45 天）、到期、命中率、准确率（空样本为 null）、假阳性、缓存三态。
- [x] M10-4 `core/state.js`：`emptyState/applyEvent/rebuild/dueList/subjectStats`。
- [x] M10-5 `test/core.test.mjs`（24 条）+ `test/legacy.test.mjs`（4 条，拿 v1 当 oracle 交叉验证）。
- [x] M10-6 `storage/legacy.js` + `tools/core_verify.mjs`：用磁盘上的真实事件重放，与 `state.json` 比对一致。
- 说明：`host/store.js` 暂未切到 core——切换与状态格式升级一起做（M11），避免同一周内两套投影并存。

### M11 —— storage + host 切换（2026-11-10，DONE）
- [x] M11-1 备份真数据到 `backup/2026-11-10-m10/`（事件流 6 条 + state.json + 信箱）。
- [x] M11-2 `core/state.js` 抽出 `attemptDelta(ev)`：增量的唯一入口，JS 与 SQL 共用，避免两套逻辑漂移。
- [x] M11-3 `storage/events.js`：`rootDir/ensureRoot/monthFile/append/listFiles/parseLine/readAll/size`，v1 行经 `storage/legacy` 翻译。
- [x] M11-4 `storage/projection.js`：`node:sqlite` 六表 + 索引；`applyIncremental` / `rebuild`（事务、失败回滚）/ `dueList` / `dump`。
- [x] M11-5 `test/storage.test.mjs`（8 条，含"增量 == 重建"、一万条重建 < 2s，实测 535ms）。
- [x] M11-6 `host/service.js`：`db()/view()/getState()/addEvent()/reset()/saveState()`；`meta.rev !== 事件条数` 自动重建。
- [x] M11-7 `index.js` 写路径改为 `addEvent`；`state.version` → 2；`blocked` 语义改为"卡点原文"。
- [x] M11-8 `test/host.mjs` 适配 v2（L1 行断言 `.v===2 && .kind==='attempt'`）→ 71 checks。
- 说明：`host/store.js` 保留为只读兼容层（读旧 state.json 的迁移用），新写入一律走 `host/service.js`。

### M12 —— 多子代理维护性（ADR-0002 执行侧，进行中）
- [x] M12-1 `docs/ADR-0002-persistent-team.md`：问题/决策/被否方案/纪律（没有票不开工）。
- [x] M12-2 `team/roles.json`：六角色 `architect/core-dev/host-dev/ui-dev/content/qa`，各带 `owns/done/never`。
- [x] M12-3 `host/team.js`：append-only 台账 + 重放看板 + 依赖/领票/阻塞校验（`deps-open`/`already-claimed`/`note-required`）。
- [x] M12-4 `index.js` 路由 `/neuroloop/team`（GET 看板 / POST 开票与流转），`TEAM_ROOT` 可注入（测试用临时目录）。
- [x] M12-5 `src/14-team.js` + 侧栏「控制台」（order 23）：五格计数、角色契约、票单列表。
- [x] M12-6 `tools/ticket.mjs`：`list/next/brief/new/claim/done/block/reopen`，子代理能用的唯一下手点；`brief` 生成"可直接交给子代理"的提示词。
- [x] M12-7 `test/dispatch.test.mjs`（25 checks）：空台账拒绝开工、依赖未完成拒领、重复领拒、block 必须写理由、brief 内容契约。
- [x] M12-8 `docs/TEAM-PROTOCOL.md`：Lead 视角与子代理视角的两套循环、并发写域、恢复现场三步。
- [x] M12-9 `check_all.ps1` 扩到 11 项（新增 storage、dispatch）。
- [ ] M12-10 端到端演练：真实派一张票给子代理，走完 claim → 施工 → 复核 → done（本轮进行中）。
- [x] M12-11 `ticket.mjs` 的写域冲突提示：`scopeOverlap` / `conflictsOf`，`new` 时前缀相交就告警；dispatch 测试扩到 32 checks。

### M12 续（三条通道）
- M12-12 总线 v1：`bus/bus.jsonl` 只追加，四条 lane（sub/repo/wx/note），追加前补行边界 —— DONE
- M12-13 两套读写：`tools/bus.mjs`（CLI）与 `host/bus.js`（HTTP `/neuroloop/bus`），`test/bus.test.mjs` 19 条双向校验 —— DONE
- M12-14 微信段能力边界写进 `docs/BUS.md`：异步双工（无推送接口），AGENTS §2 同步 —— DONE
- M12-15 控制台显示总线未读（bus pending 进 TeamPanel 头部）—— TODO
- M12-16 子代理派票时把 bus id 写进 brief（派单即可回信）—— TODO
