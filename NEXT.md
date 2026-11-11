# NEXT

## 现在做什么（2026-11-12 02:50）

- **六位长期会话已就位**（architect / core-dev / host-dev / ui-dev / content / qa），开工三步写在 `docs/BOOTSTRAP.md`，桌面两份 PDF 是配套材料。
- **夜间票单已备**：T-0012（ui 到期文案）、T-0013（core 归档压缩）、T-0014（host 导出路由）、T-0015（ui 审核页签，等 T-0012）、T-0016（content 方法卡 10→16）、T-0017（qa 边界回归，等 13+14）、T-0018（architect STATUS 刷新）。
- **值守**：`schedule-73fcf77b`「夜间推进 · 票单值守」已启用（03:10 起每小时）：只复核已交付的票、必要时自己做一张、每轮 commit+push；队列清空即自行 paused。出纸 `schedule-3ef21124` 与心跳 `schedule-6478f707` 保持 **paused**（打印机物理断，且不做夜间打印）。
- 白天纪律不变：用户在场即停手，不自动动代码、不打印。

---

## 恢复现场（新会话第一件事）

1. `node tools/ticket.mjs list` —— 谁在做什么
2. `node tools/bus.mjs pending` —— 有没有人在等回话
3. `powershell -NoProfile -ExecutionPolicy Bypass -File tools/check_all.ps1` —— 14 项门禁
4. 读 `docs/HANDBOOK.md` §8 通讯约定与 §9 执行范围
