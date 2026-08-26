/** 规格红线：峰值粒子数 < 400。 */
export const MAX_PARTICLES = 400;

export type ParticleShape = "drop" | "spark" | "ring";

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
  shape?: ParticleShape;
  /** 每秒下坠加速度，水花比火花重 */
  grav?: number;
};

export type BurstOptions = {
  count?: number;
  shape?: ParticleShape;
  speed?: number;
  spread?: number;
  radius?: number;
  life?: number;
  grav?: number;
  /** 主方向（弧度），用于尾迹一类的定向喷射 */
  angle?: number;
};

/** 超出上限时丢掉最老的粒子，绝不让数组无限增长。 */
export function capParticles(list: Particle[], limit = MAX_PARTICLES): void {
  if (list.length > limit) list.splice(0, list.length - limit);
}

export function spawnBurst(
  list: Particle[],
  x: number,
  y: number,
  color: string,
  opts: number | BurstOptions = 12,
): void {
  const o: BurstOptions = typeof opts === "number" ? { count: opts } : opts;
  const count = Math.max(1, Math.round(o.count ?? 12));
  const room = MAX_PARTICLES - list.length;
  if (room <= 0) return;
  const n = Math.min(count, room);
  const speed = o.speed ?? 80;
  const spread = o.spread ?? Math.PI * 2;
  const base = o.angle ?? 0;
  const radius = o.radius ?? 3;
  const life = o.life ?? 0.55;
  const shape = o.shape ?? "drop";
  const grav = o.grav ?? (shape === "spark" ? 20 : 120);

  for (let i = 0; i < n; i++) {
    const a = base + (spread >= Math.PI * 2 ? (Math.PI * 2 * i) / n : (i / Math.max(1, n - 1) - 0.5) * spread);
    const v = speed * (0.5 + Math.random() * 0.7);
    list.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * 0.35,
      life: life * (0.7 + Math.random() * 0.6),
      max: life * 1.3,
      r: radius * (0.6 + Math.random() * 0.8),
      color,
      shape,
      grav,
    });
  }
}

export function stepParticles(list: Particle[], dt: number): void {
  for (const p of list) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.grav ?? 80) * dt;
    p.vx *= 1 - Math.min(0.9, 1.2 * dt);
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].life <= 0) list.splice(i, 1);
  }
  capParticles(list);
}

export function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[]): void {
  for (const p of list) {
    const t = Math.max(0, Math.min(1, p.life / p.max));
    ctx.globalAlpha = t;
    if (p.shape === "spark") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.r * 0.6);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
      ctx.stroke();
    } else if (p.shape === "ring") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (2.4 - t * 1.4), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * (1 + Math.min(0.9, Math.abs(p.vy) / 260)), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
