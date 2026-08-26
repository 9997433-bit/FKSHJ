/**
 * 道具表：木筏上那只「随身袋」里能装的东西。
 *
 * 契约：
 * - 本文件是纯数据 + 纯函数，不碰 DOM、不碰画布、不 import 任何运行时模块，
 *   Node 下可直接 import 做单测。
 * - 这是**和资源表并列**的一层，不是替代品。`sim/rules.ts` 的 `Resources`
 *   仍然是建造/产出/消耗的唯一账本，行为一分不改；道具袋走
 *   `sim/inventory.ts`，两边目前互不写入，等 session 接线时再决定汇率。
 * - wood / plastic / metal / rope 四个 id 和 `ResourceId` 同名是**故意的**：
 *   将来「捞上来先进袋、再入库」时不用再做一层 id 映射。同名不等于同一份
 *   数量，别把两边的数字加在一起。
 * - `ITEM_IDS` 的顺序 = 本文件 `ITEMS` 的书写顺序，是全局唯一的排序真源：
 *   背包列举、快照序列化、多物品原子操作都按它走，保证同样的输入永远得到
 *   同样的输出顺序。往表里插新物品会改变这个顺序，加在末尾最稳妥。
 *
 * `stack` 是**单格**堆叠上限，不是袋子总容量；袋子有几格由
 * `sim/inventory.ts` 的 `maxSlots` 决定。
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
  | "medkit";

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
};

/**
 * 物品表。书写顺序即全局排序顺序（见文件头），先建材、再吃喝、后工具。
 * 堆叠上限的手感：散装原料 99，成件的杂物十几件，独一份的家伙事儿 1。
 */
export const ITEMS: Record<ItemId, ItemSpec> = {
  wood: {
    id: "wood",
    name: "木板",
    desc: "拆船拆下来的旧木料，泡过海水也还钉得住",
    stack: 99,
    tags: ["salvage", "material"],
  },
  plastic: {
    id: "plastic",
    name: "塑料",
    desc: "海上最不缺的东西，烤软了哪儿漏补哪儿",
    stack: 99,
    tags: ["salvage", "material"],
  },
  metal: {
    id: "metal",
    name: "金属",
    desc: "锈得掉渣的铁皮和螺栓，炮塔的命根子",
    stack: 99,
    tags: ["salvage", "material"],
  },
  rope: {
    id: "rope",
    name: "绳索",
    desc: "一段还没沤烂的缆绳，捆什么都指着它",
    stack: 99,
    tags: ["salvage", "material"],
  },
  tarp: {
    id: "tarp",
    name: "油布",
    desc: "从货船棚顶扒下来的一大块，挡雨也接雨",
    stack: 20,
    tags: ["salvage", "material"],
  },
  barrel: {
    id: "barrel",
    name: "空油桶",
    desc: "洗过三遍还有柴油味，能装水也能当浮筒",
    stack: 8,
    tags: ["salvage", "container"],
  },
  kelp: {
    id: "kelp",
    name: "咸海带",
    desc: "晒硬的海带，嚼着像皮筋，好歹顶饿",
    stack: 30,
    tags: ["food"],
  },
  driedFish: {
    id: "driedFish",
    name: "鱼干",
    desc: "硬得能敲钉子，泡开了算一顿正经饭",
    stack: 20,
    tags: ["food"],
  },
  freshWater: {
    id: "freshWater",
    name: "净水囊",
    desc: "一囊刚滤好的淡水，别搁太阳底下晒",
    stack: 12,
    tags: ["drink", "container"],
  },
  hook: {
    id: "hook",
    name: "鱼钩",
    desc: "铁丝拧的倒刺钩，钓鱼台的耗材",
    stack: 10,
    tags: ["tool"],
  },
  wrench: {
    id: "wrench",
    name: "活扳手",
    desc: "缺了口的老扳手，修起东西来快一截",
    stack: 1,
    tags: ["tool"],
  },
  flare: {
    id: "flare",
    name: "信号弹",
    desc: "一发照亮半片海，顺带把海盗也招过来",
    stack: 5,
    tags: ["tool"],
  },
  compass: {
    id: "compass",
    name: "铜罗盘",
    desc: "指针卡过一次，如今只在天晴时准",
    stack: 1,
    tags: ["tool", "relic"],
  },
  medkit: {
    id: "medkit",
    name: "急救包",
    desc: "纱布、碘酒，外加两片过期止痛药",
    stack: 5,
    tags: ["medical"],
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
