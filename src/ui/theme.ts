import type { ThemeId } from "../data/constants";

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
  },
};

export function themeAt(distance: number): ThemePaint {
  const idx = Math.min(3, Math.floor(distance / 500));
  const ids = Object.keys(THEMES) as ThemeId[];
  return THEMES[ids[idx] ?? "tropical"];
}
