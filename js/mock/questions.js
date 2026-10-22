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
      question: '中央领导机关从哪里出发，开启长征战略转移？',
      options: ['井冈山', '瑞金', '遵义', '吴起镇'],
      answer: [1],
      explanation: '1934年10月10日晚，中共中央、中革军委机关从江西瑞金出发，向于都集结开进。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-ruijin-2', nodeCode: 'ruijin', type: 'single',
      question: '中央红军长征出发时，红军主力总人数约为？',
      options: ['3万', '6.8万', '8.6万', '10万'],
      answer: [2],
      explanation: '中央红军主力共8.6万余人，陆续从瑞金、兴国等地赶赴于都集结。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-ruijin-3', nodeCode: 'ruijin', type: 'single',
      question: '中央红军主力在于都做什么，正式踏上远征？',
      options: ['召开遵义会议', '夜渡于都河', '翻越夹金山', '四渡赤水'],
      answer: [1],
      explanation: '红军在于都架设浮桥、夜渡于都河，从此踏上战略转移的远征之路。',
      difficulty: 2, status: 'published'
    },

    // ===== 2 湘江战役 =====
    {
      _id: 'q-xiangjiang-1', nodeCode: 'xiangjiang', type: 'single',
      question: '湘江战役发生在哪一年？',
      options: ['1934年', '1935年', '1936年'],
      answer: [0],
      explanation: '湘江战役发生于1934年11月25日至12月1日。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-xiangjiang-2', nodeCode: 'xiangjiang', type: 'single',
      question: '湘江战役是红军长征途中的第几道封锁线？',
      options: ['第三道', '第四道', '第五道'],
      answer: [1],
      explanation: '蒋介石在湘江一带布下第四道封锁线，调集重兵企图围歼红军。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-xiangjiang-3', nodeCode: 'xiangjiang', type: 'single',
      question: '湘江战役之后，中央红军由出发时8.6万余人锐减到约多少人？',
      options: ['3万多人', '5万多人', '1万多人'],
      answer: [0],
      explanation: '湘江血战后，中央红军由8.6万余人锐减至3万余人，是长征途中损失最惨重的一战。',
      difficulty: 2, status: 'published'
    },

    // ===== 3 遵义会议 =====
    {
      _id: 'q-zunyi-1', nodeCode: 'zunyi', type: 'single',
      question: '遵义会议召开的时间是？',
      options: ['1934年10月', '1935年1月', '1935年10月', '1936年10月'],
      answer: [1],
      explanation: '遵义会议于1935年1月在贵州遵义召开。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-zunyi-2', nodeCode: 'zunyi', type: 'single',
      question: '遵义会议是中国共产党历史上一个什么性质的转折点？',
      options: ['生死攸关', '微不足道', '阶段性', '短期调整'],
      answer: [0],
      explanation: '会议在极端危急的历史关头挽救了党、挽救了红军、挽救了中国革命，是生死攸关的转折点。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-zunyi-3', nodeCode: 'zunyi', type: 'single',
      question: '下列哪一项不属于遵义会议的成果？',
      options: ['纠正军事上和组织上的错误', '肯定毛泽东的正确军事主张', '决定立刻北上抗日', '改组中央领导机构'],
      answer: [2],
      explanation: '遵义会议纠正了“左”倾军事错误、肯定毛泽东的正确主张、改组中央领导机构；“决定立刻北上抗日”不属于会议成果。',
      difficulty: 2, status: 'published'
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
      question: '中央红军主要从哪个渡口渡过金沙江？',
      options: ['皎平渡', '虎门渡', '大渡河渡口'],
      answer: [0],
      explanation: '中央红军主力从云南禄劝皎平渡渡过金沙江。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-jinshajiang-2', nodeCode: 'jinshajiang', type: 'single',
      question: '红军依靠什么工具在皎平渡渡江？',
      options: ['小木船', '浮桥', '大型轮船'],
      answer: [0],
      explanation: '红军依靠7只小船昼夜摆渡，从容渡过金沙江。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-jinshajiang-3', nodeCode: 'jinshajiang', type: 'single',
      question: '红军主力在皎平渡渡江一共用时多久？',
      options: ['七天七夜', '三天三夜', '五天五夜'],
      answer: [0],
      explanation: '1935年5月3日至9日，红军用七天七夜渡过金沙江。',
      difficulty: 2, status: 'published'
    },

    // ===== 6 强渡大渡河 =====
    {
      _id: 'q-daduhe-1', nodeCode: 'daduhe', type: 'single',
      question: '红军强渡大渡河发生在哪一年？',
      options: ['1934年', '1935年', '1936年'],
      answer: [1],
      explanation: '1935年5月，中央红军抵达大渡河并组织强渡。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-daduhe-2', nodeCode: 'daduhe', type: 'single',
      question: '强渡大渡河的突击队一共多少名勇士？',
      options: ['十七名', '十八名', '十九名'],
      answer: [0],
      explanation: '红军挑选十七名勇士组成突击队，驾小船强渡大渡河。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-daduhe-3', nodeCode: 'daduhe', type: 'judge',
      question: '大渡河水势平缓，十分容易渡河。',
      options: ['正确', '错误'],
      answer: [1],
      explanation: '大渡河水流湍急、两岸陡峭，敌军企图凭借天险阻挡红军，绝非容易渡河。',
      difficulty: 2, status: 'published'
    },

    // ===== 7 飞夺泸定桥 =====
    {
      _id: 'q-luding-1', nodeCode: 'luding', type: 'single',
      question: '泸定桥一共有多少根铁索？',
      options: ['11根', '13根', '15根'],
      answer: [1],
      explanation: '泸定桥由十三根铁索构成，桥板被敌军拆除后只剩铁索。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-luding-2', nodeCode: 'luding', type: 'single',
      question: '飞夺泸定桥发生在哪个省份？',
      options: ['四川', '贵州', '云南'],
      answer: [0],
      explanation: '泸定桥位于四川省泸定县，横跨大渡河。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-luding-3', nodeCode: 'luding', type: 'judge',
      question: '敌人提前拆掉了泸定桥桥面木板。',
      options: ['正确', '错误'],
      answer: [0],
      explanation: '敌军为阻止红军过桥，提前拆除了桥面上的木板，只留下十三根铁索。',
      difficulty: 2, status: 'published'
    },

    // ===== 8 爬雪山 =====
    {
      _id: 'q-xueshan-1', nodeCode: 'xueshan', type: 'single',
      question: '中央红军翻越夹金山的时间是？',
      options: ['1934年10月', '1935年6月', '1935年10月', '1936年1月'],
      answer: [1],
      explanation: '1935年6月，中央红军翻越长征途中第一座大雪山——夹金山。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-xueshan-2', nodeCode: 'xueshan', type: 'single',
      question: '夹金山的海拔大约是多少米？',
      options: ['3千米', '4千米', '5千米', '6千米'],
      answer: [1],
      explanation: '夹金山海拔4000余米，终年积雪。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-xueshan-3', nodeCode: 'xueshan', type: 'single',
      question: '夹金山位于我国哪个省份？',
      options: ['四川', '云南', '甘肃', '青海'],
      answer: [0],
      explanation: '夹金山位于四川省小金县境内。',
      difficulty: 2, status: 'published'
    },

    // ===== 9 过草地 =====
    {
      _id: 'q-caodi-1', nodeCode: 'caodi', type: 'single',
      question: '1935年8月，红军过草地分为哪两路？',
      options: ['东路军、西路军', '右路军、左路军', '南路军、北路军', '先遣军、后卫军'],
      answer: [1],
      explanation: '1935年8月，红军分为右路军、左路军，先后踏入松潘草地。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-caodi-2', nodeCode: 'caodi', type: 'single',
      question: '红军右路军穿越松潘草地后抵达哪里？',
      options: ['卓克基', '毛儿盖', '班佑', '阿坝'],
      answer: [2],
      explanation: '右路军由毛儿盖出发，历经7天跋涉抵达班佑。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-caodi-3', nodeCode: 'caodi', type: 'single',
      question: '红军右路军走完松潘草地一共历时大约几天？',
      options: ['7天', '10天', '15天', '20天'],
      answer: [0],
      explanation: '右路军由毛儿盖到班佑，历时约7天。',
      difficulty: 2, status: 'published'
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
      question: '三大主力红军会宁会师的时间是？',
      options: ['1935年9月', '1936年10月', '1934年10月', '1935年10月'],
      answer: [1],
      explanation: '1936年10月，红一、红二、红四方面军在甘肃会宁等地胜利会师。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-huining-2', nodeCode: 'huining', type: 'single',
      question: '红军三大主力会师地点会宁属于哪个省？',
      options: ['陕西', '四川', '甘肃', '宁夏'],
      answer: [2],
      explanation: '会宁位于甘肃省，是三大主力红军会师地。',
      difficulty: 2, status: 'published'
    },
    {
      _id: 'q-huining-3', nodeCode: 'huining', type: 'single',
      question: '长征一共历时多久？',
      options: ['一年', '两年', '三年', '四年'],
      answer: [1],
      explanation: '1934年10月出发、1936年10月会师，长征历时两年。',
      difficulty: 2, status: 'published'
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
