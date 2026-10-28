'use strict';
/**
 * 学生账号管理工具（命令行）
 *
 * 用法（在项目根目录，服务已启动）：
 *   set ADMIN_KEY=你的管理口令        :: Windows cmd
 *   $env:ADMIN_KEY="你的管理口令"     :: PowerShell
 *
 *   node tools/admin-users.js requests            查看待处理的忘记密码申请
 *   node tools/admin-users.js approve <id>        批准（重置为 111111）
 *   node tools/admin-users.js reject  <id>        拒绝
 *   node tools/admin-users.js bulk students.txt   批量导入（一行一个 8 位学号）
 *
 * 说明：
 *  - 需要服务端启动时带同样的 ADMIN_KEY，否则接口 403
 *  - bulk 导入的新账号初始密码 111111，已存在的学号会跳过（不覆盖密码）
 */
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.CZ_BASE || 'http://127.0.0.1:8088';
const KEY = process.env.ADMIN_KEY || '';

if (!KEY) {
  console.error('缺少 ADMIN_KEY 环境变量。先设置它（与服务端启动时的值一致）。');
  process.exit(1);
}

async function call(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'x-admin-key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  if (!res.ok || json.ok === false) {
    const err = new Error(json.message || ('HTTP ' + res.status));
    err.code = json.error || '';
    throw err;
  }
  return json;
}

(async () => {
  const cmd = process.argv[2];

  if (cmd === 'requests') {
    const r = await call('GET', '/api/admin/password-requests?status=pending');
    if (!r.items || !r.items.length) {
      console.log('没有待处理的找回密码申请。');
      return;
    }
    console.log('待处理的找回密码申请：\n');
    console.log('  id    学号        提交时间              说明');
    console.log('  ' + '-'.repeat(70));
    for (const it of r.items) {
      const t = new Date(it.created_at).toLocaleString('zh-CN');
      console.log('  ' + String(it.id).padEnd(5) + ' ' + String(it.username).padEnd(11) + ' ' + t.padEnd(20) + ' ' + (it.note || ''));
    }
    console.log('\n批准：node tools/admin-users.js approve <id>');
    console.log('拒绝：node tools/admin-users.js reject  <id>');
    return;
  }

  if (cmd === 'approve' || cmd === 'reject') {
    const id = Number(process.argv[3]);
    if (!id) { console.error('用法: node tools/admin-users.js approve <id>'); process.exit(1); }
    const r = await call('POST', '/api/admin/password-requests/' + id + '/resolve', {
      action: cmd === 'approve' ? 'approve' : 'reject',
      password: process.argv[4] || '111111',
      by: 'admin-cli',
    });
    if (cmd === 'approve') {
      console.log('已批准：学号 ' + r.username + ' 的密码已重置为 ' + r.password);
    } else {
      console.log('已拒绝：学号 ' + r.username);
    }
    return;
  }

  if (cmd === 'bulk') {
    const file = process.argv[3];
    if (!file) { console.error('用法: node tools/admin-users.js bulk <学号清单.txt>'); process.exit(1); }
    const raw = fs.readFileSync(path.resolve(file), 'utf8');
    const list = raw.split(/[\s,;，；]+/).map(s => s.trim()).filter(Boolean);
    if (!list.length) { console.error('清单里没有学号'); process.exit(1); }
    console.log('准备导入 ' + list.length + ' 个学号，初始密码 111111 ...');
    const r = await call('POST', '/api/admin/users/bulk', {
      usernames: list,
      password: process.argv[4] || '111111',
      nicknamePrefix: '',
    });
    console.log('\n结果：');
    console.log('  新建   ' + r.created + ' 个');
    console.log('  已存在 ' + r.skipped + ' 个（跳过，密码不变）');
    if (r.invalid && r.invalid.length) {
      console.log('  无效   ' + r.invalid.length + ' 个：' + r.invalid.slice(0, 20).join(', '));
    }
    return;
  }

  console.log(`学生账号管理工具

用法：
  node tools/admin-users.js requests            查看待处理的找回密码申请
  node tools/admin-users.js approve <id> [密码] 批准（默认重置为 111111）
  node tools/admin-users.js reject  <id>        拒绝
  node tools/admin-users.js bulk <清单文件>     批量导入学号（一行一个）

环境变量：
  ADMIN_KEY  必填，与服务端启动时一致
  CZ_BASE    可选，默认 http://127.0.0.1:8088`);
})().catch(err => {
  console.error('失败：' + (err.code ? err.code + ' - ' : '') + err.message);
  process.exit(1);
});
