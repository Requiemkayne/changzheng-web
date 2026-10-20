/**
 * 网页版配置（与 miniprogram/config.js 同构）
 *
 * USE_MOCK 运行时自动判定：
 *   mock 模式  → file:// 双击打开 / GitHub Pages / ?mock=1 强制
 *   http 模式  → 通过 node server/server.js 访问（http://localhost:8088），?http=1 强制
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
    if (q.get('mock') === '1') {
      USE_MOCK = true
    } else if (q.get('http') === '1') {
      USE_MOCK = false
    } else {
      // 静态托管环境（无后端）：file:// 或 GitHub Pages → mock
      USE_MOCK = location.protocol === 'file:' || /\.github\.io$/.test(location.hostname)
    }
  }

  /* ================= 演示免登录（自动登录 demo 账号） =================
   * 生效范围：
   *   - 内网穿透域名（trycloudflare / ngrok / loca.lt）→ 默认开启，链接点开直接进
   *   - 本地 / 局域网 → 需要显式带 ?demo=1
   *   - 自有公网域名 → 不生效（避免把演示账号暴露到正式站点）
   * 想强制看登录页：任何地址加 ?login=1
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
    const wantDemo = IS_TUNNEL_HOST || (IS_LOCAL_HOST && q.get('demo') === '1')
    if (wantDemo && !forceLogin) {
      DEV_AUTO_LOGIN = { username: 'demo', password: 'demo1234', nickname: '演示用户' }
    }
  }

  return {
    USE_MOCK: USE_MOCK,
    API_BASE: '',            // 后端接口根地址（'' = 同源；后端部署他处时填 http://ip:port）
    CACHE_TTL: 10 * 60 * 1000,
    DEV_AUTO_LOGIN: DEV_AUTO_LOGIN   // 见上方说明，默认关闭
  }
})
