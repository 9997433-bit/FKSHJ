import { SEA_BOUNDS, RAFT_ORIGIN, TILE } from "../sim/rules";
import type { Vec2 } from "../sim/rules";

/**
 * 拾荒小船。
 *
 * 手感契约：
 * - WASD 给的是**加速度**不是速度，松手靠水阻自己滑停，海上要有惯性。
 * - 斜向输入会先归一化，斜着开不比直着快。
 * - 撞到海域边界是「吸收」不是「弹开」：位置夹住并把该轴速度清零，
 *   贴边不会抖。
 */
export const SKIFF = {
  /** 满推力加速度（逻辑像素/秒²） */
  accel: 1150,
  /** 水阻系数，速度每秒衰减到 e^-drag */
  drag: 2.6,
  maxSpeed: 300,
  /** 船体半径，画图与碰撞共用 */
  radius: 15,
  /** 捞取判定半径：约一格半，靠上去就能捞 */
  scoopRadius: TILE * 1.5,
  /** 两次捞取的最小间隔，防止按住空格一帧一捞 */
  scoopCooldownS: 0.22,
  /** 低于这个速度直接判停，避免浮点尾巴让船永远在飘 */
  restSpeed: 3,
} as const;

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type Skiff = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 船头朝向（弧度）。速度太小时保持上一次朝向，不会原地乱转 */
  heading: number;
  /** 捞取冷却剩余秒数 */
  cooldown: number;
  /** 本帧推力大小 0–1，给尾迹/水花用 */
  thrust: number;
};

/** 出生在木筏右下方一点，别正好压在指挥中心上 */
export function createSkiff(x = RAFT_ORIGIN.x + TILE * 2.5, y = RAFT_ORIGIN.y + TILE * 2): Skiff {
  return { x, y, vx: 0, vy: 0, heading: -Math.PI / 2, cooldown: 0, thrust: 0 };
}

export function speedOf(s: Skiff): number {
  return Math.hypot(s.vx, s.vy);
}

/**
 * 推进一帧。
 * @param ax 横向输入 −1..1（右为正）
 * @param ay 纵向输入 −1..1（下为正）
 */
export function updateSkiff(s: Skiff, ax: number, ay: number, dt: number, bounds: Bounds = SEA_BOUNDS): Skiff {
  if (dt <= 0) return s;

  const mag = Math.hypot(ax, ay);
  const nx = mag > 1 ? ax / mag : ax;
  const ny = mag > 1 ? ay / mag : ay;
  s.thrust = Math.min(1, mag);

  s.vx += nx * SKIFF.accel * dt;
  s.vy += ny * SKIFF.accel * dt;

  // 指数衰减的水阻：与帧长无关，掉帧时不会突然变滑
  const keep = Math.exp(-SKIFF.drag * dt);
  s.vx *= keep;
  s.vy *= keep;

  const sp = Math.hypot(s.vx, s.vy);
  if (sp > SKIFF.maxSpeed) {
    const k = SKIFF.maxSpeed / sp;
    s.vx *= k;
    s.vy *= k;
  } else if (sp < SKIFF.restSpeed && mag === 0) {
    s.vx = 0;
    s.vy = 0;
  }

  s.x += s.vx * dt;
  s.y += s.vy * dt;

  const r = SKIFF.radius;
  if (s.x < bounds.minX + r) {
    s.x = bounds.minX + r;
    s.vx = 0;
  } else if (s.x > bounds.maxX - r) {
    s.x = bounds.maxX - r;
    s.vx = 0;
  }
  if (s.y < bounds.minY + r) {
    s.y = bounds.minY + r;
    s.vy = 0;
  } else if (s.y > bounds.maxY - r) {
    s.y = bounds.maxY - r;
    s.vy = 0;
  }

  if (Math.hypot(s.vx, s.vy) > SKIFF.restSpeed) s.heading = Math.atan2(s.vy, s.vx);
  if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
  return s;
}

/** 目标是否在捞取半径内；extra 传漂浮物自身半径 */
export function inScoopRange(s: Skiff, target: Vec2, extra = 0): boolean {
  const r = SKIFF.scoopRadius + extra;
  return (target.x - s.x) ** 2 + (target.y - s.y) ** 2 <= r * r;
}

/** 捞取半径内最近的一个；没有就 undefined */
export function nearestInScoop<T extends Vec2>(s: Skiff, items: readonly T[], extra = 0): T | undefined {
  const r = SKIFF.scoopRadius + extra;
  let best: T | undefined;
  let bestD = r * r;
  for (const it of items) {
    const d = (it.x - s.x) ** 2 + (it.y - s.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

/** 冷却好了吗（只问不扣） */
export function canScoop(s: Skiff): boolean {
  return s.cooldown <= 0;
}

/** 真捞一次：冷却没好返回 false，好了就开始冷却 */
export function beginScoop(s: Skiff): boolean {
  if (s.cooldown > 0) return false;
  s.cooldown = SKIFF.scoopCooldownS;
  return true;
}

/** 复位到出生点（重开一局用） */
export function resetSkiff(s: Skiff): Skiff {
  const fresh = createSkiff();
  Object.assign(s, fresh);
  return s;
}
