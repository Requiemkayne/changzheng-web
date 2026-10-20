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
const contest = require('./contest')

const WEB_ROOT = path.join(__dirname, '..')
const MAX_BODY = 64 * 1024
// 监听地址：默认 0.0.0.0（手机同局域网可访问），可用 HOST 覆盖（如 127.0.0.1 只本机）
const BIND_HOST = process.env.HOST || '0.0.0.0'

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

/* ---------- 静态资源白名单（默认拒绝：目录先判，扩展名再判） ----------
 * 站点运行只需要 index.html + css/ + js/ + fonts/；server/、scripts/、tmp/、
 * .git/、*.md、*.db 等一律不对外，命中即 404（不区分存在与否，避免探测）。
 */
const STATIC_DIRS = new Set(['css', 'js', 'fonts', 'assets'])
const STATIC_ROOT_FILES = new Set(['index.html', 'favicon.ico', 'favicon.svg'])
const STATIC_EXT = new Set([
  '.html', '.css', '.js', '.woff', '.woff2',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.json'
])

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

  // ---------- 竞赛（毕业解锁） ----------

  if (req.method === 'GET' && pathname === '/api/contest/status') {
    return json(res, 200, contest.getContestStatus(db, user.id))
  }
  if (req.method === 'POST' && pathname === '/api/contest/start') {
    const r = contest.startContest(db, user.id)
    if (!r.ok) return fail(res, 400, r.error, r.message)
    return json(res, 200, r)
  }
  if (req.method === 'POST' && pathname === '/api/contest/submit') {
    const b = await readBody(req)
    const r = contest.submitContest(db, user.id, b.contestId, b.answers, b.durationMs)
    if (!r.ok) return fail(res, 400, r.error, r.message)
    return json(res, 200, r)
  }

  return fail(res, 404, 'NOT_FOUND', '接口不存在')
}

/* ---------- 排行榜（公开：未登录可看榜，登录附我的名次） ---------- */

async function handleLeaderboard(db, req, res, pathname, query) {
  if (req.method !== 'GET' || pathname !== '/api/contest/leaderboard') return false
  const type = query.type === 'best' ? 'best' : 'total'
  const user = auth.getUserByToken(db, getToken(req))
  json(res, 200, contest.leaderboard(db, type, user ? user.id : null))
  return true
}

/* ---------- 静态文件 ---------- */

/* 开发期版本戳：index.html / css / js / 高程数据的修改时间之和。
 * 客户端（?live=1）轮询它来判断是否需要自动刷新。 */
const VERSION_PATHS = ['index.html', 'css', 'js', 'assets/map3d']
let versionCache = { v: 0, at: 0 }

function versionStamp() {
  const now = Date.now()
  if (now - versionCache.at < 400) return versionCache.v
  let sum = 0
  const walk = rel => {
    if (rel.startsWith('js/vendor')) return          // 第三方库不参与，避免误触发
    const abs = path.join(WEB_ROOT, rel)
    let st
    try { st = fs.statSync(abs) } catch (e) { return }
    if (st.isDirectory()) {
      let list = []
      try { list = fs.readdirSync(abs) } catch (e) { return }
      list.forEach(f => walk(rel + '/' + f))
    } else {
      sum += st.mtimeMs
    }
  }
  VERSION_PATHS.forEach(walk)
  versionCache = { v: Math.round(sum), at: now }
  return versionCache.v
}

/** 第一段目录/文件判定 —— 只认白名单，其余一律不放行 */
function isAllowedRelPath(rel) {
  const segs = rel.split(path.sep)
  // 任何一段是隐藏项（.git/.env…）或空段，直接拒
  for (const s of segs) {
    if (!s || s === '.' || s === '..' || s.startsWith('.')) return false
  }
  const top = segs[0].toLowerCase()
  const inStaticDir = segs.length > 1 && STATIC_DIRS.has(top)
  const isRootFile = segs.length === 1 && STATIC_ROOT_FILES.has(top)
  if (!inStaticDir && !isRootFile) return false
  // 第二道：扩展名也必须在白名单内
  return STATIC_EXT.has(path.extname(segs[segs.length - 1]).toLowerCase())
}

/** 解析静态路径：{ file } | { status: 400|403|404 } */
function resolveStatic(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch (e) {
    return { status: 400 } // 非法百分号编码（如 /%zz）
  }
  if (decoded.indexOf('\0') !== -1) return { status: 400 }
  // 防目录穿越：规范化后必须仍位于 WEB_ROOT 内（越权仍回 403，保持既有测试）
  let file = path.normalize(path.join(WEB_ROOT, decoded))
  if (!file.startsWith(WEB_ROOT + path.sep) && file !== WEB_ROOT) {
    return { status: 403 }
  }
  // 目录 → index.html（仅根目录或白名单目录能走到这里的 200）
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html')
  }
  const rel = path.relative(WEB_ROOT, file)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return { status: 404 }
  if (!isAllowedRelPath(rel)) return { status: 404 }
  return { file }
}

function serveStatic(res, pathname) {
  const r = resolveStatic(pathname)
  if (r.status === 400) return fail(res, 400, 'BAD_REQUEST', '请求路径编码非法')
  if (r.status === 403) return fail(res, 403, 'FORBIDDEN', '禁止访问')
  if (r.status === 404) return fail(res, 404, 'NOT_FOUND', '文件不存在')
  const file = r.file
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
  // 大题库导入：question-bank.json → bank_questions（幂等）
  try {
    const r = contest.importBank(db)
    console.log('题库导入: 新增 ' + r.added + ' 题 / 跳过重复 ' + r.skipped + ' 题 / 库内共 ' + r.bankCount + ' 题')
  } catch (e) {
    console.error('题库导入失败（继续启动，竞赛接口将报错）:', e.message)
  }
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
      if (u.pathname === '/__version') {
        // 供 ?live=1 的自动刷新使用：返回当前版本戳
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        })
        return res.end(JSON.stringify({ v: versionStamp() }))
      }
      if (u.pathname.startsWith('/api/')) {
        const handled = await handleLeaderboard(db, req, res, u.pathname, u.query)
        if (!handled) await handleApi(db, req, res, u.pathname, u.query)
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
    server.listen(port, BIND_HOST, () => resolve(server))
  })
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8088
  startServer(port).then(server => {
    const addr = server.address()
    const browse = (addr.address === '0.0.0.0' || addr.address === '::') ? 'localhost' : addr.address
    console.log('长征后端已启动: http://' + browse + ':' + addr.port + '（实际监听 ' + addr.address + ':' + addr.port + '）')
    console.log('局域网访问: http://<本机IP>:' + addr.port + ' （手机同一 WiFi）')
    console.log('数据库: ' + (process.env.DB_PATH || 'server/data.db'))
  }).catch(e => {
    console.error('启动失败:', e)
    process.exit(1)
  })
}

module.exports = { startServer }
