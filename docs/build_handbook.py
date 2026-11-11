# -*- coding: utf-8 -*-
"""把 docs 下的 Markdown 渲染成 A4 PDF（HTML + Edge headless --print-to-pdf）。

用法：
    python docs/build_handbook.py

产物：
    桌面\\NeuroLoop-项目手册-2026-11-12.pdf
    桌面\\NeuroLoop-角色职责书-2026-11-12.pdf
    以及同目录的 .html（便于浏览器直接看/再打印）
"""
import io
import os
import subprocess
import sys

import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DESKTOP = os.path.join(os.path.expanduser("~"), "Desktop")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
DATE = "2026-11-12"

CSS = """
@page { size: A4; margin: 17mm 15mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: "Microsoft YaHei", "Msyh", "PingFang SC", system-ui, sans-serif;
  font-size: 10.2pt; line-height: 1.78; color: #1b2430; margin: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1 {
  font-size: 19pt; font-weight: 800; letter-spacing: 0.3pt; margin: 0 0 6mm;
  padding-bottom: 3mm; border-bottom: 1.6pt solid #16202c;
}
h2 {
  font-size: 13pt; font-weight: 700; margin: 9mm 0 3mm; padding-left: 3mm;
  border-left: 3.2pt solid #2a5d8f;
}
h3 { font-size: 11pt; font-weight: 700; margin: 6mm 0 2mm; color: #22303f; }
p { margin: 0 0 2.6mm; text-align: justify; }
ul, ol { margin: 0 0 3mm; padding-left: 7mm; }
li { margin: 0 0 1.2mm; }
hr { border: 0; border-top: 0.6pt solid #ccd6e0; margin: 6mm 0; }
code {
  font-family: "Cascadia Mono", Consolas, monospace; font-size: 9pt;
  background: #f2f5f8; padding: 0.3mm 1.2mm; border-radius: 1pt;
}
pre {
  background: #f5f7fa; border: 0.5pt solid #d8e0e8; padding: 3mm;
  font-size: 8.6pt; line-height: 1.55; overflow: hidden; page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: 8.6pt; }
table {
  width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.2pt;
  page-break-inside: auto;
}
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th, td { border: 0.5pt solid #c9d4df; padding: 1.6mm 2mm; vertical-align: top; }
th { background: #eef2f6; font-weight: 700; text-align: left; }
td { word-break: break-word; }
a { color: #1f5c96; text-decoration: none; }
blockquote {
  margin: 2mm 0 3mm; padding: 1.5mm 4mm; border-left: 2pt solid #b9c8d8;
  background: #f7f9fb; color: #33414f;
}
.cover { page-break-after: always; padding-top: 34mm; }
.cover .kicker { font-size: 9pt; letter-spacing: 3pt; color: #6b7b8c; }
.cover h1 { font-size: 30pt; border: 0; padding: 0; margin: 6mm 0 4mm; letter-spacing: 1pt; }
.cover .sub { font-size: 12pt; color: #3d4d5e; margin-bottom: 14mm; }
.cover-meta { width: 150mm; font-size: 9.6pt; margin-top: 2mm; border: 0; }
.cover-meta th { width: 26mm; background: none; border: 0; border-bottom: 0.4pt solid #dde5ec; font-weight: 700; padding: 2mm 0; }
.cover-meta td { border: 0; border-bottom: 0.4pt solid #dde5ec; padding: 2mm 0; }
.cover .meta div { display: flex; gap: 6mm; }
.cover .meta b { flex: none; }
.cover .meta b { display: block; width: 24mm; color: #16202c; }
.cover .rule { border-top: 1.4pt solid #16202c; margin: 10mm 0 6mm; width: 42mm; }
"""

COVER = """
<div class="cover">
  <div class="kicker">NEURO&#8209;LOOP &middot; PROJECT DOCUMENT</div>
  <h1>{title}</h1>
  <div class="sub">{sub}</div>
  <div class="rule"></div>
  <table class="cover-meta">
    <tr><th>文档编号</th><td>{no}</td></tr>
    <tr><th>版本</th><td>v1.0</td></tr>
    <tr><th>编制</th><td>主会话（lead）</td></tr>
    <tr><th>日期</th><td>{date}</td></tr>
    <tr><th>项目</th><td>认知终端（DSH 插件 @local/neuro-loop）</td></tr>
    <tr><th>工作区</th><td>C:\\Users\\86152\\Desktop\\致远</td></tr>
  </table>
</div>
"""


def render(md_path, title, sub, no, out_pdf):
    src = io.open(md_path, encoding="utf-8").read()
    # 封面已经有标题与文档信息，正文里去掉重复的一级标题，改为「文档信息」小节
    if src.startswith("# "):
        first_nl = src.index("\n")
        src = "## 文档信息\n" + src[first_nl + 1:]
    body = markdown.markdown(
        src, extensions=["tables", "fenced_code", "sane_lists", "nl2br"], output_format="html5"
    )
    html = (
        "<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\">"
        "<title>{t}</title><style>{css}</style></head><body>{cover}{body}</body></html>"
    ).format(
        t=title,
        css=CSS,
        cover=COVER.format(title=title, sub=sub, no=no, date=DATE),
        body=body,
    )
    html_path = os.path.splitext(out_pdf)[0] + ".html"
    io.open(html_path, "w", encoding="utf-8").write(html)
    subprocess.run(
        [
            EDGE,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--print-to-pdf=" + out_pdf,
            "file:///" + html_path.replace("\\", "/"),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    size = os.path.getsize(out_pdf)
    print("pdf: %s (%d bytes)" % (out_pdf, size))
    return out_pdf


def main():
    jobs = [
        (
            os.path.join(HERE, "HANDBOOK.md"),
            "Neuro-Loop 项目手册",
            "项目来源 &middot; 结构 &middot; 数据落点 &middot; 任务分配 &middot; 协作约定",
            "NL-HB-001",
            os.path.join(DESKTOP, "NeuroLoop-项目手册-%s.pdf" % DATE),
        ),
        (
            os.path.join(HERE, "ROLES.md"),
            "Neuro-Loop 角色职责书",
            "六个专项负责人 &middot; 职责 &middot; 写域 &middot; 验收 &middot; 禁止事项",
            "NL-RB-001",
            os.path.join(DESKTOP, "NeuroLoop-角色职责书-%s.pdf" % DATE),
        ),
    ]
    for md, title, sub, no, out in jobs:
        render(md, title, sub, no, out)


if __name__ == "__main__":
    main()
