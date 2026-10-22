/**
 * 线上答题挑战模块 —— 11 节点合计总分榜
 *
 * 排行榜口径：全部 published 节点答题成绩（quiz_scores 中 best）之和，
 *   按总分降序；分数相同时先比通关节点数，再比用户 id。
 * 公开接口（未登录可看榜）；登录时附「我的名次」与「我的 userId」（前端高亮用）。
 */
'use strict'

const { getPublishedNodes } = require('./game')

function challengeLeaderboard(db, userId) {
  const codes = getPublishedNodes().map(n => n.code)
  const rows = db.prepare(
    'SELECT u.id AS userId, u.nickname, u.username, p.quiz_scores FROM progress p JOIN users u ON u.id = p.user_id'
  ).all()

  const entries = []
  for (const r of rows) {
    let scores = {}
    try { scores = JSON.parse(r.quiz_scores || '{}') } catch (e) { scores = {} }
    let total = 0
    let completed = 0
    for (const c of codes) {
      const q = scores[c]
      if (q && q.best > 0) total += q.best
      if (q && q.passed) completed++
    }
    if (total > 0 || completed > 0) {
      entries.push({ userId: r.userId, name: r.nickname || r.username, total, completed })
    }
  }

  entries.sort((a, b) => b.total - a.total || b.completed - a.completed || a.userId - b.userId)
  const list = entries.slice(0, 50).map((x, i) => ({
    rank: i + 1,
    userId: x.userId,
    name: x.name,
    total: x.total,
    completed: x.completed
  }))

  let myRank = null
  if (userId != null) {
    const idx = entries.findIndex(x => x.userId === userId)
    if (idx >= 0) myRank = idx + 1
  }
  return { ok: true, list, myRank, myId: userId != null ? userId : null }
}

module.exports = { challengeLeaderboard }
