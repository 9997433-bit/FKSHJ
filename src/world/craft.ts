/**
 * 船 —— 玩家的拾荒小船与来抢东西的海盗船。
 *
 * 本模块只画不管状态：输入是**结构类型**（`SkiffView` / `PirateView`），
 * 只要给得出 `{ x, y }` 就能画，`sim` 的 `Skiff` / `Pirate` 天然满足，
 * 但绘制侧不 import 它们的类型——渲染不该把玩法结构钉死在画面上。
 *
 * 两种船吃同一套涌浪 `swayAt`（`world/ocean.ts`）：
 * 同一片海里的木筏、漂浮物、小船、海盗是同相摇的，
 * 谁也不会在别人抬起来的时候自己往下沉。
 *
 * 一眼分得开（ARCHITECTURE §4 的可读性要求）：
 * - 小船：亮木色、尖头、敞开的船舱、舷外一支桨和一个捞网，个头小；
 * - 海盗：近黑的船壳、暗红舷条、鼓起来的破帆、船尾的黑旗、船头包铁的撞角，个头明显大一圈。
 *
 * 夜里只压暗、不点亮：唯一的光是小船船头那盏灯，
 * 用 `nightness` 控在很低的 alpha 上，放大了也不刺眼。
 */

import { RAFT_ORIGIN } from "../sim/rules";
import { mixHex, nightness, paletteFor, swayAt, withAlpha, type SeaPalette } from "./ocean";

/** 小船的形状与配色。玩法数值在 `entities/skiff.ts` 的 `SKIFF`，这里只有外观。 */
export const SKIFF_ART = {
  /** 船头（局部坐标 +x 是船头方向） */
  bow: 21,
  /** 船尾 */
  stern: -15,
  /** 舯部半宽 */
  beam: 9.5,
  /** 尾板半宽 */
  sternBeam: 7.5,
  hull: "#c98b4b",
  hullDark: "#5f3819",
  deck: "#e0b077",
  trim: "#7d5327",
  /** 吃的涌浪幅度：比木筏轻，小船跟着浪面走但不夸张 */
  sway: 0.6,
} as const;

/** 海盗船的形状与配色。 */
export const PIRATE_ART = {
  bow: 26,
  stern: -21,
  beam: 13,
  sternBeam: 10.5,
  hull: "#3b2519",
  hullDark: "#150c07",
  deck: "#543822",
  trim: "#8c2233",
  sail: "#cabb9c",
  sway: 0.85,
} as const;

/** 画小船需要的最少信息；`sim` 的 `Skiff` 是它的超集。 */
export type SkiffView = {
  x: number;
  y: number;
  /** 船头朝向（弧度，0 = 屏幕右）；不给按朝右 */
  heading?: number;
  /** 本帧推力 0..1：只影响船首浪与桨的摆幅 */
  thrust?: number;
  /** 捞取冷却剩余秒；>0 时舷外的网正在往回收 */
  cooldown?: number;
};

/** 画海盗船需要的最少信息；`sim` 的 `Pirate` 是它的超集。 */
export type PirateView = {
  x: number;
  y: number;
  /** 朝向（弧度）；不给就用速度推，速度也没有就朝木筏 */
  heading?: number;
  vx?: number;
  vy?: number;
  hp?: number;
  maxHp?: number;
  /** 受击闪白剩余秒数 */
  flash?: number;
  /** 贴脸开砍：船头会有一下下的劈砍反光 */
  attacking?: boolean;
};

export type CraftDrawOpts = {
  /** 本帧配色；不给按 `time` 算昼夜 */
  palette?: SeaPalette;
  /** 夜色浓度 0..1；不给按 `time` 算 */
  night01?: number;
};

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 夜里把颜色往深水色压一点：不改亮度对比，只是整条船沉进夜色里。 */
function dim(color: string, night: number, p: SeaPalette, k = 0.34): string {
  return mixHex(color, p.deep, clamp01(night) * k);
}

/**
 * 船体轮廓：尖船头 + 鼓起来的舷 + 平尾板。
 * 小船和海盗共用同一条曲线，只是尺寸和颜色不同，
 * 所以两条船看起来是「同一片海里造出来的」。
 */
function hullPath(
  ctx: CanvasRenderingContext2D,
  bow: number,
  stern: number,
  beam: number,
  sternBeam: number,
): void {
  ctx.beginPath();
  ctx.moveTo(bow, 0);
  ctx.bezierCurveTo(bow - 4, beam * 0.52, bow * 0.24, beam, stern + 6, sternBeam);
  ctx.quadraticCurveTo(stern, sternBeam, stern, sternBeam * 0.62);
  ctx.lineTo(stern, -sternBeam * 0.62);
  ctx.quadraticCurveTo(stern, -sternBeam, stern + 6, -sternBeam);
  ctx.bezierCurveTo(bow * 0.24, -beam, bow - 4, -beam * 0.52, bow, 0);
  ctx.closePath();
}

/** 水下的暗块：船是浮着的，得在水里留一块影，否则像贴纸。 */
function hullShadow(ctx: CanvasRenderingContext2D, bow: number, beam: number, alpha = 0.28): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#01121f";
  ctx.beginPath();
  ctx.ellipse(-1.5, 3.6, bow * 0.94, beam * 1.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 船壳：外圈一层深色板边 + 内层木色 + 顺船长的板缝 + 舷条。
 * 内层用「同一条曲线缩小几像素」而不是整体 scale，
 * 缩放会把尖船头拉钝，减尺寸才保得住船头那个尖。
 */
function hullBody(
  ctx: CanvasRenderingContext2D,
  art: { bow: number; stern: number; beam: number; sternBeam: number },
  shell: string,
  plank: string,
  rim: string,
): void {
  hullPath(ctx, art.bow, art.stern, art.beam, art.sternBeam);
  ctx.fillStyle = shell;
  ctx.fill();

  hullPath(ctx, art.bow - 3.4, art.stern + 2.4, art.beam - 2.3, art.sternBeam - 2);
  ctx.fillStyle = plank;
  ctx.fill();

  ctx.strokeStyle = withAlpha(shell, 0.55);
  ctx.lineWidth = 1.1;
  for (const k of [-1, 0, 1]) {
    const y = k * (art.beam - 2.3) * 0.46;
    ctx.beginPath();
    ctx.moveTo(art.stern + 4, y);
    ctx.quadraticCurveTo(art.bow * 0.3, y * 1.12, art.bow - 6, y * 0.3);
    ctx.stroke();
  }

  hullPath(ctx, art.bow, art.stern, art.beam, art.sternBeam);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // 受光的一侧：左舷压一条亮边，俯视也看得出船帮是立起来的
  ctx.strokeStyle = "rgba(255, 240, 208, 0.22)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(art.bow - 4, -art.beam * 0.42);
  ctx.bezierCurveTo(art.bow * 0.24, -art.beam + 1.4, art.bow * 0.24, -art.beam + 1.4, art.stern + 6, -art.sternBeam + 1.4);
  ctx.stroke();
}

/* ------------------------------------------------------------------ *
 * 玩家的拾荒小船
 * ------------------------------------------------------------------ */

/**
 * 画一条拾荒小船。
 *
 * 粒子尾迹归 `fx/splash.boatWake`，这里只画船体本身；
 * 船首那两道分水线是贴着船画的静态形状，不进粒子系统，
 * 停船时也只剩很淡的一点，不会和 fx 的白沫打架。
 */
export function drawSkiff(
  ctx: CanvasRenderingContext2D,
  skiff: SkiffView,
  time: number,
  opts: CraftDrawOpts = {},
): void {
  const p = opts.palette ?? paletteFor(time);
  const night = clamp01(opts.night01 ?? nightness(time));
  const a = SKIFF_ART;
  const sway = swayAt(skiff.x, skiff.y, time, a.sway);
  const thrust = clamp01(skiff.thrust ?? 0);

  ctx.save();
  ctx.translate(skiff.x + sway.dx, skiff.y + sway.dy);
  ctx.rotate((skiff.heading ?? 0) + sway.rot);

  hullShadow(ctx, a.bow, a.beam);
  drawBowWash(ctx, a.bow, a.beam, a.stern, thrust, time, p);
  hullBody(
    ctx,
    a,
    dim(a.hullDark, night, p, 0.4),
    dim(a.hull, night, p),
    dim(a.trim, night, p, 0.3),
  );

  // 船头甲板：一块盖住尖头的浅色板 + 一圈盘着的缆绳
  ctx.fillStyle = dim(a.deck, night, p);
  ctx.beginPath();
  ctx.moveTo(a.bow - 1.5, 0);
  ctx.quadraticCurveTo(a.bow * 0.4, a.beam * 0.66, 3, a.beam * 0.5);
  ctx.lineTo(3, -a.beam * 0.5);
  ctx.quadraticCurveTo(a.bow * 0.4, -a.beam * 0.66, a.bow - 1.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(70, 42, 18, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.strokeStyle = dim("#e0c48a", night, p);
  ctx.lineWidth = 1.8;
  for (const r of [4.2, 2.4]) {
    ctx.beginPath();
    ctx.ellipse(10, 0, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 船舱：敞开的舱口最能和海盗那条闷罐子拉开距离
  const cockpit = { x: a.stern + 3.5, y: -a.beam * 0.52, w: 15, h: a.beam * 1.04 };
  ctx.fillStyle = "rgba(38, 22, 9, 0.92)";
  ctx.beginPath();
  ctx.rect(cockpit.x, cockpit.y, cockpit.w, cockpit.h);
  ctx.fill();
  ctx.strokeStyle = dim(a.trim, night, p, 0.3);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 两条横座板 + 舱底的一小堆战利品
  ctx.fillStyle = dim("#a9763f", night, p);
  for (const x of [cockpit.x + 2.5, cockpit.x + cockpit.w - 5]) {
    ctx.fillRect(x, cockpit.y + 0.6, 2.6, cockpit.h - 1.2);
  }
  ctx.fillStyle = dim("#9fe6ff", night, p, 0.45);
  ctx.fillRect(cockpit.x + 6.5, -2.6, 4.4, 5.2);
  ctx.fillStyle = dim("#b9c4cc", night, p, 0.45);
  ctx.fillRect(cockpit.x + 6.2, 1.4, 5, 2.4);

  // 尾板 + 一支随推力摆的桨
  ctx.fillStyle = dim("#8a5a2b", night, p);
  ctx.fillRect(a.stern + 0.5, -a.sternBeam + 1.6, 3, (a.sternBeam - 1.6) * 2);
  drawOar(ctx, a.stern + 4, a.beam - 1, 1, 0.5 + thrust * 0.6, time * (3 + thrust * 5), night, p);

  // 捞网：伸在右舷外的一个圈，冷却里往回收，看得出刚捞过
  const haul = clamp01((skiff.cooldown ?? 0) / 0.22);
  ctx.save();
  ctx.translate(6, -a.beam + 1);
  ctx.rotate(-0.5 + haul * 0.7);
  ctx.strokeStyle = dim("#7d5327", night, p, 0.3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(9, -7);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(p.foam, 0.5 - haul * 0.15);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(12.5, -9.5, 5.2, 4, -0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8.4, -12);
  ctx.lineTo(16.6, -7);
  ctx.moveTo(9.4, -6.2);
  ctx.lineTo(15.6, -12.8);
  ctx.stroke();
  ctx.restore();

  // 船头灯：白天只是个铜点，夜里才亮，而且压得很低
  const lamp = 0.12 + night * 0.5;
  ctx.fillStyle = withAlpha(p.accent, 0.35 + night * 0.45);
  ctx.beginPath();
  ctx.arc(a.bow - 6.5, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();
  if (night > 0.05) {
    const glow = ctx.createRadialGradient(a.bow - 6.5, 0, 1, a.bow - 6.5, 0, 22);
    glow.addColorStop(0, withAlpha(p.accent, lamp * 0.5));
    glow.addColorStop(1, withAlpha(p.accent, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(a.bow - 6.5, 0, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** 船首分水线 + 尾流：贴着船体的两道白沫，随推力变长变亮。 */
function drawBowWash(
  ctx: CanvasRenderingContext2D,
  bow: number,
  beam: number,
  stern: number,
  thrust: number,
  time: number,
  p: SeaPalette,
): void {
  const k = 0.16 + thrust * 0.84;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha(p.foam, 0.1 + k * 0.28);
  ctx.lineWidth = 1.5 + k * 0.9;
  for (const side of [-1, 1]) {
    const wob = Math.sin(time * 7 + side) * 0.9 * k;
    ctx.beginPath();
    ctx.moveTo(bow - 2, side * 1.6);
    ctx.quadraticCurveTo(
      bow - 12,
      side * (beam + 2.5 + k * 3),
      stern - 6 - k * 16,
      side * (beam + 5 + k * 7) + wob,
    );
    ctx.stroke();
  }
  // 尾板后面被搅起来的一小团
  ctx.strokeStyle = withAlpha(p.foam, 0.06 + k * 0.22);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const u = i / 3;
    const r = 2.6 + u * 4 + Math.abs(Math.sin(time * 5 + i)) * 1.6 * k;
    ctx.beginPath();
    ctx.ellipse(stern - 3 - u * (5 + k * 12), Math.sin(time * 4 + i * 2) * 2, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 一支桨：柄从舷边斜出去，末端一片桨叶，`phase` 决定划到哪儿。 */
function drawOar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  side: number,
  swing: number,
  phase: number,
  night: number,
  p: SeaPalette,
): void {
  ctx.save();
  ctx.translate(x, y * side);
  ctx.rotate(side * (0.5 + Math.sin(phase) * 0.3 * swing));
  ctx.strokeStyle = dim("#c9a367", night, p, 0.3);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(11, side * 6);
  ctx.stroke();
  ctx.fillStyle = dim("#a9763f", night, p, 0.3);
  ctx.beginPath();
  ctx.ellipse(13.5, side * 7.4, 4.4, 2.4, side * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 海盗船
 * ------------------------------------------------------------------ */

/** 没给朝向时的兜底：先看速度，停下来了就一律朝木筏——它们本来就是奔着筏来的。 */
function pirateHeading(pirate: PirateView): number {
  if (pirate.heading !== undefined) return pirate.heading;
  const vx = pirate.vx ?? 0;
  const vy = pirate.vy ?? 0;
  if (Math.hypot(vx, vy) > 1) return Math.atan2(vy, vx);
  const dx = RAFT_ORIGIN.x - pirate.x;
  const dy = RAFT_ORIGIN.y - pirate.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx);
}

/** 一船海盗。等价于逐个 `drawPirate`，只是省掉调用方的 for。 */
export function drawPirates(
  ctx: CanvasRenderingContext2D,
  pirates: readonly PirateView[],
  time: number,
  opts: CraftDrawOpts = {},
): void {
  for (const p of pirates) drawPirate(ctx, p, time, opts);
}

/**
 * 画一条海盗船：黑木壳、暗红舷条、包铁撞角、鼓着的破帆、船尾的黑旗。
 *
 * 和小船的区别是**造型**不是颜色深浅：帆和旗在那儿，
 * 哪怕两条船叠在一起、哪怕是夜里，也不会认错谁是谁。
 */
export function drawPirate(
  ctx: CanvasRenderingContext2D,
  pirate: PirateView,
  time: number,
  opts: CraftDrawOpts = {},
): void {
  const p = opts.palette ?? paletteFor(time);
  const night = clamp01(opts.night01 ?? nightness(time));
  const a = PIRATE_ART;
  const sway = swayAt(pirate.x, pirate.y, time, a.sway);
  const flash = Math.max(0, pirate.flash ?? 0);
  const moving = Math.hypot(pirate.vx ?? 0, pirate.vy ?? 0) > 1 || !pirate.attacking;

  ctx.save();
  ctx.translate(pirate.x + sway.dx, pirate.y + sway.dy);
  ctx.rotate(pirateHeading(pirate) + sway.rot);

  hullShadow(ctx, a.bow, a.beam, 0.34);

  // 桨：三对，划水的相位错开，停船开砍时只是轻轻拖着
  const stroke = moving ? 1 : 0.3;
  for (let i = 0; i < 3; i++) {
    const x = a.stern + 6 + i * 8;
    for (const side of [-1, 1] as const) {
      drawOar(ctx, x, a.beam - 2, side, stroke, time * 4 + i * 1.1 + (side > 0 ? 0 : 0.5), night, p);
    }
  }

  hullBody(
    ctx,
    a,
    dim(a.hullDark, night, p, 0.45),
    dim(a.hull, night, p, 0.45),
    dim("#0d0705", night, p, 0.35),
  );

  // 暗红舷条：这条线是海盗的身份色，别的东西不许用
  ctx.strokeStyle = dim(a.trim, night, p, 0.4);
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(a.bow - 6, side * (a.beam * 0.42));
    ctx.quadraticCurveTo(a.bow * 0.2, side * (a.beam - 3.4), a.stern + 4, side * (a.sternBeam - 3));
    ctx.stroke();
  }

  // 包铁的撞角 + 两根倒钩：船头一眼看出来是来撞人的
  ctx.fillStyle = dim("#6b6f74", night, p, 0.4);
  ctx.beginPath();
  ctx.moveTo(a.bow + 4, 0);
  ctx.lineTo(a.bow - 6, 4.6);
  ctx.lineTo(a.bow - 6, -4.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = dim("#9aa2a8", night, p, 0.4);
  ctx.lineWidth = 1.4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(a.bow - 9, side * 5.2);
    ctx.lineTo(a.bow - 2, side * 8.4);
    ctx.stroke();
  }

  // 甲板：一块比船壳更黑的舱盖 + 几箱抢来的货
  ctx.fillStyle = "rgba(12, 7, 4, 0.85)";
  ctx.fillRect(a.stern + 5, -a.beam * 0.5, 13, a.beam);
  ctx.fillStyle = dim("#5b3d24", night, p, 0.4);
  ctx.fillRect(a.stern + 7, -4.5, 5, 4);
  ctx.fillRect(a.stern + 12, 0.5, 5.5, 4.5);

  drawSail(ctx, a, time, night, p);
  drawJollyFlag(ctx, a, time, night, p);

  // 开砍：船头那一下劈砍的反光，不是发光是反光，别刺眼
  if (pirate.attacking) {
    const swingT = Math.abs(Math.sin(time * 7));
    ctx.save();
    ctx.translate(a.bow - 8, 0);
    ctx.rotate(-0.8 + swingT * 1.4);
    ctx.strokeStyle = withAlpha("#d8dee3", 0.35 + swingT * 0.35);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.fillStyle = withAlpha(p.danger, 0.3 + swingT * 0.25);
    ctx.beginPath();
    ctx.moveTo(11, -3.4);
    ctx.lineTo(17, 0);
    ctx.lineTo(11, 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 受击闪白：整条船壳盖一层白，看得出这一下打中了
  if (flash > 0) {
    hullPath(ctx, a.bow, a.stern, a.beam, a.sternBeam);
    ctx.fillStyle = withAlpha("#ffffff", Math.min(0.6, flash * 4));
    ctx.fill();
  }

  ctx.restore();

  drawPirateHp(ctx, pirate, sway, p);
}

/** 破帆：俯视看是一片朝船头鼓起来的弧，帆脚随时间呼吸，上面还有补丁和破洞。 */
function drawSail(
  ctx: CanvasRenderingContext2D,
  a: typeof PIRATE_ART,
  time: number,
  night: number,
  p: SeaPalette,
): void {
  const span = a.beam + 2.5;
  const bulge = 13 + Math.sin(time * 1.3) * 2.2;
  const root = 1.5;
  const cloth = dim(a.sail, night, p, 0.42);

  ctx.save();
  // 帆的投影：帆是撑在甲板上方的，得在甲板上留一道影
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#050b10";
  ctx.beginPath();
  ctx.moveTo(root - 2, -span);
  ctx.quadraticCurveTo(root + bulge - 3, 0, root - 2, span);
  ctx.quadraticCurveTo(root - 5, 0, root - 2, -span);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.moveTo(root, -span);
  ctx.quadraticCurveTo(root + bulge, 0, root, span);
  ctx.quadraticCurveTo(root - 3, 0, root, -span);
  ctx.closePath();
  ctx.fillStyle = cloth;
  ctx.fill();
  ctx.strokeStyle = "rgba(30, 20, 12, 0.75)";
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // 帆布的缝与褶
  ctx.strokeStyle = withAlpha("#4a3a26", 0.5);
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = -span + (span * 2 * i) / 4;
    ctx.beginPath();
    ctx.moveTo(root, y);
    ctx.quadraticCurveTo(root + bulge * 0.55, y * 0.85, root + bulge * (1 - Math.abs(y) / span) * 0.9, y * 0.6);
    ctx.stroke();
  }
  // 破洞：透出下面的甲板黑，帆就「旧」了
  ctx.fillStyle = "rgba(14, 9, 5, 0.7)";
  ctx.beginPath();
  ctx.ellipse(root + bulge * 0.42, -span * 0.42, 2.6, 1.7, 0.4, 0, Math.PI * 2);
  ctx.ellipse(root + bulge * 0.3, span * 0.55, 1.9, 1.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // 补丁
  ctx.fillStyle = withAlpha("#7a6244", 0.75);
  ctx.fillRect(root + bulge * 0.2, span * 0.1, 4.6, 3.6);

  // 桅与横桁：帆的骨架，缺了它帆会像贴上去的一块布
  ctx.strokeStyle = dim("#2b1c10", night, p, 0.3);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(root, -span);
  ctx.lineTo(root, span);
  ctx.stroke();
  ctx.fillStyle = dim("#3a2718", night, p, 0.3);
  ctx.beginPath();
  ctx.arc(root, 0, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#c8b48c", 0.45);
  ctx.lineWidth = 0.9;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(root, side * span);
    ctx.lineTo(a.stern + 5, side * (a.sternBeam - 2));
    ctx.stroke();
  }
  ctx.restore();
}

/** 船尾的黑旗：向船后飘，白骨记号很小但认得出。 */
function drawJollyFlag(
  ctx: CanvasRenderingContext2D,
  a: typeof PIRATE_ART,
  time: number,
  night: number,
  p: SeaPalette,
): void {
  const wave = Math.sin(time * 4.2) * 2.4;
  const x0 = a.stern + 4;
  ctx.save();
  ctx.strokeStyle = dim("#2b1c10", night, p, 0.3);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0, -1);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x0, -5.5);
  ctx.quadraticCurveTo(x0 - 8, -6 + wave, x0 - 16, -4.5 + wave * 1.4);
  ctx.lineTo(x0 - 16, 4.5 + wave * 1.4);
  ctx.quadraticCurveTo(x0 - 8, 6 + wave, x0, 5.5);
  ctx.closePath();
  ctx.fillStyle = dim("#120c0a", night, p, 0.25);
  ctx.fill();
  ctx.strokeStyle = withAlpha(p.danger, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // 骨头记号：两条交叉的白线加一个小骷髅点
  ctx.strokeStyle = withAlpha("#e6e0d2", 0.7);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0 - 12 + wave * 0.3, -3);
  ctx.lineTo(x0 - 5 + wave * 0.2, 3);
  ctx.moveTo(x0 - 12 + wave * 0.3, 3);
  ctx.lineTo(x0 - 5 + wave * 0.2, -3);
  ctx.stroke();
  ctx.restore();
}

/** 血条：只有掉过血才画，画在船的正上方（不跟船转，读数才稳）。 */
function drawPirateHp(
  ctx: CanvasRenderingContext2D,
  pirate: PirateView,
  sway: { dx: number; dy: number },
  p: SeaPalette,
): void {
  const max = pirate.maxHp ?? 0;
  const hp = pirate.hp ?? max;
  if (max <= 0 || hp >= max) return;
  const f = clamp01(hp / max);
  const w = 30;
  const x = pirate.x + sway.dx - w / 2;
  const y = pirate.y + sway.dy - PIRATE_ART.beam - 14;
  ctx.save();
  ctx.fillStyle = "rgba(6, 16, 24, 0.75)";
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = f < 0.34 ? p.danger : f < 0.67 ? "#ffb703" : p.accent;
  ctx.fillRect(x, y, w * f, 4);
  ctx.restore();
}
