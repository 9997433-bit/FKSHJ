/**
 * 物品外观 —— 漂浮物与道具「长什么样」的唯一登记处。
 *
 * 为什么单独一个模块：物品**目录**（名字、描述、用途、掉落）归
 * `data/catalog.ts`，那是玩法数据；这里只回答「画成什么」。目录还没到位
 * 的时候，海面照样有四种建材可捞；目录到了，`registerItemArt` 一行就能
 * 把新道具接上，不用回来改 `world/junk.ts` 的 switch。
 *
 * 三层结构，越往下越自由：
 *
 * 1. **剪影库** `SILHOUETTES`：十几种一眼分得开的外形（长木条 / 瓶子 /
 *    撕裂铁皮 / 绳卷 / 板条箱 / 油桶 / 浮标 / 轮胎 / 麻袋 / 提罐 / 齿轮 /
 *    海草 / 玻璃碴 / 宝箱 / 未知包裹）。每个都是 `(ctx, r, ink, time)`，
 *    画在**原点局部坐标**里，朝向、摇摆、淡出由调用方负责。
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
  unknown: (ctx, r, ink) => drawUnknown(ctx, r, ink),
};

/* ------------------------------------------------------------------ *
 * 登记表
 * ------------------------------------------------------------------ */

/**
 * 四种建材的外观。轮廓两两不同是硬要求：
 * 长横杠（木）/ 高瘦带盖（塑料）/ 带尖角的片（金属）/ 带尾巴的环（绳）。
 * 数值平衡在 `data/constants.ts` 的 SALVAGE，这里只管长什么样。
 */
export const BASE_ITEM_ARTS: readonly ItemArtSpec[] = [
  { id: "wood", label: "木板", shape: "plank", tint: "#c08b52", dark: "#5d3717", accent: "#e6c08a", r: 16 },
  { id: "plastic", label: "塑料", shape: "bottle", tint: "#9fe6ff", dark: "#2f6e8a", accent: "#ff7a5c", r: 13 },
  { id: "metal", label: "金属", shape: "plate", tint: "#b9c4cc", dark: "#4a555e", accent: "#a4552b", r: 14.5 },
  { id: "rope", label: "绳索", shape: "coil", tint: "#e0c48a", dark: "#7a5b28", accent: "#b8894a", r: 12.5 },
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

/** 清回四种建材（单测用；正常运行时用不上）。 */
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
