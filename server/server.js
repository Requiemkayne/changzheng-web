/**
 * 长征网页版后端入口 —— 零依赖（Node 22 内置 http/sqlite/crypto）
 *
 * 启动：node server/server.js          → http://0.0.0.0:8088（局域网手机可访问）
 * 端口：PORT 环境变量；数据库：DB_PATH 环境变量（迁移服务器时指定）
 *
 * 职责：静态文件服务（web/ 根目录）+ /api/* 账号与业务接口
 */
'use strict'

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const url = require('node:url')

const { openDb } = require('./db')
const auth = require('./auth')
const game = require('./game')

const WEB_ROOT = path.join(__dirname, '..')
const MAX_BODY = 64 * 1024

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4'
}

function json(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

function fail(res, status, error, message) {
  json(res, status, { ok: false, error, message })
}

/* ---------- 请求体 ---------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) { reject(new Error('请求体过大')); req.destroy() }
      else chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch (e) { reject(new Error('JSON 解析失败')) }
    })
    req.on('error', reject)
  })
}

/* ---------- 鉴权 ---------- */

function getToken(req) {
  const h = req.headers['authorization'] || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

/* ---------- API 路由 ---------- */

async function handleApi(db, req, res, pathname, query) {
  // 公开接口
  if (req.method === 'POST' && pathname === '/api/register') {
    const b = await readBody(req)
    const r = auth.register(db, b.username, b.password, b.nickname)
    if (!r.ok) return fail(res, r.status, r.error, r.message)
    return json(res, 200, { ok: true, token: r.token, user: { username: r.username, nickname: r.nickname } })
  }
  if (req.method === 'POST' && pathname === '/api/login') {
    const b = await readBody(req)
    const r = auth.login(db, b.username, b.password)
    if (!r.ok) return fail(res, r.status, r.error, r.message)
    return json(res, 200, { ok: true, token: r.token, user: { username: r.username, nickname: r.nickname } })
  }
  if (req.method === 'GET' && pathname === '/api/config') {
    return json(res, 200, { ok: true, config: game.getConfigDoc() })
  }
  if (req.method === 'GET' && pathname === '/api/nodes') {
    return json(res, 200, { ok: true, nodes: game.getPublishedNodes() })
  }
  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, time: Date.now() })
  }

  // 以下接口需要登录（progress 除外：未登录返回 null，游客可浏览首页）
  const user = auth.getUserByToken(db, getToken(req))

  if (req.method === 'GET' && pathname === '/api/progress') {
    if (!user) return json(res, 200, { ok: true, progress: null })
    return json(res, 200, { ok: true, progress: game.loadProgress(db, user.id) })
  }
  if (!user) return fail(res, 401, 'AUTH_REQUIRED', '请先登录')

  if (req.method === 'POST' && pathname === '/api/logout') {
    auth.logout(db, getToken(req))
    return json(res, 200, { ok: true })
  }
  if (req.method === 'GET' && pathname === '/api/me') {
    return json(res, 200, { ok: true, user: { username: user.username, nickname: user.nickname } })
  }
  if (req.method === 'GET' && pathname === '/api/checkins') {
    return json(res, 200, { ok: true, checkins: game.getCheckinLogs(db, user.id) })
  }
  if (req.method === 'POST' && pathname === '/api/profile') {
    const b = await readBody(req)
    const r = game.saveNickname(db, user.id, b.nickname)
    if (!r.ok) return fail(res, 400, r.error, r.message)
    return json(res, 200, { ok: true, nickname: r.nickname })
  }
  if (req.method === 'POST' && pathname === '/api/checkin') {
    const b = await readBody(req)
    const r = game.doCheckin(db, user.id, b.code)
    if (!r.ok) return fail(res, 400, r.error, r.message)
    return json(res, 200, r)
  }
  if (req.method === 'GET' && pathname === '/api/quiz') {
    const r = game.getQuiz(db, user.id, query.mode, query.code)
    if (!r.ok) return fail(res, 400, r.error, r.message)
    return json(res, 200, r)
  }
  if (req.method === 'POST' && pathname === '/api/quiz/submit') {
    const b = await readBody(req)
    const r = game.submitQuiz(db, user.id, b.mode, b.code, b.answers)
    if (!r.ok) return fail(res, 400, r.error, r.message)
    return json(res, 200, r)
  }

  return fail(res, 404, 'NOT_FOUND', '接口不存在')
}

/* ---------- 静态文件 ---------- */

function serveStatic(res, pathname) {
  // 防目录穿越：规范化后必须仍位于 WEB_ROOT 内
  let file = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)))
  if (!file.startsWith(WEB_ROOT + path.sep) && file !== WEB_ROOT) {
    return fail(res, 403, 'FORBIDDEN', '禁止访问')
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html')
  }
  fs.readFile(file, (err, data) => {
    if (err) return fail(res, 404, 'NOT_FOUND', '文件不存在')
    const ext = path.extname(file).toLowerCase()
    // no-cache：开发期 JS/CSS 频繁改动，防止浏览器缓存旧版本导致行为错乱
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    })
    res.end(data)
  })
}

/* ---------- 启动 ---------- */

function startServer(port) {
  const db = openDb()
  auth.sweepSessions(db)
  setInterval(() => auth.sweepSessions(db), 60 * 60 * 1000).unref()

  const server = http.createServer(async (req, res) => {
    const u = url.parse(req.url, true)
    const t0 = Date.now()
    // 访问日志（排障用）：方法 路径 状态码 耗时
    res.on('finish', () => {
      console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + u.pathname +
        ' -> ' + res.statusCode + ' ' + (Date.now() - t0) + 'ms')
    })
    try {
      if (u.pathname.startsWith('/api/')) {
        await handleApi(db, req, res, u.pathname, u.query)
      } else if (req.method === 'GET') {
        serveStatic(res, u.pathname === '/' ? '/index.html' : u.pathname)
      } else {
        fail(res, 405, 'METHOD_NOT_ALLOWED', '不支持的请求方法')
      }
    } catch (e) {
      console.error('请求处理异常:', e)
      try { fail(res, 500, 'SERVER_ERROR', '服务器内部错误') } catch (_) { /* 连接已断 */ }
    }
  })

  return new Promise(resolve => {
    server.listen(port, '0.0.0.0', () => resolve(server))
  })
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8088
  startServer(port).then(() => {
    console.log('长征后端已启动: http://localhost:' + port)
    console.log('局域网访问: http://<本机IP>:' + port + ' （手机同一 WiFi）')
    console.log('数据库: ' + (process.env.DB_PATH || 'server/data.db'))
  }).catch(e => {
    console.error('启动失败:', e)
    process.exit(1)
  })
}

module.exports = { startServer }
