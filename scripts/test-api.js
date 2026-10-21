/**
 * 后端 API 全链路测试 —— node scripts/test-api.js
 * 起真实服务（随机端口 + 临时数据库），用 fetch 打接口逐项断言
 */
'use strict'

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const assert = require('node:assert')
const { spawnSync } = require('node:child_process')

const DB_FILE = path.join(os.tmpdir(), 'cz_test_' + process.pid + '.db')
process.env.DB_PATH = DB_FILE

const mockQuestions = require('../js/mock/questions')

const { startServer } = require('../server/server')

let BASE = ''
let passed = 0
let failed = 0

// 限速 / CORS 各需要一套不同的环境变量配置，只能各起一个实例；
// 每个实例都会注册 SIGTERM/SIGINT 处理函数，放开监听器上限避免假告警
process.setMaxListeners(0)

function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name) }
  else { failed++; console.log('  ✗ ' + name + (extra ? ' —— ' + extra : '')) }
}

/** 低层请求：可指定实例 base，并保留响应头（CORS 断言要看头） */
async function reqRaw(base, method, p, body, token, headers) {
  const opts = { method, headers: Object.assign({}, headers) }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  if (token) opts.headers['Authorization'] = 'Bearer ' + token
  const res = await fetch(base + p, opts)
  let json = null
  try { json = await res.json() } catch (e) { /* 非 JSON 响应 */ }
  return { status: res.status, body: json, headers: res.headers }
}

function req(method, p, body, token) {
  return reqRaw(BASE, method, p, body, token)
}

/* ---------- 多配置实例（RATE_LIMITS / CORS_ORIGINS / RATE_OFF 都是 server.js 模块级常量，
 * 只在 require 时读环境变量，所以必须清缓存重新加载才能换一套配置） ---------- */

const SERVER_ENTRY = require.resolve('../server/server.js')
const extraServers = []

/** env 里值为 null 表示「删掉该变量」，其余为覆盖值；只在 require 那一刻生效 */
async function startInstance(env) {
  const keys = Object.keys(env || {})
  const saved = {}
  for (const k of keys) {
    saved[k] = process.env[k]
    if (env[k] === null) delete process.env[k]
    else process.env[k] = env[k]
  }
  let mod
  try {
    delete require.cache[SERVER_ENTRY]
    mod = require(SERVER_ENTRY)
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
  const server = await mod.startServer(0)
  extraServers.push(server)
  return { server, base: 'http://127.0.0.1:' + server.address().port }
}

/** 断言失败信息里的「文件:行号」—— 源码契约类断言定位用 */
function atIdx(file, src, idx) {
  return idx < 0 ? file + ':(未找到该代码)' : file + ':' + (src.slice(0, idx).split('\n').length)
}

/** 从题目库取某 node 的正确答案 */
function answersFor(nodeCode) {
  return mockQuestions
    .filter(q => q.nodeCode === nodeCode)
    .map(q => ({ id: q._id, answer: q.answer }))
}

async function main() {
  const server = await startServer(0)
  BASE = 'http://127.0.0.1:' + server.address().port
  console.log('服务已启动: ' + BASE + '\n')

  try {
    /* ---------- 1. 静态服务与基础 ---------- */
    console.log('[1] 静态服务')
    let r = await req('GET', '/')
    ok('GET / → 200 且返回 HTML（非 JSON）', r.status === 200 && r.body === null)
    r = await req('GET', '/css/style.css')
    ok('GET /css/style.css → 200', r.status === 200)
    // 静态白名单：源码 / 数据 / 脚本 / 依赖一律 404（明确 404，不是「非 200」）
    for (const denied of ['/server/data.db', '/server/question-bank.json', '/server/game.js',
      '/scripts/test-api.js', '/README.md', '/.git/config']) {
      const d = await req('GET', denied)
      ok('静态白名单：GET ' + denied + ' → 404', d.status === 404, '实际 ' + d.status + ' ' + JSON.stringify(d.body))
    }
    r = await req('GET', '/js/api.js')
    ok('静态白名单：GET /js/api.js → 200（白名单没写成全拒绝）', r.status === 200, '实际 ' + r.status)
    r = await req('GET', '/..%2fserver%2fdb.js')
    ok('目录穿越被拒（403/404）', r.status === 403 || r.status === 404)
    r = await req('GET', '/api/health')
    ok('health → ok', r.status === 200 && r.body.ok === true)
    r = await req('GET', '/api/config')
    ok('config 公开可读', r.status === 200 && r.body.config.finalExam)
    r = await req('GET', '/api/nodes')
    ok('nodes 公开可读且 11 个', r.status === 200 && r.body.nodes.length === 11)

    /* ---------- 2. 注册 ---------- */
    console.log('\n[2] 注册')
    r = await req('POST', '/api/register', { username: '测试员1', password: 'abc123', nickname: '小测' })
    ok('注册成功返 token + user', r.status === 200 && !!r.body.token && r.body.user.nickname === '小测')
    const token1 = r.body.token
    r = await req('POST', '/api/register', { username: '测试员1', password: 'abc123' })
    ok('重复用户名 → 409', r.status === 409 && r.body.error === 'USERNAME_TAKEN')
    r = await req('POST', '/api/register', { username: 'a', password: 'abc123' })
    ok('非法用户名 → 400', r.status === 400)
    r = await req('POST', '/api/register', { username: '测试员2', password: '123' })
    ok('短密码 → 400', r.status === 400)

    /* ---------- 3. 登录与限速 ---------- */
    console.log('\n[3] 登录 / 限速')
    r = await req('POST', '/api/login', { username: '测试员1', password: 'wrong1' })
    ok('错误密码 → 401', r.status === 401)
    r = await req('POST', '/api/login', { username: '测试员1', password: 'abc123' })
    ok('正确密码登录成功', r.status === 200 && !!r.body.token)
    for (let i = 0; i < 5; i++) {
      await req('POST', '/api/login', { username: '测试员1', password: 'bad' + i })
    }
    r = await req('POST', '/api/login', { username: '测试员1', password: 'abc123' })
    ok('连续失败后锁定 → 429', r.status === 429 && r.body.error === 'RATE_LIMITED', '实际 ' + r.status + ' ' + JSON.stringify(r.body))

    /* ---------- 4. 未登录拦截 ---------- */
    console.log('\n[4] 未登录拦截')
    r = await req('POST', '/api/checkin', { code: 'ruijin' })
    ok('未登录打卡 → 401', r.status === 401 && r.body.error === 'AUTH_REQUIRED')
    r = await req('GET', '/api/quiz?mode=node&code=ruijin')
    ok('未登录取题 → 401', r.status === 401)
    r = await req('GET', '/api/progress')
    ok('未登录进度 → progress:null', r.status === 200 && r.body.progress === null)

    /* ---------- 5. 打卡链路（另注册一个不被限速的账号） ---------- */
    console.log('\n[5] 打卡链路')
    r = await req('POST', '/api/register', { username: '打卡员', password: 'check123' })
    const token = r.body.token
    const nodes = (await req('GET', '/api/nodes')).body.nodes
    r = await req('POST', '/api/checkin', { code: nodes[0].code }, token)
    ok('首节点打卡成功', r.status === 200 && r.body.ok && r.body.alreadyChecked === false)
    r = await req('POST', '/api/checkin', { code: nodes[0].code }, token)
    ok('重复打卡幂等 alreadyChecked=true', r.body.alreadyChecked === true)
    for (let i = 1; i < nodes.length; i++) {
      r = await req('POST', '/api/checkin', { code: nodes[i].code }, token)
    }
    r = await req('GET', '/api/progress', undefined, token)
    ok('11 节点全打卡，进度 checkins 计数 11', Object.keys(r.body.progress.checkins).length === 11)
    r = await req('GET', '/api/checkins', undefined, token)
    ok('足迹流水 11 条（含 nodeName/time）',
      r.status === 200 && Array.isArray(r.body.checkins) && r.body.checkins.length === 11 &&
      typeof r.body.checkins[0].nodeName === 'string' && typeof r.body.checkins[0].time === 'number')
    r = await req('POST', '/api/checkin', { code: '不存在', }, token)
    ok('无效节点 → NODE_NOT_FOUND', r.body.error === 'NODE_NOT_FOUND')

    /* ---------- 6. 取题零答案泄露 ---------- */
    console.log('\n[6] 取题防泄露')
    r = await req('GET', '/api/quiz?mode=node&code=' + nodes[0].code, undefined, token)
    ok('取题成功且 3 题', r.status === 200 && r.body.questions.length === 3)
    const leakFree = r.body.questions.every(q =>
      !('answer' in q) && !('explanation' in q) &&
      Object.keys(q).sort().join(',') === 'id,options,question,type'
    )
    ok('题目对象零 answer/explanation 字段', leakFree)
    ok('meta 含 passScore', typeof r.body.meta.passScore === 'number')
    r = await req('GET', '/api/quiz?mode=node&code=' + nodes[1].code, undefined, token)
    ok('已打卡节点可取题', r.status === 200)

    /* ---------- 7. 判分 ---------- */
    console.log('\n[7] 判分')
    const code0 = nodes[0].code
    let correct = answersFor(code0)
    r = await req('POST', '/api/quiz/submit', { mode: 'node', code: code0, answers: correct }, token)
    ok('全对 → 100 分通关', r.body.score === 100 && r.body.passed === true && r.body.best === 100)
    ok('解析返回且含正确答案', r.body.results.length === 3 && r.body.results[0].correctAnswer.length > 0)

    const code1 = nodes[1].code
    const qs1 = mockQuestions.filter(q => q.nodeCode === code1)
    const wrong67 = qs1.map((q, i) => ({ id: q._id, answer: i < 2 ? q.answer : [q.answer[0] === 0 ? 1 : 0] }))
    r = await req('POST', '/api/quiz/submit', { mode: 'node', code: code1, answers: wrong67 }, token)
    ok('2/3 → 67 分且及格通关', r.body.score === 67 && r.body.passed === true)

    const code2 = nodes[2].code
    // 新契约：判分只认服务端下发集合，故先取题再交卷
    await req('GET', '/api/quiz?mode=node&code=' + code2, undefined, token)
    const qs2 = mockQuestions.filter(q => q.nodeCode === code2)
    const wrong0 = qs2.map(q => ({ id: q._id, answer: [q.answer[0] === 0 ? 1 : 0] }))
    r = await req('POST', '/api/quiz/submit', { mode: 'node', code: code2, answers: wrong0 }, token)
    ok('0 分 → 未通关', r.body.score === 0 && r.body.passed === false)
    r = await req('POST', '/api/quiz/submit', { mode: 'node', code: code2, answers: answersFor(code2) }, token)
    ok('0 分后再考 100 → best 保持 100', r.body.best === 100 && r.body.attempts === 2)

    // 学习统计累计：4 次提交共 12 题，答对 3+2+0+3=8
    r = await req('GET', '/api/progress', undefined, token)
    ok('学习统计累计 12 题 / 8 对', r.body.progress.stats && r.body.progress.stats.totalCount === 12 && r.body.progress.stats.correctCount === 8)

    /* ---------- 7.5 判分防绕过（分母不可操纵 / 未取题 / 冒用场次 / 零答案泄露） ---------- */
    console.log('\n[7.5] 判分防绕过')
    const codeA = nodes[3].code
    r = await req('GET', '/api/quiz?mode=node&code=' + codeA, undefined, token)
    const idsA = (r.body.questions || []).map(q => q.id)
    ok('已打卡节点取出 3 题（下发集合已记录）',
      r.status === 200 && idsA.length === 3, '实际 ' + r.status + ' ' + JSON.stringify(r.body && r.body.error))
    const leakIdx = (r.body.questions || []).findIndex(q => 'answer' in q || 'explanation' in q)
    ok('下发的每道题都无 answer/explanation 字段', (r.body.questions || []).length === 3 && leakIdx === -1,
      '第 ' + (leakIdx + 1) + ' 题泄露：' + JSON.stringify((r.body.questions || [])[leakIdx]))

    // 分母不可操纵：只交 1 条 → 400，且进度 stats 深比较完全不变
    const oneOnly = [{ id: idsA[0], answer: (mockQuestions.find(q => q._id === idsA[0]) || { answer: [0] }).answer }]
    const beforeBad = (await req('GET', '/api/progress', undefined, token)).body.progress
    r = await req('POST', '/api/quiz/submit', { mode: 'node', code: codeA, answers: oneOnly }, token)
    ok('只交 1 条 → 400 INVALID_ANSWER_SET',
      r.status === 400 && r.body.error === 'INVALID_ANSWER_SET', '实际 ' + r.status + ' ' + JSON.stringify(r.body))
    const afterBad = (await req('GET', '/api/progress', undefined, token)).body.progress
    ok('非法提交后 stats 完全不变（深比较，堵死「只答 1 题换 100 分」）',
      JSON.stringify(afterBad.stats) === JSON.stringify(beforeBad.stats),
      '提交前 ' + JSON.stringify(beforeBad.stats) + ' / 提交后 ' + JSON.stringify(afterBad.stats))
    ok('非法提交不写入 quizScores', !afterBad.quizScores[codeA], '实际 ' + JSON.stringify(afterBad.quizScores[codeA]))

    // 不能冒用别的场次的题：拿 A 场次的完整题号去交 code=B
    const codeB = nodes[4].code
    await req('GET', '/api/quiz?mode=node&code=' + codeB, undefined, token)
    r = await req('POST', '/api/quiz/submit', { mode: 'node', code: codeB, answers: answersFor(codeA) }, token)
    ok('拿 A 场次的题交 code=' + codeB + ' → 400 INVALID_ANSWER_SET',
      r.status === 400 && r.body.error === 'INVALID_ANSWER_SET', '实际 ' + r.status + ' ' + JSON.stringify(r.body))

    // 未取题不能交卷：新用户打卡后不取题，直接交满 3 条
    const t3 = (await req('POST', '/api/register', { username: '未取题员', password: 'peek123' })).body.token
    const codeFresh = nodes[0].code
    await req('POST', '/api/checkin', { code: codeFresh }, t3)
    r = await req('POST', '/api/quiz/submit', { mode: 'node', code: codeFresh, answers: answersFor(codeFresh) }, t3)
    ok('未取题直接交满 3 条 → 400 ATTEMPT_NOT_FOUND',
      r.status === 400 && r.body.error === 'ATTEMPT_NOT_FOUND', '实际 ' + r.status + ' ' + JSON.stringify(r.body))
    const pFresh = (await req('GET', '/api/progress', undefined, t3)).body.progress
    ok('未取题交卷不计分（quizScores 空 / stats 未累计）',
      !pFresh.quizScores[codeFresh] && (pFresh.stats ? pFresh.stats.totalCount : 0) === 0,
      '实际 quizScores=' + JSON.stringify(pFresh.quizScores[codeFresh]) + ' stats=' + JSON.stringify(pFresh.stats))

    /* ---------- 8. final 毕业 ---------- */
    console.log('\n[8] 总结答题')
    r = await req('POST', '/api/register', { username: '毕业生', password: 'final123' }, token)
    r = await req('GET', '/api/quiz?mode=final', undefined, r.body.token)
    ok('未全打卡 final → NOT_ALL_CHECKED_IN', r.body.error === 'NOT_ALL_CHECKED_IN')
    const t2 = (await req('POST', '/api/register', { username: '毕业生2', password: 'final123' })).body.token
    r = await req('GET', '/api/quiz?mode=final', undefined, t2)
    ok('未全打卡（新账号）→ NOT_ALL_CHECKED_IN', r.body.error === 'NOT_ALL_CHECKED_IN')
    for (const n of nodes) await req('POST', '/api/checkin', { code: n.code }, t2)
    r = await req('GET', '/api/quiz?mode=final', undefined, t2)
    ok('全打卡后 final 抽 10 题', r.status === 200 && r.body.questions.length === 10)
    const finalAnswers = mockQuestions
      .filter(q => q.nodeCode === 'final')
      .map(q => ({ id: q._id, answer: q.answer }))
    // 只提交抽中题目的答案
    const pickedIds = r.body.questions.map(q => q.id)
    const pickedAnswers = finalAnswers.filter(a => pickedIds.includes(a.id))
    r = await req('POST', '/api/quiz/submit', { mode: 'final', code: '', answers: pickedAnswers }, t2)
    ok('final 全对 → 毕业 isFinalPassed', r.body.score === 100 && r.body.isFinalPassed === true)

    /* ---------- 8.5 竞赛 ---------- */
    console.log('\n[8.5] 竞赛（毕业解锁 + 积分赛 + 排行榜）')
    r = await req('GET', '/api/contest/status', undefined, token1)
    ok('未毕业 → graduated=false', r.status === 200 && r.body.graduated === false)
    r = await req('POST', '/api/contest/start', {}, token1)
    ok('未毕业开场 → NOT_GRADUATED', r.body.error === 'NOT_GRADUATED')
    r = await req('GET', '/api/contest/status', undefined, t2)
    ok('已毕业 → graduated=true 且题库 ≥20', r.body.graduated === true && r.body.bankCount >= 20)
    r = await req('POST', '/api/contest/start', {}, t2)
    ok('开场 → 抽 20 题且零答案字段', r.status === 200 && r.body.questions.length === 20 &&
      r.body.questions.every(q => !('answer' in q) && !('explanation' in q) && q.id && q.options))
    ok('meta 含满分 100', r.body.meta.questionCount === 20 && r.body.meta.subtitle.includes('100'))
    const contestId = r.body.contestId
    // 从库读该场次的正确答案（模拟服务端快照）
    const { DatabaseSync: DatabaseSyncContest } = require('node:sqlite')
    const dbContest = new DatabaseSyncContest(DB_FILE)
    const snap = JSON.parse(dbContest.prepare('SELECT questions FROM contests WHERE id = ?').get(contestId).questions)
    const fullRight = snap.map(q => ({ id: q.id, answer: JSON.parse(q.answer) }))
    const fullWrong = snap.map(q => ({ id: q.id, answer: [JSON.parse(q.answer)[0] === 0 ? 1 : 0] }))
    r = await req('POST', '/api/contest/submit', { contestId: 99999, answers: fullRight }, t2)
    ok('无效场次 → CONTEST_NOT_FOUND', r.body.error === 'CONTEST_NOT_FOUND')
    r = await req('POST', '/api/contest/submit', { contestId, answers: fullRight }, token1)
    ok('他人场次 → CONTEST_NOT_FOUND（防串场）', r.body.error === 'CONTEST_NOT_FOUND')
    r = await req('POST', '/api/contest/submit', { contestId, answers: fullWrong }, t2)
    ok('全错交卷 → 0 分', r.status === 200 && r.body.score === 0 && r.body.correctCount === 0)
    ok('解析返回含正确答案', r.body.results.length === 20 && r.body.results[0].correctAnswer.length > 0)
    ok('myStats 累计 0 / 最佳 0 / 1 场', r.body.myStats.plays === 1 && r.body.myStats.totalScore === 0)
    r = await req('POST', '/api/contest/submit', { contestId, answers: fullRight }, t2)
    ok('重复交卷 → ALREADY_SUBMITTED', r.body.error === 'ALREADY_SUBMITTED')
    r = await req('POST', '/api/contest/start', {}, t2)
    const contestId2 = r.body.contestId
    const snap2 = JSON.parse(dbContest.prepare('SELECT questions FROM contests WHERE id = ?').get(contestId2).questions)
    const fullRight2 = snap2.map(q => ({ id: q.id, answer: JSON.parse(q.answer) }))
    r = await req('POST', '/api/contest/submit', { contestId: contestId2, answers: fullRight2, durationMs: 88000 }, t2)
    ok('全对 → 100 分且最佳 100', r.body.score === 100 && r.body.myStats.bestScore === 100 && r.body.myStats.plays === 2)
    dbContest.close()
    // 排行榜
    r = await req('GET', '/api/contest/leaderboard?type=total')
    ok('总榜公开可读（未登录）', r.status === 200 && Array.isArray(r.body.list))
    r = await req('GET', '/api/contest/leaderboard?type=total', undefined, t2)
    ok('总榜含我且名次正确', r.body.myRank !== null && r.body.list.length >= 1 && r.body.list[0].name)
    r = await req('GET', '/api/contest/leaderboard?type=best', undefined, t2)
    ok('最佳榜可读', r.status === 200 && r.body.type === 'best' && r.body.list[0].score === 100)

    /* ---------- 9. 退出登录 ---------- */
    console.log('\n[9] 退出')
    r = await req('POST', '/api/logout', {}, token)
    ok('logout → ok', r.status === 200 && r.body.ok === true)
    r = await req('GET', '/api/me', undefined, token)
    ok('旧 token 已失效 → 401', r.status === 401)
    r = await req('GET', '/api/me', undefined, token1)
    ok('未登出的 token 仍有效', r.status === 200)

    /* ---------- 10. 密码安全 ---------- */
    console.log('\n[10] 密码安全')
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(DB_FILE)
    const row = db.prepare("SELECT salt, hash FROM users WHERE username = '打卡员'").get()
    ok('库里无明文密码（hash 非原密码）', row && row.hash !== 'check123' && row.hash.length >= 64)
    ok('每用户有随机盐', row && row.salt.length === 32)
    const row2 = db.prepare("SELECT salt FROM users WHERE username = '测试员1'").get()
    ok('不同用户盐不同', row2 && row2.salt !== row.salt)
    db.close()
    /* ---------- 11. 批次⑤：限速 / 锁定粒度 / CORS / 优雅关闭 / 端口占用 ---------- */
    console.log('\n[11] 批次⑤：限速 / 锁定粒度 / CORS / 优雅关闭 / 端口占用')

    // 11.1 口令入口限速：用环境变量把阈值压到 3，绝不连打 10 次以上，也不 sleep
    const rl = await startInstance({ RATE_LIMIT_LOGIN: '3', RATE_LIMIT_REGISTER: '3', CORS_ORIGIN: null })
    const regStatus = []
    for (let i = 0; i < 4; i++) {
      regStatus.push((await reqRaw(rl.base, 'POST', '/api/register', { username: '限速员' + i, password: 'rl123456' })).status)
    }
    ok('RATE_LIMIT_REGISTER=3 生效（阈值来自环境变量）：前 3 次注册 200、第 4 次 429',
      regStatus.join(',') === '200,200,200,429', '实际 ' + regStatus.join(','))

    const loginRes = []
    for (let i = 0; i < 3; i++) {
      loginRes.push(await reqRaw(rl.base, 'POST', '/api/login', { username: '限速员0', password: 'bad' + i }))
    }
    const rateBlocked = await reqRaw(rl.base, 'POST', '/api/login', { username: '限速员0', password: 'rl123456' })
    ok('RATE_LIMIT_LOGIN=3 生效且按路由独立计数：3 次错密码 401 后第 4 次即使密码正确也 429（注册桶不串到登录桶）',
      loginRes.map(x => x.status).join(',') === '401,401,401' && rateBlocked.status === 429,
      '实际 ' + loginRes.map(x => x.status).join(',') + ' / 第 4 次 ' + rateBlocked.status +
      ' @ server/server.js:166-171')
    ok('限速 429 报文：ok:false / TOO_MANY_REQUESTS / 请求过于频繁，请稍后再试',
      rateBlocked.status === 429 && rateBlocked.body && rateBlocked.body.ok === false &&
      rateBlocked.body.error === 'TOO_MANY_REQUESTS' && rateBlocked.body.message === '请求过于频繁，请稍后再试',
      '实际 ' + rateBlocked.status + ' ' + JSON.stringify(rateBlocked.body) + ' @ server/server.js:169')

    // 11.1b 开赛限流：排行榜按 SUM(score) 累计，不限次数等于允许刷榜
    const startRl = await startInstance({ RATE_LIMIT_CONTEST_START: '2', CORS_ORIGIN: null })
    const startTok1 = (await reqRaw(startRl.base, 'POST', '/api/register', { username: '开赛员1', password: 'cs123456' })).body.token
    const startStatus = []
    for (let i = 0; i < 3; i++) {
      startStatus.push((await reqRaw(startRl.base, 'POST', '/api/contest/start', {}, startTok1)).status)
    }
    ok('RATE_LIMIT_CONTEST_START=2 生效（阈值来自环境变量）：前 2 次放行到业务校验（400 NOT_GRADUATED），第 3 次 429',
      startStatus.join(',') === '400,400,429', '实际 ' + startStatus.join(',') + ' @ server/server.js:260-267')
    const startTok2 = (await reqRaw(startRl.base, 'POST', '/api/register', { username: '开赛员2', password: 'cs123456' })).body.token
    const startOther = await reqRaw(startRl.base, 'POST', '/api/contest/start', {}, startTok2)
    ok('开赛限流另带 IP 桶：同 IP 换账号后第一场也被 429（换号绕不开刷榜）',
      startOther.status === 429 && startOther.body && startOther.body.error === 'TOO_MANY_REQUESTS',
      '实际 ' + startOther.status + ' ' + JSON.stringify(startOther.body) + ' @ server/server.js:262-266')
    ok('开赛 429 报文：ok:false / TOO_MANY_REQUESTS / 开赛过于频繁，请稍后再试',
      startOther.status === 429 && startOther.body.ok === false &&
      startOther.body.error === 'TOO_MANY_REQUESTS' && startOther.body.message === '开赛过于频繁，请稍后再试',
      '实际 ' + startOther.status + ' ' + JSON.stringify(startOther.body) + ' @ server/server.js:265')

    // 11.2 RATE_LIMIT=off 整体关闭 + 失败计数按「IP + 用户名」
    const unlocked = await startInstance({ RATE_LIMIT: 'off', RATE_LIMIT_LOGIN: '2', RATE_LIMIT_CONTEST_START: '1', CORS_ORIGIN: null })
    await reqRaw(unlocked.base, 'POST', '/api/register', { username: '锁定员', password: 'ok123456' })
    await reqRaw(unlocked.base, 'POST', '/api/register', { username: '旁观员', password: 'ok123456' })
    const wrongRes = []
    for (let i = 0; i < 5; i++) {
      wrongRes.push(await reqRaw(unlocked.base, 'POST', '/api/login', { username: '锁定员', password: 'bad' + i }))
    }
    const lockedRes = await reqRaw(unlocked.base, 'POST', '/api/login', { username: '锁定员', password: 'ok123456' })
    const otherUserRes = await reqRaw(unlocked.base, 'POST', '/api/login', { username: '旁观员', password: 'ok123456' })
    const allRes = wrongRes.concat([lockedRes, otherUserRes])
    ok('RATE_LIMIT=off 整体关闭：RATE_LIMIT_LOGIN=2 下连打 7 次口令接口也不出现 TOO_MANY_REQUESTS',
      allRes.every(x => !x.body || x.body.error !== 'TOO_MANY_REQUESTS'),
      '实际 ' + allRes.map(x => x.status + '/' + (x.body && x.body.error)).join(',') + ' @ server/server.js:76')
    ok('失败计数达 5 次后锁定：第 6 次即使密码正确也 429 / RATE_LIMITED / 失败次数过多，请 10 分钟后再试',
      wrongRes.map(x => x.status).join(',') === '401,401,401,401,401' &&
      lockedRes.status === 429 && lockedRes.body && lockedRes.body.error === 'RATE_LIMITED' &&
      lockedRes.body.message === '失败次数过多，请 10 分钟后再试',
      '实际 前5次 ' + wrongRes.map(x => x.status).join(',') + ' / 第6次 ' + lockedRes.status + ' ' +
      JSON.stringify(lockedRes.body) + ' @ server/auth.js:156-166')
    ok('锁定按「IP + 用户名」隔离：同一 IP 换个用户名密码正确仍 200（狂输别人用户名锁不死他人账号）',
      otherUserRes.status === 200 && !!(otherUserRes.body && otherUserRes.body.token),
      '实际 ' + otherUserRes.status + ' ' + JSON.stringify(otherUserRes.body && otherUserRes.body.error) +
      ' @ server/auth.js:76-78')

    const offTok = (await reqRaw(unlocked.base, 'POST', '/api/register', { username: '免限员', password: 'off123456' })).body.token
    const offStarts = []
    for (let i = 0; i < 2; i++) {
      offStarts.push(await reqRaw(unlocked.base, 'POST', '/api/contest/start', {}, offTok))
    }
    ok('RATE_LIMIT=off 一并关断开赛限次：RATE_LIMIT_CONTEST_START=1 下连开 2 场也只回 NOT_GRADUATED，不出现 TOO_MANY_REQUESTS',
      offStarts.every(x => x.body && x.body.error === 'NOT_GRADUATED'),
      '实际 ' + offStarts.map(x => x.status + '/' + (x.body && x.body.error)).join(',') + ' @ server/server.js:117')

    // 11.3 CORS 默认关闭（未设 CORS_ORIGIN，行为与改造前一致）
    const corsOff = await startInstance({ CORS_ORIGIN: null })
    const offGet = await reqRaw(corsOff.base, 'GET', '/api/health', undefined, undefined, { Origin: 'http://a.example' })
    const offPre = await reqRaw(corsOff.base, 'OPTIONS', '/api/health', undefined, undefined, { Origin: 'http://a.example' })
    ok('未设 CORS_ORIGIN：带 Origin 的 200 响应一个 CORS 头都不加（含 Vary）',
      offGet.status === 200 && !offGet.headers.get('access-control-allow-origin') &&
      !offGet.headers.get('access-control-allow-headers') && !offGet.headers.get('access-control-allow-methods') &&
      !offGet.headers.get('vary'),
      '实际 status=' + offGet.status + ' acao=' + offGet.headers.get('access-control-allow-origin') +
      ' vary=' + offGet.headers.get('vary') + ' @ server/server.js:117-126')
    ok('未设 CORS_ORIGIN：OPTIONS 不被 204 短路，继续走正常路由',
      offPre.status !== 204, '实际 ' + offPre.status + ' @ server/server.js:414-421')

    // 11.4 CORS 白名单（含被过滤的 *）
    const corsOn = await startInstance({ CORS_ORIGIN: 'http://a.example, http://b.example, *' })
    const hit = await reqRaw(corsOn.base, 'GET', '/api/health', undefined, undefined, { Origin: 'http://a.example' })
    ok('CORS 命中白名单：回 ACAO=该 Origin / Vary: Origin / 允许 Content-Type, Authorization / GET, POST, OPTIONS（绝不回 *）',
      hit.headers.get('access-control-allow-origin') === 'http://a.example' &&
      /(^|,\s*)Origin$/i.test(hit.headers.get('vary') || '') &&
      (hit.headers.get('access-control-allow-headers') || '').replace(/\s/g, '') === 'Content-Type,Authorization' &&
      (hit.headers.get('access-control-allow-methods') || '').replace(/\s/g, '') === 'GET,POST,OPTIONS',
      '实际 acao=' + hit.headers.get('access-control-allow-origin') + ' vary=' + hit.headers.get('vary') +
      ' allow-headers=' + hit.headers.get('access-control-allow-headers') +
      ' allow-methods=' + hit.headers.get('access-control-allow-methods') + ' @ server/server.js:127-132')
    const pre = await reqRaw(corsOn.base, 'OPTIONS', '/api/health', undefined, undefined, { Origin: 'http://b.example' })
    ok('CORS 预检：OPTIONS 直接回 204 且带 ACAO（不再落到鉴权分支）',
      pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'http://b.example',
      '实际 ' + pre.status + ' acao=' + pre.headers.get('access-control-allow-origin') + ' @ server/server.js:418-421')
    const miss = await reqRaw(corsOn.base, 'GET', '/api/health', undefined, undefined, { Origin: 'http://evil.example' })
    const noOrigin = await reqRaw(corsOn.base, 'GET', '/api/health')
    ok('CORS 白名单外 Origin / 完全没有 Origin：都不回 ACAO（不放通任意站点）',
      !miss.headers.get('access-control-allow-origin') && !noOrigin.headers.get('access-control-allow-origin'),
      '实际 白名单外 acao=' + miss.headers.get('access-control-allow-origin') +
      ' / 无 Origin acao=' + noOrigin.headers.get('access-control-allow-origin') + ' @ server/server.js:126')

    // 11.5 CORS_ORIGIN=* 必须被过滤（凭据走 Authorization，通配符等于全站开放）
    const corsStar = await startInstance({ CORS_ORIGIN: '*' })
    const starGet = await reqRaw(corsStar.base, 'GET', '/api/health', undefined, undefined, { Origin: 'http://a.example' })
    const starPre = await reqRaw(corsStar.base, 'OPTIONS', '/api/health', undefined, undefined, { Origin: 'http://a.example' })
    ok('CORS_ORIGIN=* 被 filter 掉：不回 ACAO（更不会回 *），预检也不短路',
      !starGet.headers.get('access-control-allow-origin') && !starPre.headers.get('access-control-allow-origin') &&
      starPre.status !== 204,
      '实际 GET acao=' + starGet.headers.get('access-control-allow-origin') + ' / OPTIONS ' + starPre.status +
      ' acao=' + starPre.headers.get('access-control-allow-origin') + ' @ server/server.js:117-120')

    // 11.6 端口被占用：真起子进程验证退出码与文案（不打印原始栈）
    const mainPort = server.address().port
    const childDb = path.join(os.tmpdir(), 'cz_test_child_' + process.pid + '.db')
    const cp = spawnSync(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
      cwd: path.join(__dirname, '..'),
      timeout: 30000,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { PORT: String(mainPort), DB_PATH: childDb })
    })
    const childErr = String(cp.stderr || '')
    ok('端口被占用：node server/server.js 以退出码 1 结束（子进程真启动验证）',
      cp.status === 1, '实际退出码 ' + cp.status + ' / stderr 末段 ' + JSON.stringify(childErr.slice(-300)) +
      ' @ server/server.js:467-471')
    ok('EADDRINUSE 文案：启动失败：端口 <port> 已被占用（EADDRINUSE）+ 换端口 / netstat 提示行',
      childErr.indexOf('启动失败：端口 ' + mainPort + ' 已被占用（EADDRINUSE）') >= 0 &&
      childErr.indexOf('换个端口：PORT=') >= 0 &&
      childErr.indexOf('netstat -ano | findstr :' + mainPort) >= 0,
      '实际 stderr=' + JSON.stringify(childErr) + ' @ server/server.js:468-470')
    ok('EADDRINUSE 不打原始栈（stderr 里没有任何 "at …" 栈帧行）',
      !/^\s+at\s/m.test(childErr), '实际 stderr=' + JSON.stringify(childErr) + ' @ server/server.js:471-473')
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(childDb + suffix) } catch (e) { /* 忽略 */ }
    }

    // 11.7 优雅关闭契约（Windows 投递不了 POSIX 信号，只能锁顺序与兜底）
    const srvSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8')
    const shHead = srvSrc.indexOf('function installShutdown(')
    const shTail = srvSrc.indexOf('function startServer(', shHead)
    const shSrc = shHead < 0 || shTail < 0 ? '' : srvSrc.slice(shHead, shTail)
    const iClear = shSrc.indexOf('clearInterval(timer)')
    const iServerClose = shSrc.indexOf('server.close(')
    const closeCallback = iServerClose < 0 ? '' : shSrc.slice(iServerClose)
    const jDbClose = closeCallback.indexOf('db.close()')
    const jDoneLog = closeCallback.indexOf('已优雅退出')
    const jExit = closeCallback.indexOf('process.exit(0)')
    ok('installShutdown 顺序：clearInterval(定时器) → server.close() → db.close() → 已优雅退出 → process.exit(0)',
      shSrc.length > 0 && iClear >= 0 && iServerClose >= 0 &&
      iClear < iServerClose && jDbClose >= 0 && jDoneLog >= 0 && jExit >= 0 &&
      jDbClose < jDoneLog && jDoneLog < jExit,
      '实际 clearInterval @ ' + atIdx('server/server.js', srvSrc, shHead + iClear) +
      ' / server.close @ ' + atIdx('server/server.js', srvSrc, shHead + iServerClose) +
      ' / db.close @ ' + atIdx('server/server.js', srvSrc, shHead + iServerClose + jDbClose) +
      ' / 已优雅退出 @ ' + atIdx('server/server.js', srvSrc, shHead + iServerClose + jDoneLog) +
      ' / exit(0) @ ' + atIdx('server/server.js', srvSrc, shHead + iServerClose + jExit))
    ok('installShutdown 契约：SIGTERM 与 SIGINT 都注册 / 5s 强制退出兜底且 unref / 断开 keep-alive / 重入保护',
      shSrc.indexOf("process.on('SIGTERM'") >= 0 && shSrc.indexOf("process.on('SIGINT'") >= 0 &&
      /setTimeout\(\(\) => \{[\s\S]{0,160}?\}, 5000\)/.test(shSrc) &&
      shSrc.indexOf('force.unref()') >= 0 &&
      shSrc.indexOf('server.closeIdleConnections()') >= 0 &&
      shSrc.indexOf('if (shuttingDown) return') >= 0,
      '实际 缺项排查 SIGTERM=' + (shSrc.indexOf("process.on('SIGTERM'") >= 0) +
      ' SIGINT=' + (shSrc.indexOf("process.on('SIGINT'") >= 0) +
      ' 5000兜底=' + /setTimeout\(\(\) => \{[\s\S]{0,160}?\}, 5000\)/.test(shSrc) +
      ' unref=' + (shSrc.indexOf('force.unref()') >= 0) +
      ' closeIdle=' + (shSrc.indexOf('server.closeIdleConnections()') >= 0) +
      ' 重入保护=' + (shSrc.indexOf('if (shuttingDown) return') >= 0) +
      ' @ ' + atIdx('server/server.js', srvSrc, shHead))
    const iRecv = shSrc.indexOf('开始优雅关闭')
    ok('优雅关闭日志：先打「收到 <signal>，开始优雅关闭…」再动手，退出前打「已优雅退出」',
      iRecv >= 0 && iRecv < iClear && shSrc.indexOf("'已优雅退出'") >= 0,
      '实际 收到信号日志 @ ' + atIdx('server/server.js', srvSrc, shHead + iRecv) +
      ' 早于 clearInterval 吗=' + (iRecv >= 0 && iRecv < iClear) + ' @ server/server.js:364')

    /* ---------- 12. 批次⑥：favicon 收尾 ---------- */
    console.log('\n[12] 批次⑥：favicon / 静态资源收尾')
    const favRes = await fetch(BASE + '/favicon.svg')
    const favType = favRes.headers.get('content-type') || ''
    const favText = await favRes.text()
    ok('GET /favicon.svg → 200 且 content-type 含 image/svg+xml（不再落到 404 / 空图标）',
      favRes.status === 200 && favType.indexOf('image/svg+xml') >= 0,
      '实际 ' + favRes.status + ' / content-type=' + JSON.stringify(favType))

    const favDisk = fs.readFileSync(path.join(__dirname, '..', 'favicon.svg'), 'utf8')
    const favN = favText.replace(/\r\n/g, '\n')
    const favSame = favN === favDisk.replace(/\r\n/g, '\n')
    ok('favicon.svg 下发正文与磁盘文件逐字节一致，且是带 viewBox 的 <svg>（真资源，不是占位）',
      favDisk.length > 0 && favSame &&
      favN.trimStart().indexOf('<svg') === 0 && favN.indexOf('viewBox="') > 0,
      '实际 字节数=' + Buffer.byteLength(favText) + ' 起始<svg=' + (favN.trimStart().indexOf('<svg') === 0) +
      ' 含viewBox=' + (favN.indexOf('viewBox="') > 0) + ' 与磁盘一致=' + favSame)

    const idxSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
    const idxN = idxSrc.replace(/\r\n/g, '\n')
    const iIcon = idxN.indexOf('<link rel="icon" type="image/svg+xml" href="favicon.svg">')
    const iHeadEnd = idxN.indexOf('</head>')
    const iMime = srvSrc.indexOf("'.svg': 'image/svg+xml'")
    const iAllow = srvSrc.indexOf('favicon.svg')
    ok('源码契约：index.html <head> 内声明 svg favicon，server.js 的 MIME 表与静态白名单都放行 favicon.svg',
      iIcon >= 0 && iHeadEnd > 0 && iIcon < iHeadEnd && iMime >= 0 && iAllow >= 0,
      '实际 link @ ' + (iIcon < 0 ? 'index.html:(未找到该代码)' : atIdx('index.html', idxN, iIcon)) +
      ' 在 </head> 前吗=' + (iIcon >= 0 && iIcon < iHeadEnd) +
      ' / .svg MIME @ ' + (iMime < 0 ? 'server/server.js:(未找到该代码)' : atIdx('server/server.js', srvSrc, iMime)) +
      ' / 白名单 @ ' + (iAllow < 0 ? 'server/server.js:(未找到该代码)' : atIdx('server/server.js', srvSrc, iAllow)))


    /* ---------- 13. 批次⑦：静态压缩协商 / 304 / 缓存策略分层 ---------- */
    console.log('\n[13] 批次⑦：静态压缩协商 / 304 / 缓存策略分层')
    // 裸 http：fetch 会自动解压，量不到线上真实字节；这里的断言全看传输层
    const nodeHttp = require('node:http')
    const nodeZlib = require('node:zlib')
    const statOf = rel => fs.statSync(path.join(__dirname, '..', rel))
    const BASE_URL = new URL(BASE)
    const rawReq = (method, p, headers) => new Promise((resolve, reject) => {
      const r2 = nodeHttp.request({
        host: BASE_URL.hostname, port: BASE_URL.port, path: p, method, headers: headers || {}
      }, res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }))
      })
      r2.on('error', reject)
      r2.end()
    })
    const rawGet = (p, headers) => rawReq('GET', p, headers)

    // 13.1 gzip 协商三态（style.css 73,395 B，远超 1 KB 阈值）
    const cssRaw = statOf('css/style.css').size
    const cssGz = await rawGet('/css/style.css', { 'Accept-Encoding': 'gzip' })
    ok('gzip 协商：Accept-Encoding: gzip → 200 + Content-Encoding: gzip + Vary: Accept-Encoding + Content-Length=压缩后字节',
      cssGz.status === 200 && cssGz.headers['content-encoding'] === 'gzip' &&
      /accept-encoding/i.test(cssGz.headers.vary || '') &&
      Number(cssGz.headers['content-length']) === cssGz.bytes.length &&
      nodeZlib.gunzipSync(cssGz.bytes).length === cssRaw,
      '实际 ' + cssGz.status + ' ce=' + cssGz.headers['content-encoding'] + ' vary=' + cssGz.headers.vary +
      ' cl=' + cssGz.headers['content-length'] + ' 实收=' + cssGz.bytes.length)
    ok('压缩率实测：css/style.css ' + cssRaw + ' B → ' + cssGz.bytes.length + ' B（' +
      (cssGz.bytes.length / cssRaw * 100).toFixed(1) + '%）',
      cssGz.bytes.length < cssRaw * 0.5, '实际 压缩后 ' + cssGz.bytes.length + ' / 原始 ' + cssRaw)

    const cssQ0 = await rawGet('/css/style.css', { 'Accept-Encoding': 'gzip;q=0' })
    ok('gzip 否定①：Accept-Encoding: gzip;q=0 → 未压缩（无 Content-Encoding，Content-Length=原始字节）',
      cssQ0.status === 200 && !cssQ0.headers['content-encoding'] &&
      Number(cssQ0.headers['content-length']) === cssRaw && cssQ0.bytes.length === cssRaw,
      '实际 ce=' + cssQ0.headers['content-encoding'] + ' cl=' + cssQ0.headers['content-length'] +
      ' 实收=' + cssQ0.bytes.length + ' @ server/server.js:399-421')

    const cssNone = await rawGet('/css/style.css')
    ok('gzip 否定②：完全不发 Accept-Encoding → 未压缩',
      !cssNone.headers['content-encoding'] && cssNone.bytes.length === cssRaw,
      '实际 ce=' + cssNone.headers['content-encoding'] + ' 实收=' + cssNone.bytes.length)

    // 13.2 ETag / Last-Modified / 304（无响应体）
    const etag = cssNone.headers.etag
    const lastMod = cssNone.headers['last-modified']
    ok('200 首访带强校验：ETag 形如 "<size>-<mtime>" 且 Last-Modified 是合法 HTTP 日期',
      !!etag && /^"[0-9a-f]+-[0-9a-f]+"$/.test(etag) && !!lastMod && Number.isFinite(Date.parse(lastMod)),
      '实际 etag=' + etag + ' last-modified=' + lastMod)

    const inm = await rawGet('/css/style.css', { 'If-None-Match': etag })
    ok('If-None-Match 命中 → 304 且响应体 0 字节', inm.status === 304 && inm.bytes.length === 0,
      '实际 ' + inm.status + ' 体=' + inm.bytes.length)
    ok('304 仍带 ETag / Cache-Control / Vary（Content-Length 可省，但不许带体）',
      inm.headers.etag === etag && inm.headers['cache-control'] === 'no-cache' &&
      /accept-encoding/i.test(inm.headers.vary || '') && Number(inm.headers['content-length'] || 0) === 0,
      '实际 etag=' + inm.headers.etag + ' cc=' + inm.headers['cache-control'] + ' vary=' + inm.headers.vary +
      ' cl=' + inm.headers['content-length'])

    const ims = await rawGet('/css/style.css', { 'If-Modified-Since': lastMod })
    ok('If-Modified-Since 命中 → 304 且 0 字节', ims.status === 304 && ims.bytes.length === 0,
      '实际 ' + ims.status + ' 体=' + ims.bytes.length)

    const inmMiss = await rawGet('/css/style.css', { 'If-None-Match': '"deadbeef-1"' })
    ok('If-None-Match 不命中 → 200 全量（不会误判 304）',
      inmMiss.status === 200 && inmMiss.bytes.length === cssRaw, '实际 ' + inmMiss.status + ' 体=' + inmMiss.bytes.length)

    const stale = await rawGet('/css/style.css', { 'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT' })
    ok('If-Modified-Since 早于 mtime → 200 全量', stale.status === 200 && stale.bytes.length === cssRaw,
      '实际 ' + stale.status + ' 体=' + stale.bytes.length)

    // 13.3 已压缩二进制不压（压了反而更大，用实测数字说话）
    const fontName = fs.readdirSync(path.join(__dirname, '..', 'fonts')).filter(f => f.endsWith('.woff2')).sort()[0]
    const fontPath = '/fonts/' + fontName
    const fontDisk = statOf('fonts/' + fontName).size
    const fontRes = await rawGet(fontPath, { 'Accept-Encoding': 'gzip' })
    ok('字体 woff2 不压：AE=gzip 也原样下发（无 Content-Encoding，Content-Length=磁盘字节）',
      fontRes.status === 200 && !fontRes.headers['content-encoding'] &&
      Number(fontRes.headers['content-length']) === fontDisk && fontRes.bytes.length === fontDisk,
      '实际 ' + fontRes.status + ' ce=' + fontRes.headers['content-encoding'] + ' 实收=' + fontRes.bytes.length +
      ' 磁盘=' + fontDisk + ' @ ' + fontPath)

    const pngDisk = statOf('assets/map3d/heightmap.png').size
    const pngGzSize = nodeZlib.gzipSync(fs.readFileSync(path.join(__dirname, '..', 'assets', 'map3d', 'heightmap.png'))).length
    const pngRes = await rawGet('/assets/map3d/heightmap.png', { 'Accept-Encoding': 'gzip' })
    ok('heightmap.png 不压，且实测 gzip 后反而更大（' + pngDisk + ' B → ' + pngGzSize + ' B，+' +
      (pngGzSize / pngDisk * 100 - 100).toFixed(1) + '%）',
      !pngRes.headers['content-encoding'] && pngRes.bytes.length === pngDisk && pngGzSize > pngDisk,
      '实际 ce=' + pngRes.headers['content-encoding'] + ' 实收=' + pngRes.bytes.length + ' gzip后=' + pngGzSize)

    // 13.4 1 KB 阈值
    const svgDisk = statOf('favicon.svg').size
    const svgRes = await rawGet('/favicon.svg', { 'Accept-Encoding': 'gzip' })
    ok('gzip 阈值：' + svgDisk + ' B 的 favicon.svg 低于 1024 B 不压（但仍有 ETag + Vary）',
      !svgRes.headers['content-encoding'] && svgRes.bytes.length === svgDisk &&
      !!svgRes.headers.etag && /accept-encoding/i.test(svgRes.headers.vary || ''),
      '实际 ce=' + svgRes.headers['content-encoding'] + ' 实收=' + svgRes.bytes.length)

    // 13.5 缓存策略分层
    const cc = async p => (await rawGet(p)).headers['cache-control']
    const ccCss = await cc('/css/style.css')
    const ccHtml = await cc('/index.html')
    const ccJs = await cc('/js/api.js')
    ok('缓存分层①：html / css / js 维持 no-cache（靠 ETag 走 304，向后兼容）',
      ccCss === 'no-cache' && ccHtml === 'no-cache' && ccJs === 'no-cache',
      '实际 css=' + ccCss + ' html=' + ccHtml + ' js=' + ccJs)
    const ccFont = await cc(fontPath)
    ok('缓存分层②：fonts/*.woff2（文件名带内容哈希）→ public, max-age=31536000, immutable',
      ccFont === 'public, max-age=31536000, immutable', '实际 ' + ccFont + ' @ ' + fontPath)
    const ccPng = await cc('/assets/map3d/heightmap.png')
    const ccMapJson = await cc('/assets/map3d/heightmap.json')
    ok('缓存分层③：assets/map3d 无哈希文件名 → public, max-age=86400，绝不给 immutable',
      ccPng === 'public, max-age=86400' && ccMapJson === 'public, max-age=86400',
      '实际 heightmap.png=' + ccPng + ' heightmap.json=' + ccMapJson)

    // 13.6 白名单不回潮（裸 http 复测，与 [1] 互为交叉证据）
    const deniedCodes = []
    for (const denied of ['/server/data.db', '/server/question-bank.json', '/.git/config',
      '/scripts/test-api.js', '/README.md']) {
      deniedCodes.push((await rawGet(denied)).status)
    }
    const allowCodes = []
    for (const allowed of ['/js/api.js', '/css/style.css', '/index.html', '/favicon.svg']) {
      allowCodes.push((await rawGet(allowed)).status)
    }
    const trav = await rawGet('/../server/data.db')
    const badEnc = await rawGet('/%zz')
    ok('白名单不回潮：5 个敏感路径全 404 / 4 个白名单资源全 200 / 穿越 403 / %zz 400',
      deniedCodes.join(',') === '404,404,404,404,404' && allowCodes.join(',') === '200,200,200,200' &&
      trav.status === 403 && badEnc.status === 400,
      '实际 404组=' + deniedCodes.join(',') + ' 200组=' + allowCodes.join(',') +
      ' 穿越=' + trav.status + ' %zz=' + badEnc.status)

    const headRes = await rawReq('HEAD', '/css/style.css')
    ok('HEAD 保持改造前语义（405，本次没有新引入 HEAD 分支）', headRes.status === 405, '实际 ' + headRes.status)


  } finally {
    for (const s of extraServers) {
      try { s.close() } catch (e) { /* 已关闭 */ }
    }
    server.close()
    // 清理测试数据库
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(DB_FILE + suffix) } catch (e) { /* 忽略 */ }
    }
  }

  console.log('\n' + '='.repeat(40))
  console.log('API 测试结果: ' + passed + ' 通过 / ' + failed + ' 失败')
  if (failed > 0) process.exit(1)
}

main().catch(e => {
  console.error('测试执行异常:', e)
  process.exit(1)
})