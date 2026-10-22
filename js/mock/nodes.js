/**
 * 节点占位数据（与 miniprogram/mock/nodes.js、cloudfunctions/initData/seed/nodes.js 同构）
 *
 * 说明：瑞金/湘江/遵义/四渡赤水/金沙江/大渡河/雪山/草地/会宁 已按文案组 Word 交付填充；
 * 激战腊子口已补全真实文案（文案组《激战腊子口.docx》交付）；飞夺泸定桥文案已交付（配图待画师素材）。
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
            {
              date: '1934-10-10',
              text: '中央领导机关从瑞金出发，向于都集结',
              detail: {
                situation: '1934 年 4 月广昌失守后，国民党军步步紧缩，中央苏区只剩瑞金、会昌等八县。10 月，中共中央决定放弃中央苏区，率红军主力突围西进。',
                key: '10 月 10 日晚，中共中央、中革军委机关从瑞金出发。为保密，行动代号“野战军”，各部队白天休息、夜间行军，电台保持静默。集结地在六十公里外的于都。',
                impact: '中央红军由此离开经营多年的中央苏区。出发时 8.6 万余人，携带大量辎重，行军迟缓——这为后来的湘江惨败埋下伏笔。'
              }
            },
            {
              date: '1934-10-17',
              text: '夜渡于都河，踏上战略转移之路',
              detail: {
                situation: '于都河宽约六百米，水深流急，8.6 万人要在一周内渡完，而国民党飞机天天侦察。',
                key: '于都百姓把自家的门板、床板、寿材板拆下来送到河边。工匠昼夜架桥，每天傍晚架、天亮拆，飞机始终没发现。',
                impact: '10 月 17 日夜，中央红军主力全部渡过于都河，正式踏上长征路，于都因此被称为“长征第一渡”。',
                story: {
                  title: '门板搭起的浮桥',
                    source: '据于都中央红军长征出发纪念馆陈列资料、《于都县志》',
                  text: '于都河上没有桥。红军要过 8.6 万人，必须架浮桥，需要大量木板。消息传开，沿岸村庄的群众拆下自家的门板、床板，连老人的寿材板都抬了出来。有人问一位大爷：门拆了家里怎么办？他说：红军走了，门留着给谁看？就这样，八百多条渔船、上千块门板，在江面架起五座浮桥。为躲飞机，桥每天黄昏架起、天亮拆除，连架连拆七天七夜。红军过完河，队伍走了，于都河边留下了一地空门框。'
                }
              }
            }
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
          { type: 'timeline', items: [
              {
                date: '1934-11-25',
                text: '突破第四道封锁线，湘江血战开始',
                detail: {
                  situation: '连续突破三道封锁线后，蒋介石在湘江布下第四道封锁线，调集三十万兵力，企图把红军围歼于湘江以东。',
                  key: '红军带着大量辎重，行军像“抬轿子”，一天只能走二三十里。为掩护中央纵队过江，各军团在湘江两岸死守阵地。',
                  impact: '战斗打了五天五夜，红军以巨大代价保住渡口，但伤亡惨重。'
                }
              },
              {
                date: '1934-12-01',
                text: '中央纵队渡过湘江，红军锐减至三万余人',
                detail: {
                  situation: '12 月 1 日是最后期限，渡口随时可能被封死。红三十四师奉命断后，被隔在湘江东岸。',
                  key: '红三十四师师长陈树湘率部死战，全师几乎打光。中央纵队渡过湘江后，浮桥被炸断，三十四师陷入重围。',
                  impact: '湘江一战，中央红军由出发时的 8.6 万余人锐减至 3 万余人。惨重的代价让越来越多的干部战士开始怀疑“左”倾路线的指挥。',
                  story: {
                    title: '断肠明志的陈树湘',
                    source: '据红三十四师战史记载、陈树湘烈士事迹陈列资料',
                    text: '红三十四师担任全军后卫，在湘江东岸被敌军重重包围。师长陈树湘腹部中弹，昏迷中被俘。敌人抬着他去邀功，半路上他醒来，从伤口处扯断自己的肠子，壮烈牺牲，年仅 29 岁。敌人割下他的头颅挂在长沙城门上示众，而他的家乡就在长沙。湘江战役后，红军将士常说起这个“断肠师长”——那一年，红三十四师几乎全部长眠在湘江东岸。'
                  }
                }
              }
            ]},
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
          { type: 'timeline', items: [
              {
                date: '1935-01-07',
                text: '红军攻占遵义城',
                detail: {
                  situation: '突破乌江后，红军直逼遵义。黔军兵力薄弱，弃城而逃。',
                  key: '红军进城后纪律严明，不进民宅、不拿群众东西，只在街头露宿。市民开门看见满街睡着的红军，十分惊讶。',
                  impact: '红军得到难得的休整机会，也为召开中央政治局扩大会议创造了条件。'
                }
              },
              {
                date: '1935-01-15',
                text: '遵义会议召开，确立新的领导核心',
                detail: {
                  situation: '湘江惨败后，党内对“左”倾军事指挥的不满达到顶点。许多干部要求改变领导。',
                  key: '会议连开三天，集中批评博古、李德的军事错误，肯定了毛泽东的正确主张，改组了中央领导机构。',
                  impact: '会议在极端危急的关头挽救了党、挽救了红军、挽救了中国革命，是党的历史上一个生死攸关的转折点。'
                }
              }
            ]},
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
            {
              date: '1935-01-29',
              text: '一渡赤水：西渡赤水河进入川南，摆脱追兵',
              detail: {
                situation: '土城一仗红军判断失误，川军兵力远超预料，激战未能取胜。毛泽东提议迅速撤出战斗，西渡赤水，跳出川军的侧击。',
                key: '红军在土城、元厚一带搭浮桥西渡，一夜之间全部过河，随后炸毁浮桥。川军追至河边，只能隔水相望。',
                impact: '红军从被动应付转为主动机动。蒋介石判断红军要北渡长江，急调重兵堵向川南——正好被牵着走。'
              }
            },
            {
              date: '1935-02-18',
              text: '二渡赤水：回师黔北，再占娄山关、遵义城',
              detail: {
                situation: '川南敌军云集，红军却突然掉头东返。蒋介石的部队全在川南布防，黔北反而空虚。',
                key: '红军在太平渡、二郎滩二渡赤水，急行军直扑娄山关。彭德怀指挥红三军团强攻关口，一日之内夺关。',
                impact: '红军五日内连下桐梓、娄山关、遵义，歼灭和击溃敌军两个师又八个团，是长征以来第一个大胜仗。',
                story: {
                  title: '茅台镇上的疗伤酒',
                    source: '据成仿吾《长征回忆录》等长征亲历者记述',
                  text: '三渡赤水前后，红军途经仁怀茅台镇。长途行军加上连续作战，许多战士脚上溃烂、伤口化脓，而药品早已用尽。镇上酒坊众多，老乡告诉卫生员：这酒能洗伤口。于是红军用茅台酒给伤员擦洗、消毒，有的战士还用它搓脚活血。队伍离开时，红军按价付了钱，酒坊老板说什么也不肯收。红军留下字条和银元才走。多年后，当地人回忆：那几天镇上的酒香里，混着药味。'
                }
              }
            },
            {
              date: '1935-03-16',
              text: '三渡赤水：再入川南，诱敌西进',
              detail: {
                situation: '二渡后蒋介石亲飞重庆督战，调集数十万兵力向遵义地区合围，企图一举围歼。',
                key: '红军在茅台三渡赤水，大张旗鼓西进，故意让敌人看到“要北渡长江”的姿态。',
                impact: '敌军主力被引向川南，黔北、滇东再度空虚，为第四次渡河创造了机会。'
              }
            },
            {
              date: '1935-03-21',
              text: '四渡赤水：折返东进，南渡乌江，跳出合围',
              detail: {
                situation: '敌军主力已被调到川南，乌江以南兵力单薄。',
                key: '红军秘密折返，四渡赤水，随即南渡乌江，直逼贵阳。蒋介石正在贵阳督战，急调滇军“救驾”。',
                impact: '红军趁滇军东调，虚指贵阳、实取云南，从容渡过金沙江。三个月内四渡赤水，把几十万敌军拖得团团转，被毛泽东称为一生中的“得意之笔”。'
              }
            }
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
          { type: 'timeline', items: [
              {
                date: '1935-05-03',
                text: '先头部队抢占皎平渡，找到七只小船',
                detail: {
                  situation: '蒋介石下令封锁金沙江所有渡口，把船只全部撤到北岸，企图把红军困在江南。',
                  key: '红军先遣队化装成国民党军，急行军赶到皎平渡，缴获了南岸仅有的几只船，连夜渡江抢占北岸渡口。',
                  impact: '渡口被控制，为全军过江打开了一条通道。'
                }
              },
              {
                date: '1935-05-09',
                text: '全军渡过金沙江，跳出包围圈',
                detail: {
                  situation: '七只小船，8.6 万人（此时约 3 万余人），要在几天内全部渡完。',
                  key: '三十六名船工昼夜轮班，人歇船不歇。红军按序列上船，秩序井然，连骡马都编好队。',
                  impact: '全军渡江完毕，红军把渡船凿沉，追兵赶到时只能望江兴叹。至此彻底摆脱数十万敌军的围追堵截。',
                  story: {
                    title: '三十七名船工',
                    source: '据禄劝皎平渡红军渡江纪念馆资料',
                    text: '皎平渡只有七只小船。红军找到当地船工，请他们帮忙摆渡。船工们知道这是穷人的队伍，答应下来。七天七夜，三十七名船工分班摇橹，人歇船不歇。江水湍急，船小浪大，有人一天要划十几个来回。红军给船工付工钱，管饭吃，还派人守在岸边保护。渡完后，红军把六只船凿沉，留一只给船工逃生。船工们说：你们走好，我们等着你们回来。'
                  }
                }
              }
            ]},
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
          { type: 'timeline', items: [
              {
                date: '1935-05-24',
                text: '红军抵达安顺场，只找到一只小船',
                detail: {
                  situation: '大渡河水流湍急，两岸都是绝壁。七十年前石达开的太平军曾在此全军覆没。蒋介石扬言要让红军做“第二个石达开”。',
                  key: '红军先头部队冒雨奔袭八十里，夺下安顺场渡口，只搜到一只小船——还是敌人藏起来的。',
                  impact: '一只船渡 3 万人根本不可能。红军决定：一面用这只船强渡，一面沿河北上夺取泸定桥。'
                }
              },
              {
                date: '1935-05-25',
                text: '十七勇士强渡成功，打开北上通道',
                detail: {
                  situation: '对岸有敌军一个营，工事坚固，机枪封锁河面。',
                  key: '十七名勇士乘一只小船，在机枪和炮火掩护下强渡。船到中流被子弹打得漏水，战士们一边堵漏一边划。',
                  impact: '勇士们冲上对岸，占领渡口工事，后续部队陆续过河。但船只太少，全军渡河仍需数月——飞夺泸定桥因此成为关键。',
                  story: {
                    title: '十七勇士抢渡大渡河',
                    source: '据安顺场强渡大渡河纪念馆资料、《红星报》相关报道',
                    text: '安顺场渡口，一只小船，十七个人。出发前，每人一支冲锋枪、一把大刀、几颗手榴弹。船刚离岸，对岸机枪就扫了过来。船到江心，一发子弹打穿了船底，战士用衣服堵住；又有人中弹落水。岸上的红军集中所有火力压制，神炮手两发炮弹端掉敌人两个碉堡。船靠岸时只剩半船水，十七个人跳下船，冲上陡坡，把敌人赶出了工事。这一仗打开了大渡河北上的第一个缺口。'
                  }
                }
              }
            ]},
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
      summary: '1935年5月，红军奔袭泸定桥，攀着十三根铁索在枪林弹雨中夺桥，为北上打开通道。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/luding.mp4', poster: 'assets/route/luding.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1935年5月，红军奔袭泸定桥。泸定桥由十三根铁索构成，木板已被敌军拆除，对岸敌人重兵把守。红军战士冒着枪林弹雨，攀着滚烫铁索向前冲锋，最终成功夺取泸定桥，为红军北上打开关键通道。' },
          { type: 'image', src: '', caption: '（占位）泸定桥（画师素材待交付）' },
          { type: 'timeline', items: [
              {
                date: '1935-05-28',
                text: '红四团一昼夜急行军二百四十里',
                detail: {
                  situation: '泸定桥离安顺场二百四十里。军委命令：必须在下一天夺下泸定桥，否则全军将困在大渡河南岸。',
                  key: '红四团冒雨奔袭，一天一夜走完二百四十里山路。路上还击溃了阻击的川军，到达桥头时战士们几乎站不住。',
                  impact: '创造了红军行军速度的纪录，为夺桥赢得先机。'
                }
              },
              {
                date: '1935-05-29',
                text: '二十二勇士攀铁索夺下泸定桥',
                detail: {
                  situation: '桥面上的木板已被敌人拆除，只剩十三根铁索横在江上，桥下是奔腾的大渡河。',
                  key: '二十二名突击队员手攀铁索、脚踩铁链，在火力掩护下向对岸爬行。敌人浇煤油烧桥，火焰封住桥头。',
                  impact: '勇士们穿过火海夺下桥头，红军主力随后过桥，彻底粉碎了蒋介石让红军做“第二个石达开”的企图。',
                  story: {
                    title: '二十二勇士攀铁索',
                    source: '据杨成武《飞夺泸定桥》回忆文章',
                    text: '泸定桥长一百多米，十三根铁索悬在江面，桥板被抽走，只剩下光溜溜的铁链。二十二名突击队员背插马刀、腰缠手榴弹，攀上铁索向对岸爬。对岸机枪扫射，子弹打在铁链上溅出火星。爬到最后一段，敌人在桥头点起大火，浓烟滚滚。队长大喊：同志们，这是胜利的最后关头，冲过去！勇士们穿过火墙，冲进桥头堡。这一战，红军夺下的不只是一座桥，而是全军的生路。'
                  }
                }
              }
            ]},
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
          { type: 'timeline', items: [
              {
                date: '1935-06-12',
                text: '翻越长征第一座大雪山夹金山',
                detail: {
                  situation: '夹金山海拔四千余米，终年积雪，山上空气稀薄、气候多变。当地人说：夹金山，鸟儿飞不过。',
                  key: '战士们身着单衣、脚穿草鞋，喝辣椒水御寒。出发前互相叮嘱：不能停、不能坐，坐下就可能再也起不来。',
                  impact: '红军翻过夹金山，在达维与红四方面军会师，这是长征途中第一次会师。',
                  story: {
                    title: '雪山上的最后一次党费',
                    source: '据中国人民革命军事博物馆藏刘志海党证及展陈说明',
                    text: '翻越党岭山时，战士们在雪地里发现一只伸出的拳头。掰开手，掌心里是一张党证和一块银元，党证上写着：刘志海，中共正式党员，一九三三年三月入党。他已经牺牲了，手却一直举着，像在交最后一次党费。战友们把党证和银元收好，继续往前走。后来这张党证被保存下来，成为红军翻雪山最沉重的一件遗物。'
                  }
                }
              }
            ]},
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
            {
              date: '1935-08-21',
              text: '右路军由毛儿盖出发，踏入松潘草地',
              detail: {
                situation: '红军分左右两路北上。右路军由毛儿盖出发，前面是数百里荒无人烟的松潘草地，没有道路、没有村庄、没有粮食。',
                key: '出发前每人只筹到几斤青稞，许多人把青稞炒熟装进干粮袋。草地表面是草，下面是深不见底的沼泽，一脚踩空就可能陷进去。',
                impact: '进入草地第一天，队伍就断粮。此后七天，野菜、皮带、草根成了主食。'
              }
            },
            {
              date: '1935-08-27',
              text: '走出草地，抵达班佑',
              detail: {
                situation: '七天里，部队在沼泽中摸索前行，白天行军、夜里睡在潮湿的草甸上，许多人一睡就再没醒来。',
                key: '为减少伤亡，战士们用绑腿连成绳子，前后相牵；遇到沼泽，先用木棍探路。饿极了就煮皮带，先把皮带烤焦，再刮去焦层煮软。',
                impact: '右路军走出草地时减员严重，但主力保存下来，为北上打开了通道。',
                story: {
                  title: '金色的鱼钩',
                    source: '据陆定一革命回忆录《金色的鱼钩》（原型为红军过草地真实事件）',
                  text: '过草地时，一位炊事班长照顾三个生病的战士。他把缝衣针弯成鱼钩，在泥沼的水洼里钓鱼，把鱼汤留给伤员，自己只嚼草根和鱼骨头。战士们发现后不肯吃，他就说：我早就吃过了。日子一天天过去，三个战士渐渐好转，老班长却倒在了草地上。整理遗物时，战士在他怀里摸到那枚鱼钩——已经磨得发亮，像金子一样。这个鱼钩后来被保存下来，人们叫它“金色的鱼钩”。'
                }
              }
            }
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
      summary: '红军抵达甘肃迭部腊子口，正面强攻与侧后迂回配合一举攻克天险，打通了北上进入陕甘的道路。',
      detail: {
        blocks: [
          { type: 'video', src: 'assets/video/lazikou.mp4', poster: 'assets/route/lazikou.webp' },
          { type: 'heading', text: '历史背景' },
          { type: 'paragraph', text: '1935年9月，红军抵达甘肃迭部县腊子口。腊子口是川甘通道的咽喉要道，峡谷两侧悬崖陡壁，隘口狭窄，易守难攻，是红军北上必须攻克的天险。红军采取正面强攻吸引敌军注意力，同时派出部队攀援悬崖，从侧后迂回突袭，两面配合一举攻破腊子口。这场攻坚之战打通红军北上的道路，扫除长征途中最后一道大的天然屏障，为红军进入陕甘地区创造关键条件。' },
          { type: 'timeline', items: [
              {
                date: '1935-09-16',
                text: '红四团强攻腊子口受阻',
                detail: {
                  situation: '腊子口是川甘通道的咽喉，两侧绝壁，中间只有一座木桥，敌军一个团凭险据守。',
                  key: '红军正面强攻多次，都被密集火力压回来。敌人碉堡居高临下，手榴弹直接往桥头扔。',
                  impact: '正面打不开，必须另找出路——红军决定组织突击队从侧后攀崖迂回。'
                }
              },
              {
                date: '1935-09-17',
                text: '攀崖迂回成功，攻克天险腊子口',
                detail: {
                  situation: '腊子口两侧悬崖陡壁，敌人认为红军不可能从侧后上来，把兵力集中在正面。',
                  key: '红军找来一个外号“云贵川”的苗族小战士，他自幼攀崖采药，徒手爬上绝壁，放下绳索，突击队逐个攀上。',
                  impact: '突击队从侧后投下手榴弹，正面同时发起总攻，一举拿下腊子口，打开了红军北上的通道。',
                  story: {
                    title: '攀上绝壁的“云贵川”',
                    source: '据杨成武《忆长征》等腊子口战役回忆资料',
                    text: '腊子口正面攻不下，必须有人从侧后悬崖爬上去。可那面石壁几乎是直立的，连长问谁会爬崖，一个苗族小战士站了出来，大家只知道他叫“云贵川”。他赤着脚，背着绳索，借着石缝和藤条往上爬，好几次脚下打滑。爬到崖顶，他放下绳索，突击队一个个攀了上去。天亮前，手榴弹从敌人头顶砸下来，腊子口被拿下。后来人们再没见过“云贵川”，只知道他可能牺牲在了长征路上。'
                  }
                }
              }
            ]},
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
          { type: 'timeline', items: [
              {
                date: '1936-10-09',
                text: '红一、红四方面军在会宁会师',
                detail: {
                  situation: '红一方面军西征接应，红四方面军北上，两军在会宁相遇。',
                  key: '会师当天，会宁城里贴满标语，群众杀羊送粮。两军战士抱在一起，许多人当场哭了。',
                  impact: '三大主力中的两支先会合，为长征胜利奠定了基础。'
                }
              },
              {
                date: '1936-10-22',
                text: '红二方面军到达将台堡，三大主力全部会师',
                detail: {
                  situation: '红二方面军从湘鄂川黔出发，经滇、康、甘，行程两万余里，此时也赶到会宁、将台堡一带。',
                  key: '10 月 22 日，红二方面军与红一方面军在将台堡会师。三大主力红军终于全部会合。',
                  impact: '历时两年的长征胜利结束。长征是宣言书，是宣传队，是播种机，在中国革命史上写下不朽篇章。'
                }
              }
            ]},
          { type: 'dataCard', label: '历时', value: '两年' }
        ]
      },
      images: { cover: 'assets/route/huining.webp', illustrations: [] },
      quiz: { questionIds: ['q-huining-1', 'q-huining-2', 'q-huining-3'], questionCount: 3, passScore: 60 },
      status: 'published'
    }
  ]
})
