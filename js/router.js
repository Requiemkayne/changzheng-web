/**
 * hash 路由 + tabBar —— 小程序 5 页面在网页端的等价物
 *
 * 路由表：
 *   #/                 首页（路线时间轴）
 *   #/node/{code}      节点详情
 *   #/quiz/{mode}/{code}  答题（mode=node 需 code；mode=final 无 code）
 *   #/map              地图
 *   #/profile          我的
 *
 * 视图对象约定（views/*.js 挂到 CZ_VIEWS）：
 *   { mount(root, params) => 渲染并绑定事件；可返回清理函数（unmount 时调用） }
 */
;(function (root) {
  const VIEWS = root.CZ_VIEWS || (root.CZ_VIEWS = {})
  let currentView = null
  let currentCleanup = null

  const TAB_OF = { home: 'home', node: 'home', quiz: 'home', map: 'map', profile: 'profile' }

  function parseHash() {
    const segs = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
    if (!segs.length) return { name: 'home', params: {} }
    if (segs[0] === 'node' && segs[1]) return { name: 'node', params: { code: segs[1] } }
    if (segs[0] === 'quiz' && segs[1]) {
      return { name: 'quiz', params: { mode: segs[1], code: segs[2] || null } }
    }
    if (segs[0] === 'map') return { name: 'map', params: {} }
    if (segs[0] === 'profile') return { name: 'profile', params: {} }
    return { name: 'home', params: {} }
  }

  function updateTab(name) {
    document.querySelectorAll('#tabbar .tab').forEach(t => {
      t.classList.toggle('tab-active', t.dataset.tab === TAB_OF[name])
    })
  }

  function render() {
    const { name, params } = parseHash()
    const view = VIEWS[name]
    if (!view) {
      document.getElementById('app').innerHTML = '<div class="page-center"><div class="page-center-icon">🏮</div><div>页面不存在</div></div>'
      return
    }
    if (currentCleanup) { try { currentCleanup() } catch (e) { console.error(e) } }
    currentView = name
    const cleanup = view.mount(document.getElementById('app'), params)
    currentCleanup = (typeof cleanup === 'function') ? cleanup : null
    updateTab(name)
    window.scrollTo(0, 0)
  }

  window.addEventListener('hashchange', render)
  window.addEventListener('DOMContentLoaded', render)

  root.CZ_ROUTER = {
    go(path) { location.hash = path },
    back() { history.length > 1 ? history.back() : (location.hash = '#/') }
  }
})(typeof self !== 'undefined' ? self : this)
