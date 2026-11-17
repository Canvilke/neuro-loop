# -*- coding: utf-8 -*-
"""把 给同学的一封信-DSH.md 排成一份干净的 A4 文档（docx）。

用法：python tools/make_letter.py [输入.md] [输出.docx]
"""
import io
import os
import re
import sys

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

import os
FONT = os.environ.get("LETTER_FONT", "Microsoft YaHei")
BODY = float(os.environ.get("LETTER_BODY", "10.5"))
INK = RGBColor(0x1A, 0x1A, 0x1A)
GREY = RGBColor(0x5A, 0x5A, 0x5A)


def cn_font(run, name=FONT):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)


def setup(doc):
    s = doc.sections[0]
    s.page_width, s.page_height = Cm(21.0), Cm(29.7)
    s.top_margin, s.bottom_margin = Cm(2.2), Cm(2.0)
    s.left_margin, s.right_margin = Cm(2.4), Cm(2.4)
    st = doc.styles["Normal"]
    st.font.name = FONT
    st.font.size = Pt(BODY)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    st.paragraph_format.space_before = Pt(0)
    st.paragraph_format.space_after = Pt(6)
    st.paragraph_format.line_spacing = 1.55


def left_bar(p, color="C9D3DE", size=18):
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), str(size))
    left.set(qn("w:space"), "8")
    left.set(qn("w:color"), color)
    bdr.append(left)
    pPr.append(bdr)


def bottom_rule(p, color="DDE3EA"):
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), color)
    bdr.append(bottom)
    pPr.append(bdr)


def add_runs(p, text, size=BODY, color=INK, italic=False, bold_all=False):
    """支持 **粗体** 与 `等宽`。"""
    for part in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not part:
            continue
        bold = italic_run = False
        t = part
        if part.startswith("**") and part.endswith("**"):
            t, bold = part[2:-2], True
        elif part.startswith("`") and part.endswith("`"):
            t, bold = part[1:-1], False
        r = p.add_run(t)
        r.font.size = Pt(size)
        r.font.color.rgb = color
        r.bold = bold or bold_all
        r.italic = italic
        if part.startswith("`"):
            cn_font(r, "Consolas")
        else:
            cn_font(r)


def para(doc, text, size=BODY, color=INK, italic=False, after=6, before=0, indent=0):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.space_before = Pt(before)
    if indent:
        p.paragraph_format.left_indent = Cm(indent)
    add_runs(p, text, size=size, color=color, italic=italic)
    return p


def heading(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(7)
    p.paragraph_format.left_indent = Cm(0.34)
    left_bar(p)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(12.5)
    r.font.color.rgb = RGBColor(0x14, 0x14, 0x14)
    cn_font(r)
    return p


def quote(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.8)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(10)
    p.paragraph_format.line_spacing = 1.45
    left_bar(p, "BCD0E4", 24)
    add_runs(p, text, size=9.8, color=GREY, italic=True)
    return p


def cover(doc, title, sub, kicker="NEURO-LOOP  ·  一封信"):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(40)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(kicker)
    r.font.size = Pt(8)
    r.font.color.rgb = GREY
    cn_font(r)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(title)
    r.bold = True
    r.font.size = Pt(21)
    cn_font(r)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(14)
    r = p.add_run(sub)
    r.font.size = Pt(10)
    r.font.color.rgb = GREY
    cn_font(r)
    bottom_rule(p)


def footer(doc, text):
    p = doc.sections[0].footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = p.add_run(text)
    r.font.size = Pt(7.5)
    r.font.color.rgb = GREY
    cn_font(r)


def add_table(doc, rows):
    if not rows:
        return
    ncol = max(len(r) for r in rows)
    t = doc.add_table(rows=0, cols=ncol)
    t.autofit = True
    t.style = "Table Grid"
    for ri, row in enumerate(rows):
        cells = t.add_row().cells
        for ci in range(ncol):
            txt = row[ci] if ci < len(row) else ""
            p = cells[ci].paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.25
            add_runs(p, txt, size=9.3, color=INK if ri else RGBColor(0x14, 0x14, 0x14))
            if ri == 0:
                for r in p.runs:
                    r.bold = True
                trPr = t.rows[0]._tr.get_or_add_trPr()
                hdr = OxmlElement("w:tblHeader")
                hdr.set(qn("w:val"), "true")
                trPr.append(hdr)
    for r_ in t.rows:
        for c in r_.cells:
            for p0 in c.paragraphs:
                for run in p0.runs:
                    cn_font(run)
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_after = Pt(2)
    p_after.paragraph_format.line_spacing = 1.0
    for run in p_after.runs:
        run.font.size = Pt(2)


def add_background(doc, png):
    """把图放进页眉并锚定到页面背后。子节点顺序必须符合 OOXML：
    simplePos, positionH, positionV, extent, effectExtent, wrapNone, docPr, graphic。"""
    if not os.path.exists(png):
        return
    sec = doc.sections[0]
    hdr_p = sec.header.paragraphs[0]
    run = hdr_p.add_run()
    run.add_picture(png, width=sec.page_width, height=sec.page_height)

    drawing = run._element.find(qn("w:drawing"))
    inline = drawing[0]
    extent = inline.find(qn("wp:extent"))

    anchor = OxmlElement("wp:anchor")
    for k, v in (("distT", "0"), ("distB", "0"), ("distL", "0"), ("distR", "0"),
                 ("simplePos", "0"), ("relativeHeight", "0"), ("behindDoc", "1"),
                 ("locked", "0"), ("layoutInCell", "1"), ("allowOverlap", "1")):
        anchor.set(k, v)

    simple = OxmlElement("wp:simplePos")
    simple.set("x", "0")
    simple.set("y", "0")
    anchor.append(simple)

    for tag in ("wp:positionH", "wp:positionV"):
        pos = OxmlElement(tag)
        pos.set("relativeFrom", "page")
        off = OxmlElement("wp:posOffset")
        off.text = "0"
        pos.append(off)
        anchor.append(pos)

    ext = OxmlElement("wp:extent")
    ext.set("cx", extent.get("cx"))
    ext.set("cy", extent.get("cy"))
    anchor.append(ext)

    eff = OxmlElement("wp:effectExtent")
    for k in ("l", "t", "r", "b"):
        eff.set(k, "0")
    anchor.append(eff)

    anchor.append(OxmlElement("wp:wrapNone"))

    docpr = OxmlElement("wp:docPr")
    docpr.set("id", "1")
    docpr.set("name", "Picture 1")
    anchor.append(docpr)

    graphic = inline.find(qn("a:graphic"))
    if graphic is not None:
        anchor.append(graphic)

    drawing.remove(inline)
    drawing.append(anchor)


def build(src, out, bg=None):
    lines = io.open(src, encoding="utf-8").read().splitlines()
    kicker = "NEURO-LOOP  ·  一封信"
    foot = "NEURO-LOOP · 写给刚接触 DSH 的你 · 2026-11-18"
    for ln in lines:
        m = re.match(r"<!--\s*kicker:\s*(.+?)\s*-->", ln)
        if m:
            kicker = m.group(1)
        m = re.match(r"<!--\s*footer:\s*(.+?)\s*-->", ln)
        if m:
            foot = m.group(1)
    lines = [l for l in lines if not l.strip().startswith("<!--")]
    doc = Document()
    setup(doc)

    title, sub, body = "写给刚接触 DSH 的你", "", []
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("# "):
            title = ln[2:].strip()
        elif ln.startswith("> ") and not sub:
            quotes = []
            while i < len(lines) and lines[i].startswith(">"):
                quotes.append(lines[i].lstrip("> ").strip())
                i += 1
            sub = "\n".join(q for q in quotes if q).replace("**", "")
            continue
        elif ln.startswith("## "):
            body.append(("h", ln[3:].strip()))
        elif ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                raw = lines[i].strip().strip("|")
                cells = [c.strip() for c in raw.split("|")]
                if not all(set(c) <= set("-: ") and c for c in cells):
                    rows.append(cells)
                i += 1
            body.append(("table", rows))
            continue
        elif ln.startswith("---"):
            body.append(("hr", ""))
        elif ln.strip() == "":
            pass
        elif re.match(r"^\d+\.\s", ln):
            body.append(("li", ln.strip()))
        elif ln.startswith("- "):
            body.append(("li", "- " + ln[2:].strip()))
        elif ln.startswith("**") and ln.endswith("**") and len(ln) > 4:
            body.append(("b", ln[2:-2].strip()))
        else:
            body.append(("p", ln.strip()))
        i += 1

    cover(doc, title, sub, kicker)

    for kind, text in body:
        if kind == "h":
            heading(doc, text)
        elif kind == "hr":
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(8)
            bottom_rule(p, "E7EBF0")
        elif kind == "b":
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(4)
            add_runs(p, text, size=BODY + 0.3)
            for r in p.runs:
                r.bold = True
        elif kind == "li":
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.75)
            p.paragraph_format.first_line_indent = Cm(-0.45)
            p.paragraph_format.space_after = Pt(4)
            add_runs(p, text)
        elif kind == "table":
            add_table(doc, text)
        else:
            para(doc, text)

    if bg:
        add_background(doc, bg)

    footer(doc, foot)
    doc.core_properties.title = title
    doc.core_properties.author = "d 老师（墨鸦）"
    doc.save(out)
    return out


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(root), "给同学的一封信-DSH.md")
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(root), "给同学的一封信-DSH.docx")
    bg = None
    for i, a in enumerate(sys.argv):
        if a == "--bg" and i + 1 < len(sys.argv):
            bg = sys.argv[i + 1]
    print("docx:", build(src, out, bg))
