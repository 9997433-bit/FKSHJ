export type BoosterTier = 1 | 2;

export type Booster = {
  lane: number;
  z: number;
  used: boolean;
  /** 1 = 普通加速带，2 = 火山段的长喷流，画面与音效更强 */
  tier: BoosterTier;
};

export function makeBooster(lane: number, z: number, tier: BoosterTier = 1): Booster {
  return { lane, z, used: false, tier };
}

/**
 * 在已 translate/scale 到实体位置的画布上绘制加速带：
 * 一块水垫加上向前流动的箭头。
 */
export function drawBooster(
  ctx: CanvasRenderingContext2D,
  tier: BoosterTier,
  phase: number,
  accent: string,
): void {
  const w = tier === 2 ? 34 : 28;
  const h = tier === 2 ? 30 : 22;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 1.15, h * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const count = tier === 2 ? 4 : 3;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const flow = (phase * 1.6 + i / count) % 1;
    const y = h * 0.7 - flow * h * 1.6;
    ctx.globalAlpha = 0.35 + Math.sin(flow * Math.PI) * 0.65;
    ctx.strokeStyle = i % 2 === 0 ? "#ffffff" : accent;
    ctx.beginPath();
    ctx.moveTo(-w * 0.6, y + 7);
    ctx.lineTo(0, y - 5);
    ctx.lineTo(w * 0.6, y + 7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
