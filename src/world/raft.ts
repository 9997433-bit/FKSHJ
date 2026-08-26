/**
 * 木筏 —— 建造网格上的地板与建筑，俯视绘制。
 *
 * 本模块**只画不管状态**：格子数据归 `sim/**`（opus-core），这里接受任何
 * 满足 `RaftTileView` 形状的只读数组，按 `TILE` 的网格几何摆到画布上。
 * 网格换算（`px = TILE.originX + gx * TILE.sizePx`）也一并导出，
 * 输入层要把鼠标位置换成格坐标时读 `tileAt`，不必自己重算一遍。
 *
 * 视觉约定：
 * - 每格 48px，格与格之间留 1px 缝，看得出是一块块板拼的；
 * - 临水的边补白沫与亮边——玩家一眼看出筏的轮廓在哪、还能往哪长；
 * - 整筏随 `swayAt` 的涌浪场轻微摇摆，与漂浮物、小船同相。
 */

import { TILE, type BuildingId, type StructureId } from "../data/constants";
import { swayAt, withAlpha, type SeaPalette } from "./ocean";

/** 一格边长（逻辑像素），等于 `TILE.sizePx`，绘制里到处要用，单独起个短名。 */
export const TILE_PX = TILE.sizePx;

/** 建筑中文名。HUD、提示、结算共用一份，别各写各的。 */
export const STRUCTURE_LABEL: Record<StructureId, string> = {
  hq: "指挥中心",
  floor: "木筏地板",
  collector: "收集器",
  purifier: "净水机",
  fish: "钓鱼台",
  turret: "炮塔",
};

/** 建筑主色：幽灵预览、HUD 图标、选中描边共用。 */
export const STRUCTURE_TINT: Record<StructureId, string> = {
  hq: "#ffd166",
  floor: "#c08b52",
  collector: "#7cf7ff",
  purifier: "#8ee6ff",
  fish: "#9be86b",
  turret: "#ff8a5c",
};

/** 快捷键提示（GAME_SPEC §3：1–5 选建筑）。 */
export const BUILD_HOTKEY: Record<BuildingId, string> = {
  floor: "1",
  collector: "2",
  purifier: "3",
  fish: "4",
  turret: "5",
};

/**
 * 绘制需要的格子信息。除了坐标与种类，其余都可选——
 * sim 只要给得出 `{ gx, gy, id }` 就能画，动画字段有就用、没有就取默认。
 */
export type RaftTileView = {
  gx: number;
  gy: number;
  id: StructureId;
  /** 当前血量；不给按满血画（满血不显示血条） */
  hp?: number;
  /** 血量上限；不给则读 `STRUCTURE_HP` */
  maxHp?: number;
  /** 0..1 生产进度：收集器的料堆、净水机的水位、钓鱼台的鱼漂 */
  work01?: number;
  /** 炮塔朝向（弧度，0 = 屏幕右） */
  aim?: number;
  /** 受击闪白剩余秒数（也当作炮塔的开火闪光） */
  flash?: number;
  /** 建成动画 0→1；不给按 1（已建好） */
  grow01?: number;
  /** 断料 / 停机：画成灰的 */
  off?: boolean;
};

export type RaftView = {
  /** 局内累计秒（loop 的 elapsed） */
  time: number;
  palette: SeaPalette;
  /** 建造预览 */
  ghost?: { gx: number; gy: number; id: BuildingId; ok: boolean } | null;
  /** 光标 / 悬停格 */
  cursor?: { gx: number; gy: number } | null;
  /** 0..1 危险提示：整筏描红边（风暴预警、海盗贴脸） */
  alert01?: number;
  /** 画出整片可建网格（建造模式） */
  showGrid?: boolean;
};

/* ------------------------------------------------------------------ *
 * 网格几何
 * ------------------------------------------------------------------ */

/** 格坐标 → 该格左上角的像素坐标。 */
export function tileOrigin(gx: number, gy: number): { x: number; y: number } {
  return { x: TILE.originX + gx * TILE_PX, y: TILE.originY + gy * TILE_PX };
}

/** 格坐标 → 格子中心像素。 */
export function tileCenter(gx: number, gy: number): { x: number; y: number } {
  const o = tileOrigin(gx, gy);
  return { x: o.x + TILE_PX / 2, y: o.y + TILE_PX / 2 };
}

/** 像素 → 格坐标（可能落在网格外，用 `inGrid` 判）。 */
export function tileAt(px: number, py: number): { gx: number; gy: number } {
  return {
    gx: Math.floor((px - TILE.originX) / TILE_PX),
    gy: Math.floor((py - TILE.originY) / TILE_PX),
  };
}

export function inGrid(gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < TILE.gridW && gy < TILE.gridH;
}

/** 整片可建区在画布上的矩形。 */
export function gridRect(): { x: number; y: number; w: number; h: number } {
  return {
    x: TILE.originX,
    y: TILE.originY,
    w: TILE.gridW * TILE_PX,
    h: TILE.gridH * TILE_PX,
  };
}

export function tileKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

/** 木筏中心（已建格子的重心），像素坐标。空筏回落到网格正中。 */
export function raftCentroid(tiles: readonly RaftTileView[]): { x: number; y: number } {
  if (tiles.length === 0) {
    const r = gridRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  let sx = 0;
  let sy = 0;
  for (const t of tiles) {
    const c = tileCenter(t.gx, t.gy);
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / tiles.length, y: sy / tiles.length };
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

/** 默认血量上限：`RaftTileView.maxHp` 没给时用它，避免每个调用点都填。 */
const DEFAULT_MAX_HP: Record<StructureId, number> = {
  hq: 40,
  floor: 10,
  collector: 12,
  purifier: 12,
  fish: 12,
  turret: 20,
};

const NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * 画整张筏。分四趟：水下阴影 → 甲板 → 临水边缘 → 建筑，
 * 分趟是为了让邻格的白沫与建筑不会被后画的甲板压掉一角。
 *
 * 整筏随涌浪摇摆：一次 translate + rotate 作用于所有格子，
 * 所以筏是一整块在动，而不是一堆各晃各的板子。
 */
export function drawRaft(
  ctx: CanvasRenderingContext2D,
  tiles: readonly RaftTileView[],
  view: RaftView,
): void {
  const centroid = raftCentroid(tiles);
  const sway = swayAt(centroid.x, centroid.y, view.time, 1);
  const occupied = new Set<string>();
  for (const t of tiles) occupied.add(tileKey(t.gx, t.gy));

  ctx.save();
  ctx.translate(centroid.x + sway.dx, centroid.y + sway.dy);
  ctx.rotate(sway.rot);
  ctx.translate(-centroid.x, -centroid.y);

  if (view.showGrid) drawBuildGrid(ctx, view);

  for (const t of tiles) drawTileShadow(ctx, t);
  for (const t of tiles) drawDeck(ctx, t, view);
  for (const t of tiles) drawTileEdges(ctx, t, view, occupied);
  for (const t of tiles) {
    if (t.id !== "floor") drawStructure(ctx, t, view, occupied);
    drawHpBar(ctx, t, view);
  }

  const alert = clamp01(view.alert01 ?? 0);
  if (alert > 0.01) {
    ctx.save();
    ctx.strokeStyle = view.palette.danger;
    ctx.globalAlpha = alert * (0.3 + Math.abs(Math.sin(view.time * 6)) * 0.5);
    ctx.lineWidth = 2.5;
    for (const t of tiles) {
      const o = tileOrigin(t.gx, t.gy);
      ctx.strokeRect(o.x + 1, o.y + 1, TILE_PX - 2, TILE_PX - 2);
    }
    ctx.restore();
  }

  if (view.cursor) drawTileCursor(ctx, view.cursor.gx, view.cursor.gy, view);
  if (view.ghost) drawGhost(ctx, view.ghost.gx, view.ghost.gy, view.ghost.id, view.ghost.ok, view);

  ctx.restore();
}

/** 水下的暗块：让筏看起来是浮在水上、有厚度的。 */
function drawTileShadow(ctx: CanvasRenderingContext2D, t: RaftTileView): void {
  const o = tileOrigin(t.gx, t.gy);
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#02121e";
  ctx.fillRect(o.x - 2, o.y + 3, TILE_PX + 4, TILE_PX + 3);
  ctx.restore();
}

/** 一格甲板：木色 + 板缝 + 磨损。 */
function drawDeck(ctx: CanvasRenderingContext2D, t: RaftTileView, view: RaftView): void {
  const o = tileOrigin(t.gx, t.gy);
  const grow = clamp01(t.grow01 ?? 1);
  const seed = t.gx * 13.7 + t.gy * 7.1;
  const inset = 1;

  ctx.save();
  ctx.translate(o.x + TILE_PX / 2, o.y + TILE_PX / 2);
  ctx.scale(0.55 + grow * 0.45, 0.55 + grow * 0.45);
  ctx.globalAlpha = 0.2 + grow * 0.8;
  ctx.translate(-TILE_PX / 2, -TILE_PX / 2);

  const shade = hash01(seed);
  ctx.fillStyle = shade < 0.34 ? "#b07c4b" : shade < 0.7 ? "#bd8850" : "#a9763f";
  ctx.fillRect(inset, inset, TILE_PX - inset * 2, TILE_PX - inset * 2);

  // 木纹方向逐格交错：拼出来的筏面才不像一张贴图
  const across = (t.gx + t.gy) % 2 === 0;
  ctx.strokeStyle = "rgba(74, 44, 20, 0.5)";
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 4; i++) {
    const at = (TILE_PX * i) / 4;
    ctx.beginPath();
    if (across) {
      ctx.moveTo(2, at);
      ctx.lineTo(TILE_PX - 2, at);
    } else {
      ctx.moveTo(at, 2);
      ctx.lineTo(at, TILE_PX - 2);
    }
    ctx.stroke();
  }

  // 顺光的一角 + 背光的一角，给平铺的甲板一点体积
  ctx.fillStyle = "rgba(255, 226, 178, 0.22)";
  ctx.fillRect(inset, inset, TILE_PX - inset * 2, 2);
  ctx.fillStyle = "rgba(28, 16, 6, 0.3)";
  ctx.fillRect(inset, TILE_PX - inset - 3, TILE_PX - inset * 2, 3);

  // 破损裂纹：血量越低越花
  const max = t.maxHp ?? DEFAULT_MAX_HP[t.id];
  const wear = 1 - clamp01((t.hp ?? max) / max);
  if (wear > 0.02) {
    ctx.strokeStyle = `rgba(28, 12, 4, ${0.3 + wear * 0.5})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < Math.ceil(wear * 3); i++) {
      const x0 = 8 + hash01(seed + i * 3.3) * (TILE_PX - 16);
      const y0 = 8 + hash01(seed + i * 5.9) * (TILE_PX - 16);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + 8 - hash01(seed + i) * 16, y0 + 7);
      ctx.lineTo(x0 + 13 - hash01(seed + i * 2) * 22, y0 + 14);
      ctx.stroke();
    }
  }

  if ((t.flash ?? 0) > 0) {
    ctx.globalAlpha = Math.min(0.75, (t.flash ?? 0) * 3.4);
    ctx.fillStyle = view.palette.danger;
    ctx.fillRect(inset, inset, TILE_PX - inset * 2, TILE_PX - inset * 2);
  }
  ctx.restore();
}

/**
 * 临水的边：白沫 + 亮边；朝着邻格的边：一道绳结。
 * 这一趟画完，筏的轮廓和「哪几块是连在一起的」就都读得出来了。
 */
function drawTileEdges(
  ctx: CanvasRenderingContext2D,
  t: RaftTileView,
  view: RaftView,
  occupied: ReadonlySet<string>,
): void {
  const o = tileOrigin(t.gx, t.gy);
  const grow = clamp01(t.grow01 ?? 1);
  if (grow < 0.6) return;

  ctx.save();
  for (const [dx, dy] of NEIGHBORS) {
    const linked = occupied.has(tileKey(t.gx + dx, t.gy + dy));
    // 这条边的两个端点
    const x0 = o.x + (dx > 0 ? TILE_PX : 0);
    const y0 = o.y + (dy > 0 ? TILE_PX : 0);
    const horizontal = dy !== 0;
    const ax = horizontal ? o.x : x0;
    const ay = horizontal ? y0 : o.y;
    const bx = horizontal ? o.x + TILE_PX : x0;
    const by = horizontal ? y0 : o.y + TILE_PX;

    if (linked) {
      // 绳结：把两格捆在一起
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      ctx.strokeStyle = "#d9c08a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(mx - 6, my - 3);
        ctx.lineTo(mx + 6, my + 3);
        ctx.moveTo(mx + 6, my - 3);
        ctx.lineTo(mx - 6, my + 3);
      } else {
        ctx.moveTo(mx - 3, my - 6);
        ctx.lineTo(mx + 3, my + 6);
        ctx.moveTo(mx + 3, my - 6);
        ctx.lineTo(mx - 3, my + 6);
      }
      ctx.stroke();
      continue;
    }

    // 临水：外沿一条浮木边 + 一条会呼吸的白沫
    ctx.strokeStyle = "#7d5327";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    const pulse = 0.35 + Math.abs(Math.sin(view.time * 2 + t.gx * 0.7 + t.gy * 1.3)) * 0.35;
    ctx.strokeStyle = withAlpha(view.palette.foam, pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      const px = ax + (bx - ax) * u + (horizontal ? 0 : dx * 3);
      const py = ay + (by - ay) * u + (horizontal ? dy * 3 : 0);
      const wob = Math.sin(view.time * 3 + u * 6 + t.gx + t.gy) * 1.6;
      if (k === 0) ctx.moveTo(px + (horizontal ? 0 : wob), py + (horizontal ? wob : 0));
      else ctx.lineTo(px + (horizontal ? 0 : wob), py + (horizontal ? wob : 0));
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** 一格建筑。原点搬到格子中心，各建筑自己在 ±24px 里画。 */
function drawStructure(
  ctx: CanvasRenderingContext2D,
  t: RaftTileView,
  view: RaftView,
  occupied: ReadonlySet<string>,
): void {
  const c = tileCenter(t.gx, t.gy);
  const grow = clamp01(t.grow01 ?? 1);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(0.5 + grow * 0.5, 0.5 + grow * 0.5);
  ctx.globalAlpha = 0.35 + grow * 0.65;
  if (t.off) ctx.globalAlpha *= 0.55;

  switch (t.id) {
    case "hq":
      drawHq(ctx, t, view);
      break;
    case "collector":
      drawCollector(ctx, t, view);
      break;
    case "purifier":
      drawPurifier(ctx, t, view);
      break;
    case "fish":
      drawFish(ctx, t, view, outwardDir(t, occupied));
      break;
    case "turret":
      drawTurret(ctx, t, view);
      break;
    default:
      break;
  }
  ctx.restore();
}

/** 这一格朝海的方向（弧度）：四邻里没有筏的那些方向的合矢量。 */
function outwardDir(t: RaftTileView, occupied: ReadonlySet<string>): number {
  let vx = 0;
  let vy = 0;
  for (const [dx, dy] of NEIGHBORS) {
    if (occupied.has(tileKey(t.gx + dx, t.gy + dy))) continue;
    vx += dx;
    vy += dy;
  }
  if (vx === 0 && vy === 0) return Math.PI / 2;
  return Math.atan2(vy, vx);
}

/** 指挥中心：俯视看到的是屋顶、屋脊、烟囱、旗与天线灯。 */
function drawHq(ctx: CanvasRenderingContext2D, t: RaftTileView, view: RaftView): void {
  const r = 19;
  ctx.fillStyle = "#6b4526";
  ctx.fillRect(-r - 2, -r - 2, (r + 2) * 2, (r + 2) * 2);
  ctx.fillStyle = "#5f7d8c";
  ctx.fillRect(-r, -r, r * 2, r * 2);

  // 屋脊 + 两坡的明暗
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(-r, -r, r * 2, r);
  ctx.strokeStyle = "#3d525c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();

  // 天窗：夜里透出暖光
  const glow = 0.5 + Math.abs(Math.sin(view.time * 1.1)) * 0.35;
  ctx.fillStyle = withAlpha(STRUCTURE_TINT.hq, glow);
  ctx.fillRect(-7, -12, 14, 8);
  ctx.strokeStyle = "rgba(40,24,10,0.7)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-7, -12, 14, 8);

  // 烟囱
  ctx.fillStyle = "#42525a";
  ctx.fillRect(r - 10, r - 12, 7, 7);

  // 天线与闪灯
  ctx.strokeStyle = "#cfd8dd";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-r + 6, -r + 6);
  ctx.lineTo(-r + 2, -r + 2);
  ctx.stroke();
  ctx.fillStyle = Math.sin(view.time * 4) > 0 ? view.palette.danger : "rgba(120,40,50,0.75)";
  ctx.beginPath();
  ctx.arc(-r + 2, -r + 2, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // 旗：绕着旗杆摆
  const flag = Math.sin(view.time * 5) * 3;
  ctx.strokeStyle = "#a9763f";
  ctx.beginPath();
  ctx.moveTo(r - 5, -r + 4);
  ctx.lineTo(r - 5, -r + 16);
  ctx.stroke();
  ctx.fillStyle = view.palette.accent;
  ctx.beginPath();
  ctx.moveTo(r - 5, -r + 4);
  ctx.lineTo(r - 5 + 11, -r + 7 + flag);
  ctx.lineTo(r - 5, -r + 11);
  ctx.closePath();
  ctx.fill();
  void t;
}

/** 收集器：圆网 + 十字网骨 + 网里的料堆（随 work01 长）。 */
function drawCollector(ctx: CanvasRenderingContext2D, t: RaftTileView, view: RaftView): void {
  const r = 17;
  const spin = view.time * 0.5;

  ctx.fillStyle = "rgba(12, 34, 44, 0.6)";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = STRUCTURE_TINT.collector;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.rotate(spin);
  ctx.strokeStyle = withAlpha(STRUCTURE_TINT.collector, 0.5);
  ctx.lineWidth = 1.1;
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

  // 网住的碎料
  const fill = clamp01(t.work01 ?? 0);
  if (fill > 0.02) {
    ctx.fillStyle = "#c08b52";
    const n = 1 + Math.floor(fill * 4);
    for (let i = 0; i < n; i++) {
      const a = i * 1.9 + view.time * 0.3;
      ctx.save();
      ctx.translate(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4);
      ctx.rotate(a);
      ctx.fillRect(-5, -1.8, 10, 3.6);
      ctx.restore();
    }
  }
}

/** 净水机：桶 + 环形水位表 + 冷凝罩 + 蒸汽。 */
function drawPurifier(ctx: CanvasRenderingContext2D, t: RaftTileView, view: RaftView): void {
  const r = 15;
  ctx.fillStyle = "#4b565d";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5d6b73";
  ctx.beginPath();
  ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
  ctx.fill();

  // 冷凝罩：一片压在桶上的玻璃
  ctx.fillStyle = "rgba(180, 240, 255, 0.28)";
  ctx.beginPath();
  ctx.arc(0, 0, r - 5, 0, Math.PI * 2);
  ctx.fill();

  // 环形水位表
  const fill = clamp01(t.work01 ?? 0);
  ctx.strokeStyle = "rgba(6, 20, 28, 0.65)";
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = STRUCTURE_TINT.purifier;
  ctx.beginPath();
  ctx.arc(0, 0, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
  ctx.stroke();

  // 出水管
  ctx.strokeStyle = "#8792a0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(r - 6, 4);
  ctx.lineTo(r + 8, 10);
  ctx.stroke();

  // 蒸汽
  ctx.fillStyle = view.palette.foam;
  for (let i = 0; i < 3; i++) {
    const u = ((view.time * 0.55 + i / 3) % 1 + 1) % 1;
    ctx.globalAlpha = (1 - u) * 0.3;
    ctx.beginPath();
    ctx.arc(Math.sin(u * 5 + i) * 5, -8 - u * 14, 3 + u * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 钓鱼台：栈桥 + 伸向海面的竿 + 浮标（浮标跟着涌浪抖）。 */
function drawFish(
  ctx: CanvasRenderingContext2D,
  t: RaftTileView,
  view: RaftView,
  dir: number,
): void {
  ctx.save();
  ctx.rotate(dir);

  // 台面
  ctx.fillStyle = "#8d5f36";
  ctx.fillRect(-14, -12, 24, 24);
  ctx.strokeStyle = "#5f3d1e";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-14, -12, 24, 24);
  ctx.fillStyle = "rgba(255,226,178,0.2)";
  ctx.fillRect(-14, -12, 24, 3);

  // 竿：从台面斜伸出去
  const swing = Math.sin(view.time * 0.9) * 2.5;
  ctx.strokeStyle = "#e0c48a";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-6, 6);
  ctx.quadraticCurveTo(14, -6, 30, -2 + swing);
  ctx.stroke();

  // 线与浮标：浮标落在筏外的水面上
  const bite = clamp01(t.work01 ?? 0) > 0.8 ? Math.sin(view.time * 16) * 2.5 : 0;
  const fx = 44;
  const fy = 6 + swing + bite;
  ctx.strokeStyle = "rgba(240, 248, 255, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, -2 + swing);
  ctx.lineTo(fx, fy);
  ctx.stroke();

  ctx.fillStyle = view.palette.danger;
  ctx.beginPath();
  ctx.arc(fx, fy, 3.4, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = view.palette.foam;
  ctx.beginPath();
  ctx.arc(fx, fy, 3.4, 0, Math.PI);
  ctx.fill();

  // 鱼获堆在台角
  const catchN = Math.floor(clamp01(t.work01 ?? 0) * 3);
  ctx.fillStyle = "#9be86b";
  for (let i = 0; i < catchN; i++) {
    ctx.beginPath();
    ctx.ellipse(-9 + i * 5, 8, 4, 2.2, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 炮塔：沙袋底座 + 转台 + 炮管（朝 `aim`）+ 开火焰。 */
function drawTurret(ctx: CanvasRenderingContext2D, t: RaftTileView, view: RaftView): void {
  const r = 15;
  ctx.fillStyle = "#6f6250";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, 7, 4.6, a, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#3f4952";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(t.aim ?? -Math.PI / 2);
  ctx.fillStyle = "#8792a0";
  ctx.fillRect(0, -4, 26, 8);
  ctx.fillStyle = STRUCTURE_TINT.turret;
  ctx.fillRect(21, -5, 6, 10);
  ctx.fillStyle = "#5b6672";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();

  const flash = t.flash ?? 0;
  if (flash > 0.02) {
    ctx.globalAlpha = Math.min(1, flash * 6);
    ctx.fillStyle = view.palette.accent;
    ctx.beginPath();
    ctx.moveTo(27, 0);
    ctx.lineTo(26, -7);
    ctx.lineTo(38, 0);
    ctx.lineTo(26, 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 血条：只在掉过血的格子上显示，满血不占画面。 */
function drawHpBar(ctx: CanvasRenderingContext2D, t: RaftTileView, view: RaftView): void {
  const max = t.maxHp ?? DEFAULT_MAX_HP[t.id];
  const hp = t.hp ?? max;
  if (hp >= max) return;
  const o = tileOrigin(t.gx, t.gy);
  const w = TILE_PX - 12;
  const x = o.x + 6;
  const y = o.y + TILE_PX - 6;
  const f = clamp01(hp / max);
  ctx.save();
  ctx.fillStyle = "rgba(6, 16, 24, 0.75)";
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = f < 0.34 ? view.palette.danger : f < 0.67 ? "#ffb703" : view.palette.accent;
  ctx.fillRect(x, y, w * f, 4);
  ctx.restore();
}

/** 可建区网格：建造模式下铺一层淡格线，玩家看得见能放到哪。 */
export function drawBuildGrid(ctx: CanvasRenderingContext2D, view: RaftView): void {
  const r = gridRect();
  ctx.save();
  ctx.strokeStyle = withAlpha(view.palette.ink, 0.12);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= TILE.gridW; gx++) {
    const x = r.x + gx * TILE_PX;
    ctx.moveTo(x, r.y);
    ctx.lineTo(x, r.y + r.h);
  }
  for (let gy = 0; gy <= TILE.gridH; gy++) {
    const y = r.y + gy * TILE_PX;
    ctx.moveTo(r.x, y);
    ctx.lineTo(r.x + r.w, y);
  }
  ctx.stroke();
  ctx.strokeStyle = withAlpha(view.palette.accent, 0.22);
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** 光标：一圈虚线方框，标出当前格。 */
export function drawTileCursor(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  view: RaftView,
): void {
  const o = tileOrigin(gx, gy);
  ctx.save();
  ctx.strokeStyle = view.palette.ink;
  ctx.globalAlpha = 0.45 + Math.abs(Math.sin(view.time * 3)) * 0.4;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(o.x + 1, o.y + 1, TILE_PX - 2, TILE_PX - 2);
  ctx.restore();
}

/**
 * 建造预览：半透明的目标建筑 + 能不能建的底色。
 * `ok` 由 sim 综合「网格内 / 邻接 / 库存」三条算出来（ARCHITECTURE §5.1），
 * 绘制不重复判定，只负责表现。
 */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  id: BuildingId,
  ok: boolean,
  view: RaftView,
): void {
  const o = tileOrigin(gx, gy);
  const tint = ok ? STRUCTURE_TINT[id] : view.palette.danger;
  ctx.save();
  ctx.globalAlpha = 0.26 + Math.abs(Math.sin(view.time * 4)) * 0.12;
  ctx.fillStyle = tint;
  ctx.fillRect(o.x + 1, o.y + 1, TILE_PX - 2, TILE_PX - 2);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(o.x + 1, o.y + 1, TILE_PX - 2, TILE_PX - 2);
  ctx.setLineDash([]);

  if (id !== "floor") {
    ctx.globalAlpha = 0.5;
    drawStructure(ctx, { gx, gy, id, work01: 0.5, grow01: 1 }, view, new Set([tileKey(gx, gy)]));
  }
  ctx.restore();
}
