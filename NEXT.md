# NEXT —— 现在做什么

## 现在到哪了（2026-11-15 14:50）

**英语周包 W47 已定稿并交付**：桌面 `英语周包-W47-终稿.docx` 与 `.pdf`（18 页，双面 9 张）。
本周不再改版式；下周只改 `plan/english/W47-2026.json`（日期 / 语法点 / 句子 / 词组区间），重跑：

```
python tools/week_docx.py plan/english/W47-2026.json -o weekly/W47/英语周包-W47-终稿.docx --bg weekly/bg-chibi.png
```

再用 Word 导出 PDF 即得新的一包。

## 项目已清理（可安全接手）

- 删掉：`weekly/W47/` 下 v1–v19 截图与中间稿、`_check*.pdf`、`pack.html`、`sample.*`、`.tmp/` 全部补丁脚本、`__pycache__`、`daily/` 里重复的 `pol-2026-11-10-v2.*`。
- 归档：桌面 4 份旧稿与旧 PDF → `致远/桌面归档-2026-11-15/英语周包-旧稿/`。
- `.gitignore` 增 `weekly/`（生成产物，不入库）。
- 保留：`plan/english/W47-2026.json`、`tools/en_week.py`（HTML 版）、`tools/week_docx.py`（Word 版，正式链路）、`weekly/bg-chibi.png`（背景图）。

## 晚些时候可以做的三件（未开工）

1. 前端信息架构（今天 / 星图 / 控制台三者关系）——周六 13:00 议程第一条。
2. 数据模型四问（`docs/RESEARCH-PLAN.pdf` §8）。
3. T-0025：`TASKS.md:92` 与 `test/boot.cjs:282` 的历史真名已清，但仓库仍需你决定「删库重建 / 转私有」。

## 三条不能碰的线

- 不清 `%USERPROFILE%\.dsh\neuro-loop\`（真源事件流）。
- 不删 `学习资料/`、`墨鸦/`、桌面归档。
- 不为过测试改断言。
