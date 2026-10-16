/**
 * 数据访问统一层 —— 视图只通过本层取数（与 miniprogram/utils/api.js 同构）
 *
 * USE_MOCK=true  → 本地 mock 数据 + localStorage 进度（双击 index.html 即可运行）
 * USE_MOCK=false → 后端接口（node server/server.js 启动，需通过 http:// 访问）
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
  const STORAGE_TOKEN = 'cz_token'

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

  /* ---------- 会话令牌 ---------- */

  function getToken() {
    try {
      let t = store().getItem(STORAGE_TOKEN) || ''
      // 兼容旧版误存 JSON 引号格式（storeSet 曾 stringify token）
      if (t.length > 2 && t[0] === '"' && t[t.length - 1] === '"') t = t.slice(1, -1)
      return t
    } catch (e) { return '' }
  }

  function setToken(token) {
    // token 直接原样存（storeSet 会 JSON.stringify，读出会带引号导致服务端验签失败）
    if (token) {
      try { store().setItem(STORAGE_TOKEN, token) } catch (e) { /* 存储不可用忽略 */ }
    } else {
      storeRemove(STORAGE_TOKEN)
    }
  }

  /** 是否已登录（仅 http 模式有意义；mock 模式恒为本地单用户） */
  function isLoggedIn() {
    return config.USE_MOCK ? true : !!getToken()
  }

  /**
   * 后端请求（USE_MOCK=false 时使用）
   * @param {string} path 接口路径（可带 query，如 'quiz?mode=node&code=x'）
   * @param {object} [data] 存在则 POST JSON，否则 GET
   */
  function http(path, data) {
    const opts = { method: data ? 'POST' : 'GET', headers: {} }
    if (data) {
      opts.headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(data)
    }
    const token = getToken()
    if (token) opts.headers['Authorization'] = 'Bearer ' + token

    return fetch(config.API_BASE + '/api/' + path, opts).then(res => {
      return res.json().then(body => {
        if (!res.ok || body.ok === false) {
          const err = new Error(body.message || ('请求失败（' + res.status + '）'))
          err.code = body.error || ''
          err.status = res.status
          if (res.status === 401) {
            setToken('') // 令牌失效，本地登出
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('cz:unauthorized'))
            }
          }
          throw err
        }
        return body
      })
    })
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
    return http('config').then(r => r.config)
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
    return http('nodes').then(r => r.nodes)
  }

  /** 单个节点 */
  function getNode(code) {
    if (config.USE_MOCK) {
      const node = mockNodes.find(n => n.code === code)
      return Promise.resolve(node || null)
    }
    return http('nodes').then(r => (r.nodes || []).find(n => n.code === code) || null)
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

  /** 当前用户进度（不存在返回空结构，不报错；未登录返回空结构，游客可浏览） */
  function getProgress() {
    if (config.USE_MOCK) {
      return Promise.resolve(mockProgress())
    }
    return http('progress').then(r => r.progress || emptyProgress())
  }

  /** 打卡流水（我的页足迹时间线，按时间倒序） */
  function getCheckins() {
    if (config.USE_MOCK) {
      return Promise.resolve(storeGet(STORAGE_CHECKINS) || [])
    }
    return http('checkins').then(r => r.checkins || [])
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

  /* ================= 账号（USE_MOCK=false 时使用） ================= */

  /** 注册：成功自动保存令牌 */
  function register(username, password, nickname) {
    return http('register', { username, password, nickname }).then(r => {
      setToken(r.token)
      return r
    })
  }

  /** 登录：成功自动保存令牌 */
  function login(username, password) {
    return http('login', { username, password }).then(r => {
      setToken(r.token)
      return r
    })
  }

  /** 退出：吊销服务端会话 + 清本地令牌（网络失败也本地登出） */
  function logout() {
    return http('logout', {}).catch(() => ({ ok: true })).then(r => {
      setToken('')
      return r
    })
  }

  /** 当前用户信息（未登录抛 AUTH_REQUIRED） */
  function me() {
    return http('me').then(r => r.user)
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
    return http('quiz?mode=' + encodeURIComponent(mode) + '&code=' + encodeURIComponent(code || ''))
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
    return http('quiz/submit', { mode, code, answers })
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
    submitQuiz,
    register,
    login,
    logout,
    me,
    isLoggedIn
  }
})
