/**
 * 滚动叙事页数据 —— 中央红飘带路线 7 节点（于都出发 → 会宁会师）
 *
 * ⚠ 文案为占位内容，待文案组交付后替换。
 * 图片字段约定：assets/journey/{code}-old.jpg（历史画面）/ {code}-now.jpg（今日实景）
 *   留空串时渲染主题色块占位，素材到位后放目录即自动加载。
 * 数据驱动，不写死到视图。
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_MOCK_JOURNEY = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    title: '两万五千里',
    subtitle: '1934 — 1936',
    nodes: [
      {
        code: 'yudu',
        order: 1,
        name: '于都出发',
        date: '1934年10月',
        place: '江西省于都县',
        summary: '（占位文案）1934年10月，中央红军主力集结于都，夜渡于都河，踏上漫漫长征路。',
        caption: { history: '（占位）于都河渡口出发', modern: '（占位）今日于都河畔' },
        images: { history: '', modern: '' }
      },
      {
        code: 'xiangjiang',
        order: 2,
        name: '血战湘江',
        date: '1934年11月—12月',
        place: '广西兴安 · 湘江畔',
        summary: '（占位文案）湘江血战，红军以巨大牺牲突破第四道封锁线，人数由八万余锐减至三万。',
        caption: { history: '（占位）湘江战役油画', modern: '（占位）今日湘江' },
        images: { history: '', modern: '' }
      },
      {
        code: 'zunyi',
        order: 3,
        name: '遵义会议',
        date: '1935年1月',
        place: '贵州省遵义市',
        summary: '（占位文案）遵义会议在最危急关头挽救了党、挽救了红军，是党的历史上生死攸关的转折点。',
        caption: { history: '（占位）遵义会议会址老照片', modern: '（占位）今日遵义会议会址' },
        images: { history: '', modern: '' }
      },
      {
        code: 'luding',
        order: 4,
        name: '飞夺泸定桥',
        date: '1935年5月29日',
        place: '四川省泸定县',
        summary: '（占位文案）22 名突击队员攀着光溜溜的铁索，迎着枪林弹雨夺下泸定桥。',
        caption: { history: '（占位）铁索烽火老照片', modern: '（占位）今日泸定桥' },
        images: { history: '', modern: '' }
      },
      {
        code: 'jiajin',
        order: 5,
        name: '翻越夹金山',
        date: '1935年6月',
        place: '四川省宝兴县',
        summary: '（占位文案）夹金山终年积雪，红军将士单衣草鞋，征服了长征路上第一座大雪山。',
        caption: { history: '（占位）翻雪山老照片', modern: '（占位）今日雪山垭口' },
        images: { history: '', modern: '' }
      },
      {
        code: 'caodi',
        order: 6,
        name: '穿越草地',
        date: '1935年8月',
        place: '川西北松潘草地',
        summary: '（占位文案）茫茫泽国，泥潭遍布，红军以野菜充饥，走出了死亡陷阱般的松潘草地。',
        caption: { history: '（占位）过草地油画', modern: '（占位）今日松潘草地' },
        images: { history: '', modern: '' }
      },
      {
        code: 'huining',
        order: 7,
        name: '会宁会师',
        date: '1936年10月',
        place: '甘肃省会宁县',
        summary: '（占位文案）三大主力红军会宁会师，两万五千里长征胜利结束，中国革命翻开新的一页。',
        caption: { history: '（占位）会师老照片', modern: '（占位）今日会师纪念地' },
        images: { history: '', modern: '' }
      }
    ],
    ending: {
      title: '长征永远在路上',
      text: '每一代人有每一代人的长征路，每一代人都要走好自己的长征路。',
      action: '开始长征'
    }
  }
})
