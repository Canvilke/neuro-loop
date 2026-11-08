#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日一页回填 —— 把纸上写完的结果写进事件流（L1）。

这张纸是原本：它记着当天读了哪两页、用了多久、错在哪几处、卡在哪。
纸上的信息只有落到事件流里，第二天的页面才可能"知道昨天"。

用法（任选其一）：

  # 1) 具名参数，最稳
  python tools/record.py --date 2026-11-10 --subject politics \
      --pages 48-49 --minutes 25 --wrong 3,5 --blocked "实践与认识的先后关系"

  # 2) 一行口令，从纸面抄过来
  python tools/record.py "11-10 政治 48-49 25分 错3,5 卡:实践与认识"

  # 3) 只读预览，不写
  python tools/record.py --dry-run "11-10 政治 48-49 25分 错3,5"

字段约定：
  --date      省略则取今天
  --minutes   只记用时；不记正确率、不记得分（避免把每日一页变成测验）
  --wrong     填错的题号，逗号分隔；全对就省略
  --blocked   当日卡住的那一句，写人话，不写"不熟"这种结论词

写盘策略：优先 POST /neuroloop/event（由宿主校验后落盘）；
宿主没起来时退回直接追加 L1（同样是一次 append，不会写坏 L2——L2 由宿主下次重建）。
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.environ.get("NEUROLOOP_HOME") or os.path.join(os.path.expanduser("~"), ".dsh", "neuro-loop")
STATE_URL = "http://127.0.0.1:{port}/neuroloop/state"
PORTS = [62401]

SUBJECT_WORDS = {
    "语文": "chinese", "数学": "math", "英语": "english",
    "物理": "physics", "化学": "chemistry", "政治": "politics",
    "chinese": "chinese", "math": "math", "english": "english",
    "physics": "physics", "chemistry": "chemistry", "politics": "politics",
}


def parse_line(text: str) -> dict:
    """把一行口令拆成字段。缺省留空，不猜。"""
    out: dict = {}
    t = text.strip()

    m = re.search(r"(?<!\d)(\d{1,2})[-/月](\d{1,2})(?!\d)", t)
    if m:
        year = dt.date.today().year
        out["date"] = f"{year}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
        t = t.replace(m.group(0), " ")

    for word, sid in SUBJECT_WORDS.items():
        if word in t:
            out["subject"] = sid
            t = t.replace(word, " ")
            break

    m = re.search(r"P?\.?\s*(\d{1,3})\s*[-–~至]\s*(\d{1,3})", t)
    if m:
        out["pages"] = f"{m.group(1)}-{m.group(2)}"

    m = re.search(r"(\d{1,3})\s*(?:分|min|分钟)", t)
    if m:
        out["minutes"] = int(m.group(1))
        t = t.replace(m.group(0), " ")

    m = re.search(r"错\s*[:：]?\s*([\d,，、\s]+)", t)
    if m:
        out["wrong"] = [int(x) for x in re.findall(r"\d+", m.group(1))]
        t = t.replace(m.group(0), " ")

    m = re.search(r"卡\s*[:：]\s*(.+)$", t)
    if m:
        out["blocked"] = m.group(1).strip()

    return out


def build_event(f: dict) -> dict:
    date = f.get("date") or dt.date.today().isoformat()
    return {
        "kind": "daily",
        "date": date,
        "subject": f["subject"],
        "minutes": f.get("minutes"),
        "wrong": f.get("wrong") or [],
        "blocked": f.get("blocked") or "",
        "note": f.get("pages") and f"教参 P.{f['pages']}" or "",
    }


def append_event(ev: dict) -> str:
    os.makedirs(HOME, exist_ok=True)
    month = ev["at"][:7] if ev.get("at") else dt.date.today().isoformat()[:7]
    path = os.path.join(HOME, f"events-{month}.jsonl")
    line = json.dumps(ev, ensure_ascii=False) + "\n"
    with io.open(path, "a", encoding="utf-8") as fh:
        fh.write(line)
    return path


def post_event(ev: dict) -> str | None:
    import urllib.error
    import urllib.request

    body = json.dumps(ev, ensure_ascii=False).encode("utf-8")
    for port in PORTS:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/neuroloop/event",
            data=body,
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=3) as res:
                payload = json.loads(res.read().decode("utf-8"))
                if payload.get("ok"):
                    return f"posted (rev={payload.get('rev')})"
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
            continue
    return None


def show_recent(days: int) -> int:
    path = os.path.join(HOME, "state.json")
    if not os.path.exists(path):
        print("还没有投影文件：", path)
        return 0
    with io.open(path, encoding="utf-8") as fh:
        st = json.load(fh)
    daily = st.get("daily") or {}
    if not daily:
        print("还没有任何回填记录。")
        return 0
    for d in sorted(daily)[-days:]:
        for sid, r in daily[d].items():
            wrong = ",".join(str(x) for x in (r.get("wrong") or [])) or "无"
            print(f"{d}  {sid:<10} {r.get('minutes') or '-'}分  错:{wrong}  卡:{r.get('blocked') or '-'}")
    return 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="把每日一页的结果写进事件流")
    ap.add_argument("line", nargs="*", help="一行口令，例如 \"11-10 政治 48-49 25分 错3,5\"")
    ap.add_argument("--date")
    ap.add_argument("--subject")
    ap.add_argument("--pages")
    ap.add_argument("--minutes", type=int)
    ap.add_argument("--wrong")
    ap.add_argument("--blocked")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--show", type=int, nargs="?", const=7, help="回看最近 N 天的回填，不写")
    a = ap.parse_args(argv)

    if a.show:
        return show_recent(a.show)

    f = parse_line(" ".join(a.line)) if a.line else {}
    if a.date:
        f["date"] = a.date
    if a.subject:
        f["subject"] = SUBJECT_WORDS.get(a.subject, a.subject)
    if a.pages:
        f["pages"] = a.pages
    if a.minutes is not None:
        f["minutes"] = a.minutes
    if a.wrong:
        f["wrong"] = [int(x) for x in re.findall(r"\d+", a.wrong)]
    if a.blocked:
        f["blocked"] = a.blocked

    if not f.get("subject"):
        print("缺学科。例：python tools/record.py \"11-10 政治 48-49 25分 错3,5\"", file=sys.stderr)
        return 2

    ev = build_event(f)
    print(json.dumps(ev, ensure_ascii=False, indent=2))
    if a.dry_run:
        print("dry-run：未写入")
        return 0

    done = post_event(ev)
    if done:
        print("写入：", done)
        return 0

    ev["at"] = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    path = append_event(ev)
    print("宿主未响应，直接追加 L1：", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
