// host/idempotency.js —— 写接口的幂等键（24 小时窗口）。
//
// 只做两件事：按键取回上一次的成功响应；把本次成功响应追加进
// dataDir()/idempotency.jsonl。不改事件、不碰投影——真正落盘仍是
// host/service.js 的 addEvent()，这里只决定"这次要不要再走一遍它"。
//
// 记录一行：{ key, at, fingerprint, status, body }
//   key         请求头 Idempotency-Key 原文（8-128 字节，^[A-Za-z0-9._:-]+$）
//   at          首次成功写入的 ISO 时间（24h 后过期）
//   fingerprint sha1(键排序后的 JSON)，同键不同载荷 → 409 idem-key-conflict
//   status/body 首次成功响应的状态码与响应体，重放时原样返回
//
// 进程内 Map 懒加载：某个键第一次出现时才去文件里找它；
// 文件 append-only，超过 5000 行时 tmp+rename 重写，只留未过期项。

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import { dataDir } from './service.js'

const FILE_NAME = 'idempotency.jsonl'
const TTL_MS = 24 * 60 * 60 * 1000
const MAX_LINES = 5000
const MIN_KEY_BYTES = 8
const MAX_KEY_BYTES = 128
const KEY_RE = /^[A-Za-z0-9._:-]+$/

/** key → 该键最近一条记录。懒加载，一个键只留一条。 */
const cache = new Map()
let lineCount = 0
let counted = false

function filePath() {
  return path.join(dataDir(), FILE_NAME)
}

/**
 * 读请求头的幂等键。
 * @returns {{ok:true,key:string|null}|{ok:false,code:string}}
 * 缺失 = 不启用幂等（行为与没有这个功能时完全一致）；格式非法 = 400 bad-idem-key。
 */
export function idempotencyKey(req) {
  const headers = (req && req.headers) || {}
  const raw = headers['idempotency-key'] !== undefined
    ? headers['idempotency-key']
    : headers['Idempotency-Key']
  if (raw === undefined || raw === null) return { ok: true, key: null }
  const key = String(Array.isArray(raw) ? raw[0] : raw)
  const bytes = Buffer.byteLength(key, 'utf8')
  if (bytes < MIN_KEY_BYTES || bytes > MAX_KEY_BYTES || !KEY_RE.test(key)) {
    return { ok: false, code: 'bad-idem-key' }
  }
  return { ok: true, key }
}

/** 键排序后的 JSON：同内容不同字段顺序 → 同一个指纹。 */
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}

/** 载荷指纹：sha1(键排序 JSON)。 */
export function fingerprint(payload) {
  return createHash('sha1').update(canonical(payload), 'utf8').digest('hex')
}

function parseLine(text) {
  try {
    const v = JSON.parse(text)
    if (!v || typeof v.key !== 'string' || typeof v.at !== 'string') return null
    return v
  } catch {
    return null
  }
}

function readLines() {
  let text = ''
  try {
    text = fs.readFileSync(filePath(), 'utf8')
  } catch {
    return []
  }
  return text.split('\n').filter((line) => line.trim())
}

function expired(entry, now) {
  const at = Date.parse(entry.at)
  return !Number.isFinite(at) || now - at > TTL_MS
}

/** 懒加载：这个键第一次出现时从文件里找它最后一条记录。 */
function loadKey(key) {
  if (cache.has(key)) return cache.get(key)
  const lines = readLines()
  lineCount = lines.length
  counted = true
  let found = null
  for (const line of lines) {
    const entry = parseLine(line)
    if (entry && entry.key === key) found = entry
  }
  if (found) cache.set(key, found)
  return found
}

/**
 * 判定这次请求该怎么走。
 * @returns {{mode:'new'}|{mode:'conflict',entry:object}|{mode:'replay',entry:object}}
 * 过期（>24h）一律按 new 处理——过期键既不复用也不判冲突。
 */
export function lookup(key, fp) {
  const entry = loadKey(key)
  if (!entry) return { mode: 'new' }
  if (expired(entry, Date.now())) return { mode: 'new' }
  if (entry.fingerprint !== fp) return { mode: 'conflict', entry }
  if (typeof entry.status !== 'number' || !entry.body || typeof entry.body !== 'object') {
    return { mode: 'new' }
  }
  return { mode: 'replay', entry }
}

/**
 * 记下一次成功响应。
 * @returns {object} 落盘的那条记录
 */
export function record(key, fp, status, body) {
  const entry = { key, at: new Date().toISOString(), fingerprint: fp, status, body }
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.appendFileSync(filePath(), JSON.stringify(entry) + '\n', 'utf8')
  cache.set(key, entry)
  lineCount = (counted ? lineCount : readLines().length) + 1
  counted = true
  if (lineCount > MAX_LINES) compact()
  return entry
}

/** 超过 5000 行：tmp+rename 重写，只留未过期项（每键留最新一条）。 */
function compact() {
  const now = Date.now()
  const latest = new Map()
  for (const line of readLines()) {
    const entry = parseLine(line)
    if (!entry || expired(entry, now)) continue
    latest.set(entry.key, entry)
  }
  const kept = [...latest.values()]
  const tmp = filePath() + '.tmp'
  fs.writeFileSync(tmp, kept.length ? kept.map((e) => JSON.stringify(e)).join('\n') + '\n' : '', 'utf8')
  fs.renameSync(tmp, filePath())
  cache.clear()
  for (const entry of kept) cache.set(entry.key, entry)
  lineCount = kept.length
  counted = true
}
