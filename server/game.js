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
    finalExam: { questionCount: 10, passScore: 60, title: '长征知识总结答题' },
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
  return { checkins: {}, quizScores: {}, finalExam: { attempts: 0, best: 0, passed: false, lastTime: null } }
}

function loadProgress(db, userId) {
  const row = db.prepare('SELECT checkins, quiz_scores, final_exam FROM progress WHERE user_id = ?').get(userId)
  if (!row) return emptyProgress()
  return {
    checkins: JSON.parse(row.checkins),
    quizScores: JSON.parse(row.quiz_scores),
    finalExam: JSON.parse(row.final_exam)
  }
}

function saveProgress(db, userId, p) {
  db.prepare(`
    INSERT INTO progress (user_id, checkins, quiz_scores, final_exam, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      checkins = excluded.checkins,
      quiz_scores = excluded.quiz_scores,
      final_exam = excluded.final_exam,
      updated_at = excluded.updated_at
  `).run(userId, JSON.stringify(p.checkins), JSON.stringify(p.quizScores), JSON.stringify(p.finalExam), Date.now())
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
  const pool = mockQuestions.filter(q => q.nodeCode === 'final' && q.status === 'published')
  const n = Math.min(cfg.finalExam.questionCount, pool.length)
  const picked = shuffle(pool).slice(0, n)
  return {
    ok: true,
    meta: {
      title: cfg.finalExam.title,
      subtitle: '共' + n + '题，得分 ' + cfg.finalExam.passScore + ' 分以上毕业',
      questionCount: n,
      passScore: cfg.finalExam.passScore
    },
    questions: stripAnswers(picked)
  }
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

  const results = (answers || []).map(a => {
    const q = mockQuestions.find(x => x._id === a.id)
    const correct = q && sameSet(q.answer, a.answer)
    return {
      id: a.id, correct: !!correct,
      question: q ? q.question : '', options: q ? q.options : [],
      correctAnswer: q ? q.answer : [], explanation: q ? q.explanation : ''
    }
  })
  const correctCount = results.filter(r => r.correct).length
  const total = results.length || 1
  const score = Math.round(correctCount / total * 100)
  const passScore = mode === 'final' ? cfg.finalExam.passScore : 60
  const passed = score >= passScore

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
