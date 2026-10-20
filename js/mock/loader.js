/**
 * 答案题库按需加载 —— 仅 mock 模式注入 js/mock/questions.js
 *
 * 为什么不写在 index.html 的 <script> 标签里：
 *   questions.js 含每题 answer / explanation，后端模式（http 模式由服务端判分）
 *   的用户本不该拿到答案，因此该文件只在 mock 模式下被请求。
 *
 * 必须保持「解析期同步注入」：document.write 在解析阶段插入的脚本会立即执行，
 * 且顺序排在其后的脚本之前 —— 于是 js/api.js 读 window.CZ_MOCK_QUESTIONS 时
 * 题库已就绪。若本文件被延迟/异步加载（defer、动态插入后加载），注入会失效。
 */
;(function (root) {
  if (!root.CZ_CONFIG || !root.CZ_CONFIG.USE_MOCK) return
  document.write('<script src="js/mock/questions.js"><\/script>')
})(typeof self !== 'undefined' ? self : this)
