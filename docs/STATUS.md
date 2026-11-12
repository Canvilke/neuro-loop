# STATUS —— 我们现在到底有什么（2026-11-12 02:55 盘点）

> 一页看清：**能跑的东西**、**只是壳的东西**、**卡住的东西**。
> 每条结论后面跟可复现命令或测试名；没有命令支撑的结论不写。
> 盘点基线：`powershell -NoProfile -ExecutionPolicy Bypass -File tools/check_all.ps1` → **14 passed, 0 failed**（2026-11-12 02:50，本机实测）。

## 1. 能跑、且验证过（九块）

| # | 块 | 状态 | 证据（命令 → 实测结果） |
|---|---|---|---|
| 1 | 客户端插件（星环 / 知识场 / 启动七拍 / 编程台 / 今天 / 控制台 / 导航） | 可用 | `python build.py --check` → client.js 272114 B、build 6b3f734b74f2、node --check ok；`node test/smoke.cjs` → 652 帧 / 48 画布 / 3 注册 / 54 扫描点；`node test/levels.cjs` → 4 块 / 120 帧；`node test/boot.cjs` → 7 阶段按序 / 2 通道 |
| 2 | 宿主路由（7 条） | 可用 | `node test/host.mjs` → **151 条断言**全过；路由表快照 7 条路径 / kind / 注册顺序不变；错误码快照 `.error-codes.txt` 44 个逐行一致 |
| 3 | 领域层 `core/` | 可用 | `node test/core.test.mjs` → 24 条；`node test/legacy.test.mjs` → 5 条（拿 v1 当 oracle 交叉验证） |
| 4 | 存储层 `storage/`（L1 → 投影） | 可用 | `node test/storage.test.mjs` → 8 条全过；一万条事件重建 **596 ms**（断言 < 2 s）；「增量 == 重建」「删库后重建结果一致」两条都在 |
| 5 | 「今天」视图 | 可用 | `node test/host.mjs` 内 10 条 today 断言：排程第 2 天、政治取 4.2 页范围、英语 21–40、数理化各一行、两张纸状态、到期统计 |
| 6 | 维护层（票单 / 总线 / 信箱 / 派票 / 开票） | 可用 | `node test/dispatch.test.mjs` → 42 条；`node test/bus.test.mjs` → 19 条（CLI 与 HTTP 双向一致）；`node test/intake.test.mjs` → 12 条；`node tools/ticket.mjs list` 实时读台账 |
| 7 | 写接口：批量导入与幂等 | 可用 | `node test/host.mjs` 覆盖：批量 ≤200 条逐条校验 + 部分成功；24 h 同键重放不重复记账；同键异载荷 409；错误码快照 44 个不变 |
| 8 | 数据契约与底表 | 可用 | `node tools/check_contract.mjs` → 7 表 / 9 事件 kinds / 字段一致；`python tools/activate.py` → seed 6 科 / 23 组 / 69 考点 / 42 碎片，state rev=6，L1 1 个文件 6 事件，profile 已挂链 |
| 9 | 内容与出纸 | 可用（单页已验） | `daily/` 现有 pol-2026-11-09 / pol-2026-11-10 / en-2026-11-09 / en-2026-11-10 / en-2026-11-11 的 docx+pdf；pypdf 实测 `daily/en-2026-11-11.pdf` = **1 页**；`python tools/check_methods.py --list` → **16 cards valid** |

## 2. 只是壳 / 占位

- **星图数据是脚手架**：`data/seed.json` 69 个考点按教材目录编，未从 `学习资料/` 抽真实考纲（`python tools/activate.py` 只报数量 6/23/69/42，不报来源）。
- **编程台读数是静态占位**：`src/12-code.js:86` 的 `row('r1', 'TOOLS', '18')`、`src/11-boot-view.js:1110` 的 `[['工具','18','TOOLS'],…]` 写死在源码里，没有宿主接口。
- **方法卡全部未审**：`content/method/` 16 个 JSON 实测 `verified===true` 为 **0 张**。
- **语文无材料**：`致远/学习资料/语文/` 为空目录，任何语文页面都不生成。
- **屏上自评未做**：`src/` 内无 `recall` 调用（grep 0 命中），到期复习仍需回星图点 `1`/`2`。

## 3. 卡住

| 卡点 | 证据 | 绕法 |
|---|---|---|
| 打印机物理断链 | `Get-Printer` 只列出 5 个虚拟打印机（OneNote / WPS PDF / XPS / Print to PDF），**没有 EPSON L3250** | 出纸降级为 PDF，`daily/*.pdf` 保留 |
| 主理鱼 watcher | 2026-11-10 记录 `api.github.com` 301 → `github.com`，`gh` 无法校验；本次未复测，按未恢复处理 | 只用 HTTPS 推送；换网络或改走 Gitee |
| 令牌 | 旧令牌曾贴入对话，按安全约定不再读取；无新令牌文件，watcher 未启用 | 新令牌放文件后由用户告知 |
| 微信 → 主会话 | `node tools/bus.mjs pending` → `wx 0`，无微信行；信箱文件通道可用但未实机验证 | 走 `tools/mail.py send --to lead` |
| 热重载 | `grep -rn version.json src` 无命中 → 客户端未接 `version.json` | 改完必须手动刷新（插件无 HMR） |

## 4. 风险（"慢性死亡"的四个入口）

1. **成本**：每轮都要模型 + 工具调用。对策：每日出纸是唯一硬指标，其余为可选；定时任务按需开。
2. **单点**：这台机器 + 这个仓库 + 一个会话。对策：仓库托管（已有）、事件流 append-only（已有）、文档可重建（本文件即为一例）。
3. **验证缺口**：视觉只能靠人看（L3），做不了截图回归。对策：把"看起来对不对"降级为用户每天扫一眼，不追求像素级。
4. **范围膨胀**：前端、库、打印、superagent 四条线同时开。对策：一周只推一条主线（见 `WEEK-01.md`）。

## 5. 目录约定

- `src/` 客户端模块（拼接顺序见 `build.py` 的 `ORDER`）
- `core/` 领域纯函数；`storage/` L1 与 SQLite 投影；`host/` 薄路由与业务视图
- `tools/` 生成、打印、体检脚本；`tools/legacy/` 已被替代的旧渲染器
- `data/seed.json` 走查脚手架；`content/` 方法卡与句型库；`plan/` 排程与底表
- `daily/` 每日产物（JSON/docx/PDF，可重生成）
- 文档：`DESIGN.md`（设计）`ENGINE.md`（四层库）`FORMAT-*.md`（版面契约）`TASKS.md`（进度）`NEXT.md`（当下）`ROADMAP.md`（大范围）`docs/ADR-*.md`（决策）
