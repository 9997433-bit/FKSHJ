import { GEN, THEME_ORDER, type ThemeId } from "../data/constants";

export type ThemePaint = {
  id: ThemeId;
  name: string;
  skyTop: string;
  skyBot: string;
  water: string;
  waterDeep: string;
  foam: string;
  accent: string;
  rail: string;
  fog: string;
  /** 语义色：HUD 文字 / 高对比前景 */
  ink: string;
  /** 语义色：生命（泳圈气量） */
  hp: string;
  /** 语义色：金币 */
  coin: string;
  /** 语义色：宝石 */
  gem: string;
  /** 语义色：危险（障碍、低血警示） */
  danger: string;
};

export const THEMES: Record<ThemeId, ThemePaint> = {
  tropical: {
    id: "tropical",
    name: "热带港",
    skyTop: "#7ee8ff",
    skyBot: "#1f8a9e",
    water: "#2ad4c7",
    waterDeep: "#0c6c7a",
    foam: "#e8fff8",
    accent: "#ffd166",
    rail: "#f4a261",
    fog: "rgba(180, 255, 240, 0.08)",
    ink: "#f4fffd",
    hp: "#ff6b9a",
    coin: "#ffd166",
    gem: "#7cf7ff",
    danger: "#ff5470",
  },
  cave: {
    id: "cave",
    name: "洞穴瀑",
    skyTop: "#14314a",
    skyBot: "#07131f",
    water: "#3d7dff",
    waterDeep: "#102a5a",
    foam: "#b8e0ff",
    accent: "#7cf7ff",
    rail: "#6c7a89",
    fog: "rgba(40, 80, 140, 0.18)",
    ink: "#eef7ff",
    hp: "#ff7fb2",
    coin: "#ffdf7e",
    gem: "#8ef0ff",
    danger: "#ff5f7a",
  },
  volcano: {
    id: "volcano",
    name: "火山泉",
    skyTop: "#ff8a4c",
    skyBot: "#4a1420",
    water: "#ff6b35",
    waterDeep: "#7a1f24",
    foam: "#ffe2b8",
    accent: "#ffd93d",
    rail: "#c44536",
    fog: "rgba(255, 120, 60, 0.12)",
    ink: "#fff6ec",
    hp: "#ff5d8f",
    coin: "#ffd93d",
    gem: "#9be8ff",
    danger: "#ff3b30",
  },
  neon: {
    id: "neon",
    name: "霓虹夜",
    skyTop: "#1b1140",
    skyBot: "#050014",
    water: "#ff2e93",
    waterDeep: "#2b0b4a",
    foam: "#d5b3ff",
    accent: "#2ee6d6",
    rail: "#7b2cbf",
    fog: "rgba(255, 46, 147, 0.10)",
    ink: "#f6efff",
    hp: "#ff5dab",
    coin: "#ffe066",
    gem: "#2ee6d6",
    danger: "#ff2e5f",
  },
};

/** 主题段边界前的过渡带长度（世界单位）。 */
export const THEME_BLEND = 90;

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(c: string): Rgba {
  const s = c.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const full =
      hex.length === 3 || hex.length === 4
        ? hex
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : hex;
    const n = parseInt(full.slice(0, 6), 16);
    const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  const m = /rgba?\(([^)]+)\)/i.exec(s);
  if (m) {
    const p = m[1].split(",").map((v) => parseFloat(v));
    return { r: p[0] ?? 0, g: p[1] ?? 0, b: p[2] ?? 0, a: p[3] ?? 1 };
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

function formatColor(c: Rgba): string {
  const r = Math.round(c.r);
  const g = Math.round(c.g);
  const b = Math.round(c.b);
  if (c.a >= 0.999) {
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.round(c.a * 1000) / 1000})`;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 在两个 CSS 颜色（#hex 或 rgb/rgba）之间线性插值。 */
export function lerpColor(a: string, b: string, t: number): string {
  const k = clamp01(t);
  const ca = parseColor(a);
  const cb = parseColor(b);
  return formatColor({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
    a: ca.a + (cb.a - ca.a) * k,
  });
}

/** 混合两个主题的全部色彩通道；id/name 取占比更高的一侧。 */
export function mixThemes(a: ThemePaint, b: ThemePaint, t: number): ThemePaint {
  const k = clamp01(t);
  const near = k < 0.5 ? a : b;
  return {
    id: near.id,
    name: near.name,
    skyTop: lerpColor(a.skyTop, b.skyTop, k),
    skyBot: lerpColor(a.skyBot, b.skyBot, k),
    water: lerpColor(a.water, b.water, k),
    waterDeep: lerpColor(a.waterDeep, b.waterDeep, k),
    foam: lerpColor(a.foam, b.foam, k),
    accent: lerpColor(a.accent, b.accent, k),
    rail: lerpColor(a.rail, b.rail, k),
    fog: lerpColor(a.fog, b.fog, k),
    ink: lerpColor(a.ink, b.ink, k),
    hp: lerpColor(a.hp, b.hp, k),
    coin: lerpColor(a.coin, b.coin, k),
    gem: lerpColor(a.gem, b.gem, k),
    danger: lerpColor(a.danger, b.danger, k),
  };
}

function smoothstep(t: number): number {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
}

/**
 * 距离 → 主题。段边界前 THEME_BLEND 个世界单位内向下一主题平滑过渡，
 * 避免天空 / 水色硬切。段长与顺序读自 data/constants，保持单一数值来源。
 */
export function themeAt(distance: number, blend: number = THEME_BLEND): ThemePaint {
  const seg = GEN.segmentLen;
  const last = THEME_ORDER.length - 1;
  const idx = Math.max(0, Math.min(last, Math.floor(distance / seg)));
  const cur = THEMES[THEME_ORDER[idx]];
  if (idx >= last || blend <= 0) return cur;
  const local = distance - idx * seg;
  const blendStart = seg - blend;
  if (local <= blendStart) return cur;
  const t = smoothstep((local - blendStart) / blend);
  return mixThemes(cur, THEMES[THEME_ORDER[idx + 1]], t);
}
