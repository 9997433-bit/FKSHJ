/**
 * 道具表：木筏上那只「随身袋」里能装的东西。
 *
 * 契约：
 * - 本文件是纯数据 + 纯函数，不碰 DOM、不碰画布、不 import 任何运行时模块，
 *   Node 下可直接 import 做单测。
 * - 这是**和资源表并列**的一层，不是替代品。`sim/rules.ts` 的 `Resources`
 *   仍然是建造/产出/消耗的唯一账本，行为一分不改；道具袋走
 *   `sim/inventory.ts`。两本账之间只有一条单向支流：袋里的口粮/饮水可以
 *   吃掉换成资源（`inventory.useItem`，汇率在 `constants.ITEM_USE`），
 *   反向没有口子，资源永远换不回物品。
 * - wood / plastic / metal / rope 四个 id 和 `ResourceId` 同名是**故意的**：
 *   共用一套 id 省掉图鉴、配方、飘字里的映射层。但同名**不等于**同一份
 *   数量，别把两边的数字加在一起——捞取的正菜只入 `Resources`，四种建材
 *   不进袋（早先的双写已经拆掉）。
 * - 能不能吃喝的**真源是 `constants.ITEM_USE`**（查询走
 *   `inventory.isUsableItem`）。这里的 `food` / `drink` 标签是给 HUD 分栏
 *   用的展示属性，两边眼下正好对得上，但别拿标签当吃喝判据。
 * - `ITEM_IDS` 的顺序 = 本文件 `ITEMS` 的书写顺序，是全局唯一的排序真源：
 *   背包列举、快照序列化、多物品原子操作都按它走，保证同样的输入永远得到
 *   同样的输出顺序。往表里插新物品会改变这个顺序，加在末尾最稳妥。
 *
 * `stack` 是**单格**堆叠上限，不是袋子总容量；袋子有几格由
 * `sim/inventory.ts` 的 `maxSlots` 决定。
 *
 * `dropWeight` 是**捞取附带掉落**的加权抽签权重（0 = 不从海里出）。命中率与
 * 保底节奏在 `data/constants.ts` 的 `ITEM_DROP`，抽签动作在
 * `sim/inventory.ts` 的 `rollItemDrop`；本文件只出「抽中哪一件」这张表，
 * 不掷骰子——`pickDropByRoll` 收一个 [0, 1) 的数，同样的数永远同样的结果。
 */

// ── 标签 ────────────────────────────────────────────────────────────

/** 物品标签，一件东西可以挂多个（油布既是打捞物也是建材）。 */
export type ItemTag =
  | "salvage" // 海面上捞得到
  | "material" // 能当建材使
  | "food" // 能吃
  | "drink" // 能喝
  | "tool" // 拿在手里干活的
  | "medical" // 药品
  | "container" // 装东西的容器
  | "relic"; // 旧世界的玩意儿，主要是念想

/** 标签的中文短名，将来 HUD 分栏直接用。 */
export const TAG_NAMES: Record<ItemTag, string> = {
  salvage: "打捞物",
  material: "建材",
  food: "口粮",
  drink: "饮水",
  tool: "工具",
  medical: "药品",
  container: "容器",
  relic: "旧物",
};

// ── 物品 ────────────────────────────────────────────────────────────

/** 袋子里装得下的东西。前四种与 `ResourceId` 同名（见文件头契约）。 */
export type ItemId =
  | "wood"
  | "plastic"
  | "metal"
  | "rope"
  | "tarp"
  | "barrel"
  | "kelp"
  | "driedFish"
  | "freshWater"
  | "hook"
  | "wrench"
  | "flare"
  | "compass"
  | "medkit"
  | "netScrap"
  | "glassFloat";

export type ItemSpec = {
  readonly id: ItemId;
  /** 中文名，HUD 直接显示 */
  readonly name: string;
  /** 一句话描述，鼠标悬停用 */
  readonly desc: string;
  /** 单格堆叠上限，必须是 ≥ 1 的整数 */
  readonly stack: number;
  /** 至少一个标签，顺序即显示顺序 */
  readonly tags: readonly ItemTag[];
  /**
   * 捞取附带掉落的权重（相对值，非概率）；0 = 海里不出，只能从别处来。
   * 四种建材是 0：它们是捞取的**正菜**，直接入 `Resources` 而不进袋；
   * 附带掉落这一发是给「正菜之外的惊喜」留的，再掉一次木板没有意义。
   */
  readonly dropWeight: number;
};

/**
 * 物品表。书写顺序即全局排序顺序（见文件头），先建材、再吃喝、后工具。
 * 堆叠上限的手感：散装原料 99，成件的杂物十几件，独一份的家伙事儿 1。
 *
 * `dropWeight` 的梯度：常见杂货十几、耐用工具个位数、留念的独一份 1；
 * 数字是相对值，改一个就等于改了整张表的相对稀有度。
 */
export const ITEMS: Record<ItemId, ItemSpec> = {
  wood: {
    id: "wood",
    name: "木板",
    desc: "拆船拆下来的旧木料，泡过海水也还钉得住",
    stack: 99,
    tags: ["salvage", "material"],
    dropWeight: 0,
  },
  plastic: {
    id: "plastic",
    name: "塑料",
    desc: "海上最不缺的东西，烤软了哪儿漏补哪儿",
    stack: 99,
    tags: ["salvage", "material"],
    dropWeight: 0,
  },
  metal: {
    id: "metal",
    name: "金属",
    desc: "锈得掉渣的铁皮和螺栓，炮塔的命根子",
    stack: 99,
    tags: ["salvage", "material"],
    dropWeight: 0,
  },
  rope: {
    id: "rope",
    name: "绳索",
    desc: "一段还没沤烂的缆绳，捆什么都指着它",
    stack: 99,
    tags: ["salvage", "material"],
    dropWeight: 0,
  },
  tarp: {
    id: "tarp",
    name: "油布",
    desc: "从货船棚顶扒下来的一大块，挡雨也接雨",
    stack: 20,
    tags: ["salvage", "material"],
    dropWeight: 14,
  },
  barrel: {
    id: "barrel",
    name: "空油桶",
    desc: "洗过三遍还有柴油味，能装水也能当浮筒",
    stack: 8,
    tags: ["salvage", "container"],
    dropWeight: 10,
  },
  kelp: {
    id: "kelp",
    name: "咸海带",
    desc: "晒硬的海带，嚼着像皮筋，好歹顶饿",
    stack: 30,
    tags: ["food"],
    dropWeight: 16,
  },
  driedFish: {
    id: "driedFish",
    name: "鱼干",
    desc: "硬得能敲钉子，泡开了算一顿正经饭",
    stack: 20,
    tags: ["food"],
    dropWeight: 12,
  },
  freshWater: {
    id: "freshWater",
    name: "净水囊",
    desc: "一囊刚滤好的淡水，别搁太阳底下晒",
    stack: 12,
    tags: ["drink", "container"],
    dropWeight: 8,
  },
  hook: {
    id: "hook",
    name: "鱼钩",
    desc: "铁丝拧的倒刺钩，钓鱼台的耗材",
    stack: 10,
    tags: ["tool"],
    dropWeight: 10,
  },
  wrench: {
    id: "wrench",
    name: "活扳手",
    desc: "缺了口的老扳手，修起东西来快一截",
    stack: 1,
    tags: ["tool"],
    dropWeight: 2,
  },
  flare: {
    id: "flare",
    name: "信号弹",
    desc: "一发照亮半片海，顺带把海盗也招过来",
    stack: 5,
    tags: ["tool"],
    dropWeight: 3,
  },
  compass: {
    id: "compass",
    name: "铜罗盘",
    desc: "指针卡过一次，如今只在天晴时准",
    stack: 1,
    tags: ["tool", "relic"],
    dropWeight: 1,
  },
  medkit: {
    id: "medkit",
    name: "急救包",
    desc: "纱布、碘酒，外加两片过期止痛药",
    stack: 5,
    tags: ["medical"],
    dropWeight: 4,
  },
  // 下面两件是后加的，按文件头的规矩接在末尾：往中间插会改全局顺序。
  netScrap: {
    id: "netScrap",
    name: "破渔网",
    desc: "缠成一团的尼龙网，拆开是绳，兜起来是网",
    stack: 12,
    tags: ["salvage", "material", "tool"],
    dropWeight: 9,
  },
  glassFloat: {
    id: "glassFloat",
    name: "玻璃浮球",
    desc: "老渔船挂网用的绿玻璃球，漂了不知多少年还没碎",
    stack: 6,
    tags: ["salvage", "relic"],
    dropWeight: 5,
  },
};

/**
 * 全部物品 id，顺序 = `ITEMS` 的书写顺序。
 * 从 `ITEMS` 现取而不是手写第二份，省得两边漏改。
 */
export const ITEM_IDS: readonly ItemId[] = Object.keys(ITEMS) as ItemId[];

/** id → 排序位次，`compareItems` 用；查表比 indexOf 稳。 */
const ITEM_ORDER: ReadonlyMap<ItemId, number> = new Map(ITEM_IDS.map((id, i) => [id, i]));

/** 数量袋/配方表，缺省项按 0 处理（形状同 `sim/rules.ts` 的 `Cost`）。 */
export type ItemBundle = Partial<Record<ItemId, number>>;

// ── 查询 ────────────────────────────────────────────────────────────

/** 运行时守卫：存档里读回来的字符串先过这一关。 */
export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ITEMS, value);
}

export function itemSpec(id: ItemId): ItemSpec {
  return ITEMS[id];
}

export function itemName(id: ItemId): string {
  return ITEMS[id].name;
}

/** 单格堆叠上限 */
export function stackLimit(id: ItemId): number {
  return ITEMS[id].stack;
}

export function hasTag(id: ItemId, tag: ItemTag): boolean {
  return ITEMS[id].tags.includes(tag);
}

/** 带某标签的全部物品，按全局顺序返回 */
export function itemsByTag(tag: ItemTag): readonly ItemId[] {
  return ITEM_IDS.filter((id) => hasTag(id, tag));
}

/**
 * 全局排序比较器：按 `ITEMS` 书写顺序。
 * 表外的 id 一律排到末尾（不该发生，但别让排序把它吞了）。
 */
export function compareItems(a: ItemId, b: ItemId): number {
  return (ITEM_ORDER.get(a) ?? ITEM_IDS.length) - (ITEM_ORDER.get(b) ?? ITEM_IDS.length);
}

// ── 掉落表 ──────────────────────────────────────────────────────────

/** 权重归一化：负数 / NaN / Infinity 一律当 0，坏数据顶多让某件东西不出。 */
function dropWeightRaw(id: ItemId): number {
  const w = ITEMS[id].dropWeight;
  return Number.isFinite(w) && w > 0 ? w : 0;
}

/** 海里出得来的东西，按全局顺序（权重 0 的不在内）。 */
export const DROP_IDS: readonly ItemId[] = ITEM_IDS.filter((id) => dropWeightRaw(id) > 0);

/** `DROP_IDS` 的权重之和，抽签的分母。表空时为 0。 */
export const TOTAL_DROP_WEIGHT: number = DROP_IDS.reduce((sum, id) => sum + dropWeightRaw(id), 0);

export function dropWeightOf(id: ItemId): number {
  return dropWeightRaw(id);
}

export function canDrop(id: ItemId): boolean {
  return dropWeightRaw(id) > 0;
}

/** 某件东西被抽中的概率（已命中掉落的前提下）。HUD / 图鉴报稀有度用。 */
export function dropChanceOf(id: ItemId): number {
  return TOTAL_DROP_WEIGHT > 0 ? dropWeightRaw(id) / TOTAL_DROP_WEIGHT : 0;
}

/**
 * 加权抽签：`u` 是 [0, 1) 的均匀随机数，返回抽中的 id。
 *
 * 本函数**不掷骰子**——骰子由调用方（`sim/inventory.ts` 的 `rollItemDrop`）
 * 从 session 的 `Rng` 里取，同一个 `u` 永远给同一件东西，单测直接喂常数。
 * `u` 越界按 [0, 1) 钳；掉落表为空返回 null。
 */
export function pickDropByRoll(u: number): ItemId | null {
  if (DROP_IDS.length === 0 || TOTAL_DROP_WEIGHT <= 0) return null;
  const t = Number.isFinite(u) ? Math.min(0.999999999, Math.max(0, u)) : 0;
  let acc = 0;
  const target = t * TOTAL_DROP_WEIGHT;
  for (const id of DROP_IDS) {
    acc += dropWeightRaw(id);
    if (target < acc) return id;
  }
  // 浮点累加差一丁点就会走到这儿，落回最后一格而不是返回 null
  return DROP_IDS[DROP_IDS.length - 1];
}
