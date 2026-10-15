/**
 * 数据访问统一层 —— 视图只通过本层取数（与 miniprogram/utils/api.js 同构）
 *
 * USE_MOCK=true  → 本地 mock 数据 + localStorage 进度（双击 index.html 即可运行）
 * USE_MOCK=false → 后端接口（TODO：接入后端时实现 fetch 分支）
 *
 * 视图代码对两种模式零感知。
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./config'),
      require('./progress'),
      require('./mock/nodes'),
      require('./mock/questions')
    )
  } else {
    root.CZ_API = factory(root.CZ_CONFIG, root.CZ_PROGRESS, root.CZ_MOCK_NODES, root.CZ_MOCK_QUESTIONS)
  }
})(typeof self !== 'undefined' ? self : this, function (config, progressUtil, mockNodes, mockQuestions) {

  const STORAGE_PROGRESS = 'cz_progress'
  const STORAGE_CHECKINS = 'cz_checkins'

  /* ================= 存储抽象（浏览器 localStorage；node 测试用内存兜底） ================= */

  const memStore = (function () {
    const m = {}
    return {
      getItem(k) { return k in m ? m[k] : null },
      setItem(k, v) { m[k] = String(v) },
      removeItem(k) { delete m[k] }
    }
  })()

  // 探测存储可用性：隐私模式/存储被禁用时 localStorage 存在但写入会抛异常
  let storeInst = null
  function store() {
    if (storeInst) return storeInst
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('__cz_probe__', '1')
        localStorage.removeItem('__cz_probe__')
        storeInst = localStorage
        return storeInst
      }
    } catch (e) { /* 落入内存兜底 */ }
    storeInst = memStore
    return storeInst
  }

  function storeGet(key) {
    try { return JSON.parse(store().getItem(key)) } catch (e) { return null }
  }

  function storeSet(key, val) {
    try { store().setItem(key, JSON.stringify(val)) } catch (e) { /* 内存兜底已可写，此处防御性忽略 */ }
  }

  function storeRemove(key) {
    try { store().removeItem(key) } catch (e) { /* 同上 */ }
  }

  /* ================= 内部工具 ================= */

  /** 后端接口（USE_MOCK=false 时实现；当前后端未接入，返回明确错误） */
  function http(path, data) {
    const msg = '云端模式未接入：请在 api.js 的 http() 中实现后端接口（' + path + '）'
    return Promise.reject(new Error(msg))
  }

  function backendNotReady() {
    return Promise.reject(new Error('USE_MOCK=false：请实现 api.js 中对应方法的后端分支'))
  }

  function getConfigDoc() {
    if (config.USE_MOCK) {
      return {
        _id: 'global',
        sequentialUnlock: false,
        requireReadBeforeCheckin: true,
        defaultPassScore: 60,
        finalExam: { questionCount: 10, passScore: 60, title: '长征知识总结答题' },
        theme: { primary: '#C8102E', gold: '#D4A017' }
      }
    }
    return http('config')
  }

  function cacheGet(key, fetchFn) {
    const now = Date.now()
    const cached = storeGet('cz_web_cache_' + key)
    if (cached && now - cached.time < config.CACHE_TTL) {
      return Promise.resolve(cached.data)
    }
    return Promise.resolve(fetchFn()).then(data => {
      storeSet('cz_web_cache_' + key, { time: now, data })
      return data
    })
  }

  /* ================= 内容读取 ================= */

  /** 全局配置 */
  function getConfig() {
    return cacheGet('config', getConfigDoc)
  }

  /** 全部节点，按 order 排序，仅 published */
  function getNodes() {
    if (config.USE_MOCK) {
      const list = mockNodes
        .filter(n => n.status === 'published')
        .sort((a, b) => a.order - b.order)
      return Promise.resolve(list)
    }
    return http('nodes')
  }

  /** 单个节点 */
  function getNode(code) {
    if (config.USE_MOCK) {
      const node = mockNodes.find(n => n.code === code)
      return Promise.resolve(node || null)
    }
    return http('nodes/' + code)
  }

  /* ================= 用户进度 ================= */

  function emptyProgress() {
    return { checkins: {}, quizScores: {}, finalExam: { attempts: 0, best: 0, passed: false, lastTime: null } }
  }

  function mockProgress() {
    return storeGet(STORAGE_PROGRESS) || emptyProgress()
  }

  function saveMockProgress(p) {
    storeSet(STORAGE_PROGRESS, p)
  }

  /** 当前用户进度（不存在返回空结构，不报错） */
  function getProgress() {
    if (config.USE_MOCK) {
      return Promise.resolve(mockProgress())
    }
    return http('progress')
  }

  /** 打卡流水（我的页足迹时间线，按时间倒序） */
  function getCheckins() {
    if (config.USE_MOCK) {
      return Promise.resolve(storeGet(STORAGE_CHECKINS) || [])
    }
    return http('checkins')
  }

  /** 保存昵称 */
  function saveNickname(nickname) {
    if (config.USE_MOCK) {
      const p = mockProgress()
      p.nickname = nickname
      saveMockProgress(p)
      return Promise.resolve({ ok: true, nickname })
    }
    return http('profile', { nickname })
  }

  /* ================= 核心链路（后端 / mock 同构） ================= */

  /**
   * 打卡
   * @returns {Promise<{ok, error?, progress, alreadyChecked}>}
   */
  function checkin(code) {
    if (config.USE_MOCK) {
      return getConfig().then(cfg => {
        return getNodes().then(nodes => {
          const p = mockProgress()
          const states = progressUtil.computeStates(nodes, p, cfg)
          const st = states.byCode[code]
          if (!st) return { ok: false, error: 'NODE_NOT_FOUND' }
          if (st.state === 'locked') return { ok: false, error: 'PREV_NOT_CHECKED_IN' }
          if (st.state === 'checkedIn' || st.state === 'quizPassed') {
            return { ok: true, alreadyChecked: true, progress: p }
          }
          // 写入进度
          p.checkins[code] = Date.now()
          p.updatedAt = Date.now()
          saveMockProgress(p)
          // 写入流水
          const node = nodes.find(n => n.code === code)
          const flow = storeGet(STORAGE_CHECKINS) || []
          flow.unshift({ _id: 'mock-' + Date.now(), nodeCode: code, nodeName: node.name, order: node.order, time: Date.now() })
          storeSet(STORAGE_CHECKINS, flow)
          return { ok: true, alreadyChecked: false, progress: p }
        })
      })
    }
    return http('checkin', { code })
  }

  /**
   * 取题（答案不下发；解锁校验与后端一致）
   * @returns {Promise<{ok, error?, meta, questions}>}
   */
  function getQuiz(mode, code) {
    if (config.USE_MOCK) {
      return getConfig().then(cfg => {
        return getNodes().then(nodes => {
          const p = mockProgress()
          const states = progressUtil.computeStates(nodes, p, cfg)
          // 解锁校验
          if (mode === 'node') {
            const st = states.byCode[code]
            if (!st) return { ok: false, error: 'NODE_NOT_FOUND' }
            if (st.state === 'locked') return { ok: false, error: 'PREV_NOT_CHECKED_IN' }
            if (st.state === 'open') return { ok: false, error: 'NOT_CHECKED_IN' }
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
          if (states.finalState === 'locked') return { ok: false, error: 'NOT_ALL_CHECKED_IN' }
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
        })
      })
    }
    return http('quiz', { mode, code })
  }

  /**
   * 提交答题（判分逻辑与后端同构）
   * @param answers [{id, answer:[下标]}]
   */
  function submitQuiz(mode, code, answers) {
    if (config.USE_MOCK) {
      return getConfig().then(cfg => {
        return getNodes().then(nodes => {
          const p = mockProgress()
          const states = progressUtil.computeStates(nodes, p, cfg)
          if (mode === 'node' && !['checkedIn', 'quizPassed'].includes(states.byCode[code] && states.byCode[code].state)) {
            return { ok: false, error: 'NOT_CHECKED_IN' }
          }
          if (mode === 'final' && states.finalState === 'locked') {
            return { ok: false, error: 'NOT_ALL_CHECKED_IN' }
          }
          // 判分
          const results = answers.map(a => {
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
          // 写成绩
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
          p.updatedAt = Date.now()
          saveMockProgress(p)
          return {
            ok: true, score, passed, correctCount, total,
            results, best: mode === 'final' ? p.finalExam.best : p.quizScores[code].best,
            attempts: mode === 'final' ? p.finalExam.attempts : p.quizScores[code].attempts,
            isFinalPassed: mode === 'final' && passed
          }
        })
      })
    }
    return http('submitQuiz', { mode, code, answers })
  }

  /* ================= 题目工具 ================= */

  function stripAnswers(qs) {
    return qs.map(q => ({ id: q._id, type: q.type, question: q.question, options: q.options }))
  }

  function sameSet(a, b) {
    if (!a || !b || a.length !== b.length) return false
    const sa = [...a].sort()
    const sb = [...b].sort()
    return sa.every((v, i) => v === sb[i])
  }

  function shuffle(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  return {
    getConfig,
    getNodes,
    getNode,
    getProgress,
    getCheckins,
    saveNickname,
    checkin,
    getQuiz,
    submitQuiz
  }
})
