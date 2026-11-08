# MAINTAIN · 长期维护手册

> 这份文件回答：**这个仓库交给谁、放在哪、什么时候动、动完怎么验。**
> 具体写代码的规矩在 `AGENTS.md`；任务进度在 `TASKS.md`。
> 版本：2026-11-09（初始仓库建立日）

---

## 0. 一页结论

- 本地仓库：`neuro-loop\`，分支 `main`，构建产物不入库。
- 远程：**Gitee 私有仓**。本机没有 `gh` CLI，GitHub 网络走不通，不要在这上面浪费时间。
- 长期维护者：**主理人 / superagent**（一个只在有 issue 时被唤醒的维护 agent）。
- 每天 22:40 有一个**夜间出纸任务**，只生成并打印次日页，**不改代码**。
- 维护与出纸是两条互斥的写路径：维护不打印，出纸不提交。

---

## 1. 角色与边界

| 角色 | 职责 | 明确不做 |
| --- | --- | --- |
| 学生（用户） | 拍板内容与观感、在纸上作答、每天回填 | 不手改 `client.js` |
| 主理人 / superagent | 处理 issue、改 `src/host/tools`、跑测试、中文提交 | 不擅自改数据、不打印、不装依赖、不推家目录记录 |
| 夜间出纸任务（22:40） | 算当天该复现什么、生成一页、扁平打印、留档 `daily/` | 不改源码、不改测试、不 `git commit`、不 push |
| 真机验收 | 刷新页面看观感（L3） | —— |

维护 agent 的核心纪律：**没有 issue 就停手。** 不要因为「顺手」去重构、調视觉、换依赖。

---

## 2. Gitee 私有仓（唯一远程）

为什么不是 GitHub：本机没有 `gh` CLI，GitHub 在当前网络下不可用；
Gitee 支持私有仓、issue 与标签，够用。

### 2.1 首次建仓（只做一次）

1. 在 Gitee 网页新建**私有**仓库，仓库名 `neuro-loop`，**不要**勾选初始化 README/`.gitignore`。
2. 在本地仓库根目录绑定远程（把 `<账号>` 换成实际 Gitee 用户名）：

```bash
git remote add origin https://gitee.com/<账号>/neuro-loop.git
git push -u origin main
```

3. 凭据：用 SSH key 或 HTTPS 私人令牌，令牌只放 Windows 凭据管理器。
   **不要把 token、密码、`~/.dsh` 路径写进仓库或脚本。**
4. 建议在 Gitee 仓库设置里保护 `main`：至少禁止 force push；单人维护时允许直接 push，
   多人/多 agent 时改为合并请求。

### 2.2 换一台机器接手

```bash
git clone https://gitee.com/<账号>/neuro-loop.git
cd neuro-loop
python build.py --check
powershell -ExecutionPolicy Bypass -File tools/check_all.ps1
```

`client.js`、`version.json` 不在仓库里，克隆后必须先构建，页面才会有新代码。

### 2.3 永远不要提交

- `%USERPROFILE%\.dsh\neuro-loop\`（真实事件流与投影）
- `client.js`、`version.json`
- `daily/` 里的 `pdf/png/docx/html`
- `imports/` 原型快照
- 任何 token / 口令 / 私人截图

---

## 3. issue 标签约定

只使用下面四个标签；不要私自加标签体系。一个 issue 可以同时带多个标签，但至少带一个。

| 标签 | 用在哪 | 典型例子 | 默认处理人 |
| --- | --- | --- | --- |
| `bug` | 行为错误、崩溃、白屏、测试红了 | 悬停后整帧 NaN；启动序列某阶段不出现 | 维护 |
| `format` | 每日一页的版式 / 文字契约 | 一页装不下；填空挖了整句；出现第二人称 | 维护 + 用户确认 |
| `content` | 考点、方法卡、seed、学习资料解析 | 方法卡判据写错；考点重复；滚动选题不对 | 维护 + 用户审 |
| `print` | 打印链路、spooler、纸张 | 含渐变被 purge；队列卡 `Printing`；打印偏移 | 维护（只动 `tools/`） |

### 3.1 每个 issue 必须写清

1. **现象**：看到什么，和期望差在哪。
2. **复现**：具体命令或操作路径（例如「刷新页面 → 点数学 → hover 第三颗星」）。
3. **期望**：怎样算修好。
4. **版本**：`git rev-parse --short HEAD` 与 `version.json` 的 `build`。
5. **自检摘要**：`tools/check_all.ps1` 的 PASS/FAIL 行（没有就跑一次再贴）。

### 3.2 分诊规则

- 同一根因的多个 issue 合并成一个，其余关掉并注明主 issue。
- `print` 标签的修复**只允许**改 `tools/print_page.ps1`、`tools/daily_page.py`、
  `tools/make_docx.py` 等生成侧；不要为了打印去改 `src/`。
- `format` 标签先改 `FORMAT-politics.md`（契约），再改生成器，最后才看输出。
- `content` 标签涉及 `data/seed.json` 或 `content/method/*.json`，改完必须跑
  `python tools/check_methods.py`。
- 无法复现的 issue 标 `bug` 留在 open，写下已尝试的命令；不要凭猜改代码。

---

## 4. 每次唤醒的最小检查清单

按顺序做，**前一步不过就不进下一步**。

1. **看工作区**：`git status --short`。有未提交改动先看清楚是谁留下的；
   不确定就 `git stash` 或另开分支，**不要直接丢弃**。
2. **同步**：`git pull --ff-only`。分叉了就停下来问人，不要 merge 出一堆冲突。
3. **跑门禁**：`powershell -ExecutionPolicy Bypass -File tools/check_all.ps1`。
   - 全 PASS → 继续。
   - 有 FAIL → 这本身就是最高优先级 issue（先修红，不接新活）。
4. **读现场**：`NEXT.md` 顶部三行 + `TASKS.md` 里状态为 `WIP` / `BLOCKED` 的行
   + 当前 open issue（按 `bug` > `print` > `format` > `content` 排序）。
5. **查昨夜出纸**（唤醒时间晚于 22:40 时）：
   - `daily/` 有没有当天的 json/html/png；
   - 打印队列有没有卡在 `Printing` 的作业：

```powershell
Get-PrintJob -PrinterName "EPSON L3250 Series (副本 1)" |
    Format-Table Id, DocumentName, JobStatus, SubmittedTime
```

   卡住就清队列并重启 Spooler（可能需要管理员）：

```powershell
Get-PrintJob -PrinterName "EPSON L3250 Series (副本 1)" | Remove-PrintJob
Restart-Service Spooler
```

   出纸失败 → 开一个 `print` issue，附上 `daily/` 文件名与队列状态。
6. **只接一个 issue**：复现 → 定位 → 改 `src/host/tools` → `build.py --check` →
   `check_all.ps1` 全绿 → 中文单句提交 → 在 issue 里回 commit sha 与摘要。
7. **收尾**：更新 `TASKS.md`（做完的挪到 DONE，没验证的写「待 L3」）；
   把 issue 标成已处理（Gitee 上用 `主理鱼-已处理` 标签，或直接关闭并注明）。
8. **没有 issue**：记录一句「本轮无 issue，未动代码」然后结束。
   不主动做视觉优化、不升级依赖、不改数据。

---

## 5. 夜间出纸任务 vs 维护任务

| 维度 | 夜间出纸（每日 22:40） | 维护（有 issue 才动） |
| --- | --- | --- |
| 触发 | DSH 定时任务（每日 22:40，产出次日页） | 人工唤醒 / issue 监听 |
| 输入 | `data/seed.json`、`state.json`、`content/method/`、当天 `daily` 记录 | open issue + 当前代码 |
| 输出 | `daily/YYYY-MM-DD.*`，必要时直接打印 | 代码/文档提交 |
| 写路径 | 只写 `daily/` 与打印队列 | 只写源码、测试、文档 |
| 跑测试 | 不需要（生成器自身要能跑通） | 必须 `check_all.ps1` 全绿 |
| git | **不 commit、不 push** | 一次一件事，中文提交 |
| 失败时 | 留日志 + 开 `print` issue | 修到全绿再提交 |
| 与对方 | 22:35–22:50 不要改出纸脚本，避免读到半改状态 | 22:40 前后不改打印链路；要改先 `-Preview` 验证 |

### 5.1 出纸任务实际怎么跑

仓库里目前并存两条出纸链，**不要擅自合并**：

- **A. 扁平 GDI+ 直打**：`python tools/daily_page.py --date <日期>` 生成
  `daily/<日期>.json` / `.html` / `.png`，`--print` 时调 `tools/print_page.ps1`
  用实心块 + 细线 + 文字直接打印。预览与打印同一张位图。
- **B. Word/docx 路线**：`python tools/make_docx.py daily/<科>-<日期>.json -o daily/<科>-<日期>.docx --pdf`，
  再由 Word 打开打印；版式契约见 `FORMAT-politics.md`。

22:40 的定时任务用哪条，以定时任务自身的命令参数为准（当前由用户/主理人维护，
没有写进本仓库）。维护 agent 只保证两条都能跑、都不引入渐变。

### 5.2 出纸任务的最低自检

1. 生成成功（json 非空、页数=1）。
2. `-Preview` 的 PNG 能打开、文字不出血、没有渐变/半透明大面积填充。
3. 打印作业最终为 `Printed`；不是 `Deleting` / 长时间 `Printing`。
4. 把当天产物留在 `daily/`，不提交。

---

## 6. 交接给 superagent 的启动指令

把下面这段作为新维护会话的第一条消息（按需替换日期）：

```text
你是 neuro-loop 的长期维护 agent。工作区 C:\Users\86152\Desktop\致远\neuro-loop。
先读 AGENTS.md 与 docs/MAINTAIN.md，再跑 tools/check_all.ps1；
只处理一个 open issue（标签 bug/format/content/print 之一），
没有 issue 就停手并报告「本轮无 issue」。
禁止：改 client.js、改测试断言、装依赖、打印、push 家目录记录。
完成后给出：改了什么、check_all 摘要、commit sha。
```

---

## 7. 回滚与事故处理

| 情况 | 做法 |
| --- | --- |
| 某次提交把系统改坏 | `git revert <sha>`（不要 `reset --hard`、不要 force push） |
| 页面白屏 | 先看浏览器控制台；再跑 `check_all.ps1`；确认刷新过页面 |
| `client.js` 与 `src` 不同步 | `python build.py --check`，再刷新 |
| `state.json` 坏了 | 直接删；下次读取会从事件流重建，`rev` 应等于事件条数 |
| 打印队列堵死 | 清队列 → 重启 Spooler → 先用 `-Preview` 验证再打 |
| 误提交了敏感文件 | 立刻从工作区移除并追加 `.gitignore`；已经 push 的按 Gitee 文档清理历史，并更换凭据 |

---

## 8. 维护节奏

- **每天**：22:40 出纸（自动）；用户回填一行（`python tools/record.py "..."`）。
- **有 issue 时**：按 §4 清单处理，一次一个，当天收尾。
- **每周**：扫一遍 open issue，合并重复项；确认 `TASKS.md` 与 `NEXT.md` 没有过期。
- **每月**：检查事件流大小（`ROADMAP.md` §2 的压缩阈值：>3000 条/月或跨月）；
  备份 `~/.dsh/neuro-loop/`（仓库外，单独目录）。
- **每次改动后**：`check_all.ps1` 全绿 + 刷新页面 + 更新台账，三件事缺一不可。
