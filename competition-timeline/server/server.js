/* ============================================================
   留言服务 + 管理后台 —— 零依赖（Node 内置 http / node:sqlite / crypto）
   启动：node server/server.js     默认 http://127.0.0.1:8899
   环境变量：PORT（默认 8899）、DB_PATH（默认 server/data.db）、ADMIN_PASSWORD（初始密码）

   公开接口（?page= 见 PAGES 白名单，缺省 series-1）：
     GET    /api/comments?page=    只返回该篇「已通过」的留言
     POST   /api/comments          发表留言（进入待审核），body.page 决定归属篇
     GET    /api/health            健康检查
   管理接口（登录后，HttpOnly Cookie 会话）：
     POST   /api/admin/login       登录
     POST   /api/admin/logout      退出
     GET    /api/admin/me          当前身份
     GET    /api/admin/comments    留言列表（可按 status / page 过滤）
     POST   /api/admin/audit       审核：{ ids:[], action:'approve'|'reject' }
     DELETE /api/admin/comments/:id 删除单条
     POST   /api/admin/clear       清空（scope: all|pending|approved|rejected）
     GET    /api/admin/users       管理员列表
     POST   /api/admin/users       新增管理员
     DELETE /api/admin/users/:id   删除管理员
     POST   /api/admin/password    修改自己的密码
   ============================================================ */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8899);
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'data.db');

// 留言归属篇目白名单：缺省 series-1，非法值一律 400 BAD_PAGE
const PAGES = ['series-1', 'series-2', 'series-3'];
const DEFAULT_PAGE = 'series-1';

// 主站账号库（users / password_requests）：后台在这里审核「忘记密码」申请。
// 与留言库分开存放，用 MAIN_DB_PATH 覆盖，缺省是仓库根 server/data.db。
const MAIN_DB_PATH = process.env.MAIN_DB_PATH
  ? path.resolve(process.env.MAIN_DB_PATH)
  : path.resolve(ROOT, '..', 'server', 'data.db');

let mainDb = null;
try {
  if (fs.existsSync(MAIN_DB_PATH)) {
    mainDb = new DatabaseSync(MAIN_DB_PATH);
    mainDb.exec('PRAGMA journal_mode = WAL');
  } else {
    console.warn('[pw] 主站账号库不存在，密码审核不可用：' + MAIN_DB_PATH);
  }
} catch (e) {
  console.warn('[pw] 主站账号库打开失败：' + e.message);
}

// 与主站 server/auth.js 必须完全一致，否则重置出来的密码登不上
const MAIN_SCRYPT = { N: 16384, r: 8, p: 1 };
const MAIN_KEY_LEN = 32;
function mainHashPassword(password, saltHex) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), MAIN_KEY_LEN, MAIN_SCRYPT, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

const MAX_NAME = 16;
const MAX_TEXT = 200;
const MAX_TOTAL = 5000;
const RATE_WINDOW = 10 * 60e3;
const RATE_LIMIT = 20;        // 单 IP 10 分钟最多发表 20 条
const LOGIN_LIMIT = 5;        // 单 IP 10 分钟最多失败 5 次
const SESSION_TTL = 8 * 3600e3;
const COOKIE = 'tl_admin';

/* ---------------- 数据库 ---------------- */

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    text       TEXT NOT NULL,
    ip         TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    username   TEXT NOT NULL UNIQUE,
    pass_hash  TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'admin',
    created_at INTEGER NOT NULL,
    disabled   INTEGER NOT NULL DEFAULT 0
  );
`);

// 旧库补列（status / audited_at / audited_by）
(function migrate() {
  const cols = db.prepare('PRAGMA table_info(comments)').all().map((c) => c.name);
  if (!cols.includes('status')) {
    // 旧数据此前无审核概念，默认视为已通过
    db.exec("ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  }
  if (!cols.includes('audited_at')) db.exec('ALTER TABLE comments ADD COLUMN audited_at INTEGER');
  if (!cols.includes('audited_by')) db.exec('ALTER TABLE comments ADD COLUMN audited_by TEXT');
  // 归属令牌哈希：本人删除自己留言的凭证
  if (!cols.includes('owner_hash')) db.exec('ALTER TABLE comments ADD COLUMN owner_hash TEXT');
  // 置顶（优秀留言）
  if (!cols.includes('pinned')) db.exec('ALTER TABLE comments ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('pinned_at')) db.exec('ALTER TABLE comments ADD COLUMN pinned_at INTEGER');
  // 归属篇目：此前只有首页，老数据统一落到 series-1（值同 DEFAULT_PAGE）
  if (!cols.includes('page')) {
    db.exec("ALTER TABLE comments ADD COLUMN page TEXT NOT NULL DEFAULT 'series-1'");
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page, status, created_at DESC)');
})();

/* ---------------- 预编译语句 ---------------- */

const qPublicList = db.prepare(
  "SELECT id, name, text, created_at, pinned FROM comments WHERE status = 'approved' AND page = ? " +
  'ORDER BY pinned DESC, pinned_at DESC, created_at DESC LIMIT 200'
);
// 后台列表：status / page 各可取 'all'，一条预编译语句覆盖四种组合（不做 SQL 拼接）
const qAdminList = db.prepare(
  'SELECT id, name, text, ip, created_at, status, audited_at, audited_by, pinned, pinned_at, page FROM comments ' +
  "WHERE (? = 'all' OR status = ?) AND (? = 'all' OR page = ?) " +
  'ORDER BY pinned DESC, created_at DESC LIMIT 1000'
);
const qCount = db.prepare('SELECT COUNT(*) AS n FROM comments');
const qCountStatus = db.prepare('SELECT COUNT(*) AS n FROM comments WHERE status = ?');
const qCountOfPage = db.prepare("SELECT COUNT(*) AS n FROM comments WHERE (? = 'all' OR page = ?)");
const qCountStatusOfPage = db.prepare(
  "SELECT COUNT(*) AS n FROM comments WHERE status = ? AND (? = 'all' OR page = ?)"
);
const qOne = db.prepare('SELECT id, status, owner_hash FROM comments WHERE id = ?');
const qInsert = db.prepare(
  'INSERT INTO comments (id, name, text, ip, created_at, status, owner_hash, page) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const qAudit = db.prepare('UPDATE comments SET status = ?, audited_at = ?, audited_by = ? WHERE id = ?');
const qPin = db.prepare('UPDATE comments SET pinned = ?, pinned_at = ? WHERE id = ?');
const qDelete = db.prepare('DELETE FROM comments WHERE id = ?');
const qDeleteByStatus = db.prepare('DELETE FROM comments WHERE status = ?');

const qUserByName = db.prepare('SELECT * FROM users WHERE username = ?');
const qUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const qUserList = db.prepare('SELECT id, username, role, created_at, disabled FROM users ORDER BY created_at ASC');
const qUserCount = db.prepare('SELECT COUNT(*) AS n FROM users');
const qUserInsert = db.prepare(
  'INSERT INTO users (id, username, pass_hash, role, created_at, disabled) VALUES (?, ?, ?, ?, ?, 0)'
);
const qUserDelete = db.prepare('DELETE FROM users WHERE id = ?');
const qUserPass = db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?');

/* ---------------- 工具 ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
};

function send(res, status, body, headers) {
  const h = Object.assign(
    {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Content-Type-Options': 'nosniff',
    },
    headers || {}
  );
  res.writeHead(status, h);
  res.end(body);
}

function sendJson(res, status, obj, headers) {
  send(res, status, JSON.stringify(obj), Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    headers || {}
  ));
}

function cleanName(v) {
  let s = typeof v === 'string' ? v : '';
  s = s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
  return s || '匿名';
}

function cleanText(v) {
  let s = typeof v === 'string' ? v : '';
  s = s.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  return s.trim();
}

// 篇目解析：缺省 / 空 → series-1；不在白名单 → null（调用方回 400 BAD_PAGE）
function pickPage(v) {
  if (v === undefined || v === null || v === '') return DEFAULT_PAGE;
  const s = String(v);
  return PAGES.indexOf(s) >= 0 ? s : null;
}

// 后台筛选用的篇目解析：空 / 'all' → 'all'（全部篇目，本身就是合法筛选值）；其余走白名单
function pickPageFilter(v) {
  if (v === undefined || v === null || v === '') return 'all';
  const s = String(v);
  if (s === 'all') return 'all';
  return pickPage(s);
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function readBody(req, limit) {
  limit = limit || 16 * 1024;
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('BAD_JSON')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

/* ---------------- 密码 / 会话 ---------------- */

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

function verifyPassword(pw, stored) {  try {
    const parts = String(stored).split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expect = Buffer.from(parts[2], 'hex');
    const got = crypto.scryptSync(pw, salt, expect.length);
    return crypto.timingSafeEqual(expect, got);
  } catch (e) {
    return false;
  }
}

const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    uid: user.id, username: user.username, role: user.role,
    exp: Date.now() + SESSION_TTL,
  });
  return token;
}

function getSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(token); return null; }
  return Object.assign({ token }, s);
}

function cookieHeader(token) {
  return COOKIE + '=' + token + '; HttpOnly; Path=/; SameSite=Strict; Max-Age=' + Math.floor(SESSION_TTL / 1000);
}

function clearCookieHeader() {
  return COOKIE + '=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0';
}

/* ---------------- 限流 ---------------- */

const postHits = new Map();
const loginFails = new Map();
const deleteHits = new Map();

function rateLimited(map, ip, limit) {
  const now = Date.now();
  const arr = (map.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (arr.length >= limit) { map.set(ip, arr); return true; }
  arr.push(now);
  map.set(ip, arr);
  if (map.size > 5000) map.clear();
  return false;
}

/* ---------------- 初始管理员 ---------------- */

(function bootstrapAdmin() {
  if (qUserCount.get().n > 0) return;

  const envPw = process.env.ADMIN_PASSWORD;
  const pw = envPw || crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  const id = 'u' + crypto.randomBytes(6).toString('hex');
  qUserInsert.run(id, 'admin', hashPassword(pw), 'owner', Date.now());

  const note = [
    '初始管理员账号（仅首次启动生成）',
    '==============================',
    '用户名: admin',
    '密  码: ' + pw,
    '',
    '登录地址: http://127.0.0.1:' + PORT + '/admin',
    '',
    '登录后请立即修改密码，然后删除本文件。',
  ].join('\r\n');

  try { fs.writeFileSync(path.join(__dirname, '初始管理员.txt'), note, 'utf8'); } catch (e) { /* 忽略 */ }

  console.log('');
  console.log('--------------------------------------------------');
  console.log('  已创建初始管理员');
  console.log('  用户名: admin');
  console.log('  密  码: ' + pw);
  console.log('  登录:   http://127.0.0.1:' + PORT + '/admin');
  console.log('  明文已写入 server/初始管理员.txt（登录后请删除）');
  console.log('--------------------------------------------------');
  console.log('');
})();

/* ---------------- 静态文件 ---------------- */

async function serveFile(req, res, filePath) {
  let stat;
  try { stat = await fsp.stat(filePath); } catch (e) {
    return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  const ext = path.extname(filePath).toLowerCase();
  const base = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=600',
    'X-Content-Type-Options': 'nosniff',
  };
  // 视频必须支持 Range：iOS Safari 拿不到 206 不播，拖进度条也依赖它
  if (ext === '.mp4') {
    base['Accept-Ranges'] = 'bytes';
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      if (m && (m[1] || m[2])) {
        let start;
        let end;
        if (!m[1]) {
          const tail = parseInt(m[2], 10);
          start = Math.max(0, stat.size - tail);
          end = stat.size - 1;
        } else {
          start = parseInt(m[1], 10);
          end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
        }
        if (start >= stat.size || start > end) {
          res.writeHead(416, Object.assign({ 'Content-Range': 'bytes */' + stat.size }, TEXT_PLAIN));
          return res.end(JSON.stringify({ ok: false, error: 'RANGE_NOT_SATISFIABLE' }));
        }
        res.writeHead(206, Object.assign({}, base, {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
          'Content-Length': String(end - start + 1),
        }));
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
    }
  }
  res.writeHead(200, Object.assign({}, base, { 'Content-Length': stat.size }));
  fs.createReadStream(filePath).pipe(res);
}

const TEXT_PLAIN = { 'Content-Type': 'text/plain; charset=utf-8' };

// 静态资源白名单：只放行站点自身资源，仓库其余文件一律当作「不存在」
const STATIC_DIRS = ['css', 'js', 'fonts', 'assets', 'pub'];   // 允许的子目录
const STATIC_EXT = ['.html', '.css', '.js', '.woff2', '.woff', '.ttf', '.otf',
  '.jpg', '.jpeg', '.png', '.svg', '.ico', '.webp',
  '.mp4'];                                                      // .mp4：赛项现场影像
// *.md / *.py / *.bat / *.db / *.db-wal / *.db-shm 等不在表内，天然被拒

// 把 URL 路径解析成「经过白名单校验的路径段」；不合法一律返回 null（调用方给 404）
function resolveStatic(urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath.split('?')[0]); } catch (e) { return null; }
  rel = rel.replace(/\\/g, '/');                       // 反斜杠按分隔符处理，避免绕过
  if (rel.indexOf('\0') >= 0) return null;
  const segs = rel.split('/').filter((s) => s !== '');
  for (const s of segs) {
    if (s === '..' || s.charAt(0) === '.') return null;  // 路径穿越 / 隐藏目录（.draft/.tools/.git）
  }
  if (!segs.length) return ['index.html'];               // 根 → 首页
  if (segs.length > 1 && STATIC_DIRS.indexOf(segs[0]) < 0) return null;
  const ext = path.extname(segs[segs.length - 1]).toLowerCase();
  return STATIC_EXT.indexOf(ext) >= 0 ? segs : null;     // 根目录只放行 *.html / favicon.*
}

async function serveStatic(req, res, urlPath) {
  let rel = urlPath;
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';

  const segs = resolveStatic(rel);
  if (!segs) return send(res, 404, 'Not Found', TEXT_PLAIN);   // 不 403，避免泄露文件是否存在
  const full = path.resolve(ROOT, ...segs);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    return send(res, 404, 'Not Found', TEXT_PLAIN);
  }
  const stat = await fsp.stat(full).catch(() => null);
  if (!stat || !stat.isFile()) return send(res, 404, 'Not Found', TEXT_PLAIN);
  return serveFile(req, res, full);
}

/* ---------------- 鉴权 / 同源 ---------------- */

function requireAuth(req, res) {
  const s = getSession(req);
  if (!s) {
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: '请先登录' });
    return null;
  }
  const u = qUserById.get(s.uid);
  if (!u || u.disabled) {
    sessions.delete(s.token);
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: '账号不可用' });
    return null;
  }
  return s;
}

function sameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.host === req.headers.host;
  } catch (e) {
    return false;
  }
}

/* ---------------- 路由 ---------------- */

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url || '/';
  const url = rawUrl.split('?')[0];      // 路由只比对路径，查询串单独解析
  const method = req.method;

  if (method === 'OPTIONS') return send(res, 204, '');

  /* -------- 健康检查 -------- */
  if (url === '/api/health') {
    let total = 0, pending = 0;
    try {
      total = qCount.get().n;
      pending = qCountStatus.get('pending').n;
    } catch (e) { /* 忽略 */ }
    return sendJson(res, 200, { ok: true, total, pending, storage: 'sqlite', moderation: true });
  }

  /* -------- 公开：已通过留言 -------- */
  // 我的留言（按归属令牌）：主站「消息」聚合用
  // owner 允许逗号分隔多个令牌：专题站按留言逐条下发令牌，
  // localStorage 里是 { 留言id: token }，一次可能带上来好几个。
  if (url === '/api/comments/mine' && method === 'GET') {
    const sp = new URL(rawUrl, 'http://x').searchParams;
    const owners = String(sp.get('owner') || '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x.length >= 16)
      .slice(0, 200);
    if (!owners.length) {
      return sendJson(res, 400, { ok: false, error: 'BAD_OWNER', message: '缺少归属令牌' });
    }
    let rows;
    try {
      const hashes = owners.map((o) => sha256(o));
      const ph = hashes.map(() => '?').join(',');
      rows = db.prepare(
        'SELECT id, name, text, created_at, status, audited_at, audited_by, page, pinned ' +
        'FROM comments WHERE owner_hash IN (' + ph + ') ORDER BY created_at DESC LIMIT 100'
      ).all(...hashes);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR', message: e.message });
    }
    return sendJson(res, 200, {
      ok: true,
      items: rows.map((r) => ({
        id: r.id, name: r.name, text: r.text, createdAt: r.created_at,
        status: r.status, auditedAt: r.audited_at, auditedBy: r.audited_by,
        page: r.page, pinned: !!r.pinned,
      })),
    });
  }

  if (url.startsWith('/api/comments') && method === 'GET' && !url.startsWith('/api/admin')) {
    // 按篇取留言；不带 page 时按 series-1，保持首页旧行为
    const page = pickPage(new URL(rawUrl, 'http://x').searchParams.get('page'));
    if (!page) return sendJson(res, 400, { ok: false, error: 'BAD_PAGE', message: '不支持的篇目' });
    try {
      const items = qPublicList.all(page).map((r) => ({
        id: r.id, name: r.name, text: r.text, ts: r.created_at, pinned: !!r.pinned,
      }));
      return sendJson(res, 200, { ok: true, items, total: items.length });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
  }

  /* -------- 公开：发表（待审核） -------- */
  if (url === '/api/comments' && method === 'POST') {
    const ip = clientIp(req);
    if (rateLimited(postHits, ip, RATE_LIMIT)) {
      return sendJson(res, 429, { ok: false, error: 'RATE_LIMITED', message: '发表过于频繁，请稍后再试' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      const msg = e.message === 'BODY_TOO_LARGE' ? '内容过长' : '请求格式错误';
      return sendJson(res, 400, { ok: false, error: e.message, message: msg });
    }

    const page = pickPage(body.page);
    if (!page) {
      return sendJson(res, 400, {
        ok: false, error: 'BAD_PAGE',
        message: '不支持的篇目（' + PAGES.join(' / ') + '）',
      });
    }

    const name = cleanName(body.name);
    const text = cleanText(body.text);

    if (!text) return sendJson(res, 400, { ok: false, error: 'EMPTY', message: '留言内容不能为空' });
    if (text.length > MAX_TEXT) {
      return sendJson(res, 400, { ok: false, error: 'TOO_LONG', message: '留言最多 ' + MAX_TEXT + ' 字' });
    }
    try {
      if (qCount.get().n >= MAX_TOTAL) {
        return sendJson(res, 507, { ok: false, error: 'FULL', message: '留言总数已达上限' });
      }
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }

    const id = 'c' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    const ts = Date.now();
    // 归属令牌：只返回给发表者本人，用于日后删除自己的留言
    const ownerToken = crypto.randomBytes(20).toString('hex');
    const ownerHash = sha256(ownerToken);
    try {
      qInsert.run(id, name, text, ip, ts, 'pending', ownerHash, page);
      return sendJson(res, 201, {
        ok: true, pending: true,
        item: { id, name, text, ts, status: 'pending' },
        ownerToken: ownerToken,
        message: '留言已提交，待管理员审核后显示',
      });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
  }

  /* -------- 公开：删除自己的留言（凭归属令牌） -------- */
  const ownDel = url.match(/^\/api\/comments\/([A-Za-z0-9_-]{4,64})$/);
  if (ownDel && method === 'DELETE') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    const ip = clientIp(req);
    if (rateLimited(deleteHits, ip, 30)) {
      return sendJson(res, 429, { ok: false, error: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试' });
    }

    let body;
    try { body = await readBody(req, 2 * 1024); } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
    }
    const token = String(body.token || req.headers['x-owner-token'] || '');
    if (!token) {
      return sendJson(res, 400, { ok: false, error: 'NO_TOKEN', message: '缺少删除凭证' });
    }

    const row = qOne.get(ownDel[1]);
    if (!row) {
      return sendJson(res, 404, { ok: false, error: 'NOT_FOUND', message: '留言不存在或已删除' });
    }
    if (!row.owner_hash) {
      return sendJson(res, 403, { ok: false, error: 'FORBIDDEN', message: '该留言不支持本人删除' });
    }

    const given = Buffer.from(sha256(token), 'hex');
    const expect = Buffer.from(row.owner_hash, 'hex');
    const matched = given.length === expect.length && crypto.timingSafeEqual(given, expect);
    if (!matched) {
      return sendJson(res, 403, { ok: false, error: 'FORBIDDEN', message: '只能删除自己发表的留言' });
    }

    try {
      qDelete.run(ownDel[1]);
      return sendJson(res, 200, { ok: true, id: ownDel[1] });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
  }

  /* ================= 管理接口 ================= */

  if (url === '/api/admin/login' && method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    const ip = clientIp(req);

    let body;
    try { body = await readBody(req, 4 * 1024); } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
    }

    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (rateLimited(loginFails, ip, LOGIN_LIMIT)) {
      return sendJson(res, 429, { ok: false, error: 'TOO_MANY', message: '尝试次数过多，请 10 分钟后再试' });
    }

    const user = qUserByName.get(username);
    if (!user || user.disabled || !verifyPassword(password, user.pass_hash)) {
      return sendJson(res, 401, { ok: false, error: 'BAD_CREDENTIALS', message: '用户名或密码错误' });
    }

    loginFails.delete(ip);
    const token = createSession(user);
    return sendJson(res, 200, {
      ok: true,
      user: { id: user.id, username: user.username, role: user.role },
    }, { 'Set-Cookie': cookieHeader(token) });
  }

  if (url === '/api/admin/logout' && method === 'POST') {
    const s = getSession(req);
    if (s) sessions.delete(s.token);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookieHeader() });
  }

  if (url === '/api/admin/me' && method === 'GET') {
    const s = getSession(req);
    if (!s) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    const u = qUserById.get(s.uid);
    if (!u || u.disabled) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    return sendJson(res, 200, { ok: true, user: { id: u.id, username: u.username, role: u.role } });
  }

  /* ---------- 密码重置申请（跨库：主站账号库） ---------- */

  if (url.startsWith('/api/admin/pw-requests') && method === 'GET') {
    if (!requireAuth(req, res)) return;
    if (!mainDb) {
      return sendJson(res, 503, { ok: false, error: 'MAIN_DB_UNAVAILABLE', message: '主站账号库不可用' });
    }
    const sp = new URL(rawUrl, 'http://x').searchParams;
    const status = sp.get('status') || 'pending';
    let rows;
    try {
      rows = status === 'all'
        ? mainDb.prepare(
            'SELECT id, username, note, status, created_at, resolved_at, resolved_by ' +
            'FROM password_requests ORDER BY created_at DESC LIMIT 200'
          ).all()
        : mainDb.prepare(
            'SELECT id, username, note, status, created_at, resolved_at, resolved_by ' +
            'FROM password_requests WHERE status = ? ORDER BY created_at DESC LIMIT 200'
          ).all(status);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR', message: e.message });
    }
    const cnt = (st) => mainDb.prepare('SELECT COUNT(*) AS n FROM password_requests WHERE status = ?').get(st).n;
    return sendJson(res, 200, {
      ok: true,
      items: rows.map((r) => ({
        id: r.id,
        username: r.username,
        note: r.note,
        status: r.status,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        resolvedBy: r.resolved_by,
      })),
      counts: { pending: cnt('pending'), approved: cnt('approved'), rejected: cnt('rejected') },
    });
  }

  if (/^\/api\/admin\/pw-requests\/\d+\/resolve$/.test(url) && method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    const s2 = requireAuth(req, res);
    if (!s2) return;
    if (!mainDb) {
      return sendJson(res, 503, { ok: false, error: 'MAIN_DB_UNAVAILABLE', message: '主站账号库不可用' });
    }

    let body;
    try { body = await readBody(req, 4 * 1024); } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
    }
    const action = body.action === 'reject' ? 'reject' : 'approve';
    const id = Number(url.split('/')[4]);

    let row;
    try {
      row = mainDb.prepare('SELECT * FROM password_requests WHERE id = ?').get(id);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR', message: e.message });
    }
    if (!row) return sendJson(res, 404, { ok: false, error: 'NOT_FOUND', message: '申请不存在' });
    if (row.status !== 'pending') {
      return sendJson(res, 409, { ok: false, error: 'ALREADY_RESOLVED', message: '该申请已处理过' });
    }

    const RESET_PASSWORD = '111111';
    if (action === 'approve') {
      const u = mainDb.prepare('SELECT id FROM users WHERE username = ?').get(row.username);
      if (!u) {
        return sendJson(res, 404, { ok: false, error: 'USER_NOT_FOUND', message: '该学号不存在（可能已被删除）' });
      }
      try {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = await mainHashPassword(RESET_PASSWORD, salt);
        mainDb.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?').run(salt, hash, u.id);
        // 重置后该学号所有旧会话失效，必须用新密码重新登录
        mainDb.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: 'RESET_FAILED', message: e.message });
      }
    }

    try {
      mainDb.prepare(
        'UPDATE password_requests SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?'
      ).run(action === 'approve' ? 'approved' : 'rejected', Date.now(), s2.username, id);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR', message: e.message });
    }

    return sendJson(res, 200, {
      ok: true,
      action,
      username: row.username,
      password: action === 'approve' ? RESET_PASSWORD : '',
    });
  }

  if (url === '/api/admin/comments' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    const sp = new URL(rawUrl, 'http://x').searchParams;
    const status = sp.get('status') || 'all';        // 状态过滤（保持原行为）
    // 篇目过滤：'all' / series-1 / series-2；缺省、空串同样按 'all'
    const pageFilter = pickPageFilter(sp.get('page'));
    if (!pageFilter) return sendJson(res, 400, { ok: false, error: 'BAD_PAGE', message: '不支持的篇目' });
    let rows;
    try {
      rows = qAdminList.all(status, status, pageFilter, pageFilter);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
    const items = rows.map((r) => ({
      id: r.id, name: r.name, text: r.text, ip: r.ip, ts: r.created_at,
      status: r.status, auditedAt: r.audited_at, auditedBy: r.audited_by,
      pinned: !!r.pinned, pinnedAt: r.pinned_at, page: r.page,
    }));
    return sendJson(res, 200, {
      ok: true, items, page: pageFilter,
      counts: {
        all: qCountOfPage.get(pageFilter, pageFilter).n,
        pending: qCountStatusOfPage.get('pending', pageFilter, pageFilter).n,
        approved: qCountStatusOfPage.get('approved', pageFilter, pageFilter).n,
        rejected: qCountStatusOfPage.get('rejected', pageFilter, pageFilter).n,
      },
    });
  }

  if (url === '/api/admin/audit' && method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    const s = requireAuth(req, res);
    if (!s) return;

    let body;
    try { body = await readBody(req); } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
    }
    const action = body.action;
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
    if (!ids.length) return sendJson(res, 400, { ok: false, error: 'NO_IDS', message: '未选择留言' });
    if (action !== 'approve' && action !== 'reject') {
      return sendJson(res, 400, { ok: false, error: 'BAD_ACTION' });
    }

    const next = action === 'approve' ? 'approved' : 'rejected';
    const now = Date.now();
    let n = 0;
    try {
      for (const id of ids) {
        if (!qOne.get(id)) continue;
        qAudit.run(next, now, s.username, id);
        n++;
      }
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
    return sendJson(res, 200, { ok: true, affected: n, status: next });
  }

  // 置顶 / 取消置顶
  if (url === '/api/admin/pin' && method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    if (!requireAuth(req, res)) return;

    let body;
    try { body = await readBody(req); } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
    }
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
    if (!ids.length) return sendJson(res, 400, { ok: false, error: 'NO_IDS', message: '未选择留言' });

    const pinned = body.pinned ? 1 : 0;
    const now = Date.now();
    let n = 0;
    try {
      for (const id of ids) {
        const row = qOne.get(id);
        if (!row) continue;
        // 只有已通过的留言才有置顶意义
        if (pinned && row.status !== 'approved') continue;
        qPin.run(pinned, pinned ? now : null, id);
        n++;
      }
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
    return sendJson(res, 200, { ok: true, affected: n, pinned: !!pinned });
  }

  const delMatch = url.match(/^\/api\/admin\/comments\/([A-Za-z0-9_-]{4,64})$/);
  if (delMatch && method === 'DELETE') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    if (!requireAuth(req, res)) return;
    const id = delMatch[1];
    try {
      if (!qOne.get(id)) return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
      qDelete.run(id);
      return sendJson(res, 200, { ok: true, id });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
  }

  if (url === '/api/admin/clear' && method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    if (!requireAuth(req, res)) return;

    let body;
    try { body = await readBody(req); } catch (e) { body = {}; }
    const scope = body.scope || 'all';
    try {
      if (scope === 'all') {
        const n = qCount.get().n;
        db.exec('DELETE FROM comments');
        return sendJson(res, 200, { ok: true, affected: n });
      }
      if (['pending', 'approved', 'rejected'].indexOf(scope) >= 0) {
        const before = qCountStatus.get(scope).n;
        qDeleteByStatus.run(scope);
        return sendJson(res, 200, { ok: true, affected: before });
      }
      return sendJson(res, 400, { ok: false, error: 'BAD_SCOPE' });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
  }

  if (url === '/api/admin/users' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    return sendJson(res, 200, { ok: true, items: qUserList.all() });
  }

  if (url === '/api/admin/users' && method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    const sAdd = requireAuth(req, res);
    if (!sAdd) return;
    // 只有主管理员（role=owner）能新增管理员；普通 admin 只能审核留言
    const meAdd = qUserById.get(sAdd.uid);
    if (!meAdd || meAdd.role !== 'owner') {
      return sendJson(res, 403, { ok: false, error: 'OWNER_ONLY', message: '只有主管理员能新增管理员' });
    }

    let body;
    try { body = await readBody(req, 4 * 1024); } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
    }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/.test(username)) {
      return sendJson(res, 400, { ok: false, error: 'BAD_USERNAME', message: '用户名 2-20 位，限字母数字下划线或中文' });
    }
    if (password.length < 6) {
      return sendJson(res, 400, { ok: false, error: 'WEAK_PASSWORD', message: '密码至少 6 位' });
    }
    if (qUserByName.get(username)) {
      return sendJson(res, 409, { ok: false, error: 'EXISTS', message: '用户名已存在' });
    }

    const id = 'u' + crypto.randomBytes(6).toString('hex');
    try {
      qUserInsert.run(id, username, hashPassword(password), 'admin', Date.now());
      return sendJson(res, 201, { ok: true, user: { id, username, role: 'admin' } });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
  }

  const userDelMatch = url.match(/^\/api\/admin\/users\/([A-Za-z0-9_-]{4,64})$/);
  if (userDelMatch && method === 'DELETE') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    const s = requireAuth(req, res);
    if (!s) return;
    // 与新增对称：只有主管理员能删管理员
    const meDel = qUserById.get(s.uid);
    if (!meDel || meDel.role !== 'owner') {
      return sendJson(res, 403, { ok: false, error: 'OWNER_ONLY', message: '只有主管理员能删除管理员' });
    }

    if (qUserCount.get().n <= 1) {
      return sendJson(res, 400, { ok: false, error: 'LAST_ADMIN', message: '至少保留一个管理员' });
    }
    if (userDelMatch[1] === s.uid) {
      return sendJson(res, 400, { ok: false, error: 'SELF', message: '不能删除当前登录的账号' });
    }
    try {
      if (!qUserById.get(userDelMatch[1])) {
        return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
      }
      qUserDelete.run(userDelMatch[1]);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
  }

  if (url === '/api/admin/password' && method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'BAD_ORIGIN' });
    const s = requireAuth(req, res);
    if (!s) return;

    let body;
    try { body = await readBody(req, 4 * 1024); } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
    }
    const oldPw = String(body.oldPassword || '');
    const newPw = String(body.newPassword || '');

    const u = qUserById.get(s.uid);
    if (!u || !verifyPassword(oldPw, u.pass_hash)) {
      return sendJson(res, 400, { ok: false, error: 'BAD_OLD', message: '原密码不正确' });
    }
    if (newPw.length < 6) {
      return sendJson(res, 400, { ok: false, error: 'WEAK_PASSWORD', message: '新密码至少 6 位' });
    }
    try {
      qUserPass.run(hashPassword(newPw), s.uid);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'DB_ERROR' });
    }
  }

  if (url.indexOf('/api/') === 0) {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  }

  return serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => {
  let c = { all: 0, pending: 0 };
  try {
    c.all = qCount.get().n;
    c.pending = qCountStatus.get('pending').n;
  } catch (e) { /* 忽略 */ }
  console.log('留言服务已启动  http://127.0.0.1:' + PORT + '/');
  console.log('管理后台        http://127.0.0.1:' + PORT + '/admin');
  console.log('数据库: ' + DB_PATH);
  console.log('留言总数: ' + c.all + ' 条，其中待审核 ' + c.pending + ' 条');
});

process.on('SIGINT', () => {
  try { db.close(); } catch (e) { /* 忽略 */ }
  process.exit(0);
});
