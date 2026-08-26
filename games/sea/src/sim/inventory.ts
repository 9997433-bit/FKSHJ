import {
  compareItems,
  ITEM_IDS,
  ITEMS,
  pickDropByRoll,
  type ItemBundle,
  type ItemId,
} from "../data/catalog";
import { ITEM_DROP } from "../data/constants";
import type { Rng } from "./rules";

/**
 * 道具袋：`data/catalog.ts` 那些东西的容器。
 *
 * 契约：
 * - 纯数据 + 纯函数，不碰 DOM、不碰画布、不持有定时器，Node 下可直接
 *   import 做单测。除了传进来的那个 `Inventory`，本文件不写任何外部状态。
 * - **不动 `Resources`。** 建造花费、产出、断粮判定全在 `sim/rules.ts` 与
 *   `sim/economy.ts`，行为一分不改；这袋子是并列的一层，session 以后再接线。
 * - **原子**：所有写操作要么整笔成交，要么分文不动，不存在「装了一半」。
 *   想让打捞那种「捞爆了就溢出丢弃」的语义，显式传 `{ partial: true }`。
 * - **有上限**：两道闸门叠着算——每格最多堆 `ITEMS[id].stack` 件（单格上限），
 *   整个袋子最多 `maxSlots` 格。所以某样东西的实际容量取决于袋里还剩几个
 *   空格，`capacityFor` 是问这个的唯一正确姿势。
 * - **可确定性**：同样的输入永远得到同样的结果和同样的顺序。凡是要按顺序
 *   走的地方（列举、快照、多物品操作）一律按 catalog 的 `ITEM_IDS` 排，
 *   不吃 Map 的插入顺序。掉落也算在内：随机只走传进来的 `Rng`，本文件不碰
 *   `Math.random`，同种子同保底状态的一串捞取必出同一串东西。
 *
 * 数量一律是非负整数：小数按 `Math.floor` 截断，负数和 NaN 视为非法参数，
 * 直接失败返回而不抛异常（调用点大多在每帧循环里，抛了没人接）。
 */

// ── 类型 ────────────────────────────────────────────────────────────

export type Inventory = {
  /** 袋子有几格，创建后不变 */
  readonly maxSlots: number;
  /**
   * id → 件数。只存件数不存「第几格」：同一种东西的多个堆是等价的，
   * 占几格由 `slotsUsedBy` 现算，省掉一堆整理背包的边界情况。
   * 件数归零的条目会被删掉，`stacks.size` 始终 = 袋里有几种东西。
   */
  readonly stacks: Map<ItemId, number>;
};

/** 装东西的结果。`ok` = 请求的数量**全部**装进去了。 */
export type AddResult = {
  readonly ok: boolean;
  /** 实际入袋数（非 partial 模式下不是 0 就是请求的全量） */
  readonly added: number;
  /**
   * 超出容量的件数，即「还差多少格才装得下」，两种模式下算法相同：
   * partial 模式这部分被丢弃，非 partial 模式整笔作废但数字照报，
   * HUD 可以直接说「袋子还差 N 件的地方」。
   */
  readonly overflow: number;
};

/** 取东西的结果。`ok` = 请求的数量**全部**取出来了。 */
export type RemoveResult = {
  readonly ok: boolean;
  /** 实际出袋数（非 partial 模式下不是 0 就是请求的全量） */
  readonly removed: number;
  /** 袋里短的件数（同 `overflow`，两种模式下算法相同） */
  readonly missing: number;
};

/** 传 `{ partial: true }` 换成「能装多少装多少 / 有多少拿多少」 */
export type PartialOpt = { readonly partial?: boolean };

export type ItemStack = { readonly id: ItemId; readonly count: number };

/** 默认袋容量（格）。够装齐四种建材再加几样杂物。 */
export const DEFAULT_SLOTS = 16;

/** 数量归一化：截成非负整数，非法值（负数 / NaN / Infinity）返回 null */
function normalizeCount(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v < 0 ? null : v;
}

// ── 创建 ────────────────────────────────────────────────────────────

/**
 * 开一只新袋子。
 *
 * `init` 按 catalog 顺序逐样装入，**装不下的部分静默丢弃**——这里是读存档
 * 和造测试夹具的入口，不该因为别人把袋子改小了就炸掉整个存档。想知道到底
 * 装了多少，创建完自己数 `countOf`。
 */
export function createInventory(init: ItemBundle = {}, opts: { readonly maxSlots?: number } = {}): Inventory {
  const maxSlots = Math.max(1, Math.floor(opts.maxSlots ?? DEFAULT_SLOTS));
  const inv: Inventory = { maxSlots, stacks: new Map() };
  for (const id of ITEM_IDS) {
    const n = init[id] ?? 0;
    if (n > 0) addItem(inv, id, n, { partial: true });
  }
  return inv;
}

/** 深拷一只袋子。多物品原子操作靠它做草稿，存档回滚也用得上。 */
export function cloneInventory(inv: Inventory): Inventory {
  return { maxSlots: inv.maxSlots, stacks: new Map(inv.stacks) };
}

/** 倒空，格数不变 */
export function clearInventory(inv: Inventory): void {
  inv.stacks.clear();
}

// ── 容量 ────────────────────────────────────────────────────────────

/** `count` 件某物占几格（向上取整，零件占零格） */
function slotsFor(id: ItemId, count: number): number {
  return count <= 0 ? 0 : Math.ceil(count / ITEMS[id].stack);
}

/** 已占格数 */
export function usedSlots(inv: Inventory): number {
  let n = 0;
  for (const [id, count] of inv.stacks) n += slotsFor(id, count);
  return n;
}

/** 空格数 */
export function freeSlots(inv: Inventory): number {
  return Math.max(0, inv.maxSlots - usedSlots(inv));
}

export function isFull(inv: Inventory): boolean {
  return freeSlots(inv) === 0;
}

/** 某物现有几件 */
export function countOf(inv: Inventory, id: ItemId): number {
  return inv.stacks.get(id) ?? 0;
}

/** 袋里一共几件（不分种类） */
export function totalItems(inv: Inventory): number {
  let n = 0;
  for (const count of inv.stacks.values()) n += count;
  return n;
}

/**
 * 某物**还能再装几件**：先填满当前这半格，再论剩下的空格能开几个满堆。
 * 这是判断装不装得下的唯一正确算法——别拿 `stack` 直接减，那会漏掉
 * 「一种东西可以占好几格」这件事。
 */
export function capacityFor(inv: Inventory, id: ItemId): number {
  const stack = ITEMS[id].stack;
  const count = countOf(inv, id);
  const reachable = (slotsFor(id, count) + freeSlots(inv)) * stack;
  return Math.max(0, reachable - count);
}

// ── 读 ──────────────────────────────────────────────────────────────

/** 袋里至少有 `n` 件某物？`n` 为 0 恒真（空需求），`n` 非法恒假 */
export function has(inv: Inventory, id: ItemId, n = 1): boolean {
  const need = normalizeCount(n);
  if (need === null) return false;
  return countOf(inv, id) >= need;
}

/** 一整张单子上的东西是否都够 */
export function hasAll(inv: Inventory, bundle: ItemBundle): boolean {
  for (const id of ITEM_IDS) {
    const need = bundle[id] ?? 0;
    if (need > 0 && !has(inv, id, need)) return false;
  }
  return true;
}

/** 袋里的东西，按 catalog 顺序（确定性，可以直接喂给 UI 列表） */
export function listItems(inv: Inventory): ItemStack[] {
  return [...inv.stacks.entries()]
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => compareItems(a.id, b.id));
}

/**
 * 存档用快照：键按 catalog 顺序插入，所以同样的袋子 `JSON.stringify`
 * 出来的字符串永远一模一样。
 */
export function inventorySnapshot(inv: Inventory): ItemBundle {
  const out: ItemBundle = {};
  for (const id of ITEM_IDS) {
    const count = countOf(inv, id);
    if (count > 0) out[id] = count;
  }
  return out;
}

// ── 写（单件，原子）─────────────────────────────────────────────────

/**
 * 装 `n` 件某物。
 *
 * 默认全或无：装不下就一件都不装（`added: 0`）。传 `{ partial: true }`
 * 则能装多少装多少，装不下的记在 `overflow` 里丢弃。
 */
export function addItem(inv: Inventory, id: ItemId, n = 1, opts: PartialOpt = {}): AddResult {
  const want = normalizeCount(n);
  if (want === null) return { ok: false, added: 0, overflow: 0 };
  if (want === 0) return { ok: true, added: 0, overflow: 0 };

  const room = capacityFor(inv, id);
  const overflow = Math.max(0, want - room);
  const added = overflow === 0 ? want : opts.partial ? room : 0;
  if (added > 0) inv.stacks.set(id, countOf(inv, id) + added);
  return { ok: overflow === 0, added, overflow };
}

/**
 * 取 `n` 件某物。
 *
 * 默认全或无：不够就一件不动（`removed: 0`）。传 `{ partial: true }`
 * 则有多少拿多少，缺口记在 `missing` 里。
 */
export function removeItem(inv: Inventory, id: ItemId, n = 1, opts: PartialOpt = {}): RemoveResult {
  const want = normalizeCount(n);
  if (want === null) return { ok: false, removed: 0, missing: 0 };
  if (want === 0) return { ok: true, removed: 0, missing: 0 };

  const have = countOf(inv, id);
  const missing = Math.max(0, want - have);
  const removed = missing === 0 ? want : opts.partial ? have : 0;
  if (removed > 0) {
    const left = have - removed;
    if (left > 0) inv.stacks.set(id, left);
    else inv.stacks.delete(id); // 空条目留着会让 stacks.size 说谎
  }
  return { ok: missing === 0, removed, missing };
}

// ── 写（整单，跨物品原子）───────────────────────────────────────────

/** 把草稿的内容搬回真袋子（`maxSlots` 不变，两者本来就相同） */
function commit(inv: Inventory, draft: Inventory): void {
  inv.stacks.clear();
  for (const [id, count] of draft.stacks) inv.stacks.set(id, count);
}

/**
 * 整单装入：全装得下才装，任何一样装不下就整单不动。
 * 逐样按 catalog 顺序在草稿上试，所以结果与调用方给的键顺序无关。
 */
export function addItems(inv: Inventory, bundle: ItemBundle): boolean {
  const draft = cloneInventory(inv);
  for (const id of ITEM_IDS) {
    const n = bundle[id] ?? 0;
    if (n === 0) continue;
    if (!addItem(draft, id, n).ok) return false;
  }
  commit(inv, draft);
  return true;
}

/**
 * 整单取出（配方扣料）：全够才扣，缺一样就分文不动——
 * 同 `sim/rules.ts` 的 `pay`，先查后扣，没有中间态。
 */
export function removeItems(inv: Inventory, bundle: ItemBundle): boolean {
  if (!hasAll(inv, bundle)) return false;
  for (const id of ITEM_IDS) {
    const n = bundle[id] ?? 0;
    if (n > 0) removeItem(inv, id, n);
  }
  return true;
}

/**
 * 把不认识的 id 和非法数量筛掉，得到一张干净的单子。
 * 存档 / 网络数据进袋前先过这里。
 */
export function sanitizeBundle(raw: Readonly<Record<string, unknown>>): ItemBundle {
  const out: ItemBundle = {};
  for (const id of ITEM_IDS) {
    if (!Object.prototype.hasOwnProperty.call(raw, id)) continue;
    const value = raw[id];
    if (typeof value !== "number") continue;
    const count = normalizeCount(value);
    if (count !== null && count > 0) out[id] = count;
  }
  return out;
}

/** 存档回读：先洗单子再开袋，脏数据不会带进来 */
export function restoreInventory(raw: unknown, opts: { readonly maxSlots?: number } = {}): Inventory {
  if (typeof raw !== "object" || raw === null) return createInventory({}, opts);
  const bundle = sanitizeBundle(raw as Record<string, unknown>);
  return createInventory(bundle, opts);
}

// ── 捞取附带掉落 ────────────────────────────────────────────────────

/**
 * 掉落保底计数：`misses` = 连着几次捞取没出货。
 *
 * 一局一只，跟着 session 走（谁调 `rollItemDrop` 谁持有）。纯数据，
 * 存档想带上直接 JSON 序列化，读回来交给 `restoreItemPity` 洗一遍。
 */
export type ItemPity = { misses: number };

export function createItemPity(): ItemPity {
  return { misses: 0 };
}

/** 存档回读：不是非负整数就从 0 重新数，坏计数顶多让玩家多捞两把。 */
export function restoreItemPity(raw: unknown): ItemPity {
  const value = typeof raw === "object" && raw !== null ? (raw as { misses?: unknown }).misses : raw;
  const misses = typeof value === "number" ? normalizeCount(value) : null;
  return { misses: misses ?? 0 };
}

/**
 * 捞一把附带掉一件东西：中了返回 id，没中返回 null。
 *
 * 节奏全读 `constants.ITEM_DROP`：每次 `chance` 的概率出货，连着
 * `pityScoops` 次空手则下一次必出（`pityScoops` ≤ 0 视为不保底）。
 * 抽中哪一件按 catalog 的 `dropWeight` 加权，表在
 * `data/catalog.ts` 的 `pickDropByRoll`——建材权重是 0，所以附带掉落
 * 只出正菜之外的杂货。
 *
 * 两条确定性纪律：
 * - 随机只走传进来的 `rng`，且**每次固定消耗 2 次**（命中判定 1 次 +
 *   加权抽签 1 次），出不出货都一样。掉率怎么调都不会挪动 rng 序列的
 *   位置，风暴和海盗的复现不受物品表牵连。
 * - `pity` 由本函数推进：没出货 `misses += 1`，出货清零。数的是「掷骰子」
 *   而不是「装进袋子」——袋子满了是调用方（session）拿 `addItem` 处理的
 *   事，那一件按原子语义整件丢弃，保底不会因此白攒。
 *
 * 接线点是 session.tryScoop() 里捞取成功之后，用 session.rng；本函数
 * 不碰袋子、不碰 `Resources`。
 */
export function rollItemDrop(rng: Rng, pity: ItemPity): ItemId | null {
  const hitRoll = rng();
  const pickRoll = rng();

  const misses = normalizeCount(pity.misses) ?? 0;
  const forced = ITEM_DROP.pityScoops > 0 && misses >= ITEM_DROP.pityScoops;
  const hit = forced || (Number.isFinite(hitRoll) && hitRoll < ITEM_DROP.chance);

  const id = hit ? pickDropByRoll(pickRoll) : null;
  // 掉落表整张为空时 id 会是 null，那就当这一把没出货，保底接着攒
  pity.misses = id === null ? misses + 1 : 0;
  return id;
}
