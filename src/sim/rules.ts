import {
  BUILD_COST,
  RESOURCE_CAP as RESOURCE_CAP_TABLE,
  START_RESOURCES as START_RESOURCES_TABLE,
  STRUCTURE_HP,
  TILE as TILE_GRID,
} from "../data/constants";
import type { BuildingId, PlaceableId, ResourceId } from "../data/constants";

/**
 * 规则层：资源、花费、木筏网格与放置合法性。
 *
 * 契约：
 * - 本文件是纯数据 + 纯函数，不碰 DOM、不碰画布、不持有定时器，
 *   Node 下可直接 import 做单测。
 * - 网格坐标是整数格 (gx, gy)，开局 3×3 即 |gx| ≤ 1 且 |gy| ≤ 1，
 *   指挥中心固定在 (0, 0)。世界坐标由 tileCenter/worldToTile 换算。
 * - 所有会花钱的操作走 pay()：先 canAfford 再扣，扣不动就整体不扣，
 *   不存在「扣了一半」的中间态。
 *
 * 数值来源：TILE / RESOURCE_CAP / START_RESOURCES / BUILD_COST /
 * STRUCTURE_HP 一律 import 自 `data/constants.ts`，本文件不再留副本——
 * 改平衡改那边一处即可。constants 里没有对应条目的（SEA_BOUNDS、
 * HOTBAR、RESOURCE_NAMES、PLACE_HINTS、BUILDINGS 的 name/desc/onWater）
 * 仍然定义在这里。
 */

// ── 资源 ────────────────────────────────────────────────────────────

/** 四种打捞物 + 两种生活物资（唯一定义在 data/constants.ts） */
export type { ResourceId };

/** 海面能捞到的东西（水和食物只能靠净水机/钓鱼台产） */
export const SALVAGE_IDS = ["wood", "plastic", "metal", "rope"] as const satisfies readonly ResourceId[];

export const RESOURCE_IDS = ["wood", "plastic", "metal", "rope", "water", "food"] as const;

export type SalvageId = (typeof SALVAGE_IDS)[number];
export type Resources = Record<ResourceId, number>;
/** 花费/产出表，缺省项按 0 处理 */
export type Cost = Partial<Record<ResourceId, number>>;

/** 仓库上限，捞爆了就溢出丢弃（也让 HUD 有个分母）。数值 = constants RESOURCE_CAP */
export const RESOURCE_CAP: Resources = RESOURCE_CAP_TABLE;

/**
 * 开局家底：够铺一块地基 + 一台产出建筑，金属正好够第一座炮塔。
 * 数值 = constants START_RESOURCES；createResources 每局拷一份，不写回原表。
 */
export const START_RESOURCES: Resources = START_RESOURCES_TABLE;

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  wood: "木板",
  plastic: "塑料",
  metal: "金属",
  rope: "绳索",
  water: "淡水",
  food: "食物",
};

// ── 建筑 ────────────────────────────────────────────────────────────

/**
 * PlaceableId = 玩家能放的东西（顺序即 1–5 快捷键顺序）；BuildingId 再加上
 * 开局就在、玩家造不出来的 core。两者唯一定义在 data/constants.ts。
 */
export type { BuildingId, PlaceableId };

export const HOTBAR = ["floor", "collector", "purifier", "fish", "turret"] as const satisfies readonly PlaceableId[];

export type BuildingSpec = {
  readonly id: BuildingId;
  readonly name: string;
  readonly cost: Cost;
  /** true = 铺在空海面且四邻接木筏；false = 盖在已有的空地基上 */
  readonly onWater: boolean;
  readonly maxHp: number;
  readonly desc: string;
};

/**
 * 建筑表：花费取 constants BUILD_COST、血上限取 constants STRUCTURE_HP，
 * 这里只补 constants 没有的文案与 onWater 规则。
 * core 造不出来，BUILD_COST 里也就没有它，花费固定是空表。
 */
export const BUILDINGS: Record<BuildingId, BuildingSpec> = {
  floor: {
    id: "floor",
    name: "地基",
    cost: BUILD_COST.floor,
    onWater: true,
    maxHp: STRUCTURE_HP.floor,
    desc: "扩一格木筏，必须四向贴着现有木筏",
  },
  collector: {
    id: "collector",
    name: "收集器",
    cost: BUILD_COST.collector,
    onWater: false,
    maxHp: STRUCTURE_HP.collector,
    desc: "自动捞木板和塑料",
  },
  purifier: {
    id: "purifier",
    name: "净水机",
    cost: BUILD_COST.purifier,
    onWater: false,
    maxHp: STRUCTURE_HP.purifier,
    desc: "产淡水",
  },
  fish: {
    id: "fish",
    name: "钓鱼台",
    cost: BUILD_COST.fish,
    onWater: false,
    maxHp: STRUCTURE_HP.fish,
    desc: "产食物",
  },
  turret: {
    id: "turret",
    name: "炮塔",
    cost: BUILD_COST.turret,
    onWater: false,
    maxHp: STRUCTURE_HP.turret,
    desc: "自动射击靠近的海盗",
  },
  core: {
    id: "core",
    name: "指挥中心",
    cost: {},
    onWater: false,
    maxHp: STRUCTURE_HP.core,
    desc: "老大的家。塌了这局就结算",
  },
};

// ── 世界与网格坐标 ──────────────────────────────────────────────────

/** 一格木筏的边长（逻辑像素）= constants TILE.sizePx */
export const TILE = TILE_GRID.sizePx;

/** 网格原点在世界坐标里的位置：逻辑画布正中 = constants TILE.originX / originY */
export const RAFT_ORIGIN = { x: TILE_GRID.originX, y: TILE_GRID.originY } as const;

/** 小船能跑的海域，以木筏为中心的一片矩形。constants 里没有这一项，只此一份 */
export const SEA_BOUNDS = {
  minX: RAFT_ORIGIN.x - 960,
  minY: RAFT_ORIGIN.y - 540,
  maxX: RAFT_ORIGIN.x + 960,
  maxY: RAFT_ORIGIN.y + 540,
} as const;

export type Vec2 = { x: number; y: number };
export type TilePos = { gx: number; gy: number };

/** 格子中心的世界坐标 */
export function tileCenter(gx: number, gy: number): Vec2 {
  return { x: RAFT_ORIGIN.x + gx * TILE, y: RAFT_ORIGIN.y + gy * TILE };
}

/** 世界坐标落在哪一格（用 round，因为格子中心才是整数格） */
export function worldToTile(x: number, y: number): TilePos {
  return {
    gx: Math.round((x - RAFT_ORIGIN.x) / TILE),
    gy: Math.round((y - RAFT_ORIGIN.y) / TILE),
  };
}

/** 四邻接偏移（题面要求的「四向」，不含斜角） */
export const NEIGHBOR4 = [
  { gx: 1, gy: 0 },
  { gx: -1, gy: 0 },
  { gx: 0, gy: 1 },
  { gx: 0, gy: -1 },
] as const;

export function neighbors4(gx: number, gy: number): TilePos[] {
  return NEIGHBOR4.map((d) => ({ gx: gx + d.gx, gy: gy + d.gy }));
}

export function cellKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

// ── 木筏 ────────────────────────────────────────────────────────────

export type Cell = {
  readonly gx: number;
  readonly gy: number;
  id: BuildingId;
  hp: number;
  maxHp: number;
  /** 产出计时器（秒），由 economy 维护 */
  timer: number;
};

export type Raft = {
  readonly cells: Map<string, Cell>;
  /** 指挥中心，永远留在 map 里；hp 归零只标记不删，方便结算界面还能画出来 */
  readonly core: Cell;
};

function makeCell(gx: number, gy: number, id: BuildingId): Cell {
  const maxHp = BUILDINGS[id].maxHp;
  return { gx, gy, id, hp: maxHp, maxHp, timer: 0 };
}

/**
 * 开局木筏，正中指挥中心。边长取 constants TILE.startSize（3 → 3×3，
 * 即 |gx| ≤ 1 且 |gy| ≤ 1）。网格以 (0,0) 格为中心，所以只有奇数边长
 * 有意义；偶数会被向下取到相邻的奇数。
 */
export function createRaft(): Raft {
  const half = Math.floor((TILE_GRID.startSize - 1) / 2);
  const cells = new Map<string, Cell>();
  for (let gy = -half; gy <= half; gy++) {
    for (let gx = -half; gx <= half; gx++) {
      cells.set(cellKey(gx, gy), makeCell(gx, gy, gx === 0 && gy === 0 ? "core" : "floor"));
    }
  }
  const core = cells.get(cellKey(0, 0));
  if (!core) throw new Error("raft core missing");
  return { cells, core };
}

export function cellAt(raft: Raft, gx: number, gy: number): Cell | undefined {
  return raft.cells.get(cellKey(gx, gy));
}

export function hasCell(raft: Raft, gx: number, gy: number): boolean {
  return raft.cells.has(cellKey(gx, gy));
}

export function allCells(raft: Raft): Cell[] {
  return [...raft.cells.values()];
}

export function countBuilding(raft: Raft, id: BuildingId): number {
  let n = 0;
  for (const c of raft.cells.values()) if (c.id === id) n++;
  return n;
}

/** 四邻接判定：空格子至少有一个正交邻居是木筏 */
export function isAdjacentToRaft(raft: Raft, gx: number, gy: number): boolean {
  return NEIGHBOR4.some((d) => raft.cells.has(cellKey(gx + d.gx, gy + d.gy)));
}

/**
 * 外圈 = 至少缺一个四邻居的格子。风暴只打这些。
 * 3×3 开局时正好是围着指挥中心的 8 格。
 */
export function outerCells(raft: Raft): Cell[] {
  return allCells(raft).filter((c) => !NEIGHBOR4.every((d) => raft.cells.has(cellKey(c.gx + d.gx, c.gy + d.gy))));
}

/** 离给定世界坐标最近的格子（海盗找目标用） */
export function nearestCell(raft: Raft, x: number, y: number): Cell | undefined {
  let best: Cell | undefined;
  let bestD = Infinity;
  for (const c of raft.cells.values()) {
    if (c.hp <= 0) continue;
    const p = tileCenter(c.gx, c.gy);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// ── 花费 ────────────────────────────────────────────────────────────

export function createResources(init: Partial<Resources> = {}): Resources {
  return { ...START_RESOURCES, ...init };
}

/** 只读检查，不动仓库 */
export function canAfford(res: Resources, cost: Cost): boolean {
  for (const id of RESOURCE_IDS) {
    const need = cost[id] ?? 0;
    if (need > 0 && res[id] < need) return false;
  }
  return true;
}

/** 付账。买不起返回 false 且**一分不扣**（先查后扣，无中间态） */
export function pay(res: Resources, cost: Cost): boolean {
  if (!canAfford(res, cost)) return false;
  for (const id of RESOURCE_IDS) {
    const need = cost[id] ?? 0;
    if (need > 0) res[id] -= need;
  }
  return true;
}

/** 退款（风暴拆房/手动回收），按比例向下取整 */
export function refund(res: Resources, cost: Cost, ratio = 0.5): void {
  for (const id of RESOURCE_IDS) {
    const paid = cost[id] ?? 0;
    if (paid > 0) gain(res, id, Math.floor(paid * ratio));
  }
}

/** 入库并截到上限，返回真正入库的数量（溢出部分被丢弃） */
export function gain(res: Resources, id: ResourceId, amount: number): number {
  if (amount <= 0) return 0;
  const before = res[id];
  res[id] = Math.min(RESOURCE_CAP[id], before + amount);
  return res[id] - before;
}

/** 按表入库，返回实际入库量 */
export function gainAll(res: Resources, out: Cost): Cost {
  const got: Cost = {};
  for (const id of RESOURCE_IDS) {
    const n = out[id] ?? 0;
    if (n > 0) got[id] = gain(res, id, n);
  }
  return got;
}

// ── 放置 ────────────────────────────────────────────────────────────

export type PlaceDenial =
  | "occupied" // 已经有东西了
  | "not-adjacent" // 地基没贴着木筏
  | "needs-floor" // 房子得盖在空地基上
  | "cannot-afford"; // 钱不够

export type PlaceCheck =
  | { readonly ok: true; readonly cost: Cost }
  | { readonly ok: false; readonly reason: PlaceDenial; readonly cost: Cost };

/** 每种拒绝理由对应的中文短句，HUD 直接贴到光标边上 */
export const PLACE_HINTS: Record<PlaceDenial, string> = {
  occupied: "这格已经占了",
  "not-adjacent": "得贴着木筏放",
  "needs-floor": "得盖在空地基上",
  "cannot-afford": "材料不够",
};

/** 拒绝理由 → 中文短句。纯函数，给 HUD/session 显示用 */
export function placeHint(reason: PlaceDenial): string {
  return PLACE_HINTS[reason] ?? "放不了";
}

/**
 * 放置合法性。顺序刻意是「位置先于价格」：位置不对时 HUD 该说
 * 「贴着筏子放」，而不是先怪玩家穷。
 */
export function checkPlace(raft: Raft, res: Resources, id: PlaceableId, gx: number, gy: number): PlaceCheck {
  const spec = BUILDINGS[id];
  const cell = cellAt(raft, gx, gy);
  if (spec.onWater) {
    if (cell) return { ok: false, reason: "occupied", cost: spec.cost };
    if (!isAdjacentToRaft(raft, gx, gy)) return { ok: false, reason: "not-adjacent", cost: spec.cost };
  } else {
    if (!cell) return { ok: false, reason: "needs-floor", cost: spec.cost };
    if (cell.id !== "floor") return { ok: false, reason: "occupied", cost: spec.cost };
  }
  if (!canAfford(res, spec.cost)) return { ok: false, reason: "cannot-afford", cost: spec.cost };
  return { ok: true, cost: spec.cost };
}

export function canPlace(raft: Raft, res: Resources, id: PlaceableId, gx: number, gy: number): boolean {
  return checkPlace(raft, res, id, gx, gy).ok;
}

/** 校验 + 付账 + 落地。失败时木筏和仓库都不变。 */
export function place(raft: Raft, res: Resources, id: PlaceableId, gx: number, gy: number): PlaceCheck {
  const check = checkPlace(raft, res, id, gx, gy);
  if (!check.ok) return check;
  pay(res, check.cost);
  const existing = cellAt(raft, gx, gy);
  if (existing) {
    // 升级空地基：换皮、换血上限，血量按原比例保留（别用重建洗血）
    const ratio = existing.maxHp > 0 ? existing.hp / existing.maxHp : 1;
    existing.id = id;
    existing.maxHp = BUILDINGS[id].maxHp;
    existing.hp = Math.max(1, Math.round(existing.maxHp * ratio));
    existing.timer = 0;
  } else {
    raft.cells.set(cellKey(gx, gy), makeCell(gx, gy, id));
  }
  return check;
}

// ── 损伤 ────────────────────────────────────────────────────────────

/**
 * 扣血。格子塌了返回 true。
 * 指挥中心不从 map 里移除（血量停在 0，由 gameover 判定接手）。
 */
export function damageCell(raft: Raft, cell: Cell, amount: number): boolean {
  if (amount <= 0 || cell.hp <= 0) return false;
  cell.hp -= amount;
  if (cell.hp > 0) return false;
  cell.hp = 0;
  if (cell.id !== "core") raft.cells.delete(cellKey(cell.gx, cell.gy));
  return true;
}

/** 修理，返回实际回血量 */
export function repairCell(cell: Cell, amount: number): number {
  if (cell.hp <= 0 || amount <= 0) return 0;
  const before = cell.hp;
  cell.hp = Math.min(cell.maxHp, before + amount);
  return cell.hp - before;
}

export function isCoreDown(raft: Raft): boolean {
  return raft.core.hp <= 0;
}

// ── 随机 ────────────────────────────────────────────────────────────

export type Rng = () => number;

/** mulberry32：同种子同序列，单测里风暴和海盗才可复现 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
