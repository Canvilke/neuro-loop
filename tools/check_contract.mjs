#!/usr/bin/env node
/**
 * tools/check_contract.mjs —— 数据契约门禁。
 *
 * 真读两份代码与一份文档，做三方比对：
 *   1) core/contract.js 的 EVENT_KINDS、EVENT_VERSION、SCHEMA_VERSION
 *   2) storage/projection.js 的 CREATE TABLE 字段
 *   3) docs/DATA.md 第 2 节（事件）与第 3 节（表）的声明
 *
 * 退出码：0 一致；1 有不一致。
 * 用法：node tools/check_contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const problems = [];
const fail = (msg) => problems.push(msg);

/** 读文本并统一换行，避免 CRLF 影响正则。 */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

/** 按顶层逗号切分（忽略括号内的逗号）。 */
function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** 解析 core/contract.js 的常量。 */
function parseContract(src) {
  const kindsBlock = src.match(/export const EVENT_KINDS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  if (!kindsBlock) fail('core/contract.js: 找不到 EVENT_KINDS');
  const eventKinds = kindsBlock
    ? [...kindsBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    : [];

  const eventVersion = src.match(/export const EVENT_VERSION = (\d+);/);
  const schemaVersion = src.match(/export const SCHEMA_VERSION = (\d+);/);
  if (!eventVersion) fail('core/contract.js: 找不到 EVENT_VERSION');
  if (!schemaVersion) fail('core/contract.js: 找不到 SCHEMA_VERSION');

  return {
    eventKinds,
    eventVersion: eventVersion ? Number(eventVersion[1]) : null,
    schemaVersion: schemaVersion ? Number(schemaVersion[1]) : null,
  };
}

/** 解析 storage/projection.js 的 CREATE TABLE。 */
function parseSchema(src) {
  const schemaBlock = src.match(/const SCHEMA = `([\s\S]*?)`;/);
  if (!schemaBlock) {
    fail('storage/projection.js: 找不到 const SCHEMA');
    return new Map();
  }
  const sql = schemaBlock[1];
  const tables = new Map();
  const tableRe = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*?)\);/g;
  let match;
  while ((match = tableRe.exec(sql)) !== null) {
    const name = match[1];
    const fields = [];
    for (const part of splitTopLevel(match[2])) {
      const piece = part.trim();
      if (!piece) continue;
      // 表级约束不是字段。
      if (/^(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|CONSTRAINT)\b/i.test(piece)) continue;
      const field = piece.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      if (field) fields.push(field[1]);
    }
    if (tables.has(name)) fail(`storage/projection.js: 表 ${name} 重复定义`);
    tables.set(name, fields);
  }
  if (tables.size === 0) fail('storage/projection.js: 没有解析出任何 CREATE TABLE');
  return tables;
}

/**
 * 解析 docs/DATA.md：
 *   - `### 2.x \`kind\`` 小节里的「必填字段」行
 *   - `### 3.x \`table\`` 小节里的字段表第一列
 */
function parseDoc(doc) {
  const events = [];
  const tables = [];
  let current = null;

  for (const line of doc.split('\n')) {
    const heading = line.match(/^### (2|3)\.(\d+) `([^`]+)`\s*$/);
    if (heading) {
      current = { group: heading[1], name: heading[3], lines: [] };
      if (heading[1] === '2') events.push(current);
      else tables.push(current);
      continue;
    }
    if (/^#{1,6} /.test(line)) {
      current = null; // 任何其它标题都结束当前小节，防止串到后续章节。
      continue;
    }
    if (current) current.lines.push(line);
  }

  for (const ev of events) {
    const row = ev.lines.find((l) => /^\|\s*必填字段\s*\|/.test(l));
    if (!row) {
      fail(`docs/DATA.md: 事件 ${ev.name} 缺少「必填字段」行`);
      ev.fields = [];
      continue;
    }
    ev.fields = [...row.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (ev.fields.length === 0) fail(`docs/DATA.md: 事件 ${ev.name} 的必填字段为空`);
  }

  for (const table of tables) {
    table.fields = table.lines
      .map((l) => l.match(/^\|\s*`([^`]+)`\s*\|/))
      .filter(Boolean)
      .map((m) => m[1]);
    if (table.fields.length === 0) fail(`docs/DATA.md: 表 ${table.name} 没有字段行`);
    if (table.fields.length !== new Set(table.fields).size) {
      fail(`docs/DATA.md: 表 ${table.name} 有重复字段`);
    }
  }

  return { events, tables };
}

/** 两个列表的差异描述。 */
function diffLists(expected, actual, label) {
  const missing = expected.filter((x) => !actual.includes(x));
  const extra = actual.filter((x) => !expected.includes(x));
  if (missing.length) fail(`${label}: 文档缺少 ${missing.join(', ')}`);
  if (extra.length) fail(`${label}: 文档多出 ${extra.join(', ')}`);
}

function main() {
  const contractSrc = read('core/contract.js');
  const projectionSrc = read('storage/projection.js');
  const eventsSrc = read('core/events.js');
  const doc = read('docs/DATA.md');

  const { eventKinds, eventVersion, schemaVersion } = parseContract(contractSrc);
  const schemaTables = parseSchema(projectionSrc);
  const { events: docEvents, tables: docTables } = parseDoc(doc);

  // 1) 事件名单：顺序也要一致，顺序即契约的一部分。
  const docEventNames = docEvents.map((e) => e.name);
  if (docEventNames.join(',') !== eventKinds.join(',')) {
    diffLists(eventKinds, docEventNames, 'docs/DATA.md 事件名单');
    if (!problems.length) {
      fail(`docs/DATA.md: 事件顺序与 EVENT_KINDS 不一致（${docEventNames.join(', ')}）`);
    }
  }

  // 2) 每个事件的必填字段必须真的在 core/events.js 里出现。
  for (const ev of docEvents) {
    for (const field of ev.fields) {
      const re = new RegExp(`\\b${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (!re.test(eventsSrc)) {
        fail(`docs/DATA.md: 事件 ${ev.name} 的字段 ${field} 在 core/events.js 中找不到`);
      }
    }
  }

  // 3) 表名单与字段集合。
  diffLists([...schemaTables.keys()], docTables.map((t) => t.name), 'docs/DATA.md 表名单');
  const docTableMap = new Map(docTables.map((t) => [t.name, t.fields]));
  for (const [name, fields] of schemaTables) {
    const declared = docTableMap.get(name);
    if (!declared) continue;
    diffLists(fields, declared, `docs/DATA.md 表 ${name} 字段`);
  }

  // 4) 版本号。
  for (const [name, expected] of [
    ['EVENT_VERSION', eventVersion],
    ['SCHEMA_VERSION', schemaVersion],
  ]) {
    const m = doc.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
    if (!m) {
      fail(`docs/DATA.md: 找不到 ${name} = ${expected}`);
    } else if (Number(m[1]) !== expected) {
      fail(`docs/DATA.md: ${name} = ${m[1]}，代码里是 ${expected}`);
    }
  }

  // 5) 文档必须同时声明 7 张表、9 种事件（当前契约规模）。
  if (schemaTables.size !== 7) fail(`storage/projection.js: 期望 7 张表，实际 ${schemaTables.size} 张`);
  if (eventKinds.length !== 9) fail(`core/contract.js: 期望 9 种事件，实际 ${eventKinds.length} 种`);

  if (problems.length) {
    console.error(`contract FAIL — ${problems.length} 处不一致`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    `contract ok — ${schemaTables.size} tables, ${eventKinds.length} event kinds, fields match`,
  );
}

main();
