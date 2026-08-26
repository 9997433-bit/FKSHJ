/**
 * 物品外观 —— 漂浮物与道具「长什么样」的唯一登记处。
 *
 * 为什么单独一个模块：物品**目录**（名字、描述、堆叠、标签）归
 * `data/catalog.ts`，那是玩法数据；这里只回答「画成什么」。两边靠 id 对上，
 * 名字只在目录里写一次。目录加了新物品而这里还没配图也不会崩——
 * 画成「未知包裹」，配图可以晚一步。
 *
 * 三层结构，越往下越自由：
 *
 * 1. **剪影库** `SILHOUETTES`：二十来种一眼分得开的外形（长木条 / 瓶子 /
 *    撕裂铁皮 / 绳卷 / 板条箱 / 油桶 / 浮标 / 轮胎 / 麻袋 / 提罐 / 齿轮 /
 *    海草 / 玻璃碴 / 宝箱 / 破网 / 玻璃球 / 未知包裹）。每个都是
 *    `(ctx, r, ink, time)`，画在**原点局部坐标**里，朝向、摇摆、淡出
 *    由调用方负责。
 * 2. **登记表**：`registerItemArt({ id, shape, tint, ... })` 把物品 id 绑到
 *    一个剪影加一套颜色。同一个剪影配不同色就是两件明显不同的东西。
 * 3. **自定义画法**：给了 `draw` 就完全接管，剪影库只是省事的默认值。
 *
 * 未登记的 id 不会崩、也不会画成空白：`itemArt` 返回一件「未知包裹」，
 * 颜色由 id 散列出来——两个还没配图的新道具在海面上也不会撞脸。
 *
 * 可读性红线（ARCHITECTURE §4）：1× 缩放下 13–16px 半径就要能认出是什么，
 * 所以每个剪影先保证**轮廓**不同（长条 / 高瘦 / 带角 / 圆环 / 方块），
 * 颜色只是第二道线索——夜里配色整体压暗，只靠颜色的东西会全糊成一团。
 */

import { ITEMS, ITEM_IDS, type ItemId } from "../data/catalog";
import { mixHex, withAlpha } from "./ocean";

/** 一件物品的三个色号：本体、暗部（描边与投影）、点缀（盖子、扎带、锈斑）。 */
export type ItemInk = { tint: string; dark: string; accent: string };

/**
 * 局部坐标的画法：原点是物品中心，`r` 是外接半径，`time` 是局内秒
 * （只用来做呼吸一类的循环动画，不许拿来存状态）。
 */
export type ItemDraw = (
  ctx: CanvasRenderingContext2D,
  r: number,
  ink: ItemInk,
  time: number,
) => void;

/** 剪影库的键。挑一个最接近的形状，颜色另配。 */
export type SilhouetteId =
  | "plank"
  | "bottle"
  | "plate"
  | "coil"
  | "crate"
  | "drum"
  | "buoy"
  | "tire"
  | "sack"
  | "canister"
  | "gear"
  | "kelp"
  | "shard"
  | "chest"
  | "sheet"
  | "fish"
  | "hook"
  | "wrench"
  | "flare"
  | "compass"
  | "medkit"
  | "net"
  | "float"
  | "unknown";

export const SILHOUETTE_IDS: readonly SilhouetteId[] = [
  "plank",
  "bottle",
  "plate",
  "coil",
  "crate",
  "drum",
  "buoy",
  "tire",
  "sack",
  "canister",
  "gear",
  "kelp",
  "shard",
  "chest",
  "sheet",
  "fish",
  "hook",
  "wrench",
  "flare",
  "compass",
  "medkit",
  "net",
  "float",
  "unknown",
];

/** 登记一件物品外观时能给的东西；除 `id` 外全可省。 */
export type ItemArtSpec = {
  id: string;
  /** 中文名，飘字与图鉴直接用；不给就退回 id */
  label?: string;
  shape?: SilhouetteId;
  tint?: string;
  /** 不给按 tint 压深 */
  dark?: string;
  /** 不给按 tint 提亮 */
  accent?: string;
  /** 绘制与判定半径（逻辑像素） */
  r?: number;
  /** 稀有度 0–3：≥2 会多一圈柔光，远远就看得出「这件不一样」 */
  rare?: number;
  /** 自己画。给了就不走剪影库 */
  draw?: ItemDraw;
};

/** 补全后的外观表。`itemArt` 只返回这个形状。 */
export type ItemArt = Required<Omit<ItemArtSpec, "draw">> & { draw: ItemDraw | null };

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 稳定散列：同一个 id 每次跑出同一个颜色，换台机器也一样。 */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function byte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n * 255)))
    .toString(16)
    .padStart(2, "0");
}

/** HSL → #rrggbb。只在「没给颜色」的兜底路径上用。 */
function hslHex(h360: number, s: number, l: number): string {
  const h = ((h360 % 360) + 360) % 360 / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const rgb: [number, number, number] =
    h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return `#${byte(rgb[0] + m)}${byte(rgb[1] + m)}${byte(rgb[2] + m)}`;
}

/**
 * 没配色的 id 按散列分一个色相。
 *
 * 避开 190–235 那段——海水就是这个色，落在上面的东西会看不见。
 */
function autoTint(id: string): string {
  const h = hash32(id) % 315;
  return hslHex(h < 190 ? h : h + 45, 0.46, 0.66);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const k = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}

function poly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** 描边：所有剪影都收一道暗边，1× 下轮廓才咬得住海面。 */
function rim(ctx: CanvasRenderingContext2D, ink: ItemInk, w = 1.3): void {
  ctx.strokeStyle = withAlpha(ink.dark, 0.85);
  ctx.lineWidth = w;
  ctx.stroke();
}

/** 高光色：受光的一侧压一条亮边，俯视也看得出这东西是立体的。 */
function gloss(alpha = 0.3): string {
  return withAlpha("#ffffff", alpha);
}

/* ------------------------------------------------------------------ *
 * 剪影库
 * ------------------------------------------------------------------ */

/** 木料：两块错开的板。轮廓是最扁最长的一条，远看就是「一根横杠」。 */
function drawPlank(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 2.4;
  const h = r * 0.66;

  // 压在下面的第二块：短一截、往下错半块，一眼是「两块木料」不是一块砖
  const bw = w * 0.82;
  ctx.fillStyle = mixHex(ink.dark, ink.tint, 0.34);
  ctx.fillRect(-bw * 0.46, h * 0.06, bw, h * 0.82);
  ctx.strokeStyle = withAlpha(ink.dark, 0.75);
  ctx.lineWidth = 1;
  ctx.strokeRect(-bw * 0.46, h * 0.06, bw, h * 0.82);

  const top = -h * 0.96;
  ctx.fillStyle = ink.dark;
  ctx.fillRect(-w / 2, top + 1.6, w, h);
  ctx.fillStyle = ink.tint;
  ctx.fillRect(-w / 2, top, w, h);

  // 木纹：两条顺纹的细线
  ctx.strokeStyle = withAlpha(ink.dark, 0.5);
  ctx.lineWidth = 1;
  for (const k of [0.34, 0.68]) {
    const y = top + h * k;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, y);
    ctx.lineTo(w / 2 - 3, y);
    ctx.stroke();
  }

  // 端面：两头各一小块深色断面，木头才有「锯断的那一头」
  ctx.fillStyle = mixHex(ink.dark, "#000000", 0.2);
  ctx.fillRect(-w / 2, top, 2.6, h);
  ctx.fillRect(w / 2 - 2.6, top, 2.6, h);

  ctx.strokeStyle = withAlpha(ink.dark, 0.9);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-w / 2, top, w, h);

  // 钉头
  ctx.fillStyle = "#8b959d";
  for (const x of [-w * 0.3, w * 0.3]) {
    ctx.beginPath();
    ctx.arc(x, top + h * 0.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = gloss(0.22);
  ctx.fillRect(-w / 2 + 3, top + 1, w - 6, 1.4);
}

/** 塑料瓶：高瘦 + 收腰的脖子 + 一个显眼的瓶盖。轮廓上那个「疙瘩」是识别点。 */
function drawBottle(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk, time: number): void {
  const w = r * 1.16;
  const h = r * 1.95;
  const neck = w * 0.24;

  ctx.fillStyle = withAlpha(ink.tint, 0.9);
  ctx.beginPath();
  ctx.moveTo(-w / 2, h * 0.42);
  ctx.quadraticCurveTo(-w / 2, h / 2, -w * 0.34, h / 2);
  ctx.lineTo(w * 0.34, h / 2);
  ctx.quadraticCurveTo(w / 2, h / 2, w / 2, h * 0.42);
  ctx.lineTo(w / 2, -h * 0.14);
  ctx.quadraticCurveTo(w / 2, -h * 0.4, neck, -h * 0.46);
  ctx.lineTo(neck, -h / 2);
  ctx.lineTo(-neck, -h / 2);
  ctx.lineTo(-neck, -h * 0.46);
  ctx.quadraticCurveTo(-w / 2, -h * 0.4, -w / 2, -h * 0.14);
  ctx.closePath();
  ctx.fill();
  rim(ctx, ink, 1.2);

  // 标签：横过瓶身的一道深色带，缩到十来像素还看得出是「贴了标的瓶子」
  ctx.fillStyle = withAlpha(ink.dark, 0.55);
  ctx.fillRect(-w / 2, h * 0.02, w, h * 0.24);
  ctx.strokeStyle = withAlpha(ink.dark, 0.7);
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-w / 2, h * 0.02, w, h * 0.24);

  // 瓶盖：比脖子宽，轮廓上必须能看到这一截
  ctx.fillStyle = ink.accent;
  roundRect(ctx, -neck * 1.55, -h / 2 - 4.4, neck * 3.1, 5, 1.4);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ink.dark, 0.6);
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // 瓶里晃的水光
  ctx.fillStyle = gloss(0.3 + Math.abs(Math.sin(time * 1.8)) * 0.22);
  ctx.fillRect(-w * 0.3, -h * 0.1, 2.2, h * 0.4);
}

/** 撕裂的铁皮：不规则多边形 + 翻卷的角。带角的轮廓和木条、瓶子都不撞。 */
function drawPlate(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 1.9;
  const h = r * 1.5;
  const shape: readonly (readonly [number, number])[] = [
    [-w * 0.5, -h * 0.3],
    [-w * 0.14, -h * 0.5],
    [w * 0.3, -h * 0.4],
    [w * 0.5, 0],
    [w * 0.22, h * 0.5],
    [-w * 0.08, h * 0.26],
    [-w * 0.34, h * 0.48],
  ];

  poly(ctx, shape);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.4);

  // 翻起来的一角：亮面，看得出这块皮是卷边的
  poly(ctx, [
    [w * 0.3, -h * 0.4],
    [w * 0.5, 0],
    [w * 0.16, -h * 0.06],
  ]);
  ctx.fillStyle = mixHex(ink.tint, "#ffffff", 0.4);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ink.dark, 0.6);
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // 铆钉一排
  ctx.fillStyle = withAlpha(ink.dark, 0.9);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-w * 0.3 + i * w * 0.17, -h * 0.1 + i * h * 0.06, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 锈斑 + 一道硬高光（金属和木头的差别主要在这条高光上）
  ctx.fillStyle = withAlpha(ink.accent, 0.5);
  ctx.beginPath();
  ctx.ellipse(-w * 0.16, h * 0.2, 3.2, 2.1, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = gloss(0.45);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -h * 0.24);
  ctx.lineTo(-w * 0.06, -h * 0.4);
  ctx.stroke();
}

/** 绳卷：环 + 甩出去的一截绳头。那截尾巴把圆形轮廓打破，绝不会看成轮胎。 */
function drawCoil(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const rad = r * 0.84;
  const ry = rad * 0.78;

  // 甩出来的绳头：先画，压在环下面
  ctx.strokeStyle = ink.dark;
  ctx.lineWidth = 4.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(rad * 0.5, ry * 0.5);
  ctx.quadraticCurveTo(rad * 1.5, ry * 1.1, rad * 1.72, -ry * 0.24);
  ctx.stroke();
  ctx.strokeStyle = ink.tint;
  ctx.lineWidth = 2.6;
  ctx.stroke();

  ctx.strokeStyle = ink.dark;
  ctx.lineWidth = 5.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, rad, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = ink.tint;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, rad, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, rad * 0.54, ry * 0.54, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 编股：斜着的一圈短划，绳子才不是一根光管
  ctx.strokeStyle = withAlpha(ink.dark, 0.85);
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * ry;
    ctx.beginPath();
    ctx.moveTo(x * 0.82, y * 0.82);
    ctx.lineTo(x * 1.18, y * 1.18);
    ctx.stroke();
  }
  // 绳头收口的一道扎线
  ctx.strokeStyle = withAlpha(ink.accent, 0.9);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(rad * 1.56, -ry * 0.06);
  ctx.lineTo(rad * 1.78, -ry * 0.38);
  ctx.stroke();
}

/** 板条箱：正方轮廓 + 交叉支撑。方形是这一族里最好认的形状。 */
function drawCrate(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const s = r * 1.52;
  roundRect(ctx, -s / 2, -s / 2, s, s, 2);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.5);

  ctx.strokeStyle = withAlpha(ink.dark, 0.8);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-s / 2 + 2, -s / 2 + 2);
  ctx.lineTo(s / 2 - 2, s / 2 - 2);
  ctx.moveTo(s / 2 - 2, -s / 2 + 2);
  ctx.lineTo(-s / 2 + 2, s / 2 - 2);
  ctx.stroke();

  // 四角的包铁
  ctx.fillStyle = withAlpha(ink.accent, 0.85);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      ctx.fillRect(sx * (s / 2 - 3.4) - 1.7, sy * (s / 2 - 3.4) - 1.7, 3.4, 3.4);
    }
  }
  ctx.fillStyle = gloss(0.2);
  ctx.fillRect(-s / 2 + 2, -s / 2 + 2, s - 4, 1.6);
}

/** 油桶：胶囊形 + 两道箍。比木条短粗、两头是圆的，靠这个和木料分开。 */
function drawDrum(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 1.9;
  const h = r * 1.32;
  roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.42);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.4);

  ctx.strokeStyle = withAlpha(ink.dark, 0.8);
  ctx.lineWidth = 2.2;
  for (const x of [-w * 0.16, w * 0.16]) {
    ctx.beginPath();
    ctx.moveTo(x, -h / 2 + 1.6);
    ctx.lineTo(x, h / 2 - 1.6);
    ctx.stroke();
  }

  // 桶口：一头的加注盖
  ctx.fillStyle = ink.accent;
  ctx.beginPath();
  ctx.arc(-w * 0.36, 0, h * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ink.dark, 0.75);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = gloss(0.24);
  roundRect(ctx, -w / 2 + 3, -h / 2 + 2.4, w - 6, 2.2, 1.1);
  ctx.fill();
}

/** 浮标：圆身 + 顶上的小旗。轮廓上那根杆子是识别点。 */
function drawBuoy(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk, time: number): void {
  const rad = r * 0.82;
  ctx.beginPath();
  ctx.arc(0, r * 0.18, rad, 0, Math.PI * 2);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.4);

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, r * 0.18, rad, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = ink.accent;
  ctx.fillRect(-rad, r * 0.18 - rad * 0.24, rad * 2, rad * 0.48);
  ctx.restore();

  ctx.strokeStyle = withAlpha(ink.dark, 0.9);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.18 - rad);
  ctx.lineTo(0, -r * 1.1);
  ctx.stroke();

  const flap = Math.sin(time * 3) * 1.2;
  poly(ctx, [
    [0, -r * 1.1],
    [r * 0.62, -r * 0.86 + flap],
    [0, -r * 0.62],
  ]);
  ctx.fillStyle = ink.accent;
  ctx.fill();
  ctx.strokeStyle = withAlpha(ink.dark, 0.6);
  ctx.lineWidth = 0.9;
  ctx.stroke();

  ctx.fillStyle = gloss(0.28);
  ctx.beginPath();
  ctx.ellipse(-rad * 0.34, r * 0.18 - rad * 0.42, rad * 0.3, rad * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** 轮胎：厚圆环 + 外圈胎纹。中间是通的，和实心的桶一眼分得开。 */
function drawTire(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const rad = r * 0.84;
  ctx.strokeStyle = ink.dark;
  ctx.lineWidth = rad * 0.62;
  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = ink.tint;
  ctx.lineWidth = rad * 0.4;
  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(ink.dark, 0.9);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * rad * 0.56, Math.sin(a) * rad * 0.56);
    ctx.lineTo(Math.cos(a) * rad * 0.98, Math.sin(a) * rad * 0.98);
    ctx.stroke();
  }

  ctx.fillStyle = withAlpha(ink.accent, 0.7);
  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ink.dark, 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 麻袋：下鼓上收的梨形 + 扎口。软的东西，轮廓上没有一条直线。 */
function drawSack(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 1.3;
  const h = r * 1.7;
  ctx.beginPath();
  ctx.moveTo(-w * 0.22, -h * 0.34);
  ctx.bezierCurveTo(-w * 0.86, -h * 0.1, -w * 0.78, h * 0.5, 0, h * 0.5);
  ctx.bezierCurveTo(w * 0.78, h * 0.5, w * 0.86, -h * 0.1, w * 0.22, -h * 0.34);
  ctx.closePath();
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.3);

  // 扎口：一圈绳 + 两只耳朵
  ctx.fillStyle = mixHex(ink.tint, ink.dark, 0.35);
  poly(ctx, [
    [-w * 0.3, -h * 0.34],
    [-w * 0.46, -h * 0.56],
    [-w * 0.02, -h * 0.4],
  ]);
  ctx.fill();
  poly(ctx, [
    [w * 0.3, -h * 0.34],
    [w * 0.5, -h * 0.5],
    [w * 0.04, -h * 0.4],
  ]);
  ctx.fill();
  ctx.strokeStyle = ink.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.26, -h * 0.32);
  ctx.quadraticCurveTo(0, -h * 0.24, w * 0.26, -h * 0.32);
  ctx.stroke();

  // 布褶
  ctx.strokeStyle = withAlpha(ink.dark, 0.45);
  ctx.lineWidth = 1;
  for (const k of [-0.3, 0.1]) {
    ctx.beginPath();
    ctx.moveTo(w * k, -h * 0.14);
    ctx.quadraticCurveTo(w * (k + 0.08), h * 0.14, w * (k - 0.02), h * 0.4);
    ctx.stroke();
  }
}

/** 提罐：方身 + 顶上的提手。提手那道拱是它和板条箱的分界。 */
function drawCanister(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 1.34;
  const h = r * 1.62;
  roundRect(ctx, -w / 2, -h * 0.34, w, h * 0.84, 2.4);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.4);

  ctx.strokeStyle = withAlpha(ink.dark, 0.55);
  ctx.lineWidth = 1.2;
  for (const k of [0.1, 0.36]) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 2.5, -h * 0.34 + h * k);
    ctx.lineTo(w / 2 - 2.5, -h * 0.34 + h * k);
    ctx.stroke();
  }

  // 提手
  ctx.strokeStyle = ink.dark;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, -h * 0.34);
  ctx.quadraticCurveTo(0, -h * 0.74, w * 0.28, -h * 0.34);
  ctx.stroke();

  ctx.fillStyle = ink.accent;
  roundRect(ctx, w * 0.06, -h * 0.44, w * 0.28, 4, 1.2);
  ctx.fill();
  ctx.fillStyle = gloss(0.24);
  ctx.fillRect(-w / 2 + 2.4, -h * 0.3, 2, h * 0.66);
}

/** 齿轮：带齿的圆 + 中间的孔。零件类道具的通用形。 */
function drawGear(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const rad = r * 0.78;
  const teeth = 8;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
    const a2 = ((i + 1) / teeth) * Math.PI * 2;
    const outer = rad * 1.26;
    if (i === 0) ctx.moveTo(Math.cos(a0) * rad, Math.sin(a0) * rad);
    ctx.lineTo(Math.cos(a0 + 0.12) * outer, Math.sin(a0 + 0.12) * outer);
    ctx.lineTo(Math.cos(a1 - 0.12) * outer, Math.sin(a1 - 0.12) * outer);
    ctx.lineTo(Math.cos(a1) * rad, Math.sin(a1) * rad);
    ctx.lineTo(Math.cos(a2) * rad, Math.sin(a2) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.3);

  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(ink.dark, 0.95);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ink.accent, 0.6);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = gloss(0.35);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.92, Math.PI * 1.05, Math.PI * 1.5);
  ctx.stroke();
}

/** 海草：几条飘着的叶片。轮廓是散开的，和所有硬货都不一样。 */
function drawKelp(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk, time: number): void {
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const side = i === 1 ? 0 : i === 0 ? -1 : 1;
    const len = r * (1.5 - Math.abs(side) * 0.32);
    const wob = Math.sin(time * 1.6 + i * 1.4) * r * 0.16;
    ctx.strokeStyle = i === 1 ? ink.tint : mixHex(ink.tint, ink.dark, 0.3);
    ctx.lineWidth = r * 0.3;
    ctx.beginPath();
    ctx.moveTo(side * r * 0.16, r * 0.62);
    ctx.quadraticCurveTo(side * r * 0.7 + wob, 0, side * r * 0.92 + wob, -len * 0.52);
    ctx.stroke();
  }
  // 气囊：叶柄上的几个小鼓包
  ctx.fillStyle = ink.accent;
  for (let i = 0; i < 3; i++) {
    const a = -0.9 + i * 0.9;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.34 - r * 0.1, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = withAlpha(ink.dark, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, r * 0.66);
  ctx.lineTo(r * 0.3, r * 0.66);
  ctx.stroke();
}

/** 玻璃碴：三片透光的尖角。半透明加白边，一眼是「会割手的东西」。 */
function drawShard(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const pieces: readonly (readonly (readonly [number, number])[])[] = [
    [
      [-r * 0.9, r * 0.2],
      [-r * 0.1, -r * 0.85],
      [r * 0.12, r * 0.3],
    ],
    [
      [r * 0.1, r * 0.5],
      [r * 0.55, -r * 0.5],
      [r * 0.95, r * 0.35],
    ],
    [
      [-r * 0.55, r * 0.85],
      [-r * 0.05, r * 0.35],
      [r * 0.2, r * 0.9],
    ],
  ];
  for (let i = 0; i < pieces.length; i++) {
    poly(ctx, pieces[i]);
    ctx.fillStyle = withAlpha(ink.tint, 0.62 - i * 0.08);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#ffffff", 0.6);
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha(ink.dark, 0.55);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.1);
  ctx.lineTo(-r * 0.2, -r * 0.5);
  ctx.stroke();
}

/** 宝箱：圆盖 + 两道箍 + 锁。稀有掉落的通用形，配上柔光很难错过。 */
function drawChest(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 1.8;
  const h = r * 1.2;
  roundRect(ctx, -w / 2, -h * 0.18, w, h * 0.78, 2);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.4);

  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.16);
  ctx.quadraticCurveTo(0, -h * 0.92, w / 2, -h * 0.16);
  ctx.closePath();
  ctx.fillStyle = mixHex(ink.tint, "#ffffff", 0.16);
  ctx.fill();
  rim(ctx, ink, 1.4);

  ctx.strokeStyle = ink.accent;
  ctx.lineWidth = 2;
  for (const x of [-w * 0.26, w * 0.26]) {
    ctx.beginPath();
    ctx.moveTo(x, -h * 0.66);
    ctx.lineTo(x, h * 0.58);
    ctx.stroke();
  }
  ctx.fillStyle = ink.accent;
  roundRect(ctx, -3, -h * 0.28, 6, 6.5, 1.4);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ink.dark, 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 油布：叠起来的一块布，一角翻着，边上一个铜扣眼。软边，和板条箱不撞。 */
function drawSheet(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 1.82;
  const h = r * 1.36;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.3);
  ctx.quadraticCurveTo(-w * 0.4, -h * 0.56, -w * 0.04, -h * 0.48);
  ctx.quadraticCurveTo(w * 0.3, -h * 0.42, w / 2, -h * 0.18);
  ctx.quadraticCurveTo(w * 0.44, h * 0.3, w * 0.18, h * 0.5);
  ctx.quadraticCurveTo(-w * 0.2, h * 0.58, -w * 0.44, h * 0.3);
  ctx.closePath();
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.3);

  // 翻起来的一角
  poly(ctx, [
    [-w * 0.44, h * 0.3],
    [-w * 0.08, h * 0.14],
    [-w * 0.14, h * 0.54],
  ]);
  ctx.fillStyle = mixHex(ink.tint, "#ffffff", 0.32);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ink.dark, 0.6);
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // 折痕
  ctx.strokeStyle = withAlpha(ink.dark, 0.45);
  ctx.lineWidth = 1.1;
  for (const k of [-0.16, 0.14]) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.36, h * k);
    ctx.quadraticCurveTo(0, h * (k + 0.12), w * 0.4, h * (k - 0.04));
    ctx.stroke();
  }

  // 铜扣眼：布上有个孔，这块才是「油布」不是「一坨颜色」
  ctx.strokeStyle = ink.accent;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(w * 0.28, -h * 0.22, r * 0.14, 0, Math.PI * 2);
  ctx.stroke();
}

/** 鱼干：尖头 + 燕尾。海面上唯一一个「有头有尾」的轮廓。 */
function drawFish(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 1.95;
  const h = r * 0.92;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.quadraticCurveTo(w * 0.1, -h * 0.66, -w * 0.2, -h * 0.34);
  ctx.lineTo(-w * 0.5, -h * 0.54);
  ctx.lineTo(-w * 0.34, 0);
  ctx.lineTo(-w * 0.5, h * 0.54);
  ctx.lineTo(-w * 0.2, h * 0.34);
  ctx.quadraticCurveTo(w * 0.1, h * 0.66, w * 0.5, 0);
  ctx.closePath();
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.3);

  // 鳃 + 眼
  ctx.strokeStyle = withAlpha(ink.dark, 0.7);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, -h * 0.3);
  ctx.quadraticCurveTo(w * 0.08, 0, w * 0.2, h * 0.3);
  ctx.stroke();
  ctx.fillStyle = ink.dark;
  ctx.beginPath();
  ctx.arc(w * 0.33, -h * 0.1, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // 晾晒划的口子：一条鱼干，不是一条活鱼
  ctx.strokeStyle = withAlpha(ink.dark, 0.45);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const x = -w * 0.12 + i * w * 0.14;
    ctx.beginPath();
    ctx.moveTo(x, -h * 0.24);
    ctx.lineTo(x - 2, h * 0.24);
    ctx.stroke();
  }
  ctx.fillStyle = gloss(0.22);
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.22, w * 0.2, h * 0.1, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** 鱼钩：一个 J。细长的钩身在小尺寸也认得出，靠的是描两遍边。 */
function drawHook(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? ink.dark : ink.tint;
    ctx.lineWidth = pass === 0 ? 4.6 : 2.6;
    ctx.beginPath();
    ctx.moveTo(r * 0.32, -r * 0.86);
    ctx.lineTo(r * 0.32, r * 0.2);
    ctx.arc(r * 0.32 - r * 0.36, r * 0.2, r * 0.36, 0, Math.PI, false);
    ctx.lineTo(r * 0.32 - r * 0.72, -r * 0.14);
    ctx.stroke();
  }
  // 环眼
  ctx.strokeStyle = ink.tint;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(r * 0.32, -r * 0.92, r * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  // 倒刺
  ctx.strokeStyle = ink.accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(r * 0.32 - r * 0.72, -r * 0.14);
  ctx.lineTo(r * 0.32 - r * 0.34, r * 0.02);
  ctx.stroke();
}

/** 活扳手：斜着的柄 + 张开的钳口。那个缺口是它和所有铁片的分界。 */
function drawWrench(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  ctx.save();
  ctx.rotate(-0.62);
  const len = r * 1.5;
  const th = r * 0.32;

  roundRect(ctx, -len * 0.62, -th / 2, len, th, th / 2);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.2);

  // 钳口：上下两片长牙夹着一道缝。缝要够深够宽，不然缩小了就成了榔头
  const jx = len * 0.3;
  const lip = r * 0.24;
  const gap = r * 0.46;
  for (const sy of [-1, 1]) {
    const y = sy < 0 ? -gap / 2 - lip : gap / 2;
    roundRect(ctx, jx, y, r * 0.76, lip, 1.6);
    ctx.fillStyle = ink.tint;
    ctx.fill();
    rim(ctx, ink, 1.1);
  }
  roundRect(ctx, jx, -gap / 2 - lip, r * 0.22, gap + lip * 2, 1.6);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.1);
  // 缝底压一道暗，开口才「凹」得进去
  ctx.fillStyle = withAlpha(ink.dark, 0.5);
  ctx.fillRect(jx + r * 0.22, -gap / 2, r * 0.2, gap);

  // 蜗轮的滚花
  ctx.strokeStyle = ink.accent;
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 3; i++) {
    const x = jx - r * 0.34 + i * r * 0.12;
    ctx.beginPath();
    ctx.moveTo(x, -th * 0.5);
    ctx.lineTo(x, th * 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = gloss(0.26);
  roundRect(ctx, -len * 0.56, -th * 0.42, len * 0.8, 1.8, 0.9);
  ctx.fill();
  ctx.restore();
}

/** 信号弹：短粗的管 + 顶盖 + 拉环。配上高饱和的珊瑚色，海面上最跳的一件。 */
function drawFlare(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk, time: number): void {
  const w = r * 0.9;
  const h = r * 1.7;
  roundRect(ctx, -w / 2, -h * 0.26, w, h * 0.76, w * 0.22);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.3);

  // 白箍：军械感，也帮着把管身和背景分开
  ctx.fillStyle = withAlpha("#ffffff", 0.7);
  for (const k of [0.02, 0.24]) {
    ctx.fillRect(-w / 2, h * k, w, 1.8);
  }

  // 顶盖 + 拉环
  ctx.fillStyle = ink.dark;
  roundRect(ctx, -w * 0.62, -h * 0.44, w * 1.24, h * 0.2, 2);
  ctx.fill();
  ctx.strokeStyle = ink.accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(w * 0.5, -h * 0.5, r * 0.18, 0, Math.PI * 2);
  ctx.stroke();

  // 顶上几点火星：不发光，只是一撮亮片，夜里也不刺眼
  ctx.fillStyle = withAlpha(ink.accent, 0.5 + Math.abs(Math.sin(time * 3)) * 0.4);
  for (let i = 0; i < 3; i++) {
    const a = -1.9 + i * 0.5;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.4, -h * 0.56 + Math.sin(a) * r * 0.16, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 铜罗盘：黄铜圈 + 暗表盘 + 一根红白指针。指针是它和齿轮、轮胎的分界。 */
function drawCompass(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk, time: number): void {
  const rad = r * 0.86;
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.5);

  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = mixHex(ink.dark, "#000000", 0.25);
  ctx.fill();

  // 方位刻度
  ctx.strokeStyle = withAlpha(ink.accent, 0.8);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const long = i % 2 === 0;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * rad * (long ? 0.46 : 0.58), Math.sin(a) * rad * (long ? 0.46 : 0.58));
    ctx.lineTo(Math.cos(a) * rad * 0.66, Math.sin(a) * rad * 0.66);
    ctx.stroke();
  }

  // 指针：卡过一次，所以只在原地轻轻晃
  const swingA = -Math.PI / 2 + Math.sin(time * 0.8) * 0.12;
  ctx.save();
  ctx.rotate(swingA);
  poly(ctx, [
    [0, -rad * 0.6],
    [rad * 0.16, 0],
    [-rad * 0.16, 0],
  ]);
  ctx.fillStyle = "#e0544e";
  ctx.fill();
  poly(ctx, [
    [0, rad * 0.6],
    [rad * 0.16, 0],
    [-rad * 0.16, 0],
  ]);
  ctx.fillStyle = "#f2ece0";
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = ink.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = gloss(0.4);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.86, Math.PI * 1.05, Math.PI * 1.55);
  ctx.stroke();
}

/** 急救包：白箱子 + 一个十字。全世界都认得的记号，缩到十像素也丢不了。 */
function drawMedkit(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 1.62;
  const h = r * 1.24;
  roundRect(ctx, -w / 2, -h * 0.36, w, h * 0.84, 2.6);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.4);

  // 提手
  ctx.strokeStyle = ink.dark;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.2, -h * 0.36);
  ctx.quadraticCurveTo(0, -h * 0.74, w * 0.2, -h * 0.36);
  ctx.stroke();

  // 十字
  const arm = r * 0.42;
  const bar = r * 0.16;
  ctx.fillStyle = ink.accent;
  ctx.fillRect(-bar / 2, h * 0.06 - arm / 2, bar, arm);
  ctx.fillRect(-arm / 2, h * 0.06 - bar / 2, arm, bar);

  // 搭扣
  ctx.fillStyle = withAlpha(ink.dark, 0.8);
  ctx.fillRect(-w * 0.42, h * 0.02, 3, 4.4);
  ctx.fillRect(w * 0.42 - 3, h * 0.02, 3, 4.4);
  ctx.fillStyle = gloss(0.22);
  ctx.fillRect(-w / 2 + 2.6, -h * 0.3, w - 5.2, 1.6);
}

/** 破渔网：一片软塌塌的网目 + 撕开那头垂下来的线头。菱形网眼是识别点。 */
function drawNet(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const w = r * 1.86;
  const h = r * 1.4;
  const patch = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.16);
    ctx.quadraticCurveTo(-w * 0.34, -h * 0.56, w * 0.02, -h * 0.44);
    ctx.quadraticCurveTo(w * 0.4, -h * 0.34, w * 0.5, -h * 0.02);
    ctx.quadraticCurveTo(w * 0.42, h * 0.32, w * 0.1, h * 0.4);
    ctx.quadraticCurveTo(-w * 0.28, h * 0.48, -w * 0.5, h * 0.14);
    ctx.closePath();
  };

  // 网片本身半透：底下的海水透得出来，一眼是「网」不是「布」
  patch();
  ctx.fillStyle = withAlpha(ink.tint, 0.3);
  ctx.fill();
  rim(ctx, ink, 1.3);

  // 网眼：两组 45° 斜线交出菱形格，剪到网片里。两组必须同粗同色——
  // 只描一组就成了斜纹布，菱形是「网」这个字的全部信息量
  ctx.save();
  patch();
  ctx.clip();
  const step = r * 0.46;
  const span = w + h;
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? withAlpha(ink.dark, 0.85) : withAlpha(ink.tint, 0.95);
    ctx.lineWidth = pass === 0 ? 2 : 0.9;
    for (let i = -5; i <= 5; i++) {
      const o = i * step;
      ctx.beginPath();
      ctx.moveTo(o - span, -span);
      ctx.lineTo(o + span, span);
      ctx.moveTo(o - span, span);
      ctx.lineTo(o + span, -span);
      ctx.stroke();
    }
  }
  // 网结：几个交点上鼓一个点，缩小到十来像素时靠这排点认出是网
  ctx.fillStyle = withAlpha(ink.dark, 0.9);
  for (let gx = -2; gx <= 2; gx++) {
    for (let gy = -1; gy <= 1; gy++) {
      ctx.beginPath();
      ctx.arc(gx * step * 2, gy * step * 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 撕开那头：三根散着的线头，轮廓下缘因此是毛的
  ctx.strokeStyle = ink.tint;
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const x = w * (0.02 + i * 0.15);
    ctx.beginPath();
    ctx.moveTo(x, h * 0.3);
    ctx.quadraticCurveTo(x + r * 0.2, h * 0.56, x - r * 0.08, h * 0.78);
    ctx.stroke();
  }

  // 上纲的两个浮子
  ctx.fillStyle = ink.accent;
  for (const k of [-0.26, 0.16]) {
    ctx.beginPath();
    ctx.ellipse(w * k, -h * 0.42, r * 0.17, r * 0.12, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 玻璃浮球：透光的球 + 罩在外面的绳网 + 顶上一个结。网格是它和浮标的分界。 */
function drawFloat(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk, time: number): void {
  const rad = r * 0.8;

  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(ink.tint, 0.66);
  ctx.fill();
  rim(ctx, ink, 1.3);

  // 球心亮一块：玻璃是通透的，不是一颗实心球
  const core = ctx.createRadialGradient(-rad * 0.3, -rad * 0.3, rad * 0.1, 0, 0, rad);
  core.addColorStop(0, withAlpha("#ffffff", 0.42));
  core.addColorStop(1, withAlpha(ink.tint, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fill();

  // 绳网：两道经线 + 三道纬线，勒在球面上
  ctx.strokeStyle = withAlpha(ink.accent, 0.95);
  ctx.lineWidth = 1.5;
  for (const rx of [rad * 0.36, rad]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, rad, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const k of [-0.44, 0.06, 0.52]) {
    const y = rad * k;
    const hw = Math.sqrt(Math.max(0, rad * rad - y * y));
    ctx.beginPath();
    ctx.ellipse(0, y, hw, hw * 0.24, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 顶上的结与两截绳头
  ctx.strokeStyle = ink.accent;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -rad * 1.14, r * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -rad * 1.24);
  ctx.lineTo(-r * 0.34, -rad * 1.5);
  ctx.moveTo(r * 0.12, -rad * 1.24);
  ctx.lineTo(r * 0.3, -rad * 1.46);
  ctx.stroke();

  // 高光：球面上慢慢挪的一小片，海面反光的意思
  ctx.fillStyle = gloss(0.34 + Math.abs(Math.sin(time * 1.2)) * 0.2);
  ctx.beginPath();
  ctx.ellipse(-rad * 0.36, -rad * 0.38, rad * 0.24, rad * 0.15, -0.7, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 未知包裹：还没配图的 id 落在这里。
 *
 * 画成一个捆着扎带的方包，中间一个问号记号——玩家一眼知道
 * 「这是件东西、可以捞、但还不认识」，比画个空白或者拿木板顶替强。
 */
function drawUnknown(ctx: CanvasRenderingContext2D, r: number, ink: ItemInk): void {
  const s = r * 1.5;
  roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.22);
  ctx.fillStyle = ink.tint;
  ctx.fill();
  rim(ctx, ink, 1.4);

  // 扎带走两边，中间腾给记号——十字压在记号上，两个都读不出来
  ctx.strokeStyle = withAlpha(ink.dark, 0.75);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-s / 2, -s * 0.3);
  ctx.lineTo(s / 2, -s * 0.3);
  ctx.moveTo(-s * 0.3, -s / 2);
  ctx.lineTo(-s * 0.3, s / 2);
  ctx.stroke();

  // 问号：弧 + 竖 + 点，全用路径画。`fillText` 的字体在不同机器上宽窄不一，
  // 一个只有十来像素的记号经不起这种漂移
  const cx = s * 0.1;
  const rad = s * 0.17;
  ctx.lineCap = "round";
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? withAlpha(ink.dark, 0.9) : ink.accent;
    ctx.lineWidth = pass === 0 ? 3.6 : 2;
    ctx.beginPath();
    ctx.arc(cx, -s * 0.1, rad, Math.PI * 1.1, Math.PI * 2.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + rad * 0.06, -s * 0.1 + rad * 0.98);
    ctx.lineTo(cx + rad * 0.06, s * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + rad * 0.06, s * 0.27, pass === 0 ? 1.9 : 1.2, 0, Math.PI * 2);
    ctx.strokeStyle = pass === 0 ? withAlpha(ink.dark, 0.9) : ink.accent;
    ctx.fillStyle = pass === 0 ? withAlpha(ink.dark, 0.9) : ink.accent;
    ctx.fill();
  }
}

/** 剪影库：`shape` 到画法的映射。 */
export const SILHOUETTES: Record<SilhouetteId, ItemDraw> = {
  plank: (ctx, r, ink) => drawPlank(ctx, r, ink),
  bottle: (ctx, r, ink, time) => drawBottle(ctx, r, ink, time),
  plate: (ctx, r, ink) => drawPlate(ctx, r, ink),
  coil: (ctx, r, ink) => drawCoil(ctx, r, ink),
  crate: (ctx, r, ink) => drawCrate(ctx, r, ink),
  drum: (ctx, r, ink) => drawDrum(ctx, r, ink),
  buoy: (ctx, r, ink, time) => drawBuoy(ctx, r, ink, time),
  tire: (ctx, r, ink) => drawTire(ctx, r, ink),
  sack: (ctx, r, ink) => drawSack(ctx, r, ink),
  canister: (ctx, r, ink) => drawCanister(ctx, r, ink),
  gear: (ctx, r, ink) => drawGear(ctx, r, ink),
  kelp: (ctx, r, ink, time) => drawKelp(ctx, r, ink, time),
  shard: (ctx, r, ink) => drawShard(ctx, r, ink),
  chest: (ctx, r, ink) => drawChest(ctx, r, ink),
  sheet: (ctx, r, ink) => drawSheet(ctx, r, ink),
  fish: (ctx, r, ink) => drawFish(ctx, r, ink),
  hook: (ctx, r, ink) => drawHook(ctx, r, ink),
  wrench: (ctx, r, ink) => drawWrench(ctx, r, ink),
  flare: (ctx, r, ink, time) => drawFlare(ctx, r, ink, time),
  compass: (ctx, r, ink, time) => drawCompass(ctx, r, ink, time),
  medkit: (ctx, r, ink) => drawMedkit(ctx, r, ink),
  net: (ctx, r, ink) => drawNet(ctx, r, ink),
  float: (ctx, r, ink, time) => drawFloat(ctx, r, ink, time),
  unknown: (ctx, r, ink) => drawUnknown(ctx, r, ink),
};

/* ------------------------------------------------------------------ *
 * 登记表
 * ------------------------------------------------------------------ */

/**
 * 目录里每件东西长什么样。
 *
 * 名字不在这儿写第二遍——`data/catalog.ts` 的 `ITEMS[id].name` 是唯一真源，
 * 登记时现取。这里只挑剪影、配颜色、定个头。
 *
 * 配图原则（按重要性排）：
 * 1. **轮廓先分开**：长横杠 / 高瘦带盖 / 带尖角的片 / 带尾巴的环 / 有头有尾
 *    的鱼 / 一个 J / 张着口的钳……夜里整屏压暗，只靠颜色的东西会糊成一团。
 * 2. 颜色**跨色相**铺开，并且躲开海水那段青蓝，否则远处看不见。
 * 3. 个头带信息：散装建材大（好捞），小工具小（看着就精贵）。
 *
 * `Partial` 是故意的：目录里加了新物品而这里还没配图，画出来是「未知包裹」，
 * 不会让构建挂掉——配图可以晚一步，但游戏不能等。
 */
export const CATALOG_ITEM_ART: Partial<Record<ItemId, Omit<ItemArtSpec, "id" | "label">>> = {
  wood: { shape: "plank", tint: "#c08b52", dark: "#5d3717", accent: "#e6c08a", r: 16 },
  plastic: { shape: "bottle", tint: "#9fe6ff", dark: "#2f6e8a", accent: "#ff7a5c", r: 13 },
  metal: { shape: "plate", tint: "#b9c4cc", dark: "#4a555e", accent: "#a4552b", r: 14.5 },
  rope: { shape: "coil", tint: "#e0c48a", dark: "#7a5b28", accent: "#b8894a", r: 12.5 },
  tarp: { shape: "sheet", tint: "#5f9573", dark: "#274536", accent: "#e2c98f", r: 15 },
  barrel: { shape: "drum", tint: "#b4653e", dark: "#4d2413", accent: "#f0bd7a", r: 15 },
  kelp: { shape: "kelp", tint: "#3f9e72", dark: "#14402d", accent: "#d3ee9c", r: 14 },
  driedFish: { shape: "fish", tint: "#d6b295", dark: "#6b4630", accent: "#ffe3c4", r: 13.5 },
  freshWater: { shape: "sack", tint: "#5ec8f0", dark: "#155f7d", accent: "#ffffff", r: 13 },
  hook: { shape: "hook", tint: "#cfd8de", dark: "#4a555e", accent: "#ff8a5c", r: 11.5 },
  wrench: { shape: "wrench", tint: "#9aa7ae", dark: "#3d474e", accent: "#ffcf5c", r: 13 },
  flare: { shape: "flare", tint: "#ff7043", dark: "#6d1f0d", accent: "#ffe08a", r: 12, rare: 2 },
  compass: { shape: "compass", tint: "#d4a53c", dark: "#5c3f10", accent: "#f7e7bd", r: 12.5, rare: 3 },
  medkit: { shape: "medkit", tint: "#eef1ef", dark: "#5a6a66", accent: "#e4574f", r: 13 },
};

/**
 * 只在海面上出现、目录里（还）没有的外观。
 *
 * `world/junk.ts` 的换装表能穿任何**登记过**的 id，不必是 `ItemId`：
 * 破渔网与玻璃浮球就是这种「只是长在海上的东西」——捞上来仍按
 * `Junk.kind` 入库（网→绳索、浮球→绳索），袋子里没有对应的格子。
 *
 * 哪天 `data/catalog.ts` 收编了它们，这里一行都不用改：目录那批先登记，
 * 本表后登记覆盖同 id 的画法，名字则改从 `ITEMS` 现取（见 `driftLabel`），
 * 中文名仍然只在目录里写一次。
 */
export const DRIFT_ITEM_ART: readonly (ItemArtSpec & { label: string })[] = [
  {
    id: "netScrap",
    label: "破渔网",
    shape: "net",
    tint: "#e0904e",
    dark: "#6b3517",
    accent: "#f6dca6",
    r: 15,
  },
  {
    id: "glassFloat",
    label: "玻璃浮球",
    shape: "float",
    tint: "#a8e6cf",
    dark: "#2a6b58",
    accent: "#dcbe84",
    r: 12.5,
    rare: 1,
  },
];

/** 目录收编过的 id 用目录里的中文名，没收编的用本地名。名字不写第二遍。 */
function driftLabel(id: string, fallback: string): string {
  return (ITEMS as Record<string, { name: string } | undefined>)[id]?.name ?? fallback;
}

/**
 * 启动时全量登记的外观：先目录（名字取自 `ITEMS`），再海面专有的那几件。
 * 顺序有意义——后到的覆盖先到的。
 */
export const BASE_ITEM_ARTS: readonly ItemArtSpec[] = [
  ...ITEM_IDS.map((id) => ({
    id,
    label: ITEMS[id].name,
    ...(CATALOG_ITEM_ART[id] ?? {}),
  })),
  ...DRIFT_ITEM_ART.map((spec) => ({ ...spec, label: driftLabel(spec.id, spec.label) })),
];

const registry = new Map<string, ItemArt>();
/** 未登记 id 的兜底外观缓存：同一个 id 每帧必须画得一模一样。 */
const fallbacks = new Map<string, ItemArt>();

function normalize(spec: ItemArtSpec): ItemArt {
  const tint = spec.tint ?? autoTint(spec.id);
  return {
    id: spec.id,
    label: spec.label ?? spec.id,
    shape: spec.shape ?? "unknown",
    tint,
    dark: spec.dark ?? mixHex(tint, "#07131c", 0.55),
    accent: spec.accent ?? mixHex(tint, "#ffffff", 0.45),
    r: spec.r ?? 13,
    rare: Math.max(0, Math.min(3, Math.round(spec.rare ?? 0))),
    draw: spec.draw ?? null,
  };
}

/** 登记一件物品的外观；同 id 后到的覆盖先到的（目录热改也不用重启）。 */
export function registerItemArt(spec: ItemArtSpec): ItemArt {
  const art = normalize(spec);
  registry.set(art.id, art);
  fallbacks.delete(art.id);
  return art;
}

export function registerItemArts(specs: Iterable<ItemArtSpec>): void {
  for (const spec of specs) registerItemArt(spec);
}

/** 这个 id 有人配过图吗（图鉴可以据此显示「未鉴定」）。 */
export function hasItemArt(id: string): boolean {
  return registry.has(id);
}

/** 已登记的 id，按登记顺序。 */
export function itemArtIds(): string[] {
  return [...registry.keys()];
}

/**
 * 取外观。未登记的 id **不会返回 null**：给一件散列配色的「未知包裹」，
 * 目录晚一步到位也不会画出空白或者报错。
 */
export function itemArt(id: string): ItemArt {
  const hit = registry.get(id);
  if (hit) return hit;
  const cached = fallbacks.get(id);
  if (cached) return cached;
  const made = normalize({ id, shape: "unknown" });
  fallbacks.set(id, made);
  return made;
}

/** 清回目录自带的那批（单测用；正常运行时用不上）。 */
export function resetItemArt(): void {
  registry.clear();
  fallbacks.clear();
  registerItemArts(BASE_ITEM_ARTS);
}

resetItemArt();

/* ------------------------------------------------------------------ *
 * 绘制入口
 * ------------------------------------------------------------------ */

/** 稀有物的柔光：≥2 才有，画在本体底下，越稀有越亮。 */
function rareGlow(ctx: CanvasRenderingContext2D, art: ItemArt, r: number, time: number): void {
  if (art.rare < 2) return;
  const pulse = 0.5 + Math.sin(time * 2.4) * 0.5;
  const reach = r * (1.7 + art.rare * 0.12);
  const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, reach);
  g.addColorStop(0, withAlpha(art.accent, 0.1 + art.rare * 0.05 + pulse * 0.06));
  g.addColorStop(1, withAlpha(art.accent, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, reach, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 画本体，**原点局部坐标**：调用方负责平移、旋转、缩放与透明度。
 * 漂浮物走 `world/junk.ts`，图鉴/背包一类的静态图标走 `drawItemIcon`。
 */
export function drawItemBody(
  ctx: CanvasRenderingContext2D,
  art: ItemArt,
  r: number = art.r,
  time = 0,
): void {
  const ink: ItemInk = { tint: art.tint, dark: art.dark, accent: art.accent };
  ctx.save();
  rareGlow(ctx, art, r, time);
  (art.draw ?? SILHOUETTES[art.shape] ?? SILHOUETTES.unknown)(ctx, r, ink, time);
  ctx.restore();
}

/**
 * 一个静态图标：不摇不晃，只在 (x, y) 画一件东西。
 * 图鉴、背包格、任务奖励预览都可以直接调，不必知道剪影库长什么样。
 */
export function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  r?: number,
  time = 0,
  angle = 0,
): void {
  const art = itemArt(id);
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  drawItemBody(ctx, art, r ?? art.r, time);
  ctx.restore();
}

/** 物品的中文名；没登记就退回 id。飘字与图鉴用。 */
export function itemLabel(id: string): string {
  return itemArt(id).label;
}

/** 物品的主色；粒子、飘字、图鉴边框统一从这里取，别各写各的十六进制。 */
export function itemTint(id: string): string {
  return itemArt(id).tint;
}

/** 稀有度 0–3，钳过。 */
export function itemRarity(id: string): number {
  return clamp01(itemArt(id).rare / 3) * 3;
}
