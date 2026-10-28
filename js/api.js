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
})(typeof self !== 'undefined' ? self : this, function (config, progressUtil, mockNodes, mockQuestionsDoc) {

  const STORAGE_PROGRESS = 'cz_progress'
  const STORAGE_CHECKINS = 'cz_checkins'
  const STORAGE_TOKEN = 'cz_token'
  const STORAGE_GUEST = 'cz_guest'

  const REQUEST_TIMEOUT = 10000    // 请求超时（ms）
  const DEFAULT_PASS_SCORE = 60    // meta 缺 passScore 时的回落值

  // 答案题库：mock 模式下按需加载（见 ensureQuestions）。
  // 首屏不再注入整包题库，避免页面源码里直接看到全部题目与答案。
  let mockQuestions = mockQuestionsDoc || []
  let questionsReady = !!mockQuestionsDoc
  let questionsLoading = null

  /** 取题库（mock 模式首次取题/交卷时触发；http 模式不会走到这里） */
  function ensureQuestions() {
    if (questionsReady) return Promise.resolve(mockQuestions)
    if (questionsLoading) return questionsLoading
    questionsLoading = new Promise(resolve => {
      // file:// 场景由 loader.js 同步注入，直接读全局即可
      if (mockQuestionsDoc && mockQuestionsDoc.length) {
        mockQuestions = mockQuestionsDoc
        questionsReady = true
        resolve(mockQuestions)
        return
      }
      var proto2 = (typeof location !== 'undefined' && location.protocol) || ''
      if (typeof document === 'undefined' || proto2 === 'file:') {
        // 没有 fetch 能力：��能返回空数组，调用方按「无题」处理
        questionsReady = true
        resolve(mockQuestions)
        return
      }
      const sc = document.createElement('script')
      sc.src = 'js/mock/questions.js'
      sc.onload = () => {
        const g = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : {})
        mockQuestions = g.CZ_MOCK_QUESTIONS || []
        questionsReady = true
        resolve(mockQuestions)
      }
      sc.onerror = () => {
        questionsReady = true
        resolve(mockQuestions)
      }
      document.head.appendChild(sc)
    }).then(list => {
      questionsLoading = null
      return list
    })
    return questionsLoading
  }

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

  /* ---------- 游客态（mock 模式专用） ---------- */

  /**
   * 静态托管（GitHub Pages / 双击 index.html）没有后端，账号体系不可用；
   * 此时用本地游客态代替登录态，避免登录页成为死胡同。
   */
  function isGuest() {
    return !!(config.USE_MOCK && storeGet(STORAGE_GUEST))
  }

  /** 进入游客体验：写本地游客态（不碰打卡进度，进度行为保持不变） */
  function guestLogin() {
    if (!config.USE_MOCK) return Promise.reject(new Error('仅静态托管（游客体验）模式可用'))
    storeSet(STORAGE_GUEST, { nickname: '游客', time: Date.now() })
    return Promise.resolve({ ok: true, guest: true, user: { nickname: '游客' } })
  }

  /**
   * 是否已登录
   *   mock 模式 → 是否已进入游客体验（本地存储）
   *   http 模式 → 是否有会话令牌
   */
  function isLoggedIn() {
    return config.USE_MOCK ? isGuest() : !!getToken()
  }

  /** 统一错误构造：视图层按 err.code 分支（TIMEOUT / BAD_RESPONSE / 后端业务码） */
  function apiError(code, message) {
    const err = new Error(message)
    err.code = code
    return err
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

    // 弱网兜底：超时中止请求并抛 TIMEOUT，避免永久转圈
    // （无 AbortController 的环境只抛错不中止，保证老浏览器不崩）
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    if (controller) opts.signal = controller.signal
    let timer = null

    const timeoutPromise = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        if (controller) {
          try { controller.abort() } catch (e) { /* 环境不支持中止，忽略 */ }
        }
        reject(apiError('TIMEOUT', '网络超时，请稍后重试'))
      }, REQUEST_TIMEOUT)
    })

    const reqPromise = Promise.resolve()
      .then(() => fetch(config.API_BASE + '/api/' + path, opts))
      .then(res => {
        // 后端/反代返回 HTML 错误页时 res.json() 抛 "Unexpected token '<'"，统一转 BAD_RESPONSE
        return res.json()
          .catch(() => { throw apiError('BAD_RESPONSE', '服务器返回异常，请稍后重试') })
          .then(body => {
            if (!body || typeof body !== 'object') {
              throw apiError('BAD_RESPONSE', '服务器返回异常，请稍后重试')
            }
            if (!res.ok || body.ok === false) {
              const err = new Error(body.message || ('请求失败（' + res.status + '）'))
              err.code = body.error || ''
              err.status = res.status
              // 登录/注册本身的 401 是「账号或密码错」，不是会话失效：
              // 此时本来就没登录，清 token 和弹「请先登录」都是误报。
              // 只对其它需要鉴权的接口做全局登出。
              const isAuthEndpoint = /^(login|register)$/.test(String(path || '').split('?')[0])
              if (res.status === 401 && !isAuthEndpoint) {
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

    return Promise.race([reqPromise, timeoutPromise]).finally(() => { clearTimeout(timer) })
  }

  function getConfigDoc() {
    if (config.USE_MOCK) {
      return {
        _id: 'global',
        sequentialUnlock: false,
        requireReadBeforeCheckin: true,
        defaultPassScore: 60,
    // 毕业不看单独考试，而看 11 个节点答题的平均分是否达到这条线
    graduation: { passScore: 70 },
        finalExam: { questionCount: 10, passScore: 60, timeoutMs: 3 * 60 * 1000, title: '综合练习' },
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
    return {
      checkins: {},
      quizScores: {},
      finalExam: { attempts: 0, best: 0, passed: false, lastTime: null },
      stats: { correctCount: 0, totalCount: 0 }
    }
  }

  function mockProgress() {
    return storeGet(STORAGE_PROGRESS) || emptyProgress()
  }

  function saveMockProgress(p) {
    storeSet(STORAGE_PROGRESS, p)
  }

  /** 当前用户进度（不存在返回空结构，不报错；未登录返回空结构，游客可浏览） */
  /**
 * 提交「忘记密码」申请（免登录）。
 * 老师会在管理端看到申请，重置后密码统一回到 111111。
 */
function forgotPassword(username, note) {
  if (config.USE_MOCK) return Promise.reject(apiError('MOCK_MODE', '当前是游客体验模式，不需要找回密码'))
  return http('password/forgot', { username: username, note: note || '' })
}

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

  /** 退出：吊销服务端会话 + 清本地令牌（网络失败也本地登出）；mock 模式只清游客态 */
  function logout() {
    if (config.USE_MOCK) {
      storeRemove(STORAGE_GUEST)
      return Promise.resolve({ ok: true })
    }
    return http('logout', {}).catch(() => ({ ok: true })).then(r => {
      setToken('')
      return r
    })
  }

  /** 当前用户信息（未登录抛 AUTH_REQUIRED） */
  function me() {
    return http('me').then(r => r.user)
  }

  /**
   * 开发开关：静默登录演示账号（config.DEV_AUTO_LOGIN），用于「屏蔽登录页」
   * 首次运行账号不存在 → 自动注册；已存在（409 USERNAME_TAKEN）→ 直接登录
   * 仅 router 启动时调用一次，不参与正常业务
   */
  function devLogin() {
    const acc = config.DEV_AUTO_LOGIN
    if (!acc) return Promise.reject(new Error('未配置 DEV_AUTO_LOGIN'))
    if (config.USE_MOCK) return Promise.resolve({ ok: true, mock: true })
    // 先注册：已存在只会返回 409，不会触发 401 登出事件
    return register(acc.username, acc.password, acc.nickname)
      .catch(err => (err && err.code === 'USERNAME_TAKEN'
        ? login(acc.username, acc.password)
        : Promise.reject(err)))
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
   * 节点通关分：唯一来源是节点 meta（node.quiz.passScore）
   * 只有 meta 确实缺该字段时才回落 DEFAULT_PASS_SCORE，避免前后端配置不一致
   */
  function nodePassScore(node) {
    const v = node && node.quiz ? node.quiz.passScore : undefined
    return typeof v === 'number' && isFinite(v) ? v : DEFAULT_PASS_SCORE
  }

  /** 毕业考通关分：唯一来源是 config.finalExam.passScore，缺字段才回落 */
  function finalPassScore(cfg) {
    const v = cfg && cfg.finalExam ? cfg.finalExam.passScore : undefined
    return typeof v === 'number' && isFinite(v) ? v : DEFAULT_PASS_SCORE
  }

  /**
   * 取题（答案不下发；解锁校验与后端一致）
   * @returns {Promise<{ok, error?, meta, questions}>}
   */
  function getQuiz(mode, code) {
    if (config.USE_MOCK) {
      return ensureQuestions().then(() => getConfig()).then(cfg => {
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
            const passScore = nodePassScore(node)
            return {
              ok: true,
              meta: {
                title: node.name + ' · 答题关卡',
                subtitle: '共' + qs.length + '题，答对 ' + Math.ceil(qs.length * passScore / 100) + ' 题即通关',
                questionCount: qs.length,
                passScore
              },
              questions: stripAnswers(qs)
            }
          }
          // mode === final
          if (states.finalState === 'locked') return { ok: false, error: 'NOT_ALL_CHECKED_IN' }
          // 题目来源改为 11 个节点的关卡题（覆盖全部知识点），不再用 final 占位题
          const pool = mockQuestions.filter(q => q.nodeCode !== 'final' && q.status === 'published')
          const n = Math.min(cfg.finalExam.questionCount, pool.length)
          const picked = pickAcrossNodes(pool, n)
          const passScore = finalPassScore(cfg)
          return {
            ok: true,
            meta: {
              title: cfg.finalExam.title,
              subtitle: '随机抽取 ' + n + ' 道节点题 · 限时 ' + Math.round((cfg.finalExam.timeoutMs || 180000) / 60000) + ' 分钟 · 成绩不计入毕业',
              questionCount: n,
              passScore: passScore,
              timeoutMs: cfg.finalExam.timeoutMs || 0
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
      return ensureQuestions().then(() => getConfig()).then(cfg => {
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
          // 通关分与 getQuiz 下发的 meta.passScore 同源，配置改动前后端一致
          const passScore = mode === 'final'
            ? finalPassScore(cfg)
            : nodePassScore(nodes.find(n => n.code === code))
          const passed = score >= passScore
          // 学习统计累计（兼容旧数据无 stats 字段）
          p.stats = p.stats || { correctCount: 0, totalCount: 0 }
          p.stats.correctCount += correctCount
          p.stats.totalCount += total
          // 写成绩
          if (mode === 'final') {
            p.finalExam.attempts = (p.finalExam.attempts || 0) + 1
            p.finalExam.best = Math.max(p.finalExam.best || 0, score)
            // 练习成绩不参与毕业判定（毕业看 11 个节点平均分）
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

  /* ================= 竞赛（毕业解锁；mock 模式本地单机可玩） ================= */

  const STORAGE_CONTESTS = 'cz_contests'

  function contestRules() {
    return { questionCount: 10, pointsPerQuestion: 5, fullScore: 50, title: '长征知识竞赛' }
  }

  function mockContests() {
    return storeGet(STORAGE_CONTESTS) || []
  }

  /**
   * 清空竞赛记录（重置进度时调用）
   * mock：清除本地竞赛记录，竞赛成绩/排行榜随之归零
   * http：成绩在服务端，本地无缓存需要清理，不发网络请求
   */
  function clearContestRecords() {
    if (config.USE_MOCK) storeRemove(STORAGE_CONTESTS)
    return Promise.resolve({ ok: true })
  }

  function mockContestStats() {
    const done = mockContests().filter(c => c.status === 'done')
    return {
      plays: done.length,
      totalScore: done.reduce((s, c) => s + c.score, 0),
      bestScore: done.reduce((s, c) => Math.max(s, c.score), 0)
    }
  }

  /** 竞赛状态（解锁 / 我的成绩 / 题库规模） */
  function contestStatus() {
    if (config.USE_MOCK) {
      return ensureQuestions().then(() => getConfig()).then(cfg => {
        return getNodes().then(nodes => {
          const p = mockProgress()
          const states = progressUtil.computeStates(nodes, p, cfg)
          return {
            ok: true,
            graduated: states.finalState === 'passed',
            rules: contestRules(),
            myStats: mockContestStats(),
            bankCount: mockQuestions.filter(q => q.status === 'published').length
          }
        })
      })
    }
    return http('contest/status')
  }

  /** 开场：毕业校验 → 抽 20 题（无答案） */
  function contestStart() {
    if (config.USE_MOCK) {
      return contestStatus().then(s => {
        if (!s.ok || !s.graduated) return { ok: false, error: 'NOT_GRADUATED' }
        // 竞赛只抽节点关卡题（final 池已废弃，毕业考也从节点题抽）
        const pool = mockQuestions.filter(q => q.status === 'published' && q.nodeCode !== 'final')
        const n = Math.min(contestRules().questionCount, pool.length)
        const picked = shuffle(pool).slice(0, n)
        const contestId = Date.now()
        storeSet(STORAGE_CONTESTS, mockContests().concat([{ id: contestId, status: 'in_progress', questions: picked, createdAt: Date.now() }]))
        return {
          ok: true, contestId,
          meta: { title: contestRules().title, subtitle: '共 ' + n + ' 题 · 每题 5 分 · 满分 ' + (n * 5) + ' · 限时 30 分钟', questionCount: n, timeoutMs: 30 * 60 * 1000 },
          questions: stripAnswers(picked)
        }
      })
    }
    return http('contest/start', {})
  }

  /**
   * 申请毕业：不再单独答题，直接读 11 个节点答题的平均分判定。
   * mock 分支本地算，http 分支交给 /api/graduate。
   */
  function graduate() {
    if (!config.USE_MOCK) return http('graduate', {})
    return Promise.all([getConfig(), getNodes()]).then(([cfg, nodes]) => {
      const p = mockProgress()
      const states = progressUtil.computeStates(nodes, p, cfg)
      const grad = states.graduation || { avgScore: 0, passScore: 70, ready: false }
      if (states.finalState === 'locked') {
        return { ok: false, error: 'NOT_ALL_CHECKED_IN', message: '还有节点没有打卡，先走完全程再来申请' }
      }
      if (!grad.ready) {
        return {
          ok: false, error: 'SCORE_NOT_ENOUGH',
          message: '节点答题平均分 ' + grad.avgScore + ' 分，未达到毕业线 ' + grad.passScore + ' 分',
          avgScore: grad.avgScore, passScore: grad.passScore
        }
      }
      if (!p.finalExam) p.finalExam = { attempts: 0, best: 0, passed: false, lastTime: null }
      if (!p.finalExam.passed) {
        p.finalExam.passed = true
        p.finalExam.best = Math.max(p.finalExam.best || 0, grad.avgScore)
        p.finalExam.lastTime = Date.now()
        saveMockProgress(p)
      }
      return {
        ok: true, graduated: true,
        avgScore: grad.avgScore, passScore: grad.passScore,
        allPassed: states.passedCount === states.total,
        checkedCount: states.checkedCount, total: states.total
      }
    })
  }

  /** 交卷：判分 + 落库（mock 写 localStorage） */
  function contestSubmit(contestId, answers, durationMs) {
    if (config.USE_MOCK) {
      const list = mockContests()
      const c = list.find(x => x.id === contestId)
      if (!c || c.status !== 'in_progress') return Promise.resolve({ ok: false, error: 'CONTEST_NOT_FOUND' })
      const results = (answers || []).map(a => {
        const q = c.questions.find(x => x._id === a.id)
        const correct = q && sameSet(q.answer, a.answer)
        return {
          id: a.id, correct: !!correct,
          question: q ? q.question : '', options: q ? q.options : [],
          correctAnswer: q ? q.answer : [], explanation: q ? q.explanation : ''
        }
      })
      const correctCount = results.filter(r => r.correct).length
      const total = results.length || 1
      c.status = 'done'
      c.score = correctCount * contestRules().pointsPerQuestion
      c.correct = correctCount
      c.total = total
      c.durationMs = durationMs || 0
      c.answers = answers
      storeSet(STORAGE_CONTESTS, list)
      return Promise.resolve({ ok: true, score: c.score, correctCount, total, results, myStats: mockContestStats() })
    }
    return http('contest/submit', { contestId, answers, durationMs })
  }

  /** 排行榜：total 累计总分 / best 单场最佳（mock 只有本机成绩） */
  function contestLeaderboard(type) {
    if (config.USE_MOCK) {
      const done = mockContests().filter(c => c.status === 'done')
      const score = type === 'best'
        ? done.reduce((s, c) => Math.max(s, c.score), 0)
        : done.reduce((s, c) => s + c.score, 0)
      const p = mockProgress()
      const name = p.nickname || '我'
      return Promise.resolve({
        ok: true, type: type === 'best' ? 'best' : 'total',
        list: done.length ? [{ rank: 1, name, score, plays: done.length }] : [],
        myRank: done.length ? 1 : null
      })
    }
    return http('contest/leaderboard?type=' + (type === 'best' ? 'best' : 'total'))
  }

  /* ================= 答题挑战总分榜（11 节点 best 合计；mock 本机单用户） ================= */

  /** 总分榜：全部节点答题 best 之和，前 50 名 + 我的名次 */
  function challengeLeaderboard() {
    if (config.USE_MOCK) {
      return getConfig().then(cfg => {
        return getNodes().then(nodes => {
          const p = mockProgress()
          let total = 0
          let completed = 0
          nodes.forEach(n => {
            const q = p.quizScores && p.quizScores[n.code]
            if (q && q.best > 0) total += q.best
            if (q && q.passed) completed++
          })
          const name = p.nickname || '我'
          const list = (total > 0 || completed > 0)
            ? [{ rank: 1, userId: 'me', name, total, completed }]
            : []
          return { ok: true, list, myRank: list.length ? 1 : null, myId: list.length ? 'me' : null }
        })
      })
    }
    return http('challenge/leaderboard')
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


  return {
    getConfig,
    getNodes,
    getNode,
    forgotPassword,
  getProgress,
    getCheckins,
    saveNickname,
    checkin,
    getQuiz,
    submitQuiz,
    graduate,
    register,
    login,
    logout,
    me,
    devLogin,
    isLoggedIn,
    isGuest,
    guestLogin,
    contestStatus,
    contestStart,
    contestSubmit,
    contestLeaderboard,
    challengeLeaderboard,
    clearContestRecords
  }
})
