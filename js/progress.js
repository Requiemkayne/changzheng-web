/**
 * 节点状态机 —— 首页 / 详情页 / 答题页 / 地图页 / 我的页共用的唯一状态判定源
 * （与 miniprogram/utils/progress.js 逻辑 1:1 同构）
 *
 * state:
 *   locked     顺序模式下前置节点未打卡
 *   open       可浏览、可打卡
 *   checkedIn  已打卡、答题未通过
 *   quizPassed 答题已通过
 *
 * finalState: locked（未全打卡）/ open（可考试）/ passed（已毕业）
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_PROGRESS = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function computeStates(nodes, progress, config) {
    const p = progress || { checkins: {}, quizScores: {}, finalExam: {} }
    const sequential = !!(config && config.sequentialUnlock)
    const byCode = {}
    let checkedCount = 0
    let passedCount = 0

    nodes.forEach((node, i) => {
      const checkedIn = !!p.checkins[node.code]
      const quiz = p.quizScores[node.code]
      const quizPassed = !!(quiz && quiz.passed)

      let state
      if (quizPassed) {
        state = 'quizPassed'
      } else if (checkedIn) {
        state = 'checkedIn'
      } else if (sequential && i > 0 && !p.checkins[nodes[i - 1].code]) {
        state = 'locked'
      } else {
        state = 'open'
      }

      if (checkedIn) checkedCount++
      if (quizPassed) passedCount++

      byCode[node.code] = {
        state,
        checkedIn,
        quizPassed,
        quizBest: quiz ? quiz.best : 0,
        checkedTime: p.checkins[node.code] || 0
      }
    })

    const finalExam = p.finalExam || {}
    // 毕业判定：11 个节点答题成绩的平均分达到毕业线（不再单独考一次）
    const gradLine = (config && config.graduation ? config.graduation.passScore : undefined) || 70
    let scoreSum = 0
    let scoreCount = 0
    nodes.forEach(n => {
      const q = p.quizScores && p.quizScores[n.code]
      if (q && typeof q.best === 'number') { scoreSum += q.best; scoreCount++ }
    })
    // 没答过的节点按 0 分计入分母，避免「只答一两个节点却拿高分」就能毕业
    const avgScore = nodes.length ? Math.round(scoreSum / nodes.length) : 0
    const allChecked = checkedCount >= nodes.length
    const ready = allChecked && avgScore >= gradLine
    const finalState = finalExam.passed
      ? 'passed'
      : allChecked ? 'open' : 'locked'

    // 当前应到达的节点（第一个未打卡的，用于首页锚定）
    let currentCode = nodes.length ? nodes[0].code : null
    for (const n of nodes) {
      if (!p.checkins[n.code]) { currentCode = n.code; break }
    }

    return {
      byCode,
      finalState,
      checkedCount,
      passedCount,
      total: nodes.length,
      currentCode,
      finalBest: finalExam.best || 0,
      // 毕业申请用的体检数据：平均正确率 / 毕业线 / 是否达标
      graduation: {
        avgScore,
        passScore: gradLine,
        ready,
        answeredCount: scoreCount
      }
    }
  }

  return { computeStates }
})
