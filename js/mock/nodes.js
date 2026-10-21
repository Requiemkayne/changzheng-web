/**
 * 节点占位数据（与 miniprogram/mock/nodes.js、cloudfunctions/initData/seed/nodes.js 同构）
 *
 * ⚠ 全部文案为占位内容，待文案组交付后替换。
 * 结构说明见 data/nodes.example.json。
 * 图片字段留空串，渲染层自动显示主题色块兜底。
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_MOCK_NODES = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return [
    {
      order: 1,
      code: 'ruijin',
      category: 'march',
      name: '瑞金出发',
      subtitle: '长征从这里开始',
      date: '1934年10月',
      stage: '出发与转移',
      location: { name: '江西省瑞金市', longitude: 116.03, latitude: 25.89 },
      summary: '（占位文案）1934年10月，中央红军从江西瑞金出发，开始了两万五千里长征。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）1934年10月，由于第五次反"围剿"失败，中央红军被迫实行战略转移，从江西瑞金等地出发，踏上了漫漫长征路。' },
          { type: 'timeline', items: [
            { date: '1934-10-10', text: '（占位）中央红军主力从瑞金出发' },
            { date: '1934-10-21', text: '（占位）突破国民党军第一道封锁线' }
          ]},
          { type: 'quote', text: '红军不怕远征难，万水千山只等闲。' },
          { type: 'dataCard', label: '出发时兵力', value: '8.6万余人' }
        ]
      },
      images: { cover: 'assets/route/ruijin.webp', illustrations: [] },
      quiz: { questionIds: ['q-ruijin-1', 'q-ruijin-2', 'q-ruijin-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 2,
      code: 'xiangjiang',
      category: 'battle',
      name: '湘江战役',
      subtitle: '血战湘江',
      date: '1934年11月—12月',
      stage: '出发与转移',
      location: { name: '广西兴安县', longitude: 110.55, latitude: 25.53 },
      summary: '（占位文案）湘江战役是长征途中最惨烈的一战，红军付出重大牺牲突破封锁。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）1934年11月下旬，中央红军在湘江与数倍于己的敌军血战，突破了国民党军第四道封锁线。' },
          { type: 'image', src: '', caption: '（占位）湘江战役旧址（画师素材待交付）' },
          { type: 'paragraph', text: '（占位文案）湘江血战使中央红军从出发时的8.6万余人锐减至3万余人。' },
          { type: 'dataCard', label: '战后兵力', value: '3万余人' }
        ]
      },
      images: { cover: 'assets/route/xiangjiang.webp', illustrations: [] },
      quiz: { questionIds: ['q-xiangjiang-1', 'q-xiangjiang-2', 'q-xiangjiang-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 3,
      code: 'zunyi',
      category: 'event',
      name: '遵义会议',
      subtitle: '伟大的转折',
      date: '1935年1月',
      stage: '转折与机动',
      location: { name: '贵州省遵义市', longitude: 106.93, latitude: 27.73 },
      summary: '（占位文案）遵义会议确立了毛泽东在红军和党中央的领导地位，是党的历史上生死攸关的转折点。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）1935年1月15日至17日，中共中央政治局在遵义召开扩大会议，纠正了"左"倾军事路线错误。' },
          { type: 'quote', text: '（占位）遵义会议是党的历史上一个生死攸关的转折点。' },
          { type: 'dataCard', label: '会议时间', value: '1935年1月15—17日' },
          { type: 'dataCard', label: '历史意义', value: '确立正确领导' }
        ]
      },
      images: { cover: 'assets/route/zunyi.webp', illustrations: [] },
      quiz: { questionIds: ['q-zunyi-1', 'q-zunyi-2', 'q-zunyi-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 4,
      code: 'sidu-chishui',
      category: 'battle',
      name: '四渡赤水',
      subtitle: '运动战的典范',
      date: '1935年1月—3月',
      stage: '转折与机动',
      location: { name: '贵州省习水县', longitude: 105.7, latitude: 28.59 },
      summary: '三个月内四次渡过赤水河，在川黔滇边把敌军拖得团团转，跳出了四十万重兵的合围。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1935年1月，遵义会议召开，纠正了“左”倾军事错误，重新确立毛泽东在党中央和红军的领导地位。此时中央红军刚完成长征初期突围，蒋介石调集国民党重兵，在川、黔、滇交界布下包围圈，企图将中央红军围歼于这一区域。' },
          { type: 'paragraph', text: '为摆脱敌军围追堵截、争取战略主动权，中央红军于1935年1月19日至3月22日，在赤水河流域开展机动运动战，也就是四渡赤水战役。' },
          { type: 'timeline', items: [
            { date: '1935-01-29', text: '一渡赤水：西渡赤水河进入川南，摆脱追兵' },
            { date: '1935-02-18', text: '二渡赤水：回师黔北，再占娄山关、遵义城' },
            { date: '1935-03-16', text: '三渡赤水：再入川南，诱敌西进' },
            { date: '1935-03-21', text: '四渡赤水：折返东进，南渡乌江，跳出合围' }
          ]},
          { type: 'dataCard', label: '大小战役', value: '40余次' },
          { type: 'dataCard', label: '战役评价', value: '得意之笔' }
        ]
      },
      images: { cover: 'assets/route/sidu.webp', illustrations: [] },
      quiz: { questionIds: ['q-sidu-1', 'q-sidu-2', 'q-sidu-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 5,
      code: 'jinshajiang',
      category: 'march',
      name: '巧渡金沙江',
      subtitle: '跳出包围圈',
      date: '1935年5月',
      stage: '转折与机动',
      location: { name: '云南省禄劝县皎平渡', longitude: 102.53, latitude: 26.32 },
      summary: '（占位文案）红军巧渡金沙江，摆脱了数十万敌军的围追堵截，取得战略转移中具有决定意义的胜利。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）1935年5月，红军在皎平渡等地依靠7只小船，用7天7夜渡过金沙江。' },
          { type: 'quote', text: '（占位）金沙水拍云崖暖，大渡桥横铁索寒。' },
          { type: 'dataCard', label: '渡江船只', value: '7只小船' }
        ]
      },
      images: { cover: 'assets/route/jinsha.webp', illustrations: [] },
      quiz: { questionIds: ['q-jinshajiang-1', 'q-jinshajiang-2', 'q-jinshajiang-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 6,
      code: 'daduhe',
      category: 'battle',
      name: '强渡大渡河',
      subtitle: '十七勇士',
      date: '1935年5月',
      stage: '转折与机动',
      location: { name: '四川省石棉县安顺场', longitude: 102.36, latitude: 29.23 },
      summary: '（占位文案）17名勇士冒着枪林弹雨强渡大渡河，打开红军北上的通道。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）1935年5月，红军先遣队在安顺场强渡大渡河，17名勇士驾小船在敌军火力下成功登岸。' },
          { type: 'dataCard', label: '勇士人数', value: '17名' },
          { type: 'paragraph', text: '（占位文案）为加快全军渡河速度，红军随即决定飞夺泸定桥。' }
        ]
      },
      images: { cover: 'assets/route/dadu.webp', illustrations: [] },
      quiz: { questionIds: ['q-daduhe-1', 'q-daduhe-2', 'q-daduhe-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 7,
      code: 'luding',
      category: 'battle',
      name: '飞夺泸定桥',
      subtitle: '十三根铁索',
      date: '1935年5月',
      stage: '转折与机动',
      location: { name: '四川省泸定县', longitude: 102.23, latitude: 29.91 },
      summary: '（占位文案）22名突击队员沿13根铁索飞夺泸定桥，创造了长征史上的奇迹。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）泸定桥桥板被敌军拆除，红军突击队员攀着13根铁索，冒着密集火力冲向对岸。' },
          { type: 'image', src: '', caption: '（占位）泸定桥（画师素材待交付）' },
          { type: 'dataCard', label: '突击队员', value: '22名' },
          { type: 'dataCard', label: '铁索数量', value: '13根' }
        ]
      },
      images: { cover: 'assets/route/luding.webp', illustrations: [] },
      quiz: { questionIds: ['q-luding-1', 'q-luding-2', 'q-luding-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 8,
      code: 'xueshan',
      category: 'march',
      name: '爬雪山',
      subtitle: '翻越夹金山',
      date: '1935年6月',
      stage: '艰难北上',
      location: { name: '四川省小金县夹金山', longitude: 102.68, latitude: 31.6 },
      summary: '（占位文案）红军翻越海拔4000多米的夹金山，挑战人类生存极限。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）1935年6月，红军翻越终年积雪的夹金山，许多战士永远留在了雪山上。' },
          { type: 'quote', text: '更喜岷山千里雪，三军过后尽开颜。' },
          { type: 'dataCard', label: '夹金山海拔', value: '4114米' }
        ]
      },
      images: { cover: 'assets/route/xueshan.webp', illustrations: [] },
      quiz: { questionIds: ['q-xueshan-1', 'q-xueshan-2', 'q-xueshan-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 9,
      code: 'caodi',
      category: 'march',
      name: '过草地',
      subtitle: '穿越死亡之地',
      date: '1935年8月',
      stage: '艰难北上',
      location: { name: '四川省松潘草地', longitude: 102.9, latitude: 32.95 },
      summary: '（占位文案）红军穿越沼泽泥潭密布的松潘草地，历时七天七夜。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）草地沼泽遍布、气候恶劣、缺粮少药，红军以顽强意志历时七天七夜走出草地。' },
          { type: 'timeline', items: [
            { date: '1935-08-21', text: '（占位）右路军开始过草地' },
            { date: '1935-08-27', text: '（占位）走出草地到达班佑' }
          ]},
          { type: 'dataCard', label: '穿越时间', value: '七天七夜' }
        ]
      },
      images: { cover: 'assets/route/caodi.webp', illustrations: [] },
      quiz: { questionIds: ['q-caodi-1', 'q-caodi-2', 'q-caodi-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 10,
      code: 'lazikou',
      category: 'battle',
      name: '激战腊子口',
      subtitle: '打通北上之路',
      date: '1935年9月',
      stage: '走向胜利',
      location: { name: '甘肃省迭部县', longitude: 103.89, latitude: 34.23 },
      summary: '（占位文案）红军攻克天险腊子口，打开了北上进入陕甘的大门。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）腊子口是川甘通道的咽喉，两侧悬崖陡壁，红军正面强攻与侧后迂回结合，一举攻克。' },
          { type: 'dataCard', label: '战役性质', value: '攻坚之战' }
        ]
      },
      images: { cover: 'assets/route/lazikou.webp', illustrations: [] },
      quiz: { questionIds: ['q-lazikou-1', 'q-lazikou-2', 'q-lazikou-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    },
    {
      order: 11,
      code: 'huining',
      category: 'event',
      name: '会宁会师',
      subtitle: '长征胜利结束',
      date: '1936年10月',
      stage: '走向胜利',
      location: { name: '甘肃省会宁县', longitude: 105.08, latitude: 35.68 },
      summary: '（占位文案）红军三大主力在会宁会师，标志着两万五千里长征胜利结束。',
      detail: {
        blocks: [
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '（占位文案，待文案组替换）1936年10月，红一、红二、红四方面军在甘肃会宁等地会师，长征胜利结束。' },
          { type: 'image', src: '', caption: '（占位）会宁会师楼（画师素材待交付）' },
          { type: 'quote', text: '（占位）长征是宣言书，长征是宣传队，长征是播种机。' },
          { type: 'dataCard', label: '历时', value: '两年' }
        ]
      },
      images: { cover: 'assets/route/huining.webp', illustrations: [] },
      quiz: { questionIds: ['q-huining-1', 'q-huining-2', 'q-huining-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    }
  ]
})
