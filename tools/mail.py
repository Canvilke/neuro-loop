#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""跨会话信箱的命令行入口。

任何会话（网页、子代理、IM 进来的、定时任务起的）都能用这一条命令给别的会话写信：

    python tools/mail.py send --to lead --subject "英语页改一下" --body "第 3 句太难，换一句"
    python tools/mail.py check --to lead            # 只看未读
    python tools/mail.py check --to lead --all      # 全部
    python tools/mail.py read --to lead --id 3fa1c2  # 标记已读

宿主在跑就走 HTTP（/neuroloop/mail），宿主没起就直接写文件——两种写法落的是同一份
jsonl，所以不会因为插件没加载而丢信。
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
import secrets
from pathlib import Path

HOME = Path(os.environ.get('NEUROLOOP_HOME') or (Path(os.environ['USERPROFILE']) / '.dsh' / 'neuro-loop'))
MAIL_DIR = HOME / 'mail'
DEFAULT_BASE = 'http://127.0.0.1:' + os.environ.get('NEUROLOOP_PORT', '64799')


def box_path(name):
    return MAIL_DIR / (name + '.jsonl')


def http_json(url, payload=None, timeout=3.0):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['content-type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers, method='POST' if data else 'GET')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def send_local(to, sender, subject, body):
    MAIL_DIR.mkdir(parents=True, exist_ok=True)
    letter = {
        'id': secrets.token_hex(6),
        'to': to,
        'from': sender,
        'subject': subject[:120] if subject else '',
        'body': body,
        'replyTo': None,
        'at': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }
    with open(box_path(to), 'a', encoding='utf-8') as f:
        f.write(json.dumps(letter, ensure_ascii=False) + '\n')
    return letter


def cmd_send(a):
    body = a.body
    if a.file:
        body = Path(a.file).read_text(encoding='utf-8')
    if not body or not body.strip():
        print('body is empty', file=sys.stderr)
        return 2
    try:
        r = http_json(DEFAULT_BASE + '/neuroloop/mail', {
            'to': a.to, 'from': a.sender, 'subject': a.subject, 'body': body})
        letter = r['letter']
        print('sent (http): %s -> %s  id=%s' % (a.sender, a.to, letter['id']))
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        letter = send_local(a.to, a.sender, a.subject, body)
        print('sent (file, host not reachable: %s): %s -> %s  id=%s'
              % (type(e).__name__, a.sender, a.to, letter['id']))
    return 0


def load_local(to):
    p = box_path(to)
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding='utf-8').splitlines():
        if line.strip():
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def cmd_check(a):
    letters = None
    try:
        url = '%s/neuroloop/mail?to=%s&limit=%d' % (DEFAULT_BASE, a.to, a.limit)
        letters = http_json(url)['letters']
    except (urllib.error.URLError, TimeoutError, OSError):
        letters = load_local(a.to)
        read = read_ids(a.to)
        for l in letters:
            l['unread'] = l['id'] not in read
    if not a.all:
        letters = [l for l in letters if l.get('unread')]
    if not letters:
        print('no %smail for %s' % ('' if a.all else 'unread ', a.to))
        return 0
    for l in letters[-a.limit:]:
        print('--- %s  from %s  %s' % (l['id'], l['from'], l.get('at', '')))
        if l.get('subject'):
            print('subject: ' + l['subject'])
        print(l['body'])
    print('\n%d letter(s)' % len(letters))
    return 0


def read_ids(to):
    p = MAIL_DIR / (to + '.read.json')
    try:
        return set(json.loads(p.read_text(encoding='utf-8')).get('ids', []))
    except (OSError, json.JSONDecodeError):
        return set()


def cmd_read(a):
    try:
        http_json(DEFAULT_BASE + '/neuroloop/mail?read=1', {'to': a.to, 'ids': a.id})
        print('marked read (http): %s' % ', '.join(a.id))
    except (urllib.error.URLError, TimeoutError, OSError):
        MAIL_DIR.mkdir(parents=True, exist_ok=True)
        ids = read_ids(a.to)
        ids.update(a.id)
        (MAIL_DIR / (a.to + '.read.json')).write_text(
            json.dumps({'ids': sorted(ids)[-1000:]}, ensure_ascii=False), encoding='utf-8')
        print('marked read (file): %s' % ', '.join(a.id))
    return 0


def main():
    p = argparse.ArgumentParser(description='cross-session mailbox')
    sub = p.add_subparsers(dest='cmd', required=True)

    s = sub.add_parser('send')
    s.add_argument('--to', required=True)
    s.add_argument('--from', dest='sender', default='lead')
    s.add_argument('--subject', default='')
    s.add_argument('--body', default='')
    s.add_argument('--file', default='')
    s.set_defaults(fn=cmd_send)

    c = sub.add_parser('check')
    c.add_argument('--to', required=True)
    c.add_argument('--all', action='store_true')
    c.add_argument('--limit', type=int, default=10)
    c.set_defaults(fn=cmd_check)

    r = sub.add_parser('read')
    r.add_argument('--to', required=True)
    r.add_argument('--id', required=True, nargs='+')
    r.set_defaults(fn=cmd_read)

    a = p.parse_args()
    return a.fn(a)


if __name__ == '__main__':
    sys.exit(main())
