#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""英语周包 → Word（可编辑）版本。

用法：
    python tools/week_docx.py plan/english/W47-2026.json -o weekly/W47/W47-完整包.docx

与 PDF 版共用同一份 JSON；版式按页分节，每页一个分页符。
背景为一张极淡的虚化图，放进页眉、衬于文字下方（behindDoc），打印时几乎不耗墨。
"""
import io
import json
import os
import sys

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = "微软雅黑"
GREY = RGBColor(0x55, 0x55, 0x55)
LGREY = RGBColor(0x88, 0x88, 0x88)
BOX = "\u25a1"


def setup(doc):
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.0)
    sec.top_margin = Cm(1.35)
    sec.bottom_margin = Cm(0.95)
    st = doc.styles["Normal"]
    st.font.name = FONT
    st.font.size = Pt(10)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    st.paragraph_format.space_before = Pt(0)
    st.paragraph_format.space_after = Pt(0)
    st.paragraph_format.line_spacing = 1.15


def P(container, text="", size=10, bold=False, color=None, align=None, before=0, after=0,
      line=1.15, indent=0, italic=False):
    p = container.add_paragraph()
    pf = p.paragraph_format
    pf.space_before, pf.space_after, pf.line_spacing = Pt(before), Pt(after), line
    if indent:
        pf.first_line_indent = Cm(indent)
    if align == "right":
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    elif align == "center":
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if text:
        r = p.add_run(text)
        r.font.size = Pt(size)
        r.bold = bold
        r.italic = italic
        r.font.name = FONT
        r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        if color is not None:
            r.font.color.rgb = color
    return p


def border(p, edges=("bottom",), sz=4, color="C9C9C9", dash=None):
    ppr = p._element.get_or_add_pPr()
    bdr = ppr.find(qn("w:pBdr"))
    if bdr is None:
        bdr = OxmlElement("w:pBdr")
        ppr.append(bdr)
    for e in edges:
        el = OxmlElement("w:" + e)
        el.set(qn("w:val"), dash or "single")
        el.set(qn("w:sz"), str(sz))
        el.set(qn("w:space"), "1")
        el.set(qn("w:color"), color)
        bdr.append(el)


def write_line(container, h=0.55, sz=4):
    p = P(container, "", size=1, line=1.0)
    p.paragraph_format.space_before = Pt(2)
    border(p, sz=sz)
    p.paragraph_format.line_spacing = Pt(h * 28.35)
    return p


def h1(doc, left, right=""):
    p = P(doc, "", size=14)
    r = p.add_run(left)
    r.bold, r.font.size = True, Pt(14.5)
    r.font.name = FONT
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    if right:
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r2 = p.add_run("\t" + right)
        r2.font.size, r2.font.color.rgb = Pt(8.6), GREY
        r2.font.name = FONT
        r2._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        tabs = p.paragraph_format.tab_stops
        tabs.add_tab_stop(Cm(17.0), alignment=2)
    border(p, ("bottom",), sz=8, color="111111")
    p.paragraph_format.space_after = Pt(4)


def h2(doc, text):
    p = P(doc, text, size=10.6, bold=True, before=6, after=3)
    border(p, ("left",), sz=16, color="111111")
    p.paragraph_format.left_indent = Cm(0.15)
    return p


def cell_text(cell, text, size=8.4, bold=False, align=None):
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after = Pt(1)
    p.paragraph_format.line_spacing = 1.05
    if align == "center":
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.bold = bold
    r.font.name = FONT
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)


def table(doc, rows, cols, widths):
    t = doc.add_table(rows=rows, cols=cols)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for i, w in enumerate(widths):
        for row in t.rows:
            row.cells[i].width = Cm(w)
    # 细边框
    tbl = t._tbl
    tblPr = tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for e in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement("w:" + e)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:color"), "B9B9B9")
        borders.append(el)
    tblPr.append(borders)
    return t


def shade(cell, hexcolor="F2F2F2"):
    tcPr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:fill"), hexcolor)
    tcPr.append(sh)


def add_background(section, img_path):
    """把图片放进页眉，设为衬于文字下方（behindDoc）。"""
    hdr = section.header
    p = hdr.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    run.add_picture(img_path, width=Cm(21.0))
    inline = run._element.find(qn("w:drawing")).find(qn("wp:inline"))
    anchor = OxmlElement("wp:anchor")
    anchor.set("behindDoc", "1")
    anchor.set("distT", "0")
    anchor.set("distB", "0")
    anchor.set("distL", "0")
    anchor.set("distR", "0")
    anchor.set("simplePos", "0")
    anchor.set("relativeHeight", "0")
    anchor.set("locked", "0")
    anchor.set("layoutInCell", "1")
    anchor.set("allowOverlap", "1")
    sp = OxmlElement("wp:simplePos")
    sp.set("x", "0")
    sp.set("y", "0")
    anchor.append(sp)
    for tag, rel, off in (("wp:positionH", "page", "0"), ("wp:positionV", "page", "0")):
        el = OxmlElement(tag)
        el.set("relativeFrom", rel)
        o = OxmlElement("wp:posOffset")
        o.text = off
        el.append(o)
        anchor.append(el)
    extent = inline.find(qn("wp:extent"))
    anchor.append(extent)
    effect = OxmlElement("wp:effectExtent")
    for k in ("l", "t", "r", "b"):
        effect.set(k, "0")
    anchor.append(effect)
    anchor.append(OxmlElement("wp:wrapNone"))
    doc_pr = inline.find(qn("wp:docPr"))
    anchor.append(doc_pr)
    A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    graphic = inline.find(A + "graphic")
    if graphic is not None:
        anchor.append(graphic)
    for child in list(inline):
        inline.remove(child)
    drawing = run._element.find(qn("w:drawing"))
    drawing.replace(inline, anchor)


def make_bg(path):
    """极淡的虚化背景：冷灰渐变 + 模糊星点，几乎不耗墨。"""
    from PIL import Image, ImageDraw, ImageFilter
    W, H = 1240, 1754
    im = Image.new("RGB", (W, H), "#ffffff")
    d = ImageDraw.Draw(im)
    for y in range(H):
        k = y / H
        v = int(252 - 8 * (1 - abs(k - 0.45) * 2))
        d.line([(0, y), (W, y)], fill=(v, v + 1, min(255, v + 3)))
    # 左上角一团淡青，右下角一团淡灰
    for cx, cy, r, col in ((260, 300, 420, (224, 236, 242)), (1000, 1450, 520, (238, 238, 241))):
        layer = Image.new("RGB", (W, H), (255, 255, 255))
        dl = ImageDraw.Draw(layer)
        dl.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
        layer = layer.filter(ImageFilter.GaussianBlur(140))
        im = Image.blend(im, layer, 0.55)
    # 稀疏星点
    import random
    random.seed(47)
    pts = Image.new("RGB", (W, H), (255, 255, 255))
    dp = ImageDraw.Draw(pts)
    for _ in range(220):
        x, y = random.randrange(W), random.randrange(H)
        v = random.randint(228, 243)
        dp.ellipse([x, y, x + 1, y + 1], fill=(v, v, v + 2))
    pts = pts.filter(ImageFilter.GaussianBlur(0.8))
    im = Image.blend(im, pts, 0.35)
    im.save(path, quality=88)


def week_page(doc, d):
    P(doc, "NEURO-LOOP \u00b7 ENGLISH WEEKLY PLAN", size=7.4, color=LGREY, after=2)
    h1(doc, "英语学习指南 \u00b7 第 %s 周" % d["no"], "%s \u2014 %s" % (d["from"], d["to"]))
    h2(doc, "一、本周任务")
    t = table(doc, len(d["tasks"]) + 1, 3, [3.0, 10.4, 4.6])
    for i, h in enumerate(("项目", "内容", "要求")):
        cell_text(t.cell(0, i), h, 8.6, True)
        shade(t.cell(0, i))
    for r, x in enumerate(d["tasks"], 1):
        cell_text(t.cell(r, 0), x["item"], 8.6)
        cell_text(t.cell(r, 1), x["content"])
        cell_text(t.cell(r, 2), x["req"])
    h2(doc, "二、每日安排")
    cols = [2.9, 7.2, 4.4] + [1.0] * len(d["checkCols"])
    t = table(doc, 8, 3 + len(d["checkCols"]), cols)
    heads = ["日期", "白本语法", "阅读 / 写作"] + [c["label"] for c in d["checkCols"]]
    for i, h in enumerate(heads):
        cell_text(t.cell(0, i), h, 8.4, True, "center" if i >= 3 else None)
        shade(t.cell(0, i))
    for r, x in enumerate(d["days"], 1):
        cell_text(t.cell(r, 0), x["date"], 8.4)
        cell_text(t.cell(r, 1), x.get("grammarText") or x["grammar"]["point"], 8.4)
        cell_text(t.cell(r, 2), x.get("slot", ""), 8.4)
        for c in range(len(d["checkCols"])):
            cell_text(t.cell(r, 3 + c), BOX, 9, align="center")
    P(doc, "每日完成后在对应格内标注，周末汇总。", size=8.4, color=GREY, before=3)
    if d.get("motto"):
        P(doc, d["motto"], size=9, color=LGREY, align="right", italic=True, before=6)


def day_a(doc, d, day):
    P(doc, "NEURO-LOOP \u00b7 ENGLISH DAILY", size=7.4, color=LGREY, after=2)
    h1(doc, "基础模块 A \u00b7 %s" % day["date"], "第 %s 周 \u00b7 第 %d 天" % (d["no"], day["idx"]))
    h2(doc, "一、今日任务")
    P(doc, "%s 线上背词一轮。%s 线下背词 %d 个。%s 语法：%s。"
      % (BOX, BOX, day["wcount"], BOX, day["grammar"]["point"]), size=9.6, after=3)
    h2(doc, "二、今日语法")
    p = doc.add_paragraph()
    r = p.add_run(day["grammar"]["point"] + "　")
    r.bold, r.font.size = True, Pt(9.8)
    r.font.name = FONT
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r2 = p.add_run(day["grammar"]["detail"])
    r2.font.size = Pt(9.8)
    r2.font.name = FONT
    r2._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    P(doc, "注意：" + day["grammar"]["watch"], size=8.6, color=GREY, before=2)
    h2(doc, "三、词组默写")
    P(doc, "共 %d 条。" % day["wcount"], size=8.4, color=GREY, after=2)
    n = len(day["words"])
    half = (n + 1) // 2
    t = table(doc, half, 2, [8.6, 8.6])
    no_borders(t)
    base = (day["idx"] - 1) * n
    for i in range(half):
        t.rows[i].height = Cm(0.92)
        for c in range(2):
            k = i + c * half
            if k >= n:
                continue
            cell = t.cell(i, c)
            cell.text = ""
            p0 = cell.paragraphs[0]
            p0.paragraph_format.space_before = Pt(0)
            p0.paragraph_format.space_after = Pt(0)
            r = p0.add_run("%d. " % (base + k + 1))
            r.font.size = Pt(8.8)
            r.font.name = FONT
            r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
            r2 = p0.add_run(day["words"][k])
            r2.font.size = Pt(9.2)
            r2.font.name = FONT
            r2._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
            r3 = p0.add_run("\u3000" + "_" * 8)
            r3.font.size = Pt(9.2)
            r3.font.name = FONT


def no_borders(t):
    tblPr = t._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement("w:" + edge)
        el.set(qn("w:val"), "nil")
        borders.append(el)
    tblPr.append(borders)


def day_a_tail(doc, d, day):
    h2(doc, "四、参考答案")
    ans = day.get("answers") or []
    if not ans:
        return
    n = len(ans)
    half = (n + 1) // 2
    t = table(doc, half, 2, [8.6, 8.6])
    no_borders(t)
    base = (day["idx"] - 1) * n
    for i in range(half):
        t.rows[i].height = Cm(0.64)
        for c in range(2):
            kk = i + c * half
            if kk >= n:
                continue
            cell = t.cell(i, c)
            cell.text = ""
            p0 = cell.paragraphs[0]
            p0.paragraph_format.space_before = Pt(0)
            p0.paragraph_format.space_after = Pt(0)
            r = p0.add_run("%d. %s" % (base + kk + 1, ans[kk]))
            r.font.size = Pt(8.0)
            r.font.name = FONT
            r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)


def day_b(doc, d, day):
    P(doc, "NEURO-LOOP \u00b7 ENGLISH DAILY", size=7.4, color=LGREY, after=2)
    h1(doc, "拓展模块 B \u00b7 %s" % day["date"], "第 %s 周 \u00b7 第 %d 天" % (d["no"], day["idx"]))
    h2(doc, "四、句子练习")
    P(doc, "中→英：写出英文。　英→中：写出句子结构与含义，不必逐字翻译。",
      size=8.6, color=GREY, after=3)
    for i, s in enumerate(day["sentences"], 1):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(3)
        r = p.add_run("%d." % i)
        r.bold, r.font.size = True, Pt(9.2)
        r.font.name = FONT
        r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        tag = p.add_run("［%s］" % s["tag"])
        tag.font.size, tag.font.color.rgb = Pt(7.8), GREY
        tag.font.name = FONT
        tag._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        body = p.add_run(" " + s["text"])
        body.font.size = Pt(9.2)
        body.font.name = FONT
        body._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        if s["dir"] == "zh2en":
            write_line(doc)
            write_line(doc)
        else:
            P(doc, "结构", size=8.0, color=GREY, before=1)
            write_line(doc)
            P(doc, "含义", size=8.0, color=GREY, before=1)
            write_line(doc)
        if s.get("hint"):
            tip = "结构提示：" + (s.get("shint") or "")
            if s.get("hint"):
                tip += "\u3000词汇：" + s["hint"]
            P(doc, tip, size=7.8, color=GREY, before=0)
    # 答案
    p = P(doc, "参考答案", size=8.0, bold=True, before=5)
    border(p, ("top",), sz=4, dash="dashed", color="999999")
    for i, s in enumerate(day["sentences"], 1):
        if s["dir"] == "en2zh":
            P(doc, "%d. 结构：%s　含义：%s" % (i, s["struct"], s["answer"]), size=6.4, color=GREY, line=1.0)
        else:
            P(doc, "%d. %s" % (i, s["answer"]), size=6.4, color=GREY, line=1.0)


def notes_vocab(doc, d):
    P(doc, "NEURO-LOOP \u00b7 ENGLISH NOTES", size=7.4, color=LGREY, after=2)
    h1(doc, "词汇积累", "第 %s 周" % d["no"])
    P(doc, "只记不认识的、考过的、会用错的。每条带一个自造句。", size=8.4, color=GREY, after=4)
    t = table(doc, 19, 5, [1.0, 3.6, 2.2, 4.2, 6.0])
    for i, h in enumerate(("#", "词 / 词组", "词性", "释义", "自造句")):
        cell_text(t.cell(0, i), h, 8.4, True, "center" if i == 0 else None)
        shade(t.cell(0, i))
    for r in range(1, 19):
        cell_text(t.cell(r, 0), str(r), 8.4, align="center")
        t.rows[r].height = Cm(0.98)


def notes_sent(doc, d):
    P(doc, "NEURO-LOOP \u00b7 ENGLISH NOTES", size=7.4, color=LGREY, after=2)
    h1(doc, "记录页", "第 %s 周" % d["no"])

    h2(doc, "一、词汇记录")
    t = table(doc, 9, 4, [4.4, 2.2, 5.2, 5.4])
    for i, h in enumerate(("词 / 词组", "词性", "释义", "例句")):
        cell_text(t.cell(0, i), h, 8.4, True, "center" if i == 1 else None)
        shade(t.cell(0, i))
    for r in range(1, 9):
        cell_text(t.cell(r, 0), "", 8.6)
        t.rows[r].height = Cm(1.02)

    h2(doc, "二、笔记记录")
    box_lines(doc, 5)
    h2(doc, "三、其它事项")
    box_lines(doc, 4)


def box_lines(doc, n):
    t = table(doc, n, 1, [17.2])
    for r in range(n):
        cell_text(t.cell(r, 0), "", 9)
        t.rows[r].height = Cm(1.05)


def blank_page(doc, d, tag="留白页"):
    P(doc, "NEURO-LOOP \u00b7 SPARE", size=7.4, color=LGREY, after=2)
    h1(doc, tag, "第 %s 周" % d["no"])
    P(doc, "老师临时任务、灵感、补记。不分类，写完就算。", size=8.4, color=GREY, after=4)
    half = 18
    t = table(doc, half, 2, [8.6, 8.6])
    for r in range(half):
        for c in range(2):
            cell_text(t.cell(r, c), "", 9)
            t.rows[r].height = Cm(1.05)


def writing_page(doc, d):
    w = d["sampleWriting"]
    P(doc, "NEURO-LOOP \u00b7 ENGLISH WRITING", size=7.4, color=LGREY, after=2)
    h1(doc, "写作页 \u00b7 %s" % w["type"], "第 %s 周 \u00b7 本周 1 篇" % d["no"])
    h2(doc, "一、任务")
    p = P(doc, "", size=9.2, after=2)
    r = p.add_run("［体裁］")
    r.font.size, r.bold = Pt(7.8), True
    r.font.name = FONT
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r2 = p.add_run("%s　%s" % (w["type"], w["meta"]))
    r2.font.size = Pt(9.2)
    r2.font.name = FONT
    r2._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    r = p.add_run("［题目］")
    r.font.size, r.bold = Pt(7.8), True
    r.font.name = FONT
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    # 题目正文：关键词加下划线
    text = w["prompt"]
    emph = w.get("emph", [])
    idx = 0
    pieces = []
    while idx < len(text):
        hit = None
        for e in emph:
            if text.startswith(e, idx):
                hit = e
                break
        if hit:
            pieces.append((hit, True))
            idx += len(hit)
        else:
            pieces.append((text[idx], False))
            idx += 1
    buf = ""
    for ch, is_emph in pieces:
        if is_emph:
            if buf:
                rr = p.add_run(buf)
                rr.font.size = Pt(9.2)
                rr.font.name = FONT
                rr._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
                buf = ""
            rr = p.add_run(ch)
            rr.font.size = Pt(9.2)
            rr.underline = True
            rr.font.name = FONT
            rr._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        else:
            buf += ch
    if buf:
        rr = p.add_run(buf)
        rr.font.size = Pt(9.2)
        rr.font.name = FONT
        rr._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    P(doc, "关键词：" + " · ".join(w["gloss"]), size=8.4, color=GREY, before=3)
    h2(doc, "二、结构提示")
    for lab, txt in w.get("struct", []):
        p = P(doc, "", size=8.9, after=0, line=1.12)
        r = p.add_run(lab + "\u3000")
        r.bold, r.font.size = True, Pt(8.9)
        r.font.name = FONT
        r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        r2 = p.add_run(txt)
        r2.font.size = Pt(8.9)
        r2.font.name = FONT
        r2._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    h2(doc, "三、可用句子")
    for x in w["sentences"]:
        if isinstance(x, dict):
            p = P(doc, "", size=8.3, after=0, line=1.06)
            r = p.add_run("\u3010%s\u3011 " % x.get("tag", ""))
            r.bold, r.font.size = True, Pt(7.8)
            r.font.name = FONT
            r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
            r2 = p.add_run(x["text"] + "\u3000\u3000" + x.get("hint", ""))
            r2.font.size = Pt(8.3)
            r2.font.name = FONT
            r2._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        else:
            P(doc, "· " + x, size=8.3, after=0, line=1.04)
    h2(doc, "四、可用词与短语")
    for x in w["words"]:
        if isinstance(x, dict):
            P(doc, "· " + x["w"] + "\u3000" + x.get("note", ""), size=8.3, after=0, line=1.02)
        else:
            P(doc, "· " + x, size=8.3, after=0, line=1.02)
    h2(doc, "五、初稿")
    for _ in range(4):
        write_line(doc, h=0.5)


def build(src, out, bg=None):
    d = json.load(io.open(src, encoding="utf-8"))
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    from en_week import load_word_pairs
    pool, k = load_word_pairs(300), 0
    for day in d["days"]:
        need = int(day.get("wcount", 20))
        if not day.get("words"):
            chunk = pool[k:k + need]
            day["words"] = [z for z, _ in chunk]
            day["answers"] = [en for _, en in chunk]
            k += need
    doc = Document()
    setup(doc)
    if bg:
        add_background(doc.sections[0], bg)
    week_page(doc, d)
    for i, day in enumerate(d["days"], 1):
        day.setdefault("idx", i)
        doc.add_page_break()
        day_a(doc, d, day)
        day_a_tail(doc, d, day)
        doc.add_page_break()
        day_b(doc, d, day)
    doc.add_page_break()
    notes_sent(doc, d)
    doc.add_page_break()
    blank_page(doc, d, "留白页")
    doc.add_page_break()
    writing_page(doc, d)
    doc.save(out)
    return out


def main(argv):
    if len(argv) < 2:
        print("usage: python tools/week_docx.py <week.json> [-o out.docx] [--bg image.png]")
        return 2
    src = argv[1]
    out = "weekly/W47/W47-完整包.docx"
    if "-o" in argv:
        out = argv[argv.index("-o") + 1]
    bg = os.path.join(ROOT, "weekly", "bg-soft.jpg")
    if "--bg" in argv:
        bg = argv[argv.index("--bg") + 1]
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    if not os.path.exists(bg):
        make_bg(bg)
        print("bg:", bg)
    build(src, out, bg)
    print("docx:", out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
