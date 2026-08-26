import { RESOURCE_IDS, RESOURCE_NAMES, gainAll, pay } from "./rules";
import type { Cost, ResourceId, Resources, Rng, SalvageId } from "./rules";

/**
 * 请求板层：岛民往板上贴条子，玩家用打捞来的建材换生活物资。
 *
 * 为什么要有这一层：木筏现在只有「捞 → 建 → 挨打」一条线，捞来的木板/塑料
 * 除了盖房子没有第二个去处，而淡水食物只能靠建筑慢慢产。请求板把这两头接上
 * ——拿一两种建材换一小笔水或食物，给玩家一个「现在缺水，先交两张单」的短期
 * 决策，同时顺手产出日记文本。
 *
 * 契约：
 * - 只依赖 rules 的 pay / gainAll / RESOURCE_NAMES，不碰 economy / threats /
 *   session，也不碰 DOM。旧文件一行没改，接线全在 session 那边。
 * - 随机全部走传入的 Rng：一次贴单固定消耗「1 次挑模板 + 每种材料 1 次」的
 *   抽取，同种子同序列。updateBoard 不贴单时一次 rng 都不消耗。
 * - 交单走 pay()：材料不够就整体不扣，仓库不会被扣成负数；超时作废也只是
 *   丢掉这笔奖励 + 清空连击，从不倒扣资源。
 * - 本文件不切场景、不放音效：updateBoard / complete 只返回事件，
 *   由 session 决定怎么演。
 *
 * 数值全在下面的 BOARD 与 REQUEST_KINDS 里（constants.ts 归别人管，
 * 本轮不动它，等定型了再搬过去）。
 */

// ── 数值 ────────────────────────────────────────────────────────────

export const BOARD = {
  /** 板上同时挂着的条子上限 */
  slots: 3,
  /** 开局多久贴出第一张（秒）。晚于首次产出、早于首场风暴 */
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
  | { readonly type: "diary"; readonly entry: DiaryEntry };

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
      entry: pushDiary(state, "木筏", `连着交了 ${state.streak} 单，大伙儿多塞了点谢礼。`, "good"),
    });
  }

  return { ok: true, request: req, paid: { ...req.want }, reward, got, streak: state.streak, bonus, events };
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
