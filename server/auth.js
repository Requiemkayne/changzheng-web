/**
 * 账号体系 —— 注册 / 登录 / 会话
 *
 * 密码：scrypt（N=16384）+ 每用户 16 字节随机盐，库里只存哈希
 * 会话：32 字节随机 token + HMAC-SHA256 签名；服务端只存 sha256(token)，7 天过期
 * 限速：同一用户名 5 次失败锁 10 分钟（内存计数，重启清零）
 */
'use strict'

const crypto = require('node:crypto')

const SCRYPT = { N: 16384, r: 8, p: 1 }
const KEY_LEN = 32
const TOKEN_TTL = 7 * 24 * 3600 * 1000
const MAX_FAILS = 5
const LOCK_MS = 10 * 60 * 1000

const USERNAME_RE = /^[\w一-龥]{2,16}$/

/* ---------- 密码 ---------- */

function hashPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex')
  const hash = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT)
  return hash.toString('hex')
}

function newSalt() {
  return crypto.randomBytes(16).toString('hex')
}

function verifyPassword(password, saltHex, hashHex) {
  const actual = Buffer.from(hashPassword(password, saltHex), 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
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

/* ---------- 登录限速（内存） ---------- */

const fails = new Map()

function checkLocked(username) {
  const rec = fails.get(username)
  if (!rec) return false
  // lockUntil=0 表示未触发锁定（仅累计失败次数），不算锁定
  if (rec.lockUntil > 0 && Date.now() > rec.lockUntil) {
    fails.delete(username)
    return false
  }
  return rec.lockUntil > 0
}

function noteFail(username) {
  const rec = fails.get(username) || { count: 0, lockUntil: 0 }
  rec.count++
  if (rec.count >= MAX_FAILS) rec.lockUntil = Date.now() + LOCK_MS
  fails.set(username, rec)
}

function clearFails(username) {
  fails.delete(username)
}

/* ---------- 注册 / 登录 ---------- */

function register(db, username, password, nickname) {
  username = String(username || '').trim()
  nickname = String(nickname || '').trim().slice(0, 20) || username
  if (!USERNAME_RE.test(username)) {
    return { ok: false, status: 400, error: 'INVALID_USERNAME', message: '用户名需 2-16 位，可用中文、字母、数字、下划线' }
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
    return { ok: false, status: 400, error: 'INVALID_PASSWORD', message: '密码需 6-64 位' }
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (exists) {
    return { ok: false, status: 409, error: 'USERNAME_TAKEN', message: '用户名已被注册' }
  }
  const salt = newSalt()
  const info = db.prepare(
    'INSERT INTO users (username, salt, hash, nickname, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(username, salt, hashPassword(password, salt), nickname, Date.now())
  const userId = Number(info.lastInsertRowid)
  return { ok: true, userId, username, nickname, token: createSession(db, userId) }
}

function login(db, username, password) {
  username = String(username || '').trim()
  if (checkLocked(username)) {
    return { ok: false, status: 429, error: 'RATE_LIMITED', message: '失败次数过多，请 10 分钟后再试' }
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || !verifyPassword(String(password || ''), user.salt, user.hash)) {
    noteFail(username)
    return { ok: false, status: 401, error: 'BAD_CREDENTIALS', message: '用户名或密码错误' }
  }
  clearFails(username)
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

function logout(db, token) {
  if (typeof token === 'string') {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
  }
}

/** 清理过期会话（启动时 + 周期性调用） */
function sweepSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
}

module.exports = { register, login, createSession, getUserByToken, logout, sweepSessions, hashPassword, verifyPassword }
