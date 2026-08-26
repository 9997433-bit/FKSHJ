/**
 * 漂浮物 —— 海面上漂着的木板 / 塑料 / 金属 / 绳索。
 *
 * 数值全部取自 `SALVAGE`（刷新间隔、上限、漂流速度、超时沉没、权重、
 * 单件产出区间），本模块不自带平衡参数。
 *
 * 生成是**确定性**的：一片 `JunkField` 的所有随机走同一条可持久化 LCG，
 * 同一个种子跑出来的漂流与掉落逐位相同，回放和单测都靠这一点。
 *
 * 绘制侧只吃结构类型 `JunkView`（`{ kind, x, y }` 加几个可选字段），
 * 所以就算实体状态由别的模块持有，`drawJunk` 也照画不误。
 *
 * 「长什么样」不在这个文件里：本体形状全部走 `world/items.ts` 的外观登记表
 * （`itemArt` / `drawItemBody`）。本模块只管漂浮物**在水面上**的那一层——
 * 水下影、吃水泡沫、月光镶边、随浪摇摆、沉没淡出。物品目录 `data/catalog.ts` 到位后，
 * `registerItemArt` 登记的新道具在这里不用改一行就能漂起来：
 * `drawJunk` 接受任意 id，没登记的画成「未知包裹」。
 *
 * **换装**（`JUNK_LOOK_TABLE`）：新刷的东西按 `JUNK_LOOKS.chance` 穿一件
 * 目录物的外观——海面上因此看得见油布、空油桶、咸海带，而不是四种建材
 * 循环播放。换的只有外观：`Junk.kind` 仍限四种建材、刷新权重仍是
 * `SALVAGE.weights`、产出仍按 `SALVAGE.yields` 掷、入库仍走 `gain()` 对
 * Resources——**没有第二套掉落经济**。掷骰走本片海自己的 LCG，
 * 不碰 session.rng。
 */

import { CANVAS, JUNK_LOOKS, SALVAGE } from "../data/constants";
import { SKIFF } from "../entities/skiff";
import { RAFT_ORIGIN, TILE } from "../sim/rules";
import { drawItemBody, itemArt, itemLabel, type ItemArt } from "./items";
import { MOONLIGHT, mixHex, moonRim, nightness, swayAt, withAlpha } from "./ocean";

/** 能捞到的四种材料（`SALVAGE.weights` 的键，也是 ResourceId 的子集）。 */
export type JunkKind = "wood" | "plastic" | "metal" | "rope";

export const JUNK_KINDS: readonly JunkKind[] = ["wood", "plastic", "metal", "rope"];

/**
 * 绘制侧接受的种类：四种建材，**外加**目录里任意物品 id。
 *
 * `(string & {})` 是让编辑器仍然把四种建材列进补全，同时不拒绝新 id——
 * 漂浮物的**状态**仍然只认 `JunkKind`（入库要对得上 ResourceId），
 * 放宽的只有画法这一侧。
 */
export type DrawableKind = JunkKind | (string & {});

export type JunkStyle = {
  kind: DrawableKind;
  /** 中文名，HUD 与飘字直接用 */
  label: string;
  tint: string;
  dark: string;
  /** 绘制与判定半径（逻辑像素） */
  r: number;
};

function styleOf(kind: DrawableKind): JunkStyle {
  const art = itemArt(kind);
  return { kind, label: art.label, tint: art.tint, dark: art.dark, r: art.r };
}

/**
 * 四种建材的外观快照。真源是 `world/items.ts` 的登记表，
 * 这里只是给老调用点留的一张现成的表（颜色、中文名、半径）。
 */
export const JUNK_STYLES: Record<JunkKind, JunkStyle> = {
  wood: styleOf("wood"),
  plastic: styleOf("plastic"),
  metal: styleOf("metal"),
  rope: styleOf("rope"),
};

/** 任意物品 id 的外观；没登记的返回兜底样式，不会是 undefined。 */
export function junkStyle(kind: DrawableKind): JunkStyle {
  return (JUNK_STYLES as Record<string, JunkStyle | undefined>)[kind] ?? styleOf(kind);
}

/** 绘制需要的最少信息；`Junk` 是它的超集。 */
export type JunkView = {
  kind: DrawableKind;
  x: number;
  y: number;
  /** 朝向（弧度）；不给按 0 */
  a?: number;
  /** 半径；不给读外观表 */
  r?: number;
  /** 已存在的秒数：接近 `SALVAGE.despawnS` 时开始下沉淡出 */
  age?: number;
  /** 相位偏移，避免所有漂浮物同拍摇摆 */
  phase?: number;
  /**
   * 画成**另一件东西**的样子（`world/items.ts` 里登记的物品 id）。
   *
   * 目录里的道具靠这个上海面：入库仍然按 `kind` 走四种建材（`gain` 只认
   * ResourceId），但玩家看到的是「一箱工具」「一本航海日记」而不是又一块木板。
   * 不给就按 `kind` 画。
   */
  look?: string;
};

export type Junk = {
  id: number;
  kind: JunkKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  /** 自旋（弧度/秒） */
  av: number;
  /** 已漂了多少秒；到 `SALVAGE.despawnS` 沉没 */
  age: number;
  phase: number;
  taken: boolean;
  /** 见 `JunkView.look`：换个外观，不换入库的材料 */
  look?: string;
};

/** 这件东西该按哪个 id 画：`look` 优先，没有就按 `kind`。 */
export function junkArtId(j: Pick<JunkView, "kind" | "look">): string {
  return j.look ?? j.kind;
}

/**
 * 这件东西该叫什么：换了装就报外观的名字（「空油桶」），没换就报建材。
 * 飘字与图鉴用——玩家看见什么就该读到什么。
 */
export function junkLabel(j: Pick<JunkView, "kind" | "look">): string {
  return itemLabel(junkArtId(j));
}

export type JunkField = {
  items: Junk[];
  /** LCG 状态：这片海之后的所有随机都从这里长出来 */
  rng: number;
  nextId: number;
  /** 距离下次刷新还剩几秒 */
  cd: number;
};

/** 沉没前的淡出时长（秒）：给玩家「快没了，赶紧捞」的提示。 */
export const SINK_FADE_S = 4;

/** 刷新点与木筏中心保持的距离（逻辑像素），免得东西直接刷在甲板上。 */
const RAFT_CLEAR = TILE * 2.2;

/** 漂浮物活动的海域。默认就是可见画布——没有镜头跟随，漂到画外等于没有。 */
export type JunkBounds = { minX: number; minY: number; maxX: number; maxY: number };

export const DEFAULT_BOUNDS: JunkBounds = { minX: 0, minY: 0, maxX: CANVAS.w, maxY: CANVAS.h };

/**
 * 下一个 [0, 1) 随机数。状态是一条 32 位 LCG（可持久化、同种子同海面），
 * **但输出要先打散**。
 *
 * 裸 LCG 的相邻输出落在一张很稀的格子上：一件漂浮物固定消耗十来次抽取，
 * 于是「每件的第 1 次抽取」之间就成了一条固定步长的子序列，相关性肉眼
 * 可见——开局连着刷出来的换装会挤在同一族里（一片海先来三把扳手），
 * 四种建材的比例也会稳定偏离 `SALVAGE.weights`（绳索多五成）。
 * 状态照旧只走 LCG（period 2^32 不变，存档里那个数还是它），
 * 只把**读出来的那一下**过一遍雪崩混淆。
 */
function nextRand(field: JunkField): number {
  field.rng = (field.rng * 1664525 + 1013904223) >>> 0;
  let h = field.rng;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
}

function range(field: JunkField, lo: number, hi: number): number {
  return lo + nextRand(field) * (hi - lo);
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 按 `SALVAGE.weights` 掷一种材料。 */
export function rollJunkKind(field: JunkField): JunkKind {
  let total = 0;
  for (const k of JUNK_KINDS) total += SALVAGE.weights[k];
  let r = nextRand(field) * total;
  for (const k of JUNK_KINDS) {
    r -= SALVAGE.weights[k];
    if (r <= 0) return k;
  }
  return "wood";
}

/** 掷单件产出（`SALVAGE.yields` 的闭区间整数）。 */
export function rollJunkYield(field: JunkField, kind: JunkKind): number {
  const [lo, hi] = SALVAGE.yields[kind];
  return lo + Math.floor(nextRand(field) * (hi - lo + 1));
}

/* ------------------------------------------------------------------ *
 * 换装：海面上看得见目录里的东西
 * ------------------------------------------------------------------ */

/**
 * 一条换装：**看见的**外观 id 与**捞到的**建材。
 *
 * 一件 look 只配一种 kind，映射写死在下面这张表里，所以同一个种子
 * 跑出来的海面逐件相同——「那只桶捞上来是金属」不会这局是金属、
 * 下局变木板。
 */
export type JunkLook = {
  /** `world/items.ts` 登记过的外观 id（目录物或海面专有的漂浮物） */
  readonly look: string;
  /** 入库的建材；`Junk.kind` 只认这四种 */
  readonly kind: JunkKind;
  /** 同 kind 内的抽取权重（归一化前），不给按 1 */
  readonly weight?: number;
};

/**
 * 换装表 —— 内容，不是平衡数。唯一的平衡旋钮是 `JUNK_LOOKS.chance`
 * （穿不穿），住 `data/constants.ts`。
 *
 * 三条硬规矩：
 *
 * 1. **不另开掉落经济**：换装只改「长什么样」。刷新权重仍是
 *    `SALVAGE.weights`（先按权重掷 kind，再在该 kind 名下挑一件穿），
 *    产出仍是 `SALVAGE.yields[kind]`，入库仍是 `gain()` 对 Resources。
 *    玩家看见的是一只空油桶，捞到手的是金属。
 * 2. **四种建材各留至少一件**，否则掷中的那一种永远穿不上，
 *    35% 的换装率会悄悄缩水。
 * 3. 映射要说得通：捞上来拆出来的是什么，就记什么。
 */
export const JUNK_LOOK_TABLE: readonly JunkLook[] = [
  // 木板：漂着的海带垫子——晒干了当引火与铺料，记一份木料
  { look: "kelp", kind: "wood" },
  // 塑料：涂胶帆布剪开就是补漏的料；净水囊本身就是个塑料兜子
  { look: "tarp", kind: "plastic", weight: 2 },
  { look: "freshWater", kind: "plastic" },
  // 金属：桶身、钩子、扳手，敲开都是铁
  { look: "barrel", kind: "metal", weight: 2 },
  { look: "hook", kind: "metal" },
  { look: "wrench", kind: "metal" },
  // 绳索：网衣拆股就是绳；玻璃球值钱的是外面罩的那张网兜
  { look: "netScrap", kind: "rope", weight: 2 },
  { look: "glassFloat", kind: "rope" },
];

const LOOKS_BY_KIND: Record<JunkKind, JunkLook[]> = { wood: [], plastic: [], metal: [], rope: [] };
const LOOK_KIND = new Map<string, JunkKind>();
for (const entry of JUNK_LOOK_TABLE) {
  LOOKS_BY_KIND[entry.kind].push(entry);
  LOOK_KIND.set(entry.look, entry.kind);
}

/** 换装表里全部外观 id，按表序。图鉴与单测拿它枚举。 */
export const JUNK_LOOK_IDS: readonly string[] = JUNK_LOOK_TABLE.map((e) => e.look);

/**
 * 这件外观捞上来入哪种建材；表外的 id 返回 null。
 *
 * `spawnJunk({ look })` 靠它反查 kind——指定了外观就不必再指定材料，
 * 免得两边写岔了造出「看着是油桶、入库是木板」的东西。
 */
export function lookKind(look: string | undefined): JunkKind | null {
  return (look && LOOK_KIND.get(look)) || null;
}

/** 这种建材名下能穿的外观（按表序）。 */
export function looksOf(kind: JunkKind): readonly string[] {
  return LOOKS_BY_KIND[kind].map((e) => e.look);
}

/**
 * 掷这件东西穿不穿目录外观：`JUNK_LOOKS.chance` 的概率穿一件，
 * 否则返回 undefined（就画成建材本身）。
 *
 * 随机走 `JunkField` 自己的 LCG，**不碰 session.rng**——威胁与请求板
 * 的随机序列不受影响。抽取次数恒为 2（穿不穿判定 + 选品），中不中都
 * 一样，所以换装不会把后面漂流参数的序列错开。
 */
export function rollJunkLook(field: JunkField, kind: JunkKind): string | undefined {
  const dress = nextRand(field);
  const pick = nextRand(field);
  const pool = LOOKS_BY_KIND[kind];
  if (pool.length === 0 || dress >= JUNK_LOOKS.chance) return undefined;

  let total = 0;
  for (const e of pool) total += e.weight ?? 1;
  let r = pick * total;
  for (const e of pool) {
    r -= e.weight ?? 1;
    if (r <= 0) return e.look;
  }
  return pool[pool.length - 1].look;
}

export type SpawnOpts = {
  kind?: JunkKind;
  x?: number;
  y?: number;
  /** 漂流速度（逻辑像素/秒）；默认 `SALVAGE.driftPxS` */
  drift?: number;
  /** 活动海域；默认可见画布 */
  bounds?: JunkBounds;
  /**
   * 见 `JunkView.look`：画成目录里另一件东西，半径也跟着那件走。
   * 指定了外观就不用再指定 `kind`——换装表反查得到（`lookKind`）。
   */
  look?: string;
  /** `false` 关掉换装掷骰：这件必定素面（单测要一件干净的建材时用） */
  dress?: boolean;
};

/**
 * 开一片海。`prefill` 件东西直接散在画面里，
 * 开局第一秒就有得捞，而不是空海等刷新。
 */
export function makeJunkField(seed: number, prefill = 5): JunkField {
  const field: JunkField = { items: [], rng: (seed >>> 0) || 1, nextId: 1, cd: 0 };
  for (let i = 0; i < prefill; i++) {
    const j = spawnJunk(field);
    // 预填的东西已经漂了一会儿，寿命错开才不会同时沉一片
    j.age = range(field, 0, SALVAGE.despawnS * 0.4);
  }
  return field;
}

/**
 * 刷一件漂浮物。落点在画布内、且离木筏中心 `RAFT_CLEAR` 以外，
 * 最多重采样 6 次——采不到就按最后一次放，绝不在这里死循环。
 */
export function spawnJunk(field: JunkField, opts: SpawnOpts = {}): Junk {
  // 材料先定：指定了 kind 就听它的，只给了 look 就按换装表反查，
  // 都没给才按 `SALVAGE.weights` 掷——刷新权重一分没改
  const kind = opts.kind ?? lookKind(opts.look) ?? rollJunkKind(field);
  // 再定外观：显式给的优先，否则掷一次换装（`JUNK_LOOKS.chance`）
  const look = opts.look ?? (opts.dress === false ? undefined : rollJunkLook(field, kind));
  // 半径读外观表：换了 look 的东西，判定圈跟着它真正的个头走
  const art = itemArt(look ?? kind);
  const drift = opts.drift ?? SALVAGE.driftPxS;
  const b = opts.bounds ?? DEFAULT_BOUNDS;

  let x = opts.x ?? 0;
  let y = opts.y ?? 0;
  if (opts.x === undefined || opts.y === undefined) {
    for (let tries = 0; tries < 6; tries++) {
      x = range(field, b.minX + 40, b.maxX - 40);
      y = range(field, b.minY + 40, b.maxY - 40);
      const clear = RAFT_CLEAR + TILE / 2;
      if (Math.abs(x - RAFT_ORIGIN.x) > clear || Math.abs(y - RAFT_ORIGIN.y) > clear) break;
    }
  }

  const dir = range(field, 0, Math.PI * 2);
  const j: Junk = {
    id: field.nextId++,
    kind,
    x,
    y,
    vx: Math.cos(dir) * drift * range(field, 0.6, 1.4),
    vy: Math.sin(dir) * drift * range(field, 0.6, 1.4),
    r: art.r * range(field, 0.85, 1.15),
    a: range(field, 0, Math.PI * 2),
    av: range(field, -0.4, 0.4),
    age: 0,
    phase: range(field, 0, Math.PI * 2),
    taken: false,
    ...(look ? { look } : {}),
  };
  field.items.push(j);
  return j;
}

export type JunkFlow = {
  /** 每秒刷新几件；默认 1 / `SALVAGE.spawnIntervalS` */
  rate?: number;
  /** 同屏上限；默认 `SALVAGE.maxAfloat` */
  limit?: number;
  /** 漂流速度；默认 `SALVAGE.driftPxS` */
  drift?: number;
  /** 活动海域；默认可见画布 */
  bounds?: JunkBounds;
  /** 关掉刷新（结算画面让海面自然漂空） */
  spawn?: boolean;
};

/**
 * 推进一帧：漂移、老化沉没、清理被捞走的、按 rate 补新的。
 *
 * 刷新用「攒时间」而不是每帧掷概率，所以帧率高低不影响每秒出多少东西
 * （ARCHITECTURE §3：所有速率都是「单位/秒 × dt」）。
 */
export function updateJunk(field: JunkField, dt: number, flow: JunkFlow = {}): void {
  const limit = flow.limit ?? SALVAGE.maxAfloat;
  const rate = flow.rate ?? 1 / SALVAGE.spawnIntervalS;
  const drift = flow.drift ?? SALVAGE.driftPxS;
  const b = flow.bounds ?? DEFAULT_BOUNDS;

  for (let i = field.items.length - 1; i >= 0; i--) {
    const j = field.items[i];
    if (j.taken || j.age >= SALVAGE.despawnS) {
      field.items.splice(i, 1);
      continue;
    }
    j.age += dt;
    j.x += j.vx * dt;
    j.y += j.vy * dt;
    j.a += j.av * dt;
    // 撞到海域边就反弹回来：东西不许漂出镜头，否则玩家只能干等刷新
    const pad = j.r + 6;
    if (j.x < b.minX + pad) {
      j.x = b.minX + pad;
      j.vx = Math.abs(j.vx);
    } else if (j.x > b.maxX - pad) {
      j.x = b.maxX - pad;
      j.vx = -Math.abs(j.vx);
    }
    if (j.y < b.minY + pad) {
      j.y = b.minY + pad;
      j.vy = Math.abs(j.vy);
    } else if (j.y > b.maxY - pad) {
      j.y = b.maxY - pad;
      j.vy = -Math.abs(j.vy);
    }
  }

  if (flow.spawn === false) return;
  field.cd -= dt;
  while (field.cd <= 0) {
    field.cd += 1 / Math.max(0.05, rate);
    if (field.items.length >= limit) continue;
    spawnJunk(field, { drift, bounds: b });
  }
}

/**
 * 捞取判定：返回 (x, y) 半径 `reach` 内**最近**的漂浮物，没有则 null。
 * 默认半径就是小船的 `SKIFF.scoopRadius`，与手感契约同源。
 */
export function pickJunk(
  field: JunkField,
  x: number,
  y: number,
  reach: number = SKIFF.scoopRadius,
): Junk | null {
  let best: Junk | null = null;
  let bestD = Infinity;
  for (const j of field.items) {
    if (j.taken) continue;
    const rad = j.r + reach;
    const dx = j.x - x;
    const dy = j.y - y;
    const d = dx * dx + dy * dy;
    if (d > rad * rad || d >= bestD) continue;
    bestD = d;
    best = j;
  }
  return best;
}

/**
 * 捞取结果：材料种类与到手数量，外加这件东西的**外观 id**——
 * 飘字要写「捞到一箱工具」而不是「捞到木板」，水花要喷它自己的颜色，
 * 图鉴要记下这一格，靠的都是 `look`（没换外观时就等于 `kind`）。
 */
export type JunkHaul = { kind: JunkKind; amount: number; look: string };

/**
 * 捞走一件并掷产出。重复捞同一件只算一次（第二次 amount = 0），
 * 所以「同一帧点两下」不会双倍到账。
 */
export function takeJunk(field: JunkField, j: Junk): JunkHaul {
  const look = junkArtId(j);
  if (j.taken) return { kind: j.kind, amount: 0, look };
  j.taken = true;
  return { kind: j.kind, amount: rollJunkYield(field, j.kind), look };
}

/** 收集器一类的自动捞取：吸走圆内最近的一件，返回战利品（没有则 null）。 */
export function reapJunk(field: JunkField, x: number, y: number, radius: number): (JunkHaul & { junk: Junk }) | null {
  const j = pickJunk(field, x, y, radius);
  if (!j) return null;
  const haul = takeJunk(field, j);
  return { ...haul, junk: j };
}

/* ------------------------------------------------------------------ *
 * 绘制
 * ------------------------------------------------------------------ */

/** 沉没淡出：寿命最后 `SINK_FADE_S` 秒线性淡到 0。 */
export function junkFade(age = 0): number {
  const left = SALVAGE.despawnS - age;
  return clamp01(left / SINK_FADE_S);
}

export type JunkDrawOpts = {
  /** 夜色浓度 0..1；不给按 `time` 算（与 `world/craft.ts` 同一套 `nightness`） */
  night01?: number;
};

/** 月光镶边往外让出的像素：够咬住轮廓，又不至于把小件糊成一团光。 */
const NIGHT_RIM_PX = 2.4;

/** 满夜时镶边的不透明度。反光不是发光，压在半透明以下。 */
const NIGHT_RIM_ALPHA = 0.42;

/** 整片海的漂浮物。 */
export function drawJunkField(
  ctx: CanvasRenderingContext2D,
  field: JunkField,
  time: number,
  opts: JunkDrawOpts = {},
): void {
  // 夜色一片海只算一次，十几件东西不必各调一遍 nightness
  const night = clamp01(opts.night01 ?? nightness(time));
  for (const j of field.items) drawJunk(ctx, j, time, { night01: night });
}

/**
 * 夜里给剪影垫的一层月光背板：本体放大 `NIGHT_RIM_PX` 像素、整体涂成月光色，
 * 只有露在本体外面的那一圈看得见——等于沿着**真实轮廓**镶了一道边。
 *
 * 为什么不直接描边：剪影库里一件东西是十几条互不相连的路径（桶身 + 桶箍 +
 * 提手），根本没有一条「外轮廓」可以 stroke。放大重画一遍是唯一贴得住真形状
 * 的办法；代价是夜里每件多画一遍，同屏封顶 `SALVAGE.maxAfloat` 件，扛得住。
 */
function nightRim(
  ctx: CanvasRenderingContext2D,
  art: ItemArt,
  r: number,
  time: number,
  night: number,
  alpha: number,
): void {
  const edge = moonRim(art.tint);
  // 三个色号统一成月光色，画出来就是一片纯色的剪影；稀有柔光归本体那一遍画，
  // 背板再来一圈只会把边缘糊掉
  const plate: ItemArt = { ...art, tint: edge, dark: edge, accent: edge, rare: 0 };
  const grow = (r + NIGHT_RIM_PX) / r;
  ctx.save();
  ctx.globalAlpha = alpha * night * NIGHT_RIM_ALPHA;
  ctx.scale(grow, grow);
  drawItemBody(ctx, plate, r, time);
  ctx.restore();
}

/**
 * 单件漂浮物：水下影 + 吃水泡沫 + 月光镶边 + 本体，随涌浪摇摆，快沉时淡出下沉。
 *
 * 本体交给 `world/items.ts`：`kind` 是什么 id 就画什么，没登记的画成
 * 「未知包裹」。所以目录里新加的道具丢进 `JunkField` 就能漂，
 * 这里不需要再来一个 switch。
 *
 * 夜里多两笔：暗斑压淡（深水已经够黑，再压只会把轮廓一起吃掉）、
 * 水线提亮并偏冷、本体底下垫一圈月光边。`night01` 为 0 时这三笔全部退回原样，
 * 白天逐像素不变。
 */
export function drawJunk(
  ctx: CanvasRenderingContext2D,
  j: JunkView,
  time: number,
  opts: JunkDrawOpts = {},
): void {
  const art = itemArt(junkArtId(j));
  const r = j.r ?? art.r;
  const phase = j.phase ?? 0;
  const fade = junkFade(j.age ?? 0);
  if (fade <= 0) return;
  const night = clamp01(opts.night01 ?? nightness(time));
  const sway = swayAt(j.x, j.y, time + phase, 1);
  const x = j.x + sway.dx;
  const y = j.y + sway.dy;
  // 快沉的东西缩一点，看起来是往水里陷
  const scale = 0.75 + fade * 0.25;

  // 水下影：夜里深水本身已经接近黑，这块暗斑不再帮忙托住东西，
  // 只会连着轮廓一起吃掉，所以随夜色让开一部分
  ctx.save();
  ctx.globalAlpha = 0.26 * fade * (1 - night * 0.45);
  ctx.fillStyle = "#01121f";
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 4, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 吃水泡沫：白里掺一点本体的颜色。1× 缩放下本体只剩十几个像素，
  // 这圈染了色的水线是「远处那件是什么」的第一个线索。
  // 夜里它接的是月光而不是日光，所以提亮一档、色温往冷里偏
  ctx.save();
  ctx.globalAlpha = (0.32 + night * 0.2) * fade;
  ctx.strokeStyle = mixHex(mixHex("#ffffff", art.tint, 0.4), MOONLIGHT, night * 0.45);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.15, r * 0.95, sway.rot, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y);
  ctx.rotate((j.a ?? 0) + sway.rot);
  ctx.scale(scale, scale);
  if (night > 0.02) nightRim(ctx, art, r, time + phase, night, fade);
  drawItemBody(ctx, art, r, time + phase);
  ctx.restore();
}

/**
 * 捞取提示：够得着的漂浮物外面套一个高亮环。
 * 会话在小船进入 `SKIFF.scoopRadius` 时调用，玩家才知道按空格能捞谁。
 */
export function drawJunkHighlight(
  ctx: CanvasRenderingContext2D,
  j: JunkView,
  time: number,
  color = "#ffd166",
): void {
  const art = itemArt(junkArtId(j));
  const r = (j.r ?? art.r) + 8;
  const sway = swayAt(j.x, j.y, time + (j.phase ?? 0), 1);
  const x = j.x + sway.dx;
  const y = j.y + sway.dy;
  const fade = junkFade(j.age ?? 0);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85 * fade;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + Math.sin(time * 5) * 0.05), 0, Math.PI * 2);
  ctx.stroke();
  // 环上开个口，露出本体的颜色：瞄上的这件是什么，不用等捞上来才知道
  ctx.setLineDash([]);
  ctx.strokeStyle = withAlpha(art.tint, 0.9 * fade);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.16, -Math.PI * 0.62, -Math.PI * 0.38);
  ctx.stroke();
  ctx.restore();
}
