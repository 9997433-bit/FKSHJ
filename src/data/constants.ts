/**
 * 全局数值表（fable-arch 维护；Round 2 已与 sim 对齐）。
 *
 * 先读这段再改数——本文件的导出分两类：
 *
 * 1. 【被运行时消费】CANVAS、LOOP、SAVE_KEY、DAY、SALVAGE。
 *    改这里就是改游戏。动形状前先查引用：engine/input/hud/rules 吃
 *    CANVAS，loop 吃 LOOP，save 吃 SAVE_KEY，ocean 吃 DAY，
 *    junk 吃 SALVAGE 的**每一个键**（含 weights / yields 的元组形状）。
 *
 * 2. 【文档镜像】其余全部（TILE、RESOURCE_CAP、START_RESOURCES、
 *    BUILD_COST、STRUCTURE_HP、PRODUCTION、CREW/UPKEEP/REPAIR/STARVE、
 *    STORM/WAVE/TURRET、PIRATE、SKIFF）。运行时真相在 sim 侧本地副本：
 *    `sim/rules.ts`（资源/建筑/网格）、`sim/economy.ts`（产出/吃喝/维修/
 *    断粮）、`sim/threats.ts`（风暴/海盗波/炮塔）、`entities/skiff.ts` 与
 *    `entities/pirate.ts`（小船/海盗手感）。sim 并**不** import 镜像段；
 *    改平衡请改 sim 原件，再回来同步这里。两边不一致时，以能跑的 sim 为准。
 *
 * 约定：
 * - 单位：长度 = 逻辑像素（CANVAS 坐标系），时间 = 秒。
 * - 网格全游戏只有一套：格边长 64px、原点在画布正中、格坐标为有符号
 *   整数（见 TILE 注释）。禁止再发明第二套网格。
 *
 * 平衡现状（按 sim 数值算）：什么都不建时，淡水 45 ÷ (3 人 × 0.12/s)
 * ≈ 125 秒见底，再加 25 秒断粮宽限 ≈ 150 秒结算。首场风暴 50 秒、
 * 海盗首波 55 秒；开局金属 8 恰好一座炮塔（但净水机也要金属 4，
 * 二选一，缺口靠捞或击杀海盗补）。
 */

// ═══════════════════════════════════════════════════════════════════
// 一、被运行时消费的数（这里就是真相）
// ═══════════════════════════════════════════════════════════════════

/** 逻辑画布尺寸与 DPR 上限。所有绘制工作在 w×h 逻辑坐标系（engine.fit 负责换算）。 */
export const CANVAS = { w: 1280, h: 720, maxDpr: 2 } as const;

/** 主循环帧钳制：单帧模拟时长上限 / 无上一帧时间戳时的兜底 dt（见 loop.ts 契约）。 */
export const LOOP = { maxDtS: 0.033, fallbackDtS: 0.016 } as const;

/** localStorage 存档键（读写实现在 src/data/save.ts，归 opus-content）。 */
export const SAVE_KEY = "cww_sea_v1";

/** 昼夜循环（ocean.ts 消费）。相位 = (elapsed / lengthS) mod 1；仅影响视觉与 HUD 报天数。 */
export const DAY = {
  /** 一昼夜时长（秒） */
  lengthS: 120,
  /** 夜晚占比（相位 ≥ 1 − nightFrac 视为夜） */
  nightFrac: 0.25,
} as const;

/** 漂浮物：海面随机刷新、缓慢漂流、超时沉没（world/junk.ts 消费全部键）。 */
export const SALVAGE = {
  /** 平均刷新间隔（秒） */
  spawnIntervalS: 2.5,
  /** 海面同时存在的漂浮物上限 */
  maxAfloat: 12,
  /** 漂流速度（逻辑像素/秒） */
  driftPxS: 12,
  /** 无人捞取的存活时长（秒），超时沉没 */
  despawnS: 45,
  /** 各类漂浮物的刷新权重（归一化前） */
  weights: { wood: 0.4, plastic: 0.3, metal: 0.2, rope: 0.1 },
  /** 单件捞取产出区间 [min, max]（整数，含端点） */
  yields: {
    wood: [4, 8],
    plastic: [3, 6],
    metal: [2, 4],
    rope: [1, 3],
  },
} as const;

// ═══════════════════════════════════════════════════════════════════
// 二、文档镜像（与 sim 手工同步；运行时不 import 这一段）
// ═══════════════════════════════════════════════════════════════════

// ── 网格（镜像 sim/rules.ts 的 TILE / RAFT_ORIGIN）──────────────────

/**
 * 木筏建造网格。
 * - 格坐标是**有符号整数** (gx, gy)，指挥中心固定在 (0, 0)；
 *   开局 3×3 即 |gx| ≤ 1 且 |gy| ≤ 1。
 * - origin 是 (0, 0) 格的**中心**（不是左上角）：
 *   center = (originX + gx × sizePx, originY + gy × sizePx)，
 *   换算函数见 sim/rules.ts 的 tileCenter / worldToTile。
 * - 没有 gridW / gridH：网格无边界，木筏靠四邻接向外扩张；
 *   Round 1 文档里的 15×11 / 48px / 左上角原点网格已废弃。
 * - 小船活动海域另见 sim/rules.ts SEA_BOUNDS（木筏为中心 1920×1080）。
 */
export const TILE = {
  /** 一格边长（逻辑像素）= sim/rules.ts 的 `TILE` */
  sizePx: 64,
  /** (0,0) 格中心 X = 画布正中（= sim 的 RAFT_ORIGIN.x） */
  originX: CANVAS.w / 2,
  /** (0,0) 格中心 Y = 画布正中（= sim 的 RAFT_ORIGIN.y） */
  originY: CANVAS.h / 2,
  /** 开局木筏边长（格）：正中 3×3，中心格为指挥中心 core */
  startSize: 3,
} as const;

// ── 资源（镜像 sim/rules.ts）────────────────────────────────────────

/** 六种资源：前四种是建材（捞/产），后两种是生存消耗品（产/耗）。 */
export type ResourceId = "wood" | "plastic" | "metal" | "rope" | "water" | "food";

/** 仓储上限（= sim RESOURCE_CAP）。入库超过上限的部分直接丢弃。 */
export const RESOURCE_CAP: Record<ResourceId, number> = {
  wood: 99,
  plastic: 99,
  metal: 99,
  rope: 99,
  water: 100,
  food: 100,
};

/**
 * 开局库存（= sim START_RESOURCES）。够铺一块地基 + 一台产出建筑；
 * 金属 8 恰好等于一座炮塔的价钱。
 */
export const START_RESOURCES: Record<ResourceId, number> = {
  wood: 14,
  plastic: 8,
  metal: 8,
  rope: 8,
  water: 45, // 3 岛民 × 0.12/s = 0.36/s → 约 125 秒耗尽
  food: 45, // 3 岛民 × 0.10/s = 0.30/s → 约 150 秒耗尽
};

// ── 建筑（镜像 sim/rules.ts 的 BUILDINGS 表）────────────────────────

/** 玩家可放置的建筑 id，顺序即 1–5 快捷键顺序（= sim HOTBAR）。 */
export type PlaceableId = "floor" | "collector" | "purifier" | "fish" | "turret";

/** 格子上可能站着的东西；`core` 是开局预置的指挥中心，玩家造不出来。 */
export type BuildingId = PlaceableId | "core";

/**
 * @deprecated Round 1 曾把指挥中心叫 `hq`；运行时 id 是 `core`
 * （sim/rules.ts BUILDINGS.core）。此别名只为旧文档兜底，别在新代码用。
 */
export type StructureId = BuildingId;

/**
 * 建造花费（= sim BUILDINGS[id].cost）。放置是原子的：先 canAfford
 * 再整体扣，扣不动分文不动（sim/rules.ts pay/place）。
 */
export const BUILD_COST: Record<PlaceableId, Partial<Record<ResourceId, number>>> = {
  floor: { wood: 4, rope: 2 }, // 地基：唯一可铺在海面的建筑，四向贴筏
  collector: { wood: 6, plastic: 4 }, // 收集器：被动产木板/塑料
  purifier: { plastic: 6, metal: 4 }, // 净水机：产淡水
  fish: { wood: 5, rope: 4 }, // 钓鱼台：产食物
  turret: { metal: 8, wood: 4 }, // 炮塔：唯一对海盗输出
};

/**
 * 结构血量上限（= sim BUILDINGS[id].maxHp）。归零即拆除；
 * core 归零不删格、只标记，由结算判定接手。
 */
export const STRUCTURE_HP: Record<BuildingId, number> = {
  floor: 40,
  collector: 45,
  purifier: 45,
  fish: 40,
  turret: 65,
  core: 220,
};

// ── 产出与消耗（镜像 sim/economy.ts）────────────────────────────────

/**
 * 建筑产出（= economy PRODUCTION）：**攒满 intervalS 出一次整数货**，
 * 不是每帧小数流；残血建筑按 efficiencyOf 减速（50%–100%）。
 */
export const PRODUCTION: Partial<
  Record<BuildingId, { intervalS: number; out: Partial<Record<ResourceId, number>> }>
> = {
  collector: { intervalS: 5, out: { wood: 1, plastic: 1 } },
  purifier: { intervalS: 3, out: { water: 3 } }, // 1 水/秒
  fish: { intervalS: 3, out: { food: 2 } }, // 0.67 食/秒
};

/** 人口（= economy CREW）：每座存活的非地基建筑多一个岛民（也多一张嘴）。 */
export const CREW = { base: 3, perBuilding: 1 } as const;

/** 每岛民每秒消耗（= economy UPKEEP）。 */
export const UPKEEP = { water: 0.12, food: 0.1 } as const;

/** 岛民自动维修（= economy REPAIR）：每 2 秒挑最残的一格，花 1 木板补 9 血。 */
export const REPAIR = { intervalS: 2, hp: 9, cost: { wood: 1 } } as const;

/**
 * 断粮（= economy STARVE）：淡水或食物任一没足额供上，**同一条**计时器
 * 就往上走；喂饱后按 recoverMul 倍速回落。计满 limitS = 结算。
 */
export const STARVE = { limitS: 25, recoverMul: 2, warnAt: 0.4 } as const;

// ── 风暴与海盗（镜像 sim/threats.ts 与 entities/pirate.ts）──────────

/**
 * 风暴（= threats STORM）：预警 warnS 秒后对选定外圈格**一次性**结算
 * damage；受击格数 = 1 + ⌊elapsed / extraEveryS⌋（上限 maxTargets）；
 * 场间隔从 gapS 每场缩 gapDecayS，下限 gapMinS。
 */
export const STORM = {
  firstS: 50,
  gapS: 42,
  gapMinS: 22,
  gapDecayS: 3,
  warnS: 4,
  damage: 22, // 一场啃不掉满血地基（40），两场可以
  extraEveryS: 90,
  maxTargets: 5,
} as const;

/**
 * 海盗波调度（= threats WAVE）：波内人数 min(6, 1 + ⌊波数 / 2⌋)，
 * 同屏上限 maxAlive；同一波从相近方位来。
 */
export const WAVE = {
  firstS: 55, // 晚于首场风暴，留出攒金属立炮塔的窗口
  gapS: 46,
  gapMinS: 22,
  gapDecayS: 2.5,
  spawnRadius: 760,
  maxAlive: 8,
} as const;

/** 单个海盗（= entities/pirate.ts PIRATE）：速度/血量随波数增长，死后掉金属。 */
export const PIRATE = {
  baseSpeed: 58,
  speedPerWave: 4,
  maxSpeed: 130,
  baseHp: 30,
  hpPerWave: 8,
  radius: 16,
  /** 停船开砍的距离（格心到船心）；拆房 4.5 dps */
  reach: 46,
  dps: 4.5,
  /** 被打死掉的金属 */
  dropMetal: 2,
  flashS: 0.12,
} as const;

/** 炮塔（= threats TURRET）：射程内锁最近海盗，单发制。DPS = 9 / 0.5 = 18。 */
export const TURRET = {
  /** 索敌与射击半径 = 5 格 = 320 逻辑像素 */
  range: TILE.sizePx * 5,
  damage: 9,
  shotIntervalS: 0.5,
} as const;

// ── 拾荒小船（镜像 entities/skiff.ts 的 SKIFF）──────────────────────

/**
 * 小船手感（= entities/skiff.ts SKIFF）。WASD 给加速度，
 * 水阻 v ×= e^(−drag·dt)，与帧长无关。
 */
export const SKIFF = {
  /** 满推力加速度（逻辑像素/秒²） */
  accel: 1150,
  /** 水阻系数（速度每秒衰减到 e^−drag） */
  drag: 2.6,
  maxSpeed: 300,
  /** 船体半径，画图与碰撞共用 */
  radius: 15,
  /** 捞取判定半径 = 一格半 = 96 逻辑像素 */
  scoopRadius: TILE.sizePx * 1.5,
  /** 两次捞取的最小间隔（秒） */
  scoopCooldownS: 0.22,
  /** 低于此速度直接判停 */
  restSpeed: 3,
} as const;
