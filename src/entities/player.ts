import { LANES, PLAYER, SPEED } from "../data/constants";
import { chuteBank } from "../game/camera";
import { applyWallScrape, type Motion } from "../game/physics";

/** Press this early and the hop still fires the moment the cooldown clears. */
const JUMP_BUFFER = 0.13;
/** Weights for how much of a carve comes from swapping lanes vs. the chute's own bank. */
const SWITCH_CARVE = 0.8;
const CHUTE_CARVE = 0.45;
/** In the air there is no water to scrub against. */
const AIR_CARVE = 0.25;
const DEFAULT_LIFT = 34;
/** Steering into the wall keeps costing speed, but only this often. */
const WALL_SCRAPE_CD = 0.45;

/** Hop arc, 0 at both ends and 1 at the apex: quick pop up, a beat of hang, brisk landing. */
export function hopCurve(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.sin(Math.PI * Math.pow(u, 0.82));
}

export class Player {
  lane = 0;
  fromLane = 0;
  toLane = 0;
  switchT = 1;
  z = 0;
  hp = PLAYER.maxHp;
  jumpT = 0;
  jumpCd = 0;
  jumpBuffer = 0;
  invuln = 0;
  wallCd = 0;
  motion: Motion = { speed: SPEED.base, boostLeft: 0 };
  private hopStarted = false;

  get laneX(): number {
    const t = this.switchT;
    const ease = t * t * (3 - 2 * t);
    return (this.fromLane + (this.toLane - this.fromLane) * ease) * LANES.width;
  }

  get airborne(): boolean {
    return this.jumpT > 0;
  }

  /** 0..1 through the current hop. */
  get hopT(): number {
    return this.jumpT > 0 ? 1 - this.jumpT / (PLAYER.jumpMs / 1000) : 0;
  }

  /** Screen-space lift of the raft at this point in the hop. */
  hopLift(max = DEFAULT_LIFT): number {
    return hopCurve(this.hopT) * max;
  }

  trySwitch(dir: -1 | 1): boolean {
    if (this.switchT < 1) return false;
    const next = Math.max(LANES.min, Math.min(LANES.max, this.toLane + dir));
    if (next === this.toLane) {
      this.scrapeWall();
      return false;
    }
    this.fromLane = this.toLane;
    this.toLane = next;
    this.switchT = 0;
    return true;
  }

  tryJump(): boolean {
    if (this.startHop()) return true;
    this.jumpBuffer = JUMP_BUFFER;
    return false;
  }

  /** True once for a hop that fired from a buffered press, so callers can still cue it. */
  consumeHopStart(): boolean {
    const started = this.hopStarted;
    this.hopStarted = false;
    return started;
  }

  step(dt: number): void {
    this.hopStarted = false;
    if (this.switchT < 1) {
      this.switchT = Math.min(1, this.switchT + dt / (LANES.switchMs / 1000));
      if (this.switchT === 1) this.fromLane = this.toLane;
    }
    this.lane = this.toLane;
    this.jumpT = Math.max(0, this.jumpT - dt);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.wallCd = Math.max(0, this.wallCd - dt);

    if (this.jumpBuffer > 0) {
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.hopStarted = this.startHop();
    }

    this.motion.bank = this.carve();
  }

  hurt(): boolean {
    if (this.invuln > 0 || this.airborne) return false;
    this.hp -= 1;
    this.invuln = 0.85;
    return true;
  }

  /** Leaning on a wall you cannot pass: costs speed rather than doing nothing at all. */
  private scrapeWall(): void {
    if (this.wallCd > 0) return;
    this.wallCd = WALL_SCRAPE_CD;
    applyWallScrape(this.motion);
  }

  private startHop(): boolean {
    if (this.jumpCd > 0 || this.airborne) return false;
    this.jumpT = PLAYER.jumpMs / 1000;
    this.jumpCd = PLAYER.jumpCooldownMs / 1000;
    this.jumpBuffer = 0;
    return true;
  }

  /** 0..1 of how hard the raft is cutting sideways right now. */
  private carve(): number {
    const swing = this.switchT < 1 ? 1 - Math.abs(this.switchT * 2 - 1) : 0;
    const bank = swing * SWITCH_CARVE + Math.abs(chuteBank(this.z)) * CHUTE_CARVE;
    return Math.min(1, bank) * (this.airborne ? AIR_CARVE : 1);
  }
}
