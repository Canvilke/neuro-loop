# AGENTS.md · 作业须知

> 给任何接手这个仓库的人 / AI。先读完这一页，再看 `NEXT.md` 顶部的三行。
> 这里只写「必须遵守的」；设计背景看 `DESIGN.md`、`ENGINE.md`，版式契约看 `FORMAT-politics.md`。

## 0. 三十秒上手

在仓库根目录（`neuro-loop\`）执行：

```bash
python build.py --check            # 拼包 + node --check
node test/smoke.cjs                # 五套无头测试
node test/levels.cjs
node test/boot.cjs
node test/net.cjs
node test/host.mjs
python tools/activate.py           # 环境体检

# 或者一条命令跑完（Windows PowerShell）
powershell -ExecutionPolicy Bypass -File tools/check_all.ps1
```

当前 `client.js` 由根目录的 **`build.py`** 生成（不是 `tools/build.py`，后者不存在）。

---

## 1. 目录职责

| 路径 | 职责 | 能不能手改 |
| --- | --- | --- |
| `src/*.js` | 客户端全部源码，13 个模块拼进同一个闭包；无 JSX、无 import | **只改这里**（配合 `data/seed.json`） |
| `build.py` | 拼包器：按 `ORDER` 把 `src/*.js` + `data/seed.json` 拼成 `client.js`；`--check` 顺带 `node --check` | 可以改，但改动会影响所有人 |
| `client.js` | 构建产物，已被 `.gitignore` 忽略 | **禁止手改**，只能由 `build.py` 生成 |
| `version.json` | 构建哈希与字节数，产物，git 忽略 | 禁止手改 |
| `test/*.cjs`、`test/host.mjs` | 五套无头测试（smoke / levels / boot / net / host） | 可以加测试；**不要改断言来绕过失败** |
| `data/seed.json` | 六科考点、分组、连线、碎片：星图的唯一数据源 | 只按数据契约改（见 `README.md` §5） |
| `content/method/*.json` | 方法卡（记忆向量）；`tools/check_methods.py` 校验 | 可以增删，先过 `check_methods.py` |
| `host/` | 宿主半边：`event.js` 事件白名单、`http.js` 两条路由、`store.js` 追加/投影 | 可改，注意 `inject: ['webServer']` |
| `tools/` | 运维脚本：体检、方法卡校验、每日一页生成、docx/PDF、打印、回填、原型导入 | 可改；PowerShell 脚本遵守 §3 编码规则 |
| `daily/` | 每日一页产物（json / html / png / docx / pdf） | 生成物；`pdf/png/docx/html` 不入库，json 可留档 |
| `plan/` | 在校计划案（如 `politics-schedule.md`、未来的 `YYYY-MM-DD.json`） | 可改 |
| `imports/` | 原型 SQLite 的只读快照，git 忽略 | 不要提交、不要并入 seed |
| `locale/`、`icon.svg`、`index.js`、`cordis.patch.yml`、`package.json` | DSH 插件清单与文案 | 谨慎改，改完要重装/刷新 |

数据家目录 `%USERPROFILE%\.dsh\neuro-loop\`（`events-*.jsonl` + `state.json`）是**真实记录**，
不属于仓库：不要删、不要提交、不要为了让测试变绿而清空。

---

## 2. 铁律

1. **不手改 `client.js`，也不手改 `version.json`。** 它们是 `build.py` 的产物。
2. **改完 `src\`（或 `data\seed.json`）必须跑 `python build.py --check`。** 只改 `src` 不重建，页面不会变。
3. **五套测试全绿才算「做完」：**
   `smoke.cjs`、`levels.cjs`、`boot.cjs`、`net.cjs`、`host.mjs`。
   改到 `content/method/` 时还要跑 `python tools/check_methods.py`。
4. **`client.js` 变了之后页面必须刷新。** 本插件没有 HMR；不刷新看到的永远是旧版本。
   刷新后如果侧栏没有「认知巡检」，先跑 `python tools/activate.py` 看 profile 里插件还在不在。
5. **只提交源码、数据、测试、文档。** `client.js`、`version.json`、`daily/` 里的 pdf/png/docx/html、
   `imports/` 都不进 git。

新增/删除 `src/` 模块时，必须同步改 `build.py` 里的 `ORDER` 列表，否则拼包顺序会错。

---

## 3. 已知坑（都是踩过的）

### 3.1 PowerShell 5.1 与 UTF-8

PS 5.1 读**无 BOM** 的脚本时按系统 ANSI（本机 GBK）解码。`.ps1` 里只要有中文，
就可能把引号、括号吃坏，报一串看不懂的语法错误。

- 含中文的 `.ps1`：必须存成 **UTF-8 with BOM**（或用 `utf-8-sig` 写）。
- 更稳的做法：`.ps1` **纯 ASCII**，中文只放在 JSON 里，脚本用
  `[System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)` 读取
  （现行实现见 `tools/make_docx.py`；早期 GDI+ 版本在 `tools/legacy/`）。
- `tools/check_all.ps1` 是纯 ASCII，往里面加中文前先想清楚上面两条。

### 3.2 Canvas 的非有限值

- `ctx.arc()` 收到 `NaN` / `Infinity` 会**静默跳过**，不报错，画面只是少一块 —— 很难发现。
- `ctx.createRadialGradient()` / `createLinearGradient()` 收到非有限值会**抛异常**，
  整个 slot entry 一起白屏。
- 数据进绘图前先过 `isFinite`；`test/smoke.cjs` 的代理上下文会对渐变参数做有限性校验，
  这也是它存在的意义。

### 3.3 打印（EPSON L3250 / spooler）

- **含渐变的页会被 spooler 丢弃**（实测 `printed=0`，状态 `Deleting`）。打印路径只允许：
  实心矩形、1px 线、系统字体文字。不要为了好看加渐变或大面积半透明。
- **队列里卡在 `Printing` 的旧作业会堵死后续所有作业。** 症状是后面的任务一直排队但不走纸。
  处理：清空打印队列 → 必要时重启 Print Spooler 服务 → 再重打。
- 打印前先 `-Preview` 出 PNG 自检；预览和打印共用同一张位图，所见即所得。

### 3.4 其它

- 插件 `inject` 不能写 `{ optional: ['webServer'] }`：loader 会把 `optional` 当服务名等，
  插件永远 pending。写成 `inject: ['webServer']`。
- Windows 控制台是 GBK，`python` 打印中文会显示乱码，但**文件本身是 UTF-8**，
  不要据此判断文件写坏了，用编辑器或 `python -c` 读回确认。
- 插件崩掉会白掉整个 slot entry；`frame` 与 `apply` 都要保留 try/catch。

---

## 4. 提交纪律

- **一次提交只做一件事**：一个 bug、一处版式、一批内容、一次文档更新，不要混在一起。
- 提交信息用**中文一句话**说明改了什么、为什么；需要细节写在正文。
  - 好：`修复 hover 时弧线 NaN 导致整帧跳过`
  - 差：`update`、`fix bug`、`改了一下`
- 提交前必须：`git status` 看清楚 → `powershell -File tools/check_all.ps1` 全绿 → `git add` 明确文件。
- 不提交构建产物与本机记录；不 `git add -A` 之前先确认 `.gitignore` 生效。
- 不做破坏性回滚：要退就用 `git revert`，保留历史。

---

## 5. 验证分级（不可跳级）

| 级别 | 手段 | 证明什么 |
| --- | --- | --- |
| L1 | `python build.py --check` | 能拼包、语法正确 |
| L2 | 五套 node 测试 + `tools/check_methods.py` | 渲染/分层/启动/网络/宿主路由无异常 |
| L3 | 用户真机刷新 + 截图 | 实际观感与手感 |

L3 只能由用户完成：AI 不能自己截图，任何「看起来怎样」都必须等用户确认，
不要连续做第三轮纯视觉调整。

---

## 6. 文档地图

| 想知道 | 看 |
| --- | --- |
| 现在做什么 | `NEXT.md` 顶部 |
| 全部任务与进度 | `TASKS.md`（进度唯一真源） |
| 接下来怎么排 | `ROADMAP.md` |
| 系统设计 / 隐喻与字段 | `DESIGN.md` |
| 数据模型 v2（四层库） | `ENGINE.md` |
| 每日一页版式与语言 | `FORMAT-politics.md` |
| 在校计划与回填 | `PLAN.md` |
| 长期维护 / issue 分工 | `docs/MAINTAIN.md` |
