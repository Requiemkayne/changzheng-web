/**
 * 节点天气数据 —— 11 个节点全都有天气描述，但只有气候特征明显的才带视觉特效
 *
 * 字段：
 *   label  天气名（详情页/浮窗统一展示）
 *   desc   一句历史/气候说明
 *   mode   视觉特效：rain / snow / fog / cloud；null = 不加载特效
 *
 * 数据驱动：换个说法只改本文件，地图页与节点详情页同时生效。
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_MOCK_WEATHER = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    ruijin: {
      label: '秋晴',
      desc: '十月赣南秋高气爽，红军夜渡于都河，踏上远征。',
      mode: null
    },
    xiangjiang: {
      label: '冬雨连绵',
      desc: '1934 年冬，冷雨中的湘江血战，红军付出巨大牺牲突破第四道封锁线。',
      mode: 'rain'
    },
    zunyi: {
      label: '阴云湿冷',
      desc: '黔北一月阴云低垂、湿冷入骨，会议在最危急的关头召开。',
      mode: 'cloud'
    },
    'sidu-chishui': {
      label: '河谷晨雾',
      desc: '赤水河谷冬季多雾，红军借雾四渡，摆脱数十万追兵。',
      mode: 'fog'
    },
    jinshajiang: {
      label: '干热晴空',
      desc: '五月金沙江干热河谷，晴空少雨，红军巧渡皎平渡。',
      mode: null
    },
    daduhe: {
      label: '峡谷阴云',
      desc: '大渡河峡谷五月阴云压顶，水急浪高，十七勇士强渡安顺场。',
      mode: 'cloud'
    },
    luding: {
      label: '峡谷急雨',
      desc: '泸定桥头骤雨，铁索湿滑，二十二名突击队员攀索夺桥。',
      mode: 'rain'
    },
    xueshan: {
      label: '风雪交加',
      desc: '六月飞雪，单衣草鞋翻越终年积雪的夹金山。',
      mode: 'snow'
    },
    caodi: {
      label: '浓雾弥漫',
      desc: '松潘草地沼泽遍布，浓雾中不辨方向，七日七夜走出死亡陷阱。',
      mode: 'fog'
    },
    lazikou: {
      label: '高原秋晴',
      desc: '九月甘南秋高气爽，腊子口天险在晨光中被攻克。',
      mode: null
    },
    huining: {
      label: '晴空万里',
      desc: '1936 年 10 月，会宁晴空下三大主力会师，长征胜利结束。',
      mode: null
    }
  }
})
