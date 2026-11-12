
# Neuro-Loop · 认知巡检

一个跑在 DeepSeek Harness 里的**个人认知系统**：左侧一圈银色星环代表六门学科，
右侧一片可旋转缩放的"知识场"代表你脑子里那张网，行星外沿的暗物质碎片代表
"你以为会、其实不会"的题。

设计来源：《设计文档》（场景描述 + LLM/人脑同构性理论）；原稿不在本仓库，结论已折进 [`DESIGN.md`](DESIGN.md)。

## 0. 从这里开始（按顺序）

| 想知道 | 打开 |
|---|---|
| 现在到底有什么、什么还只是壳、什么卡住了 | [`docs/STATUS.md`](docs/STATUS.md) |
| 今天该干什么 | [`NEXT.md`](NEXT.md) 顶部三行 |
| 这周的安排与验收 | [`WEEK-01.md`](WEEK-01.md) |
| 全部任务与进度（唯一真源） | [`TASKS.md`](TASKS.md) |
| 谁负责哪块、票单怎么流转 | [`docs/TEAM-PROTOCOL.md`](docs/TEAM-PROTOCOL.md) |
| 一句话怎么变成验收过的票 | [`docs/END-TO-END.md`](docs/END-TO-END.md) |
| 会议室怎么用、代表制怎么派 | [`docs/ROOM.md`](docs/ROOM.md) · [`docs/COMMS-PROMPT.md`](docs/COMMS-PROMPT.md) |
| 为什么这样分层、被否过什么 | [`docs/ADR-0001-architecture.md`](docs/ADR-0001-architecture.md) · [`docs/ADR-0002-persistent-team.md`](docs/ADR-0002-persistent-team.md) |
| 数据模型 v2 的研究与取舍 | [`docs/RESEARCH-PLAN.pdf`](docs/RESEARCH-PLAN.pdf) |

接手规则（不手改产物、五套测试全绿、提交纪律）写在 [`AGENTS.md`](AGENTS.md)；
设计案在 [`DESIGN.md`](DESIGN.md)，四层库在 [`ENGINE.md`](ENGINE.md)，每日一页的版面与语言契约在 [`FORMAT-politics.md`](FORMAT-politics.md)、[`FORMAT-english.md`](FORMAT-english.md)。

---

## 1. 它现在能做什么

- **星环选科**：六颗行星在倾斜的椭圆轨道上公转，点一下滑到环底并成为当前学科。
- **知识分层**（两层）：
  - 第一层：只看到 4–5 个**知识块**（函数与导数、电磁感应……），围成一圈；
  - 点知识块 → 出「进入『X』？」→ `ENTER` / 双击进入；
  - 第二层：块内的考点变成星图（主序星 = 该块的核心考点），`ESC` 或 `↑ 返回` 回退。
- **3D 操作**：拖动旋转、滚轮缩放（0.62–2.4×）、双击复位。
- **引力透镜**：悬停任意星体，邻域亮起、无关项压暗、相连引力带脉冲。
- **启动序列**：页面加载即开场（七拍：自检 → 星图同步 → GitHub 身份验证 → 通道简报 → 通道清单 → 扫描线 → 跃迁），
  学习通道落到本页并自动切到 `neuro-loop` 面板，编程通道进 `neuro-loop-code` 编程台；`m` 键可重新拉起。
- **编程台**（`neuro-loop-code`）：身份/通道读数 + 三个动作（回到会话、切到学习、重播启动），DOM 面板，不占 canvas。
- **暗物质碎片带**：绕在选中行星外，红=假阳性（命中率高、准确率低），灰蓝=未命中。
  点红/灰碎片 = "磨平"，localStorage 记一份、同时 POST 一条 `flatten` 事件落盘。
- **操控台**：底部一条实测数值栏（HIT/ACC/盲区/假阳性/考点数）+ 缩放复位按钮。

## 2. 目录

```
neuro-loop/
├─ package.json          # dsh 插件清单（bundle.patch + client 入口）
├─ cordis.patch.yml      # 往 profile 里插入本插件
├─ index.js              # 宿主半边：注册 9 条路由（state/event/events/mail/today/team/bus/room/export）
├─ core/ storage/        # 领域层（纯函数）与存储层（L1 事件流 → SQLite 投影）
├─ host/                 # 路由薄层 + handlers（只做协议，不写业务规则）
├─ room/ bus/ team/      # 会议室、总线、票单台账（都是只追加的 jsonl）
├─ icon.svg  locale/     # 侧栏图标 / 插件市场文案
├─ data/seed.json        # 六科考点 + 分组 + 边 + 碎片（唯一数据源）
├─ src/0*.js             # 分模块源码，按序拼进同一闭包
├─ build.py              # 拼包器：src → client.js（--check 顺带 node --check）
├─ test/smoke.cjs        # 无头渲染冒烟（652 帧 + 交互扫点）
├─ test/levels.cjs       # 层级契约测试（进入/返回）
├─ test/boot.cjs         # 启动序列：自动开场 + 三阶段绘制 + 卡片命中
└─ TASKS.md              # 任务台账（进度真源，先看这个）
```

## 3. 开发循环

```bash
cd neuro-loop
python build.py --check     # 拼包 + 语法检查
node test/smoke.cjs         # 渲染不抛错（含非有限值校验）
node test/levels.cjs        # 层级切换契约
node test/boot.cjs          # 启动序列（必须自己开场）
node test/net.cjs           # 客户端接线 + 队列补发 + due 调度
node test/host.mjs          # 宿主路由 + 事件流 + 投影重建
node test/room.test.mjs     # 会议室（20 checks）
# 然后：在 DSH 里刷新页面，看侧栏"认知巡检"

# 15 项门禁（含 build 与全部测试）
powershell -NoProfile -ExecutionPolicy Bypass -File tools/check_all.ps1

# 环境自检（换机器/隔天回来先跑这个）
python tools/activate.py --test

# 原型 SQLite 快照（只读，不并入事件流）
python tools/import_proto_db.py --dry
```

改了 `client.js` 之后**必须刷新页面**，这个插件没有 HMR。

## 4. 约束（来自 DSH 客户端插件契约）

- 客户端半边只有 `React`（无 JSX）、`ctx.slots`，**没有 npm / 打包器 / three.js**。
- 页面必须渲染成 slot 里的 React 组件，**不能用 iframe**。
- 不要 `require` 任何 `@deepseek-ai/dsh-client-*` 包。
- 组件崩掉会白掉整个 slot entry，所以 `frame` 与 `apply` 都有 try/catch。
- 容器/控件要跟随宿主主题；**作品本身**（星空、星体）用自己的颜色。

## 5. 数据契约

```jsonc
{
  "subjects": [{
    "id": "math", "name": "数学", "glyph": "∑", "hue": "#6f8bff", "weight": 1, "core": "函数与导数",
    "groups": [{ "id": "g-func", "label": "函数与导数", "short": "函数", "nodes": ["..."] }],
    "nodes": [{ "id": "...", "label": "导数与单调性", "grp": "g-func",
                "attn": 0.82, "stability": 0.41,
                "core": "核心考点", "trap": "设错陷阱", "method": "方法判据",
                "hit": 0.83, "acc": 0.54 }],
    "edges": [{ "a": "...", "b": "...", "kind": "prereq|derive|contrast|analogy", "w": 0.7 }]
  }],
  "shards": [{ "subject": "math", "text": "题干", "hit": 0.8, "acc": 0.4, "state": "fp|unknown|smooth" }]
}
```

字段含义严格对应理论：`attn` = 注意力权重，`hit/acc` = KV 命中率/准确率，
`stability` = 记忆稳定度（≤0.35 触发盲区警报），`fp` = 假阳性碎片。

## 6. 接下来

见 `TASKS.md`。2026-11-13 在推：T-0013 归档压缩、T-0014 导出路由、T-0015 审核页签、T-0017/T-0021 边界回归；会议室与代表制已上线（见 [`docs/STATUS.md`](docs/STATUS.md) §6–7）。

## 7. 数据放哪、怎么救

| 东西 | 位置 | 坏了怎么办 |
| --- | --- | --- |
| 事件流（真实记录） | `%USERPROFILE%\.dsh\neuro-loop\events-YYYY-MM.jsonl` | 别删。手工改一行会让投影失真，但读取端会跳过坏行并计数 |
| 投影缓存 | 同目录 `state.json` | **直接删**，下次读取自动从事件流重建（`rev` 应与事件条数一致） |
| 客户端队列 | 浏览器 `localStorage['neuroloop.queue']` | 清掉只会丢"还没发出去的几条事件"，不会丢已落盘的 |
| 原型快照 | `imports/proto-*` | 可再生，删了不影响 |

三条命令救命：

```bash
python tools/activate.py          # 十秒体检：构建/数据/插件/文档
python tools/activate.py --test   # 连五套测试一起跑
```

## 8. 九条路由

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/neuroloop/state` | 返回投影（`rev` + nodes + flattened）；客户端启动时合并 |
| POST | `/neuroloop/event` | 追加一条事件：`attempt` / `note` / `flatten` / `unflatten` / `daily` 等 |
| POST | `/neuroloop/events` | 批量追加（≤200 条，逐条校验，部分成功有明细） |
| GET/POST | `/neuroloop/mail` | 信箱：GET 读未读，POST 发信 / 标记已读 |
| GET | `/neuroloop/today` | 「今天」视图：两份资料、数理化任务、到期、两张纸状态 |
| GET/POST | `/neuroloop/team` | 团队与票单：GET 看板，POST 领票 / 交付 |
| GET/POST | `/neuroloop/bus` | 总线：GET 未读 / tail，POST 追加一行 |
| GET/POST | `/neuroloop/room` | 会议室：GET tail / asks，POST say / ask / decide |
| GET | `/neuroloop/export` | 导出 A4 HTML：`?what=due|blind|fp`（T-0014） |

守卫：只接受本机回环 + 同源 Origin，请求体上限 64KB；方法不对 405，跨源 403，字段不合法 400。
