import { LANES, PLAYER } from "../data/constants";
import type { Motion } from "../game/physics";

export class Player {
  lane = 0;
  fromLane = 0;
  toLane = 0;
  switchT = 1;
  z = 0;
  hp = PLAYER.maxHp;
  jumpT = 0;
  jumpCd = 0;
  invuln = 0;
  motion: Motion = { speed: 280, boostLeft: 0 };

  get laneX(): number {
    const t = this.switchT;
    const ease = t * t * (3 - 2 * t);
    return (this.fromLane + (this.toLane - this.fromLane) * ease) * LANES.width;
  }

  get airborne(): boolean {
    return this.jumpT > 0;
  }

  trySwitch(dir: -1 | 1): boolean {
    if (this.switchT < 1) return false;
    const next = Math.max(LANES.min, Math.min(LANES.max, this.toLane + dir));
    if (next === this.toLane) return false;
    this.fromLane = this.toLane;
    this.toLane = next;
    this.switchT = 0;
    return true;
  }

  tryJump(): boolean {
    if (this.jumpCd > 0 || this.airborne) return false;
    this.jumpT = PLAYER.jumpMs / 1000;
    this.jumpCd = PLAYER.jumpCooldownMs / 1000;
    return true;
  }

  step(dt: number): void {
    if (this.switchT < 1) {
      this.switchT = Math.min(1, this.switchT + dt / (LANES.switchMs / 1000));
      if (this.switchT === 1) this.fromLane = this.toLane;
    }
    this.lane = this.toLane;
    this.jumpT = Math.max(0, this.jumpT - dt);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
  }

  hurt(): boolean {
    if (this.invuln > 0 || this.airborne) return false;
    this.hp -= 1;
    this.invuln = 0.85;
    return true;
  }
}
