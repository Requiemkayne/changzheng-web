/**
 * 3D 地图样例共享数据 —— 11 个节点（与 js/mock/nodes.js 一致）
 * state 仅用于演示四种状态配色：quizPassed / checkedIn / open / locked
 */
window.CZ3D = {
  nodes: [
    { code: 'ruijin',        order: 1,  name: '瑞金出发',   date: '1934年10月',        place: '江西省瑞金市',       lng: 116.03, lat: 25.89, state: 'quizPassed' },
    { code: 'xiangjiang',    order: 2,  name: '湘江战役',   date: '1934年11月—12月',   place: '广西兴安县',         lng: 110.55, lat: 25.53, state: 'quizPassed' },
    { code: 'zunyi',         order: 3,  name: '遵义会议',   date: '1935年1月',         place: '贵州省遵义市',       lng: 106.93, lat: 27.73, state: 'checkedIn' },
    { code: 'sidu-chishui',  order: 4,  name: '四渡赤水',   date: '1935年1月—3月',     place: '贵州省习水县',       lng: 105.70, lat: 28.59, state: 'open' },
    { code: 'jinshajiang',   order: 5,  name: '巧渡金沙江', date: '1935年5月',         place: '云南省禄劝县皎平渡', lng: 102.53, lat: 26.32, state: 'locked' },
    { code: 'daduhe',        order: 6,  name: '强渡大渡河', date: '1935年5月',         place: '四川省石棉县安顺场', lng: 102.36, lat: 29.23, state: 'locked' },
    { code: 'luding',        order: 7,  name: '飞夺泸定桥', date: '1935年5月29日',     place: '四川省泸定县',       lng: 102.23, lat: 29.91, state: 'locked' },
    { code: 'xueshan',       order: 8,  name: '爬雪山',     date: '1935年6月',         place: '四川省小金县夹金山', lng: 102.68, lat: 31.60, state: 'locked' },
    { code: 'caodi',         order: 9,  name: '过草地',     date: '1935年8月',         place: '四川省松潘草地',     lng: 102.90, lat: 32.95, state: 'locked' },
    { code: 'lazikou',       order: 10, name: '激战腊子口', date: '1935年9月',         place: '甘肃省迭部县',       lng: 103.89, lat: 34.23, state: 'locked' },
    { code: 'huining',       order: 11, name: '会宁会师',   date: '1936年10月',        place: '甘肃省会宁县',       lng: 105.08, lat: 35.68, state: 'locked' }
  ],
  /* 四态配色（与站点地图页一致） */
  style: {
    quizPassed: { fill: '#C6A343', stroke: '#FFFFFF', label: '#FFF4DC' },
    checkedIn:  { fill: '#C8102E', stroke: '#E8C86A', label: '#FFF4DC' },
    open:       { fill: '#FFF6E2', stroke: '#821626', label: '#821626' },
    locked:     { fill: '#B7AD97', stroke: '#FFFFFF', label: '#FFF4DC' }
  },
  stateText: { quizPassed: '已通关', checkedIn: '已打卡', open: '待打卡', locked: '未解锁' }
}
