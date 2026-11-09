# ROADMAP v3 —— 从「能跑」到「可维护」

> 原则：**每周一条主线、每天一个可交付、做不完顺延、不引第三方依赖。**
> 硬指标只有一条：任何时刻删掉投影能重建，且 `tools/check_all.ps1` 全绿。

## 已完成的基线（v1，勿回退）

| 能力 | 证据 |
|---|---|
| 客户端星图 + 启动序列 + 今天视图 | `client.js` 25 万字节，7 处注册，L3 已由用户确认 |
| 宿主三条路由（state / event / today） | `host ok — 48 checks, routes 4` |
| 事件流 + 投影重建 | `state.json rev` = 事件条数；删文件可重建 |
| 信箱 | 47 checks 含 8 组信箱断言 |

## M10 —— core 领域层（S1，本周）

**目标**：把"事件 → 投影"从 `host/store.js` 里抽出来，变成不碰文件系统的纯函数。

- M10-1 `core/contract.js`：常量、id 正则、错误码。
- M10-2 `core/events.js`：九种事件的规范化为 `normalizeEvent`，非法输入抛 `DomainError(code)`。
- M10-3 `core/metrics.js`：`intervalDays`、`dueAt`、`hitRate`、`accuracy`、`classify`。
- M10-4 `core/state.js`：`emptyState`、`applyEvent`、`rebuild`。
- M10-5 `test/core.test.mjs`：≥25 条断言，含"同一批事件顺序无关"与"删投影重建一致"。

**验收**：`node --test test/core.test.mjs` 全绿；`host/store.js` 改为调用 core，行为不变（48 checks 仍过）。

## M11 —— storage 层（S2）

- M11-1 `storage/events.js`：追加、按月读取、坏行计数。
- M11-2 `storage/projection.js`：`node:sqlite` 建表 + 全量重建 + 增量 upsert。
- M11-3 `storage/migrate.js`：v1 事件 → v2（`recall`→`attempt`，补 `v`）。
- M11-4 `test/storage.test.mjs`：10 万事件重建 < 2s（生成器造数）、断电模拟（写到一半截断）。

**验收**：`state.json` 与 SQLite 投影逐字段一致；删 `projection.db` 后重建结果相同。

## M12 —— API 收敛（S3）

- M12-1 路由统一 `{ok, data, error:{code,message}}` 外壳。
- M12-2 `POST /neuroloop/event` 支持批量（≤200）与幂等键 `clientId`。
- M12-3 `GET /neuroloop/state?fields=` 字段裁剪，避免整棵树回传。
- M12-4 契约测试：每条路由的正例/反例/越权/方法不允许。

**验收**：`host` 测试 ≥60 checks；旧客户端不改也能工作。

## M13 —— 界面收敛（S4–S6）

- M13-1 `client/store`：单一状态源，订阅式更新。
- M13-2 `client/scene`：把 `04-web.js`/`03-space.js` 的"算什么"与"画什么"分开。
- M13-3 「今天」视图接真数据（到期、纸、任务、勾选）。
- M13-4 方法卡审核入口（`verified` 开关）。
- M13-5 导出（JSON + 打印 HTML）。

**验收**：连续三天使用不需要改代码；任一屏 60fps（1080p、无 GPU 加速）。

## M14 —— 长期维护

- 每次提交必须：`check_all.ps1` 全绿 + 文档同步（TASKS/NEXT）。
- 每月一次：`tools/compact.py` 折叠旧事件、备份、体积报表。
- 每季度一次：评审 ADR，过期的写"已废弃"而不是删。

## 不做（明确）

- 多用户 / 云端同步 / 移动端。
- 题库管理与刷题统计。
- 总分、排名、连胜这类会反噬的指标。
- 引入需要联网安装的运行时依赖。
