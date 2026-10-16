/**
 * hash 路由 + tabBar —— 小程序 5 页面在网页端的等价物
 *
 * 路由表：
 *   #/login           登录（http 模式未登录时的第一屏）
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

  const TAB_OF = { home: 'home', node: 'home', quiz: 'home', map: 'map', profile: 'profile', contest: 'profile', leaderboard: 'profile' }

  function parseHash() {
    const segs = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
    if (!segs.length) return { name: 'home', params: {} }
    if (segs[0] === 'login') return { name: 'login', params: {} }
    if (segs[0] === 'node' && segs[1]) return { name: 'node', params: { code: segs[1] } }
    if (segs[0] === 'quiz' && segs[1]) {
      return { name: 'quiz', params: { mode: segs[1], code: segs[2] || null } }
    }
    if (segs[0] === 'map') return { name: 'map', params: {} }
    if (segs[0] === 'profile') return { name: 'profile', params: {} }
    if (segs[0] === 'contest') return { name: 'contest', params: {} }
    if (segs[0] === 'leaderboard') return { name: 'leaderboard', params: {} }
    return { name: 'home', params: {} }
  }

  function updateTab(name) {
    document.querySelectorAll('#tabbar .tab').forEach(t => {
      t.classList.toggle('tab-active', t.dataset.tab === TAB_OF[name])
    })
  }

  function render() {
    let { name, params } = parseHash()
    // 路由守卫：http 模式未登录 → 登录页（登录页为第一屏）
    if (!config.USE_MOCK && !api.isLoggedIn() && name !== 'login') {
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
    // 登录页全屏无 tabBar；底部无 padding
    document.getElementById('tabbar').style.display = name === 'login' ? 'none' : 'flex'
    document.getElementById('app').classList.toggle('no-tab', name === 'login')
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
