# 总线（三条通道，一条日志）

> 一句话：子代理、微信消息、仓库票单都往 `bus/bus.jsonl` 写一行；
> 谁都从这里读，谁都不许改历史。

## 1. 为什么不是"三个系统对接"

对接三个系统会得到三份状态、三种时间、三处失败点。这里只做一件事：
**把"谁对谁说了什么"按时间排成一条只追加的日志**，其余都是读法。

- 文件：`bus/bus.jsonl`（UTF-8，一行一条 JSON）
- 只追加：不删、不改，过期靠读取端过滤
- 坏行：半行写入只计数，不影响后面的行（追加前会补行边界，见 `tools/bus.mjs` / `host/bus.js`）
- 已读：`{"id":..,"ack":["..."],"by":"lead"}` 还是一条追加行

## 2. 三条通道（lane）的语义

| lane | 谁写 | 谁读 | 典型内容 |
|---|---|---|---|
| `sub` | 子代理 / 队友 / Lead | 收件方 | 「T-0003 完成，等复核」「存储层需要 40 分钟」 |
| `repo` | `ticket.mjs`、提交脚本、Lead | Lead | 「开票 T-0006」「push 0b90961」 |
| `wx` | Lead（出）、IM 会话（进） | IM 会话 / Lead | 「今晚 22:40 的两张纸已出」「妈：你电脑别关」 |
| `note` | 任何 agent | 人 | 旁注，不投递 |

## 3. 命令

```bash
node tools/bus.mjs post --lane sub --from ui-agent --to lead --text "T-0003 做完了" --ref T-0003
node tools/bus.mjs tail --lane wx --limit 10
node tools/bus.mjs pending            # sub/repo/wx/note 各几条未读
node tools/bus.mjs out --from lead --text "明早两张纸已打印"   # 进微信待发队列
node tools/bus.mjs ack <id>
```

HTTP（宿主在跑时）：`GET /neuroloop/bus?to=lead&limit=20`、`POST /neuroloop/bus {lane,from,to,text,ref}`。
两条路径写的是同一份文件，`test/bus.test.mjs` 双向校验。

## 4. 微信这一段：能做什么，不能做什么

**能做（已实现，靠约定）**

- 出：`bus out` 把话放进 `wx` 队列；IM 会话（moya）每回合开始读一次未读，用自然语言转述给用户。
- 进：IM 会话收到消息后，把一句摘要追加到 `sub`/`wx`，主会话按 `pending` 取。
- 落盘优先：即使宿主没起、网关掉线，消息也不丢（写在文件里）。

**不能做（公开接口没有，别假装有）**

- DSH 没有「向任意已存在会话投递一条用户消息并唤醒它」的服务方法：
  `ctx.agents` 只有 create/resume/register/enter/announce/get/list/fork，
  `ctx.subagents.sendMessage` 只允许**直系父/子**会话。
- `@michengai/dsh-im-connect` 的管理 API 只有 `accounts / assistant / channels /
  online-update / sessions / sidebar-entry / task-tree-sessions`，`sessions` 只支持
  rename/remove/cleanup-missing/ensure —— **没有发消息端点**。
- 渠道内部确实有 `send(chatId, text)`，但它挂在插件内存里的 channel 对象上，不对外暴露；
  直接去调 `https://ilinkai.weixin.qq.com/ilink/bot/sendmessage` 需要 bot token，
  等于绕过插件自己实现一份通道——不做。

所以微信是**异步双工**：两边都能收能发，但延迟取决于 IM 会话下一次回合，不是推送。
这是当前架构的真实上限，写在这里免得以后误以为"已经打通了"。

## 5. 与票单的关系

- 一张票的生命周期里，`ticket.mjs` 会写 `repo` 行（开票/领票/完票）。
- 子代理交付后写一条 `sub` 行，Lead 复核完才 `done`（ADR-0002 §8.3）。
- 「没有票不开工」仍然有效：总线是**通信**，不是**任务**。

## 6. 恢复现场

```bash
node tools/bus.mjs pending
node tools/bus.mjs tail --limit 30
node tools/ticket.mjs list
powershell -File tools/check_all.ps1   # 12 项
```
