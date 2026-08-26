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
 * 水下影、吃水泡沫、随浪摇摆、沉没淡出。物品目录 `data/catalog.ts` 到位后，
 * `registerItemArt` 登记的新道具在这里不用改一行就能漂起来：
 * `drawJunk` 接受任意 id，没登记的画成「未知包裹」。
 */

import { CANVAS, SALVAGE } from "../data/constants";
import { SKIFF } from "../entities/skiff";
import { RAFT_ORIGIN, TILE } from "../sim/rules";
import { drawItemBody, itemArt } from "./items";
import { mixHex, swayAt, withAlpha } from "./ocean";

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

function nextRand(field: JunkField): number {
  field.rng = (field.rng * 1664525 + 1013904223) >>> 0;
  return field.rng / 0xffffffff;
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

export type SpawnOpts = {
  kind?: JunkKind;
  x?: number;
  y?: number;
  /** 漂流速度（逻辑像素/秒）；默认 `SALVAGE.driftPxS` */
  drift?: number;
  /** 活动海域；默认可见画布 */
  bounds?: JunkBounds;
  /** 见 `JunkView.look`：画成目录里另一件东西，半径也跟着那件走 */
  look?: string;
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
  const kind = opts.kind ?? rollJunkKind(field);
  // 半径读外观表：换了 look 的东西，判定圈跟着它真正的个头走
  const art = itemArt(opts.look ?? kind);
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
    ...(opts.look ? { look: opts.look } : {}),
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

/** 整片海的漂浮物。 */
export function drawJunkField(ctx: CanvasRenderingContext2D, field: JunkField, time: number): void {
  for (const j of field.items) drawJunk(ctx, j, time);
}

/**
 * 单件漂浮物：水下影 + 吃水泡沫 + 本体，随涌浪摇摆，快沉时淡出下沉。
 *
 * 本体交给 `world/items.ts`：`kind` 是什么 id 就画什么，没登记的画成
 * 「未知包裹」。所以目录里新加的道具丢进 `JunkField` 就能漂，
 * 这里不需要再来一个 switch。
 */
export function drawJunk(ctx: CanvasRenderingContext2D, j: JunkView, time: number): void {
  const art = itemArt(junkArtId(j));
  const r = j.r ?? art.r;
  const phase = j.phase ?? 0;
  const fade = junkFade(j.age ?? 0);
  if (fade <= 0) return;
  const sway = swayAt(j.x, j.y, time + phase, 1);
  const x = j.x + sway.dx;
  const y = j.y + sway.dy;
  // 快沉的东西缩一点，看起来是往水里陷
  const scale = 0.75 + fade * 0.25;

  ctx.save();
  ctx.globalAlpha = 0.26 * fade;
  ctx.fillStyle = "#01121f";
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 4, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 吃水泡沫：白里掺一点本体的颜色。1× 缩放下本体只剩十几个像素，
  // 这圈染了色的水线是「远处那件是什么」的第一个线索
  ctx.save();
  ctx.globalAlpha = 0.32 * fade;
  ctx.strokeStyle = mixHex("#ffffff", art.tint, 0.4);
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
