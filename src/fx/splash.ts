import { spawnBurst, type Particle } from "./particles";

/**
 * 泳圈划水的持续水花。speed01 是速度归一值（0..1）：
 * 越快，水花越多、飞得越高、颗粒越大。
 */
export function splash(
  list: Particle[],
  x: number,
  y: number,
  color: string,
  speed01 = 0.3,
): void {
  const s = Math.max(0, Math.min(1, speed01));
  spawnBurst(list, x, y, color, {
    count: 3 + Math.round(s * 7),
    speed: 70 + s * 190,
    radius: 2.4 + s * 2.6,
    life: 0.3 + s * 0.2,
    spread: Math.PI * 0.9,
    angle: -Math.PI / 2,
    grav: 260,
  });
}

/** 撞击/落水的大水柱。 */
export function bigSplash(
  list: Particle[],
  x: number,
  y: number,
  color: string,
  speed01 = 0.5,
): void {
  const s = Math.max(0, Math.min(1, speed01));
  spawnBurst(list, x, y, color, {
    count: 14 + Math.round(s * 10),
    speed: 130 + s * 220,
    radius: 3 + s * 3,
    life: 0.5 + s * 0.3,
    grav: 300,
  });
  spawnBurst(list, x, y, "#ffffff", { count: 1, shape: "ring", radius: 10, life: 0.4, speed: 0, grav: 0 });
}

/** 加速带尾流：向后拖的定向火花。 */
export function boostWake(list: Particle[], x: number, y: number, color: string): void {
  spawnBurst(list, x, y, color, {
    count: 14,
    shape: "spark",
    speed: 260,
    spread: Math.PI * 0.5,
    angle: Math.PI / 2,
    radius: 3,
    life: 0.36,
    grav: 40,
  });
}

/** 拾取闪光。 */
export function sparkle(list: Particle[], x: number, y: number, color: string, n = 10): void {
  spawnBurst(list, x, y, color, {
    count: n,
    shape: "spark",
    speed: 130,
    radius: 2.4,
    life: 0.32,
    grav: 10,
  });
}
