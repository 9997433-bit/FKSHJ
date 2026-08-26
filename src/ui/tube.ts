import { lerpColor, type ThemePaint } from "./theme";

/**
 * 玩家充气泳圈绘制（SOTA_BAR P0：高光 / 投影 / 入水涟漪）。
 *
 * 调用契约：ctx 已 translate 到玩家的「水面锚点」（project(laneX, 80) 的 x/y，
 * 不含跳跃抬升）并按投影比例 scale。本模块在局部坐标系里画：
 *   1. 水面涟漪（贴水时扩散，起跳后淡出）
 *   2. 接触投影（随抬升变小变淡）
 *   3. 泳圈本体（顶部受光 / 底部吸水色、内圈水洞、充气焊缝、镜面高光、无敌光环）
 *
 * 例（session.ts 玩家 drawable 内）：
 *   const pr = project(player.laneX, 80);
 *   ctx.save();
 *   ctx.translate(pr.x, pr.y);
 *   ctx.scale(pr.s, pr.s);
 *   drawPlayerRing(ctx, {
 *     theme, time, speed01,
 *     lift: player.hopLift(),
 *     roll: ringRoll(player),
 *     invuln: player.invuln,
 *   });
 *   ctx.restore();
 */
export type PlayerRingOpts = {
  theme: ThemePaint;
  /** 秒，驱动涟漪扩散 / 浮沉 / 无敌闪烁。 */
  time: number;
  /** 0..1 归一化速度，涟漪节奏随之加快。 */
  speed01?: number;
  /** 小跳抬升（局部单位，0 = 贴水）。本模块自行上移本体，调用方不要再减。 */
  lift?: number;
  /** -1..1 换道倾斜，负 = 左倾。可用 ringRoll(player) 计算。 */
  roll?: number;
  /** 剩余无敌秒数，>0 时泳圈泛 accent 光。 */
  invuln?: number;
};

/* 泳圈几何（局部单位，与原 session 内联椭圆 30×18 对齐） */
const RING_RX = 30;
const RING_RY = 18;
const HOLE_RX = 12.5;
const HOLE_RY = 6.5;
/** 内圈水洞相对圈心略微下沉，透视感更强。 */
const HOLE_DY = 1.5;
/** 水面锚点到局部原点的下沉量：涟漪与投影都画在这条水线上。 */
const WATERLINE_Y = 14;
/** 换道最大倾角（弧度），约 10°。 */
const MAX_ROLL = 0.18;
/** 抬升超过该值视为完全离水（涟漪 / 浮沉淡出的分母）。 */
const AIRBORNE_LIFT = 12;
/** 投影衰减参考高度：跳到该抬升时影子最小最淡。 */
const SHADOW_LIFT = 40;
/** 充气焊缝数量。 */
const SEAMS = 8;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * 由玩家换道状态求 -1..1 的倾斜量：换道中段最大、两端为 0。
 * 结构化参数，避免 ui 层反向依赖 entities。
 */
export function ringRoll(p: { fromLane: number; toLane: number; switchT: number }): number {
  if (p.switchT >= 1 || p.toLane === p.fromLane) return 0;
  const swing = 1 - Math.abs(p.switchT * 2 - 1);
  return (p.toLane > p.fromLane ? 1 : -1) * swing;
}

export function drawPlayerRing(ctx: CanvasRenderingContext2D, opts: PlayerRingOpts): void {
  const { theme, time } = opts;
  const speed01 = clamp01(opts.speed01 ?? 0);
  const lift = Math.max(0, opts.lift ?? 0);
  const roll = Math.max(-1, Math.min(1, opts.roll ?? 0));
  const invuln = Math.max(0, opts.invuln ?? 0);
  /** 1 = 贴水，0 = 完全离水。 */
  const floatK = clamp01(1 - lift / AIRBORNE_LIFT);

  drawRipples(ctx, theme, time, speed01, floatK);
  drawContactShadow(ctx, theme, lift);

  // 贴水时轻微浮沉；空中由跳跃弧线主导，浮沉淡出
  const bob = (Math.sin(time * 3.1) * 1.3 + Math.sin(time * 5.7) * 0.5) * floatK;

  ctx.save();
  ctx.translate(0, -lift + bob);
  ctx.rotate(roll * MAX_ROLL);
  drawBody(ctx, theme, time, invuln);
  ctx.restore();
}

/** 入水涟漪：三圈错相扩散的椭圆环，速度越快节奏越急；离水即淡出。 */
function drawRipples(
  ctx: CanvasRenderingContext2D,
  theme: ThemePaint,
  time: number,
  speed01: number,
  floatK: number,
): void {
  if (floatK <= 0.02) return;
  const rate = 0.9 + speed01 * 0.9;
  ctx.save();
  ctx.strokeStyle = theme.foam;
  for (let i = 0; i < 3; i++) {
    const p = (time * rate + i / 3) % 1;
    const rx = 26 + p * 34;
    ctx.globalAlpha = (1 - p) * (1 - p) * 0.4 * floatK;
    ctx.lineWidth = 2 - p;
    ctx.beginPath();
    ctx.ellipse(0, WATERLINE_Y, rx, rx * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 接触投影：软边径向渐变，跳得越高越小越淡（不用 shadowBlur，省填充）。 */
function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  theme: ThemePaint,
  lift: number,
): void {
  const liftK = clamp01(lift / SHADOW_LIFT);
  const rx = 27 * (1 - 0.35 * liftK);
  const alpha = 0.32 * (1 - 0.55 * liftK);
  const core = lerpColor(theme.waterDeep, "#000000", 0.75);
  ctx.save();
  ctx.translate(0, WATERLINE_Y + 2);
  ctx.scale(1, 0.32);
  const g = ctx.createRadialGradient(0, 0, rx * 0.25, 0, 0, rx);
  g.addColorStop(0, withAlpha(core, alpha));
  g.addColorStop(1, withAlpha(core, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 泳圈本体：受光渐变 + 内圈水洞 + 焊缝 + 镜面高光 + 无敌光环。 */
function drawBody(
  ctx: CanvasRenderingContext2D,
  theme: ThemePaint,
  time: number,
  invuln: number,
): void {
  // 无敌时向 accent 呼吸混色（保留旧版「变色」语义，但不再硬切）
  const flash = invuln > 0 ? 0.45 + 0.35 * Math.sin(time * 22) : 0;
  const body = flash > 0 ? lerpColor(theme.hp, theme.accent, flash) : theme.hp;
  const topLight = lerpColor(body, theme.ink, 0.42);
  const botDark = lerpColor(body, theme.waterDeep, 0.45);

  // 无敌光环画在最底下，不盖住本体
  if (invuln > 0) {
    ctx.save();
    ctx.globalAlpha = 0.32 + 0.26 * Math.sin(time * 18);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, RING_RX + 4.5, RING_RY + 3.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 外圈：顶部受光、中段本色、底部吸水色
  const g = ctx.createLinearGradient(0, -RING_RY, 0, RING_RY);
  g.addColorStop(0, topLight);
  g.addColorStop(0.55, body);
  g.addColorStop(1, botDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, RING_RX, RING_RY, 0, 0, Math.PI * 2);
  ctx.fill();

  // 充气焊缝：内洞放射到外缘的细线，读出「一节节气室」
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = botDark;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < SEAMS; i++) {
    const a = (i / SEAMS) * Math.PI * 2 + Math.PI / SEAMS;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (HOLE_RX + 0.5), HOLE_DY + Math.sin(a) * (HOLE_RY + 0.5));
    ctx.lineTo(Math.cos(a) * (RING_RX - 1.5), Math.sin(a) * (RING_RY - 1));
    ctx.stroke();
  }
  ctx.restore();

  // 内圈水洞：透过洞看到的水，上缘被圈体投影压暗
  const hole = ctx.createLinearGradient(0, HOLE_DY - HOLE_RY, 0, HOLE_DY + HOLE_RY);
  hole.addColorStop(0, theme.waterDeep);
  hole.addColorStop(1, theme.water);
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.ellipse(0, HOLE_DY, HOLE_RX, HOLE_RY, 0, 0, Math.PI * 2);
  ctx.fill();

  // 内壁描边：一圈略暗的边让洞有厚度
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = botDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, HOLE_DY, HOLE_RX + 1, HOLE_RY + 0.8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 镜面高光：左上新月 + 亮点，右侧一道弱反光收形
  ctx.save();
  ctx.fillStyle = theme.ink;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.ellipse(-10, -9, 11, 4.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(-14, -11, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.ellipse(14, -5, 5, 2, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function withAlpha(hex: string, a: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
