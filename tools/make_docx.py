#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build a one-page daily worksheet as a real .docx (structured, printable, editable).

Why docx: the printer chokes on rasterised pages whose bitmaps carry large
translucent fills; Word prints vector text directly and stays crisp at any size.
The docx is also the editable source for later subjects.

Usage:
  python tools/make_docx.py daily/pol-2026-11-10.json -o daily/pol-2026-11-10.docx
  python tools/make_docx.py daily/pol-2026-11-10.json -o out.docx --pdf
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

FONT = "Microsoft YaHei"
INK = RGBColor(0x11, 0x11, 0x11)
GREY = RGBColor(0x6B, 0x6B, 0x6B)
FAINT = RGBColor(0x94, 0x94, 0x94)


def set_font(run, size, bold=False, color=INK, mono=False):
    run.font.name = FONT if not mono else "Consolas"
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts")
        rpr.append(rf)
    rf.set(qn("w:ascii"), run.font.name)
    rf.set(qn("w:hAnsi"), run.font.name)
    rf.set(qn("w:eastAsia"), FONT)


# Inline rich text for chemistry: H_{2}O -> real Word subscript, mol^{−1} ->
# real superscript. Microsoft YaHei has no U+2082/U+207B glyphs, so typing
# Unicode subscripts would print tofu on a machine that only has YaHei.
RICH = re.compile(r"(_\{[^{}]*\}|\^\{[^{}]*\})")


def add_runs(p, s, size, bold=False, color=INK, mono=False):
    """Append text to paragraph p, turning _{...} / ^{...} into sub/superscript."""
    pos = 0
    for m in RICH.finditer(s):
        if m.start() > pos:
            set_font(p.add_run(s[pos:m.start()]), size, bold, color, mono)
        token = m.group(0)
        r = p.add_run(token[2:-1])
        set_font(r, size, bold, color, mono)
        if token[0] == "_":
            r.font.subscript = True
        else:
            r.font.superscript = True
        pos = m.end()
    if pos < len(s):
        set_font(p.add_run(s[pos:]), size, bold, color, mono)
    return p


def para(doc, space_before=0, space_after=4, line=1.45, first_indent=0, left=0):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = line
    if first_indent:
        pf.first_line_indent = Pt(first_indent)
    if left:
        pf.left_indent = Pt(left)
    return p


def text(doc, s, size=10.5, bold=False, color=INK, **kw):
    p = para(doc, **kw)
    add_runs(p, s, size, bold, color)
    return p


# Usable text width of the A4 page: 21.0 - 2 x 2.0 cm, in points.
BODY_W = 17.0 * 28.3465


def tasks_block(doc, tasks):
    """Compact list of the day's non-content tasks (math / physics / chemistry).

    One row per task: box, fixed-width subject column, left-aligned task text,
    right-aligned minutes. At most six rows; the block is skipped entirely when
    the page JSON carries no `tasks` key, so older pages render unchanged.
    """
    rows = tasks[:6]
    if not rows:
        return
    # Six rows still have to fit the same page as five: drop a notch of type.
    n = len(rows)
    size = 7.6 if n > 5 else 8.0
    lsp = 0.92 if n > 5 else 0.98
    text(doc, "今日任务（其他科目）", 8.2, True, INK,
         space_before=2 if n > 5 else 3, space_after=0, line=1.0)
    for t in rows:
        p = para(doc, space_before=0, space_after=0, line=lsp)
        ts = p.paragraph_format.tab_stops
        ts.add_tab_stop(Pt(13), WD_TAB_ALIGNMENT.LEFT)    # subject column
        ts.add_tab_stop(Pt(46), WD_TAB_ALIGNMENT.LEFT)    # task text
        ts.add_tab_stop(Pt(BODY_W - 1.0), WD_TAB_ALIGNMENT.RIGHT)  # minutes
        r = p.add_run("□\t%s\t" % t.get("subject", ""))
        set_font(r, size, False, INK)
        add_runs(p, t.get("text", ""), size, False, INK)
        mins = t.get("min")
        if mins not in (None, ""):
            r = p.add_run("\t%s min" % mins)
            set_font(r, 7.8, False, GREY)


def rule(doc, dash=False, space_before=6, space_after=6):
    p = para(doc, space_before=space_before, space_after=space_after, line=1.0)
    ppr = p._element.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "dashed" if dash else "single")
    bottom.set(qn("w:sz"), "6" if not dash else "4")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "999999" if dash else "333333")
    bdr.append(bottom)
    ppr.append(bdr)
    return p


def build(data: dict) -> Document:
    doc = Document()
    # Pages that also carry the other-subject task lines have less room, so the
    # closing blocks (writing lines, self check, answers, footer) are set a
    # little tighter. Without `tasks` every measurement below is unchanged.
    dense = bool(data.get("tasks")) or bool(data.get("dense"))

    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.top_margin = Cm(1.35)
    sec.bottom_margin = Cm(0.95)
    sec.left_margin = Cm(2.0)
    sec.right_margin = Cm(2.0)

    sec.header_distance = Cm(0.7)
    hdr = sec.header.paragraphs[0]
    hdr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hr = hdr.add_run(data.get("motto", ""))
    set_font(hr, 8.6, False, GREY)

    st = doc.styles["Normal"]
    st.font.name = FONT
    st.font.size = Pt(10.5)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)

    # ---- header ----
    text(doc, data["kicker"], 8, False, FAINT, space_after=2, line=1.2)
    text(doc, data["title"], 17, True, INK, space_after=2, line=1.2)
    text(doc, data["meta"], 8.8, False, GREY, space_after=2 if dense else 4, line=1.25)
    rule(doc, space_before=2, space_after=6 if dense else 8)

    # ---- 1. outline ----
    mode = data.get("outlineMode", "list")
    text(doc, "一、" + ("背诵提纲" if mode == "list" else "知识结构"), 11, True, INK, space_before=2, space_after=3 if dense else 4)
    items = data["outline"]
    last_branch = max((i for i, it in enumerate(items) if it.get("level", 0) == 0), default=-1)
    for i, item in enumerate(items):
        lvl = item.get("level", 0)
        left = 10 + lvl * 14
        if mode == "tree":
            if lvl == 0:
                lead = ("└─ " if i == last_branch else "├─ ")
                p = para(doc, space_before=0 if dense else 1, space_after=1, line=1.24 if dense else 1.3, left=left)
                add_runs(p, lead + item["text"], 9.2, True, INK)
            else:
                lead = "   │  " if i < last_branch else "      "
                p = para(doc, space_before=0, space_after=1, line=1.24 if dense else 1.3, left=left + 14)
                add_runs(p, item["text"], 8.9, False, GREY)
        else:
            p = para(doc, space_before=0, space_after=1, line=1.24 if dense else 1.3, left=left)
            add_runs(p, item["text"], 9.2 if lvl == 0 else 8.9, lvl == 0,
                     INK if lvl == 0 else GREY)

    rule(doc, space_before=4 if dense else 6, space_after=3 if dense else 5)

    # ---- 2. cloze paragraph ----
    head = "二、概念填空" + ("（共 %d 空）" % data["cloze"]["count"] if data["cloze"].get("count") else "")
    text(doc, head, 11, True, INK, space_before=2, space_after=4 if dense else 5)
    p = para(doc, space_after=3, line=1.4 if dense else 1.5, first_indent=21)
    for seg in data["cloze"]["runs"]:
        add_runs(p, seg["text"], 10.2, bool(seg.get("bold")), INK)

    # ---- 3. correction paragraph ----
    text(doc, "三、辨析改错", 11, True, INK, space_before=8 if dense else 10, space_after=4)
    text(doc, data["errors"]["note"], 9, False, GREY, space_after=3 if dense else 4, line=1.2 if dense else 1.3)
    p = para(doc, space_after=3, line=1.4 if dense else 1.5, first_indent=21)
    add_runs(p, data["errors"]["text"], 10.2, False, INK)
    # writing lines
    for _ in range(data["errors"].get("lines", 3)):
        q = para(doc, space_before=0, space_after=2 if dense else 6, line=1.2)
        qpr = q._element.get_or_add_pPr()
        bdr = OxmlElement("w:pBdr")
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), "4")
        bottom.set(qn("w:space"), "1")
        bottom.set(qn("w:color"), "BBBBBB")
        bdr.append(bottom)
        qpr.append(bdr)

    # ---- 4. rolling ----
    if data.get("roll") or data.get("rollNote"):
        text(doc, "四、滚动复习", 11, True, INK, space_before=8, space_after=4)
        for it in data.get("roll") or []:
            p = para(doc, space_after=4, line=1.6, left=14)
            r = p.add_run("〔%s〕" % it["tag"])
            set_font(r, 7.8, False, GREY)
            add_runs(p, it["text"], 10, False, INK)
        if data.get("rollNote"):
            text(doc, data["rollNote"], 9.2, False, GREY,
                 space_before=0, space_after=4, line=1.35, left=14)
        rule(doc, space_before=8, space_after=6)

    # ---- self check ----
    if data.get("selfcheck"):
        p = para(doc, space_before=2 if dense else 4, space_after=3, line=1.3)
        r = p.add_run(data["selfcheck"])
        set_font(r, 9.6, False, INK)

    # ---- today's other-subject tasks (optional) ----
    if data.get("tasks"):
        tasks_block(doc, data["tasks"])

    # ---- answers ----
    rule(doc, dash=True, space_before=4 if dense else 7, space_after=2 if dense else 4)
    text(doc, "参考答案", 8.4 if dense else 8.6, True, GREY, space_after=2 if dense else 3, line=1.2)
    for line in data["answers"]:
        text(doc, line, 7.4 if dense else 7.6, False, GREY, space_before=0, space_after=0, line=1.0 if dense else 1.22)

    # ---- footer (kept inside the answer block so a stray line cannot spill) ----
    text(doc, data["foot"], 7.0, False, FAINT, space_before=0 if dense else 2, space_after=0, line=1.05)
    return doc


def word_pdf(src: str, dst: str) -> None:
    """Convert via Word COM (no LibreOffice on this machine)."""
    import win32com.client as win32  # type: ignore

    word = win32.DispatchEx("Word.Application")
    word.Visible = False
    try:
        d = word.Documents.Open(os.path.abspath(src), ReadOnly=True)
        d.SaveAs(os.path.abspath(dst), FileFormat=17)  # wdFormatPDF
        d.Close(False)
    finally:
        word.Quit()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("json")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--pdf", action="store_true")
    a = ap.parse_args()

    data = json.load(open(a.json, encoding="utf-8"))
    doc = build(data)
    doc.save(a.out)
    print("docx:", os.path.abspath(a.out))

    if a.pdf:
        pdf = os.path.splitext(a.out)[0] + ".pdf"
        word_pdf(a.out, pdf)
        print("pdf :", os.path.abspath(pdf))
    return 0


if __name__ == "__main__":
    sys.exit(main())
