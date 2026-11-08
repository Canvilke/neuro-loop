#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""方法卡校验器。

用法：
    python tools/check_methods.py            # 校验 content/method/*.json
    python tools/check_methods.py --list     # 顺带打印每张卡的 claim

规则来自 ENGINE.md §3：
  claim        <= 40 字（压缩后的记忆向量，越短越容易被还原）
  judge        必填（什么时候该用这条方法）
  steps        >= 3 步
  instances    >= 2 个具体模型（人船模型、子弹打木块……）
  traps        >= 1 条（这条方法最常错的地方）
  points       非空，且每个 id 必须存在于 data/seed.json
  source       self | ai
  verified     True 时 source 必须是 self（AI 自己不能给自己盖章）
  compression  必须等于 len(claim)
  id           必须与文件名一致，且全局唯一
  claim        不能与其它卡重复
"""

import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
METHOD_DIR = os.path.join(ROOT, "content", "method")
SEED = os.path.join(ROOT, "data", "seed.json")

CLAIM_MAX = 40


def load_seed_points():
    with io.open(SEED, encoding="utf-8") as f:
        seed = json.load(f)
    ids = set()
    for subj in seed.get("subjects", []):
        for nd in subj.get("nodes", []):
            ids.add(nd["id"])
    return ids


def check_card(path, points, seen_ids, seen_claims):
    errs = []
    name = os.path.basename(path)
    try:
        with io.open(path, encoding="utf-8") as f:
            c = json.load(f)
    except Exception as e:  # noqa: BLE001
        return ["%s: not valid json (%s)" % (name, e)], None

    cid = c.get("id", "")
    if not cid:
        errs.append("%s: missing id" % name)
    elif cid + ".json" != name:
        errs.append("%s: id %r does not match filename" % (name, cid))
    if cid in seen_ids:
        errs.append("%s: duplicate id %r" % (name, cid))
    seen_ids.add(cid)

    claim = (c.get("claim") or "").strip()
    if not claim:
        errs.append("%s: claim is empty" % name)
    else:
        if len(claim) > CLAIM_MAX:
            errs.append("%s: claim is %d chars (>%d)" % (name, len(claim), CLAIM_MAX))
        if claim in seen_claims:
            errs.append("%s: claim duplicates another card" % name)
        seen_claims.add(claim)
        if c.get("compression") != len(claim):
            errs.append(
                "%s: compression=%r but len(claim)=%d"
                % (name, c.get("compression"), len(claim))
            )

    if not (c.get("judge") or "").strip():
        errs.append("%s: judge is empty" % name)

    steps = c.get("steps") or []
    if len(steps) < 3:
        errs.append("%s: steps has %d entries (<3)" % (name, len(steps)))

    inst = c.get("instances") or []
    if len(inst) < 2:
        errs.append("%s: instances has %d entries (<2)" % (name, len(inst)))

    traps = c.get("traps") or []
    if len(traps) < 1:
        errs.append("%s: traps is empty" % name)

    pts = c.get("points") or []
    if not pts:
        errs.append("%s: points is empty" % name)
    for p in pts:
        if p not in points:
            errs.append("%s: point %r not in seed" % (name, p))

    src = c.get("source")
    if src not in ("self", "ai"):
        errs.append("%s: source %r must be 'self' or 'ai'" % (name, src))
    if c.get("verified") and src != "self":
        errs.append("%s: verified=true but source=%r (AI cannot self-verify)" % (name, src))

    conf = c.get("confidence")
    if conf is not None and not (0 <= conf <= 1):
        errs.append("%s: confidence %r out of [0,1]" % (name, conf))

    return errs, c


def main():
    want_list = "--list" in sys.argv
    if not os.path.isdir(METHOD_DIR):
        print("FAIL  no method dir:", METHOD_DIR)
        return 1

    points = load_seed_points()
    files = sorted(
        os.path.join(METHOD_DIR, f)
        for f in os.listdir(METHOD_DIR)
        if f.endswith(".json")
    )
    if not files:
        print("FAIL  no method cards in", METHOD_DIR)
        return 1

    seen_ids, seen_claims, errors = set(), set(), []
    unverified = 0
    for path in files:
        errs, card = check_card(path, points, seen_ids, seen_claims)
        errors.extend(errs)
        if card and not card.get("verified"):
            unverified += 1

    for e in errors:
        print("  FAIL", e)

    print("methods: %d cards, seed points: %d" % (len(files), len(points)))
    print("unverified (source=ai): %d / %d" % (unverified, len(files)))
    if want_list:
        for path in files:
            with io.open(path, encoding="utf-8") as f:
                c = json.load(f)
            print("  - %-24s %s" % (c.get("id"), c.get("claim")))

    if errors:
        print("methods FAILED - %d problem(s)" % len(errors))
        return 1
    print("methods ok - %d cards valid" % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
