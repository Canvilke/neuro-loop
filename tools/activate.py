#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""NEURO-LOOP 激活检查。

用途：无论什么时候、谁打开这台机器，先跑这一个命令，
      十秒内知道"系统还在不在、需不需要重建、上次停在哪"。

    python tools/activate.py           # 只检查
    python tools/activate.py --test    # 检查 + 跑一遍全部无头测试

退出码：0 一切正常 / 1 需要处理（会打印怎么处理）。
"""
from __future__ import print_function
import io
import json
import os
import sys
import glob
import subprocess
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)
HOME = os.environ.get('NEUROLOOP_HOME') or os.path.join(
    os.environ.get('USERPROFILE') or os.path.expanduser('~'), '.dsh', 'neuro-loop')

OK, WARN, BAD = '  OK  ', ' WARN ', ' FAIL '
problems = []


def say(tag, msg):
    print('%s %s' % (tag, msg))
    if tag == BAD:
        problems.append(msg)


def main():
    print('=' * 62)
    print('NEURO-LOOP 激活检查   %s' % datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    print('=' * 62)

    # 1. 构建产物
    client = os.path.join(PKG, 'client.js')
    srcs = sorted(glob.glob(os.path.join(PKG, 'src', '*.js')))
    if not os.path.exists(client):
        say(BAD, 'client.js 不存在 —— 跑 python build.py --check')
    else:
        csize = os.path.getsize(client)
        newest = max([os.path.getmtime(s) for s in srcs] or [0])
        if newest > os.path.getmtime(client) + 1:
            say(WARN, 'client.js 落后于 src/（%d B）—— 跑 python build.py --check' % csize)
        else:
            say(OK, 'client.js %d B，与 src/ 同步（%d 个模块）' % (csize, len(srcs)))

    # 2. 种子数据
    try:
        seed = json.loads(io.open(os.path.join(PKG, 'data', 'seed.json'), encoding='utf-8').read())
        subs = seed.get('subjects') or []
        nodes = sum(len(s.get('nodes') or []) for s in subs)
        shards = len(seed.get('shards') or [])
        groups = sum(len(s.get('groups') or []) for s in subs)
        say(OK, 'seed: %d 科 / %d 块 / %d 考点 / %d 碎片' % (len(subs), groups, nodes, shards))
    except Exception as e:
        say(BAD, 'seed.json 读不了：%s' % e)

    # 3. 数据家目录
    if not os.path.isdir(HOME):
        say(WARN, '数据目录未建立（%s）—— 首次写入时会自动建' % HOME)
    else:
        st = os.path.join(HOME, 'state.json')
        evs = sorted(glob.glob(os.path.join(HOME, 'events-*.jsonl')))
        total = 0
        for p in evs:
            try:
                total += sum(1 for ln in io.open(p, encoding='utf-8') if ln.strip())
            except Exception:
                pass
        if os.path.exists(st):
            try:
                s = json.loads(io.open(st, encoding='utf-8').read())
                say(OK, 'state.json: rev=%s，%d 个考点有记录，%d 条事件' %
                    (s.get('rev'), len(s.get('nodes') or {}), total))
            except Exception as e:
                say(WARN, 'state.json 坏了（%s）—— 删掉它会自动重建' % e)
        else:
            say(WARN, '还没有 state.json（还没在界面里判定过任何一次）')
        if evs:
            say(OK, '事件流 %d 个月文件，共 %d 条' % (len(evs), total))

    # 4. 插件是否装进 profile
    prof = os.path.join(os.environ.get('USERPROFILE') or os.path.expanduser('~'),
                        '.dsh', 'profiles', 'desktop', 'package.json')
    try:
        p = json.loads(io.open(prof, encoding='utf-8').read())
        deps = dict(p.get('dependencies') or {})
        deps.update(p.get('devDependencies') or {})
        hit = [k for k in deps if 'neuro-loop' in k]
        if hit:
            say(OK, '已挂进 profile: %s -> %s' % (hit[0], deps[hit[0]]))
        else:
            say(BAD, 'profile 里没有 neuro-loop —— 用 plugin_manager install_bundle 装')
    except Exception as e:
        say(WARN, '读不到 profile/package.json：%s' % e)

    # 5. 文档是否在位
    for f in ('README.md', 'TASKS.md', 'ROADMAP.md', 'NEXT.md', 'DESIGN.md'):
        p = os.path.join(PKG, f)
        if not os.path.exists(p):
            say(WARN, '%s 缺失' % f)

    # 6. 可选：跑全部无头测试
    if '--test' in sys.argv:
        tests = ['smoke.cjs', 'levels.cjs', 'boot.cjs', 'net.cjs', 'host.mjs']
        for t in tests:
            p = os.path.join(PKG, 'test', t)
            if not os.path.exists(p):
                say(WARN, '缺测试 %s' % t)
                continue
            r = subprocess.run(['node', p], cwd=PKG, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT)
            out = (r.stdout or b'').decode('utf-8', 'replace').strip().splitlines()
            tail = '(无输出)'
            for line in out:
                low = line.lower()
                if ' ok ' in low or low.startswith('ok') or '— ' in line:
                    tail = line
            say(OK if r.returncode == 0 else BAD, '%s → %s' % (t, tail[-110:]))

    print('-' * 62)
    if problems:
        print('需要处理 %d 项：' % len(problems))
        for i, m in enumerate(problems, 1):
            print('  %d) %s' % (i, m))
        print('下一步看 NEXT.md 顶部的"现在做什么"。')
        return 1
    print('一切正常。接下来做什么，看 NEXT.md 顶部那三行。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
