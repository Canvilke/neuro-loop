#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""英语周包生成器 v4。

用法：
    python tools/en_week.py plan/english/W47-2026.json -o weekly/W47/pack.html
然后（本机没有 LibreOffice，用 Edge 无头）：
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" \
        --headless=new --disable-gpu --no-pdf-header-footer \
        --print-to-pdf="weekly/W47/W47-完整包.pdf" "file:///.../pack.html"

版式原则（见 FORMAT-english.md）：
- A4；左右 20mm，上 13.5mm，下 9.5mm
- 正文 9.9pt / 行高 1.36；表格 8.4pt；答案 6.8pt
- 不加圆角、不加色块；只用横线与细表格
- 教辅口吻：陈述句、无第二人称劝勉、无括号旁白
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BOX = "\u25a1"


def load_words(n=140):
    entries = json.load(io.open(os.path.join(ROOT, "plan", "en-entries.json"), encoding="utf-8"))
    pool = []
    for e in entries:
        z = (e.get("zh") or "").split(";")[0].split(",")[0].strip().strip("（）() ")
        if not z or ".." in z or len(z) < 2:
            continue
        if z.endswith("的") or z.endswith("地"):
            continue
        pool.append(z[:14])
        if len(pool) >= n:
            break
    return pool
WD = ["\u4e00", "\u4e8c", "\u4e09", "\u56db", "\u4e94", "\u516d", "\u65e5"]

CSS = """
@page { size: A4; margin: 13.5mm 20mm 9.5mm; }
* { box-sizing: border-box; }
body { margin:0; font-family:"Microsoft YaHei","Segoe UI",sans-serif; color:#111;
       font-size:9.9pt; line-height:1.36; }
.page { position:relative; min-height:256mm; padding-bottom:6mm; page-break-after:always; }
.page:last-child { page-break-after:auto; }
.kicker { letter-spacing:2.2pt; font-size:7.4pt; color:#7a7a7a; }
h1 { font-size:14.5pt; margin:0.8mm 0 2.4mm; font-weight:700; letter-spacing:0.3pt; }
h1 .right { float:right; font-size:8.6pt; font-weight:400; color:#555; letter-spacing:0; }
h2 { font-size:10.6pt; font-weight:700; margin:2.4mm 0 1.2mm; border-left:2px solid #111;
     padding-left:2.2mm; letter-spacing:0.2pt; }
h2.first { margin-top:1.2mm; }
.rule { border-top:1px solid #111; margin:0 0 2mm; }
ul { margin:0; padding-left:4.6mm; }
li { margin:0.5mm 0; }
.two { columns:2; column-gap:8mm; }
.two li { break-inside:avoid; }
.mini { font-size:8.8pt; line-height:1.42; }
.small { font-size:8.4pt; color:#444; }
table { width:100%; border-collapse:collapse; font-size:8.4pt; margin:1.2mm 0 1.6mm; }
th, td { border:0.6pt solid #b9b9b9; padding:1.1mm 1.4mm; vertical-align:top; }
.tight th, .tight td { padding:0.85mm 1.2mm; }
th { background:#f2f2f2; font-weight:700; }
.tight h2 { margin:1.6mm 0 0.8mm; }
.lines > div { border-bottom:0.6pt solid #c9c9c9; height:6.4mm; }
.lines.slim > div { height:5.2mm; }
.cb { display:inline-block; width:3.2mm; height:3.2mm; border:0.7pt solid #666;
      vertical-align:-0.3mm; margin-right:1.2mm; }
.foot { position:absolute; left:0; right:0; bottom:0; border-top:0.5pt solid #ddd;
        padding-top:1.2mm; font-size:7.4pt; color:#8a8a8a; }
.foot .motto { float:right; font-style:italic; }
.ans { margin-top:2.2mm; border-top:0.5pt dashed #999; padding-top:1.4mm; font-size:6.8pt;
       line-height:1.36; color:#333; }
.ans b { font-weight:700; }
.hint { font-size:7.8pt; color:#666; }
.tag { display:inline-block; border:0.6pt solid #777; padding:0 1.1mm; font-size:7.4pt;
       margin-right:1.4mm; }
.wl { columns:2; column-gap:9mm; }
.wl .it { break-inside:avoid; margin:0 0 5.4mm; }
.wl .n { display:inline-block; width:5mm; color:#777; font-size:7.6pt; }
.wl .zh { font-size:9.2pt; }
.wl .ln { display:block; height:6.2mm; border-bottom:0.6pt solid #c9c9c9; margin-top:0.6mm; }
td.c { text-align:center; font-size:9pt; }
.q { margin:1.6mm 0 0; font-size:9.2pt; }
.q .num { font-weight:700; margin-right:1.4mm; }
.lab { margin:1.2mm 0 0; color:#555; }
"""


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def ul(items, cls="", inline=True):
    if not items:
        return ""
    body = "".join("<li>%s</li>" % x for x in items)
    return '<ul class="%s">%s</ul>' % (cls, body)


def lines(n, cls="lines"):
    return '<div class="%s">%s</div>' % (cls, "<div></div>" * n)


def page(inner, foot_left, motto=""):
    foot = '<div class="foot">%s' % esc(foot_left)
    if motto:
        foot += '<span class="motto">%s</span>' % esc(motto)
    foot += "</div>"
    return '<div class="page">%s%s</div>' % (inner, foot)


def week_page(d):
    rows = "".join(
        "<tr><td>%s</td><td>%s</td><td>%s</td></tr>"
        % (esc(t["item"]), esc(t["content"]), esc(t["req"])) for t in d["tasks"])
    head = "".join("<th>%s</th>" % esc(c["label"]) for c in d["checkCols"])
    plan = "".join(
        "<tr><td>%s</td><td>%s</td><td>%s</td>%s</tr>"
        % (esc(x["date"]), esc(x["grammar"]["title"] + "\u3000" + x["grammar"]["point"]), esc(x.get("slot", "")),
           "".join("<td class=\"c\">%s</td>" % BOX for _ in d["checkCols"]))
        for x in d["days"])
    inner = """
<div class="kicker">NEURO-LOOP \u00b7 ENGLISH WEEKLY PLAN</div>
<h1>\u82f1\u8bed\u5468\u8ba1\u5212 \u00b7 \u7b2c %s \u5468<span class="right">%s \u2014 %s</span></h1>
<div class="rule"></div>
<h2 class="first">\u4e00\u3001\u672c\u5468\u4efb\u52a1</h2>
<table class="tight">
<colgroup><col style="width:15%%"><col style="width:56%%"><col style="width:29%%"></colgroup>
<tr><th>\u9879\u76ee</th><th>\u5185\u5bb9</th><th>\u8981\u6c42</th></tr>
%s</table>
<h2>\u4e8c\u3001\u6bcf\u65e5\u5b89\u6392</h2>
<table class="tight">
<colgroup><col style="width:16%%"><col style="width:40%%"><col style="width:24%%">%s</colgroup>
<tr><th>\u65e5\u671f</th><th>\u767d\u672c\u8bed\u6cd5</th><th>\u9605\u8bfb / \u5199\u4f5c</th>%s</tr>
%s</table>
""" % (d["no"], esc(d["from"]), esc(d["to"]), rows, "".join('<col style="width:5%%">' for _ in d["checkCols"]), head, plan)
    return page(inner, "\u6bcf\u5929\u5b8c\u6210\u540e\u5728\u5bf9\u5e94\u683c\u5185\u5212\u4e00\u9053 \u00b7 \u7b2c %s \u5468 \u00b7 \u5171 7 \u5929" % d["no"], d.get("motto", ""))


def day_a(d):
    words = "".join('<div class="it"><span class="n">%d</span><span class="zh">%s</span>'
                    '<span class="ln"></span></div>' % (i + 1, esc(w)) for i, w in enumerate(d["words"]))
    inner = """
<div class="kicker">NEURO-LOOP \u00b7 ENGLISH DAILY</div>
<h1>\u6bcf\u65e5\u9875 \u00b7 %s<span class="right">\u7b2c %s \u5468 \u00b7 \u7b2c %d \u5929</span></h1>
<div class="rule"></div>
<h2 class="first">\u4e00\u3001\u4eca\u65e5\u4efb\u52a1</h2>
<p class="mini">%s\u7ebf\u4e0a\u80cc\u8bcd\u4e00\u8f6e\u3002%s\u7ebf\u4e0b\u80cc\u8bcd %d \u4e2a\u3002%s\u8bed\u6cd5\uff1a%s\u3002</p>
<h2>\u4e8c\u3001\u4eca\u65e5\u8bed\u6cd5</h2>
<p class="mini"><b>%s</b>\u3000%s</p>
<p class="mini hint">\u6ce8\u610f\uff1a%s</p>
<h2>\u4e09\u3001\u8bcd\u7ec4\u9ed8\u5199</h2>
<p class="small">%d \u6761\uff0c\u6309\u5e8f\u9ed8\u5199\uff0c\u4e0d\u770b\u4e66\u3002</p>
<div class="wl">%s</div>
""" % (esc(d["date"]), d["week"], d["idx"], BOX, BOX, d["wcount"], BOX,
       esc(d["grammar"]["point"]), esc(d["grammar"]["title"]), esc(d["grammar"]["detail"]),
       esc(d["grammar"]["watch"]), d["wcount"], words)
    return page(inner, "NEURO-LOOP \u00b7 \u82f1\u8bed\u6bcf\u65e5\u9875", d.get("motto", ""))


def day_b(d):
    rows = []
    for i, s in enumerate(d["sentences"], 1):
        tag = '<span class="tag">%s</span>' % esc(s["tag"])
        text = esc(s["text"])
        if s["dir"] == "zh2en":
            rows.append('<p class="q"><span class="num">%d.</span>%s%s</p>%s'
                        % (i, tag, text, lines(2)))
        else:
            rows.append(
                '<p class="q"><span class="num">%d.</span>%s%s</p>'
                '<p class="small lab">\u7ed3\u6784</p>%s'
                '<p class="small lab">\u542b\u4e49</p>%s'
                % (i, tag, text, lines(1), lines(1)))
        if s.get("hint"):
            rows.append('<p class="hint">\u63d0\u793a\uff1a%s</p>' % esc(s["hint"]))
    ans = "".join(
        '<div><b>%d.</b> %s%s</div>' % (i, ("\u7ed3\u6784\uff1a" + esc(s["struct"]) + "\u3000\u542b\u4e49\uff1a") if s["dir"] == "en2zh" else "",
                                        esc(s["answer"]))
        for i, s in enumerate(d["sentences"], 1))
    inner = """
<div class="kicker">NEURO-LOOP \u00b7 ENGLISH DAILY</div>
<h1>\u53e5\u5b50\u9875 \u00b7 %s<span class="right">\u7b2c %s \u5468 \u00b7 \u7b2c %d \u5929</span></h1>
<div class="rule"></div>
<h2 class="first">\u56db\u3001\u53e5\u5b50\u7ec3\u4e60</h2>
<p class="small">\u4e2d\u2192\u82f1\uff1a\u5199\u51fa\u82f1\u6587\u3002\u3000\u82f1\u2192\u4e2d\uff1a\u5199\u51fa\u53e5\u5b50\u7ed3\u6784\u4e0e\u542b\u4e49\uff0c\u4e0d\u5fc5\u9010\u5b57\u7ffb\u8bd1\u3002</p>
%s
<div class="ans"><b>\u53c2\u8003\u7b54\u6848</b><br>%s</div>
""" % (esc(d["date"]), d["week"], d["idx"], "".join(rows), ans)
    return page(inner, "NEURO-LOOP \u00b7 \u53e5\u5b50\u9875", d.get("motto", ""))


def notes_vocab(d):
    rows = "".join("<tr><td>%d</td><td></td><td></td><td></td><td></td><td></td></tr>" % (i + 1)
                   for i in range(18))
    inner = """
<div class="kicker">NEURO-LOOP \u00b7 ENGLISH NOTES</div>
<h1>\u8bcd\u6c47\u79ef\u7d2f<span class="right">\u7b2c %s \u5468</span></h1>
<div class="rule"></div>
<p class="small">\u53ea\u8bb0\u4e0d\u8ba4\u8bc6\u7684\u3001\u8003\u8fc7\u7684\u3001\u4f1a\u7528\u9519\u7684\u3002\u6bcf\u6761\u5e26\u4e00\u4e2a\u81ea\u9020\u53e5\u3002</p>
<table class="tight">
<colgroup><col style="width:7%%"><col style="width:20%%"><col style="width:13%%"><col style="width:25%%"><col style="width:35%%"></colgroup>
<tr><th>#</th><th>\u8bcd / \u8bcd\u7ec4</th><th>\u8bcd\u6027</th><th>\u91ca\u4e49</th><th>\u81ea\u9020\u53e5</th></tr>
%s</table>
""" % (d["no"], rows)
    return page(inner, "\u8bcd\u6c47\u79ef\u7d2f \u00b7 \u6309\u5e8f", d.get("motto", ""))


def notes_sent(d):
    rows = "".join("<tr><td>%d</td><td></td><td></td><td></td></tr>" % (i + 1) for i in range(12))
    inner = """
<div class="kicker">NEURO-LOOP \u00b7 ENGLISH NOTES</div>
<h1>\u53e5\u5b50\u79ef\u7d2f<span class="right">\u7b2c %s \u5468</span></h1>
<div class="rule"></div>
<p class="small">\u53ea\u8bb0\u8bfb\u5230\u65f6\u505c\u4e00\u4e0b\u7684\u53e5\u5b50\u3002\u5148\u62c4\u7ed3\u6784\uff0c\u518d\u5199\u81ea\u5df1\u7684\u4eff\u5199\u3002</p>
<table class="tight">
<colgroup><col style="width:7%%"><col style="width:45%%"><col style="width:22%%"><col style="width:26%%"></colgroup>
<tr><th>#</th><th>\u539f\u53e5</th><th>\u7ed3\u6784</th><th>\u4eff\u5199</th></tr>
%s</table>
""" % (d["no"], rows)
    return page(inner, "\u53e5\u5b50\u79ef\u7d2f \u00b7 \u6309\u5e8f", d.get("motto", ""))


def blank_page(d):
    cols = "".join('<div class="two" style="columns:2"><div class="lines slim">%s</div></div>'
                   % "<div></div>" * 16)
    inner = """
<div class="kicker">NEURO-LOOP \u00b7 SPARE</div>
<h1>\u7559\u767d\u9875<span class="right">\u7b2c %s \u5468</span></h1>
<div class="rule"></div>
<p class="small">\u8001\u5e08\u4e34\u65f6\u4efb\u52a1\u3001\u7075\u611f\u3001\u8865\u8bb0\u3002\u4e0d\u5206\u7c7b\uff0c\u5199\u5b8c\u5c31\u7b97\u3002</p>
%s
""" % (d["no"], cols)
    return page(inner, "NEURO-LOOP \u00b7 \u7559\u767d", d.get("motto", ""))


def writing_page(d):
    w = d["sampleWriting"]
    gloss = " \u00b7 ".join(esc(x) for x in w["gloss"])
    sents = "".join("<li>%s</li>" % esc(x) for x in w["sentences"])
    words = "".join("<li>%s</li>" % esc(x) for x in w["words"])
    prompt = esc(w["prompt"])
    for k in w.get("emph", []):
        prompt = prompt.replace(esc(k), "<u>%s</u>" % esc(k), 1)
    inner = """
<div class="kicker">NEURO-LOOP \u00b7 ENGLISH WRITING</div>
<h1>\u5199\u4f5c\u9875 \u00b7 %s<span class="right">\u7b2c %s \u5468 \u00b7 \u672c\u5468 1 \u7bc7</span></h1>
<div class="rule"></div>
<h2 class="first">\u4e00\u3001\u4efb\u52a1</h2>
<p class="mini"><span class="tag">\u4f53\u88c1</span>%s\u3000%s</p>
<p class="mini"><span class="tag">\u9898\u76ee</span>%s</p>
<p class="small">\u5173\u952e\u8bcd\uff1a%s</p>
<h2>\u4e8c\u3001\u53ef\u7528\u53e5\u5b50</h2>
<ul class="mini">%s</ul>
<h2>\u4e09\u3001\u53ef\u7528\u8bcd\u4e0e\u77ed\u8bed</h2>
<ul class="mini">%s</ul>
<h2>\u56db\u3001\u521d\u7a3f</h2>
%s
""" % (esc(w["type"]), d["no"], esc(w["type"]), esc(w["meta"]), prompt, gloss, sents, words, lines(9))
    return page(inner, "\u5199\u4f5c\u9875 \u00b7 \u521d\u7a3f\u5199\u5728\u672c\u9875\uff0c\u6279\u6539\u5199\u5728\u80cc\u9762", d.get("motto", ""))


def build(d):
    out = [week_page(d)]
    for day in d["days"]:
        out.append(day_a(day))
        out.append(day_b(day))
    out.append(notes_vocab(d))
    out.append(notes_sent(d))
    out.append(blank_page(d))
    out.append(writing_page(d))
    head = ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
            "<title>%s</title><style>%s</style></head><body>"
            % (esc("英语周包 W" + str(d["no"])), CSS))
    return head + "".join(out) + "</body></html>"


def main(argv):
    if len(argv) < 2:
        print("usage: python tools/en_week.py <week.json> [-o out.html]")
        return 2
    src = argv[1]
    out = "weekly/pack.html"
    if "-o" in argv:
        out = argv[argv.index("-o") + 1]
    d = json.load(io.open(src, encoding="utf-8"))
    pool = load_words()
    i = 0
    for day in d["days"]:
        need = int(day.get("wcount", 20))
        day["words"] = pool[i:i + need]
        i += need
        day.setdefault("idx", d["days"].index(day) + 1)
        day["week"] = str(d["no"])
    html = build(d)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    io.open(out, "w", encoding="utf-8").write(html)
    print("html:", out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))


def load_word_pairs(n=140):
    entries = json.load(io.open(os.path.join(ROOT, "plan", "en-entries.json"), encoding="utf-8"))
    out = []
    for e in entries:
        z = (e.get("zh") or "").split(";")[0].split(",")[0].strip().strip("（）() ")
        if not z or ".." in z or len(z) < 2:
            continue
        if z.endswith("的") or z.endswith("地"):
            continue
        out.append((z[:14], e.get("en") or ""))
        if len(out) >= n:
            break
    return out
