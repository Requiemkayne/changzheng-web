/**
 * 账号体系 —— 注册 / 登录 / 会话
 *
 * 密码：scrypt（N=16384）+ 每用户 16 字节随机盐，库里只存哈希；
 *       走异步 crypto.scrypt（Promise 化），N=16384 的计算不再阻塞事件循环
 * 会话：32 字节随机 token + HMAC-SHA256 签名；服务端只存 sha256(token)，7 天过期
 * 锁定：按「客户端 IP + 用户名」5 次失败锁 10 分钟（内存计数，重启清零）；
 *       只锁该 IP 对该用户名的尝试，别人输错不会把账号锁给别人；
 *       15 分钟无失败即过期，另有 sweepFails() 定时清理，Map 不会无界增长
 */
'use strict'

const crypto = require('node:crypto')

const SCRYPT = { N: 16384, r: 8, p: 1 }
const KEY_LEN = 32
const TOKEN_TTL = 7 * 24 * 3600 * 1000
const MAX_FAILS = 5
const LOCK_MS = 10 * 60 * 1000
const FAIL_TTL = 15 * 60 * 1000
const SWEEP_MS = 60 * 1000

// 账号 = 8 位数字学号（学校统一编号，天然可核实）
const USERNAME_RE = /^\d{8}$/

/* ---------- 密码（异步 scrypt，不阻塞事件循环） ---------- */

/** Promise 化的 crypto.scrypt：派生布局与 scryptSync 完全一致，老库可继续用 */
function scryptAsync(password, salt, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, SCRYPT, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

async function hashPassword(password, saltHex) {
  const hash = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LEN)
  return hash.toString('hex')
}

function newSalt() {
  return crypto.randomBytes(16).toString('hex')
}

async function verifyPassword(password, saltHex, hashHex) {
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length !== KEY_LEN) return false
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LEN)
  return crypto.timingSafeEqual(actual, expected)
}

/* ---------- 令牌签名密钥（存 meta 表，重启不失效） ---------- */

function getSecret(db) {
  let row = db.prepare("SELECT value FROM meta WHERE key = 'token_secret'").get()
  if (row) return row.value
  const secret = crypto.randomBytes(32).toString('hex')
  db.prepare("INSERT INTO meta (key, value) VALUES ('token_secret', ?)").run(secret)
  return secret
}

function signToken(db) {
  const rand = crypto.randomBytes(32).toString('hex')
  const mac = crypto.createHmac('sha256', getSecret(db)).update(rand).digest('hex')
  return rand + '.' + mac
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/* ---------- 登录失败计数（内存，按 IP + 用户名） ---------- */

/** key = '客户端IP|用户名'：锁定语义只覆盖「该 IP 对该用户名」 */
function failKey(ip, username) {
  return String(ip || 'unknown') + '|' + String(username || '')
}

const fails = new Map()      // key -> { count, lockUntil, lastAt }
let lastSweep = 0

function expired(rec, now) {
  // lockUntil=0 表示仅累计失败、未锁定：靠 FAIL_TTL 过期；锁定中的按 lockUntil 过期
  return rec.lockUntil > 0 ? now > rec.lockUntil : now - rec.lastAt > FAIL_TTL
}

/** 立即清理已过期条目（server 的定时器也会调） */
function sweepFails(now) {
  now = now || Date.now()
  for (const [key, rec] of fails) {
    if (expired(rec, now)) fails.delete(key)
  }
  lastSweep = now
}

function isLocked(ip, username) {
  const key = failKey(ip, username)
  const rec = fails.get(key)
  if (!rec) return false
  const now = Date.now()
  if (expired(rec, now)) {
    fails.delete(key)
    return false
  }
  return rec.lockUntil > 0
}

function recordFail(ip, username) {
  const now = Date.now()
  // 惰性清理：最多每分钟扫一次，避免高频失败时反复遍历
  if (now - lastSweep > SWEEP_MS) sweepFails(now)
  const key = failKey(ip, username)
  const rec = fails.get(key) || { count: 0, lockUntil: 0, lastAt: now }
  rec.count++
  rec.lastAt = now
  if (rec.count >= MAX_FAILS) rec.lockUntil = now + LOCK_MS
  fails.set(key, rec)
  return rec
}

function clearFails(ip, username) {
  fails.delete(failKey(ip, username))
}

function failsSize() {
  return fails.size
}

/* ---------- 注册 / 登录 ---------- */

async function register(db, username, password, nickname) {
  username = String(username || '').trim()
  nickname = String(nickname || '').trim().slice(0, 20) || username
  if (!USERNAME_RE.test(username)) {
    return { ok: false, status: 400, error: 'INVALID_USERNAME', message: '账号必须是 8 位数字学号' }
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
    return { ok: false, status: 400, error: 'INVALID_PASSWORD', message: '密码需 6-64 位' }
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (exists) {
    return { ok: false, status: 409, error: 'USERNAME_TAKEN', message: '用户名已被注册' }
  }
  const salt = newSalt()
  const hash = await hashPassword(password, salt)
  const info = db.prepare(
    'INSERT INTO users (username, salt, hash, nickname, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(username, salt, hash, nickname, Date.now())
  const userId = Number(info.lastInsertRowid)
  return { ok: true, userId, username, nickname, token: createSession(db, userId) }
}

async function login(db, username, password, ip) {
  username = String(username || '').trim()
  if (isLocked(ip, username)) {
    return { ok: false, status: 429, error: 'RATE_LIMITED', message: '失败次数过多，请 10 分钟后再试' }
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  // 用户名不存在也走一次等价的 scrypt，避免「响应时间差」暴露账号是否注册
  const passOk = user
    ? await verifyPassword(String(password || ''), user.salt, user.hash)
    : false
  if (!passOk) {
    recordFail(ip, username)
    return { ok: false, status: 401, error: 'BAD_CREDENTIALS', message: '用户名或密码错误' }
  }
  clearFails(ip, username)
  return {
    ok: true,
    userId: Number(user.id),
    username: user.username,
    nickname: user.nickname,
    token: createSession(db, Number(user.id))
  }
}

/* ---------- 会话 ---------- */

function createSession(db, userId) {
  const token = signToken(db)
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash(token), userId, Date.now() + TOKEN_TTL)
  return token
}

/** 校验 token → 用户行；无效/过期返回 null */
function getUserByToken(db, token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const row = db.prepare(
    'SELECT u.id, u.username, u.nickname, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
  ).get(tokenHash(token))
  if (!row) return null
  if (Number(row.expires_at) < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
    return null
  }
  return { id: Number(row.id), username: row.username, nickname: row.nickname }
}

/**
 * 重置某个账号的密码（管理员用）
 */
async function resetPassword(db, username, newPassword) {
  if (!USERNAME_RE.test(String(username || ''))) {
    return { ok: false, status: 400, error: 'INVALID_USERNAME', message: '账号必须是 8 位数字学号' }
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 64) {
    return { ok: false, status: 400, error: 'INVALID_PASSWORD', message: '密码需 6-64 位' }
  }
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (!row) return { ok: false, status: 404, error: 'USER_NOT_FOUND', message: '账号不存在' }

  const salt = crypto.randomBytes(16).toString('hex')
  const hash = (await scryptAsync(newPassword, Buffer.from(salt, 'hex'), KEY_LEN)).toString('hex')
  db.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?').run(salt, hash, row.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id)
  return { ok: true, username }
}

/**
 * 批量创建学生账号（8 位学号 + 统一初始密码），已存在的跳过
 */
async function bulkCreateUsers(db, usernames, initialPassword, nicknamePrefix) {
  const created = []
  const skipped = []
  const invalid = []
  for (const raw of usernames) {
    const u = String(raw || '').trim()
    if (!u) continue
    if (!USERNAME_RE.test(u)) { invalid.push(u); continue }
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(u)
    if (exists) { skipped.push(u); continue }
    const r = await register(db, u, initialPassword, nicknamePrefix ? nicknamePrefix + u : '')
    if (r.ok) created.push(u)
    else invalid.push(u)
  }
  return { created, skipped, invalid }
}

function logout(db, token) {
  if (typeof token === 'string') {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
  }
}

/** 清理过期会话（启动时 + 周期性调用） */
function sweepSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
}

module.exports = {
  register, login, createSession, getUserByToken, logout, sweepSessions,
  resetPassword, bulkCreateUsers,
  hashPassword, verifyPassword,
  // 失败计数（导出供单测 / server 定时清理）
  failKey, isLocked, recordFail, clearFails, sweepFails, failsSize
}
