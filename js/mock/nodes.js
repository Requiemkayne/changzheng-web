/**
 * 节点占位数据（与 miniprogram/mock/nodes.js、cloudfunctions/initData/seed/nodes.js 同构）
 *
 * 说明：瑞金/湘江/遵义/四渡赤水/金沙江/大渡河/雪山/草地/会宁 已按文案组 Word 交付填充；
 * 飞夺泸定桥、激战腊子口 仍为占位文案，待交付。
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
      summary: '1934年10月，中央领导机关从瑞金出发，8.6万红军夜渡于都河，踏上两万五千里远征。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/ruijin.mp4', poster: 'assets/route/ruijin.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1934年，第五次反“围剿”失利，中央苏区形势危急。10月10日晚，中共中央、中革军委机关从江西瑞金出发，向于都集结开进。中央红军主力共8.6万余人，陆续从瑞金、兴国等地赶赴于都，架设浮桥、夜渡于都河，开启伟大的长征。' },
          { type: 'paragraph', text: '苏区群众全力支援，送粮送物、捐献门板。这支红色大军从此踏上战略转移的远征之路，开启二万五千里的艰苦征程。' },
          { type: 'timeline', items: [
            { date: '1934-10-10', text: '中央领导机关从瑞金出发，向于都集结' },
            { date: '1934-10-17', text: '夜渡于都河，踏上战略转移之路' }
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
      summary: '1934年11月底，红军在湘江与数倍敌军血战五日，突破第四道封锁线，兵力锐减至3万余人。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/xiangjiang.mp4', poster: 'assets/route/xiangjiang.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1934年10月中央红军开始长征，连续突破国民党三道封锁线后，蒋介石在湘江一带布下第四道封锁线，调集重兵企图围歼红军。' },
          { type: 'paragraph', text: '1934年11月25日至12月1日，中央红军在广西兴安、全州、灌阳一带浴血奋战，拼死掩护中央纵队渡江，最终突破湘江防线，但付出重大伤亡，为之后遵义会议的召开埋下伏笔。' },
          { type: 'image', src: '', caption: '（占位）湘江战役旧址（画师素材待交付）' },
          { type: 'paragraph', text: '湘江血战使中央红军由出发时的8.6万余人锐减至3万余人，是长征途中损失最惨重的一战。' },
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
      summary: '1935年1月，中共中央政治局在遵义召开扩大会议，纠正“左”倾军事错误，成为生死攸关的转折点。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/zunyi.mp4', poster: 'assets/route/zunyi.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '遵义会议是1935年1月中共中央政治局在贵州遵义召开的扩大会议，是在红军第五次反“围剿”失败和长征初期严重受挫的情况下，为纠正博古、王明、李德等人“左”倾领导在军事指挥上的错误而召开的。' },
          { type: 'paragraph', text: '这是中国共产党第一次独立自主地运用马克思列宁主义基本原理解决自己的路线、方针和政策问题的会议。它在极端危急的历史关头挽救了党、挽救了红军、挽救了中国革命，是党的历史上一个生死攸关的转折点。' },
          { type: 'quote', text: '挽救了党，挽救了红军，挽救了中国革命。' },
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
          { type: 'video', src: 'assets/video/sidu.mp4', poster: 'assets/route/sidu.webp' },
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
      summary: '1935年5月，红军在皎平渡用7只小船、7天7夜渡过金沙江，跳出数十万敌军的包围圈。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/jinsha.mp4', poster: 'assets/route/jinsha.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1935年3月，四渡赤水胜利之后，中央红军成功调动、摆脱国民党重兵。为实现北上抗日的战略目标，红军需要渡过金沙江，跳出国民党军在川、滇、黔布置的包围圈。' },
          { type: 'paragraph', text: '蒋介石派兵封锁金沙江全部渡口，企图把中央红军围歼于金沙江以南地区。中央红军决定抢渡金沙江，1935年5月3日至9日展开巧渡金沙江行动，以7只小船昼夜摆渡，从容过江。' },
          { type: 'quote', text: '金沙水拍云崖暖，大渡桥横铁索寒。' },
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
      summary: '1935年5月，17名勇士驾小船冒着炮火强渡大渡河，抢占对岸阵地，为主力打开北上通道。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/dadu.mp4', poster: 'assets/route/dadu.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1935年5月，中央红军抵达大渡河。大渡河水流湍急、两岸陡峭，敌军妄图凭借天险阻挡红军。' },
          { type: 'paragraph', text: '红军挑选十七名勇士组成突击队，冒着对岸敌人密集炮火，驾小船强渡。战士们奋勇冲锋，成功抢占对岸阵地，为主力部队开辟通道，彰显无畏牺牲、攻坚克难的英雄气概。' },
          { type: 'dataCard', label: '勇士人数', value: '17名' },
          { type: 'paragraph', text: '船只太少，全军渡河过慢。为抢在追兵合围之前渡过大渡河，红军随即决定沿河北上，飞夺泸定桥。' }
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
          { type: 'video', src: 'assets/video/luding.mp4', poster: 'assets/route/luding.webp' },
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
      summary: '1935年6月，红军翻越海拔4000余米的夹金山，在缺氧与风雪中互相搀扶，翻过后在达维与红四方面军会师。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/xueshan.mp4', poster: 'assets/route/xueshan.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1935年6月，中央红军踏上长征途中第一座大雪山——夹金山。海拔4000余米的雪山终年积雪，当地民谣传唱：“夹金山，夹金山，鸟儿飞不过，凡人不可攀。要想越过夹金山，除非神仙到人间。”' },
          { type: 'paragraph', text: '战士们身着单衣、脚穿草鞋，在缺氧、狂风与冰雹中互相搀扶。翻过雪山，红军在达维与红四方面军胜利会师。皑皑雪山见证信仰，风雪铸就不朽的长征精神。' },
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
      summary: '1935年8月，红军右路军由毛儿盖出发，历时7天穿越松潘草地，无数将士长眠荒原。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/caodi.mp4', poster: 'assets/route/caodi.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1935年8月，红军分为右路军、左路军，先后踏入松潘草地。右路军由毛儿盖出发，历经7天跋涉抵达班佑。' },
          { type: 'paragraph', text: '这里海拔3500米以上，昼夜温差大，荒无人烟，草甸之下遍布沼泽泥潭。粮食耗尽，战士们采食野菜、煮皮带充饥。无数将士长眠荒原，他们以钢铁意志战胜绝境，诠释着革命理想高于天。' },
          { type: 'timeline', items: [
            { date: '1935-08-21', text: '右路军由毛儿盖出发，踏入松潘草地' },
            { date: '1935-08-27', text: '走出草地，抵达班佑' }
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
          { type: 'video', src: 'assets/video/lazikou.mp4', poster: 'assets/route/lazikou.webp' },
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
      summary: '1936年10月，红一、红二、红四方面军在甘肃会宁等地会师，两万五千里长征胜利结束。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/huining.mp4', poster: 'assets/route/huining.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1936年10月，红一方面军、红二方面军、红四方面军在甘肃会宁等地胜利会师。历经两年艰苦跋涉，三大主力红军成功会合，标志着二万五千里长征胜利结束。' },
          { type: 'paragraph', text: '长征是宣言书，长征是宣传队，长征是播种机。长征的胜利，保存了中国革命的火种，打开中国革命新局面，铸就伟大长征精神，在中国革命史上写下不朽篇章。' },
          { type: 'image', src: '', caption: '（占位）会宁会师楼（画师素材待交付）' },
          { type: 'quote', text: '长征是宣言书，长征是宣传队，长征是播种机。' },
          { type: 'dataCard', label: '历时', value: '两年' }
        ]
      },
      images: { cover: 'assets/route/huining.webp', illustrations: [] },
      quiz: { questionIds: ['q-huining-1', 'q-huining-2', 'q-huining-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    }
  ]
})
