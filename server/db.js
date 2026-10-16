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

    CREATE TABLE IF NOT EXISTS progress (
      user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      checkins    TEXT NOT NULL DEFAULT '{}',
      quiz_scores TEXT NOT NULL DEFAULT '{}',
      final_exam  TEXT NOT NULL DEFAULT '{"attempts":0,"best":0,"passed":false,"lastTime":null}',
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
  `)

  return db
}

module.exports = { openDb }
