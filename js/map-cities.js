/**
 * 城市标注数据（2D 路线图与 3D 沙盘共用）
 *
 * 收录范围：省级行政中心（省会/首府）+ 直辖市 + 长征沿途重点城市。
 * 坐标取城市中心点的近似经纬度（WGS-84，两位小数），仅用于示意标注，
 * 不作测绘依据 —— 与 map-provinces.js / map-factions.js 的口径一致。
 *
 * 字段：
 *   name  城市名（去掉「市」字，地图空间小）
 *   c     [lng, lat]
 *   lv    级别：'capital' 省会/首府 · 'municipality' 直辖市 · 'key' 长征重点城市
 *   pin   可选，长征节点所在城市（与 nodes.js 的 code 对应）
 */
;(function (root) {
  root.CZ_MAP_CITIES = [
    /* ---- 直辖市 ---- */
    { name: '北京', c: [116.41, 39.90], lv: 'municipality' },
    { name: '天津', c: [117.20, 39.13], lv: 'municipality' },
    { name: '上海', c: [121.47, 31.23], lv: 'municipality' },
    { name: '重庆', c: [106.55, 29.56], lv: 'municipality' },

    /* ---- 省会 / 首府 ---- */
    { name: '石家庄', c: [114.51, 38.04], lv: 'capital' },
    { name: '太原', c: [112.55, 37.87], lv: 'capital' },
    { name: '呼和浩特', c: [111.75, 40.84], lv: 'capital' },
    { name: '沈阳', c: [123.43, 41.80], lv: 'capital' },
    { name: '长春', c: [125.32, 43.82], lv: 'capital' },
    { name: '哈尔滨', c: [126.53, 45.80], lv: 'capital' },
    { name: '南京', c: [118.80, 32.06], lv: 'capital' },
    { name: '杭州', c: [120.15, 30.28], lv: 'capital' },
    { name: '合肥', c: [117.28, 31.86], lv: 'capital' },
    { name: '福州', c: [119.30, 26.08], lv: 'capital' },
    { name: '南昌', c: [115.86, 28.68], lv: 'capital' },
    { name: '济南', c: [117.00, 36.65], lv: 'capital' },
    { name: '郑州', c: [113.63, 34.75], lv: 'capital' },
    { name: '武汉', c: [114.30, 30.59], lv: 'capital' },
    { name: '长沙', c: [112.94, 28.23], lv: 'capital' },
    { name: '广州', c: [113.26, 23.13], lv: 'capital' },
    { name: '南宁', c: [108.37, 22.82], lv: 'capital' },
    { name: '海口', c: [110.20, 20.04], lv: 'capital' },
    { name: '成都', c: [104.07, 30.57], lv: 'capital' },
    { name: '贵阳', c: [106.63, 26.65], lv: 'capital' },
    { name: '昆明', c: [102.83, 24.88], lv: 'capital' },
    { name: '拉萨', c: [91.11, 29.65], lv: 'capital' },
    { name: '西安', c: [108.95, 34.34], lv: 'capital' },
    { name: '兰州', c: [103.83, 36.06], lv: 'capital' },
    { name: '西宁', c: [101.78, 36.62], lv: 'capital' },
    { name: '银川', c: [106.23, 38.49], lv: 'capital' },
    { name: '乌鲁木齐', c: [87.62, 43.82], lv: 'capital' },

    /* ---- 长征沿途重点城市（节点落地城市 + 关键转折地） ---- */
    { name: '瑞金', c: [116.03, 25.89], lv: 'key', pin: 'ruijin' },
    { name: '兴安', c: [110.67, 25.61], lv: 'key', pin: 'xiangjiang' },
    { name: '遵义', c: [106.93, 27.73], lv: 'key', pin: 'zunyi' },
    { name: '茅台', c: [106.37, 27.85], lv: 'key' },
    { name: '赤水', c: [105.70, 28.58], lv: 'key', pin: 'sidu-chishui' },
    { name: '皎平渡', c: [102.55, 26.30], lv: 'key', pin: 'jinshajiang' },
    { name: '安顺场', c: [102.30, 29.20], lv: 'key', pin: 'daduhe' },
    { name: '泸定', c: [102.23, 29.91], lv: 'key', pin: 'luding' },
    { name: '夹金山', c: [102.72, 30.87], lv: 'key', pin: 'xueshan' },
    { name: '若尔盖', c: [102.96, 33.57], lv: 'key', pin: 'caodi' },
    { name: '腊子口', c: [103.60, 34.15], lv: 'key', pin: 'lazikou' },
    { name: '会宁', c: [105.05, 35.70], lv: 'key', pin: 'huining' },
    { name: '延安', c: [109.49, 36.60], lv: 'key' },
    { name: '井冈山', c: [114.17, 26.57], lv: 'key' },
    { name: '韶山', c: [112.53, 27.92], lv: 'key' },
    { name: '百色', c: [106.62, 23.90], lv: 'key' }
  ]
})(typeof self !== 'undefined' ? self : this)
