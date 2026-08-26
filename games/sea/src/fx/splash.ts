/**
 * 水花与碎屑 —— 一组「一句话就能喷出来」的粒子预设。
 *
 * 每个函数只负责一种事件的手感，调用方不用记 `spawnBurst` 的十个参数：
 * 捞东西、物件入水、开船的尾迹、建造的木屑、结构被打的碎片。
 */

import { itemArt } from "../world/items";
import { spawnBurst, type Particle } from "./particles";

/**
 * 捞取水花：水滴以捞取点为心向外炸开，外加一圈瞬间的水环。
 * `s01` 是力度（0..1），捞大件时给大一点。
 */
export function scoopSplash(list: Particle[], x: number, y: number, color: string, s01 = 0.5): void {
  const s = Math.max(0, Math.min(1, s01));
  spawnBurst(list, x, y, color, {
    count: 9 + Math.round(s * 7),
    speed: 130 + s * 150,
    radius: 2.6 + s * 1.8,
    life: 0.34 + s * 0.16,
    drag: 4.2,
  });
  spawnBurst(list, x, y, "#ffffff", {
    count: 1,
    shape: "ring",
    radius: 7,
    life: 0.3,
    speed: 0,
  });
}

/**
 * 捞到某件**具体的东西**：白水花打底，再补一撮这件东西自己颜色的碎屑。
 *
 * 颜色从 `world/items.ts` 的外观登记表取，调用方不用记谁是什么色号，
 * 目录里加的新道具也自动有对得上的水花。稀有度 ≥2 的多一圈亮片，
 * 「捞到好东西」这件事在世界里就有反馈，不必等 HUD 弹字。
 */
export function salvageSplash(list: Particle[], x: number, y: number, itemId: string, s01 = 0.5): void {
  const art = itemArt(itemId);
  scoopSplash(list, x, y, "#bfe9ff", s01);
  spawnBurst(list, x, y, art.tint, {
    count: 6,
    shape: "spark",
    speed: 150,
    radius: 2.4,
    life: 0.42,
    drag: 3.2,
  });
  if (art.rare >= 2) sparkle(list, x, y, art.accent, 8 + art.rare * 3);
}

/** 物件入水 / 沉没：小而钝的一圈水点。 */
export function plunk(list: Particle[], x: number, y: number, color: string): void {
  spawnBurst(list, x, y, color, {
    count: 7,
    speed: 80,
    radius: 2.2,
    life: 0.3,
    drag: 5,
  });
}

/** 小船的尾迹：朝船尾方向喷一小撮白沫。 */
export function boatWake(list: Particle[], x: number, y: number, dir: number, color: string): void {
  spawnBurst(list, x, y, color, {
    count: 3,
    speed: 70,
    spread: Math.PI * 0.5,
    angle: dir,
    radius: 2.4,
    life: 0.36,
    drag: 3.2,
  });
}

/** 建造：木屑与火星向上蹦一下。 */
export function buildChips(list: Particle[], x: number, y: number, color: string): void {
  spawnBurst(list, x, y, color, {
    count: 12,
    shape: "spark",
    speed: 170,
    radius: 2.6,
    life: 0.34,
    drag: 3.6,
  });
}

/** 结构被打：贴着撞点朝一个方向飞的碎片。`dir` 是受力方向（弧度）。 */
export function hullDebris(list: Particle[], x: number, y: number, color: string, dir = 0): void {
  spawnBurst(list, x, y, color, {
    count: 12,
    shape: "spark",
    speed: 220,
    spread: Math.PI * 0.8,
    angle: dir,
    radius: 3,
    life: 0.4,
    drag: 2.8,
  });
}

/** 拾取 / 完成的小闪光。 */
export function sparkle(list: Particle[], x: number, y: number, color: string, n = 10): void {
  spawnBurst(list, x, y, color, {
    count: n,
    shape: "spark",
    speed: 130,
    radius: 2.2,
    life: 0.3,
    drag: 3,
  });
}
