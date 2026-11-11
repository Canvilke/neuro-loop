# DATA —— 数据契约

本文回答三个问题：**这一行数据是谁写的、谁在读、删了会怎样。**

适用范围：`%USERPROFILE%\.dsh\neuro-loop\` 下的运行时数据，以及仓库内的协作日志。
代码位置以仓库根 `neuro-loop/` 为基准。字段与事件名以 `core/contract.js`、`storage/projection.js` 的代码为准；`tools/check_contract.mjs` 会逐项比对本文声明，不一致时退出码为 1。

---

## 1. 两层结构

| 层 | 文件 | 性质 | 丢失后果 |
|---|---|---|---|
| L1 事件流 | `%USERPROFILE%\.dsh\neuro-loop\events-YYYY-MM.jsonl` | 只追加，唯一真源 | **不可自动恢复**。只能从备份恢复；手工重写会改变历史 |
| L2 投影库 | `%USERPROFILE%\.dsh\neuro-loop\projection.db`（含 `-wal` / `-shm`） | SQLite 索引，可丢弃 | 下次宿主打开时从 L1 全量重建 |
| L2 快照 | `%USERPROFILE%\.dsh\neuro-loop\state.json` | 人眼可读的投影副本 | 可删除；下一次 `getState` 或重建时补写 |

另有 `%USERPROFILE%\.dsh\neuro-loop\imports\`：外部导入的只读快照，不并入 L1，也不参与重放。它可以单独删除，前提是原始导入文件仍在。

### 1.1 L1 事件流（真源）

- 路径：`storage/events.js` 的 `rootDir()` 决定。默认 `os.homedir()/.dsh/neuro-loop`；设置 `NEUROLOOP_HOME` 时整个数据根改用该目录（测试用）。
- 文件：`events-YYYY-MM.jsonl`，按事件 `at` 的**本地时区**年月切分（`storage/events.js:46-51`）。
- 格式：一行一条 JSON。每行是 `core/events.js` 规范化后的 v2 事件（`v: 2`）；历史 v1 短字段行仍保留原样，读取时适配（见第 4 节）。
- 写：宿主 `host/service.js` 的 `addEvent()` → `storage/events.append()`，`fs.appendFileSync`，只追加。先落 L1，再改投影，最后写 `state.json`（`host/service.js:151-170`）。
- 读：`storage/events.readAll()` 按月文件名升序读全部行；坏行/截断行只计数（`bad`），不抛错。`core/state.rebuild()`、`storage/projection.rebuild()`、`host/service.db()` 都从这里取数据。
- 删除：不允许。删掉即永久丢失对应历史；`state.json` 与 `projection.db` 都无法反向恢复 L1（投影不保存全量字段，见第 3 节）。
- 备份：直接复制整个数据目录；复制前先停宿主，避免 SQLite 的 `-wal` 与主库不一致。

### 1.2 projection.db（可丢弃的索引）

- 路径：`host/service.js:32`，固定为数据根下的 `projection.db`。
- 打开：`storage/projection.openDb()` 建表，写 `PRAGMA journal_mode = WAL`、`synchronous = NORMAL`，并把 `SCHEMA_VERSION` 写入 `meta.schemaVersion`。
- 同步规则：`host/service.db()` 读 L1 得到事件条数，与 `meta.rev` 比较；**不相等就全量重建**（`host/service.js:37-46`）。相等时只更新 `meta.badLines`。
- 写：增量路径 `host/service.addEvent()` → `storage/projection.applyIncremental()`；重建路径 `storage/projection.rebuild()`。
- 读：`host/service.view()` 把表读成客户端视图；`/neuroloop/state` 返回这个视图；`storage/projection.dueList()` 提供到期查询。
- 删除：安全。删 `projection.db`、`projection.db-wal`、`projection.db-shm` 后，下一次打开会从 L1 重建。
- 注意：`meta.schemaVersion` 当前只写不校验；升级表结构必须手工删库重建（见 4.3）。

### 1.3 state.json（客户端视图快照）

- 路径：`host/service.saveState()`，数据根下的 `state.json`；先写 `state.json.tmp` 再 `rename`（`host/service.js:172-181`）。
- 形状：`version / rev / events / badLines / updatedAt / nodes / flattened / daily / methods / storage`（`host/service.view()`）。
- 写：每次成功追加事件后由 `addEvent()` 覆盖；`getState()` 发现文件缺失时补写。
- 读：人眼、备份工具、`host/store.js` 的旧兼容读路径（`loadState()`）。**它不是接口**：客户端走 `/neuroloop/state`，宿主从 `projection.db` 生成视图，不依赖这个文件。
- 删除：安全。下一次 `getState()` 或重建会补写。
- 注意：`nodes` 每项带 `hitRate` 等派生量，这些值由 `core/metrics.js` 计算，不单独入库。

---

## 2. 事件（9 种）

白名单来自 `core/contract.js` 的 `EVENT_KINDS`。新增事件类型必须同时改 `contract.js`、`core/events.js`、`core/state.js`、`storage/projection.js` 和测试（ADR-0001 D6）。

**公共外壳**（九种事件都有）：

| 字段 | 说明 |
|---|---|
| `v` | 事件格式版本；新写一律为 `EVENT_VERSION`（当前 2） |
| `id` | 8–20 位小写字母数字。调用方不传时，由 `at` 与事件体做 FNV-1a 派生 12 位（`core/events.js:53-57`） |
| `at` | ISO 8601 UTC 时间；缺省取写入时刻 |
| `kind` | 事件类型，必须是 `EVENT_KINDS` 之一 |

未知 `kind` 在 `normalizeEvent()` 抛 `DomainError('bad-kind')`；磁盘上的坏行在读取时转为坏行计数，不阻断后续行。

### 2.1 `attempt`

| 项 | 值 |
|---|---|
| 必填字段 | `concept`、`recall` |
| 可选字段 | `solve`（`ok`/`fail`/null）、`methods`（≤3 个 `m.*`）、`problem`（`p.*`）、`durationMs`（0–3600000）、`note`（≤400，超出截断）、`at`、`id` |
| 谁写 | 宿主 `POST /neuroloop/event`（单条）与 `POST /neuroloop/events`（批量 ≤200）；客户端离线队列重放也走同一路由 |
| 谁读 | `core/events.normalizeEvent()` 校验；`core/state.applyEvent()` 折叠；`storage/projection.applyIncremental()` 写 `concepts`/`methods`；`tools/core_verify.mjs` 对账 |
| 幂等性 | **否**。L1 只追加，每来一条 `attempts` 就 +1；同一请求重放会重复计数。`id` 由 `at` 与事件体决定，同内容同 id，但当前写入路径不按 id 去重（幂等键见票 T-0010） |
| 备注 | `recall=hit` 且 `solve=fail` 记为假阳性 `fp`；`methods` 同时增加对应方法的 `uses/ok/fail` |

### 2.2 `problem.new`

| 项 | 值 |
|---|---|
| 必填字段 | `id`、`subject`、`concepts` |
| 可选字段 | `methods`（≤3）、`difficulty`（1–5，默认 3）、`source`、`text`、`answer`、`at` |
| 谁写 | 内容流水线或导入脚本，经 `POST /neuroloop/events`；`id` 形如 `p.2026-11-10.001` |
| 谁读 | `core/state.applyEvent()` 建 `problems` 桶；`storage/projection.applyIncremental()` UPSERT `problems` 表 |
| 幂等性 | 投影**按 id 幂等**：重复写同 id 会覆盖同名字段；L1 仍会留下多行。`status` 初始为 `open` |

### 2.3 `problem.edit`

| 项 | 值 |
|---|---|
| 必填字段 | `id`、`patch` |
| 可选字段 | `patch.status`（`open`/`done`/`dropped`）、`patch.text`、`patch.note`；至少给一个 |
| 谁写 | 客户端「完成 / 放弃」题目，经 `POST /neuroloop/event` |
| 谁读 | `core/state.applyEvent()` 合并到 `problems[id]`；`storage/projection.applyIncremental()` 更新 `problems.status` 与 `problems.text` |
| 幂等性 | **是**（同一 id 同一 patch 重复应用结果相同）。注意：`patch.note` 只进内存 `state`，`problems` 表没有 `note` 列，重建后不会保留在投影里（L1 事件仍保留） |

### 2.4 `method.new`

| 项 | 值 |
|---|---|
| 必填字段 | `id`、`claim`、`judge` |
| 可选字段 | `steps`（≤12）、`instances`（≤8）、`traps`（≤8）、`points`（≤12 个 `concept`）、`source`（`self`/`ai`，默认 `ai`）、`verified`（默认 false）、`confidence`（默认 0.7）、`at` |
| 谁写 | 内容流水线（`content/method/*.json`）或经 `POST /neuroloop/events` 手工补录 |
| 谁读 | `core/state.applyEvent()` 建方法桶；`storage/projection.applyIncremental()` UPSERT `methods` 表 |
| 幂等性 | 投影**按 id 幂等**（字段覆盖）。**不要用它更新已存在的方法**：`core/state.js` 遇 `method.new` 会把 `uses/ok/fail` 归零，而 SQLite 的 UPSERT 保留计数，两条路径会分叉；更新请用 `method.edit` |

### 2.5 `method.edit`

| 项 | 值 |
|---|---|
| 必填字段 | `id`、`patch` |
| 可选字段 | `patch.claim`、`patch.judge`、`patch.verified`、`patch.note`；至少给一个 |
| 谁写 | 方法卡审核入口（人工把 `verified` 置 true）或内容流水线 |
| 谁读 | `core/state.applyEvent()` 合并；`storage/projection.applyIncremental()` 更新 `claim`/`judge`/`verified` |
| 幂等性 | **是**。`patch.note` 与 2.3 同理：只在内存 state，投影表无此列 |

### 2.6 `daily`

| 项 | 值 |
|---|---|
| 必填字段 | `date`、`subject` |
| 可选字段 | `minutes`（0–600，默认 0）、`wrong`（题号整数数组，1–99，≤50）、`blocked`（字符串，≤400，超出截断）、`note`（≤400）、`at` |
| 谁写 | 客户端「今天」面板勾选完/半/未，经 `POST /neuroloop/event` |
| 谁读 | `core/state.applyEvent()`；`storage/projection.applyIncremental()` 按 `(date, subject)` UPSERT |
| 幂等性 | 投影**是**（同一天同一科后写覆盖先写）；L1 **否**（每次勾选都留一行）。`subject` 必须是 `chinese/math/english/physics/chemistry/politics` 之一 |

### 2.7 `flatten`

| 项 | 值 |
|---|---|
| 必填字段 | `shard` |
| 可选字段 | `at` |
| 谁写 | 客户端「磨平」操作 |
| 谁读 | `core/state.applyEvent()` 置 `flattened[shard] = true`；`storage/projection.applyIncremental()` UPSERT `flattened` |
| 幂等性 | **是**（按 shard UPSERT，重复磨平只更新 `at`） |

### 2.8 `unflatten`

| 项 | 值 |
|---|---|
| 必填字段 | `shard` |
| 可选字段 | `at` |
| 谁写 | 客户端「取消磨平」 |
| 谁读 | `core/state.applyEvent()` 删除键；`storage/projection.applyIncremental()` 删除 `flattened` 行 |
| 幂等性 | **是**（删除不存在的 shard 是空操作） |

### 2.9 `note`

| 项 | 值 |
|---|---|
| 必填字段 | `text` |
| 可选字段 | `subject`（六科之一）、`ref`（≤80，如 `p.2026-11-10.001`）、`at` |
| 谁写 | 任何经 `POST /neuroloop/event` 的调用方；也用于方法卡与题目的文字补充 |
| 谁读 | `core/state.applyEvent()` 的 `notes` 数组（只保留最近 500 条，`core/state.js:19-20`）；`storage/projection.applyIncremental()` 的 `notes` 表（不设上限） |
| 幂等性 | **否**。每次追加一行事件、一条投影记录；重复发送会得到多条备注 |

---

## 3. 投影表（7 张）

`storage/projection.js:20-51` 的 `SCHEMA` 建 7 张表：6 张业务表（`concepts/methods/daily/flattened/problems/notes`）+ 1 张元数据表 `meta`。
所有业务字段都可由 L1 重建；但投影**只存 UI 需要的字段**，不是 L1 的完整副本，不能用它反向恢复事件。

> `meta` 表之外的业务表由 `storage/projection.dump()` 导出（不含 `meta`）。`notes` 的 `AUTOINCREMENT` 会生成内部表 `sqlite_sequence`，不属于契约。

### 3.1 `meta`

| 字段 | 类型与约束 | 来源事件 | 可丢 | 索引 |
|---|---|---|---|---|
| `key` | TEXT PRIMARY KEY | 代码写入，无事件：`schemaVersion`（`openDb`）、`rev`/`updatedAt`（`rebuild`）、`badLines`（`db()`） | 可（重建时写回） | 主键 |
| `value` | TEXT | 同上；`rev` 等于 L1 事件条数 | 可（重建时写回） | — |

### 3.2 `concepts`

| 字段 | 类型与约束 | 来源事件 | 可丢 | 索引 |
|---|---|---|---|---|
| `id` | TEXT PRIMARY KEY | `attempt.concept` | 可（由 `attempt` 重建） | 主键 |
| `attempts` | INTEGER NOT NULL DEFAULT 0 | 每条 `attempt` +1 | 可（由 `attempt` 重建） | — |
| `hits` | INTEGER NOT NULL DEFAULT 0 | `attempt.recall = hit` +1 | 可（由 `attempt` 重建） | — |
| `misses` | INTEGER NOT NULL DEFAULT 0 | `attempt.recall = miss` +1 | 可（由 `attempt` 重建） | — |
| `recon` | INTEGER NOT NULL DEFAULT 0 | `attempt.recall = recon` +1 | 可（由 `attempt` 重建） | — |
| `solve_ok` | INTEGER NOT NULL DEFAULT 0 | `attempt.solve = ok` +1 | 可（由 `attempt` 重建） | — |
| `solve_fail` | INTEGER NOT NULL DEFAULT 0 | `attempt.solve = fail` +1 | 可（由 `attempt` 重建） | — |
| `fp` | INTEGER NOT NULL DEFAULT 0 | `recall = hit` 且 `solve = fail` +1 | 可（由 `attempt` 重建） | — |
| `streak` | INTEGER NOT NULL DEFAULT 0 | 连续「有效命中」次数；失败归零 | 可（由 `attempt` 重建） | — |
| `duration_ms` | INTEGER NOT NULL DEFAULT 0 | 累加 `attempt.durationMs` | 可（由 `attempt` 重建） | — |
| `last_at` | TEXT | 最后一次 `attempt.at` | 可（由 `attempt` 重建） | — |
| `due_at` | TEXT | `dueAt(last_at, intervalDays(streak, ok))` | 可（由 `attempt` 重建） | `idx_concepts_due(due_at)` |

### 3.3 `methods`

| 字段 | 类型与约束 | 来源事件 | 可丢 | 索引 |
|---|---|---|---|---|
| `id` | TEXT PRIMARY KEY | `method.new.id` | 可（由 `method.*` 重建） | 主键 |
| `claim` | TEXT | `method.new.claim` / `method.edit.patch.claim` | 可（由 `method.*` 重建） | — |
| `judge` | TEXT | `method.new.judge` / `method.edit.patch.judge` | 可（由 `method.*` 重建） | — |
| `source` | TEXT | `method.new.source`（默认 `ai`；`attempt` 自动建方法时为 `ai`） | 可（由 `method.*` 重建） | — |
| `verified` | INTEGER NOT NULL DEFAULT 0 | `method.new.verified` / `method.edit.patch.verified` | 可（由 `method.*` 重建） | — |
| `uses` | INTEGER NOT NULL DEFAULT 0 | 每条带该方法 id 的 `attempt` +1 | 可（由 `attempt` 重建） | — |
| `ok` | INTEGER NOT NULL DEFAULT 0 | 该方法参与的 `attempt` 中 `ok=true` 的条数 | 可（由 `attempt` 重建） | — |
| `fail` | INTEGER NOT NULL DEFAULT 0 | 同上，`ok=false` 的条数 | 可（由 `attempt` 重建） | — |
| `last_at` | TEXT | 最后一次使用该方法的 `attempt.at` | 可（由 `attempt` 重建） | — |
| `points_json` | TEXT | `method.new.points` 的 JSON 数组 | 可（由 `method.*` 重建） | — |
| `traps_json` | TEXT | `method.new.traps` 的 JSON 数组 | 可（由 `method.*` 重建） | — |

### 3.4 `daily`

| 字段 | 类型与约束 | 来源事件 | 可丢 | 索引 |
|---|---|---|---|---|
| `date` | TEXT NOT NULL | `daily.date` | 可（由 `daily` 重建） | 联合主键 + `idx_daily_date(date)` |
| `subject` | TEXT NOT NULL | `daily.subject` | 可（由 `daily` 重建） | 联合主键 |
| `minutes` | INTEGER NOT NULL DEFAULT 0 | `daily.minutes` | 可（由 `daily` 重建） | — |
| `wrong_json` | TEXT | `daily.wrong` 的 JSON 数组 | 可（由 `daily` 重建） | — |
| `blocked` | TEXT NOT NULL DEFAULT '' | `daily.blocked` | 可（由 `daily` 重建） | — |
| `note` | TEXT | `daily.note` | 可（由 `daily` 重建） | — |
| `at` | TEXT | `daily.at` | 可（由 `daily` 重建） | — |

主键：`PRIMARY KEY(date, subject)`。同一天同一科只有一行，后写覆盖先写。

### 3.5 `flattened`

| 字段 | 类型与约束 | 来源事件 | 可丢 | 索引 |
|---|---|---|---|---|
| `shard` | TEXT PRIMARY KEY | `flatten.shard`；`unflatten` 删行 | 可（由 `flatten`/`unflatten` 重建） | 主键 |
| `at` | TEXT | 最后一次 `flatten.at` | 可（由 `flatten` 重建） | — |

### 3.6 `problems`

| 字段 | 类型与约束 | 来源事件 | 可丢 | 索引 |
|---|---|---|---|---|
| `id` | TEXT PRIMARY KEY | `problem.new.id` | 可（由 `problem.*` 重建） | 主键 |
| `subject` | TEXT | `problem.new.subject` | 可（由 `problem.*` 重建） | — |
| `status` | TEXT | `problem.new` 初始 `open`；`problem.edit.patch.status` 更新 | 可（由 `problem.*` 重建） | — |
| `difficulty` | INTEGER | `problem.new.difficulty`（默认 3） | 可（由 `problem.*` 重建） | — |
| `concepts_json` | TEXT | `problem.new.concepts` 的 JSON 数组 | 可（由 `problem.*` 重建） | — |
| `methods_json` | TEXT | `problem.new.methods` 的 JSON 数组 | 可（由 `problem.*` 重建） | — |
| `text` | TEXT | `problem.new.text` / `problem.edit.patch.text` | 可（由 `problem.*` 重建） | — |
| `at` | TEXT | `problem.new.at`，不随 edit 更新 | 可（由 `problem.*` 重建） | — |

注意：`problem.new.source`、`problem.new.answer`、`problem.edit.patch.note` 不进入这张表；它们只存在于 L1 与内存 `state`（`answer`/`source` 在 `core/state.js`，`note` 只在 `problem.edit` 的 `patch` 里）。

### 3.7 `notes`

| 字段 | 类型与约束 | 来源事件 | 可丢 | 索引 |
|---|---|---|---|---|
| `seq` | INTEGER PRIMARY KEY AUTOINCREMENT | 插入顺序生成，无事件字段 | 可（重建后按事件顺序重排） | 主键 |
| `at` | TEXT | `note.at` | 可（由 `note` 重建） | — |
| `text` | TEXT | `note.text` | 可（由 `note` 重建） | — |
| `subject` | TEXT | `note.subject` | 可（由 `note` 重建） | — |
| `ref` | TEXT | `note.ref` | 可（由 `note` 重建） | — |

`notes` 表不设条数上限；`core/state.js` 的内存视图只保留最近 500 条（`NOTE_CAP`），两者行为不同。

---

## 4. 版本与迁移

### 4.1 当前版本

当前值：`EVENT_VERSION = 2`，`SCHEMA_VERSION = 2`。

| 常量 | 值 | 定义处 | 作用 |
|---|---|---|---|
| `EVENT_VERSION` | 2 | `core/contract.js:10` | 新写事件的 `v` 字段 |
| `SCHEMA_VERSION` | 2 | `core/contract.js:13` | 写入 `projection.db` 的 `meta.schemaVersion` |
| `VIEW_VERSION` | 2 | `host/service.js:21` | 客户端视图形状版本，与上面两个独立 |

版本是单向的：只从旧升到新，不提供降级写路径。

### 4.2 v1 → v2 映射

v1 行是短字段：`{k,t,n,ok,d,s,min,w,blk,note}`。磁盘上的历史行原样保留，读取时由 `storage/legacy.fromLegacy()` 翻译成 v2 原始事件，再交给 `core/events.normalizeEvent()`。

| v1 | v2 | 规则 |
|---|---|---|
| `k: recall` / `k: review` | `kind: attempt` | `n`（或 `node`）→ `concept`；`ok` 为 `false`/`0`/`'false'`/`'0'` → `miss`，其余 → `hit`；`solve: null`；`durationMs: 0`；不携带 `note` |
| `k: note` | `kind: note` | `text` 取 `note`/`text`/`n`；`ref` 取 `n` |
| `k: daily` | `kind: daily` | `d`→`date`；`s`→`subject`；`min`→`minutes`；`w`→`wrong`；`blk`→`blocked`（只接受字符串）；`note`→`note` |
| `k: flatten` | `kind: flatten` | `s`→`shard` |
| `k: unflatten` | `kind: unflatten` | `s`→`shard` |
| `k: problem` / `k: problem.new` | `kind: problem.new` | `s`→`subject`；`c`/`concepts`→`concepts`；`m`/`methods`→`methods`；`diff`→`difficulty`（默认 3）；`text`→`text` |
| 其他 `k` | 丢弃 | 返回 `null`，读取端计为坏行 |

`core/events.js:72-83` 另有一份只处理 `recall`/`review` 的适配，供直接调用 `normalizeEvent()` 的调用方使用。**磁盘读写的权威路径是 `storage/legacy.js`**；两者对 `ok` 的判定一致（`0`、`'0'`、`'false'`、`false` 都算错）。

### 4.3 升级步骤（备份 → 重建 → 校验）

适用场景：`SCHEMA_VERSION` 或表结构变化。事件格式变化另加迁移脚本，且只读旧行、不重写历史。

```powershell
# 0) 停宿主：关闭 DSH 或停掉加载本插件的进程，避免 WAL 与主库不一致
$src = "$env:USERPROFILE\.dsh\neuro-loop"
$bak = "$src.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"

# 1) 备份整个数据根（包含 events-*.jsonl、projection.db、state.json、mail/）
Copy-Item -Recurse $src $bak

# 2) 重建投影：删掉库与快照，保留 L1
Remove-Item "$src\projection.db" -Force -ErrorAction SilentlyContinue
Remove-Item "$src\projection.db-wal" -Force -ErrorAction SilentlyContinue
Remove-Item "$src\projection.db-shm" -Force -ErrorAction SilentlyContinue
Remove-Item "$src\state.json" -Force -ErrorAction SilentlyContinue

# 3) 启动宿主，触发 /neuroloop/state；首次打开会全量重建并补写 state.json
#    然后校验：
#    - state.rev == state.events == L1 事件条数
#    - state.badLines 与预期坏行数一致（正常情况下为 0）
#    - 抽查若干考点的 attempts/hits/dueAt 与重建前一致
```

校验工具说明：`node tools/core_verify.mjs` 以 `state.json` 为对照；它依赖 `host/store.readAllEvents()`，**只识别 v1 短字段行**（要求 `t`/`k`），对 v2 行会计为 `bad`。纯 v1 数据集可用它；v2 数据集以宿主返回的 `rev`、`badLines` 与 L1 行数为准。

### 4.4 回滚步骤

1. 停宿主。
2. 删除当前 `projection.db`、`projection.db-wal`、`projection.db-shm`、`state.json`。
3. 从备份恢复 `projection.db` 与 `state.json`（备份时若宿主已停，通常没有 `-wal`/`-shm`；若存在，一并恢复）。
4. 回滚代码到与备份投影同一版本，再启动宿主。
5. 不修改、不删除 `events-*.jsonl`。升级期间追加的事件如果含有旧代码不认识的 `kind`，旧代码读取时会跳过并计入 `badLines`，L1 本身不受损。

原则：**代码版本与投影版本成对回滚**。L1 是唯一不能回滚重写的东西；任何回滚都不应触碰事件文件。

---

## 5. 协作日志（不进 SQLite）

这些日志服务于人和 agent 的协作，不属于学习数据，不参与投影重建。

| 文件 | 位置 | 写者 | 读者 | 保留策略 |
|---|---|---|---|---|
| `bus/bus.jsonl` | 仓库 `bus/`，已入库 | 子代理、Lead、微信桥、`ticket.mjs` | `tools/bus.mjs`、宿主 `/neuroloop/bus`、人 | 只追加、不删；没有自动压缩 |
| `team/tickets.jsonl` | 仓库 `team/`，已入库 | `host/team.js`（`ticket.mjs`/`intake.mjs` 调用） | 看板 `board()`、`tools/ticket.mjs list`、控制台 | 只追加、不删；`done` 票永久保留 |
| `mail/<收件人>.jsonl` | 数据根 `mail/`，不入库 | 任何会话（`tools/mail.py send` 或 `POST /neuroloop/mail`） | `tools/mail.py check`、`host/mail.js inbox()` | 每个收件人最多保留最近 500 封；读态在 `<收件人>.read.json` |

### 5.1 总线 `bus/bus.jsonl`

- 一行一条 JSON：`{id, at, lane, from, to, text, ref?}`；`ack` 也是追加行：`{id, at, ack:[...], by}`。
- lane 语义：`sub`（Lead ↔ 子代理）、`repo`（票单/提交）、`wx`（微信出入）、`note`（旁注）。
- 已读不删除原行；`pending` 用 ack 集合过滤。
- 删除会丢失沟通历史；它没有重建来源，也没有自动备份。按仓库约定不删。

### 5.2 票单台账 `team/tickets.jsonl`

- 事件类型：`create`、`claim`、`complete`、`block`、`reopen`；每行带 `id`（`T-0001` 形态）。
- 状态不单独存表：`host/team.board()` 每次从台账重放。若未来出现 `team/board.json` 缓存，可直接删除。
- `done` 是验收结论，不是自述；台账只追加，撤销靠新的 `reopen`。
- 删除会丢失任务状态与审计链；它不在 SQLite 中，没有重建来源。

### 5.3 信件 `mail/<收件人>.jsonl`

- 路径：数据根 `mail/`；一个收件人一个文件（如 `lead.jsonl`、`moya.jsonl`）。
- 信件字段：`id / to / from / subject（≤120）/ body（≤8000）/ replyTo / at`。
- 收件人名必须匹配 `^[a-z0-9][a-z0-9._-]{0,31}$`。
- 保留：`host/mail.send()` 在每次写入后把该收件人裁剪到最近 500 封（临时文件 + rename）；读态 `mail/<收件人>.read.json` 保留最近 1000 个 id。
- 删除会丢失跨会话消息；宿主不在时 `tools/mail.py` 直接写文件，因此不会因插件未加载而丢信。

---

## 6. 不变量

以下条目是所有读写路径都应满足的约束。测试文件相对仓库根。

| 编号 | 不变量 | 守着它的测试 |
|---|---|---|
| I-01 | L1 事件条数 == `projection.meta.rev` == `state.rev` == `state.events` | `test/host.mjs:134`、`test/host.mjs:142`、`test/host.mjs:398`、`test/legacy.test.mjs:60` |
| I-02 | 同一批事件，增量应用与全量重建逐行一致 | `test/storage.test.mjs:77`；core 侧 `test/core.test.mjs:198` |
| I-03 | 投影 `concepts` 的 `attempts/hits/misses/fp/streak/due_at` 与 `core/state.rebuild()` 一致 | `test/storage.test.mjs:105` |
| I-04 | 删除 `projection.db` 或 `state.json` 后重建，结果与删除前一致 | `test/storage.test.mjs:125`、`test/host.mjs:213` |
| I-05 | 每个考点：`attempts == hits + misses + recon`；`hits/misses/recon` 分别等于对应 `recall` 的事件条数；`fp == Σ(recall=hit 且 solve=fail)` | 间接覆盖：`test/core.test.mjs:115`（逐项计数）、`test/storage.test.mjs:105`（与 core 对齐）；无独立求和断言 |
| I-06 | 每个考点：`duration_ms == Σ attempt.durationMs` | 无独立测试；增量与重建共用同一累加式 |
| I-07 | `due_at` 只由最后一次 `attempt.at` 与当时 `streak` 决定；失败一次 `streak=0`，间隔 1 天；`true` 命中按 `2^(streak-1)` 天 | `test/core.test.mjs:139`、`test/storage.test.mjs:105` |
| I-08 | 新写事件的 `v == EVENT_VERSION`；v1 只在读取时适配，不重写磁盘历史 | `test/storage.test.mjs:70`（适配）；“不重写”由 `storage/events.append()` 只追加保证，无专门测试 |
| I-09 | 坏行/截断行只计数，不阻断好行 | `test/storage.test.mjs:53`、`test/host.mjs:222` |
| I-10 | `daily` 以 `(date, subject)` 唯一，后写覆盖先写；`flattened` 以 `shard` 唯一 | `test/core.test.mjs:154`、`test/host.mjs:208` |
| I-11 | `id` 由 `at` 与事件体决定，同内容同 id；但写入路径不按 id 去重 | `test/core.test.mjs:107`；去重是 T-0010 的范围 |
| I-12 | 投影不是全量副本：`methods` 缺 `steps/instances/confidence/note`，`problems` 缺 `source/answer/note`，因此不能用投影反向重建 L1 | 结构性事实，见第 3 节建表语句；无测试 |

已知差异（不当作不变量，但读代码时会遇到）：

- `daily.blocked` 在 L1 与投影里是字符串，`core/state.js` 已按字符串折叠（v1 的布尔值落空串，因为没有原文可留）。视图与宿主测试取 SQLite 的字符串（`test/host.mjs:207`）。
- `method.new` 对已存在 id 重发时，`core/state.js` 会把 `uses/ok/fail` 归零，而 SQLite UPSERT 保留计数，两条路径可能分叉；更新方法应使用 `method.edit`。

---

## 7. 维护这份文档

- 改事件：同步改第 2 节对应小节，并运行 `node tools/check_contract.mjs`。
- 改表：同步改第 3 节字段行，并运行同一脚本。脚本从 `storage/projection.js` 的 `CREATE TABLE` 与 `core/contract.js` 的 `EVENT_KINDS` 取真实值，不会硬编码第二份。
- 改版本：同步第 4 节的 `EVENT_VERSION = 2` / `SCHEMA_VERSION = 2` 行，并按 4.3 做升级验证。
- 门禁：`tools/check_all.ps1` 已包含 `tools/check_contract.mjs`（当前 14 项）。
