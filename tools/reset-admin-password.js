/**
 * 重置专题站管理员密码
 * 用法：node tools/reset-admin-password.js <新密码>
 * 说明：bootstrapAdmin 只在 users 表为空时写初始密码，之后改密码走这里。
 */
const path = require('path')
const crypto = require('crypto')
const { DatabaseSync } = require('node:sqlite')

const root = path.resolve(__dirname, '..')
const dbPath = path.join(root, 'competition-timeline', 'server', 'data.db')
const pw = process.argv[2]

if (!pw || pw.length < 3) {
  console.error('用法: node tools/reset-admin-password.js <新密码>（至少 3 位）')
  process.exit(1)
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(plain, salt, 64)
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex')
}

const db = new DatabaseSync(dbPath)
const admin = db.prepare("SELECT id, username FROM users WHERE username = 'admin'").get()
if (!admin) {
  console.error('数据库里没有 admin 账号，先启动一次 :8899 让 bootstrapAdmin 建号')
  db.close()
  process.exit(1)
}
db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(pw), admin.id)
console.log('已重置 admin 密码（id ' + admin.id + '）')
db.close()
