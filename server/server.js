/**
 * 长征网页版后端入口 —— 零依赖（Node 22 内置 http/sqlite/crypto）
 *
 * 启动：node server/server.js          → http://0.0.0.0:8088（局域网手机可访问）
 * 端口：PORT 环境变量；数据库：DB_PATH 环境变量（迁移服务器时指定）
 * 跨域：CORS_ORIGIN=http://a,http://b（逗号分隔白名单；留空=不回 ACAO，默认关闭）
 * 限速：默认按客户端 IP 限制 /api/login 与 /api/register；开赛 /api/contest/start 另按「用户 + IP」限次
 *       （默认 5 次 / 300 秒，RATE_LIMIT_CONTEST_START 可覆盖）；RATE_LIMIT=off 整体关闭（仅供测试）
 *
 * 职责：静态文件服务（web/ 根目录）+ /api/* 账号与业务接口
 */
'use strict'

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const url = require('node:url')
const zlib = require('node:zlib')

const { openDb } = require('./db')
const auth = require('./auth')
const game = require('./game')
const contest = require('./contest')
const challenge = require('./challenge')

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
/* 嵌套白名单：主站一并托管专题页 competition-timeline（底部 tabBar「青春经管」入口），
 * 但只放它的公开页面与静态资源；其 server/（源码 + SQLite）、.draft/、.tools/ 以及
 * admin.html 后台仍一律 404 —— 单放进 STATIC_DIRS 会把这些一起暴露出去。
 */
const STATIC_NESTED = {
  'competition-timeline': {
    dirs: new Set(['css', 'js', 'fonts', 'assets', 'pub']),
    files: new Set(['index.html', 'series-1.html', 'series-2.html', 'series-3.html'])
  }
}
const STATIC_ROOT_FILES = new Set(['index.html', 'favicon.ico', 'favicon.svg'])
const STATIC_EXT = new Set([
  '.html', '.css', '.js', '.woff', '.woff2',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.json',
  '.mp4'
])

function json(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

function fail(res, status, error, message) {
  json(res, status, { ok: false, error, message })
}

/* ---------- 客户端标识 / 应用层限速 ---------- */

/* 不信任任何代理头：X-Forwarded-For 谁都能伪造，只有直连地址可信。
 * 监听 0.0.0.0 时 IPv4 连接以 ::ffff:a.b.c.d 出现，去掉映射前缀统一口径。 */
function clientIp(req) {
  const raw = (req.socket && req.socket.remoteAddress) || 'unknown'
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw
}

const RATE_OFF = /^(0|off|false|no)$/i.test(String(process.env.RATE_LIMIT || '').trim())
const RATE_WINDOW_MS = 60 * 1000
// 开赛用长窗口：一场竞赛几分钟，60 秒窗口拦不住「开一场丢一场」的刷榜
const RATE_CONTEST_WINDOW_MS = 300 * 1000
// 取值依据：scripts/test-api.js 一轮跑完共打 8 次 /api/login 与 8 次 /api/register（同一 127.0.0.1），
// 取 10 留出余量，测试不必改；确需更严/更松用 RATE_LIMIT_LOGIN / RATE_LIMIT_REGISTER 或 RATE_LIMIT=off。
// 开赛同理：scripts/test-api.js 只打 3 次 /api/contest/start（同一 IP、同一用户最多 2 次），默认 5 留余量。
const RATE_LIMITS = {
  login: { max: Number(process.env.RATE_LIMIT_LOGIN) || 10, window: RATE_WINDOW_MS },
  register: { max: Number(process.env.RATE_LIMIT_REGISTER) || 10, window: RATE_WINDOW_MS },
  // 忘记密码申请：单 IP 10 分钟最多 5 次，防刷表
  pwforgot: { max: 5, window: 10 * 60e3 },
  // 自助改密码：单 IP 10 分钟最多 10 次，防暴力试旧密码
  pwchange: { max: 10, window: 10 * 60e3 },
  // 开赛两个桶：用户桶防同账号连开，IP 桶防换号绕过；任一超限即 429
  contestStartUser: { max: Number(process.env.RATE_LIMIT_CONTEST_START) || 5, window: RATE_CONTEST_WINDOW_MS },
  contestStartIp: { max: Number(process.env.RATE_LIMIT_CONTEST_START) || 5, window: RATE_CONTEST_WINDOW_MS }
}

const rateHits = new Map()   // 'route|ip' -> [命中时间戳…]（滑动窗口）
let rateSweptAt = 0

/** 各路由窗口不同（开赛 300s、口令 60s），逐出必须用该 key 自己的窗口，否则长窗口会被短窗口提前清空 */
function windowOf(route) {
  const lim = RATE_LIMITS[route]
  return (lim && lim.window) || RATE_WINDOW_MS
}

/** 逐出窗口外的时间戳，整桶为空就删 key —— 保证 Map 不无界增长 */
function sweepRate(now) {
  for (const [key, hits] of rateHits) {
    const sep = key.indexOf('|')
    const win = windowOf(sep === -1 ? key : key.slice(0, sep))
    const keep = hits.filter(t => now - t < win)
    if (keep.length) rateHits.set(key, keep)
    else rateHits.delete(key)
  }
  rateSweptAt = now
}

/** 超限返回 true（本次请求回 429）；未超限则记一次 */
function rateLimited(route, ip) {
  const lim = RATE_LIMITS[route]
  if (RATE_OFF || !lim) return false
  const now = Date.now()
  if (now - rateSweptAt > RATE_WINDOW_MS) sweepRate(now)
  const key = route + '|' + ip
  const win = lim.window || RATE_WINDOW_MS
  const hits = (rateHits.get(key) || []).filter(t => now - t < win)
  if (hits.length >= lim.max) {
    rateHits.set(key, hits)
    return true
  }
  hits.push(now)
  rateHits.set(key, hits)
  return false
}

/* ---------- CORS（默认关闭：CORS_ORIGIN 为空时不回任何 ACAO 头） ---------- */

const CORS_ORIGINS = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(s => s && s !== '*')   // 禁止 *：凭据走 Authorization 头，* 等于把接口开放给任意站点

/** 命中白名单返回要回的头；否则 null（与改造前完全一致，一个头都不加） */
function corsHeadersFor(req) {
  if (!CORS_ORIGINS.length) return null
  const origin = req.headers.origin
  if (!origin || CORS_ORIGINS.indexOf(origin) === -1) return null
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  }
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

/* ---------- 留言服务反代 ----------
 * 专题页 competition-timeline 由本服务在 /competition-timeline/ 下托管，但它的留言前端
 * 请求的是同源相对路径 /api/comments（competition-timeline/js/comments.js:36-38）。
 * 留言服务是另一个进程（competition-timeline/server/server.js，默认 8899）：不转发，
 * 线上留言读写就会落到本服务的 401 兜底；本地两个服务各占一个端口时才「碰巧」正常。
 * 只转发公开留言接口，/api/admin/* 不转发——与「后台不对外」（admin.html 同样 404）一致。
 */
const COMMENTS_UPSTREAM = new URL(process.env.COMMENTS_UPSTREAM || 'http://127.0.0.1:8899')
const UPSTREAM_HOST = COMMENTS_UPSTREAM.hostname
const UPSTREAM_PORT = Number(COMMENTS_UPSTREAM.port) || 80

function isCommentsApi(pathname) {
  return pathname === '/api/comments' || pathname.startsWith('/api/comments/')
}

// 流式透传：后端已自带 CORS，这里只搬运方法/路径/body 与必要的响应头（含 Set-Cookie）
function proxyComments(req, res, u) {
  const headers = {}
  for (const k of ['content-type', 'content-length', 'accept', 'cookie', 'user-agent']) {
    if (req.headers[k]) headers[k] = req.headers[k]
  }
  const ip = clientIp(req)
  if (ip) headers['x-forwarded-for'] = ip
  const upstream = http.request({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: u.pathname + (u.search || ''),
    headers,
    timeout: 5000
  }, up => {
    const out = { 'Content-Type': up.headers['content-type'] || 'application/json; charset=utf-8' }
    if (up.headers['set-cookie']) out['Set-Cookie'] = up.headers['set-cookie']
    res.writeHead(up.statusCode || 502, out)
    up.pipe(res)
  })
  upstream.on('timeout', () => upstream.destroy(new Error('留言服务响应超时')))
  upstream.on('error', e => {
    console.error('留言服务反代失败:', e.message)
    if (res.headersSent) return res.end()
    // 给前端一个可诊断的 JSON，避免留言框一直转圈
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, code: 'COMMENTS_UNAVAILABLE', message: '留言服务暂时不可用' }))
  })
  req.pipe(upstream)
}

/* ---------- 鉴权 ---------- */

function getToken(req) {
  const h = req.headers['authorization'] || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

/* ---------- API 路由 ---------- */

async function handleApi(db, req, res, pathname, query) {
  // 口令入口限速：按客户端 IP + 路由做滑动窗口，超限直接 429
  if (req.method === 'POST' && (pathname === '/api/register' || pathname === '/api/login')) {
    const route = pathname === '/api/register' ? 'register' : 'login'
    if (rateLimited(route, clientIp(req))) {
      return fail(res, 429, 'TOO_MANY_REQUESTS', '请求过于频繁，请稍后再试')
    }
  }
  // 公开接口
  if (req.method === 'POST' && pathname === '/api/register') {
    const b = await readBody(req)
    const r = await auth.register(db, b.username, b.password, b.nickname)
    if (!r.ok) return fail(res, r.status, r.error, r.message)
    return json(res, 200, { ok: true, token: r.token, user: { username: r.username, nickname: r.nickname } })
  }
  if (req.method === 'POST' && pathname === '/api/login') {
    const b = await readBody(req)
    const r = await auth.login(db, b.username, b.password, clientIp(req))
    if (!r.ok) return fail(res, r.status, r.error, r.message)
    return json(res, 200, { ok: true, token: r.token, user: { username: r.username, nickname: r.nickname } })
  }
  /* ---------- 忘记密码：学生提交申请 ---------- */
  if (req.method === 'POST' && pathname === '/api/password/forgot') {
    // 同一个 IP 10 分钟内最多提交 5 次，避免刷爆申请表
    if (rateLimited('pwforgot', clientIp(req))) {
      return fail(res, 429, 'TOO_MANY_REQUESTS', '提交过于频繁，请稍后再试')
    }
    const b = await readBody(req)
    const username = String(b.username || '').trim()
    if (!/^\d{8}$/.test(username)) {
      return fail(res, 400, 'INVALID_USERNAME', '账号必须是 8 位数字学号')
    }
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (!exists) {
      // 不暴露账号是否存在，统一返回成功（防枚举）
      return json(res, 200, { ok: true, message: '已提交，请等待老师处理' })
    }
    // 同一账号已有待处理申请就不重复插
    const dup = db.prepare("SELECT id FROM password_requests WHERE username = ? AND status = 'pending'").get(username)
    if (dup) {
      return json(res, 200, { ok: true, message: '已有待处理申请，请等待老师处理' })
    }
    const note = String(b.note || '').slice(0, 200)
    db.prepare('INSERT INTO password_requests (username, note, status, created_at) VALUES (?, ?, ?, ?)')
      .run(username, note, 'pending', Date.now())
    return json(res, 200, { ok: true, message: '已提交，请等待老师处理' })
  }

  /* ---------- 管理员接口（x-admin-key 鉴权） ---------- */
  const ADMIN_KEY = String(process.env.ADMIN_KEY || '')
  const requireAdmin = () => {
    if (!ADMIN_KEY) return { ok: false, code: 403, error: 'ADMIN_DISABLED', message: '管理员接口未启用（未配置 ADMIN_KEY）' }
    const got = String(req.headers['x-admin-key'] || '')
    if (!got || got !== ADMIN_KEY) return { ok: false, code: 401, error: 'ADMIN_UNAUTHORIZED', message: '管理员口令错误' }
    return { ok: true }
  }

  // 查看忘记密码申请
  if (req.method === 'GET' && pathname === '/api/admin/password-requests') {
    const g = requireAdmin()
    if (!g.ok) return fail(res, g.code, g.error, g.message)
    const u = new URL(req.url, 'http://x')
    const status = u.searchParams.get('status') || 'pending'
    const rows = db.prepare(
      'SELECT id, username, note, status, created_at, resolved_at, resolved_by FROM password_requests WHERE status = ? ORDER BY created_at DESC LIMIT 200'
    ).all(status)
    return json(res, 200, { ok: true, items: rows })
  }

  // 批准 / 拒绝某条申请
  if (req.method === 'POST' && /^\/api\/admin\/password-requests\/\d+\/resolve$/.test(pathname)) {
    const g = requireAdmin()
    if (!g.ok) return fail(res, g.code, g.error, g.message)
    const id = Number(pathname.split('/')[4])
    const b = await readBody(req)
    const action = b.action === 'reject' ? 'reject' : 'approve'
    const row = db.prepare('SELECT * FROM password_requests WHERE id = ?').get(id)
    if (!row) return fail(res, 404, 'REQUEST_NOT_FOUND', '申请不存在')
    if (row.status !== 'pending') return fail(res, 409, 'ALREADY_RESOLVED', '该申请已处理')

    if (action === 'approve') {
      const r = await auth.resetPassword(db, row.username, String(b.password || '111111'))
      if (!r.ok) return fail(res, r.status, r.error, r.message)
    }
    db.prepare('UPDATE password_requests SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?')
      .run(action === 'approve' ? 'approved' : 'rejected', Date.now(), String(b.by || 'admin'), id)
    return json(res, 200, { ok: true, action, username: row.username, password: action === 'approve' ? String(b.password || '111111') : '' })
  }

  // 批量导入学生账号（8 位学号 + 统一初始密码）
  if (req.method === 'POST' && pathname === '/api/admin/users/bulk') {
    const g = requireAdmin()
    if (!g.ok) return fail(res, g.code, g.error, g.message)
    const b = await readBody(req)
    const list = Array.isArray(b.usernames) ? b.usernames : []
    if (!list.length) return fail(res, 400, 'EMPTY_LIST', '没有要导入的账号')
    if (list.length > 2000) return fail(res, 400, 'TOO_MANY', '单次最多 2000 个')
    const password = String(b.password || '111111')
    const r = await auth.bulkCreateUsers(db, list, password, String(b.nicknamePrefix || ''))
    return json(res, 200, { ok: true, created: r.created.length, skipped: r.skipped.length, invalid: r.invalid, password })
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
  // 答题挑战总分榜（公开：未登录可看榜，登录附我的名次）
  if (req.method === 'GET' && pathname === '/api/challenge/leaderboard') {
    const viewer = auth.getUserByToken(db, getToken(req))
    return json(res, 200, challenge.challengeLeaderboard(db, viewer ? viewer.id : null))
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
  // 学生自助改密码（需登录）：先验旧密码，成功后可继续用当前会话
  if (req.method === 'POST' && pathname === '/api/password/change') {
    if (rateLimited('pwchange', clientIp(req))) {
      return fail(res, 429, 'TOO_MANY_REQUESTS', '请求过于频繁，请稍后再试')
    }
    const b = await readBody(req)
    const r = await auth.changePassword(db, user.id, b.oldPassword, b.newPassword, getToken(req))
    if (!r.ok) return fail(res, r.status, r.error, r.message)
    return json(res, 200, { ok: true })
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
  if (req.method === 'POST' && pathname === '/api/graduate') {
    // 毕业判定：按 11 个节点答题平均分，达标才写 passed
    const r = game.graduate(db, user.id)
    return json(res, r.ok ? 200 : 400, r)
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
    // 排行榜按 SUM(score) 累计，不限次数等于允许刷榜：用户桶 + IP 桶都记（不短路，两个桶都消耗配额）
    const overUser = rateLimited('contestStartUser', 'u:' + user.id)
    const overIp = rateLimited('contestStartIp', clientIp(req))
    if (overUser || overIp) {
      return fail(res, 429, 'TOO_MANY_REQUESTS', '开赛过于频繁，请稍后再试')
    }
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
  // 第二道：扩展名也必须在白名单内
  if (!STATIC_EXT.has(path.extname(segs[segs.length - 1]).toLowerCase())) return false
  const top = segs[0].toLowerCase()
  const nested = STATIC_NESTED[top]
  if (nested) {
    // 目录内的文件按「第二段」判：目录进 dirs（可再深一层），根层页面进 files
    return segs.length === 2 ? nested.files.has(segs[1].toLowerCase()) : nested.dirs.has(segs[1].toLowerCase())
  }
  const inStaticDir = segs.length > 1 && STATIC_DIRS.has(top)
  const isRootFile = segs.length === 1 && STATIC_ROOT_FILES.has(top)
  return inStaticDir || isRootFile
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

/* ---------- 静态资源：条件请求（ETag / Last-Modified / 304）+ gzip ---------- */

const NO_CACHE = 'no-cache'                                 // 文本类：可重新验证，靠 ETag 拿 304
const IMMUTABLE = 'public, max-age=31536000, immutable'     // 文件名自带内容哈希：内容改不动
const SHORT_CACHE = 'public, max-age=86400'                 // 无哈希的大资源：只给 1 天，靠 ETag 兜底

// 只压文本类：woff2 / png / jpg / ico / webp 本身已压缩，再 gzip 只会变大（实测对比见交付报告）
const COMPRESSIBLE_EXT = new Set(['.html', '.css', '.js', '.json', '.svg'])
const GZIP_MIN_BYTES = 1024
const GZIP_CACHE_MAX_BYTES = 32 * 1024 * 1024

const gzipCache = new Map()     // 'file|mtimeMs|size' -> Buffer（插入序即淘汰序）
const gzipInflight = new Map()  // 同一份内容首次压缩的并发请求合并成一次，别 20 个请求烧 20 次 CPU
let gzipCacheBytes = 0

function gzipCacheGet(key) {
  const hit = gzipCache.get(key)
  if (!hit) return null
  gzipCache.delete(key)       // 命中即挪到队尾（LRU）
  gzipCache.set(key, hit)
  return hit
}

function gzipCachePut(key, buf) {
  if (buf.length > GZIP_CACHE_MAX_BYTES) return
  const old = gzipCache.get(key)
  if (old) gzipCacheBytes -= old.length
  gzipCache.set(key, buf)
  gzipCacheBytes += buf.length
  while (gzipCacheBytes > GZIP_CACHE_MAX_BYTES) {
    const first = gzipCache.keys().next()
    if (first.done) break
    gzipCacheBytes -= gzipCache.get(first.value).length
    gzipCache.delete(first.value)
  }
}

/** 压缩并缓存：同一文件同一 mtime/size 只压一次 */
function gzipFor(key, data) {
  const cached = gzipCacheGet(key)
  if (cached) return Promise.resolve(cached)
  const running = gzipInflight.get(key)
  if (running) return running
  const p = new Promise((resolve, reject) => {
    zlib.gzip(data, (err, buf) => (err ? reject(err) : resolve(buf)))
  }).then(buf => {
    gzipInflight.delete(key)
    gzipCachePut(key, buf)
    return buf
  }, err => {
    gzipInflight.delete(key)
    throw err
  })
  gzipInflight.set(key, p)
  return p
}

/** Accept-Encoding 是否允许 gzip：显式 gzip;q=0 一律否决；没有 gzip 条目才看 * */
function acceptsGzip(header) {
  if (!header) return false
  let wildcard = -1
  for (const part of String(header).split(',')) {
    const fields = part.split(';')
    const name = fields[0].trim().toLowerCase()
    if (!name) continue
    let q = 1
    for (let i = 1; i < fields.length; i++) {
      const kv = fields[i].split('=')
      if (kv.length === 2 && kv[0].trim().toLowerCase() === 'q') {
        const v = Number(kv[1].trim())
        if (Number.isFinite(v)) q = v
      }
    }
    if (name === 'gzip' || name === 'x-gzip') return q > 0
    if (name === '*') wildcard = q
  }
  return wildcard > 0
}

/** 强校验：size + mtimeMs（同一份字节、同一时间戳 ⇒ 同一份内容） */
function etagOf(st) {
  return '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"'
}

/** If-None-Match 命中：逗号分隔列表 / * / 容忍 W- 前缀与裸值 */
function etagMatches(header, etag) {
  if (!header) return false
  const bare = etag.slice(1, -1)
  for (const raw of String(header).split(',')) {
    let s = raw.trim()
    if (s === '*') return true
    if (s.slice(0, 2).toUpperCase() === 'W/') s = s.slice(2).trim()
    if (s.length > 1 && s[0] === '"' && s[s.length - 1] === '"') s = s.slice(1, -1)
    if (s === bare) return true
  }
  return false
}

/** If-Modified-Since 命中（mtime 截到秒再比，避免毫秒导致永不命中） */
function notModifiedSince(header, mtimeMs) {
  if (!header) return false
  const since = Date.parse(header)
  if (!Number.isFinite(since)) return false
  return Math.floor(mtimeMs / 1000) * 1000 <= since
}

/** 追加 Vary：CORS 可能已经设过 Vary: Origin，绝不能覆盖 */
function addVary(res, value) {
  const cur = res.getHeader('Vary')
  if (cur === undefined) {
    res.setHeader('Vary', value)
    return
  }
  const list = String(cur).split(',').map(s => s.trim().toLowerCase())
  if (list.indexOf('*') !== -1 || list.indexOf(value.toLowerCase()) !== -1) return
  res.setHeader('Vary', String(cur) + ', ' + value)
}

/** 文件名里带 8 位以上十六进制内容哈希才敢给 immutable */
function hasContentHash(file) {
  return /[0-9a-f]{8,}/i.test(path.basename(file, path.extname(file)))
}

/** 缓存策略分层（文本类保持 no-cache，向后兼容） */
function cacheControlFor(file) {
  const rel = path.relative(WEB_ROOT, file).split(path.sep).join('/')
  const ext = path.extname(file).toLowerCase()
  // 字体：Google Fonts 的子集文件名就是内容哈希，改内容必然换名 → 可永久缓存
  if (rel.indexOf('fonts/') === 0 && (ext === '.woff2' || ext === '.woff')) return IMMUTABLE
  // 3D 大资源：文件名带哈希的永久缓存；heightmap.json / heightmap.png / three.min.js 这类只给 1 天
  if (rel.indexOf('assets/') === 0) return hasContentHash(file) ? IMMUTABLE : SHORT_CACHE
  // 其余（html/css/js/json）：开发期改动频繁，保持 no-cache，靠 ETag 拿 304
  return NO_CACHE
}

/** 发 200 正文：Content-Length 必须等于真实发出的字节数（gzip 时是压缩后长度） */
function sendBody(res, buf, gzipped, ext) {
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
  if (gzipped) res.setHeader('Content-Encoding', 'gzip')
  res.setHeader('Content-Length', String(buf.length))
  res.writeHead(200)
  res.end(buf)
}

function serveStatic(req, res, pathname) {
  const r = resolveStatic(pathname)
  if (r.status === 400) return fail(res, 400, 'BAD_REQUEST', '请求路径编码非法')
  if (r.status === 403) return fail(res, 403, 'FORBIDDEN', '禁止访问')
  if (r.status === 404) return fail(res, 404, 'NOT_FOUND', '文件不存在')
  const file = r.file
  const ext = path.extname(file).toLowerCase()
  fs.stat(file, (statErr, st) => {
    if (statErr || !st.isFile()) return fail(res, 404, 'NOT_FOUND', '文件不存在')
    const etag = etagOf(st)
    const compressible = COMPRESSIBLE_EXT.has(ext)
    // Vary 无条件发：同一个 URL 的响应体随 Accept-Encoding 变化
    if (compressible) addVary(res, 'Accept-Encoding')
    res.setHeader('ETag', etag)
    res.setHeader('Last-Modified', new Date(Math.floor(st.mtimeMs / 1000) * 1000).toUTCString())
    res.setHeader('Cache-Control', cacheControlFor(file))
    // 条件请求：带 If-None-Match 就以它为准，没有才看 If-Modified-Since（RFC 9110 §13.1.3）
    const inm = req.headers['if-none-match']
    const hit = inm ? etagMatches(inm, etag) : notModifiedSince(req.headers['if-modified-since'], st.mtimeMs)
    if (hit) {
      res.writeHead(304)
      return res.end()   // 304 无响应体，也不发 Content-Length
    }
    const useGzip = compressible && st.size >= GZIP_MIN_BYTES && acceptsGzip(req.headers['accept-encoding'])

    // 视频按字节范围响应：iOS Safari 必须拿到 206 才肯播放，拖进度条也依赖它
    if (ext === '.mp4') {
      res.setHeader('Accept-Ranges', 'bytes')
      const range = req.headers.range
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim())
        if (m && (m[1] || m[2])) {
          let start
          let end
          if (!m[1]) {
            // bytes=-N：最后 N 字节
            const tail = parseInt(m[2], 10)
            start = Math.max(0, st.size - tail)
            end = st.size - 1
          } else {
            start = parseInt(m[1], 10)
            end = m[2] ? Math.min(parseInt(m[2], 10), st.size - 1) : st.size - 1
          }
          if (start >= st.size || start > end) {
            res.setHeader('Content-Range', 'bytes */' + st.size)
            res.writeHead(416, { 'Content-Type': 'application/json; charset=utf-8' })
            return res.end(JSON.stringify({ ok: false, code: 'RANGE_NOT_SATISFIABLE', message: '请求范围超出文件大小' }))
          }
          res.setHeader('Content-Type', MIME[ext] || 'video/mp4')
          res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + st.size)
          res.setHeader('Content-Length', String(end - start + 1))
          res.writeHead(206)
          const stream = fs.createReadStream(file, { start, end })
          stream.on('error', () => res.destroy())
          return stream.pipe(res)
        }
      }
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.removeHeader('ETag')
        res.removeHeader('Last-Modified')
        res.removeHeader('Cache-Control')
        return fail(res, 404, 'NOT_FOUND', '文件不存在')
      }
      if (!useGzip) return sendBody(res, data, false, ext)
      const key = file + '|' + Math.round(st.mtimeMs) + '|' + st.size
      gzipFor(key, data).then(buf => sendBody(res, buf, true, ext),
        () => sendBody(res, data, false, ext))
    })
  })
}

/* ---------- 启动 ---------- */

/* ---------- 优雅关闭（SIGTERM / SIGINT） ---------- */

let shuttingDown = false

function installShutdown(server, db, timer) {
  const shutdown = signal => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('收到 ' + signal + '，开始优雅关闭…')
    // 兜底：5 秒还没关完就强制走，避免卡在残留连接上
    const force = setTimeout(() => {
      console.log('优雅关闭超时（5s），强制退出')
      process.exit(0)
    }, 5000)
    force.unref()
    if (timer) clearInterval(timer)
    server.close(() => {
      try {
        if (db && typeof db.close === 'function') db.close()
      } catch (e) {
        console.error('关闭数据库失败:', e.message)
      }
      clearTimeout(force)
      console.log('已优雅退出')
      process.exit(0)
    })
    // 断掉空闲 keep-alive 连接，否则 server.close 会一直等它们
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

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
  // 顺手兜底清理失败计数（auth 内部另有惰性过期 + 自节流 sweep）
  const sweepTimer = setInterval(() => {
    auth.sweepSessions(db)
    auth.sweepFails()
  }, 60 * 60 * 1000)
  sweepTimer.unref()

  const server = http.createServer(async (req, res) => {
    const u = url.parse(req.url, true)
    const t0 = Date.now()
    // 访问日志（排障用）：方法 路径 状态码 耗时
    res.on('finish', () => {
      console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + u.pathname +
        ' -> ' + res.statusCode + ' ' + (Date.now() - t0) + 'ms')
    })
    const cors = corsHeadersFor(req)
    if (cors) {
      for (const k of Object.keys(cors)) res.setHeader(k, cors[k])
      // 预检：命中白名单回 204 + 上述头；未命中保持既有语义（继续往下走）
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        return res.end()
      }
    }
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
        if (isCommentsApi(u.pathname)) return proxyComments(req, res, u)
        const handled = await handleLeaderboard(db, req, res, u.pathname, u.query)
        if (!handled) await handleApi(db, req, res, u.pathname, u.query)
      } else if (req.method === 'GET') {
        serveStatic(req, res, u.pathname === '/' ? '/index.html' : u.pathname)
      } else {
        fail(res, 405, 'METHOD_NOT_ALLOWED', '不支持的请求方法')
      }
    } catch (e) {
      console.error('请求处理异常:', e)
      try { fail(res, 500, 'SERVER_ERROR', '服务器内部错误') } catch (_) { /* 连接已断 */ }
    }
  })

  installShutdown(server, db, sweepTimer)

  return new Promise((resolve, reject) => {
    const onError = e => reject(e)
    server.once('error', onError)
    server.listen(port, BIND_HOST, () => {
      server.removeListener('error', onError)
      resolve(server)
    })
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
    if (e && e.code === 'EADDRINUSE') {
      console.error('启动失败：端口 ' + port + ' 已被占用（EADDRINUSE）')
      console.error('  · 可能已有一个长征后端在跑；换个端口：PORT=' + (port === 8088 ? 8089 : port + 1) + ' node server/server.js')
      console.error('  · 或腾出该端口：netstat -ano | findstr :' + port + ' 查 PID，再 taskkill /PID <pid> /F')
      return process.exit(1)
    }
    console.error('启动失败:', (e && e.message) || e)
    process.exit(1)
  })
}

module.exports = { startServer }
