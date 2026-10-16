/**
 * 竞赛模块 —— 固定题数积分赛 + 排行榜（毕业解锁）
 *
 * 题库：server/question-bank.json（出题人直接编辑，重启 server 自动导入）
 *   { "version": 1, "questions": [ { "id": "bank-001", "question": "…",
 *     "options": ["…×4"], "answer": [下标], "explanation": "…" } ] }
 *   按 id 幂等去重（重复导入跳过）；导入报告在启动日志
 *
 * 规则（getConfigDoc 的 contest 字段可调）：
 *   questionCount 每场题数（默认 20）、pointsPerQuestion 每题分（默认 5，满分 100）
 *   timeoutMs 场次有效期（默认 30 分钟，超时提交判无效）
 *
 * 防作弊：答案只在服务端（start 只下发题干选项）；submit 按场次快照判分
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const { getConfigDoc, getPublishedNodes, loadProgress } = require('./game')
const { computeStates } = require('../js/progress')

const BANK_FILE = path.join(__dirname, 'question-bank.json')

/* ---------- 题库导入 ---------- */

/**
 * 启动时调用：question-bank.json → bank_questions 表（幂等）
 * @returns {{added:number, skipped:number, bankCount:number}} 新增 / 跳过（重复 id）/ 库内总数
 */
function importBank(db) {
  const result = { added: 0, skipped: 0, bankCount: 0 }
  if (!fs.existsSync(BANK_FILE)) return result

  let doc
  try {
    doc = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'))
  } catch (e) {
    throw new Error('question-bank.json 解析失败: ' + e.message)
  }
  const list = Array.isArray(doc) ? doc : (doc && doc.questions) || []
  if (!Array.isArray(list)) throw new Error('question-bank.json 格式错误：需要 questions 数组')

  const insert = db.prepare(
    'INSERT OR IGNORE INTO bank_questions (id, question, options, answer, explanation, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const now = Date.now()
  for (const q of list) {
    const err = validateQuestion(q)
    if (err) throw new Error('题目 ' + (q && q.id) + ' 无效: ' + err)
    const r = insert.run(
      String(q.id), String(q.question),
      JSON.stringify(q.options), JSON.stringify(q.answer),
      String(q.explanation || ''), now
    )
    if (r.changes > 0) result.added++
    else result.skipped++
  }
  result.bankCount = db.prepare('SELECT COUNT(*) AS n FROM bank_questions').get().n
  return result
}

function validateQuestion(q) {
  if (!q || typeof q.id !== 'string' || !q.id.trim()) return '缺少 id'
  if (typeof q.question !== 'string' || !q.question.trim()) return '缺少题干'
  if (!Array.isArray(q.options) || q.options.length < 2) return '选项至少 2 个'
  if (q.options.some(o => typeof o !== 'string' || !o.trim())) return '选项不能为空'
  if (!Array.isArray(q.answer) || q.answer.length < 1) return '缺少答案'
  if (q.answer.some(i => !Number.isInteger(i) || i < 0 || i >= q.options.length)) return '答案下标越界'
  return null
}

/* ---------- 抽题 / 判分 ---------- */

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function contestConfig() {
  const cfg = getConfigDoc()
  return {
    questionCount: (cfg.contest && cfg.contest.questionCount) || 20,
    pointsPerQuestion: (cfg.contest && cfg.contest.pointsPerQuestion) || 5,
    timeoutMs: (cfg.contest && cfg.contest.timeoutMs) || 30 * 60 * 1000,
    title: (cfg.contest && cfg.contest.title) || '长征知识竞赛'
  }
}

/** 是否已毕业（11 节点全通关 + 毕业考试通过） */
function isGraduated(db, userId) {
  const cfg = getConfigDoc()
  const nodes = getPublishedNodes()
  const p = loadProgress(db, userId)
  const states = computeStates(nodes, p, cfg)
  return states.finalState === 'passed'
}

/** 竞赛状态：解锁与否 + 我的成绩 + 题库规模 */
function getContestStatus(db, userId) {
  const cc = contestConfig()
  const agg = db.prepare(
    'SELECT COUNT(*) AS plays, COALESCE(SUM(score),0) AS totalScore, COALESCE(MAX(score),0) AS bestScore FROM contests WHERE user_id = ? AND status = ?'
  ).get(userId, 'done')
  const bankCount = db.prepare('SELECT COUNT(*) AS n FROM bank_questions').get().n
  return {
    ok: true,
    graduated: isGraduated(db, userId),
    rules: {
      questionCount: cc.questionCount,
      pointsPerQuestion: cc.pointsPerQuestion,
      fullScore: cc.questionCount * cc.pointsPerQuestion,
      title: cc.title
    },
    myStats: {
      plays: agg.plays || 0,
      totalScore: agg.totalScore || 0,
      bestScore: agg.bestScore || 0
    },
    bankCount
  }
}

/** 开场：毕业校验 → 随机抽题 → 落库场次（含答案快照）→ 下发无答案题目 */
function startContest(db, userId) {
  if (!isGraduated(db, userId)) {
    return { ok: false, error: 'NOT_GRADUATED', message: '完成全部节点与毕业考试后解锁竞赛' }
  }
  const cc = contestConfig()
  const pool = db.prepare('SELECT id, question, options, answer, explanation FROM bank_questions').all()
  if (pool.length < cc.questionCount) {
    return { ok: false, error: 'BANK_TOO_SMALL', message: '题库不足 ' + cc.questionCount + ' 题（当前 ' + pool.length + '），请联系管理员导入' }
  }
  const picked = shuffle(pool).slice(0, cc.questionCount)
  const r = db.prepare(
    'INSERT INTO contests (user_id, status, questions, created_at) VALUES (?, ?, ?, ?)'
  ).run(userId, 'in_progress', JSON.stringify(picked), Date.now())

  return {
    ok: true,
    contestId: Number(r.lastInsertRowid),
    meta: {
      title: cc.title,
      subtitle: '共 ' + cc.questionCount + ' 题 · 每题 ' + cc.pointsPerQuestion + ' 分 · 满分 ' + cc.questionCount * cc.pointsPerQuestion,
      questionCount: cc.questionCount
    },
    questions: picked.map(q => ({ id: q.id, question: q.question, options: JSON.parse(q.options) }))
  }
}

/** 交卷：场次归属 + 状态校验 → 按快照判分 → 更新落库 */
function submitContest(db, userId, contestId, answers, durationMs) {
  const row = db.prepare('SELECT * FROM contests WHERE id = ? AND user_id = ?').get(contestId, userId)
  if (!row) return { ok: false, error: 'CONTEST_NOT_FOUND', message: '竞赛场次不存在' }
  if (row.status !== 'in_progress') return { ok: false, error: 'ALREADY_SUBMITTED', message: '该场次已交卷' }
  const cc = contestConfig()
  if (Date.now() - row.created_at > cc.timeoutMs) {
    return { ok: false, error: 'CONTEST_EXPIRED', message: '场次已超时，请重新开始' }
  }

  const questions = JSON.parse(row.questions)
  const answerMap = {}
  for (const a of (Array.isArray(answers) ? answers : [])) {
    if (a && a.id && Array.isArray(a.answer)) answerMap[a.id] = a.answer
  }
  const results = questions.map(q => {
    const given = answerMap[q.id] || []
    const ans = JSON.parse(q.answer)
    const correct = given.length === ans.length && ans.every(v => given.includes(v))
    return {
      id: q.id, correct,
      question: q.question, options: JSON.parse(q.options),
      correctAnswer: ans, explanation: q.explanation || ''
    }
  })
  const correctCount = results.filter(x => x.correct).length
  const total = questions.length
  const score = correctCount * cc.pointsPerQuestion

  db.prepare(
    'UPDATE contests SET status = ?, answers = ?, score = ?, correct = ?, total = ?, duration_ms = ? WHERE id = ?'
  ).run('done', JSON.stringify(answerMap), score, correctCount, total, Number(durationMs) || 0, contestId)

  const agg = db.prepare(
    'SELECT COALESCE(SUM(score),0) AS totalScore, COALESCE(MAX(score),0) AS bestScore, COUNT(*) AS plays FROM contests WHERE user_id = ? AND status = ?'
  ).get(userId, 'done')

  return {
    ok: true, score, correctCount, total,
    results,
    myStats: { plays: agg.plays, totalScore: agg.totalScore, bestScore: agg.bestScore }
  }
}

/* ---------- 排行榜 ---------- */

/**
 * type=total 累计总分榜；type=best 单场最佳榜
 * 返回前 50 名 + 我的名次（me 供前端高亮）
 */
function leaderboard(db, type, userId) {
  const isBest = type === 'best'
  const agg = isBest
    ? 'MAX(score) AS score, COUNT(*) AS plays'
    : 'SUM(score) AS score, COUNT(*) AS plays'
  const rows = db.prepare(
    'SELECT u.id AS userId, u.nickname, u.username, ' + agg +
    ' FROM contests c JOIN users u ON u.id = c.user_id' +
    ' WHERE c.status = ? GROUP BY c.user_id' +
    ' ORDER BY score DESC, plays ASC' +
    ' LIMIT 50'
  ).all('done')

  const list = rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    name: r.nickname || r.username,
    score: r.score || 0,
    plays: r.plays || 0
  }))

  let myRank = null
  if (userId) {
    const me = list.find(x => x.userId === userId)
    if (me) {
      myRank = me.rank
    } else {
      // 不在前 50：数出比我高的人数
      const mine = db.prepare(
        'SELECT ' + (isBest ? 'MAX(score) AS s' : 'SUM(score) AS s') +
        ' FROM contests WHERE user_id = ? AND status = ?'
      ).get(userId, 'done')
      if (mine && mine.s != null) {
        const above = db.prepare(
          'SELECT COUNT(*) AS n FROM (SELECT user_id, ' + (isBest ? 'MAX(score)' : 'SUM(score)') +
          ' AS s FROM contests WHERE status = ? GROUP BY user_id HAVING s > ?)'
        ).get('done', mine.s)
        myRank = (above && above.n != null) ? above.n + 1 : null
      }
    }
  }

  return { ok: true, type: isBest ? 'best' : 'total', list, myRank }
}

module.exports = {
  importBank,
  getContestStatus,
  startContest,
  submitContest,
  leaderboard,
  isGraduated
}
