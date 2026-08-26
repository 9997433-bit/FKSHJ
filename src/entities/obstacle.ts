export type HazardKind = "tube" | "vortex" | "duck";

export type Hazard = {
  kind: HazardKind;
  lane: number;
  z: number;
  r: number;
  hit: boolean;
  jumpable: boolean;
};

export function makeHazard(kind: HazardKind, lane: number, z: number): Hazard {
  return {
    kind,
    lane,
    z,
    r: kind === "vortex" ? 30 : 24,
    hit: false,
    jumpable: kind === "duck",
  };
}

/**
 * 在已 translate/scale 到实体位置的画布上绘制障碍。
 * 三种障碍剪影必须一眼可分：橡皮鸭有嘴、漩涡是螺旋、充气圈是条纹环。
 */
export function drawHazard(
  ctx: CanvasRenderingContext2D,
  kind: HazardKind,
  r: number,
  phase: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.62, r * 0.85, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "duck") drawDuck(ctx, r, phase);
  else if (kind === "vortex") drawVortex(ctx, r, phase);
  else drawTube(ctx, r, phase);
  ctx.restore();
}

function drawTube(ctx: CanvasRenderingContext2D, r: number, phase: number): void {
  const bob = Math.sin(phase * 1.8) * 2;
  ctx.save();
  ctx.translate(0, bob);
  ctx.scale(1, 0.62);
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, (i / segs) * Math.PI * 2, ((i + 1) / segs) * Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? "#ff6b9a" : "#fff0f5";
    ctx.fill();
  }
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();
}

function drawDuck(ctx: CanvasRenderingContext2D, r: number, phase: number): void {
  const bob = Math.sin(phase * 2.6) * 2.5;
  const k = r / 24;
  ctx.save();
  ctx.translate(0, bob);
  ctx.scale(k, k);

  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.ellipse(0, 6, 22, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // 尾巴
  ctx.beginPath();
  ctx.moveTo(-16, 2);
  ctx.lineTo(-27, -8);
  ctx.lineTo(-14, -3);
  ctx.closePath();
  ctx.fill();

  // 头
  ctx.beginPath();
  ctx.arc(11, -10, 10, 0, Math.PI * 2);
  ctx.fill();

  // 鸭嘴
  ctx.fillStyle = "#ff8c1a";
  ctx.beginPath();
  ctx.moveTo(18, -12);
  ctx.lineTo(31, -8.5);
  ctx.lineTo(18, -4);
  ctx.closePath();
  ctx.fill();

  // 翅膀高光与眼睛
  ctx.fillStyle = "#ffe9a8";
  ctx.beginPath();
  ctx.ellipse(-2, 5, 10, 6, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b1a05";
  ctx.beginPath();
  ctx.arc(14, -13, 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawVortex(ctx: CanvasRenderingContext2D, r: number, phase: number): void {
  ctx.save();
  ctx.scale(1, 0.55);
  ctx.rotate(-phase * 2.4);
  ctx.fillStyle = "rgba(16, 42, 90, 0.85)";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = "round";
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const a = (arm / 3) * Math.PI * 2 + t * Math.PI * 1.9;
      const rad = r * (1 - t * 0.92);
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = arm === 0 ? "#b8e0ff" : "#3d7dff";
    ctx.lineWidth = 3.2;
    ctx.stroke();
  }

  ctx.fillStyle = "#050d1c";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
