/**
 * 网页版验证（node 环境跑，无需浏览器）
 *   1. 数据一致性：11 节点 / 43 题 / 引用有效 / 答案不越界 / 题型格式
 *   2. 全链路：未打卡取题被拒 → 打卡 → 取题无答案泄露 → 判分 → 进度 → final 毕业
 * 运行：node web/scripts/test-web.js
 */
const assert = require('assert')
// 强制 mock 模式（config.USE_MOCK 当前指向后端模式；本测试验证 mock 数据与链路）
const config = require('../js/config')
config.USE_MOCK = true
const api = require('../js/api')
const progress = require('../js/progress')
const nodes = require('../js/mock/nodes')
const questions = require('../js/mock/questions')

let passed = 0
function ok(name) {
  passed++
  console.log('  ✓ ' + name)
}

/* ================= 1. 数据一致性 ================= */

console.log('[1] 数据一致性')

assert.strictEqual(nodes.length, 11, '节点数应为 11')
nodes.forEach((n, i) => assert.strictEqual(n.order, i + 1, n.code + ' order 应连续'))
assert.strictEqual(new Set(nodes.map(n => n.code)).size, 11, '节点 code 应唯一')
for (const n of nodes) {
  const loc = n.location
  assert(loc.longitude > 70 && loc.longitude < 140, n.code + ' 经度越界')
  assert(loc.latitude > 15 && loc.latitude < 55, n.code + ' 纬度越界')
}
ok('11 节点 order 连续 / code 唯一 / 经纬度有效')

assert.strictEqual(questions.length, 43, '题目总数应为 43')
assert.strictEqual(new Set(questions.map(q => q._id)).size, 43, '题目 _id 应唯一')
ok('43 题 _id 唯一')

for (const n of nodes) {
  assert.strictEqual(n.quiz.questionIds.length, n.quiz.questionCount, n.code + ' questionIds 与 questionCount 不符')
  assert.strictEqual(questions.filter(q => q.nodeCode === n.code).length, 3, n.code + ' 应恰有 3 题')
  for (const qid of n.quiz.questionIds) {
    const q = questions.find(x => x._id === qid)
    assert(q, n.code + ' 引用无效题目 ' + qid)
    assert.strictEqual(q.nodeCode, n.code, qid + ' nodeCode 与引用不符')
  }
}
assert.strictEqual(questions.filter(q => q.nodeCode === 'final').length, 10, 'final 池应为 10 题')
ok('questionIds 引用有效 / 每节点 3 题 / final 池 10 题')

for (const q of questions) {
  assert(Array.isArray(q.answer) && q.answer.length >= 1, q._id + ' answer 应为非空数组')
  for (const a of q.answer) assert(a >= 0 && a < q.options.length, q._id + ' 答案下标越界')
  if (q.type === 'single' || q.type === 'judge') assert.strictEqual(q.answer.length, 1, q._id + ' 单选/判断只应 1 个答案')
  if (q.type === 'judge') {
    assert.deepStrictEqual(q.options, ['正确', '错误'], q._id + ' 判断题 options 格式错误')
  }
  assert(q.type === 'single' || q.type === 'multiple' || q.type === 'judge', q._id + ' type 非法')
}
ok('answer 不越界 / 题型格式正确')

/* ================= 2. 全链路 ================= */

async function chain() {
  console.log('[2] 全链路')

  // 未打卡取题被拒
  let r = await api.getQuiz('node', 'ruijin')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error, 'NOT_CHECKED_IN')
  ok('未打卡取题被拒（NOT_CHECKED_IN）')

  // final 未全打卡被拒
  r = await api.getQuiz('final')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error, 'NOT_ALL_CHECKED_IN')
  ok('final 未解锁被拒（NOT_ALL_CHECKED_IN）')

  // 依次打卡 11 节点
  for (const n of nodes) {
    r = await api.checkin(n.code)
    assert.strictEqual(r.ok, true, n.code + ' 打卡失败')
    assert.strictEqual(r.alreadyChecked, false)
  }
  r = await api.checkin('ruijin')
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.alreadyChecked, true)
  ok('11 节点依次打卡 + 重复打卡幂等')

  // 取题无答案泄露
  r = await api.getQuiz('node', 'ruijin')
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.questions.length, 3)
  for (const q of r.questions) {
    assert(!('answer' in q), 'answer 字段泄露')
    assert(!('explanation' in q), 'explanation 字段泄露')
  }
  ok('取题无答案泄露（answer/explanation 已剥离）')

  // 判分：错一题 67 分
  const qs = r.questions
  const answersWithOneWrong = qs.map((q, i) => {
    const full = questions.find(x => x._id === q.id)
    if (i === 0) return { id: q.id, answer: [(full.answer[0] + 1) % full.options.length] }
    return { id: q.id, answer: full.answer }
  })
  r = await api.submitQuiz('node', 'ruijin', answersWithOneWrong)
  assert.strictEqual(r.score, 67)
  assert.strictEqual(r.passed, true)
  assert.strictEqual(r.correctCount, 2)
  ok('错一题 67 分 / 及格判定正确')

  // 全对 → 100，best=100
  r = await api.submitQuiz('node', 'ruijin', qs.map(q => ({
    id: q.id, answer: questions.find(x => x._id === q.id).answer
  })))
  assert.strictEqual(r.score, 100)
  assert.strictEqual(r.best, 100)
  assert.strictEqual(r.attempts, 2)
  ok('全对 100 分 / best 与 attempts 累计')

  // 全错 → 0 分，best 保持 100，passed 保持 true
  r = await api.submitQuiz('node', 'ruijin', qs.map(q => ({ id: q.id, answer: [99] })))
  assert.strictEqual(r.score, 0)
  assert.strictEqual(r.passed, false)
  assert.strictEqual(r.best, 100)
  ok('全错 0 分 / best 保持 100 / passed 不回落')

  // 进度与流水
  const p = await api.getProgress()
  assert.strictEqual(Object.keys(p.checkins).length, 11)
  assert.strictEqual(p.quizScores.ruijin.passed, true)
  assert.strictEqual(p.quizScores.ruijin.best, 100)
  const flow = await api.getCheckins()
  assert.strictEqual(flow.length, 11)
  ok('进度 11 打卡 / ruijin 通关 / 流水 11 条')

  // final 毕业链路
  r = await api.getQuiz('final')
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.questions.length, 10)
  for (const q of r.questions) assert(!('answer' in q), 'final 题目答案泄露')
  r = await api.submitQuiz('final', null, r.questions.map(q => ({
    id: q.id, answer: questions.find(x => x._id === q.id).answer
  })))
  assert.strictEqual(r.score, 100)
  assert.strictEqual(r.isFinalPassed, true)
  const p2 = await api.getProgress()
  assert.strictEqual(p2.finalExam.passed, true)
  assert.strictEqual(p2.finalExam.best, 100)
  ok('final 满分毕业 / 毕业状态写入')

  // 状态机最终态
  const st = progress.computeStates(nodes, p2, { sequentialUnlock: false })
  assert.strictEqual(st.finalState, 'passed')
  assert.strictEqual(st.checkedCount, 11)
  assert.strictEqual(st.passedCount, 1)
  assert.strictEqual(st.byCode.ruijin.state, 'quizPassed')
  assert.strictEqual(st.byCode.xiangjiang.state, 'checkedIn')
  ok('状态机：finalState=passed / 各节点状态正确')

  // 顺序模式（独立空进度）
  const empty = { checkins: {}, quizScores: {}, finalExam: {} }
  const st2 = progress.computeStates(nodes, empty, { sequentialUnlock: true })
  assert.strictEqual(st2.byCode.ruijin.state, 'open')
  assert.strictEqual(st2.byCode.xiangjiang.state, 'locked')
  const half = { checkins: { ruijin: 1 }, quizScores: {}, finalExam: {} }
  const st3 = progress.computeStates(nodes, half, { sequentialUnlock: true })
  assert.strictEqual(st3.byCode.xiangjiang.state, 'open')
  ok('顺序模式：首节点 open / 后续 locked → 打卡后解锁')
}

chain().then(() => {
  console.log('\nALL PASSED（' + passed + ' 项）')
}).catch(err => {
  console.error('\nFAILED:', err.message)
  process.exit(1)
})
