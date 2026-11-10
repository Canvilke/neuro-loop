# 端到端维护：从一句话到一张已验收的票

这份文档只回答一个问题：**当有人（我、微信、issue、明天的我）提出一件事，它怎么一路走到"做完了、有证据、下次还找得到"。**

没有这条线，多子代理就只是"一次性劳动力"：每次派出去，回来一段话，对话一滚就没了。

---

## 1. 一条线（五步）

```
请求来源                  进票                    派工                  施工                  验收
────────                ──────                  ──────                ──────                ──────
issue / 微信 / 我突然想到  →  tools/intake.mjs new  →  tools/ticket.mjs brief  →  子代理 claim + 写代码  →  Lead 跑门禁 + done
                              （标题去重/验收必填）      （写域 + 红线 + 五步）      （只动写域）              （证据入库 + bus 行）
```

每一步都落盘：

| 步骤 | 落点 | 只追加？ |
|---|---|---|
| 进票 | `team/tickets.jsonl` | 是 |
| 派工 | 不上盘（brief 是生成物，可随时重生成） | — |
| 施工 | 代码 + `client.js` 构建产物 | 否（git 管） |
| 验收 | `team/tickets.jsonl` 的 `done` 事件 | 是 |
| 通知 | `bus/bus.jsonl` 的 `sub` 行 | 是 |

---

## 2. 实际操作（四条命令）

```bash
cd /c/Users/86152/Desktop/致远/neuro-loop

# ① 把请求开成票（验收标准必填，写不出来就先别开）
node tools/intake.mjs new \
  --title "控制台头部显示总线未读" \
  --role ui-dev \
  --accept "头部显示 sub/repo/wx 三条未读；数据来自 /neuroloop/bus?to=lead；无 setInterval" \
  --scope src/14-team.js \
  --from wx --ref "wx:8f3a1c"

# ② 生成作业书，整段发给子代理
node tools/ticket.mjs brief T-0006

# ③ 子代理自己领票（不许代领）
node tools/ticket.mjs claim T-0006 --by ui-agent

# ④ 我复核后关闭（done 是验收结论，不是自述）
node tools/ticket.mjs done T-0006 --by lead --note "11 项门禁全绿；CLAIM/DONE 只在应出现的票上"
```

看板：`node tools/intake.mjs list`，或界面里的「控制台」面板（左侧栏第 23 位）。

---

## 3. 三条请求来源怎么接进来

### 3.1 微信

微信消息落在**独立会话**里（不是这条长会话）。那边的 agent 按 `AGENTS.md` §2 做两件事：正常回答 + 往总线写一行。

```bash
node tools/bus.mjs post --lane wx --from wechat --to lead --text "把英语页改成 30 条/天" --ref "wx:8f3a1c"
```

我这边每轮开头 `node tools/bus.mjs pending`，看到 wx 未读就用 `intake.mjs from-bus --lane wx` 开票。

**能力边界**（三条证据在 `docs/BUS.md` §4）：没有"推送一条消息到微信"的公开接口，所以微信侧是**异步**的——我回的话要等 IM 会话下一次回合才发出去。

### 3.2 issue（superagent / 主理鱼）

`dsh-session-superagent` v0.10.11 已装，作用是盯仓库 issue → 空闲时把任务书注入会话。它需要 `gh` 登录（GitHub）或 Gitee 令牌。

**当前真实状态**：`api.github.com` 被网络层改写成 301 → `github.com`，`gh auth login --with-token` 报 `HTTP 406`，所以 GitHub watcher 现在装不上；代码推送走 `github.com` 正常。等网络恢复后：

```bash
gh auth login --with-token < token.txt
```
然后在面板加一条守（或用 `watch_start repo=Canvilke/neuro-loop`）。醒来信后照 3.3 处理。

### 3.3 我自己想到的

直接 `intake.mjs new --from lead`。这条最容易，也最容易漏——所以 `intake list` 要每天早上看一眼。

---

## 4. 与子代理的接缝（最容易断的地方）

子代理是**一次性**的：它结束就什么都不记得。所以约定三件事：

1. **作业书由程序生成**（`ticket.mjs brief`），不由我手打——手打会漂移，票号、写域、红线容易漏。
2. **写域**：一张票只碰 `scope` 里列的文件。两张票的 scope 前缀相交时 `intake` 会警告（`conflictsOf`），那是提示不是锁。
3. **交付三行**：改了什么 / 证据（门禁输出行）/ 没做什么。没有证据的"已完成"不算完成。

子代理交付后自己写一条总线行：

```bash
node tools/bus.mjs post --lane sub --from ui-agent --to lead --text "T-0006 交付：头部三条未读已接 /neuroloop/bus" --ref T-0006
```

---

## 5. 验收标准（写票时就得想清楚）

一条能验收的票，`accept` 必须满足：

- 能机器判：测试行、路由响应、页面元素存在；
- 不能是"体验更好""看起来不错"（那属于拍板，不属于验收）；
- 不许为了让测试通过而改断言——这条写在每张票的红线里。

门禁当前 **13 项**：build / smoke / levels / boot / net / host / core / legacy / storage / dispatch / bus / intake / activate。

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/check_all.ps1
# 期望最后一行：13 passed, 0 failed
```

---

## 6. 失忆了怎么恢复（三步）

```bash
node tools/intake.mjs list                 # 有哪些票、哪些能领、哪些卡住
node tools/bus.mjs tail --limit 20         # 最近谁说了什么（三条通道合看）
powershell -File tools/check_all.ps1       # 现在这副身体还健康吗
```

再读 `NEXT.md` 顶部三行，就知道下一步做什么。

---

## 7. 还没做的（诚实清单）

- **自动派发**：现在是我手动把 brief 贴进 `subagent` 调用；没有"台账里 ready 的票自动进队列"的调度器。
- **超时回收**：`claimed` 超过 6h 只会在看板上标黄，不会自动退回 `ready`。
- **证据结构化**：`done` 的 note 是自由文本，没有"这条票对应哪次测试输出"的机器可读关联。
- **issue→票 的自动转换**：需要 `gh` 可用；现在是手抄。
