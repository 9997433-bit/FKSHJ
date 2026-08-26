export type PickupKind = "coin" | "gem" | "ring";

export type Pickup = {
  kind: PickupKind;
  lane: number;
  z: number;
  taken: boolean;
  r: number;
};

export function makePickup(kind: PickupKind, lane: number, z: number): Pickup {
  return { kind, lane, z, taken: false, r: kind === "ring" ? 36 : 16 };
}

export const PICKUP_COLOR: Record<PickupKind, string> = {
  coin: "#ffd166",
  gem: "#7cf7ff",
  ring: "#e8fff8",
};

/**
 * 在已 translate/scale 到实体位置的画布上绘制拾取物。
 * phase 用于自转与浮动，accent 让水环跟随主题色。
 */
export function drawPickup(
  ctx: CanvasRenderingContext2D,
  kind: PickupKind,
  phase: number,
  accent: string,
): void {
  const bob = Math.sin(phase * 2.2) * 3;
  ctx.save();
  ctx.translate(0, bob);
  if (kind === "coin") drawCoin(ctx, phase);
  else if (kind === "gem") drawGem(ctx, phase);
  else drawRing(ctx, phase, accent);
  ctx.restore();
}

function drawCoin(ctx: CanvasRenderingContext2D, phase: number): void {
  const spin = Math.cos(phase * 3.4);
  const w = Math.max(1.6, Math.abs(spin) * 9);
  ctx.fillStyle = "#c98a1e";
  ctx.beginPath();
  ctx.ellipse(0, 1.5, w, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.ellipse(0, 0, w, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  if (w > 4) {
    ctx.fillStyle = "#fff2c4";
    ctx.beginPath();
    ctx.ellipse(-w * 0.25, -2.5, w * 0.3, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGem(ctx: CanvasRenderingContext2D, phase: number): void {
  const tilt = Math.sin(phase * 1.7) * 0.18;
  ctx.save();
  ctx.rotate(tilt);
  ctx.fillStyle = "rgba(124, 247, 255, 0.22)";
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.fill();

  // 钻石轮廓：上冠 + 下尖
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(9, -4);
  ctx.lineTo(0, 13);
  ctx.lineTo(-9, -4);
  ctx.closePath();
  ctx.fillStyle = "#39c9e8";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(9, -4);
  ctx.lineTo(0, -1);
  ctx.closePath();
  ctx.fillStyle = "#b6fbff";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(-9, -4);
  ctx.lineTo(0, -1);
  ctx.closePath();
  ctx.fillStyle = "#7cf7ff";
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-9, -4);
  ctx.lineTo(9, -4);
  ctx.moveTo(0, -1);
  ctx.lineTo(0, 13);
  ctx.stroke();
  ctx.restore();
}

function drawRing(ctx: CanvasRenderingContext2D, phase: number, accent: string): void {
  const squash = 0.72 + Math.sin(phase * 1.4) * 0.12;
  ctx.save();
  ctx.scale(1, squash);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 24, phase % (Math.PI * 2), (phase % (Math.PI * 2)) + 1.1);
  ctx.stroke();
  ctx.restore();
}
