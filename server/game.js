/**
 * 业务逻辑 —— 打卡 / 取题 / 判分（与前端 api.js mock 分支 1:1 同构）
 * 关键安全点：getQuiz 剥离 answer/explanation（答案永不下发），判分只在服务端
 */
'use strict'

const mockNodes = require('../js/mock/nodes')
const mockQuestions = require('../js/mock/questions')
const { computeStates } = require('../js/progress')

/* ---------- 内容读取 ---------- */

function getConfigDoc() {
  return {
    _id: 'global',
    sequentialUnlock: false,
    requireReadBeforeCheckin: true,
    defaultPassScore: 60,
    finalExam: { questionCount: 10, passScore: 60, timeoutMs: 3 * 60 * 1000, title: '长征知识总结答题' },
    contest: { questionCount: 10, pointsPerQuestion: 5, timeoutMs: 30 * 60 * 1000, title: '长征知识竞赛' },
    theme: { primary: '#C8102E', gold: '#D4A017' }
  }
}

function getPublishedNodes() {
  return mockNodes
    .filter(n => n.status === 'published')
    .sort((a, b) => a.order - b.order)
}

/* ---------- 进度读写 ---------- */

function emptyProgress() {
  return {
    checkins: {},
    quizScores: {},
    finalExam: { attempts: 0, best: 0, passed: false, lastTime: null },
    stats: { correctCount: 0, totalCount: 0 }
  }
}

function loadProgress(db, userId) {
  const row = db.prepare('SELECT checkins, quiz_scores, final_exam, stats FROM progress WHERE user_id = ?').get(userId)
  if (!row) return emptyProgress()
  return {
    checkins: JSON.parse(row.checkins),
    quizScores: JSON.parse(row.quiz_scores),
    finalExam: JSON.parse(row.final_exam),
    stats: row.stats ? JSON.parse(row.stats) : { correctCount: 0, totalCount: 0 }
  }
}

function saveProgress(db, userId, p) {
  db.prepare(`
    INSERT INTO progress (user_id, checkins, quiz_scores, final_exam, stats, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      checkins = excluded.checkins,
      quiz_scores = excluded.quiz_scores,
      final_exam = excluded.final_exam,
      stats = excluded.stats,
      updated_at = excluded.updated_at
  `).run(userId,
    JSON.stringify(p.checkins),
    JSON.stringify(p.quizScores),
    JSON.stringify(p.finalExam),
    JSON.stringify(p.stats || { correctCount: 0, totalCount: 0 }),
    Date.now())
}

/* ---------- 打卡 ---------- */

function doCheckin(db, userId, code) {
  const cfg = getConfigDoc()
  const nodes = getPublishedNodes()
  const p = loadProgress(db, userId)
  const states = computeStates(nodes, p, cfg)
  const st = states.byCode[code]

  if (!st) return { ok: false, error: 'NODE_NOT_FOUND', message: '节点不存在' }
  if (st.state === 'locked') return { ok: false, error: 'PREV_NOT_CHECKED_IN', message: '需先完成上一节点打卡' }
  if (st.state === 'checkedIn' || st.state === 'quizPassed') {
    return { ok: true, alreadyChecked: true, progress: p }
  }

  p.checkins[code] = Date.now()
  saveProgress(db, userId, p)

  const node = nodes.find(n => n.code === code)
  db.prepare('INSERT INTO checkin_logs (user_id, node_code, node_name, node_order, time) VALUES (?, ?, ?, ?, ?)')
    .run(userId, code, node.name, node.order, Date.now())

  return { ok: true, alreadyChecked: false, progress: p }
}

/* ---------- 下发记录（本场题目快照，进程内 Map，带 TTL） ---------- */

const ATTEMPT_TTL_MS = 30 * 60 * 1000

// key: userId|mode|code -> { ids: string[], time: number }
// 唯一可信的「本场下发了哪几道题」来源；同 key 再次取题即覆盖（以最新一次为准）
const attempts = new Map()

function attemptKey(userId, mode, code) {
  return String(userId) + '|' + String(mode) + '|' + String(code || '')
}

function pruneAttempts(now) {
  for (const [key, item] of attempts) {
    if (now - item.time > ATTEMPT_TTL_MS) attempts.delete(key)
  }
}

function recordAttempt(userId, mode, code, ids) {
  const now = Date.now()
  pruneAttempts(now)
  attempts.set(attemptKey(userId, mode, code), { ids: [...ids], time: now })
}

function readAttempt(userId, mode, code) {
  const key = attemptKey(userId, mode, code)
  const item = attempts.get(key)
  if (!item) return null
  if (Date.now() - item.time > ATTEMPT_TTL_MS) {
    attempts.delete(key)
    return null
  }
  return item
}

/* ---------- 取题（答案不下发） ---------- */

function stripAnswers(qs) {
  return qs.map(q => ({ id: q._id, type: q.type, question: q.question, options: q.options }))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getQuiz(db, userId, mode, code) {
  const cfg = getConfigDoc()
  const nodes = getPublishedNodes()
  const p = loadProgress(db, userId)
  const states = computeStates(nodes, p, cfg)

  if (mode === 'node') {
    const st = states.byCode[code]
    if (!st) return { ok: false, error: 'NODE_NOT_FOUND', message: '节点不存在' }
    if (st.state === 'locked') return { ok: false, error: 'PREV_NOT_CHECKED_IN', message: '顺序未到' }
    if (st.state === 'open') return { ok: false, error: 'NOT_CHECKED_IN', message: '尚未打卡' }
    const node = nodes.find(n => n.code === code)
    const qs = mockQuestions.filter(q => q.nodeCode === code && q.status === 'published')
    recordAttempt(userId, mode, code, qs.map(q => q._id))
    return {
      ok: true,
      meta: {
        title: node.name + ' · 答题关卡',
        subtitle: '共' + qs.length + '题，答对 ' + Math.ceil(qs.length * node.quiz.passScore / 100) + ' 题即通关',
        questionCount: qs.length,
        passScore: node.quiz.passScore
      },
      questions: stripAnswers(qs)
    }
  }

  // mode === final
  if (states.finalState === 'locked') return { ok: false, error: 'NOT_ALL_CHECKED_IN', message: '打卡全部节点后解锁' }
  // 题目来源改为 11 个节点的关卡题（覆盖全部知识点），不再用 final 占位题
  const pool = mockQuestions.filter(q => q.nodeCode !== 'final' && q.status === 'published')
  const n = Math.min(cfg.finalExam.questionCount, pool.length)
  const picked = pickAcrossNodes(pool, n)
  recordAttempt(userId, mode, code, picked.map(q => q._id))
  return {
    ok: true,
    meta: {
      title: cfg.finalExam.title,
      subtitle: '共' + n + '题，得分 ' + cfg.finalExam.passScore + ' 分以上毕业，限时 ' + Math.round((cfg.finalExam.timeoutMs || 180000) / 60000) + ' 分钟',
      questionCount: n,
      passScore: cfg.finalExam.passScore
    },
    questions: stripAnswers(picked)
  }
}

/**
 * 毕业考抽题：从 11 个节点的题目里抽，先保证每个节点各出 1 题（覆盖广度），
 * 不够再随机补 —— 这样每次点开都是不同组合，也不会连着抽到同一节点的题。
 */
function pickAcrossNodes(pool, n) {
  const byNode = {}
  pool.forEach(q => {
    const k = q.nodeCode || 'other'
    ;(byNode[k] = byNode[k] || []).push(q)
  })
  const codes = shuffle(Object.keys(byNode))
  const out = []
  for (let i = 0; i < codes.length && out.length < n; i++) {
    out.push(shuffle(byNode[codes[i]])[0])
  }
  if (out.length < n) {
    const used = {}
    out.forEach(q => { used[q._id || q.id] = 1 })
    const rest = shuffle(pool.filter(q => !used[q._id || q.id]))
    let k = 0
    while (out.length < n && k < rest.length) out.push(rest[k++])
  }
  return shuffle(out)
}

/* ---------- 判分 ---------- */

function sameSet(a, b) {
  if (!a || !b || a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function submitQuiz(db, userId, mode, code, answers) {
  const cfg = getConfigDoc()
  const nodes = getPublishedNodes()
  const p = loadProgress(db, userId)
  const states = computeStates(nodes, p, cfg)

  if (mode === 'node' && !['checkedIn', 'quizPassed'].includes(states.byCode[code] && states.byCode[code].state)) {
    return { ok: false, error: 'NOT_CHECKED_IN', message: '尚未打卡' }
  }
  if (mode === 'final' && states.finalState === 'locked') {
    return { ok: false, error: 'NOT_ALL_CHECKED_IN', message: '打卡全部节点后解锁' }
  }

  // 只认服务端下发集合：没有下发记录、条数不符、id 集合不等、有重复 —— 一律不计分不写进度
  const attempt = readAttempt(userId, mode, code)
  if (!attempt) return { ok: false, error: 'ATTEMPT_NOT_FOUND', message: '请先取题再交卷' }

  const list = Array.isArray(answers) ? answers : []
  const ids = list.map(a => (a && a.id !== undefined ? a.id : null))
  if (!list.length) {
    return { ok: false, error: 'INVALID_ANSWER_SET', message: '答案不能为空' }
  }
  if (new Set(ids).size !== ids.length || !sameSet(ids, attempt.ids)) {
    return { ok: false, error: 'INVALID_ANSWER_SET', message: '答案与本次下发的题目不一致' }
  }

  // 只判下发集合内的题，且按下发顺序逐题判
  const answered = new Map(list.map(a => [a.id, a]))
  const results = attempt.ids.map(id => {
    const q = mockQuestions.find(x => x._id === id)
    const a = answered.get(id)
    const correct = !!(q && a && sameSet(q.answer, a.answer))
    return {
      id, correct,
      question: q ? q.question : '', options: q ? q.options : [],
      correctAnswer: q ? q.answer : [], explanation: q ? q.explanation : ''
    }
  })
  const correctCount = results.filter(r => r.correct).length
  const total = attempt.ids.length
  const score = Math.round(correctCount / total * 100)
  const node = nodes.find(n => n.code === code)
  const passScore = mode === 'final'
    ? cfg.finalExam.passScore
    : (node && node.quiz && node.quiz.passScore) || cfg.defaultPassScore
  const passed = score >= passScore

  // 学习统计累计（兼容旧数据无 stats 字段）
  p.stats = p.stats || { correctCount: 0, totalCount: 0 }
  p.stats.correctCount += correctCount
  p.stats.totalCount += total

  if (mode === 'final') {
    p.finalExam.attempts = (p.finalExam.attempts || 0) + 1
    p.finalExam.best = Math.max(p.finalExam.best || 0, score)
    p.finalExam.passed = p.finalExam.passed || passed
    p.finalExam.lastTime = Date.now()
  } else {
    const prev = p.quizScores[code] || { attempts: 0, best: 0, passed: false, lastTime: 0 }
    p.quizScores[code] = {
      attempts: prev.attempts + 1,
      best: Math.max(prev.best, score),
      passed: prev.passed || passed,
      lastTime: Date.now()
    }
  }
  saveProgress(db, userId, p)

  return {
    ok: true, score, passed, correctCount, total,
    results,
    best: mode === 'final' ? p.finalExam.best : p.quizScores[code].best,
    attempts: mode === 'final' ? p.finalExam.attempts : p.quizScores[code].attempts,
    isFinalPassed: mode === 'final' && passed
  }
}

/* ---------- 足迹 / 昵称 ---------- */

function getCheckinLogs(db, userId) {
  return db.prepare(
    'SELECT node_code AS nodeCode, node_name AS nodeName, node_order AS "order", time FROM checkin_logs WHERE user_id = ? ORDER BY time DESC'
  ).all(userId).map(r => ({ nodeCode: r.nodeCode, nodeName: r.nodeName, order: r.order, time: r.time }))
}

function saveNickname(db, userId, nickname) {
  nickname = String(nickname || '').trim().slice(0, 20)
  if (!nickname) return { ok: false, error: 'INVALID_NICKNAME', message: '昵称不能为空' }
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, userId)
  return { ok: true, nickname }
}

module.exports = {
  getConfigDoc,
  getPublishedNodes,
  loadProgress,
  saveProgress,
  doCheckin,
  getQuiz,
  submitQuiz,
  getCheckinLogs,
  saveNickname,
  emptyProgress
}
