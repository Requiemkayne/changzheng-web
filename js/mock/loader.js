/**
 * 答案题库按需加载 —— 仅在「无法 fetch 本地文件」的 file:// 场景同步注入
 *
 * 为什么改成默认不注入：
 *   questions.js 含每题 answer / explanation。之前用 document.write 无条件注入，
 *   任何人在页面源码 / 控制台里都能一把拿到全部 43 题及正确答案（也就是「漏题」）。
 *   现在 http(s) 下改由 js/api.js 在真正取题时 fetch，首屏加载不含题库；
 *   file:// 双击预览没有 fetch，才退回这里的同步注入。
 *
 * 必须保持「解析期同步注入」这一支的实现方式：document.write 在解析阶段插入的
 * 脚本会立即执行，且排在后续脚本之前 —— 于是 js/api.js 读 window.CZ_MOCK_QUESTIONS
 * 时题库已就绪。若该分支改用 defer / 动态插入，注入会失效。
 */
;(function (root) {
  if (!root.CZ_CONFIG || !root.CZ_CONFIG.USE_MOCK) return
  // http(s) 有 fetch：交给 api.js 懒加载，别在首屏把整包答案塞进页面
  var proto = (typeof location !== 'undefined' && location.protocol) || ''
  if (proto && proto !== 'file:') return
  document.write('<script src="js/mock/questions.js"><\/script>')
})(typeof self !== 'undefined' ? self : this)
