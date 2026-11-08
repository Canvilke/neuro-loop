#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日一页：把"今天该复现什么"算出来，交给打印脚本。

用法：
    python tools/daily_page.py                 # 生成 daily/YYYY-MM-DD.json
    python tools/daily_page.py --date 2026-11-10
    python tools/daily_page.py --print         # 生成后直接送打印机（扁平，无渐变）
    python tools/daily_page.py --preview       # 生成后渲染 PNG，不打印

设计约束（ENGINE.md §5 / §7）：
  * 一页只装三件事：今天复现 3 条、昨天错因 1 条、提示阶梯。
  * 页面必须扁平：纯色块 + 细线 + 文字。含渐变的页会被 spooler 丢弃（实测 printed=0）。
  * 不打印答案，只打印"提示阶梯"，让他自己在纸上写。
"""

import argparse
import datetime as dt
import io
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SEED = os.path.join(ROOT, "data", "seed.json")
METHOD_DIR = os.path.join(ROOT, "content", "method")
DAILY_DIR = os.path.join(ROOT, "daily")
STATE = os.path.join(os.path.expanduser("~"), ".dsh", "neuro-loop", "state.json")

SUBJECT_ORDER = ["chinese", "math", "english", "physics", "chemistry", "politics"]
SUBJECT_CN = {
    "chinese": "语文",
    "math": "数学",
    "english": "英语",
    "physics": "物理",
    "chemistry": "化学",
    "politics": "政治",
}


def load_json(path, default=None):
    try:
        with io.open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return default


def load_seed():
    return load_json(SEED, {"subjects": []})


def load_methods():
    out = []
    if not os.path.isdir(METHOD_DIR):
        return out
    for name in sorted(os.listdir(METHOD_DIR)):
        if name.endswith(".json"):
            card = load_json(os.path.join(METHOD_DIR, name))
            if card:
                out.append(card)
    return out


def pick_three(methods, date):
    """按日期轮转，保证同一天同一结果，不同天不重样。"""
    if not methods:
        return []
    n = len(methods)
    start = (date.toordinal() * 3) % n
    picked = []
    for i in range(min(3, n)):
        picked.append(methods[(start + i * max(1, n // 3)) % n])
    # 去重（n 很小时上面可能撞车）
    seen, uniq = set(), []
    for m in picked:
        if m["id"] not in seen:
            seen.add(m["id"])
            uniq.append(m)
    i = 0
    while len(uniq) < min(3, n) and i < n:
        m = methods[(start + i) % n]
        if m["id"] not in seen:
            seen.add(m["id"])
            uniq.append(m)
        i += 1
    return uniq


def yesterday_error(state, date):
    """从投影里找昨天最需要复盘的一条；没有就留空行让他手写。"""
    y = (date - dt.timedelta(days=1)).isoformat()
    if not state:
        return {"text": "", "node": ""}
    worst = None
    for node_id, rec in (state.get("nodes") or {}).items():
        misses = rec.get("misses") or 0
        if not misses:
            continue
        seen = rec.get("lastSeen") or ""
        if seen[:10] != y:
            continue
        score = misses * 2 + (1 - (rec.get("hitRate") or 0))
        if worst is None or score > worst[0]:
            worst = (score, node_id, rec)
    if not worst:
        return {"text": "", "node": ""}
    _, node_id, rec = worst
    return {
        "text": "misses %d · hit %.2f · 见 %s" % (
            rec.get("misses") or 0,
            rec.get("hitRate") or 0,
            (rec.get("lastSeen") or "")[:10],
        ),
        "node": node_id,
    }


def due_rows(seed, state, date):
    rows = []
    nodes = {}
    for subj in seed.get("subjects", []):
        for nd in subj.get("nodes", []):
            nodes[nd["id"]] = nd
    live = (state or {}).get("nodes") or {}
    for sid in SUBJECT_ORDER:
        hit = acc = 0
        total = 0
        due = 0
        for nid, nd in nodes.items():
            if not nid.startswith(sid + "-") and nd.get("subject") != sid:
                continue
            total += 1
            rec = live.get(nid)
            if not rec:
                continue
            hit += rec.get("hits") or 0
            acc += rec.get("misses") or 0
            if rec.get("dueAt"):
                try:
                    if dt.datetime.fromisoformat(
                        rec["dueAt"].replace("Z", "+00:00")
                    ) <= dt.datetime.now(dt.timezone.utc):
                        due += 1
                except Exception:  # noqa: BLE001
                    pass
        rows.append(
            {
                "id": sid,
                "name": SUBJECT_CN.get(sid, sid),
                "total": total,
                "due": due,
                "hits": hit,
                "misses": acc,
            }
        )
    return rows


def build_page(date):
    seed = load_seed()
    methods = load_methods()
    state = load_json(STATE, {})
    three = pick_three(methods, date)
    return {
        "date": date.isoformat(),
        "weekday": "一二三四五六日"[date.weekday()],
        "title": "NEURO-LOOP 每日一页",
        "subtitle": "只写不看答案 · 回来勾 Recon / Hint",
        "reproduce": [
            {
                "id": m["id"],
                "name": m.get("name", ""),
                "claim": m.get("claim", ""),
                "judge": m.get("judge", ""),
                "traps": (m.get("traps") or [])[:2],
                "instances": (m.get("instances") or [])[:2],
                "points": (m.get("points") or [])[:2],
            }
            for m in three
        ],
        "yesterday": yesterday_error(state, date),
        "subjects": due_rows(seed, state, date),
        "foot": "打印自 neuro-loop · 一页装三件事，不要贪多",
    }


HTML_TPL = u"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>%(date)s 每日一页</title>
<style>
  @page { size: A4; margin: 14mm 13mm; }
  body { font-family: "Microsoft YaHei","PingFang SC",sans-serif; color:#000; background:#fff; font-size:10.5pt; }
  h1 { font-size:15pt; margin:0 0 2px; letter-spacing:.5px; }
  .sub { font-size:8.5pt; color:#555; margin-bottom:10px; }
  .rule { border-top:1.2px solid #000; margin:8px 0 10px; }
  h2 { font-size:10pt; margin:12px 0 6px; padding-bottom:3px; border-bottom:1px solid #000; }
  .item { border:1px solid #999; padding:6px 8px; margin-bottom:7px; }
  .item b { font-size:10.5pt; }
  .claim { margin:3px 0 2px; }
  .meta { font-size:8.5pt; color:#333; }
  table { width:100%%; border-collapse:collapse; font-size:9pt; }
  th, td { border:1px solid #999; padding:3px 5px; text-align:left; }
  th { background:#eee; }
  .ticks { margin-top:4px; font-size:8.5pt; letter-spacing:1px; }
  .foot { margin-top:12px; font-size:8pt; color:#666; }
  .blank { height:34px; }
</style></head><body>
<h1>%(title)s</h1>
<div class="sub">%(date)s 周%(weekday)s · %(subtitle)s</div>
<div class="rule"></div>
<h2>一、今天复现三条（合上书，先写判据，再写步骤）</h2>
%(items)s
<h2>二、昨天错因一条</h2>
<div class="item"><div class="meta">%(y_text)s</div><div class="blank"></div></div>
<h2>三、提示阶梯（从下往上用，卡住才升一级）</h2>
<table><tr><th style="width:6%%">#</th><th style="width:26%%">方法</th><th>L1 方法名 · L2 第一步 · L3 关键词</th><th style="width:16%%">Recon 0-3</th><th style="width:14%%">Hint 0-2</th></tr>
%(ladder)s
</table>
<h2>四、六科今日额度</h2>
<table><tr><th>科目</th><th>考点数</th><th>到期</th><th>命中</th><th>失误</th><th style="width:30%%">今天打算碰哪块</th></tr>
%(subjects)s
</table>
<div class="foot">%(foot)s</div>
</body></html>
"""


def render_html(page):
    items = u""
    for i, m in enumerate(page["reproduce"], 1):
        traps = u"；".join(m["traps"]) or u"—"
        inst = u"、".join(m["instances"]) or u"—"
        items += (
            u'<div class="item"><b>%d. %s</b>'
            u'<div class="claim">%s</div>'
            u'<div class="meta">用它的判据：%s</div>'
            u'<div class="meta">模型：%s</div>'
            u'<div class="meta">常错：%s</div>'
            u'<div class="blank"></div></div>'
            % (i, m["name"], m["claim"], m["judge"], inst, traps)
        )
    ladder = u""
    for i, m in enumerate(page["reproduce"], 1):
        ladder += (
            u"<tr><td>%d</td><td>%s</td><td>L1 %s<br>L2 %s<br>L3 %s</td>"
            u"<td>0 1 2 3</td><td>0 1 2</td></tr>"
            % (
                i,
                m["name"],
                m["name"],
                (m["judge"] or u"—")[:24],
                (m["traps"][0] if m["traps"] else u"—")[:26],
            )
        )
    subs = u""
    for s in page["subjects"]:
        subs += u"<tr><td>%s</td><td>%d</td><td>%d</td><td>%d</td><td>%d</td><td></td></tr>" % (
            s["name"],
            s["total"],
            s["due"],
            s["hits"],
            s["misses"],
        )
    y = page.get("yesterday") or {}
    y_text = y.get("text") or u"（昨天没有记录，手写一条今天最想弄明白的）"
    if y.get("node"):
        y_text = u"%s —— %s" % (y["node"], y_text)
    return HTML_TPL % {
        "title": page["title"],
        "date": page["date"],
        "weekday": page["weekday"],
        "subtitle": page["subtitle"],
        "items": items,
        "ladder": ladder,
        "subjects": subs,
        "y_text": y_text,
        "foot": page["foot"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None)
    ap.add_argument("--print", dest="do_print", action="store_true")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--printer", default="EPSON L3250 Series (副本 1)")
    args = ap.parse_args()

    date = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    page = build_page(date)

    os.makedirs(DAILY_DIR, exist_ok=True)
    jpath = os.path.join(DAILY_DIR, date.isoformat() + ".json")
    hpath = os.path.join(DAILY_DIR, date.isoformat() + ".html")
    with io.open(jpath, "w", encoding="utf-8") as f:
        json.dump(page, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with io.open(hpath, "w", encoding="utf-8") as f:
        f.write(render_html(page))

    print("daily: %s" % jpath)
    print("daily: %s" % hpath)
    print(
        "reproduce: %s"
        % " | ".join(m["name"] for m in page["reproduce"])
    )
    if not page["reproduce"]:
        print("WARN no method cards found")
        return 1

    ps = os.path.join(HERE, "print_page.ps1")
    if args.preview:
        out = os.path.join(DAILY_DIR, date.isoformat() + ".png")
        subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                ps,
                "-Json",
                jpath,
                "-Preview",
                out,
            ],
            check=False,
        )
        print("preview: %s" % out)
    elif args.do_print:
        subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                ps,
                "-Json",
                jpath,
                "-Printer",
                args.printer,
            ],
            check=False,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
