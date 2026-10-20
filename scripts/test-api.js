/**
 * 后端 API 全链路测试 —— node scripts/test-api.js
 * 起真实服务（随机端口 + 临时数据库），用 fetch 打接口逐项断言
 */
'use strict'

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const assert = require('node:assert')

const DB_FILE = path.join(os.tmpdir(), 'cz_test_' + process.pid + '.db')
process.env.DB_PATH = DB_FILE

const mockQuestions = require('../js/mock/questions')

const { startServer } = require('../server/server')

let BASE = ''
let passed = 0
let failed = 0

function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name) }
  else { failed++; console.log('  ✗ ' + name + (extra ? ' —— ' + extra : '')) }
}

async function req(method, p, body, token) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  if (token) opts.headers['Authorization'] = 'Bearer ' + token
  const res = await fetch(BASE + p, opts)
  let json = null
  try { json = await res.json() } catch (e) { /* 非 JSON 响应 */ }
  return { status: res.status, body: json }
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
  } finally {
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
