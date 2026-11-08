#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把《考纲词组》PDF 拆成可拆分的条目表。

PDF 每页是两栏：
  左栏 Word 列（编号 + 英文词组，长词组会换行到下一行）
  右栏 Meaning 列（同编号 + 词性标记 + 中文释义，一个词组可能有多条释义）

中文里的「⼀」「⼈」是康熙部首码位（U+2F00 起），统一做 NFKC 归一化，
否则打印出来会和常用汉字混排成两种字形。

输出 plan/en-entries.json：
  [{"n":1,"en":"in short","pos":"idm.","zh":"简言之，总之"}, ...]
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import unicodedata

from pypdf import PdfReader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POS_RE = re.compile(r"\b(idm|phrv|phr|usage|collocation|abbr|conj|prep|adv|adj)\.", re.I)

# PDF 里混着部分「部首补充」码位，NFKC 不处理这些，逐字映射。
RADICAL_MAP = str.maketrans({
    "\u2eec": "齐", "\u2ef2": "齐", "\u2eeb": "齐", "\u2eef": "齿",
    "\u2e8b": "车", "\u2e9d": "页", "\u2e8c": "辛", "\u2e96": "辶",
    "\u2ed6": "马", "\u2ed7": "骨", "\u2ed9": "鬼", "\u2edb": "鱼",
    "\u2ecb": "车", "\u2ed4": "门", "\u2edc": "飞", "\u2ed3": "长",
    "\u2ec5": "见", "\u2ec6": "角", "\u2edd": "食",
    "\u2ee2": "鸟", "\u2ee3": "卤", "\u2ee5": "麦", "\u2ee7": "黄",
})
FOOTER_RE = re.compile(r"^(高考真题核心词组|扫码听单词|纸上默写|共\s*\d+\s*词|.*\d+/\d+\s*⻚?)$")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).translate(RADICAL_MAP)
    s = s.replace("\u00a0", " ").replace("\u3000", " ")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def split_columns(text: str) -> tuple[list[str], list[str]]:
    """按第二次出现的 'Word Meaning' 切开左右两栏。"""
    blocks = text.split("Word Meaning")
    if len(blocks) < 3:
        return [], []
    return blocks[1].split("\n"), blocks[2].split("\n")


def parse_word_col(lines: list[str]) -> dict[int, str]:
    out: dict[int, str] = {}
    cur: int | None = None
    for raw in lines:
        line = norm(raw)
        if not line or FOOTER_RE.match(line):
            continue
        m = re.match(r"^(\d{1,4})\s*(.*)$", line)
        if m:
            cur = int(m.group(1))
            out[cur] = m.group(2).strip()
            continue
        elif cur is not None and re.match(r"^[A-Za-z(]", line):
            out[cur] = (out[cur] + " " + line).strip()
    return out


def parse_meaning_col(lines: list[str]) -> dict[int, tuple[str, str]]:
    out: dict[int, tuple[str, str]] = {}
    cur: int | None = None
    for raw in lines:
        line = norm(raw)
        if not line or FOOTER_RE.match(line):
            continue
        m = re.match(r"^(\d{1,4})\s*(.*)$", line)
        if m:
            cur = int(m.group(1))
            out[cur] = [m.group(2).strip()] if m.group(2).strip() else []
            continue
        if cur is None:
            continue
        if POS_RE.match(line) or out.get(cur):
            out.setdefault(cur, []).append(line)
    res: dict[int, tuple[str, str]] = {}
    for n, parts in out.items():
        joined = "\n".join(parts)
        pos = ""
        pm = POS_RE.search(joined)
        if pm:
            pos = pm.group(1).lower() + "."
        zh = POS_RE.sub("", joined).replace("\n", "；")
        zh = re.sub(r"；+", "；", zh)
        zh = re.sub(r"[；,，]?\s*(高考真题核心词组|扫码听单词|纸上默写,?耳边复习).*$", "", zh)
        zh = zh.strip("； ")
        res[n] = (pos, zh)
    return res


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        ROOT, "学习资料", "英语", "考纲词组.pdf"
    )
    if not os.path.exists(src):
        src = os.path.join(os.path.expanduser("~"), "Desktop", "致远", "模联", "社徽", "考纲词组.pdf")
    reader = PdfReader(src)
    entries: list[dict] = []
    seen: dict[str, int] = {}
    dup = 0
    for pi, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        wl, ml = split_columns(text)
        words = parse_word_col(wl)
        means = parse_meaning_col(ml)
        for n in sorted(words):
            en = words[n]
            pos, zh = means.get(n, ("", ""))
            key = en.lower()
            if key in seen:
                dup += 1
                continue
            seen[key] = 1
            entries.append({"n": n, "page": pi + 1, "en": en, "pos": pos, "zh": zh})
    out = os.path.join(ROOT, "plan", "en-entries.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with io.open(out, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, ensure_ascii=False, indent=1)
    missing = sum(1 for e in entries if not e["zh"])
    print(f"entries {len(entries)}  pages {len(reader.pages)}  dup-skipped {dup}  missing-zh {missing}")
    print("first:", entries[0])
    print("last :", entries[-1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
