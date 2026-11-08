#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把桌面上的原型库 `neuro_loop.db` 只读导出成 JSON。

    python tools/import_proto_db.py                 # 导出到 imports/proto-<日期>/
    python tools/import_proto_db.py --db D:\\x.db   # 指定别的库
    python tools/import_proto_db.py --dry           # 只看会导出什么

三条铁律（写进代码，不靠自觉）：

1. **只读**。sqlite 以 `mode=ro` 打开；全程没有一条 INSERT/UPDATE/DELETE。
2. **不并入 L1**。这些文件只是"原始素材快照"，事件流仍然只由界面里的真实操作写入。
3. **不覆盖**。目标目录已存在就带序号另建，不删旧导出。

为什么只导出不映射：原型里的 param 名和现在的 seed 考点名不是一一对应
（原型是化学单科 + 少量泛化概念，seed 是六科 69 个考点），
强行自动对齐会产生假数据。脚本只给出"候选映射建议"，最终是否导入由人定。
"""
from __future__ import print_function
import argparse
import datetime
import io
import json
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)
DEFAULT_DB = os.path.join(os.environ.get('USERPROFILE') or os.path.expanduser('~'),
                          'Desktop', 'neuro_loop.db')
OUT_ROOT = os.path.join(PKG, 'imports')

TABLES = ('params', 'connections', 'kv_cache')


def ro_connect(path):
    uri = 'file:%s?mode=ro' % path.replace('\\', '/').replace('?', '%3f').replace('#', '%23')
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    return con


def table_rows(con, name):
    try:
        return [dict(r) for r in con.execute('select * from "%s"' % name)]
    except sqlite3.Error as e:
        return [{'__error__': str(e)}]


def norm(s):
    return re.sub(r'[\s·\-—_/、，,。()（）]', '', str(s or '')).lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=DEFAULT_DB)
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    if not os.path.exists(args.db):
        print('找不到原型库：%s' % args.db)
        return 2

    con = ro_connect(args.db)
    data = {}
    for t in TABLES:
        data[t] = table_rows(con, t)
    try:
        schema = [dict(r) for r in con.execute(
            "select name, sql from sqlite_master where type in ('table','index') order by name")]
    except sqlite3.Error:
        schema = []
    con.close()

    # 与当前 seed 做"候选映射"（只建议，不写入任何东西）
    seed_path = os.path.join(PKG, 'data', 'seed.json')
    nodes = []
    try:
        seed = json.loads(io.open(seed_path, encoding='utf-8').read())
        for s in seed.get('subjects') or []:
            for n in s.get('nodes') or []:
                nodes.append({'id': n.get('id'), 'label': n.get('label'), 'subject': s.get('id')})
    except Exception as e:
        print('（seed 读不了，跳过候选映射：%s）' % e)

    suggest = []
    for p in data['params']:
        if '__error__' in p:
            continue
        key = norm(p.get('name'))
        best = None
        for n in nodes:
            lb = norm(n['label'])
            if not lb or not key:
                continue
            if key == lb:
                best = (n, 1.0)
                break
            if key in lb or lb in key:
                score = min(len(key), len(lb)) / float(max(len(key), len(lb)))
                if not best or score > best[1]:
                    best = (n, round(score, 2))
        suggest.append({
            'param': p.get('name'),
            'domain': p.get('domain'),
            'candidate': best[0] if best else None,
            'score': best[1] if best else 0,
        })

    summary = {
        'exportedAt': datetime.datetime.now().isoformat(timespec='seconds'),
        'source': args.db,
        'readOnly': True,
        'mergedIntoEvents': False,
        'counts': {t: len(data[t]) for t in TABLES},
        'note': ('原型库只做快照；事件流 L1 只由界面真实操作写入。'
                 '候选映射仅供参考，不自动导入。'),
        'mapping': suggest,
        'schema': schema,
    }

    print('原型库：%s' % args.db)
    for t in TABLES:
        print('  %-12s %d 行' % (t, len(data[t])))
    hit = [m for m in suggest if m['candidate']]
    print('  可对齐的考点：%d / %d 个概念' % (len(hit), len(suggest)))
    for m in hit:
        print('    %-18s → %s（%s，%.2f）' % (m['param'], m['candidate']['id'],
                                              m['candidate']['label'], m['score']))

    if args.dry:
        print('（--dry：不写文件）')
        return 0

    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    out = os.path.join(OUT_ROOT, 'proto-%s' % stamp)
    n = 1
    while os.path.exists(out):
        n += 1
        out = os.path.join(OUT_ROOT, 'proto-%s-%d' % (stamp, n))
    os.makedirs(out)

    def dump(name, obj):
        p = os.path.join(out, name)
        io.open(p, 'w', encoding='utf-8', newline='\n').write(
            json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
        return p

    dump('params.json', data['params'])
    dump('connections.json', data['connections'])
    dump('kv_cache.json', data['kv_cache'])
    dump('summary.json', summary)
    io.open(os.path.join(out, 'README.txt'), 'w', encoding='utf-8', newline='\n').write(
        '这是原型库 neuro_loop.db 的只读快照，不是 Neuro-Loop 的正式数据。\n'
        '正式数据在 %USERPROFILE%\\.dsh\\neuro-loop\\ （事件流 + 投影）。\n'
        '是否把这些概念并进 seed，需要人来决定；脚本只给了 summary.json 里的候选映射。\n')

    print('已导出 → %s' % out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
