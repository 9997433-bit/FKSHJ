/**
 * 剧情层：按天数和建造进度解锁日记 / 电台广播。
 *
 * 契约：
 * - 纯函数 + 不可变状态，不碰 DOM、不碰画布、不持有定时器、不读存档，
 *   Node 下 `import` 进去跑 `updateStory` 就能推进整条线。
 * - `updateStory` **不修改**传入的 state，返回新对象；这一帧什么都没
 *   发生时原样返回旧引用，UI 可以直接用 `!==` 判断要不要重绘。
 * - 同一帧同时满足多条时按 `STORY_BEATS` 的表序排队，一帧只上屏一条，
 *   剩下的排队等前一条停留结束。
 * - 时间只从 `ctx.elapsed` 来（秒）。story 自己不计时，也不关心帧率。
 * - 文案与解锁条件都在 `beats.ts`，本文件只管调度。
 */

import { BEAT_COUNT, STORY_BEATS, type Beat, type BeatKind, type BeatRequirement, type StoryBeat } from "./beats";

export { BEAT_COUNT, STORY_BEATS };
export type { Beat, BeatKind, BeatRequirement, StoryBeat };

/**
 * 推进剧情要知道的外部状况。调用方（session）每帧现凑一份即可，
 * story 不持有对玩法对象的引用。
 */
export type StoryCtx = {
  /** 第几天，从 1 开始 */
  readonly day: number;
  /** 各类建筑当前数量，键对应 sim 的 BuildingId；缺的键按 0 算 */
  readonly buildings: Readonly<Record<string, number>>;
  /** 本局已存活秒数 */
  readonly elapsed: number;
};

export type StoryState = {
  /** 已解锁的 beat id，按解锁先后排列 */
  readonly unlocked: readonly string[];
  /** 已解锁但还没轮到上屏的 id */
  readonly queue: readonly string[];
  /** 当前该显示的一条，没有就是 null */
  readonly beat: Beat | null;
  /** 当前这条上屏时的 elapsed；没有 beat 时是上一条收走的时刻 */
  readonly shownAt: number;
};

const HOLD_BY_ID: ReadonlyMap<string, number> = new Map(STORY_BEATS.map((b) => [b.id, b.holdS]));
const BEAT_BY_ID: ReadonlyMap<string, StoryBeat> = new Map(STORY_BEATS.map((b) => [b.id, b]));

/** 开局状态：什么都没解锁，也没有可显示的条目。 */
export function createStory(): StoryState {
  return { unlocked: [], queue: [], beat: null, shownAt: 0 };
}

/**
 * 推进一帧。三件事，顺序固定：
 * 1. 把这一帧新满足条件的条目按表序追加到队尾；
 * 2. 当前条目停留够了就收走；
 * 3. 屏上空着且队里有货，就上一条（只上一条）。
 *
 * 幂等：ctx 不变时重复调用只会让当前条目按 elapsed 自然过期，
 * 不会重复解锁同一条（已解锁的 id 永远不再入队）。
 */
export function updateStory(state: StoryState, ctx: StoryCtx): StoryState {
  const now = seconds(ctx.elapsed);

  const fresh: string[] = [];
  for (const beat of STORY_BEATS) {
    if (state.unlocked.includes(beat.id)) continue;
    if (meetsRequirement(beat.require, ctx, now)) fresh.push(beat.id);
  }

  let queue: readonly string[] = fresh.length > 0 ? [...state.queue, ...fresh] : state.queue;
  let beat = state.beat;
  // elapsed 往回跳（换局、读档）时当作刚上屏，免得停留时间算成负数卡住。
  let shownAt = Math.min(state.shownAt, now);

  if (beat && now - shownAt >= holdOf(beat.id)) {
    beat = null;
    shownAt = now;
  }

  if (!beat && queue.length > 0) {
    const nextId = queue[0];
    const next = nextId === undefined ? undefined : BEAT_BY_ID.get(nextId);
    queue = queue.slice(1);
    if (next) {
      beat = { id: next.id, title: next.title, body: next.body };
      shownAt = now;
    }
  }

  if (fresh.length === 0 && beat === state.beat && queue === state.queue && shownAt === state.shownAt) {
    return state;
  }

  return {
    unlocked: fresh.length > 0 ? [...state.unlocked, ...fresh] : state.unlocked,
    queue,
    beat,
    shownAt,
  };
}

/** 当前可显示的条目，没有就是 null。等价于 `state.beat`，给不想记字段名的调用方。 */
export function currentBeat(state: StoryState): Beat | null {
  return state.beat;
}

/** 这条是不是已经解锁过了（含正在显示和已经收走的）。 */
export function hasUnlocked(state: StoryState, id: string): boolean {
  return state.unlocked.includes(id);
}

/** 解锁进度，UI 显示「3 / 16」用。 */
export function storyProgress(state: StoryState): { readonly unlocked: number; readonly total: number } {
  return { unlocked: state.unlocked.length, total: BEAT_COUNT };
}

/** 已解锁条目的完整内容，按解锁顺序，给「日志本」这类回看界面。 */
export function unlockedBeats(state: StoryState): StoryBeat[] {
  const out: StoryBeat[] = [];
  for (const id of state.unlocked) {
    const beat = BEAT_BY_ID.get(id);
    if (beat) out.push(beat);
  }
  return out;
}

/** 按 id 查表，查不到返回 null。 */
export function beatById(id: string): StoryBeat | null {
  return BEAT_BY_ID.get(id) ?? null;
}

// ── 内部 ────────────────────────────────────────────────────────────

function holdOf(id: string): number {
  return HOLD_BY_ID.get(id) ?? 0;
}

/** 非法输入（NaN / Infinity / 负数）一律当 0，剧情线宁可不动也不能崩。 */
function seconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function dayOf(day: number): number {
  return Number.isFinite(day) ? Math.max(1, Math.floor(day)) : 1;
}

function buildingCount(buildings: Readonly<Record<string, number>> | undefined, id: string): number {
  const n = buildings?.[id];
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** 三项都是下限且是「与」关系；一项都没写 = 开局即满足。 */
function meetsRequirement(require: BeatRequirement, ctx: StoryCtx, now: number): boolean {
  if (require.day !== undefined && dayOf(ctx.day) < require.day) return false;
  if (require.elapsed !== undefined && now < require.elapsed) return false;
  if (require.buildings) {
    for (const id of Object.keys(require.buildings)) {
      const need = require.buildings[id] ?? 0;
      if (buildingCount(ctx.buildings, id) < need) return false;
    }
  }
  return true;
}
