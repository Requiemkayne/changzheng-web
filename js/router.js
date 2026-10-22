/**
 * hash 路由 + tabBar —— 小程序 5 页面在网页端的等价物
 *
 * 路由表：
 *   #/login           登录（http 模式未登录时的第一屏；mock 模式含游客体验入口）
 *   #/logout          退出（清会话 / 游客态后回 #/login）
 *   #/                 首页（路线时间轴）
 *   #/node/{code}      节点详情
 *   #/quiz/{mode}/{code}  答题（mode=node 需 code；mode=final 无 code）
 *   #/map              地图
 *   #/profile          我的
 *
 * 路由守卫：http 模式 + 未登录 → 一律重定向登录页（除 #/login 本身）
 *
 * 视图对象约定（views/*.js 挂到 CZ_VIEWS）：
 *   { mount(root, params) => 渲染并绑定事件；可返回清理函数（unmount 时调用） }
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  const config = root.CZ_CONFIG
  const api = root.CZ_API
  let currentView = null
  let currentCleanup = null

  const TAB_OF = { home: 'home', node: 'home', quiz: 'home', result: 'home', map: 'map', profile: 'profile', contest: 'profile', leaderboard: 'profile' }

  function parseHash() {
    const segs = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
    if (!segs.length) return { name: 'home', params: {} }
    if (segs[0] === 'login') return { name: 'login', params: {} }
    if (segs[0] === 'logout') return { name: 'logout', params: {} }
    if (segs[0] === 'node' && segs[1]) return { name: 'node', params: { code: segs[1] } }
    if (segs[0] === 'quiz' && segs[1]) {
      return { name: 'quiz', params: { mode: segs[1], code: segs[2] || null } }
    }
    if (segs[0] === 'map') return { name: 'map', params: {} }
    if (segs[0] === 'result') return { name: 'result', params: {} }
    if (segs[0] === 'profile') return { name: 'profile', params: {} }
    if (segs[0] === 'contest') return { name: 'contest', params: {} }
    if (segs[0] === 'leaderboard') return { name: 'leaderboard', params: {} }
    if (segs[0] === 'journey') return { name: 'journey', params: {} }
    return { name: 'home', params: {} }
  }

  function updateTab(name) {
    document.querySelectorAll('#tabbar .tab').forEach(t => {
      t.classList.toggle('tab-active', t.dataset.tab === TAB_OF[name])
    })
  }

  // 首次体验：无打卡进度且未进入 → 欢迎页开场（?intro=0 调试跳过）
  function isFirstVisit() {
    if (new URLSearchParams(location.search).get('intro') === '0') return false
    if (!config.USE_MOCK) return !api.isLoggedIn()
    // mock 模式：游客体验已进入 → 不再回首场（否则登录页 → 首场 → 登录页会成环）
    if (api.isGuest()) return false
    try {
      const p = JSON.parse(localStorage.getItem('cz_progress') || 'null')
      return !(p && Object.keys(p.checkins || {}).length)
    } catch (e) { return true }
  }

  // ★ 开发开关（config.DEV_AUTO_LOGIN）：进入页面前静默登录演示账号，屏蔽登录页
  let demoLoginTried = false
  function ensureDemoLogin() {
    if (!config.DEV_AUTO_LOGIN || demoLoginTried || api.isLoggedIn()) return null
    demoLoginTried = true
    return api.devLogin()
  }

  function render() {
    // 演示账号：未登录则先静默登录，成功/失败后再渲染（失败回落登录页，只尝试一次）
    const pending = ensureDemoLogin()
    if (pending) {
      pending.then(() => render(), err => {
        console.warn('[dev] 演示账号自动登录失败，回落登录页：', err && err.message)
        render()
      })
      return
    }
    let { name, params } = parseHash()
    // 退出（#/logout）：清会话 / 游客态后回登录页
    if (name === 'logout') {
      document.getElementById('tabbar').style.display = 'none'
      document.getElementById('app').innerHTML =
        '<div class="page-center">' + root.CZ_UI.icon('lantern', 'page-center-icon') + '<div>正在退出…</div></div>'
      api.logout().then(() => {
        root.CZ_UI.toast('已退出')
        location.hash = '#/login'
      })
      return
    }
    // 演示账号开启时（config.DEV_AUTO_LOGIN），http 模式已登录则 #/login 视为首页；
    // mock 模式不做此重定向：#/login 是访客的入口页，页内有「游客体验」出口（js/views/login.js）
    if (name === 'login' && !config.USE_MOCK && config.DEV_AUTO_LOGIN && api.isLoggedIn()) {
      name = 'home'
      params = {}
    }
    // 首次体验（打开即首页）→ 欢迎页开场
    if (name === 'home' && isFirstVisit()) {
      name = 'journey'
    }
    // 路由守卫：http 模式未登录 → 登录页（登录页为第一屏；叙事页可自由浏览）
    if (!config.USE_MOCK && !api.isLoggedIn() && name !== 'login' && name !== 'journey') {
      name = 'login'
      params = {}
    }
    const view = VIEWS[name]
    if (!view) {
      document.getElementById('app').innerHTML = '<div class="page-center">' + root.CZ_UI.icon('lantern', 'page-center-icon') + '<div>页面不存在</div></div>'
      return
    }
    if (currentCleanup) { try { currentCleanup() } catch (e) { console.error(e) } }
    currentView = name
    const cleanup = view.mount(document.getElementById('app'), params)
    currentCleanup = (typeof cleanup === 'function') ? cleanup : null
    // 登录页 / 滚动叙事页全屏无 tabBar；底部无 padding
    const fullscreen = name === 'login' || name === 'journey'
    document.getElementById('tabbar').style.display = fullscreen ? 'none' : 'flex'
    document.getElementById('app').classList.toggle('no-tab', fullscreen)
    updateTab(name)
    window.scrollTo(0, 0)
  }

  window.addEventListener('hashchange', render)
  window.addEventListener('DOMContentLoaded', render)

  // 会话失效/未登录（api.js 在 401 时派发）→ 引导去登录页
  window.addEventListener('cz:unauthorized', () => {
    if (root.CZ_UI) root.CZ_UI.toast('请先登录')
    if (parseHash().name !== 'login') location.hash = '#/login'
  })

  root.CZ_ROUTER = {
    go(path) { location.hash = path },
    back() { history.length > 1 ? history.back() : (location.hash = '#/') },
    refresh() { render() } // 强制重渲染（hash 未变化时 hashchange 不触发）
  }
})(typeof self !== 'undefined' ? self : this)
