/**
 * 涟漪 —— 贴着水面摊开的一圈圈波纹。
 *
 * 与 `particles.ts` 分开管：粒子是抛出去的水滴，涟漪是留在水面上的环，
 * 活得久、数量少。混进粒子池只会被水花挤掉。
 */

/** 同屏涟漪上限：超了就丢最老的。 */
export const MAX_RIPPLES = 40;

export type Ripple = {
  x: number;
  y: number;
  /** 剩余寿命（秒） */
  life: number;
  /** 初始寿命（秒） */
  max: number;
  /** 起始半径（px） */
  r0: number;
  /** 终止半径（px） */
  r1: number;
  color: string;
  width: number;
};

export type RippleOpts = {
  radius?: number;
  spread?: number;
  life?: number;
  color?: string;
  width?: number;
};

export function addRipple(list: Ripple[], x: number, y: number, opts: RippleOpts = {}): void {
  if (list.length >= MAX_RIPPLES) list.splice(0, list.length - MAX_RIPPLES + 1);
  const r0 = opts.radius ?? 8;
  const life = opts.life ?? 0.8;
  list.push({
    x,
    y,
    life,
    max: life,
    r0,
    r1: r0 + (opts.spread ?? 34),
    color: opts.color ?? "#ffffff",
    width: opts.width ?? 2,
  });
}

/** 捞取 / 落水：一大一小两圈，半径与寿命错开才有「砸下去」的层次。 */
export function splashRings(list: Ripple[], x: number, y: number, color = "#ffffff"): void {
  addRipple(list, x, y, { radius: 6, spread: 28, life: 0.5, color, width: 2.4 });
  addRipple(list, x, y, { radius: 3, spread: 50, life: 0.85, color, width: 1.3 });
}

/** 木筏 / 大物件的吃水波：慢、淡、大。 */
export function hullRing(list: Ripple[], x: number, y: number, color = "#cfefff"): void {
  addRipple(list, x, y, { radius: 24, spread: 26, life: 1.6, color, width: 1.6 });
}

export function stepRipples(list: Ripple[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    r.life -= dt;
    if (r.life <= 0) list.splice(i, 1);
  }
}

export function drawRipples(ctx: CanvasRenderingContext2D, list: readonly Ripple[]): void {
  ctx.save();
  for (const r of list) {
    const t = 1 - Math.max(0, Math.min(1, r.life / r.max));
    // 外扩用 sqrt：起手快、后面慢，像真的水波
    const rad = r.r0 + (r.r1 - r.r0) * Math.sqrt(t);
    ctx.globalAlpha = (1 - t) * 0.55;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(0.8, r.width * (1 - t * 0.5));
    ctx.beginPath();
    ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
