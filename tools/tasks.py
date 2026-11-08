#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日任务（数学/物理/化学）：按日期从轮换清单里取当天该做的几行。

数学、物理、化学不再出每日内容页，只在政治/英语页底部带一行任务提示。
本脚本把「哪一天做什么」算出来，交给 make_docx.py 的 tasks 键渲染。

用法：
    python tools/tasks.py 2026-11-10                 # 打印人类可读的几行
    python tools/tasks.py 2026-11-10 --json          # 打印 tasks 数组（JSON）
    python tools/tasks.py 2026-11-10 --inject daily/pol-2026-11-10.json
                                                     # 把 tasks 写进该页 JSON
    python tools/tasks.py --date 2026-11-10 --json   # 同名参数的另一种写法

轮换规则（plan/tasks-config.json）：
    d = 日期 - start（天）
    第 i 个学科取 pools[学科][(d + i) % len]，跨完一轮从头开始。
    把某学科从 rotate 里删掉，它当天就不出任务；maxPerDay 是硬上限（≤6）。
"""

import argparse
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CONFIG = os.path.join(ROOT, "plan", "tasks-config.json")


def load_config(path=CONFIG):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def day_tasks(day, cfg):
    """Return [{subject, text, min}] for one date, in rotate order."""
    start_txt = cfg.get("start")
    start = dt.date.fromisoformat(start_txt) if start_txt else day
    d = (day - start).days                      # negative days still wrap correctly
    pools = cfg.get("pools") or {}
    order = cfg.get("rotate") or list(pools.keys())
    rows = []
    for i, subject in enumerate(order):
        pool = pools.get(subject) or []
        if not pool:
            continue
        item = pool[(d + i) % len(pool)]
        row = {"subject": subject, "text": item["text"]}
        if item.get("min") is not None:
            row["min"] = item["min"]
        rows.append(row)
    cap = int(cfg.get("maxPerDay") or 6)
    return rows[:max(0, min(cap, 6))]


def inject(page_path, rows):
    with open(page_path, encoding="utf-8") as f:
        page = json.load(f)
    page["tasks"] = rows
    with open(page_path, "w", encoding="utf-8", newline="\r\n") as f:
        json.dump(page, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return len(page["tasks"])


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("date", nargs="?", help="YYYY-MM-DD，缺省为今天")
    ap.add_argument("--date", dest="date_opt", help="同上，具名写法")
    ap.add_argument("--config", default=CONFIG, help="缺省 plan/tasks-config.json")
    ap.add_argument("--json", action="store_true", help="只打印 tasks 数组")
    ap.add_argument("--inject", metavar="PAGE_JSON", help="把 tasks 写进该页 JSON")
    a = ap.parse_args()

    day_txt = a.date_opt or a.date
    day = dt.date.fromisoformat(day_txt) if day_txt else dt.date.today()
    rows = day_tasks(day, load_config(a.config))

    if a.inject:
        n = inject(a.inject, rows)
        print("injected %d task(s) into %s" % (n, a.inject))
        return 0

    if a.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0

    for t in rows:
        mins = ("  %s min" % t["min"]) if t.get("min") is not None else ""
        print("□ %s  %s%s" % (t["subject"], t["text"], mins))
    return 0


if __name__ == "__main__":
    sys.exit(main())
