/**
 * 剧情条目表（纯数据）。
 *
 * 契约：
 * - 本文件只有常量和类型，没有函数、没有副作用，Node 下可直接 import。
 * - 每条 beat 的 `id` 是存档里的稳定键，改文案可以，改 id 等于把玩家
 *   已解锁的记录清零，别改。
 * - 解锁条件是「与」关系：`day` / `elapsed` / `buildings` 里写了几项就
 *   要同时满足几项，全都不写表示开局即解锁。
 * - 条目顺序即解锁的先后顺序（同一帧同时满足多条时按这里的顺序排队）。
 * - 文案全部原创，不引用任何现实作品的人物、地名或专有名词。
 */

/** 界面上要展示的最小信息，story 对外只承诺这三个字段。 */
export type Beat = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
};

/** journal = 老大自己的手写日记，broadcast = 短波电台里捞到的别人的声音。 */
export type BeatKind = "journal" | "broadcast";

/**
 * 解锁条件。三项都是**下限**，写了就必须同时满足。
 * `buildings` 的键对应 sim 的 BuildingId（floor / collector / purifier /
 * fish / turret / core），但这里故意用宽松的 string 键，story 不 import
 * sim，免得剧情层反过来绑死玩法层的类型。
 */
export type BeatRequirement = {
  /** 天数下限（第几天，从 1 开始） */
  readonly day?: number;
  /** 存活秒数下限 */
  readonly elapsed?: number;
  /** 各类建筑的数量下限；开局 3×3 自带 8 块地基 + 1 座指挥中心 */
  readonly buildings?: Readonly<Record<string, number>>;
};

export type StoryBeat = Beat & {
  readonly kind: BeatKind;
  readonly require: BeatRequirement;
  /** 上屏后停留多少秒自动收走 */
  readonly holdS: number;
};

/** 日记停留短一点，电台是别人在说话，多留两秒。 */
const HOLD_JOURNAL = 8;
const HOLD_BROADCAST = 10;

export const STORY_BEATS: readonly StoryBeat[] = [
  {
    id: "salt-dawn",
    kind: "journal",
    title: "日志 · 咸味的早上",
    body: "醒来时脚下只有九块拼起来的板子，四面都是水。先把绳结重新打紧，再想别的。",
    require: {},
    holdS: HOLD_JOURNAL,
  },
  {
    id: "wider-deck",
    kind: "journal",
    title: "日志 · 把地板加宽",
    body: "多铺了两格，走路终于不用侧着身子。海面看着还是那么大，但脚下的地方是自己挣来的。",
    require: { buildings: { floor: 10 } },
    holdS: HOLD_JOURNAL,
  },
  {
    id: "lazy-net",
    kind: "journal",
    title: "日志 · 会自己干活的网兜",
    body: "把破渔网和塑料桶捆成了一个兜子，扔在筏边就能自己刮东西上来。省下的手，正好去修别的。",
    require: { buildings: { collector: 1 } },
    holdS: HOLD_JOURNAL,
  },
  {
    id: "first-clean-cup",
    kind: "broadcast",
    title: "电台 · 一杯不咸的水",
    body: "「……听到的人记住：海水煮开了照样要命，得让蒸汽走一圈再接。我这台机器撑了六十天，你们的也能。」",
    require: { buildings: { purifier: 1 } },
    holdS: HOLD_BROADCAST,
  },
  {
    id: "line-in-water",
    kind: "journal",
    title: "日志 · 钓上来的第一条",
    body: "巴掌大，刺多，煮汤刚好三个人分。把鱼骨留下了，磨尖了能当钩子。",
    require: { buildings: { fish: 1 } },
    holdS: HOLD_JOURNAL,
  },
  {
    id: "low-sky",
    kind: "broadcast",
    title: "电台 · 天压下来了",
    body: "「西边云脚发黑，风向变了两次。外圈的东西全部绑死，别站在筏子边上——重复一遍，别站在筏子边上。」",
    require: { day: 2 },
    holdS: HOLD_BROADCAST,
  },
  {
    id: "iron-tooth",
    kind: "journal",
    title: "日志 · 铁牙",
    body: "拆了三只铁皮罐，架起一门会自己转的短管子。但愿它开火的次数越少越好。",
    require: { buildings: { turret: 1 } },
    holdS: HOLD_JOURNAL,
  },
  {
    id: "uninvited",
    kind: "broadcast",
    title: "电台 · 不请自来的邻居",
    body: "「那伙人不抢水也不抢粮，专挑别人的筏子拆。见到挂灰帆的小艇，先把灯灭了。」",
    require: { day: 3, buildings: { turret: 1 } },
    holdS: HOLD_BROADCAST,
  },
  {
    id: "fifth-morning",
    kind: "journal",
    title: "日志 · 第五个早上",
    body: "已经数不清补过多少次绳子。有人说数日子的人活不长，可不数，就更不知道自己撑了多久。",
    require: { day: 5 },
    holdS: HOLD_JOURNAL,
  },
  {
    id: "floating-harbor",
    kind: "broadcast",
    title: "电台 · 传说里的浮港",
    body: "「往东北漂，据说有一片连在一起的大筏子，二十家人共用一口锅。真假不知道，但值得漂过去看看。」",
    require: { day: 7, buildings: { floor: 16 } },
    holdS: HOLD_BROADCAST,
  },
];

/** 表里一共几条，UI 显示「已解锁 3 / 10」用。 */
export const BEAT_COUNT = STORY_BEATS.length;
