# ADR-0001：分层、语言与数据源

- 状态：已采纳（2026-11-10）
- 决策者：lead；委托人：小潇
- 相关：[RESEARCH-PLAN.pdf](RESEARCH-PLAN.pdf)、[../ENGINE.md](../ENGINE.md)、[../STATUS.md](../STATUS.md)

## 1. 背景与约束

| 约束 | 事实 |
|---|---|
| 运行边界 | 客户端半边只能拿到 `ctx / React / host / styles`，**没有打包器、没有 npm、没有 JSX**；宿主半边是 ESM Node 插件 |
| 网络 | `api.github.com` 被改写（301），npm registry 不可达；`git push` 走 `github.com` 可用 |
| 本机 | Node **26.5.0**（内置 `node:sqlite`、`node:test`）、Python 3.14；无 tsc / esbuild / cargo / go |
| 用户 | 单人、一台 Windows、高三在读；系统坏了他无法自己修 |
| 已有资产 | L1 `events-YYYY-MM.jsonl`（append-only）、`state.json`（投影）、三条宿主路由、8 个 src 模块 |

因此：**"更专业的语言"不等于换语言**。Rust/Go 需要工具链且无法在本机安装与验证；TypeScript 需要 tsc，registry 不可达。可用的专业度来自**结构、契约与测试**，不是语法糖。

## 2. 决策

### D1 四层，单向依赖

```
core/      纯函数：领域模型、事件校验、投影、调度   ← 不 import 任何 IO
storage/   真源读写：jsonl 追加、SQLite 投影、迁移   ← 只依赖 core
host/      路由薄层：校验 → 调 storage → 返回 JSON   ← 只依赖 storage
client/    渲染与交互：store → scene → renderer → input
```

规则：**core 不出现 `fs` / `http` / `Date.now()` 以外的环境调用**（时间一律由调用方传入，便于测试）；host 里不写业务规则；client 不直接读文件。

### D2 后端：Node ESM + `node:sqlite` + `node:test`，零第三方依赖

- `node:sqlite` 是 Node 24+ 内置，**不必装包**，也不引原生模块，坏了两行代码能改。
- 测试用 `node:test` + `node:assert`，不引 jest/vitest。
- 第三方依赖的风险在本机是真实的：registry 不可达、装坏了没人修。**能内置就不装**。
- Python 只用于内容流水线（docx/PDF/解析 PDF），**不进运行时**。

### D3 L1 是真源，SQLite 是可丢弃的投影

- `events-*.jsonl` 是唯一真源：一行一个事件，append-only，人可读、可 diff、可 grep。
- SQLite（`projection.db`）只是索引：**删掉能全量重建**，重建时间目标是 10 万事件 < 2s。
- 不把 SQLite 当真源的理由：二进制损坏无法手工修复、并发写入要给用户看日志、备份体积大。真源的容错标准是"记事本能看懂"。

### D4 前端：不引框架，但按层拆

- 保留 Canvas 渲染（这是作品本身），但把现在的 `05-app.js` 拆成 `store / scene / renderer / input` 四类，每类一个职责。
- 类型安全靠 **JSDoc typedef + 运行时断言**（`core/contract.js`），因为装不了 tsc。
- 组件不持有业务状态；状态一律进 `store`，渲染是 `state → pixels` 的纯函数（光标、动画相位除外）。

### D5 事件带版本，迁移单向

- 事件行有 `v` 字段（当前 `2`）。读的时候按 `v` 分派迁移函数，迁移只升不降。
- `state.json` 有 `schemaVersion`；版本不符就重建，不尝试原地修补。

### D6 规模纪律

- 单文件 ≤ 400 行，超了就拆；单函数 ≤ 60 行。
- 每个模块头部写"职责 / 不负责什么 / 依赖谁"三行注释。
- 新增事件类型必须同时加：`contract.js` 白名单、`events.js` 校验、`state.js` 投影、一条测试。缺一条不算完成。

## 3. 被否的方案

| 方案 | 否决理由 |
|---|---|
| Rust/Go sidecar 做后端 | 本机装不了工具链，构建链断了没人修；收益在 10 万事件以下看不出来 |
| TypeScript 全量重写 | 装不了 tsc；手写 `.d.ts` 无法验证，等于自欺 |
| SQLite 直接当真源 | 二进制损坏不可手工修复，违背"用户能自己救" |
| React 重写前端 | 客户端半边只有 `React.createElement`，没有 JSX/打包；且已有 2.5 万行 Canvas 是资产不是负债 |
| 微服务/进程拆分 | 单用户单机，多进程只增加启动失败面 |

## 4. 后果

- 正面：每一层可单独测试；删投影安全；迁移可控；不依赖网络。
- 负面：前端没有编译期类型检查，只能靠 JSDoc + 测试 + 运行时校验；需要额外写迁移脚本。
- 观测方式：`tools/check_all.ps1` 从 7 项扩到 9 项（含 core 与 storage 的重建一致性）。
