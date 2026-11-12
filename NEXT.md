现在：13 日 01:16。T-0013/T-0014 已 done 并推送（3adc874）；T-0019/T-0020 在途；空票 T-0015/T-0017/T-0021/T-0022；01:30 议事会。


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
