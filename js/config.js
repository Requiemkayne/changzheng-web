/**
 * 网页版配置（与 miniprogram/config.js 同构）
 *
 * USE_MOCK 运行时判定（显式参数优先于自动判定）：
 *   ?mock=1 强制 mock / ?mock=0 强制后端（本地静态服务端口也适用，如 http://127.0.0.1:5500）
 *   自动判定：mock 模式 → file:// 双击打开 / GitHub Pages
 *             http 模式 → 通过 node server/server.js 访问（http://localhost:8088）
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_CONFIG = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  let USE_MOCK = false

  // 仅浏览器环境探测；Node（server / test）按 false 处理
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search)
    const mockParam = q.get('mock')
    if (mockParam === '1') {
      USE_MOCK = true          // 显式强制 mock（优先于下面所有自动判定）
    } else if (mockParam === '0') {
      USE_MOCK = false         // 显式强制后端模式
    } else if (q.get('http') === '1') {
      USE_MOCK = false
    } else {
      // 静态托管环境（无后端）：file:// 或 GitHub Pages → mock
      USE_MOCK = location.protocol === 'file:' || /\.github\.io$/.test(location.hostname)
    }
  }

  /* ================= 演示免登录（自动登录 demo 账号） =================
   * 【演示登录必须显式开启】无论本地 / 局域网还是内网穿透域名，
   * 都必须在 URL 上显式带 ?demo=1 才会自动登录；凭据仍硬编码在前端，
   * 所以绝不能因为「域名像隧道」就默认放行 —— 否则任何拿到隧道链接的人都等于拿到 demo 账号。
   *   - 本地 / 局域网（localhost / 127. / 10. / 192.168. / 172.16-31.）→ 需 ?demo=1
   *   - 内网穿透域名（trycloudflare / ngrok / loca.lt）→ 同样需 ?demo=1
   *   - 自有公网域名 → 不生效（避免把演示账号暴露到正式站点）
   * 想强制看登录页：任何地址加 ?login=1（优先级高于 ?demo=1）
   */
  let DEV_AUTO_LOGIN = null
  const HOST = (typeof location !== 'undefined' && location.hostname) || ''
  const IS_TUNNEL_HOST = /(^|\.)(trycloudflare\.com|ngrok-free\.app|ngrok\.io|loca\.lt)$/.test(HOST)
  const IS_LOCAL_HOST = HOST === 'localhost' ||
    /^127\./.test(HOST) ||
    HOST === '::1' || HOST === '[::1]' ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(HOST)
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search)
    const forceLogin = q.get('login') === '1'
    const wantDemo = (IS_LOCAL_HOST || IS_TUNNEL_HOST) && q.get('demo') === '1'
    if (wantDemo && !forceLogin) {
      DEV_AUTO_LOGIN = { username: 'demo', password: 'demo1234', nickname: '演示用户' }
    }
  }

  return {
    USE_MOCK: USE_MOCK,
    API_BASE: '',            // 后端接口根地址（'' = 同源；后端部署他处时填 http://ip:port）
    CACHE_TTL: 10 * 60 * 1000,
    DEV_AUTO_LOGIN: DEV_AUTO_LOGIN,  // 见上方说明，默认关闭

    // ?demo=1 视为「强制进入演示」：即使当前登录着别的账号，也切到演示账号。
    // 用于「打开链接就应该是全通关状态」的演示场景。
    DEMO_FORCE: (typeof location !== 'undefined') &&
      ((/^127\./.test(HOST) || HOST === 'localhost' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(HOST) || IS_TUNNEL_HOST) &&
       new URLSearchParams(location.search).get('demo') === '1' &&
       new URLSearchParams(location.search).get('login') !== '1')
  }
})
