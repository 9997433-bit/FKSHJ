/**
 * 木筏 —— 格子甲板与六种结构的俯视绘制。
 *
 * 本模块**只画不管状态**：格子数据归 `sim/rules.ts`（`Raft` / `Cell`），
 * 网格几何也直接复用它的 `TILE` / `tileCenter` / `worldToTile`，
 * 所以渲染与判定永远落在同一个格子上——不存在「看着在这格、算在那格」。
 *
 * 依赖方向符合 ARCHITECTURE §1：渲染层只读 sim 暴露的状态，不回写。
 * 传进来的数组可以直接是 `allCells(raft)`，`Cell` 天然满足 `RaftCellView`。
 *
 * 视觉约定：
 * - 每格 64px，格与格之间留一条缝，看得出筏是一块块板拼的；
 * - 临水的边补浮木沿与白沫——玩家一眼看出筏的轮廓和能往哪长；
 * - 整筏随 `swayAt` 的涌浪场轻微摇摆，与漂浮物、小船同相。
 */

import { progressOf } from "../sim/economy";
import { BUILDINGS, NEIGHBOR4, TILE, cellKey, tileCenter, worldToTile, type BuildingId } from "../sim/rules";
import { swayAt, withAlpha, type SeaPalette } from "./ocean";

export { TILE, tileCenter, worldToTile };

/** 结构主色：幽灵预览、HUD 图标、选中描边共用。 */
export const STRUCTURE_TINT: Record<BuildingId, string> = {
  core: "#ffd166",
  floor: "#c08b52",
  collector: "#7cf7ff",
  purifier: "#8ee6ff",
  fish: "#9be86b",
  turret: "#ff8a5c",
};

/**
 * 绘制需要的格子信息。`sim` 的 `Cell` 直接满足它；
 * 除坐标与种类外全部可选，纯装饰字段没有就取默认。
 */
export type RaftCellView = {
  gx: number;
  gy: number;
  id: BuildingId;
  /** 当前血量；不给按满血画（满血不显示血条） */
  hp?: number;
  /** 血量上限；不给读 `BUILDINGS[id].maxHp` */
  maxHp?: number;
  /** sim 的产出计时器；没给 `work01` 时用它折算进度环 */
  timer?: number;
  /** 0..1 生产进度，优先于 `timer` */
  work01?: number;
  /** 炮塔朝向（弧度，0 = 屏幕右）；不给就自己慢慢扫 */
  aim?: number;
  /** 受击闪白剩余秒数（炮塔用它当开火闪光） */
  flash?: number;
  /** 建成动画 0→1；不给按 1 */
  grow01?: number;
  /** 停机 / 断料：画淡 */
  off?: boolean;
};

export type RaftView = {
  /** 局内累计秒（loop 的 elapsed） */
  time: number;
  palette: SeaPalette;
  /** 建造预览：`ok` 由 sim 的 canPlace + canAfford 算好，绘制不重复判定 */
  ghost?: { gx: number; gy: number; id: BuildingId; ok: boolean } | null;
  /** 光标 / 悬停格 */
  cursor?: { gx: number; gy: number } | null;
  /** 0..1 危险提示：整筏描红边（风暴预警、海盗贴脸） */
  alert01?: number;
  /** 风暴预警落点：这些格子上闪红十字 */
  marks?: readonly { gx: number; gy: number }[];
};

/* ------------------------------------------------------------------ *
 * 网格几何
 * ------------------------------------------------------------------ */

/** 格子的屏幕矩形（左上角 + 边长）。`tileCenter` 给的是中心。 */
export function tileRect(gx: number, gy: number): { x: number; y: number; w: number; h: number } {
  const c = tileCenter(gx, gy);
  return { x: c.x - TILE / 2, y: c.y - TILE / 2, w: TILE, h: TILE };
}

/** 已建格子的重心（像素）。空筏回落到网格原点。 */
export function raftCentroid(cells: readonly RaftCellView[]): { x: number; y: number } {
  if (cells.length === 0) return tileCenter(0, 0);
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    const p = tileCenter(c.gx, c.gy);
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / cells.length, y: sy / cells.length };
}

/* ------------------------------------------------------------------ *
 * 绘制
 * ------------------------------------------------------------------ */

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function maxHpOf(c: RaftCellView): number {
  return c.maxHp ?? BUILDINGS[c.id].maxHp;
}

/** 生产进度：优先用调用方给的 `work01`，否则拿 sim 的 timer 折算。 */
function workOf(c: RaftCellView): number {
  if (c.work01 !== undefined) return clamp01(c.work01);
  if (c.timer === undefined) return 0;
  return progressOf({ gx: c.gx, gy: c.gy, id: c.id, hp: c.hp ?? 1, maxHp: maxHpOf(c), timer: c.timer });
}

/**
 * 画整张筏。分四趟：水下阴影 → 甲板 → 边沿 → 结构，
 * 分趟画是为了让邻格的白沫和结构不会被后画的甲板压掉一角。
 *
 * 整筏随涌浪摇摆：一次 translate + rotate 作用于所有格子，
 * 所以筏是一整块在动，而不是一堆各晃各的板。
 */
export function drawRaft(
  ctx: CanvasRenderingContext2D,
  cells: readonly RaftCellView[],
  view: RaftView,
): void {
  const centroid = raftCentroid(cells);
  const sway = swayAt(centroid.x, centroid.y, view.time, 1);
  const occupied = new Set<string>();
  for (const c of cells) occupied.add(cellKey(c.gx, c.gy));

  ctx.save();
  ctx.translate(centroid.x + sway.dx, centroid.y + sway.dy);
  ctx.rotate(sway.rot);
  ctx.translate(-centroid.x, -centroid.y);

  for (const c of cells) drawCellShadow(ctx, c);
  for (const c of cells) drawDeck(ctx, c, view);
  for (const c of cells) drawCellEdges(ctx, c, view, occupied);
  for (const c of cells) {
    if (c.id !== "floor") drawStructure(ctx, c, view, occupied);
    drawHpBar(ctx, c, view);
  }

  const alert = clamp01(view.alert01 ?? 0);
  if (alert > 0.01) {
    ctx.save();
    ctx.strokeStyle = view.palette.danger;
    ctx.globalAlpha = alert * (0.3 + Math.abs(Math.sin(view.time * 6)) * 0.5);
    ctx.lineWidth = 2.5;
    for (const c of cells) {
      const r = tileRect(c.gx, c.gy);
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
    ctx.restore();
  }

  if (view.marks) {
    for (const m of view.marks) drawStormMark(ctx, m.gx, m.gy, view);
  }
  if (view.cursor) drawTileCursor(ctx, view.cursor.gx, view.cursor.gy, view);
  if (view.ghost) drawGhost(ctx, view.ghost.gx, view.ghost.gy, view.ghost.id, view.ghost.ok, view);

  ctx.restore();
}

/**
 * 水下的暗块：让筏看起来是浮着的、有厚度。
 *
 * 铺满整格再外扩一点，顺带把相邻两格之间的板缝垫成暗色——
 * 不垫的话缝里透出来的是亮海蓝，整张筏会被切成一块块贴纸。
 */
function drawCellShadow(ctx: CanvasRenderingContext2D, c: RaftCellView): void {
  const r = tileRect(c.gx, c.gy);
  const grow = clamp01(c.grow01 ?? 1);
  ctx.save();
  ctx.translate(r.x + TILE / 2, r.y + TILE / 2);
  ctx.scale(0.55 + grow * 0.45, 0.55 + grow * 0.45);
  ctx.globalAlpha = (0.2 + grow * 0.8) * 0.42;
  ctx.fillStyle = "#02121e";
  ctx.fillRect(-TILE / 2 - 2.5, -TILE / 2 - 2.5, TILE + 5, TILE + 5);
  ctx.globalAlpha = (0.2 + grow * 0.8) * 0.26;
  ctx.fillRect(-TILE / 2 - 2, -TILE / 2 + 5, TILE + 4, TILE + 3);
  ctx.restore();
}

/** 一格甲板：木色 + 板缝 + 受光 + 破损裂纹。 */
function drawDeck(ctx: CanvasRenderingContext2D, c: RaftCellView, view: RaftView): void {
  const rect = tileRect(c.gx, c.gy);
  const grow = clamp01(c.grow01 ?? 1);
  const seed = c.gx * 13.7 + c.gy * 7.1;
  const inset = 1.5;
  const size = TILE - inset * 2;

  ctx.save();
  ctx.translate(rect.x + TILE / 2, rect.y + TILE / 2);
  ctx.scale(0.55 + grow * 0.45, 0.55 + grow * 0.45);
  ctx.globalAlpha = 0.2 + grow * 0.8;
  ctx.translate(-TILE / 2, -TILE / 2);

  const shade = hash01(seed);
  ctx.fillStyle = shade < 0.34 ? "#b07c4b" : shade < 0.7 ? "#bd8850" : "#a9763f";
  ctx.fillRect(inset, inset, size, size);

  // 木纹方向逐格交错：拼出来的筏面才不像一张平铺贴图
  const across = (c.gx + c.gy) % 2 === 0;
  ctx.strokeStyle = "rgba(74, 44, 20, 0.5)";
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 4; i++) {
    const at = (TILE * i) / 4;
    ctx.beginPath();
    if (across) {
      ctx.moveTo(inset + 1, at);
      ctx.lineTo(TILE - inset - 1, at);
    } else {
      ctx.moveTo(at, inset + 1);
      ctx.lineTo(at, TILE - inset - 1);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 226, 178, 0.2)";
  ctx.fillRect(inset, inset, size, 2.5);
  ctx.fillStyle = "rgba(28, 16, 6, 0.3)";
  ctx.fillRect(inset, TILE - inset - 3, size, 3);

  const max = maxHpOf(c);
  const wear = 1 - clamp01((c.hp ?? max) / max);
  if (wear > 0.02) {
    ctx.lineCap = "round";
    for (let i = 0; i < Math.ceil(wear * 3); i++) {
      const x0 = 12 + hash01(seed + i * 3.3) * (TILE - 24);
      const y0 = 12 + hash01(seed + i * 5.9) * (TILE - 26);
      const lean = (hash01(seed + i) - 0.5) * 9;
      const crack = (dx: number, dy: number) => {
        ctx.beginPath();
        ctx.moveTo(x0 + dx, y0 + dy);
        ctx.lineTo(x0 + lean + dx, y0 + 6 + dy);
        ctx.lineTo(x0 + lean * 0.3 + dx, y0 + 12 + dy);
        ctx.stroke();
      };
      // 裂纹画两遍：暗的一遍是缝，错开一像素的亮线是被撬起来的木茬
      ctx.strokeStyle = `rgba(28, 12, 4, ${0.35 + wear * 0.45})`;
      ctx.lineWidth = 1.6;
      crack(0, 0);
      ctx.strokeStyle = `rgba(255, 226, 178, ${0.12 + wear * 0.16})`;
      ctx.lineWidth = 0.9;
      crack(1.4, -1.2);
    }
  }

  const flash = c.flash ?? 0;
  if (flash > 0) {
    ctx.globalAlpha = Math.min(0.7, flash * 3.4);
    ctx.fillStyle = view.palette.danger;
    ctx.fillRect(inset, inset, size, size);
  }
  ctx.restore();
}

/**
 * 边沿：朝海的边补浮木与白沫，朝邻格的边打一个绳结。
 * 这一趟画完，筏的轮廓与「哪几块连在一起」就都读得出来了。
 */
function drawCellEdges(
  ctx: CanvasRenderingContext2D,
  c: RaftCellView,
  view: RaftView,
  occupied: ReadonlySet<string>,
): void {
  if (clamp01(c.grow01 ?? 1) < 0.6) return;
  const rect = tileRect(c.gx, c.gy);

  ctx.save();
  for (const d of NEIGHBOR4) {
    const horizontal = d.gy !== 0;
    const ax = horizontal ? rect.x : rect.x + (d.gx > 0 ? TILE : 0);
    const ay = horizontal ? rect.y + (d.gy > 0 ? TILE : 0) : rect.y;
    const bx = horizontal ? rect.x + TILE : ax;
    const by = horizontal ? ay : rect.y + TILE;

    if (occupied.has(cellKey(c.gx + d.gx, c.gy + d.gy))) {
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      ctx.strokeStyle = "#d9c08a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(mx - 7, my - 3.5);
        ctx.lineTo(mx + 7, my + 3.5);
        ctx.moveTo(mx + 7, my - 3.5);
        ctx.lineTo(mx - 7, my + 3.5);
      } else {
        ctx.moveTo(mx - 3.5, my - 7);
        ctx.lineTo(mx + 3.5, my + 7);
        ctx.moveTo(mx + 3.5, my - 7);
        ctx.lineTo(mx - 3.5, my + 7);
      }
      ctx.stroke();
      continue;
    }

    // 临水：一条浮木沿 + 一条会呼吸的白沫
    ctx.strokeStyle = "#7d5327";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // 白沫拆成一段段抖动的短弧：连成一条直线会像蓝图描边，不像拍在木头上的浪
    const pulse = 0.3 + Math.abs(Math.sin(view.time * 2 + c.gx * 0.7 + c.gy * 1.3)) * 0.35;
    const seed = c.gx * 3.1 + c.gy * 5.7 + d.gx * 1.9 + d.gy * 2.3;
    ctx.lineCap = "round";
    const segments = 4;
    for (let k = 0; k < segments; k++) {
      const bubble = Math.abs(Math.sin(view.time * 1.7 + seed + k * 1.6));
      if (bubble < 0.3) continue;
      // 每段的起点、长度都错开，白沫才像浪打上来而不是一圈虚线框
      const jitter = hash01(seed + k * 2.7);
      const head = (k + 0.08 + jitter * 0.34) / segments;
      const span = (0.24 + bubble * 0.32) / segments;
      ctx.strokeStyle = withAlpha(view.palette.foam, pulse * (0.35 + bubble * 0.5));
      ctx.lineWidth = 1.6 + bubble * 1.4;
      ctx.beginPath();
      for (let s = 0; s <= 3; s++) {
        const u = head + span * (s / 3);
        const wob = Math.sin(view.time * 3 + u * 7 + seed) * 1.5;
        const out = 0.8 + bubble * 1.8;
        const px = ax + (bx - ax) * u + (horizontal ? wob : d.gx * out);
        const py = ay + (by - ay) * u + (horizontal ? d.gy * out : wob);
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 一格结构。原点搬到格心，各结构在 ±32px 里画。 */
function drawStructure(
  ctx: CanvasRenderingContext2D,
  c: RaftCellView,
  view: RaftView,
  occupied: ReadonlySet<string>,
): void {
  const center = tileCenter(c.gx, c.gy);
  const grow = clamp01(c.grow01 ?? 1);
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(0.5 + grow * 0.5, 0.5 + grow * 0.5);
  ctx.globalAlpha = 0.35 + grow * 0.65;
  if (c.off) ctx.globalAlpha *= 0.55;

  switch (c.id) {
    case "core":
      drawCore(ctx, view);
      break;
    case "collector":
      drawCollector(ctx, c, view);
      break;
    case "purifier":
      drawPurifier(ctx, c, view);
      break;
    case "fish":
      drawFish(ctx, c, view, outwardDir(c, occupied));
      break;
    case "turret":
      drawTurret(ctx, c, view);
      break;
    default:
      break;
  }
  ctx.restore();
}

/** 这一格朝海的方向（弧度）：四邻里没有筏的方向的合矢量。 */
function outwardDir(c: RaftCellView, occupied: ReadonlySet<string>): number {
  let vx = 0;
  let vy = 0;
  for (const d of NEIGHBOR4) {
    if (occupied.has(cellKey(c.gx + d.gx, c.gy + d.gy))) continue;
    vx += d.gx;
    vy += d.gy;
  }
  if (vx === 0 && vy === 0) return Math.PI / 2;
  return Math.atan2(vy, vx);
}

/** 指挥中心：俯视是屋顶、屋脊、天窗、烟囱、旗与天线灯。 */
function drawCore(ctx: CanvasRenderingContext2D, view: RaftView): void {
  const r = 25;

  // 四坡屋顶（俯视经典画法：外框 + 四条对角脊线收到中间的平脊）
  ctx.fillStyle = "#4d3115";
  ctx.fillRect(-r - 3, -r - 3, (r + 3) * 2, (r + 3) * 2);
  ctx.fillStyle = "#2f7f7a";
  ctx.fillRect(-r, -r, r * 2, r * 2);

  const ridge = r * 0.34;
  ctx.fillStyle = "rgba(255, 248, 224, 0.26)";
  ctx.beginPath();
  ctx.moveTo(-r, -r);
  ctx.lineTo(r, -r);
  ctx.lineTo(ridge, -ridge);
  ctx.lineTo(-ridge, -ridge);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(4, 26, 30, 0.3)";
  ctx.beginPath();
  ctx.moveTo(-r, r);
  ctx.lineTo(r, r);
  ctx.lineTo(ridge, ridge);
  ctx.lineTo(-ridge, ridge);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(10, 40, 42, 0.55)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    ctx.moveTo(sx * r, sy * r);
    ctx.lineTo(sx * ridge, sy * ridge);
  }
  ctx.strokeRect(-ridge, -ridge, ridge * 2, ridge * 2);
  ctx.stroke();

  // 中间的天窗：夜里就是全筏最亮的一点
  const glow = 0.55 + Math.abs(Math.sin(view.time * 1.1)) * 0.4;
  ctx.fillStyle = withAlpha(STRUCTURE_TINT.core, glow);
  ctx.fillRect(-ridge + 2, -ridge + 2, ridge * 2 - 4, ridge * 2 - 4);
  ctx.strokeStyle = "rgba(40,24,10,0.7)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-ridge + 2, -ridge + 2, ridge * 2 - 4, ridge * 2 - 4);

  // 太阳能板 + 烟囱：两个一眼认得出「这里有人住」的小配件
  ctx.fillStyle = "#1d3a52";
  ctx.fillRect(-r + 4, r - 13, 16, 9);
  ctx.strokeStyle = "rgba(150, 200, 230, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r + 4, r - 8.5);
  ctx.lineTo(-r + 20, r - 8.5);
  ctx.stroke();
  ctx.fillStyle = "#42525a";
  ctx.fillRect(r - 14, r - 14, 9, 9);

  // 天线与闪灯
  ctx.strokeStyle = "#cfd8dd";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-r + 9, -r + 9);
  ctx.lineTo(-r + 3, -r + 3);
  ctx.stroke();
  ctx.fillStyle = Math.sin(view.time * 4) > 0 ? view.palette.danger : "rgba(120,40,50,0.75)";
  ctx.beginPath();
  ctx.arc(-r + 3, -r + 3, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // 旗
  const flag = Math.sin(view.time * 5) * 3.5;
  ctx.strokeStyle = "#a9763f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(r - 6, -r + 5);
  ctx.lineTo(r - 6, -r + 20);
  ctx.stroke();
  ctx.fillStyle = view.palette.accent;
  ctx.beginPath();
  ctx.moveTo(r - 6, -r + 5);
  ctx.lineTo(r - 6 + 13, -r + 9 + flag);
  ctx.lineTo(r - 6, -r + 13);
  ctx.closePath();
  ctx.fill();
}

/** 收集器：圆网 + 转动的网骨 + 网里的料堆（随进度长）。 */
function drawCollector(ctx: CanvasRenderingContext2D, c: RaftCellView, view: RaftView): void {
  const r = 22;
  ctx.fillStyle = "rgba(12, 34, 44, 0.6)";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = STRUCTURE_TINT.collector;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.rotate(view.time * 0.5);
  ctx.strokeStyle = withAlpha(STRUCTURE_TINT.collector, 0.5);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const fill = workOf(c);
  if (fill > 0.02) {
    ctx.fillStyle = "#c08b52";
    const n = 1 + Math.floor(fill * 4);
    for (let i = 0; i < n; i++) {
      const a = i * 1.9 + view.time * 0.3;
      ctx.save();
      ctx.translate(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
      ctx.rotate(a);
      ctx.fillRect(-6, -2, 12, 4);
      ctx.restore();
    }
  }
}

/** 净水机：桶 + 冷凝罩 + 环形水位表 + 蒸汽。 */
function drawPurifier(ctx: CanvasRenderingContext2D, c: RaftCellView, view: RaftView): void {
  const r = 19;
  ctx.fillStyle = "#39434a";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a99a3";
  ctx.beginPath();
  ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
  ctx.fill();
  // 冷凝罩：一块反光的玻璃盖，高光偏在左上
  ctx.fillStyle = "rgba(203, 245, 255, 0.55)";
  ctx.beginPath();
  ctx.arc(0, 0, r - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.beginPath();
  ctx.arc(-r * 0.28, -r * 0.28, r * 0.26, 0, Math.PI * 2);
  ctx.fill();

  const fill = workOf(c);
  ctx.strokeStyle = "rgba(6, 20, 28, 0.7)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = STRUCTURE_TINT.purifier;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
  ctx.stroke();

  ctx.strokeStyle = "#8792a0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(r - 7, 5);
  ctx.lineTo(r + 9, 12);
  ctx.stroke();

  ctx.fillStyle = view.palette.foam;
  for (let i = 0; i < 3; i++) {
    const u = ((view.time * 0.55 + i / 3) % 1 + 1) % 1;
    ctx.globalAlpha = (1 - u) * 0.3;
    ctx.beginPath();
    ctx.arc(Math.sin(u * 5 + i) * 6, -10 - u * 16, 3.5 + u * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 钓鱼台：台面 + 伸向海面的竿 + 随浪抖的浮标 + 台角的鱼获。 */
function drawFish(
  ctx: CanvasRenderingContext2D,
  c: RaftCellView,
  view: RaftView,
  dir: number,
): void {
  ctx.save();
  ctx.rotate(dir);

  // 栈桥：一块比甲板浅的台面 + 两道栏杆，跟脚下的地板区分开
  ctx.fillStyle = "#d9b070";
  ctx.fillRect(-18, -15, 32, 30);
  ctx.strokeStyle = "#5f3d1e";
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-18, -15, 32, 30);
  ctx.strokeStyle = "rgba(95, 61, 30, 0.75)";
  ctx.lineWidth = 2;
  for (const y of [-15, 15]) {
    ctx.beginPath();
    ctx.moveTo(-18, y);
    ctx.lineTo(14, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,244,214,0.35)";
  ctx.fillRect(-18, -15, 32, 3.5);

  // 鱼桶：装鱼获的地方，也是这格的辨识点
  ctx.fillStyle = "#6f8fa3";
  ctx.beginPath();
  ctx.arc(-9, 6, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3d5464";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const swing = Math.sin(view.time * 0.9) * 3;
  ctx.strokeStyle = "#e0c48a";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.quadraticCurveTo(18, -8, 38, -3 + swing);
  ctx.stroke();

  const bite = workOf(c) > 0.8 ? Math.sin(view.time * 16) * 3 : 0;
  const fx = 54;
  const fy = 8 + swing + bite;
  ctx.strokeStyle = "rgba(240, 248, 255, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(38, -3 + swing);
  ctx.lineTo(fx, fy);
  ctx.stroke();

  ctx.fillStyle = view.palette.danger;
  ctx.beginPath();
  ctx.arc(fx, fy, 4, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = view.palette.foam;
  ctx.beginPath();
  ctx.arc(fx, fy, 4, 0, Math.PI);
  ctx.fill();

  // 桶里的鱼：随进度多一条
  const caught = Math.floor(workOf(c) * 3);
  ctx.fillStyle = "#9be86b";
  for (let i = 0; i < caught; i++) {
    ctx.beginPath();
    ctx.ellipse(-12 + i * 3.4, 4 + i * 2, 4.5, 2.4, 0.4 + i * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 炮塔：沙袋底座 + 转台 + 炮管（朝 `aim`，没给就自己扫）+ 开火焰。 */
function drawTurret(ctx: CanvasRenderingContext2D, c: RaftCellView, view: RaftView): void {
  const r = 21;

  // 沙袋围一圈：小而密，围出一个清楚的圆，别糊成一坨
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? "#b39c78" : "#95805f";
    ctx.save();
    ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 转台：深色底盘 + 亮环，炮管压在上面才看得出层次
  ctx.fillStyle = "#2c3640";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#9aa7b3";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
  ctx.stroke();

  // 没有目标时慢慢扫海面，看起来像在警戒而不是卡死
  const aim = c.aim ?? Math.sin(view.time * 0.35 + c.gx * 1.7 + c.gy) * 0.9 - Math.PI / 2;
  ctx.save();
  ctx.rotate(aim);

  ctx.fillStyle = "#c3ccd6";
  ctx.strokeStyle = "#2c3640";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.rect(2, -4.5, 28, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = STRUCTURE_TINT.turret;
  ctx.beginPath();
  ctx.rect(26, -6, 7, 12);
  ctx.fill();
  ctx.stroke();

  // 弹箱压在转台尾部，配重也是造型
  ctx.fillStyle = "#6c5a3f";
  ctx.beginPath();
  ctx.rect(-14, -6, 11, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#8a97a4";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const flash = c.flash ?? 0;
  if (flash > 0.02) {
    ctx.globalAlpha = Math.min(1, flash * 6);
    ctx.fillStyle = view.palette.accent;
    ctx.beginPath();
    ctx.moveTo(33, 0);
    ctx.lineTo(31, -8);
    ctx.lineTo(45, 0);
    ctx.lineTo(31, 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 血条：只在掉过血的格子上显示，满血不占画面。 */
function drawHpBar(ctx: CanvasRenderingContext2D, c: RaftCellView, view: RaftView): void {
  const max = maxHpOf(c);
  const hp = c.hp ?? max;
  if (hp >= max) return;
  const rect = tileRect(c.gx, c.gy);
  const w = TILE - 16;
  const x = rect.x + 8;
  const y = rect.y + TILE - 7;
  const f = clamp01(hp / max);
  ctx.save();
  ctx.fillStyle = "rgba(6, 16, 24, 0.75)";
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = f < 0.34 ? view.palette.danger : f < 0.67 ? "#ffb703" : view.palette.accent;
  ctx.fillRect(x, y, w * f, 4);
  ctx.restore();
}

/** 风暴预警落点：闪着的红十字，告诉玩家这几格要挨打。 */
export function drawStormMark(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  view: RaftView,
): void {
  const c = tileCenter(gx, gy);
  const pulse = 0.4 + Math.abs(Math.sin(view.time * 8)) * 0.6;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = view.palette.danger;
  ctx.lineWidth = 3;
  const r = TILE * 0.3;
  ctx.beginPath();
  ctx.moveTo(c.x - r, c.y - r);
  ctx.lineTo(c.x + r, c.y + r);
  ctx.moveTo(c.x + r, c.y - r);
  ctx.lineTo(c.x - r, c.y + r);
  ctx.stroke();
  ctx.globalAlpha = pulse * 0.5;
  ctx.strokeRect(c.x - TILE / 2 + 2, c.y - TILE / 2 + 2, TILE - 4, TILE - 4);
  ctx.restore();
}

/** 光标：一圈虚线方框，标出当前格。 */
export function drawTileCursor(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  view: RaftView,
): void {
  const r = tileRect(gx, gy);
  ctx.save();
  ctx.strokeStyle = view.palette.ink;
  ctx.globalAlpha = 0.45 + Math.abs(Math.sin(view.time * 3)) * 0.4;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.restore();
}

/**
 * 建造预览：半透明的目标结构 + 能不能建的底色。
 * `ok` 由 sim 算（网格合法 + 邻接 + 买得起），绘制不重复判定，只管表现。
 */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  id: BuildingId,
  ok: boolean,
  view: RaftView,
): void {
  const rect = tileRect(gx, gy);
  const tint = ok ? STRUCTURE_TINT[id] : view.palette.danger;
  ctx.save();
  ctx.globalAlpha = 0.26 + Math.abs(Math.sin(view.time * 4)) * 0.12;
  ctx.fillStyle = tint;
  ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  ctx.setLineDash([]);

  if (id !== "floor") {
    ctx.globalAlpha = 0.5;
    drawStructure(ctx, { gx, gy, id, work01: 0.5 }, view, new Set([cellKey(gx, gy)]));
  }
  ctx.restore();
}

/**
 * 可扩建的空位：沿现有筏面的四周画一圈虚格。
 * 建造模式下调用，玩家一眼看到筏能往哪长（对应 sim 的 `isAdjacentToRaft`）。
 */
export function drawBuildSlots(
  ctx: CanvasRenderingContext2D,
  cells: readonly RaftCellView[],
  view: RaftView,
): void {
  const occupied = new Set<string>();
  for (const c of cells) occupied.add(cellKey(c.gx, c.gy));
  const seen = new Set<string>();

  ctx.save();
  ctx.strokeStyle = view.palette.accent;
  ctx.globalAlpha = 0.2 + Math.abs(Math.sin(view.time * 2.4)) * 0.12;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 6]);
  for (const c of cells) {
    for (const d of NEIGHBOR4) {
      const gx = c.gx + d.gx;
      const gy = c.gy + d.gy;
      const key = cellKey(gx, gy);
      if (seen.has(key) || occupied.has(key)) continue;
      seen.add(key);
      const r = tileRect(gx, gy);
      ctx.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
    }
  }
  ctx.restore();
}
