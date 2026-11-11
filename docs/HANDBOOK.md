# Neuro-Loop 项目手册

| 项 | 内容 |
|---|---|
| 适用范围 | 本项目全部代码、数据、文档、出纸内容与协作流程 |
| 存放 | 桌面 PDF（正式版）+ `neuro-loop/docs/HANDBOOK.md`（源文件） |
| 更新规则 | 任何改变结构、接口、数据落点、协作规则的提交，必须同步本文件并把版本号加一 |

---

## 1. 项目来源

### 1.1 起点

项目始于 2026-11-08 的一份设计文档（`C:\Users\86152\Desktop\设计文档.doc`），内容是一个"认知巡检"界面的场景描述：倾斜银色星环上分布六颗行星对应六门学科，中央是知识网络，悬停触发引力透镜，行星外沿的暗物质陨石带表示"错题与遗忘"。

同一时期存在一个早期原型：`Untitled-1.py`（41093 B）与 `neuro_loop.db`（40960 B），以及一个三栏面板式网页 `历史存档/frontend.html`。原型包含三张表：

| 表 | 内容 | 行数 |
|---|---|---|
| `params` | 知识点：名称、域、定义、公式、锚点、稳定性 | 8 |
| `connections` | 知识点连线：prereq / derive / contrast / analogy + 注意力权重 | 10 |
| `kv_cache` | 题目与缓存状态：hit / miss / hallucination、失误次数、到期 | 11 |

原型数据是"大模型与人脑同构"理论的演示样本（梯度下降、注意力机制、位置编码等），不是高考考点。该库已于 2026-11-08 以只读方式导出到 `neuro-loop/imports/proto-20261108-143640/`，作为设计参照，未并入正式数据。

### 1.2 理论来源

项目的数据模型来自用户提出的一套同构假设，即把大模型的运行范式映射到学习过程：

| 理论条目 | 映射 |
|---|---|
| 预训练 | 听课、教材、基础作业，决定基座 |
| MLA 特征压缩 | 把知识点压成"核心考点 / 设错陷阱 / 方法判据"三个表征 |
| 推理与 KV 缓存命中 | 考场：熟题命中 vs 新题重推；瓶颈从"补知识"转向"提高命中率与还原速度" |
| 幻觉 / 假阳性 | 粗心与假性掌握：命中率高但准确率低 |
| RLHF + 防灾难性遗忘 | 错题复盘（权重惩罚）+ 间隔重复（遗忘临界点唤醒） |

### 1.3 沿革

|---|---|---|
| 2026-11-08 | 读设计文档，确认实现路线（客户端插件页） | 设计判断、字段映射 |
| 2026-11-08 | 插件 v0.1：星环、行星、知识网、陨石带、悬停透镜 | `client.js` 87 KB |
| 2026-11-08 | 视觉迭代 v2/v3：去廉价文字框、冷色阶、真 3D 星图、底部操控台 | 91→134 KB |
| 2026-11-09 | 启动序列（UEG 风格，七阶段：自检→同步→验证→简报→通道→扫描→跃迁） | `src/10-boot-core.js`、`src/11-boot-view.js` |
| 2026-11-10 | 事件流与投影、今天视图、信箱、总线 | `host/store.js`、`host/service.js`、`storage/` |
| 2026-11-11 | 可持久化维护层：票单、角色契约、控制台、端到端闭环 | `host/team.js`、`tools/ticket.mjs`、`tools/intake.mjs` |
| 2026-11-11 | 分层重写：领域层 / 存储层 / 宿主层分离 | ADR-0001、`core/`、`storage/` |
| 2026-11-12 | 侧边栏收敛为一个入口，内部五页签（今天 / 认知星图 / 控制台 / 编程台 / 导航） | `src/15-hub.js` |

---

## 2. 目标与边界

### 2.1 目标

1. 以"一次判定"为最小数据单位，记录做题时的判断、推理与耗时，而不是收集题目。
2. 知识点、方法、题目三类对象分层存放，方法是跨章节的一等公民。
3. 数据可重建：真源为追加日志，任何派生层损坏均可重建。
4. 每日产出两张可打印的 A4：内容扁平、一页装完、语言客观。
5. 协作可持久化：任务在磁盘上，不依赖单个会话的记忆。

### 2.2 明确不做

- 不做题库型产品：不追求题目数量与刷题量。
- 不显示总分、排名、掌握度分数。
- 不引入前端框架、打包器或第三方运行时依赖。
- 不自动刷新页面、不自动改写用户数据。
- 不在缺少材料时编造学科内容。

### 2.3 硬约束

| 约束 | 说明 |
|---|---|
| 语言 | 面向学生的文字客观、无第二人称、无劝勉语 |
| 版面 | 一页 A4 装完；超页先砍内容，不硬打两页 |
| 打印 | 页面必须扁平（纯色块、细线、文字），含渐变或大面积半透明的页会被驱动丢弃 |
| 数据 | 真源只追加；派生层可删可重建；正文与统计分离 |
| 依赖 | 后端零第三方依赖（Node 内置模块） |

---

## 3. 项目分块

项目按七块划分，每块有唯一负责人、唯一入口、独立验收方式。

| 块 | 名称 | 负责人角色 | 目录 | 完成标准 |
|---|---|---|---|---|
| B1 | 领域层 | core-dev | `core/` | `node --test` 全绿；事件九种形状稳定；不引依赖 |
| B2 | 存储层 | core-dev | `storage/` | 增量与重建结果一致；一万条重建 < 2s |
| B3 | 宿主接口 | host-dev | `host/`、`index.js` | 门禁全绿；错误码快照不变；路由只做校验与转发 |
| B4 | 客户端 | ui-dev | `src/`、`build.py` | 构建通过；smoke 注册数对齐；无内联第三方库 |
| B5 | 内容与出纸 | content | `daily/`、`plan/`、`content/`、`tools/make_docx.py`、`tools/en_page.py` | 一页装完；语言客观；打印链路可验证 |
| B6 | 维护层 | qa | `team/`、`bus/`、`tools/ticket.mjs`、`tools/intake.mjs` | 票单可开可领可验收；总线一致；失忆可恢复 |
| B7 | 文档与验证 | architect | `docs/`、`test/`、`tools/check_all.ps1` | 每项决策有 ADR；门禁 14 项全绿 |

---

## 4. 系统结构

### 4.1 四层单向依赖

```
client（浏览器） → host（HTTP 薄路由） → storage（SQLite 投影 + JSONL 真源） → core（纯函数）
```

依赖只能向右，反向禁止。客户端不直接读数据库；宿主不实现业务规则；存储不改事件形状；领域层不接触 HTTP。

### 4.2 模块清单

| 层 | 文件 | 行数 | 职责 |
|---|---|---|---|
| 领域 | `core/contract.js` | 98 | 事件形状、限制、正则、错误类型 |
| 领域 | `core/events.js` | 254 | 事件归一化、v1 兼容、行编解码 |
| 领域 | `core/metrics.js` | 133 | 命中率、准确率、间隔、缓存状态 |
| 领域 | `core/state.js` | 258 | 投影折叠、重建、汇总、增量入口 |
| 存储 | `storage/events.js` | 150 | 追加日志读写、坏行计数 |
| 存储 | `storage/projection.js` | 260 | SQLite 六表、增量与整体重建 |
| 存储 | `storage/legacy.js` | 95 | v1 短字段兼容 |
| 宿主 | `index.js` | 69 | 路由注册 |
| 宿主 | `host/handlers/*.js` | 310 | 六个路由处理（state / event / mail / today / team / bus） |
| 宿主 | `host/service.js` | 189 | 一致性校验、视图、写路径 |
| 宿主 | `host/team.js` / `host/today.js` / `host/bus.js` / `host/mail.js` | 233 / 175 / — / 103 | 票单、今天视图、总线、信箱 |
| 宿主 | `host/idempotency.js` | 160 | 幂等键 24h 重放 |
| 客户端 | `src/*.js`（18 个文件） | 约 6400 | 星图、启动序列、背景、特效、仪表盘、今天、控制台、编程台、总入口 |
| 构建 | `build.py` | 96 | 拼接源码、生成 `client.js` 与 `version.json` |

### 4.3 请求路径

1. 浏览器加载 `client.js`，向宿主注册一个侧边栏图标与一个主面板。
2. 客户端按需 `GET /neuroloop/state`、`/neuroloop/today`、`/neuroloop/team`、`/neuroloop/bus`。
3. 写入走 `POST /neuroloop/event`：先校验 → 追加 L1 → 更新投影 → 回写视图。
4. 客户端合并投影、刷新界面，失败进入本地队列，恢复后补发。

---

## 5. 数据与存储

### 5.1 分层

| 层 | 实现 | 位置 | 丢失后果 |
|---|---|---|---|
| L0 静态星图 | JSON | `neuro-loop/data/seed.json` | 脚手架丢失，可重建（占位数据） |
| L1 事件流（真源） | JSONL，只追加 | `%USERPROFILE%\.dsh\neuro-loop\events-YYYY-MM.jsonl` | 不可恢复，必须备份 |
| L2 投影 | SQLite（`node:sqlite`，WAL） | `%USERPROFILE%\.dsh\neuro-loop\projection.db` | 可整体重建 |
| L3 视图 | JSON（原子写） | `%USERPROFILE%\.dsh\neuro-loop\state.json` | 可重建 |
| 内容正文 | 文件 | `neuro-loop/content/{method,problem,point,material}/` | 需备份（正文不在库里） |
| 计划与排程 | JSON / Markdown | `neuro-loop/plan/` | 可重排 |
| 每日页面 | docx / pdf | `neuro-loop/daily/` | 可重生成 |

### 5.2 事件

九种：`attempt`、`problem.new`、`problem.edit`、`method.new`、`method.edit`、`daily`、`flatten`、`unflatten`、`note`。

`attempt` 是核心，字段含：知识点 id、方法 id、`recall`（是否命中）、`solve`（推理是否成立）、`durationMs`（还原耗时）、`mode`。命中率高而 `solve` 失败即假阳性，是系统要报警的对象。

### 5.3 投影表

七表：`meta`、`concepts`、`methods`、`daily`、`flattened`、`problems`、`notes`。`meta.rev` 等于事件条数，用于判断是否需要重建。概念表只存计数与到期时间，不存"掌握度"。

### 5.4 协作日志

`bus/bus.jsonl`（总线）、`team/tickets.jsonl`（票单）、`%USERPROFILE%\.dsh\neuro-loop\mail\`（信箱）。三者都是追加型文本，不进数据库，便于人工查看与 git 追踪。

### 5.5 备份与恢复

- 备份：`cp -r "$USERPROFILE/.dsh/neuro-loop/." neuro-loop/backup/<日期>/`（已有一个 2026-11-10 的快照）。
- 恢复三步：确认 L1 存在 → 删除 `projection.db` 与 `state.json` → 调用一次读接口触发的整体重建。
- 数据与内容分离：库里只有 id 与统计，题干与解析正文在 `content/`，删除投影不会丢正文。

---

## 6. 进展台账

### 6.1 里程碑

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1–M5 | 星图骨架、视觉迭代、启动序列、仪表盘、分层知识点 | 完成 |
| M6 | 启动序列七阶段、样式集、背景与特效模块 | 完成（视觉验收以用户截图为准） |
| M7 | 事件流、路由、相位调度、原型库导入 | 完成 |
| M8 | 方法卡、每日一页、自评闭环、任务提示块 | 数据层完成，内容持续补充 |
| M9 | 数据模型 v2 参考研究与实施计划 | 完成（`docs/RESEARCH-PLAN.pdf`，8 页） |
| M10 | 领域层重写 | 完成（24 条测试） |
| M11 | 存储层与宿主切换 | 完成（8 条存储测试，一万条重建 535ms） |
| M12 | 多子代理维护性：票单、总线、端到端闭环 | 完成主体，余 T-0004 待做 |

### 6.2 票单

| 票 | 角色 | 内容 | 状态 |
|---|---|---|---|
| T-0001 | host-dev | 路由统一外壳与 limit 裁剪 | done |
| T-0002 | core-dev | 批量导入 ≤200 条、逐条校验 | done |
| T-0003 | ui-dev | 控制台可操作（claim / done） | done |
| T-0005 | content | 演示票（被覆盖） | blocked |
| T-0006 | ui-dev | 控制台显示总线未读 | done |
| T-0007 | host-dev | 派票作业书带总线指令 | done |
| T-0008 | core-dev | v1 行 `ok` 字段兼容 0 / 字符串 | done |
| T-0009 | host-dev | 拆路由，`index.js` 329→69 行 | done |
| T-0010 | core-dev | 写接口幂等键 | done |
| T-0011 | architect | 数据契约 `docs/DATA.md` | done |
| T-0004 | qa | 写域冲突提示的回归 | ready |

### 6.3 验证

门禁共 14 项，串行执行并带目录锁（避免两个 agent 同时重建产物）：

| # | 项 | 依据 |
|---|---|---|
| 1 | 构建 | `python build.py --check` |
| 2 | 界面冒烟 | `test/smoke.cjs`（652 帧、48 画布、3 注册） |
| 3 | 分层视图 | `test/levels.cjs` |
| 4 | 启动序列 | `test/boot.cjs`（七阶段按序） |
| 5 | 网络队列 | `test/net.cjs`（25 条） |
| 6 | 宿主契约 | `test/host.mjs`（151 条断言、44 个错误码快照） |
| 7 | 领域层 | `test/core.test.mjs`（24 条） |
| 8 | 旧数据兼容 | `test/legacy.test.mjs` |
| 9 | 存储层 | `test/storage.test.mjs`（含一万条重建） |
| 10 | 派票 | `test/dispatch.test.mjs`（32 条） |
| 11 | 总线 | `test/bus.test.mjs`（19 条） |
| 12 | 入口开票 | `test/intake.test.mjs`（12 条） |
| 13 | 数据契约 | `tools/check_contract.mjs` |
| 14 | 环境自检 | `tools/activate.py` |

### 6.4 提交

最近提交（本地 `main`）：`e78278b` 导航页签 → `a2e0681` 侧边栏收敛 → `4ce0f1c` 长期对话开场白 → `f886cfa` / `5dba4d7` 幂等 → `af00a76` 拆路由与数据契约 → `33c3021` / `878ed66` / `490fba7` / `ca483f3` / `4f6c33b` / `1c88c0d`。

远端 `https://github.com/Canvilke/neuro-loop`，`main` 分支。推送偶发 `Connection was reset`，本地提交不丢，网络恢复后补推。

---

## 7. 角色与任务分配

六个角色，契约写在 `team/roles.json`，详细职责见同目录 `ROLES.md`。

| 角色 | 中文名 | 负责块 | 主要目录 |
|---|---|---|---|
| architect | 架构 | B7 | `docs/`、`AGENTS.md`、`README.md` |
| core-dev | 领域层 | B1、B2 | `core/`、`storage/` |
| host-dev | 宿主层 | B3 | `host/`、`index.js` |
| ui-dev | 界面 | B4 | `src/`、`build.py` |
| content | 内容 | B5 | `daily/`、`plan/`、`content/` |
| qa | 验证 | B6 | `test/`、`tools/check_all.ps1`、`team/`、`bus/` |

分配原则：一票一人一写域；同一文件的修改权只属于其负责角色；跨块改动必须由架构角色开票并在票面写明理由。

---

## 8. 通讯约定

### 8.1 三条通道

| 通道 | 用途 | 载体 |
|---|---|---|
| 票单 | 任务本身：谁做、做什么、验收标准 | `team/tickets.jsonl` + `tools/ticket.mjs` |
| 总线 | 过程与结论：交付、报警、仓库事件、微信转发 | `bus/bus.jsonl` + `tools/bus.mjs` |
| 信箱 | 一对一留言，适合较长说明 | `tools/mail.py` |

### 8.2 总线约定

四条 lane：`sub`（子代理交付）、`repo`（仓库与票单事件）、`wx`（微信进出）、`note`（备忘）。

- 一条消息只表达一件事，控制在 400 字以内。
- 交付必须带四要素：票号、改了什么、验证结果、遗留问题。
- 结论性消息用 `ref` 指向票号或上一次消息 id，便于串联。
- 阅读方用 `ack` 标记已读；`ack` 只追加，不改历史。

### 8.3 开工与收工

开工三步：`node tools/ticket.mjs list` → `node tools/bus.mjs pending` → 读 `NEXT.md` 顶部三行。

收工三行：票号与结果、门禁是否全绿、下一次接手要从哪继续。

### 8.4 失忆恢复

任何会话中断后，不依赖记忆，按以下顺序恢复：`ticket.mjs list --all` 看全局 → `bus.mjs tail --limit 20` 看最近进展 → `tools/activate.py` 确认环境与产物一致。

---

## 9. 夜间执行范围

用户夜间不在场，执行侧由定时任务与本会话推进。为保证互不影响，约定如下。

### 9.1 时间窗

| 时段 | 允许的事 |
|---|---|
| 00:00–07:00 | 只做票单内的事；不打印；不改前端视觉 |
| 07:00 之后 | 允许出纸（晨间任务）；仍不做视觉迭代 |
| 白天（用户在） | 任何改动先开票 |

### 9.2 写域与并发

- 一个时刻最多两个执行者；两者的 scope 不得相交（`tools/ticket.mjs new` 会提示冲突）。
- 共享产物 `client.js`、`projection.db`、`state.json` 只允许由门禁或宿主单一路径生成，禁止手改。
- 门禁带目录锁，两个执行者同时跑会自动串行；锁超过 900 秒视为陈旧可抢占。

### 9.3 提交与推送

- 只有主会话（lead）拥有提交权；子代理只改文件、跑测试、发总线消息。
- 提交信息必须带票号；一次提交只覆盖一张票。
- 推送失败最多重试两次，仍失败则写入 `NEXT.md`，不在夜间反复试。

### 9.4 停机条件

出现以下任一情况立即停止并记录，不自行绕过：门禁连续两次失败且原因不明；涉及删除数据或改写 L1；需要安装依赖或修改系统设置；需要用户口令或账户操作。

### 9.5 用户在场时的约定

用户回到电脑前时，执行侧立即切换为"停手待命"：不自动改文件、不自动打印、不自动提交；一切改动先由用户确认或开票。已开始的票若未完成，写清停在哪一步，不留半成品在工作区（未完成的编辑器状态一律回滚或提交到分支）。

### 9.6 多个长期会话并发

- 每个会话只写自己的块（见第 3 节分块表），跨块需求通过开票，不直接改别人的目录。
- 同一时刻最多两个会话处于"可写"状态；其余只读。
- 会话之间的沟通只走总线：交付发 `sub` lane，求助发 `note` lane，不私下拉群、不互相 @。
- 任何会话都不得执行 `git commit` / `git push`；提交权只在主会话。

### 9.7 次日汇报格式

`NEXT.md` 顶部固定三行：当前本地提交、门禁状态、下一件事。详细记录留在票单与总线，不写进汇报。

---

## 10. 新会话接入

每个专项负责人使用一个长期会话，共六个：architect / core-dev / host-dev / ui-dev / content / qa。接入步骤：

1. 新建会话，工作目录设为 `C:\Users\86152\Desktop\致远`。
2. 粘贴 `docs/BOOTSTRAP.md` 中对应角色的开场白（第六节为 Lead 自用，其余六段分给六个会话）。
3. 该会话按"开工三步"自检，然后 `node tools/ticket.mjs next --role <角色>` 领票。

接入后该会话的权限边界：只读其他块、只写自己块、只跑门禁不提交。跨块需求通过开票解决，不直接改别人的文件。若某角色暂无票，会话应回"无票待命"并停止，不要自行找活。

---

## 11. 风险与未完成项

| 风险 | 现状 | 处置 |
|---|---|---|
| 打印机物理断链 | USB 设备不枚举（`CM_PROB_PHANTOM`） | 恢复后补打；出纸逻辑已做失败降级到 PDF |
| GitHub API 被改写 | `api.github.com` 301 → `github.com`，`gh` 无法校验令牌 | 只用 HTTPS 推送；watcher 暂不可用 |
| 令牌暴露 | 曾贴入对话 | 建议作废重发，改为文件读取 |
| 方法卡未审核 | 10 张全部 `verified:false` | 需用户逐张确认后升为 `self` |
| 静态星图是脚手架 | `data/seed.json` 六科 69 个考点为占位 | 待按教材重建 |
| 启动视图文件过大 | `src/11-boot-view.js` 1223 行 | 下一次重构候选 |
| 自动派发未做 | 派票仍需人工触发 | 见 `docs/END-TO-END.md` 未做清单 |

---

## 12. 附录

### 12.1 命令速查

```
python build.py --check                     # 构建与语法检查
powershell -File tools/check_all.ps1        # 门禁 14 项
node tools/ticket.mjs list [--all]          # 看板
node tools/ticket.mjs next --role core-dev  # 领票
node tools/ticket.mjs brief T-0001          # 生成作业书
node tools/bus.mjs pending                  # 未读
node tools/bus.mjs tail --limit 20          # 最近消息
python tools/mail.py check --to lead        # 信箱
python tools/activate.py --test             # 十秒体检
```

### 12.2 路径速查

| 用途 | 路径 |
|---|---|
| 项目根 | `C:\Users\86152\Desktop\致远\neuro-loop` |
| 数据真源 | `%USERPROFILE%\.dsh\neuro-loop\events-YYYY-MM.jsonl` |
| 投影与视图 | `%USERPROFILE%\.dsh\neuro-loop\projection.db`、`state.json` |
| 学习资料 | `C:\Users\86152\Desktop\致远\学习资料\` |
| 每日页面 | `neuro-loop\daily\` |
| 计划与排程 | `neuro-loop\plan\` |

### 12.3 桌面整理记录（2026-11-12）

桌面已整理：15 个文件按类归入 `致远/桌面归档-2026-11-12/`（原型、旧项目、安装包、备份、杂项）与 `致远/学习资料/化学/`；桌面只保留工作区、本次两份 PDF、三个启动器与系统快捷方式。逐文件去向见 `致远/桌面归档-2026-11-12/归档清单.md`。

### 12.4 术语

| 术语 | 含义 |
|---|---|
| 判定 | 一次做题时的判断与结果，系统的最小单位 |
| 假阳性 | 命中率高但推理不成立，考场容易翻车 |
| 方法卡 | 跨章节的可迁移解题方法，含判据与实例 |
| 投影 | 由事件流计算出的当前状态，可重建 |
| 票 | 一件可验收的工作，含写域与验收标准 |
| 总线 | 追加型协作日志，四条 lane |
