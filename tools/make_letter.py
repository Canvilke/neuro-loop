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

FONT = "Microsoft YaHei"
BODY = 10.5
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


def cover(doc, title, sub):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(40)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("NEURO-LOOP  ·  一封信")
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


def build(src, out):
    lines = io.open(src, encoding="utf-8").read().splitlines()
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
            sub = "\n".join(q for q in quotes if q)
            continue
        elif ln.startswith("## "):
            body.append(("h", ln[3:].strip()))
        elif ln.startswith("---"):
            body.append(("hr", ""))
        elif ln.strip() == "":
            pass
        elif re.match(r"^\d+\.\s", ln):
            body.append(("li", ln.strip()))
        elif ln.startswith("- "):
            body.append(("li", "· " + ln[2:].strip()))
        elif ln.startswith("**") and ln.endswith("**") and len(ln) > 4:
            body.append(("b", ln[2:-2].strip()))
        else:
            body.append(("p", ln.strip()))
        i += 1

    cover(doc, title, sub)

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
        else:
            para(doc, text)

    footer(doc, "NEURO-LOOP · 写给刚接触 DSH 的你 · 2026-11-18")
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
    print("docx:", build(src, out))
