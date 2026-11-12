现在：13 日 01:40。用户决定——前端设计与数据库设计**周六下午（11-15 13:00）一起做**；在此之前只做低风险工程票。
议事排程已 paused；值守（每小时）继续到早上。待用户拍板：T-0025 真名在 git 历史里怎么处理（取决于仓库是否公开）。
周六议程已备：①前端信息架构（今天视图/星图/控制台的关系）②数据模型四问（见 docs/RESEARCH-PLAN.pdf §8）。

- **T-0012 已修完**：`src/045-net.js` 逾期文案 `ceil`→`floor`，`test/net.cjs` 加边界断言（多出 2.5 秒仍是 2 天）；`node test/net.cjs` 连跑 10 次 0 失败，门禁 **14/14**。
- 票单：`done 13`；待办 —— T-0013（core 归档压缩）、T-0014（host 导出路由）、T-0015（ui 审核页签，等 T-0012 已解阻）、T-0017（qa 边界回归，等 T-0013+T-0014）。
- 昨夜六会话结果：T-0016（方法卡 16 张）、T-0018（STATUS 刷新）已交付并通过复核；T-0012/T-0013 停滞 20h 已按 6h 规则回收，T-0012 由我接手补完。
- 值守 `schedule-73fcf77b` 仍每小时；07:00–23:00 有人在场时自动停手，不打印。
- 网络：`git push` 时好时坏；若本轮没推上去，明早补推（本地提交在，不会丢）。

---

## 恢复现场

1. `node tools/ticket.mjs list`
2. `node tools/bus.mjs pending`
3. `powershell -NoProfile -ExecutionPolicy Bypass -File tools/check_all.ps1`（14 项）
4. `docs/HANDBOOK.md` §8 通讯、§9 执行范围
