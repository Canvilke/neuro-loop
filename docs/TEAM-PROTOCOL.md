# 维护协议（TEAM PROTOCOL）

> 这份文件回答一个问题：**没有人在的时候，这个仓库靠什么继续往前？**
> 答案不是"靠模型记得"，而是"靠磁盘上的一张票 + 一段可复现的命令"。

## 0. 一句话纪律

**没有票，不开工。**

票在 `team/tickets.jsonl`（append-only）。改代码之前先有票；票上写着只碰哪些目录、做完要满足什么。
子代理是一次性的，票不是——子代理死掉、上下文丢了、换个模型，票还在。

## 1. 三层结构

| 层 | 文件 | 作用 | 坏了怎么办 |
| --- | --- | --- | --- |
| 角色 | `team/roles.json` | 六个角色各自的 `owns / done / never` | 从 git 恢复 |
| 票 | `team/tickets.jsonl` | 谁在做什么、依赖谁、卡在哪 | 追加式，永不改写；坏行跳过 |
| 看板 | 派生（不落盘） | 重放出 ready/claimed/blocked/done | 删缓存即可重算 |

角色不是人格设定，是**写权限与验收标准的组合**：`owns` 决定能碰哪些路径，`never` 是红线。

## 2. 一次完整循环（Lead 视角）

```
node tools/ticket.mjs list                     # 看盘
node tools/ticket.mjs next --role core-dev     # 挑一张可领的
node tools/ticket.mjs brief T-0003             # 生成交给子代理的提示词
   ↓ 把 brief 原文交给 subagent（fresh，独立上下文）
node tools/ticket.mjs claim T-0003 --by <名字>  # 子代理开工第一步（或 Lead 代领）
   ↓ 子代理改代码 → powershell tools/check_all.ps1
   ↓ 子代理回复三行：改了什么 / 证据 / 没做什么
Lead 复核 diff + 自己再跑一次 check_all
node tools/ticket.mjs done T-0003 --by <名字> --note "<证据行>"
```

要点：

- **子代理不标完成**。`done` 由 Lead 复核后写，这样"完成"这个词才有信息量。
- **卡住要留理由**：`node tools/ticket.mjs block T-0003 --note "等 api.github.com 可用"`。
- 依赖用 `--deps T-0001` 表达，未完成时 `claim` 会被命令拒绝（不是靠自觉）。

## 3. 一次完整循环（子代理视角）

1. 先读 `AGENTS.md`、`docs/ADR-0002-persistent-team.md`、`NEXT.md` 顶部三行；
2. `node tools/ticket.mjs claim <id> --by <名字>`；
3. 只改票上 `scope` 列出的路径；
4. `powershell -File tools/check_all.ps1` 必须全绿；测试不过就说明没做完，不要改断言；
5. 回复三段：**改了什么（文件:行）/ 证据（测试输出原话）/ 没做什么（含风险）**。

## 4. 消息与信箱

- 跨会话沟通用信箱：`python tools/mail.py send --to lead --from <你> --subject ... --body ...`；
- 收到信的会话先 `check`，处理完 `read --id`；
- IM（微信/QQ）进来的请求，按 `AGENTS.md` §2.1 先寄信给 `lead`，不要自己在仓库里大改。

## 5. 并发与写域

两个子代理同时改同一文件，冲突不会被文件系统拦住。所以：

- 一个票一个 `scope`；两票的 `scope` 不得有交集（`ticket.mjs` 目前只提示，不强制）；
- 需要并行时，Lead 先按目录切分：`core/`、`host/`、`src/`、`tools/`、`docs/`；
- 共享产物（`client.js`、`state.json`）只由 Lead 或单一路径生成。

## 6. 什么情况下不开新票

- 只是改文档错字：直接改，在 commit message 里说明（不占用票号）；
- 复盘 / 调研：写进 `docs/` 或 `NEXT.md`，等结论成形再开票；
- 修 P0（数据损坏、误删）：先修再补票，票里写 `note: P0 后补`。

## 7. 恢复现场（新会话第一件事）

```bash
cd neuro-loop
node tools/ticket.mjs list                 # 有没有半途而废的
node tools/ticket.mjs list --all           # 卡住的（stale）
powershell -File tools/check_all.ps1       # 11 项门禁
```

三条都对得上，再开始接活。对不上，先修现场，不要叠加新工作。
