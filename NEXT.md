# NEXT

## 现在做什么（2026-11-11 01:56，端到端维护已通；两个定时任务均 paused）
1. **主线已通**：`intake → ticket → brief → 子代理 claim → 门禁 → Lead done`，本轮真实闭环 3 张票（T-0001 路由外壳、T-0002 批量导入、T-0006 控制台未读），另 1 张（T-0008 v1 ok 兼容）由我直接修。门禁 **13 项全绿**，远端 `490fba7`。
2. **并发安全**：`check_all.ps1` 已加目录锁——两个 agent 同时跑门禁会互相重建 `client.js`，那是 `net.cjs` 偶发失败的根因。
3. **定时任务**：`schedule-3ef21124`（07:00 出纸）与 `schedule-6478f707`（40min 心跳）都是 `paused`，明早不会自己跑；要恢复由用户说一声。
4. **卡点**：GitHub watcher 装不上（`api.github.com` 被改写 301 → `github.com`，`gh auth login --with-token` 报 406）；推送走 `github.com` 正常。Gitee 令牌路线见 `docs/BUS.md`。

## 2026-11-10 02:00 数据模型 v2 研究
- 交付 `docs/RESEARCH-PLAN.pdf`（8 页，HTML→Edge headless 出 PDF）。
- 等用户对报告第 8 节四个问题拍板：先做哪层 / 方法是否必填 / 缓存命中口径 / 录入成本上限。
- 未动代码；本周主线仍是「软件可用」。

# NEXT —— 换一个会话、或换一天回来，先读这一页

## 现在做什么（三行）
0. **2026-11-10 01:35 · 「今天」视图已上线（本地已提交）**：宿主 `GET /neuroloop/today` 按 `plan/*.json` 算出今天两份资料、数理化任务行、到期与两张纸状态；侧栏新增「今天」面板，可勾「完/半/未」并写 `daily` 事件。**需 F5 刷新**；已推送 `2ad06bf`（远端与本地一致）。
1. **本周主线见 [WEEK-01.md](WEEK-01.md)，本周不出纸质页**：周三做「屏上自评闭环」（到期逐条对/错），周四方法卡审核入口。
2. **先跑体检**：`powershell -File tools/check_all.ps1`（7 项，当前全绿）；改完必须 L1+L2 全绿才算完。

## 这个系统是什么
`neuro-loop/` 是一个 DSH 客户端插件：把「高三的认知状态」画成一片可以旋转、可以点、可以判定的星图。
入口有两个：DSH 每次加载都会自己播一遍七拍启动序列（自检 → 星图同步 → 身份验证 → 通道简报 → 通道清单 → 扫描线 → 跃迁），
选「学习模式」进星图，「编程模式」回原生会话。`M` 键随时重新拉起。

## 现在到哪了

- 后端重构三步全部 done：**T-0009 拆路由 ✅（index.js 329→69）→ T-0010 幂等键 ✅ → T-0011 数据契约 ✅**
- 门禁 14 项全绿；`test/host.mjs` 151 条断言
- **未推送**：本地 `af00a76` 之后还有一个提交（T-0010），`git push` 连吃两次 `Recv failure: Connection was reset`，网络恢复后先 `git push origin main`
- 台账：ready 1（T-0004 写域冲突回归）/ blocked 1（T-0005 重叠测试票，非真票）

## 怎么验证（三级，别跳级）
```bash
cd neuro-loop
python build.py --check      # L1 构建 + node --check
node test/smoke.cjs          # L2 渲染冒烟（652 帧）
node test/levels.cjs         # L2 分层
node test/boot.cjs           # L2 启动七阶段
node test/net.cjs            # L2 客户端接线 + 调度
node test/host.mjs           # L2 宿主路由 + 事件流
```
**L3 只能靠真人看**：改完 `client.js` 必须刷新页面才生效；我（AI）不能自己截图，任何"看起来怎样"都必须由用户确认。

## 三条不能碰的线
1. `~/.dsh/neuro-loop/` 是真实记录：不要删、不要提交到 git、不要为了让测试通过而清空。
2. `client.js` 是构建产物：只改 `src/*.js` 和 `data/seed.json`，然后重新构建。
3. 红色只属于警报（假阳性 / 盲区）。星体本体只用冷色阶 —— 这是用户明确提过的"颜色奇怪"的根因。

## 如果用户不在、只有我一个人
- 一次只推进 `ROADMAP.md` 里的一条，做完就更新 `TASKS.md` 并留下可回滚的状态。
- 不擅自改数据、不删用户资料、不装新依赖。
- 没有 L3 反馈时，不连续做第三轮纯视觉调整（会越调越偏），转去做测试、文档或后端。
