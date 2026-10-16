/**
 * 长征精神文案（纪念红军长征胜利 90 周年）
 * 来源：求是网专题「赓续长征精神 奋进复兴征程」、共产党员网「伟大长征精神」专题
 * 纯静态展示数据，mock / http 模式通用（不随 API 下发）
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_SPIRIT = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    anniversary: {
      badge: '纪念红军长征胜利 90 周年',
      years: '1936 — 2026',
      theme: '赓续长征精神 · 奋进复兴征程'
    },
    // 伟大长征精神（习近平在纪念红军长征胜利 80 周年大会上的讲话，五条官方表述精简版）
    spirit: [
      { k: '理想信念', t: '坚定革命的理想和信念，坚信正义事业必然胜利' },
      { k: '不怕牺牲', t: '不怕任何艰难险阻，不惜付出一切牺牲' },
      { k: '实事求是', t: '独立自主、实事求是，一切从实际出发' },
      { k: '顾全大局', t: '顾全大局、严守纪律、紧密团结' },
      { k: '依靠人民', t: '同人民群众生死相依、患难与共、艰苦奋斗' }
    ],
    quote: '每一代人有每一代人的长征路，每一代人都要走好自己的长征路。'
  }
})
