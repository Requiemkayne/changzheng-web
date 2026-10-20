/**
 * 题目占位数据（与 miniprogram/mock/questions.js、cloudfunctions/initData/seed/questions.js 同构）
 *
 * ⚠ 全部题目为占位题（基于公开常识编写，供框架联调用），
 * 待出题组交付正式题库后替换。结构说明见 data/questions.example.json。
 *
 * type: single 单选 | multiple 多选 | judge 判断
 * answer 恒为数组（选项下标，0 起）；multiple 判分时集合相等、顺序无关。
 * nodeCode: 节点 code；final = 总结答题池。
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.CZ_MOCK_QUESTIONS = factory()
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return [
    // ===== 1 瑞金出发 =====
    {
      _id: 'q-ruijin-1', nodeCode: 'ruijin', type: 'single',
      question: '（占位题）中央红军长征的出发地是哪里？',
      options: ['江西瑞金', '湖南韶山', '贵州遵义', '陕西延安'],
      answer: [0],
      explanation: '（占位解析）1934年10月，中央红军从江西瑞金等地出发开始长征。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-ruijin-2', nodeCode: 'ruijin', type: 'judge',
      question: '（占位题）中央红军长征出发时兵力约8.6万余人。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）长征出发时中央红军约8.6万余人。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-ruijin-3', nodeCode: 'ruijin', type: 'multiple',
      question: '（占位题）下列属于长征出发相关史实的有（多选）：',
      options: ['1934年10月出发', '从瑞金等地出发', '出发时兵力30万', '第五次反"围剿"失败后转移'],
      answer: [0, 1, 3],
      explanation: '（占位解析）出发时兵力约8.6万余人，非30万。',
      difficulty: 2, status: 'published'
    },

    // ===== 2 湘江战役 =====
    {
      _id: 'q-xiangjiang-1', nodeCode: 'xiangjiang', type: 'single',
      question: '（占位题）湘江战役发生在哪一年？',
      options: ['1934年', '1935年', '1936年', '1937年'],
      answer: [0],
      explanation: '（占位解析）湘江战役发生于1934年11月底至12月初。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-xiangjiang-2', nodeCode: 'xiangjiang', type: 'single',
      question: '（占位题）湘江战役后中央红军兵力锐减至约多少？',
      options: ['8万余人', '6万余人', '3万余人', '1万余人'],
      answer: [2],
      explanation: '（占位解析）湘江血战后中央红军由8.6万余人锐减至3万余人。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-xiangjiang-3', nodeCode: 'xiangjiang', type: 'judge',
      question: '（占位题）湘江战役是长征途中红军损失最为惨重的一战。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）湘江战役是中央红军长征中最惨烈的一战。',
      difficulty: 1, status: 'published'
    },

    // ===== 3 遵义会议 =====
    {
      _id: 'q-zunyi-1', nodeCode: 'zunyi', type: 'single',
      question: '（占位题）遵义会议召开于哪一年？',
      options: ['1934年1月', '1935年1月', '1935年10月', '1936年1月'],
      answer: [1],
      explanation: '（占位解析）遵义会议于1935年1月15日至17日召开。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-zunyi-2', nodeCode: 'zunyi', type: 'single',
      question: '（占位题）遵义会议的历史意义是？',
      options: ['确立毛泽东在红军和党中央的领导地位', '宣布长征胜利结束', '决定强渡大渡河', '提出四渡赤水计划'],
      answer: [0],
      explanation: '（占位解析）遵义会议确立了毛泽东在红军和党中央的领导地位，是党的历史上生死攸关的转折点。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-zunyi-3', nodeCode: 'zunyi', type: 'judge',
      question: '（占位题）遵义会议是中国共产党历史上一个生死攸关的转折点。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）遵义会议在危急关头挽救了党、挽救了红军。',
      difficulty: 1, status: 'published'
    },

    // ===== 4 四渡赤水 =====
    {
      _id: 'q-sidu-1', nodeCode: 'sidu-chishui', type: 'single',
      question: '四渡赤水经历大小战役数量（　）',
      options: ['20余次', '30余次', '40余次', '50余次'],
      answer: [2],
      explanation: '四渡赤水战役期间，中央红军在川黔滇边连续机动作战，经历大小战役战斗40余次。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-sidu-2', nodeCode: 'sidu-chishui', type: 'single',
      question: '四渡赤水战役的指挥核心是（　）',
      options: ['博古、李德', '毛泽东、周恩来、朱德等', '张国焘、徐向前'],
      answer: [1],
      explanation: '遵义会议后重新确立毛泽东在党中央和红军的领导地位，四渡赤水由毛泽东、周恩来、朱德等共同指挥。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-sidu-3', nodeCode: 'sidu-chishui', type: 'single',
      question: '四渡赤水战役最主要的历史成果是（　）',
      options: ['彻底消灭国民党全部军队', '摆脱国民党重兵围追堵截，掌握战场主动权', '红军从此不再进行长征'],
      answer: [1],
      explanation: '四渡赤水以机动灵活的运动战摆脱了国民党重兵的围追堵截，使红军由被动转为主动，是长征中的关键转折。',
      difficulty: 2, status: 'published'
    },

    // ===== 5 巧渡金沙江 =====
    {
      _id: 'q-jinshajiang-1', nodeCode: 'jinshajiang', type: 'single',
      question: '（占位题）红军渡金沙江的主要渡口是？',
      options: ['皎平渡', '安顺场', '泸定桥', '腊子口'],
      answer: [0],
      explanation: '（占位解析）红军主力在云南皎平渡巧渡金沙江。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-jinshajiang-2', nodeCode: 'jinshajiang', type: 'single',
      question: '（占位题）红军渡金沙江依靠的船只是？',
      options: ['100余只大船', '7只小船', '架设浮桥', '武装泅渡'],
      answer: [1],
      explanation: '（占位解析）红军依靠7只小船，历时七天七夜渡过金沙江。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-jinshajiang-3', nodeCode: 'jinshajiang', type: 'judge',
      question: '（占位题）巧渡金沙江使红军摆脱了数十万敌军的围追堵截。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）渡过金沙江后红军跳出了敌军包围圈。',
      difficulty: 1, status: 'published'
    },

    // ===== 6 强渡大渡河 =====
    {
      _id: 'q-daduhe-1', nodeCode: 'daduhe', type: 'single',
      question: '（占位题）强渡大渡河的渡口是？',
      options: ['皎平渡', '安顺场', '泸定', '腊子口'],
      answer: [1],
      explanation: '（占位解析）红军先遣队在四川安顺场强渡大渡河。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-daduhe-2', nodeCode: 'daduhe', type: 'single',
      question: '（占位题）强渡大渡河的勇士共有多少人？',
      options: ['7名', '13名', '17名', '22名'],
      answer: [2],
      explanation: '（占位解析）17名勇士组成渡河奋勇队强渡大渡河。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-daduhe-3', nodeCode: 'daduhe', type: 'judge',
      question: '（占位题）强渡大渡河发生在1935年5月。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）强渡大渡河发生于1935年5月。',
      difficulty: 1, status: 'published'
    },

    // ===== 7 飞夺泸定桥 =====
    {
      _id: 'q-luding-1', nodeCode: 'luding', type: 'single',
      question: '（占位题）泸定桥由多少根铁索组成？',
      options: ['9根', '11根', '13根', '17根'],
      answer: [2],
      explanation: '（占位解析）泸定桥由13根铁索组成。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-luding-2', nodeCode: 'luding', type: 'single',
      question: '（占位题）飞夺泸定桥的突击队员共多少人？',
      options: ['17名', '22名', '30名', '100名'],
      answer: [1],
      explanation: '（占位解析）22名突击队员攀着铁索飞夺泸定桥。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-luding-3', nodeCode: 'luding', type: 'judge',
      question: '（占位题）飞夺泸定桥时桥面木板完好无损。',
      options: ['正确', '错误'],
      answer: [1],
      explanation: '（占位解析）敌军拆除了大部分桥板，突击队员攀铁索前进。',
      difficulty: 1, status: 'published'
    },

    // ===== 8 爬雪山 =====
    {
      _id: 'q-xueshan-1', nodeCode: 'xueshan', type: 'single',
      question: '（占位题）中央红军翻越的第一座大雪山是？',
      options: ['岷山', '夹金山', '梦笔山', '玉龙雪山'],
      answer: [1],
      explanation: '（占位解析）中央红军翻越的第一座大雪山是夹金山。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-xueshan-2', nodeCode: 'xueshan', type: 'single',
      question: '（占位题）夹金山海拔约多少米？',
      options: ['2000余米', '3000余米', '4000余米', '8000余米'],
      answer: [2],
      explanation: '（占位解析）夹金山主峰海拔4114米。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-xueshan-3', nodeCode: 'xueshan', type: 'judge',
      question: '（占位题）翻越雪山发生在1935年6月。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）1935年6月，红军翻越夹金山等大雪山。',
      difficulty: 1, status: 'published'
    },

    // ===== 9 过草地 =====
    {
      _id: 'q-caodi-1', nodeCode: 'caodi', type: 'single',
      question: '（占位题）红军穿越的草地位于哪个省？',
      options: ['云南省', '贵州省', '四川省', '甘肃省'],
      answer: [2],
      explanation: '（占位解析）松潘草地地处四川省西北部。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-caodi-2', nodeCode: 'caodi', type: 'single',
      question: '（占位题）红军穿越草地用了多长时间？',
      options: ['一天一夜', '三天三夜', '七天七夜', '一个月'],
      answer: [2],
      explanation: '（占位解析）红军以顽强意志历时七天七夜走出草地。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-caodi-3', nodeCode: 'caodi', type: 'judge',
      question: '（占位题）草地行军面临沼泽泥潭、缺粮少药等极端困难。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）草地沼泽遍布、气候恶劣、补给断绝，是长征中最艰难的路段之一。',
      difficulty: 1, status: 'published'
    },

    // ===== 10 激战腊子口 =====
    {
      _id: 'q-lazikou-1', nodeCode: 'lazikou', type: 'single',
      question: '（占位题）腊子口位于哪个省？',
      options: ['四川省', '甘肃省', '陕西省', '宁夏'],
      answer: [1],
      explanation: '（占位解析）腊子口位于甘肃省迭部县。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-lazikou-2', nodeCode: 'lazikou', type: 'single',
      question: '（占位题）攻克腊子口的意义是？',
      options: ['长征胜利结束', '打通北上进入陕甘的大门', '跳出包围圈', '四渡赤水'],
      answer: [1],
      explanation: '（占位解析）腊子口是川甘通道咽喉，攻克后红军打开了北上进入陕甘的大门。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-lazikou-3', nodeCode: 'lazikou', type: 'judge',
      question: '（占位题）激战腊子口发生在1935年9月。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）1935年9月，红军攻克天险腊子口。',
      difficulty: 1, status: 'published'
    },

    // ===== 11 会宁会师 =====
    {
      _id: 'q-huining-1', nodeCode: 'huining', type: 'single',
      question: '（占位题）红军三大主力会师的地点是？',
      options: ['陕西延安', '甘肃会宁', '宁夏六盘山', '江西瑞金'],
      answer: [1],
      explanation: '（占位解析）1936年10月，红军三大主力在甘肃会宁等地会师。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-huining-2', nodeCode: 'huining', type: 'single',
      question: '（占位题）红军三大主力会师标志着什么？',
      options: ['长征开始', '长征胜利结束', '抗日战争开始', '解放战争开始'],
      answer: [1],
      explanation: '（占位解析）三大主力会师标志着两万五千里长征胜利结束。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-huining-3', nodeCode: 'huining', type: 'judge',
      question: '（占位题）长征历时两年，途经十余省。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）长征从1934年10月至1936年10月，历时两年，纵横十余省。',
      difficulty: 1, status: 'published'
    },

    // ===== 总结答题池（final，10 题）=====
    {
      _id: 'q-final-1', nodeCode: 'final', type: 'single',
      question: '（占位题）中央红军长征出发地是？',
      options: ['江西瑞金', '贵州遵义', '甘肃会宁', '陕西延安'],
      answer: [0],
      explanation: '（占位解析）中央红军从江西瑞金出发。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-final-2', nodeCode: 'final', type: 'single',
      question: '（占位题）长征胜利结束的标志是？',
      options: ['遵义会议召开', '四渡赤水', '三大主力会师', '飞夺泸定桥'],
      answer: [2],
      explanation: '（占位解析）1936年10月三大主力会师，长征胜利结束。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-final-3', nodeCode: 'final', type: 'single',
      question: '（占位题）长征历时约多少年？',
      options: ['一年', '两年', '三年', '四年'],
      answer: [1],
      explanation: '（占位解析）长征从1934年10月至1936年10月，历时两年。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-final-4', nodeCode: 'final', type: 'single',
      question: '（占位题）长征中最惨烈的一战是？',
      options: ['湘江战役', '四渡赤水', '巧渡金沙江', '腊子口战役'],
      answer: [0],
      explanation: '（占位解析）湘江战役中红军损失过半，最为惨烈。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-final-5', nodeCode: 'final', type: 'single',
      question: '（占位题）党的历史上生死攸关的转折点指哪次会议？',
      options: ['古田会议', '遵义会议', '八七会议', '瓦窑堡会议'],
      answer: [1],
      explanation: '（占位解析）遵义会议是党的历史上生死攸关的转折点。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-final-6', nodeCode: 'final', type: 'multiple',
      question: '（占位题）下列属于长征途中重要事件的有（多选）：',
      options: ['遵义会议', '四渡赤水', '飞夺泸定桥', '九一八事变'],
      answer: [0, 1, 2],
      explanation: '（占位解析）九一八事变发生于1931年，早于长征开始。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-final-7', nodeCode: 'final', type: 'multiple',
      question: '（占位题）长征途中红军翻越的雪山有（多选）：',
      options: ['夹金山', '梦笔山', '珠穆朗玛峰', '岷山'],
      answer: [0, 1, 3],
      explanation: '（占位解析）红军翻越夹金山、梦笔山、岷山等多座雪山。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-final-8', nodeCode: 'final', type: 'judge',
      question: '（占位题）"金沙水拍云崖暖，大渡桥横铁索寒"出自《七律·长征》。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）此句出自毛泽东《七律·长征》。',
      difficulty: 1, status: 'published'
    },
    {
      _id: 'q-final-9', nodeCode: 'final', type: 'judge',
      question: '（占位题）飞夺泸定桥的突击队员共17名。',
      options: ['正确', '错误'],
      answer: [1],
      explanation: '（占位解析）飞夺泸定桥突击队员22名；17名是强渡大渡河的勇士。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-final-10', nodeCode: 'final', type: 'judge',
      question: '（占位题）长征精神是中国革命走向胜利的强大精神动力。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '（占位解析）长征精神是中国共产党人和红军将士革命风范的生动反映。',
      difficulty: 1, status: 'published'
    }
  ]
})
