/**
 * 海面 —— 俯视视角的水、浪、焦散、沉没的城市，以及昼夜。
 *
 * 视角约定（ARCHITECTURE.md §4）：整局是**俯视**的 1280×720 逻辑画布，
 * 没有地平线、没有透视缩放；镜头正对海面，木筏铺在正中的建造网格上，
 * 小船与海盗在连续坐标里跑。所以本模块画的一切都是「从上往下看水」：
 * 波峰是沿洋流方向推的亮线，城市剪影沉在水面**之下**，隔着一层水看。
 *
 * 本模块无状态：所有函数都是 (ctx, 参数) → void 的纯绘制，时间一律由
 * 调用方传入 `elapsed`（暂停时不增长，见 loop 契约），
 * 因此同一时刻重画两次的结果逐像素相同。
 */

import { CANVAS, DAY } from "../data/constants";

/** 海面视觉参数。玩法数值在 data/constants.ts，这里只有纯装饰的量。 */
export const SEA = {
  /** 洋流方向（弧度）：波纹、泡沫、沉城视差都顺这个方向漂 */
  currentDir: Math.PI * 0.14,
  /** 洋流基准速度（逻辑像素/秒），与 SALVAGE.driftPxS 同量级才看得协调 */
  currentPxS: 14,
  /** 涌浪波长（px） */
  swellLen: 190,
  /** 涌浪推进（rad/s） */
  swellSpeed: 0.85,
  /** 细碎浪波长（px） */
  chopLen: 47,
  /** 细碎浪推进（rad/s） */
  chopSpeed: 2.1,
  /** 浮体随浪摆动的最大位移（px） */
  swayPx: 2.4,
  /** 浪纹条数 */
  crests: 26,
  /** 每条浪纹的采样段数 */
  crestSegs: 16,
} as const;

export type SeaPhaseId = "dawn" | "day" | "dusk" | "night";

/** 一套海的配色。只用 #rrggbb，`mixPalette` 才能无脑逐通道插值。 */
export type SeaPalette = {
  id: SeaPhaseId;
  /** 中文相位名，HUD 可直接显示 */
  name: string;
  /** 浅水（画面中心） */
  shallow: string;
  /** 深水（画面四周） */
  deep: string;
  /** 浪纹线条 */
  wave: string;
  /** 浪尖与水花的白 */
  foam: string;
  /** 水下焦散网 */
  caustic: string;
  /** 沉在水里的城市 */
  sunken: string;
  /** 天光的方向色（日光/月光斑） */
  glint: string;
  /** 前景文字 / 高对比线条 */
  ink: string;
  /** 强调色：可交互、可建造 */
  accent: string;
  /** 危险色：海盗、风暴、低耐久 */
  danger: string;
};

/**
 * 海面色板立法（质感，不是玩法）。
 *
 * 环境必须是「哑光的死水」：饱和度压在中低档，明度不过曝。
 * 高饱和只许出现在信息点——可建造、危险、夜里那盏灯——不能铺满整片海。
 * 白天禁止糖果青、夜里禁止荧光青绿；黄昏走锈铜与烟灰，不走品红汽水。
 */
export const SEA_PALETTES: Record<SeaPhaseId, SeaPalette> = {
  dawn: {
    id: "dawn",
    name: "黎明",
    shallow: "#3a6474",
    deep: "#122433",
    wave: "#8aa8b4",
    foam: "#efe4d4",
    caustic: "#7a9aa6",
    sunken: "#0d1c28",
    glint: "#d4a06a",
    ink: "#f0ece4",
    accent: "#d4a24a",
    danger: "#d46858",
  },
  day: {
    id: "day",
    name: "白昼",
    shallow: "#2d6a76",
    deep: "#0b2a38",
    wave: "#86b0b8",
    foam: "#e6eef0",
    caustic: "#5f8f9a",
    sunken: "#0a2230",
    glint: "#d8c07a",
    ink: "#eef2f0",
    accent: "#c9a24a",
    danger: "#d45c58",
  },
  dusk: {
    id: "dusk",
    name: "黄昏",
    shallow: "#5a4a58",
    deep: "#1a1224",
    wave: "#c48a6a",
    foam: "#f0d8c4",
    caustic: "#8a6a6e",
    sunken: "#120e1c",
    glint: "#c87848",
    ink: "#f4ece4",
    accent: "#c98a3a",
    danger: "#d45650",
  },
  night: {
    id: "night",
    name: "夜",
    shallow: "#163448",
    deep: "#040810",
    wave: "#4a6e86",
    foam: "#c4d4e4",
    caustic: "#3a5e72",
    sunken: "#02060c",
    glint: "#8aa4c4",
    ink: "#e0e8f0",
    accent: "#7ab4a8",
    danger: "#d46058",
  },
};

/** 夜的起点（相位）：DAY.nightFrac 说夜占一天的多少，倒推即可。 */
const NIGHT_AT = 1 - DAY.nightFrac;

/** 四个相位的过渡点。黄昏挤在入夜前，黎明贴着一天的开头。 */
const PHASE_STOPS: readonly { at: number; id: SeaPhaseId }[] = [
  { at: 0, id: "dawn" },
  { at: 0.12, id: "day" },
  { at: NIGHT_AT - 0.14, id: "dusk" },
  { at: NIGHT_AT, id: "night" },
  // 夜要压住整段 nightFrac，只在最后一小截泛起晨光；
  // 少了这个停靠点，夜刚落下就开始往黎明漂，「一整夜」根本看不到
  { at: 1 - DAY.nightFrac * 0.2, id: "night" },
  { at: 1, id: "dawn" },
];

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function smoothstep(t: number): number {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
}

function hex(c: string): [number, number, number] {
  const s = c.replace("#", "");
  const full = s.length === 3 ? s.split("").map((ch) => ch + ch).join("") : s;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 两个十六进制色之间线性插值。 */
export function mixHex(a: string, b: string, t: number): string {
  const k = clamp01(t);
  const ca = hex(a);
  const cb = hex(b);
  let out = "#";
  for (let i = 0; i < 3; i++) {
    out += Math.round(ca[i] + (cb[i] - ca[i]) * k).toString(16).padStart(2, "0");
  }
  return out;
}

/** 给十六进制色加 alpha，省得调用点手写 rgba 字面量。 */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = hex(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp01(alpha) * 1000) / 1000})`;
}

export function mixPalette(a: SeaPalette, b: SeaPalette, t: number): SeaPalette {
  const k = clamp01(t);
  const near = k < 0.5 ? a : b;
  return {
    id: near.id,
    name: near.name,
    shallow: mixHex(a.shallow, b.shallow, k),
    deep: mixHex(a.deep, b.deep, k),
    wave: mixHex(a.wave, b.wave, k),
    foam: mixHex(a.foam, b.foam, k),
    caustic: mixHex(a.caustic, b.caustic, k),
    sunken: mixHex(a.sunken, b.sunken, k),
    glint: mixHex(a.glint, b.glint, k),
    ink: mixHex(a.ink, b.ink, k),
    accent: mixHex(a.accent, b.accent, k),
    danger: mixHex(a.danger, b.danger, k),
  };
}

/* ------------------------------------------------------------------ *
 * 昼夜
 * ------------------------------------------------------------------ */

/** 局内秒 → 一天之内的相位 0..1（DAY.lengthS 一圈）。 */
export function dayPhase(elapsed: number): number {
  const t = (elapsed / DAY.lengthS) % 1;
  return t < 0 ? t + 1 : t;
}

/** 局内秒 → 第几天（从 1 开始）。结算面板要的「撑过几天」就是它。 */
export function dayNumber(elapsed: number): number {
  return Math.floor(Math.max(0, elapsed) / DAY.lengthS) + 1;
}

/** 现在是不是夜里（相位 ≥ 1 − DAY.nightFrac）。 */
export function isNight(elapsed: number): boolean {
  return dayPhase(elapsed) >= NIGHT_AT;
}

/** 夜色浓度 0..1：给灯光、海盗频率、BGM 当输入，入夜出夜都是渐变。 */
export function nightness(elapsed: number): number {
  const t = dayPhase(elapsed);
  if (t >= NIGHT_AT) return smoothstep(Math.min(1, (t - NIGHT_AT) / 0.06 + 0.35));
  if (t < 0.12) return 1 - smoothstep(t / 0.12);
  if (t > NIGHT_AT - 0.14) return smoothstep((t - (NIGHT_AT - 0.14)) / 0.14) * 0.65;
  return 0;
}

/**
 * 月光镶边色 —— 夜里把深色轮廓从深色海面上「切」出来的那圈冷白。
 *
 * 夜相位的水是 `#020a16`–`#123c5e`，物件自带的暗描边（`items.ts` 的 `rim`
 * 用 `ink.dark`）落上去等于没画：轮廓一糊，玩家只能靠色块猜那是什么。
 * 俯视的海面上本来就有一层月光，贴着浮体边缘的那一线是真实存在的光，
 * 拿它当镶边既救得回轮廓，又不用把物件本体点亮成灯泡。
 *
 * `bias` 是掺进去的物件本色：全白的边会把二十来种剪影的色相线索抹平，
 * 掺三成回来，边缘仍然亮，但木头的边偏暖、铁皮的边偏冷。
 */
export const MOONLIGHT = "#cfe3ff";

export function moonRim(tint: string, bias = 0.32): string {
  return mixHex(MOONLIGHT, tint, bias);
}

/** 相位 → 配色，相邻相位整段平滑过渡。 */
export function paletteAt(phase01: number): SeaPalette {
  const t = clamp01(phase01 - Math.floor(phase01));
  for (let i = 0; i < PHASE_STOPS.length - 1; i++) {
    const from = PHASE_STOPS[i];
    const to = PHASE_STOPS[i + 1];
    if (t < from.at || t > to.at) continue;
    return mixPalette(SEA_PALETTES[from.id], SEA_PALETTES[to.id], smoothstep((t - from.at) / (to.at - from.at)));
  }
  return SEA_PALETTES.day;
}

/** 局内秒 → 配色（`paletteAt(dayPhase(elapsed))` 的快捷方式）。 */
export function paletteFor(elapsed: number): SeaPalette {
  return paletteAt(dayPhase(elapsed));
}

/* ------------------------------------------------------------------ *
 * 浪：给浮在水上的东西用的公共函数
 * ------------------------------------------------------------------ */

/**
 * 水面在 (x, y) 处的高度势（-1..1）。俯视看不到高低，
 * 但浮体的摆动、浪纹的亮暗、焦散的疏密都从这一个场里取，
 * 于是整片海的运动是同一套涌浪，而不是各画各的。
 */
export function waveField(x: number, y: number, time: number): number {
  const dx = Math.cos(SEA.currentDir);
  const dy = Math.sin(SEA.currentDir);
  const along = x * dx + y * dy;
  const across = -x * dy + y * dx;
  const swell = Math.sin(along / SEA.swellLen * Math.PI * 2 - time * SEA.swellSpeed);
  const chop = Math.sin(across / SEA.chopLen * Math.PI * 2 + time * SEA.chopSpeed) * 0.42;
  return (swell + chop) / 1.42;
}

/** 浮体的摇摆：随浪轻微平移 + 转一点点。木筏、漂浮物、小船共用。 */
export function swayAt(
  x: number,
  y: number,
  time: number,
  amp = 1,
): { dx: number; dy: number; rot: number } {
  const w = waveField(x, y, time);
  const w2 = waveField(x + 40, y + 26, time + 0.7);
  return {
    dx: w * SEA.swayPx * amp,
    dy: w2 * SEA.swayPx * 0.7 * amp,
    rot: (w - w2) * 0.035 * amp,
  };
}

/** 稳定散列：沉城、泡沫、雨点每帧位置一致，不需要随机源。 */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export type SeaView = {
  /** 局内累计秒（loop 的 elapsed）：唯一的动画输入 */
  time: number;
  /** 直接指定配色；不给就按 time 算昼夜 */
  palette?: SeaPalette;
  /** 风暴强度 0..1：压暗、加浪、下雨 */
  storm01?: number;
};

/**
 * 一次画完整片海：底色 → 沉城 → 焦散 → 浪纹 → 泡沫 → 天光 → 夜/风暴。
 * 返回本帧用的配色，木筏、实体、HUD 直接拿去用，不必各算一遍相位。
 */
export function drawOcean(ctx: CanvasRenderingContext2D, view: SeaView): SeaPalette {
  const p = view.palette ?? paletteFor(view.time);
  const time = view.time;
  const storm = clamp01(view.storm01 ?? 0);

  drawWater(ctx, p);
  drawSunkenCity(ctx, p, time);
  drawCaustics(ctx, p, time, storm);
  drawCrests(ctx, p, time, storm);
  drawFoamPatches(ctx, p, time);
  drawGlint(ctx, p, time, storm);
  if (storm > 0.02) drawStorm(ctx, p, time, storm);
  drawVignette(ctx, p);
  return p;
}

/** 水的底色：中心浅滩、四周深渊，再叠一层脏化深度，水面才有厚度。 */
export function drawWater(ctx: CanvasRenderingContext2D, p: SeaPalette): void {
  const g = ctx.createRadialGradient(
    CANVAS.w * 0.5,
    CANVAS.h * 0.46,
    CANVAS.h * 0.1,
    CANVAS.w * 0.5,
    CANVAS.h * 0.5,
    CANVAS.w * 0.76,
  );
  g.addColorStop(0, mixHex(p.shallow, p.glint, 0.08));
  g.addColorStop(0.28, p.shallow);
  g.addColorStop(0.62, mixHex(p.shallow, p.deep, 0.58));
  g.addColorStop(1, p.deep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
  drawDepthMottle(ctx, p);
}

/**
 * 深度脏化：散列的软斑把径向渐变撕成「海底高低」，
 * 否则整片水是一块塑料渐变，没有任何材质。
 */
function drawDepthMottle(ctx: CanvasRenderingContext2D, p: SeaPalette): void {
  ctx.save();
  for (let i = 0; i < 42; i++) {
    const x = hash01(i * 3.1) * CANVAS.w;
    const y = hash01(i * 7.7) * CANVAS.h;
    const rx = 48 + hash01(i * 2.2) * 110;
    const ry = rx * (0.45 + hash01(i * 5.5) * 0.4);
    const deep = hash01(i * 9.3) > 0.42;
    const blob = ctx.createRadialGradient(x, y, 4, x, y, rx);
    blob.addColorStop(0, withAlpha(deep ? p.deep : mixHex(p.shallow, p.caustic, 0.35), deep ? 0.16 : 0.07));
    blob.addColorStop(1, withAlpha(p.deep, 0));
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, hash01(i) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 沉城：末日的地标沉在水下，只剩楼顶的轮廓隔着水透出来。
 * ------------------------------------------------------------------ */

/** 一栋沉楼的形状表：位置是散列出来的常量，随洋流做极慢的视差。 */
const SUNKEN_COUNT = 14;

/**
 * 水下的城市剪影。
 *
 * 三件事让它读起来是「沉在水下」而不是「浮在水上」：
 * 颜色随深度混向深水色（深的几乎化在水里）；轮廓靠三层逐层放大、
 * 逐层变淡的重画糊掉边缘，替代昂贵的真模糊；整体随洋流做极缓视差，
 * 比水面泡沫慢得多，于是它明显在「另一层」。
 */
export function drawSunkenCity(ctx: CanvasRenderingContext2D, p: SeaPalette, time: number): void {
  const dx = Math.cos(SEA.currentDir) * SEA.currentPxS * 0.35;
  const dy = Math.sin(SEA.currentDir) * SEA.currentPxS * 0.35;
  const spanX = CANVAS.w + 420;
  const spanY = CANVAS.h + 420;

  ctx.save();
  for (let i = 0; i < SUNKEN_COUNT; i++) {
    const depth = 0.25 + hash01(i * 3.7) * 0.7;
    const drift = 1 - depth * 0.6;
    const x = (((hash01(i * 1.9) * spanX - time * dx * drift) % spanX) + spanX) % spanX - 210;
    const y = (((hash01(i * 5.3) * spanY - time * dy * drift) % spanY) + spanY) % spanY - 210;
    const w = 46 + hash01(i * 7.1) * 96;
    const h = 40 + hash01(i * 2.3) * 120;
    const kind = hash01(i * 9.7);
    // 深的楼几乎化进深水色，浅的才有点自己的轮廓
    const tint = mixHex(p.sunken, p.deep, depth * 0.85);
    // 水面折射：整栋楼轻轻晃，晃动幅度随深度放大
    const wob = Math.sin(time * 0.9 + i * 1.7) * (1.5 + depth * 3);

    ctx.save();
    ctx.translate(x + wob, y + wob * 0.6);
    ctx.rotate((hash01(i * 4.4) - 0.5) * 0.5);
    ctx.fillStyle = tint;

    // 三层：外圈最淡最大，逐层收紧，边缘就糊成了水里的轮廓
    for (let layer = 2; layer >= 0; layer--) {
      const grow = layer * 5;
      ctx.globalAlpha = (0.26 - depth * 0.17) * (layer === 0 ? 1 : 0.34 / layer);
      if (kind < 0.18) {
        // 断桥：一段桥面加两个桥墩
        ctx.fillRect(-w - grow, -11 - grow, (w + grow) * 2, 22 + grow * 2);
        ctx.fillRect(-w * 0.5 - grow, -h * 0.4, 16 + grow * 2, h * 0.8);
        ctx.fillRect(w * 0.4 - grow, -h * 0.4, 16 + grow * 2, h * 0.8);
      } else if (kind < 0.32) {
        // 环形体育场：只画环，中间的场地留给水
        ctx.lineWidth = 14 + grow * 2;
        ctx.strokeStyle = tint;
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.66, h * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // 高楼：主楼 + 裙楼
        ctx.fillRect(-w / 2 - grow, -h / 2 - grow, w + grow * 2, h + grow * 2);
        ctx.fillRect(-w * 0.82 - grow, h * 0.1 - grow, w * 0.5 + grow * 2, h * 0.35 + grow * 2);
      }
    }

    // 浅水里的楼顶还看得见几排窗；深的就免了，画了也只是噪点
    if (kind >= 0.32 && depth < 0.55) {
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = p.caustic;
      const cols = Math.max(2, Math.floor(w / 22));
      const rows = Math.max(2, Math.floor(h / 26));
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if (hash01(i * 3 + cx * 7 + cy * 13) < 0.45) continue;
          ctx.fillRect(-w / 2 + 6 + (cx * (w - 12)) / cols, -h / 2 + 6 + (cy * (h - 12)) / rows, 6, 5);
        }
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 水面：焦散网、浪纹、泡沫、天光
 * ------------------------------------------------------------------ */

/** 焦散：两组交叉的正弦网，越亮的地方是波峰把光聚起来的位置。 */
export function drawCaustics(
  ctx: CanvasRenderingContext2D,
  p: SeaPalette,
  time: number,
  storm01 = 0,
): void {
  const step = 56;
  const veil = 1 - storm01 * 0.75;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    const speed = pass === 0 ? 0.72 : -0.48;
    const warp = pass === 0 ? 14 : 9;
    ctx.strokeStyle = pass === 0 ? p.caustic : mixHex(p.caustic, p.glint, 0.22);
    ctx.lineWidth = pass === 0 ? 1.35 : 0.9;
    for (let gy = -1; gy <= CANVAS.h / step + 1; gy++) {
      ctx.beginPath();
      for (let gx = 0; gx <= CANVAS.w / step + 1; gx++) {
        const x = gx * step + (pass === 1 ? step * 0.4 : 0);
        const y = gy * step + Math.sin(x * 0.018 + time * speed + gy * 0.7) * warp;
        if (gx === 0) ctx.moveTo(x, y);
        else {
          ctx.quadraticCurveTo(
            x - step * 0.5,
            y + Math.cos(x * 0.028 - time * (0.8 + pass * 0.3) + gy) * (8 + pass * 4),
            x,
            y,
          );
        }
      }
      ctx.globalAlpha = (0.035 + Math.abs(Math.sin(time * 0.55 + gy * 0.5 + pass)) * 0.04) * veil;
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * 浪纹：一组垂直于洋流的亮线，整体朝洋流方向推。
 *
 * 每条线自身按 `waveField` 起伏，所以浪纹与浮体的摇摆是同一套运动——
 * 木筏抬起来的那一刻，脚下的浪也正好是波峰。
 */
export function drawCrests(
  ctx: CanvasRenderingContext2D,
  p: SeaPalette,
  time: number,
  storm01 = 0,
): void {
  const rough = 1 + storm01 * 1.6;
  const dirX = Math.cos(SEA.currentDir);
  const dirY = Math.sin(SEA.currentDir);
  // 沿洋流方向铺满整个画布对角线，转出来才不会露边
  const diag = Math.hypot(CANVAS.w, CANVAS.h);
  const gap = diag / SEA.crests;
  const flow = ((time * SEA.currentPxS) % gap + gap) % gap;

  ctx.save();
  ctx.translate(CANVAS.w / 2, CANVAS.h / 2);
  ctx.rotate(SEA.currentDir);
  ctx.lineCap = "round";
  for (let i = 0; i <= SEA.crests; i++) {
    const along = -diag / 2 + i * gap + flow;
    ctx.beginPath();
    for (let k = 0; k <= SEA.crestSegs; k++) {
      const across = -diag / 2 + (diag * k) / SEA.crestSegs;
      // 采样点转回世界坐标，浪的形状才跟 waveField 对得上
      const wx = CANVAS.w / 2 + along * dirX - across * dirY;
      const wy = CANVAS.h / 2 + along * dirY + across * dirX;
      const off = waveField(wx, wy, time) * 5 * rough;
      if (k === 0) ctx.moveTo(along + off, across);
      else ctx.lineTo(along + off, across);
    }
    const shimmer = 0.5 + Math.sin(time * 1.1 + i * 0.8) * 0.5;
    // 断续的短划：连成整条会变成横贯全屏的划痕，断开才像一片碎浪
    ctx.setLineDash([26 + shimmer * 60, 34 + hash01(i) * 90]);
    ctx.lineDashOffset = hash01(i * 5.1) * 400 - time * 26;
    ctx.strokeStyle = p.wave;
    ctx.globalAlpha = (0.05 + shimmer * 0.05) * (1 + storm01 * 0.9);
    ctx.lineWidth = 1.6 + shimmer * 1.2;
    ctx.stroke();

    // 每隔几条压一道白沫，海面才有前后层次
    if (i % 3 === 0) {
      ctx.strokeStyle = p.foam;
      ctx.globalAlpha = (0.035 + shimmer * 0.045) * (1 + storm01 * 1.5);
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 漂过来的泡沫团：软边主斑 + 两三粒碎沫，顺流慢慢移动。 */
export function drawFoamPatches(ctx: CanvasRenderingContext2D, p: SeaPalette, time: number): void {
  const dx = Math.cos(SEA.currentDir) * SEA.currentPxS;
  const dy = Math.sin(SEA.currentDir) * SEA.currentPxS;
  const spanX = CANVAS.w + 200;
  const spanY = CANVAS.h + 200;
  ctx.save();
  for (let i = 0; i < 36; i++) {
    const x = (((hash01(i * 2.7) * spanX + time * dx) % spanX) + spanX) % spanX - 100;
    const y = (((hash01(i * 6.1) * spanY + time * dy) % spanY) + spanY) % spanY - 100;
    const r = 3.2 + hash01(i * 8.3) * 7;
    const pulse = 0.05 + Math.abs(Math.sin(time * 1.15 + i)) * 0.09;
    const blob = ctx.createRadialGradient(x, y, 0.4, x, y, r * 2.4);
    blob.addColorStop(0, withAlpha(p.foam, pulse * 1.4));
    blob.addColorStop(0.45, withAlpha(p.foam, pulse * 0.45));
    blob.addColorStop(1, withAlpha(p.foam, 0));
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 2.3, r, SEA.currentDir, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(p.foam, pulse);
    for (let k = 0; k < 2; k++) {
      const ox = (hash01(i * 4.1 + k) - 0.5) * r * 2.8;
      const oy = (hash01(i * 6.8 + k) - 0.5) * r * 1.4;
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, 1.1 + k, 0.7, SEA.currentDir, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 天光斑：太阳/月亮在水面上的一片碎光，位置随昼夜相位缓慢挪动。 */
export function drawGlint(
  ctx: CanvasRenderingContext2D,
  p: SeaPalette,
  time: number,
  storm01 = 0,
): void {
  const phase = dayPhase(time);
  const cx = CANVAS.w * (0.16 + phase * 0.7);
  const cy = CANVAS.h * (0.2 + Math.sin(phase * Math.PI) * 0.2);
  const halo = ctx.createRadialGradient(cx, cy, 20, cx, cy, 340);
  halo.addColorStop(0, withAlpha(p.glint, 0.22 * (1 - storm01 * 0.8)));
  halo.addColorStop(1, withAlpha(p.glint, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = p.glint;
  for (let i = 0; i < 34; i++) {
    const a = hash01(i * 3.1) * Math.PI * 2;
    const rad = hash01(i * 7.7) * 300;
    const x = cx + Math.cos(a) * rad + Math.sin(time * 2 + i) * 8;
    const y = cy + Math.sin(a) * rad * 0.7;
    ctx.globalAlpha = (0.06 + Math.abs(Math.sin(time * 3 + i * 1.3)) * 0.14) * (1 - storm01 * 0.9);
    ctx.beginPath();
    ctx.ellipse(x, y, 5 + hash01(i) * 12, 1.6, SEA.currentDir, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 风暴：压暗 + 斜雨 + 溅在水面的点。`storm01` 由 sim 的风暴进度给。 */
export function drawStorm(
  ctx: CanvasRenderingContext2D,
  p: SeaPalette,
  time: number,
  storm01: number,
): void {
  const s = clamp01(storm01);
  ctx.save();
  ctx.fillStyle = withAlpha("#040a12", 0.38 * s);
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);

  ctx.strokeStyle = withAlpha(p.foam, 0.22 * s);
  ctx.lineWidth = 1.3;
  const drops = Math.round(120 * s);
  const spanY = CANVAS.h + 220;
  for (let i = 0; i < drops; i++) {
    const x = (hash01(i * 3.7) * (CANVAS.w + 300) + time * 220) % (CANVAS.w + 300) - 150;
    const y = (hash01(i * 9.1) * spanY + time * 1100 * (0.6 + hash01(i) * 0.7)) % spanY - 110;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 14, y + 28);
    ctx.stroke();
  }

  // 雨打在水面上的溅点
  ctx.strokeStyle = withAlpha(p.foam, 0.3 * s);
  for (let i = 0; i < Math.round(50 * s); i++) {
    const seed = Math.floor(time * 6) + i * 17;
    const x = hash01(seed * 1.3) * CANVAS.w;
    const y = hash01(seed * 2.9) * CANVAS.h;
    const r = 2 + hash01(seed) * 4;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 四角压暗，把注意力收回木筏。 */
export function drawVignette(ctx: CanvasRenderingContext2D, p: SeaPalette): void {
  const g = ctx.createRadialGradient(
    CANVAS.w / 2,
    CANVAS.h / 2,
    CANVAS.h * 0.36,
    CANVAS.w / 2,
    CANVAS.h / 2,
    CANVAS.w * 0.78,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, withAlpha(p.deep, 0.42));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
}

/**
 * 水面阴影：浮在水上的东西都该在水里留一块暗斑。
 * 俯视看不到影子被拉长，所以偏移只有很小的一点。
 */
export function drawWaterShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry = rx,
  alpha = 0.22,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#01121f";
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 4, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 单圈涟漪：`t01` 是 0→1 的生命进度，外扩同时淡出。
 * 要成批管理用 `src/fx/ripple.ts`，这里只画一圈。
 */
export function drawRippleRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t01: number,
  color = "#ffffff",
  radius = 30,
): void {
  const t = clamp01(t01);
  ctx.save();
  ctx.globalAlpha = (1 - t) * 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 2.4 * (1 - t * 0.6));
  ctx.beginPath();
  ctx.arc(x, y, radius * (0.2 + t), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
