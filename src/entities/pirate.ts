import { PIRATE as PIRATE_TABLE } from "../data/constants";
import type { Vec2 } from "../sim/rules";

/**
 * 海盗船。行为极简：朝最近的木筏格子直线开，进入 reach 就停下来砍。
 * 寻路是故意不做的——海面没有障碍，A* 只会让 60fps 变难看。
 */

/**
 * = constants PIRATE：速度/血量随波数增长（baseSpeed + speedPerWave × wave，
 * 上限 maxSpeed），reach 内停船开砍 dps，死后掉 dropMetal 金属。
 */
export const PIRATE = PIRATE_TABLE;

export type Pirate = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  /** 受击闪白剩余秒数，给渲染用 */
  flash: number;
  /** 本帧是否贴脸开砍，给渲染/音效用 */
  attacking: boolean;
};

export function createPirate(x: number, y: number, wave = 0): Pirate {
  const hp = PIRATE.baseHp + PIRATE.hpPerWave * wave;
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    hp,
    maxHp: hp,
    speed: Math.min(PIRATE.maxSpeed, PIRATE.baseSpeed + PIRATE.speedPerWave * wave),
    flash: 0,
    attacking: false,
  };
}

/**
 * 朝目标推进一帧。
 * @returns 是否已经贴到 reach 距离内（贴到了就该开砍了）
 */
export function stepPirate(p: Pirate, target: Vec2, dt: number): boolean {
  if (p.flash > 0) p.flash = Math.max(0, p.flash - dt);
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = Math.hypot(dx, dy);
  const arrived = dist <= PIRATE.reach;
  if (arrived || dist === 0) {
    p.vx = 0;
    p.vy = 0;
  } else {
    // 别冲过头：这一帧最多走到 reach 边上
    const step = Math.min(p.speed * dt, dist - PIRATE.reach);
    p.vx = (dx / dist) * p.speed;
    p.vy = (dy / dist) * p.speed;
    p.x += (dx / dist) * step;
    p.y += (dy / dist) * step;
  }
  p.attacking = arrived;
  return arrived;
}

/** 扣血，返回是否被打死 */
export function damagePirate(p: Pirate, amount: number): boolean {
  if (amount <= 0 || p.hp <= 0) return false;
  p.hp -= amount;
  p.flash = PIRATE.flashS;
  if (p.hp > 0) return false;
  p.hp = 0;
  return true;
}

export function isDead(p: Pirate): boolean {
  return p.hp <= 0;
}
