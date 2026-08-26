/**
 * 粒子池 —— 水滴、木屑、火花。
 *
 * 俯视视角里没有「下坠」这回事：粒子从生成点向外飞、被水阻拖慢、
 * 缩小并淡出。所以这里没有重力项，只有 `drag`（每秒衰减比例）。
 *
 * 整池共享一个上限（`MAX_PARTICLES`），任何生成接口都不会越过它——
 * 帧率不会因为某个特效连喷而塌掉。
 */

/** 峰值粒子数上限。 */
export const MAX_PARTICLES = 360;

export type ParticleShape = "drop" | "spark" | "ring";

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 剩余寿命（秒） */
  life: number;
  /** 初始寿命（秒） */
  max: number;
  r: number;
  color: string;
  shape: ParticleShape;
  /** 每秒速度衰减比例；水里的东西停得快 */
  drag: number;
};

export type BurstOptions = {
  count?: number;
  shape?: ParticleShape;
  /** 初速（px/s） */
  speed?: number;
  /** 扇形张角（弧度）；≥2π 视为全向 */
  spread?: number;
  /** 主方向（弧度） */
  angle?: number;
  radius?: number;
  life?: number;
  drag?: number;
};

/** 超出上限时丢掉最老的，绝不让数组无限增长。 */
export function capParticles(list: Particle[], limit = MAX_PARTICLES): void {
  if (list.length > limit) list.splice(0, list.length - limit);
}

export function spawnBurst(
  list: Particle[],
  x: number,
  y: number,
  color: string,
  opts: number | BurstOptions = 10,
): void {
  const o: BurstOptions = typeof opts === "number" ? { count: opts } : opts;
  const room = MAX_PARTICLES - list.length;
  if (room <= 0) return;
  const n = Math.min(Math.max(1, Math.round(o.count ?? 10)), room);
  const speed = o.speed ?? 110;
  const spread = o.spread ?? Math.PI * 2;
  const base = o.angle ?? 0;
  const radius = o.radius ?? 3;
  const life = o.life ?? 0.45;
  const shape = o.shape ?? "drop";
  const drag = o.drag ?? (shape === "spark" ? 2.6 : 3.4);

  for (let i = 0; i < n; i++) {
    const a =
      spread >= Math.PI * 2
        ? base + (Math.PI * 2 * i) / n + Math.random() * 0.3
        : base + (i / Math.max(1, n - 1) - 0.5) * spread;
    const v = speed * (0.55 + Math.random() * 0.7);
    list.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: life * (0.7 + Math.random() * 0.6),
      max: life * 1.3,
      r: radius * (0.6 + Math.random() * 0.8),
      color,
      shape,
      drag,
    });
  }
}

export function stepParticles(list: Particle[], dt: number): void {
  for (const p of list) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = 1 - Math.min(0.95, p.drag * dt);
    p.vx *= k;
    p.vy *= k;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].life <= 0) list.splice(i, 1);
  }
  capParticles(list);
}

export function drawParticles(ctx: CanvasRenderingContext2D, list: readonly Particle[]): void {
  ctx.save();
  for (const p of list) {
    const t = Math.max(0, Math.min(1, p.life / p.max));
    ctx.globalAlpha = t;
    if (p.shape === "spark") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.r * 0.6);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    } else if (p.shape === "ring") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (2.6 - t * 1.6), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
