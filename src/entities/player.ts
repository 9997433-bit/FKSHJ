import { FEEL, LANES, PLAYER, SPEED } from "../data/constants";
import { chuteBank } from "../game/camera";
import {
  applyWallScrape,
  FALL_TIME,
  offChuteDepth,
  slipPull,
  stepFall,
  stepSlip,
  type Motion,
} from "../game/physics";

/** Hop arc, 0 at both ends and 1 at the apex: quick pop up, a beat of hang, brisk landing. */
export function hopCurve(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.sin(Math.PI * Math.pow(u, 0.82));
}

export class Player {
  fromLane = 0;
  toLane = 0;
  switchT = 1;
  z = 0;
  hp: number = PLAYER.maxHp;
  jumpT = 0;
  jumpCd = 0;
  jumpBuffer = 0;
  invuln = 0;
  wallCd = 0;
  /** Lanes of outward slide the current bend has pushed on: 0 while the flow still holds the raft. */
  slip = 0;
  /** Seconds spent off the flow so far. */
  fallT = 0;
  /** Washed off the chute for good (GAME_SPEC §4.4). The run is over. */
  fallen = false;
  motion: Motion = { speed: SPEED.base, boostLeft: 0 };
  private hopStarted = false;

  /** Lane the raft is steering through, ignoring whatever the bank is doing to it. */
  get laneCenter(): number {
    const t = this.switchT;
    const ease = t * t * (3 - 2 * t);
    return this.fromLane + (this.toLane - this.fromLane) * ease;
  }

  /** Where the raft really sits, in lane units: mid-switch and bank slide included. */
  get collisionLane(): number {
    return this.laneCenter + this.slip;
  }

  /**
   * The lane the raft reads as being in on screen. It flips at the midpoint of a switch
   * rather than the moment one starts, so collisions never run ahead of the picture.
   */
  get lane(): number {
    return Math.max(LANES.min, Math.min(LANES.max, Math.round(this.collisionLane)));
  }

  get laneX(): number {
    return this.collisionLane * LANES.width;
  }

  /** Past the water's edge and riding the wall: the wipeout timer is running. */
  get offChute(): boolean {
    return offChuteDepth(this.collisionLane) > 0;
  }

  /** 0..1 through the wipeout timer, for anything that wants to warn the player. */
  get offChute01(): number {
    return Math.min(1, this.fallT / FALL_TIME);
  }

  get airborne(): boolean {
    return this.jumpT > 0;
  }

  /** 0..1 through the current hop. */
  get hopT(): number {
    return this.jumpT > 0 ? 1 - this.jumpT / (PLAYER.jumpMs / 1000) : 0;
  }

  /** Screen-space lift of the raft at this point in the hop. */
  hopLift(max: number = FEEL.hopLiftPx): number {
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
    this.jumpBuffer = FEEL.jumpBufferS;
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
    this.jumpT = Math.max(0, this.jumpT - dt);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.wallCd = Math.max(0, this.wallCd - dt);

    if (this.jumpBuffer > 0) {
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.hopStarted = this.startHop();
    }

    this.slide(dt);
    this.motion.bank = this.carve();
  }

  hurt(): boolean {
    if (this.invuln > 0 || this.airborne) return false;
    this.hp -= 1;
    this.invuln = FEEL.hurtInvulnS;
    return true;
  }

  /**
   * A bend throws the raft at the outside wall. Hug the rim through one and it climbs off the
   * flow, grinding for speed all the way (§4.2) until the water lets go entirely (§4.4).
   * The pull reads the steered lane, not the slid one, so the slide cannot feed itself.
   */
  private slide(dt: number): void {
    this.slip = stepSlip(this.slip, slipPull(this.laneCenter, chuteBank(this.z), this.airborne), dt);
    const off = this.offChute;
    if (off) this.scrapeWall();
    this.fallT = stepFall(this.fallT, off, dt);
    if (!this.fallen && this.fallT >= FALL_TIME) {
      this.fallen = true;
      // Ending through hp keeps one failure path: the shell reads `fallen` for the wording.
      this.hp = 0;
    }
  }

  /** Leaning on a wall you cannot pass: costs speed rather than doing nothing at all. */
  private scrapeWall(): void {
    if (this.wallCd > 0) return;
    this.wallCd = FEEL.wallScrapeCdS;
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
    const bank = swing * FEEL.switchCarve + Math.abs(chuteBank(this.z)) * FEEL.chuteCarve;
    return Math.min(1, bank) * (this.airborne ? FEEL.airCarve : 1);
  }
}
