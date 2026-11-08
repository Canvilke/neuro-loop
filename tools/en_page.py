#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build the daily English worksheet: 30 phrases + five translation sentences.

Layout mirrors the politics sheet (same header, motto, footer, flat print
friendly): table-free, one page, answers under a dashed rule.

Usage:
  python tools/en_page.py 2026-11-10 -o daily/en-2026-11-10.docx
  python tools/en_page.py 2026-11-10 -o out.docx --json daily/en-2026-11-10.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docx import Document
from docx.enum.text import WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

from make_docx import (BODY_W, FAINT, GREY, INK, add_runs, para, rule,
                       set_font, tasks_block, text)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START = dt.date(2026, 11, 10)
MOTTO = "愿以微志既长策，岂因独怀废华章"
WEEK = "一二三四五六日"


def load_json(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as fh:
        return json.load(fh)


def pick_sentences(day):
    bank = load_json("content", "syntax", "sentences.json")
    zh = [s for s in bank if s["dir"] == "zh2en"]
    en = [s for s in bank if s["dir"] == "en2zh"]
    k = (day - 1)
    out = []
    for i in range(3):
        out.append(zh[(k * 3 + i) % len(zh)])
    for i in range(2):
        out.append(en[(k * 2 + i) % len(en)])
    return out


def pick_words(day):
    sched = load_json("plan", "en-schedule.json")
    days = sched["days"]
    d = days[(day - 1) % len(days)]
    entries = load_json("plan", "en-entries.json")
    return [e for e in entries if d["from"] <= e["n"] <= d["to"]], d


def write_line(doc, space_after=3, line=1.2):
    """An empty paragraph whose bottom border is the writing line."""
    p = para(doc, space_before=0, space_after=space_after, line=line)
    ppr = p._element.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "4")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "BBBBBB")
    bdr.append(bottom)
    ppr.append(bdr)
    return p


def build(date_str, tasks=None):
    date = dt.date.fromisoformat(date_str)
    day = (date - START).days + 1
    words, chunk = pick_words(day)
    sents = pick_sentences(day)

    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.top_margin = Cm(1.35)
    sec.bottom_margin = Cm(0.95)
    sec.left_margin = Cm(2.0)
    sec.right_margin = Cm(2.0)
    sec.header_distance = Cm(0.7)

    hdr = sec.header.paragraphs[0]
    hdr.alignment = 2
    hr = hdr.add_run(MOTTO)
    set_font(hr, 8.6, False, GREY)

    text(doc, "NEURO-LOOP · 英语 · 每日复习页", 8, False, FAINT, space_after=2, line=1.2)
    text(doc, "词组与句子（第 %d 天）" % day, 14.5, True, INK, space_after=1, line=1.1)
    text(doc, "%s 周%s　考纲词组 %d–%d　%d 条" %
         (date_str, WEEK[date.weekday()], chunk["from"], chunk["to"], len(words)),
         8.8, False, GREY, space_after=4, line=1.25)
    rule(doc, space_before=2, space_after=5)

    # ---- 1. phrases, two per line ----
    text(doc, "一、词组默写", 10.5, True, INK, space_before=1, space_after=2)
    text(doc, "据中文释义写出英文词组。", 8.6, False, GREY, space_after=2, line=1.15)
    half = (len(words) + 1) // 2
    for i in range(half):
        p = para(doc, space_after=0, line=1.12)
        ts = p.paragraph_format.tab_stops
        ts.add_tab_stop(Pt(BODY_W / 2.0), WD_TAB_ALIGNMENT.LEFT)
        left = words[i]
        r = p.add_run("%d. %s" % (left["n"], left["zh"].replace(",", "，")[:14]))
        set_font(r, 8.8, False, INK)
        r = p.add_run("  " + "_" * 10)
        set_font(r, 9.8, False, INK)
        if i + half < len(words):
            right = words[i + half]
            r = p.add_run("\t%d. %s" % (right["n"], right["zh"].replace(",", "，")[:14]))
            set_font(r, 8.8, False, INK)
            r = p.add_run("  " + "_" * 10)
            set_font(r, 9.8, False, INK)
    rule(doc, space_before=3, space_after=3)

    # ---- 2. sentences ----
    text(doc, "二、句子翻译", 10.5, True, INK, space_before=1, space_after=2)
    text(doc, "第 1–3 题中译英，第 4–5 题英译中。", 8.6, False, GREY, space_after=2, line=1.15)
    for idx, s in enumerate(sents, 1):
        p = para(doc, space_before=1, space_after=0, line=1.15)
        r = p.add_run("%d. " % idx)
        set_font(r, 9.8, True, INK)
        add_runs(p, s["text"], 9.8, False, INK)
        write_line(doc, space_after=0, line=1.0)
        if s["dir"] == "zh2en":
            write_line(doc, space_after=0, line=1.0)
    rule(doc, space_before=2, space_after=2)

    if tasks:
        tasks_block(doc, tasks)
        rule(doc, space_before=4, space_after=4)

    p = para(doc, space_before=0, space_after=2, line=1.2)
    r = p.add_run("用时 ______ 分钟")
    set_font(r, 9.6, False, INK)

    # ---- answers ----
    rule(doc, dash=True, space_before=2, space_after=1)
    text(doc, "参考答案", 8.4, True, GREY, space_after=2, line=1.2)
    pairs = ["%d %s" % (e["n"], e["en"]) for e in words]
    text(doc, "词组", 7.0, True, GREY, space_after=1, line=1.0)
    per = (len(pairs) + 3) // 4
    for row in range(per):
        p = para(doc, space_after=0, line=1.0)
        ts = p.paragraph_format.tab_stops
        for c in (1, 2, 3):
            ts.add_tab_stop(Pt(BODY_W / 4.0 * c), WD_TAB_ALIGNMENT.LEFT)
        cells = []
        for c in range(4):
            k = c * per + row
            cells.append(pairs[k] if k < len(pairs) else "")
        r = p.add_run("\t".join(cells))
        set_font(r, 6.6, False, GREY)
    joined = "　".join("%d %s" % (i, s["answer"]) for i, s in enumerate(sents, 1))
    text(doc, "句：" + joined, 6.4, False, GREY, space_after=0, line=1.0)
    # footer omitted on this sheet: the meta line already carries date and range,
    # and one more line pushes the page over A4.
    return doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("date")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--json", dest="json_out")
    ap.add_argument("--tasks", dest="tasks", action="store_true",
                    help="inject today's other-subject task lines")
    ap.add_argument("--pdf", dest="pdf")
    args = ap.parse_args()

    tasks = None
    if args.tasks:
        import subprocess
        raw = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "tasks.py"),
                              args.date, "--json"], capture_output=True, text=True,
                             encoding="utf-8")
        if raw.returncode == 0 and raw.stdout.strip():
            tasks = json.loads(raw.stdout)

    doc = build(args.date, tasks)
    doc.save(args.out)
    print("docx:", os.path.abspath(args.out))

    if args.json_out:
        date = dt.date.fromisoformat(args.date)
        day = (date - START).days + 1
        words, chunk = pick_words(day)
        blob = {"date": args.date, "day": day, "phrases": words,
                "sentences": pick_sentences(day), "tasks": tasks}
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(blob, fh, ensure_ascii=False, indent=1)
        print("json:", os.path.abspath(args.json_out))


if __name__ == "__main__":
    main()
