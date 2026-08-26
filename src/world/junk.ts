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
 */

import { CANVAS, SALVAGE } from "../data/constants";
import { SKIFF } from "../entities/skiff";
import { RAFT_ORIGIN, TILE } from "../sim/rules";
import { swayAt, withAlpha } from "./ocean";

/** 能捞到的四种材料（`SALVAGE.weights` 的键，也是 ResourceId 的子集）。 */
export type JunkKind = "wood" | "plastic" | "metal" | "rope";

export const JUNK_KINDS: readonly JunkKind[] = ["wood", "plastic", "metal", "rope"];

export type JunkStyle = {
  kind: JunkKind;
  /** 中文名，HUD 与飘字直接用 */
  label: string;
  tint: string;
  dark: string;
  /** 绘制与判定半径（逻辑像素） */
  r: number;
};

/** 外观表。数值平衡在 constants，这里只管长什么样。 */
export const JUNK_STYLES: Record<JunkKind, JunkStyle> = {
  wood: { kind: "wood", label: "木板", tint: "#c08b52", dark: "#6d431f", r: 16 },
  plastic: { kind: "plastic", label: "塑料", tint: "#9fe6ff", dark: "#3b7f9c", r: 13 },
  metal: { kind: "metal", label: "金属", tint: "#b9c4cc", dark: "#5a6670", r: 14 },
  rope: { kind: "rope", label: "绳索", tint: "#e0c48a", dark: "#8a6a34", r: 13 },
};

export function junkStyle(kind: JunkKind): JunkStyle {
  return JUNK_STYLES[kind];
}

/** 绘制需要的最少信息；`Junk` 是它的超集。 */
export type JunkView = {
  kind: JunkKind;
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
};

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
  const style = JUNK_STYLES[kind];
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
    r: style.r * range(field, 0.85, 1.15),
    a: range(field, 0, Math.PI * 2),
    av: range(field, -0.4, 0.4),
    age: 0,
    phase: range(field, 0, Math.PI * 2),
    taken: false,
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

/** 捞取结果：材料种类与到手数量。 */
export type JunkHaul = { kind: JunkKind; amount: number };

/**
 * 捞走一件并掷产出。重复捞同一件只算一次（第二次 amount = 0），
 * 所以「同一帧点两下」不会双倍到账。
 */
export function takeJunk(field: JunkField, j: Junk): JunkHaul {
  if (j.taken) return { kind: j.kind, amount: 0 };
  j.taken = true;
  return { kind: j.kind, amount: rollJunkYield(field, j.kind) };
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

/** 单件漂浮物：水下影 + 吃水泡沫 + 本体，随涌浪摇摆，快沉时淡出下沉。 */
export function drawJunk(ctx: CanvasRenderingContext2D, j: JunkView, time: number): void {
  const style = JUNK_STYLES[j.kind];
  const r = j.r ?? style.r;
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

  ctx.save();
  ctx.globalAlpha = 0.3 * fade;
  ctx.strokeStyle = "#ffffff";
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
  switch (j.kind) {
    case "wood":
      drawWood(ctx, r);
      break;
    case "plastic":
      drawPlastic(ctx, r, time + phase);
      break;
    case "metal":
      drawMetal(ctx, r);
      break;
    default:
      drawRope(ctx, r);
      break;
  }
  ctx.restore();
}

function drawWood(ctx: CanvasRenderingContext2D, r: number): void {
  const s = JUNK_STYLES.wood;
  const w = r * 2.2;
  const h = r * 0.72;
  ctx.fillStyle = s.dark;
  ctx.fillRect(-w / 2, -h / 2 + 2, w, h);
  ctx.fillStyle = s.tint;
  ctx.fillRect(-w / 2, -h / 2, w, h - 2);
  ctx.strokeStyle = withAlpha(s.dark, 0.6);
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const y = -h / 2 + (h * i) / 3;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, y);
    ctx.lineTo(w / 2 - 3, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#7d8790";
  for (const x of [-w * 0.34, w * 0.34]) {
    ctx.beginPath();
    ctx.arc(x, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlastic(ctx: CanvasRenderingContext2D, r: number, time: number): void {
  const s = JUNK_STYLES.plastic;
  const w = r * 1.05;
  const h = r * 1.85;

  ctx.fillStyle = withAlpha(s.tint, 0.85);
  ctx.beginPath();
  ctx.moveTo(-w / 2, h / 2);
  ctx.lineTo(-w / 2, -h * 0.16);
  ctx.quadraticCurveTo(-w / 2, -h * 0.42, -w * 0.18, -h * 0.46);
  ctx.lineTo(-w * 0.18, -h / 2);
  ctx.lineTo(w * 0.18, -h / 2);
  ctx.lineTo(w * 0.18, -h * 0.46);
  ctx.quadraticCurveTo(w / 2, -h * 0.42, w / 2, -h * 0.16);
  ctx.lineTo(w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha(s.dark, 0.7);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = "#ff7a5c";
  ctx.fillRect(-w * 0.22, -h / 2 - 3, w * 0.44, 4);
  ctx.fillStyle = withAlpha("#ffffff", 0.35 + Math.abs(Math.sin(time * 2)) * 0.25);
  ctx.fillRect(-w * 0.3, -h * 0.12, 2.2, h * 0.42);
}

function drawMetal(ctx: CanvasRenderingContext2D, r: number): void {
  const s = JUNK_STYLES.metal;
  const w = r * 1.6;
  const h = r * 1.2;
  ctx.fillStyle = s.dark;
  ctx.fillRect(-w / 2, -h / 2 + 2, w, h);
  ctx.fillStyle = s.tint;
  ctx.fillRect(-w / 2, -h / 2, w, h - 2);
  ctx.strokeStyle = withAlpha(s.dark, 0.85);
  ctx.lineWidth = 2;
  for (const x of [-w * 0.22, w * 0.22]) {
    ctx.beginPath();
    ctx.moveTo(x, -h / 2);
    ctx.lineTo(x, h / 2 - 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(160, 84, 40, 0.55)";
  ctx.beginPath();
  ctx.arc(-w * 0.3, h * 0.16, 2.4, 0, Math.PI * 2);
  ctx.arc(w * 0.34, -h * 0.2, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha("#ffffff", 0.32);
  ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w * 0.16, h - 6);
}

function drawRope(ctx: CanvasRenderingContext2D, r: number): void {
  const s = JUNK_STYLES.rope;
  const rad = r * 0.95;
  ctx.strokeStyle = s.dark;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, rad, rad * 0.78, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = s.tint;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, rad, rad * 0.78, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, rad * 0.55, rad * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(s.dark, 0.8);
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad * 0.78;
    ctx.beginPath();
    ctx.moveTo(x * 0.85, y * 0.85);
    ctx.lineTo(x * 1.15, y * 1.15);
    ctx.stroke();
  }
}

/**
 * 捞取提示：够得着的漂浮物外面套一个高亮环。
 * 会话在小船进入 `BOAT.pickupRadiusPx` 时调用，玩家才知道按空格能捞谁。
 */
export function drawJunkHighlight(
  ctx: CanvasRenderingContext2D,
  j: JunkView,
  time: number,
  color = "#ffd166",
): void {
  const r = (j.r ?? JUNK_STYLES[j.kind].r) + 8;
  const sway = swayAt(j.x, j.y, time + (j.phase ?? 0), 1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85 * junkFade(j.age ?? 0);
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(j.x + sway.dx, j.y + sway.dy, r * (1 + Math.sin(time * 5) * 0.05), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
