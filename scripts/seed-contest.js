// 竞赛验收种子：mock 模式造毕业进度 + 3 场竞赛成绩（本机排行榜有数据）
;(function () {
  const codes = ['ruijin', 'xiangjiang', 'zunyi', 'sidu-chishui', 'jinshajiang', 'daduhe', 'luding', 'xueshan', 'caodi', 'lazikou', 'huining']
  const now = Date.now()
  const p = { nickname: '验收员', checkins: {}, quizScores: {}, finalExam: { attempts: 1, best: 100, passed: true, lastTime: now } }
  codes.forEach(c => {
    p.checkins[c] = now
    p.quizScores[c] = { attempts: 1, best: 100, passed: true, lastTime: now }
  })
  localStorage.setItem('cz_progress', JSON.stringify(p))
  const cs = [100, 85, 95].map((score, i) => ({
    id: 9000 + i, status: 'done', score, correctCount: Math.round(score / 5), total: 20,
    questions: [], answers: {}, durationMs: 90000 + i * 30000, createdAt: now - i * 86400000
  }))
  localStorage.setItem('cz_contests', JSON.stringify(cs))
  return 'seeded ' + cs.length
})()
