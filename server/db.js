/**
 * SQLite 初始化 —— Node 22 内置 node:sqlite，零第三方依赖
 * 数据库文件默认 server/data.db（可用 DB_PATH 环境变量覆盖，供迁移服务器）
 * 全部语句走 prepare() 参数化，杜绝 SQL 注入
 */
'use strict'

const { DatabaseSync } = require('node:sqlite')
const path = require('node:path')
const fs = require('node:fs')

const DEFAULT_PATH = path.join(__dirname, 'data.db')

function openDb(dbPath) {
  const file = dbPath || process.env.DB_PATH || DEFAULT_PATH
  fs.mkdirSync(path.dirname(file), { recursive: true })

  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT UNIQUE NOT NULL,
      salt       TEXT NOT NULL,
      hash       TEXT NOT NULL,
      nickname   TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT NOT NULL,
      note        TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'pending',
      created_at  INTEGER NOT NULL,
      resolved_at INTEGER,
      resolved_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pwreq_status ON password_requests(status, created_at);

    CREATE TABLE IF NOT EXISTS progress (
      user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      checkins    TEXT NOT NULL DEFAULT '{}',
      quiz_scores TEXT NOT NULL DEFAULT '{}',
      final_exam  TEXT NOT NULL DEFAULT '{"attempts":0,"best":0,"passed":false,"lastTime":null}',
      stats       TEXT NOT NULL DEFAULT '{"correctCount":0,"totalCount":0}',
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkin_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      node_code  TEXT NOT NULL,
      node_name  TEXT NOT NULL,
      node_order INTEGER NOT NULL,
      time       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bank_questions (
      id          TEXT PRIMARY KEY,
      question    TEXT NOT NULL,
      options     TEXT NOT NULL,
      answer      TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status      TEXT NOT NULL DEFAULT 'in_progress',
      questions   TEXT NOT NULL,
      answers     TEXT NOT NULL DEFAULT '{}',
      score       INTEGER NOT NULL DEFAULT 0,
      correct     INTEGER NOT NULL DEFAULT 0,
      total       INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_contests_user ON contests(user_id, created_at);
  `)

  // 旧库迁移：progress 表补 stats 列（学习统计）
  const cols = db.prepare(`SELECT name FROM pragma_table_info('progress')`).all().map(r => r.name)
  if (!cols.includes('stats')) {
    db.exec(`ALTER TABLE progress ADD COLUMN stats TEXT NOT NULL DEFAULT '{"correctCount":0,"totalCount":0}'`)
  }

  return db
}

module.exports = { openDb }
