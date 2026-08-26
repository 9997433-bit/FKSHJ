import { RESOURCE_IDS, RESOURCE_NAMES, gainAll, pay } from "./rules";
import type { Cost, ResourceId, Resources, Rng, SalvageId } from "./rules";

/**
 * 请求板层：岛民往板上贴条子，玩家用打捞来的建材换生活物资；
 * 板子旁边挂一条里程碑目标链（首座净水机 / 撑过风暴 / 木筏 ≥12 / 活到第 3 天）。
 *
 * 为什么要有这一层：木筏现在只有「捞 → 建 → 挨打」一条线，捞来的木板/塑料
 * 除了盖房子没有第二个去处，而淡水食物只能靠建筑慢慢产。请求板把这两头接上
 * ——拿一两种建材换一小笔水或食物，给玩家一个「现在缺水，先交两张单」的短期
 * 决策，同时顺手产出日记文本。里程碑补的是另一头：条子是分钟级的短目标，
 * 里程碑是一整局的长目标，让「多铺两格」「熬过今晚」也有个收束。
 *
 * 契约：
 * - 只依赖 rules 的 pay / gainAll / RESOURCE_NAMES，不碰 economy /
 *   threats / session，也不碰 DOM。接线全在 session 那边。
 * - 随机全部走传入的 Rng：一次贴单固定消耗「1 次挑模板 + 每种材料 1 次」的
 *   抽取，同种子同序列。updateBoard 不贴单时一次 rng 都不消耗，
 *   里程碑那条旁路则一次都不抽。
 * - 交单走 pay()：材料不够就整体不扣，仓库不会被扣成负数；超时作废也只是
 *   丢掉这笔奖励 + 清空连击，从不倒扣资源。
 * - 本文件不切场景、不放音效：updateBoard / updateMilestones / complete
 *   只返回事件，由 session 决定怎么演。
 *
 * 节奏数留在本文件 BOARD（与 constants.BOARD 镜像）；内容表在下面。
 */

// ── 数值 ────────────────────────────────────────────────────────────

/**
 * 探针磁带跑 300 tick = 5s。updateBoard 只有在贴单那一帧才抽 rng，所以
 * 只要第一张条子晚于这个窗口，磁带哈希就跟请求板无关。REQUESTS.firstS
 * 被改到窗口以内的话 quietThroughProbe() 会翻 false，单测据此报警。
 */
export const PROBE_QUIET_S = 5;

export const BOARD = {
  /** 板上同时挂着的条子上限 */
  slots: 3,
  /** 开局多久贴出第一张（秒）。晚于探针窗口、早于首场风暴 */
  firstS: 12,
  /** 贴单间隔（秒）：每贴一张缩 postDecayS，下限 postMinS */
  postGapS: 26,
  postMinS: 13,
  postDecayS: 1.5,
  /** 单张条子的时限（秒），随难度档缩短，下限 ttlMinS */
  ttlS: 75,
  ttlMinS: 42,
  /** 每档缩短的时限（秒） */
  ttlPerTier: 11,
  /** 难度档：每 tierEveryS 秒升一档，最多 maxTier 档 */
  tierEveryS: 150,
  maxTier: 3,
  /** 每升一档，每种材料多要 wantPerTier 个 */
  wantPerTier: 1,
  /** 每升一档，奖励 ×(1 + tier × rewardPerTier) */
  rewardPerTier: 0.35,
  /** 连交 streakAt 张不断档，奖励 ×streakMul */
  streakAt: 3,
  streakMul: 1.5,
  /** 日记最多留几条，旧的挤掉 */
  diaryMax: 12,
  /** ttl 剩余低于这个比例算「快过期了」，HUD 拿去闪红 */
  urgentAt: 0.3,
} as const;

/**
 * 首张条子是否晚于探针窗口（真 = 前 5s 不贴单也不抽 rng）。
 * 两头都查：常量表和 createBoard() 起手的 postT——只改其中一个也会被拦下。
 */
export function quietThroughProbe(): boolean {
  return BOARD.firstS > PROBE_QUIET_S && createBoard().postT > PROBE_QUIET_S;
}

/** 一种材料的需求区间（含端点，实际数量再按难度档加码） */
export type WantSpec = {
  readonly id: SalvageId;
  readonly min: number;
  readonly max: number;
};

export type RequestKind = {
  readonly key: string;
  readonly who: string;
  readonly title: string;
  /** 要 1–2 种建材，只要打捞得到的那四种 */
  readonly want: readonly WantSpec[];
  /** 兑付的生活物资（偶尔搭一点材料） */
  readonly reward: Cost;
  readonly onDone: string;
  readonly onFail: string;
};

/**
 * 条子模板。人物都是随手起的木筏居民，跟任何现成作品无关。
 * 单材料的条子便宜好交，双材料的给得多——玩家缺水时会主动去凑第二种料。
 */
export const REQUEST_KINDS: readonly RequestKind[] = [
  {
    key: "net",
    who: "老渔夫阿岚",
    title: "补一张破了口的渔网",
    want: [{ id: "rope", min: 2, max: 4 }],
    reward: { food: 9 },
    onDone: "网补好了，晚上多下一趟，鱼获算你一份。",
    onFail: "网口越扯越大，这几天只能空着手回来。",
  },
  {
    key: "roof",
    who: "修船的独眼佬",
    title: "补屋顶漏的那一块",
    want: [{ id: "wood", min: 4, max: 7 }],
    reward: { water: 7 },
    onDone: "钉严实了。省下来接屋檐水的桶，给你两桶。",
    onFail: "昨夜又漏了一宿，床铺全泡了。",
  },
  {
    key: "gutter",
    who: "看水表的小满",
    title: "拼一段接雨水的槽",
    want: [{ id: "plastic", min: 3, max: 6 }],
    reward: { water: 12 },
    onDone: "槽子架上了，一场雨顶大半天的净水机。",
    onFail: "雨白下了，一滴都没接住。",
  },
  {
    key: "pot",
    who: "铁匠老钉",
    title: "打一口新的汤锅",
    want: [{ id: "metal", min: 2, max: 4 }],
    reward: { food: 12 },
    onDone: "锅成了，今晚全筏子都能喝上热汤。",
    onFail: "旧锅底彻底穿了，晚饭又是冷的。",
  },
  {
    key: "hammock",
    who: "编绳的阿禾",
    title: "编两张吊床",
    want: [
      { id: "rope", min: 2, max: 3 },
      { id: "wood", min: 3, max: 5 },
    ],
    reward: { water: 6, food: 6 },
    onDone: "睡得踏实了，明早干活的人多两个。",
    onFail: "还是打地铺，起来一身腰疼。",
  },
  {
    key: "buoy",
    who: "守夜的青野",
    title: "做三只夜里看得见的浮标",
    want: [
      { id: "plastic", min: 3, max: 5 },
      { id: "metal", min: 1, max: 2 },
    ],
    reward: { water: 8, rope: 2 },
    onDone: "标好了航道，摸黑回来的船不撞筏子了。",
    onFail: "没标记，夜里谁都不敢把船开远。",
  },
  {
    key: "crate",
    who: "厨房的胖墩",
    title: "钉一只装咸鱼的箱子",
    want: [
      { id: "wood", min: 3, max: 6 },
      { id: "plastic", min: 2, max: 4 },
    ],
    reward: { food: 14 },
    onDone: "咸鱼有地方码了，这批能多存好些天。",
    onFail: "鱼堆在甲板上，晒了两天全糟了。",
  },
  {
    key: "sail",
    who: "缝帆的婆婆",
    title: "缝好帆上那道裂口",
    want: [
      { id: "rope", min: 3, max: 5 },
      { id: "plastic", min: 2, max: 3 },
    ],
    reward: { water: 9, food: 5 },
    onDone: "帆吃上风了，出海一趟省一半力气。",
    onFail: "帆彻底撕开，只能靠桨划回来。",
  },
];

// ── 里程碑 ──────────────────────────────────────────────────────────

/**
 * 里程碑读的四个外部量。都是「越大越好」的整数，缺项按 0 算（= 还没达成），
 * 所以 session 可以先只传自己手边有的那几项，剩下的以后再接。
 */
export type MilestoneTrack = "purifiers" | "storms" | "tiles" | "day";

export const MILESTONE_TRACKS = ["purifiers", "storms", "tiles", "day"] as const satisfies readonly MilestoneTrack[];

export type MilestoneId = "first-purifier" | "storm-weathered" | "raft-12" | "day-3";

export type Milestone = {
  readonly id: MilestoneId;
  readonly track: MilestoneTrack;
  /** 达到这个数就算达成 */
  readonly goal: number;
  readonly title: string;
  /** 没达成时 HUD 挂的一行目标 */
  readonly hint: string;
  /** 达成时进日记的一句话 */
  readonly note: string;
  /** 达成奖励：一小笔材料，比一张条子略厚，走 gainAll 入库 */
  readonly reward: Cost;
};

/**
 * 目标链。顺序即达成顺序——同一帧同时满足多条时按这里的先后依次结算，
 * 事件顺序因此可复现。
 */
export const MILESTONES: readonly Milestone[] = [
  {
    id: "first-purifier",
    track: "purifiers",
    goal: 1,
    title: "第一台净水机",
    hint: "造一台净水机，别再靠攒雨水过日子",
    note: "第一台净水机烧起来了。海水进去，能喝的水出来——这事居然真让我们办成了。",
    reward: { wood: 4, rope: 2 },
  },
  {
    id: "storm-weathered",
    track: "storms",
    goal: 1,
    title: "撑过第一场风暴",
    hint: "把外圈绑牢，熬过第一场风暴",
    note: "风停了，筏子还在。少了两块板子，人一个没少，这买卖不亏。",
    reward: { wood: 6, metal: 2 },
  },
  {
    id: "raft-12",
    track: "tiles",
    goal: 12,
    title: "十二格的家",
    hint: "把木筏铺到 12 格",
    note: "第十二块板子钉下去，走一圈要拐三个弯了。以前叫木筏，现在勉强能叫地方。",
    reward: { water: 8, food: 8 },
  },
  {
    id: "day-3",
    track: "day",
    goal: 3,
    title: "活到第三天",
    hint: "撑到第 3 天",
    note: "第三个早上。水还有，粮还有，人还在数日子——那就继续数下去。",
    reward: { water: 10, food: 10 },
  },
];

/** 不是某个岛民在说话、而是整条筏子的事时，日记用这个署名 */
const RAFT_WHO = "木筏";

// ── 状态 ────────────────────────────────────────────────────────────

export type RequestState = "open" | "done" | "expired";

export type IslanderRequest = {
  readonly id: string;
  readonly kind: string;
  readonly who: string;
  readonly title: string;
  /** 要交的材料（1–2 种，全是整数） */
  readonly want: Cost;
  /** 交齐后给的东西（还没算连击加成） */
  readonly reward: Cost;
  readonly ttlMax: number;
  readonly doneNote: string;
  readonly failNote: string;
  /** 剩余秒数，归零作废 */
  ttl: number;
  state: RequestState;
};

export type DiaryTone = "good" | "bad" | "note";

export type DiaryEntry = {
  /** 板子自己的累计秒数，不是 session.time */
  readonly at: number;
  readonly who: string;
  readonly text: string;
  readonly tone: DiaryTone;
};

/**
 * 里程碑状态。`best` 只涨不跌：拆了净水机、风暴啃掉两格之后，已经达成的
 * 里程碑不会被撤销，也不会因为数值回落再发一次奖励。
 */
export type MilestoneState = {
  /** 已达成的 id，按达成先后排列 */
  done: MilestoneId[];
  /** 各里程碑达成时的板上秒数（state.elapsed）；没达成的键不存在 */
  at: Partial<Record<MilestoneId, number>>;
  /** 每条轨道见过的最大值 */
  best: Record<MilestoneTrack, number>;
  /** noteStorm() 累计的风暴场数，facts.storms 没传时用它 */
  storms: number;
};

export type BoardState = {
  elapsed: number;
  /** 还挂在板上的条子（交掉/作废的会立刻移出） */
  open: IslanderRequest[];
  /** 距离下一张条子还有几秒 */
  postT: number;
  /** 当前贴单间隔，随局势缩短 */
  postGap: number;
  /** id 自增计数，同种子下 id 也可复现 */
  seq: number;
  done: number;
  expired: number;
  /** 连续交单数，断一次清零 */
  streak: number;
  bestStreak: number;
  diary: DiaryEntry[];
  /** 目标链：与条子共用日记，但走 updateMilestones 那条旁路推进 */
  milestones: MilestoneState;
};

export type BoardEvent =
  | { readonly type: "request-posted"; readonly request: IslanderRequest }
  | { readonly type: "request-expired"; readonly request: IslanderRequest }
  | {
      readonly type: "request-done";
      readonly request: IslanderRequest;
      /** 已算上连击加成 */
      readonly reward: Cost;
      /** 真正入库的量（仓库满了会少于 reward） */
      readonly got: Cost;
      readonly streak: number;
    }
  | {
      readonly type: "milestone-done";
      readonly milestone: Milestone;
      /** 真正入库的量（仓库满了会少于 milestone.reward） */
      readonly got: Cost;
      /** 已达成 / 总数，HUD 拿去画目标链进度 */
      readonly done: number;
      readonly total: number;
    }
  | { readonly type: "diary"; readonly entry: DiaryEntry };

export function createMilestones(): MilestoneState {
  return {
    done: [],
    at: {},
    best: { purifiers: 0, storms: 0, tiles: 0, day: 0 },
    storms: 0,
  };
}

export function createBoard(): BoardState {
  return {
    elapsed: 0,
    open: [],
    postT: BOARD.firstS,
    postGap: BOARD.postGapS,
    seq: 0,
    done: 0,
    expired: 0,
    streak: 0,
    bestStreak: 0,
    diary: [],
    milestones: createMilestones(),
  };
}

export function resetBoard(state: BoardState): void {
  const fresh = createBoard();
  state.elapsed = fresh.elapsed;
  state.open.length = 0;
  state.postT = fresh.postT;
  state.postGap = fresh.postGap;
  state.seq = fresh.seq;
  state.done = fresh.done;
  state.expired = fresh.expired;
  state.streak = fresh.streak;
  state.bestStreak = fresh.bestStreak;
  state.diary.length = 0;
  // 就地清，别换对象：HUD 可能正抓着 board.milestones 画目标链
  const ms = state.milestones;
  ms.done.length = 0;
  for (const key of Object.keys(ms.at) as MilestoneId[]) delete ms.at[key];
  for (const track of MILESTONE_TRACKS) ms.best[track] = 0;
  ms.storms = 0;
}

// ── 推进 ────────────────────────────────────────────────────────────

/** 难度档 0–maxTier：越往后要得越多、给得越多、时限越短 */
export function tierOf(elapsed: number): number {
  return Math.max(0, Math.min(BOARD.maxTier, Math.floor(elapsed / BOARD.tierEveryS)));
}

function rollInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.min(max - min, Math.floor(rng() * (max - min + 1)));
}

/** 这一档下这张条子最多会要多少（挑模板时按最坏情况判，贴出来的单保证当场交得起） */
function worstWant(kind: RequestKind, tier: number): Cost {
  const want: Cost = {};
  for (const w of kind.want) {
    want[w.id] = (want[w.id] ?? 0) + w.max + tier * BOARD.wantPerTier;
  }
  return want;
}

function affordableNow(res: Resources, kind: RequestKind, tier: number): boolean {
  const worst = worstWant(kind, tier);
  for (const id of RESOURCE_IDS) {
    const need = worst[id] ?? 0;
    if (need > 0 && res[id] < need) return false;
  }
  return true;
}

/**
 * 挑一张要贴的模板。优先级：板上没重样的 > 现在就掏得出材料的。
 * 后者用到 res 是刻意的——一开局四种料都只有个位数，不筛的话板子会立刻
 * 挂满交不起的死单，玩家看一眼就再也不看了。两个筛子都空时退回全表。
 */
function pickKind(state: BoardState, res: Resources, rng: Rng, tier: number): RequestKind {
  const onBoard = new Set(state.open.map((r) => r.kind));
  const fresh = REQUEST_KINDS.filter((k) => !onBoard.has(k.key));
  const pool = fresh.length > 0 ? fresh : REQUEST_KINDS;
  const doable = pool.filter((k) => affordableNow(res, k, tier));
  const bag = doable.length > 0 ? doable : pool;
  return bag[Math.min(bag.length - 1, Math.floor(rng() * bag.length))] ?? REQUEST_KINDS[0];
}

/** 按比例放大一张表，向上取整但至少保住原来的 1 个 */
export function scaleCost(cost: Cost, mul: number): Cost {
  const out: Cost = {};
  for (const id of RESOURCE_IDS) {
    const n = cost[id] ?? 0;
    if (n > 0) out[id] = Math.max(1, Math.round(n * mul));
  }
  return out;
}

function makeRequest(state: BoardState, kind: RequestKind, rng: Rng, tier: number): IslanderRequest {
  const want: Cost = {};
  for (const w of kind.want) {
    want[w.id] = (want[w.id] ?? 0) + rollInt(rng, w.min, w.max) + tier * BOARD.wantPerTier;
  }
  const reward = tier > 0 ? scaleCost(kind.reward, 1 + tier * BOARD.rewardPerTier) : { ...kind.reward };
  const ttl = Math.max(BOARD.ttlMinS, BOARD.ttlS - tier * BOARD.ttlPerTier);
  state.seq += 1;
  return {
    id: `req-${state.seq}`,
    kind: kind.key,
    who: kind.who,
    title: kind.title,
    want,
    reward,
    ttl,
    ttlMax: ttl,
    doneNote: kind.onDone,
    failNote: kind.onFail,
    state: "open",
  };
}

function pushDiary(state: BoardState, who: string, text: string, tone: DiaryTone): DiaryEntry {
  const entry: DiaryEntry = { at: state.elapsed, who, text, tone };
  state.diary.push(entry);
  if (state.diary.length > BOARD.diaryMax) state.diary.splice(0, state.diary.length - BOARD.diaryMax);
  return entry;
}

/**
 * 推进一帧请求板：条子倒计时、过期作废、到点贴新单。
 * 和 economy / threats 一样，只有 playing 场景该调用；不调用即自然冻结。
 *
 * @param res 只读用途——用来筛「现在交得起」的模板，本函数不加也不扣资源
 * @returns 本帧事件（顺序即发生顺序）
 */
export function updateBoard(state: BoardState, res: Resources, dt: number, rng: Rng): BoardEvent[] {
  const events: BoardEvent[] = [];
  if (dt <= 0) return events;
  state.elapsed += dt;

  let anyExpired = false;
  for (const req of state.open) {
    if (req.state !== "open") continue;
    req.ttl -= dt;
    if (req.ttl > 0) continue;
    req.ttl = 0;
    req.state = "expired";
    anyExpired = true;
    state.expired += 1;
    state.streak = 0;
    events.push({ type: "request-expired", request: req });
    events.push({ type: "diary", entry: pushDiary(state, req.who, req.failNote, "bad") });
  }
  if (anyExpired) state.open = state.open.filter((r) => r.state === "open");

  state.postT -= dt;
  if (state.postT <= 0) {
    if (state.open.length >= BOARD.slots) {
      // 板满了就压住计时器等空位，别把间隔攒成一串一次性糊上去
      state.postT = BOARD.postMinS;
    } else {
      const tier = tierOf(state.elapsed);
      const req = makeRequest(state, pickKind(state, res, rng, tier), rng, tier);
      state.open.push(req);
      state.postGap = Math.max(BOARD.postMinS, state.postGap - BOARD.postDecayS);
      state.postT = state.postGap;
      events.push({ type: "request-posted", request: req });
      events.push({
        type: "diary",
        entry: pushDiary(state, req.who, `${req.title}（要 ${costLabel(req.want)}）`, "note"),
      });
    }
  }

  return events;
}

// ── 交单 ────────────────────────────────────────────────────────────

export type CompleteDenial =
  | "unknown" // 这个 id 不在板上（已交、已过期或压根没有）
  | "cannot-afford"; // 材料不够

export type CompleteResult =
  | {
      readonly ok: true;
      readonly request: IslanderRequest;
      /** 实际扣掉的材料 */
      readonly paid: Cost;
      /** 已算连击加成的奖励 */
      readonly reward: Cost;
      /** 真正入库的量 */
      readonly got: Cost;
      readonly streak: number;
      readonly bonus: boolean;
      readonly events: readonly BoardEvent[];
    }
  | {
      readonly ok: false;
      readonly reason: CompleteDenial;
      readonly request: IslanderRequest | null;
      /** 还差多少（只列缺的那几种），够了就是空表 */
      readonly missing: Cost;
    };

/** 每种拒绝理由的中文短句，HUD 直接贴到板子上 */
export const COMPLETE_HINTS: Record<CompleteDenial, string> = {
  unknown: "这张条子已经不在板上了",
  "cannot-afford": "材料还差一点",
};

export function completeHint(reason: CompleteDenial): string {
  return COMPLETE_HINTS[reason] ?? "交不了";
}

export function requestById(state: BoardState, id: string): IslanderRequest | undefined {
  return state.open.find((r) => r.id === id);
}

/** 还差多少材料；交得起返回空表 */
export function missingFor(res: Resources, want: Cost): Cost {
  const short: Cost = {};
  for (const id of RESOURCE_IDS) {
    const need = want[id] ?? 0;
    const gap = need - res[id];
    if (need > 0 && gap > 0) short[id] = gap;
  }
  return short;
}

export function canComplete(state: BoardState, res: Resources, id: string): boolean {
  const req = requestById(state, id);
  if (!req || req.state !== "open") return false;
  for (const key of RESOURCE_IDS) {
    const need = req.want[key] ?? 0;
    if (need > 0 && res[key] < need) return false;
  }
  return true;
}

/**
 * 交单：扣材料、发奖励、记日记。
 *
 * 失败（id 不在板上 / 材料不够）时仓库分文不动——pay() 先查后扣，
 * 不存在扣了一半的中间态，也就永远扣不到负数。
 */
export function complete(state: BoardState, res: Resources, id: string): CompleteResult {
  const req = requestById(state, id);
  if (!req || req.state !== "open") {
    return { ok: false, reason: "unknown", request: null, missing: {} };
  }
  if (!pay(res, req.want)) {
    return { ok: false, reason: "cannot-afford", request: req, missing: missingFor(res, req.want) };
  }

  req.state = "done";
  state.done += 1;
  state.streak += 1;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  state.open = state.open.filter((r) => r !== req);

  const bonus = state.streak >= BOARD.streakAt;
  const reward = bonus ? scaleCost(req.reward, BOARD.streakMul) : { ...req.reward };
  const got = gainAll(res, reward);

  const events: BoardEvent[] = [
    { type: "request-done", request: req, reward, got, streak: state.streak },
    { type: "diary", entry: pushDiary(state, req.who, req.doneNote, "good") },
  ];
  if (bonus) {
    events.push({
      type: "diary",
      entry: pushDiary(state, RAFT_WHO, `连着交了 ${state.streak} 单，大伙儿多塞了点谢礼。`, "good"),
    });
  }

  return { ok: true, request: req, paid: { ...req.want }, reward, got, streak: state.streak, bonus, events };
}

// ── 目标链 ──────────────────────────────────────────────────────────

/**
 * 里程碑读的世界事实。全部可选：session 现在只数得出建筑和天数，风暴那项
 * 先空着（或者走 noteStorm 记），缺项按 0 算，也就是「还没达成」。
 */
export type MilestoneFacts = {
  /** 第几天，从 1 开始 */
  readonly day?: number;
  /** 木筏格数（含开局那 9 格） */
  readonly tiles?: number;
  /** 已建成的净水机座数 */
  readonly purifiers?: number;
  /** 撑过的风暴场数；不传就用 noteStorm 累计的那个 */
  readonly storms?: number;
};

function factOf(state: MilestoneState, facts: MilestoneFacts, track: MilestoneTrack): number {
  const raw =
    track === "day"
      ? (facts.day ?? 0)
      : track === "tiles"
        ? (facts.tiles ?? 0)
        : track === "purifiers"
          ? (facts.purifiers ?? 0)
          : Math.max(facts.storms ?? 0, state.storms);
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

/** 这条轨道到目前为止见过的最大值（不写状态，milestoneProgress 用它算进度） */
function seenOn(state: MilestoneState, facts: MilestoneFacts, track: MilestoneTrack): number {
  return Math.max(state.best[track], factOf(state, facts, track));
}

/**
 * 记一场撑过去的风暴。session 还没数风暴时，这就是那条留出来的接口：
 * threats 那边收到 storm 结算完的事件时调一次，`storm-weathered` 就会在下一次
 * updateMilestones 里达成。也可以改走 facts.storms，两条路取大值，不会重复计。
 */
export function noteStorm(state: BoardState, n = 1): void {
  if (!Number.isFinite(n) || n <= 0) return;
  state.milestones.storms += Math.floor(n);
}

/**
 * 推进目标链：把世界事实喂进来，达成的里程碑发奖励 + 记日记。
 *
 * 和 updateBoard 是两条独立的路——这里不吃 dt、不抽 rng、不碰板上的条子，
 * 一帧调几次都一样（同一个里程碑只会结算一次，`done` 里有就直接跳过）。
 * 奖励走 gainAll：仓库满了就少入库一点，从不失败、也不会扣成负数。
 *
 * @returns 本次新达成的里程碑事件（顺序 = MILESTONES 的表序）
 */
export function updateMilestones(state: BoardState, res: Resources, facts: MilestoneFacts = {}): BoardEvent[] {
  const ms = state.milestones;
  for (const track of MILESTONE_TRACKS) {
    const now = factOf(ms, facts, track);
    if (now > ms.best[track]) ms.best[track] = now;
  }

  const events: BoardEvent[] = [];
  for (const m of MILESTONES) {
    if (ms.at[m.id] !== undefined) continue;
    if (ms.best[m.track] < m.goal) continue;

    ms.done.push(m.id);
    ms.at[m.id] = state.elapsed;
    const got = gainAll(res, m.reward);
    events.push({
      type: "milestone-done",
      milestone: m,
      got,
      done: ms.done.length,
      total: MILESTONES.length,
    });
    events.push({ type: "diary", entry: pushDiary(state, RAFT_WHO, m.note, "good") });
  }
  return events;
}

export type MilestoneProgress = {
  readonly id: MilestoneId;
  readonly title: string;
  /** 没达成时挂的目标文案，达成后 HUD 一般换成 note */
  readonly hint: string;
  readonly reward: Cost;
  /** 当前值（取历史最大，不会因为拆房回落） */
  readonly have: number;
  readonly goal: number;
  /** have / goal 截到 0–1 */
  readonly ratio: number;
  readonly done: boolean;
  /** 达成时的板上秒数，没达成是 null */
  readonly at: number | null;
};

/** 整条目标链的进度，表序即展示顺序 */
export function milestoneProgress(state: BoardState, facts: MilestoneFacts = {}): MilestoneProgress[] {
  const ms = state.milestones;
  return MILESTONES.map((m) => {
    const at = ms.at[m.id];
    const have = Math.max(seenOn(ms, facts, m.track), at !== undefined ? m.goal : 0);
    return {
      id: m.id,
      title: m.title,
      hint: m.hint,
      reward: { ...m.reward },
      have,
      goal: m.goal,
      ratio: m.goal > 0 ? Math.max(0, Math.min(1, have / m.goal)) : 1,
      done: at !== undefined,
      at: at ?? null,
    };
  });
}

/** 下一个还没达成的里程碑，HUD 拿去挂「当前目标」；全达成返回 null */
export function nextMilestone(state: BoardState, facts: MilestoneFacts = {}): MilestoneProgress | null {
  return milestoneProgress(state, facts).find((p) => !p.done) ?? null;
}

export function milestoneDone(state: BoardState, id: MilestoneId): boolean {
  return state.milestones.at[id] !== undefined;
}

export type MilestoneSummary = {
  readonly done: number;
  readonly total: number;
  /** 完成度 0–1 */
  readonly ratio: number;
  /** 最近达成的那个，没有就是 null */
  readonly latest: MilestoneId | null;
};

export function milestoneSummary(state: BoardState): MilestoneSummary {
  const done = state.milestones.done;
  return {
    done: done.length,
    total: MILESTONES.length,
    ratio: MILESTONES.length > 0 ? done.length / MILESTONES.length : 1,
    latest: done.length > 0 ? done[done.length - 1] : null,
  };
}

// ── 给 HUD / 结算的只读派生 ─────────────────────────────────────────

/** 时限进度 0–1（1 = 到点作废），HUD 拿它画条 */
export function urgencyOf(req: IslanderRequest): number {
  if (req.ttlMax <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - req.ttl / req.ttlMax));
}

/** 是否快过期了（剩余不足 BOARD.urgentAt） */
export function isUrgent(req: IslanderRequest): boolean {
  return req.state === "open" && req.ttlMax > 0 && req.ttl / req.ttlMax < BOARD.urgentAt;
}

/** "木板 ×4 · 绳索 ×2"，需求和奖励共用 */
export function costLabel(cost: Cost): string {
  const parts: string[] = [];
  for (const id of RESOURCE_IDS) {
    const n = cost[id] ?? 0;
    if (n > 0) parts.push(`${RESOURCE_NAMES[id as ResourceId]} ×${n}`);
  }
  return parts.join(" · ");
}

export type BoardSummary = {
  readonly open: number;
  readonly done: number;
  readonly expired: number;
  readonly streak: number;
  readonly bestStreak: number;
  /** 交单率 0–1，一张都没结算过时为 0 */
  readonly rate: number;
};

export function boardSummary(state: BoardState): BoardSummary {
  const settled = state.done + state.expired;
  return {
    open: state.open.length,
    done: state.done,
    expired: state.expired,
    streak: state.streak,
    bestStreak: state.bestStreak,
    rate: settled > 0 ? state.done / settled : 0,
  };
}

/** 最近 n 条日记，新的在前 */
export function recentDiary(state: BoardState, n = 3): DiaryEntry[] {
  return state.diary.slice(Math.max(0, state.diary.length - n)).reverse();
}

/** 现在就交得起的条子，HUD 拿去高亮「可交」 */
export function readyRequests(state: BoardState, res: Resources): IslanderRequest[] {
  return state.open.filter((r) => canComplete(state, res, r.id));
}

// ── 完成庆祝 ────────────────────────────────────────────────────────

/**
 * 交单和里程碑的庆祝文案。放在这里是因为「给了多少」只有本文件算得准
 * （连击加成、仓库截断后的 got），session 那边再拼一遍容易和事件对不上。
 * 纯派生：不读写 state、不抽 rng，同一批事件调几次都一样。
 */
export type CelebrationKind = "request" | "milestone";

export type Celebration = {
  readonly kind: CelebrationKind;
  /** 胶囊第一行的主语：条子标题 / 里程碑标题 */
  readonly name: string;
  /** 跟在主语后面的那两个字 */
  readonly tag: string;
  /** 第二行奖励标签；仓库满到一件都没入库时为 undefined，HUD 少画一行 */
  readonly reward?: string;
  /** 连击 / 目标链进度的一句尾巴，HUD 不画也无妨 */
  readonly note?: string;
};

/** "+淡水 ×12 · +食物 ×5"；一件都没入库返回 undefined */
export function rewardLabel(cost: Cost): string | undefined {
  const parts: string[] = [];
  for (const id of RESOURCE_IDS) {
    const n = cost[id] ?? 0;
    if (n > 0) parts.push(`+${RESOURCE_NAMES[id as ResourceId]} ×${n}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** 一条事件的庆祝文案；不值得庆祝的事件（贴单/过期/日记）返回 null */
export function celebrationFor(event: BoardEvent): Celebration | null {
  if (event.type === "request-done") {
    return {
      kind: "request",
      name: event.request.title,
      tag: "完成！",
      reward: rewardLabel(event.got),
      note: event.streak >= BOARD.streakAt ? `连着交了 ${event.streak} 单` : undefined,
    };
  }
  if (event.type === "milestone-done") {
    return {
      kind: "milestone",
      name: event.milestone.title,
      tag: "达成！",
      reward: rewardLabel(event.got),
      note: `目标链 ${event.done}/${event.total}`,
    };
  }
  return null;
}

/**
 * 这一批事件里该演哪一个：一帧同时交单又达成里程碑时里程碑压过条子，
 * 同类取最后一条。HUD 一次只挂得下一只胶囊，挑选规则放这儿省得每处各写一遍。
 */
export function pickCelebration(events: readonly BoardEvent[]): Celebration | null {
  let request: Celebration | null = null;
  let milestone: Celebration | null = null;
  for (const ev of events) {
    const cel = celebrationFor(ev);
    if (!cel) continue;
    if (cel.kind === "milestone") milestone = cel;
    else request = cel;
  }
  return milestone ?? request;
}
