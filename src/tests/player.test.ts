import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEEL, LANES, PLAYER } from "../data/constants";
import { hopCurve, Player } from "../entities/player";
import { chuteBank } from "../game/camera";

describe("Player lane switching", () => {
  it("switches lanes once the current transition completes", () => {
    const player = new Player();

    assert.equal(player.trySwitch(1), true);
    assert.equal(player.trySwitch(-1), false);

    player.step(LANES.switchMs / 2000);
    assert.equal(player.lane, 1);
    assert.equal(player.laneX, LANES.width / 2);

    player.step(LANES.switchMs / 2000);
    assert.equal(player.lane, 1);
    assert.equal(player.laneX, LANES.width);
    assert.equal(player.trySwitch(-1), true);
  });

  it("clamps switches at both outer lanes", () => {
    const player = new Player();
    const finishSwitch = () => player.step(LANES.switchMs / 1000);

    for (let lane = 0; lane < LANES.max; lane++) {
      assert.equal(player.trySwitch(1), true);
      finishSwitch();
    }
    assert.equal(player.lane, LANES.max);
    assert.equal(player.trySwitch(1), false);

    for (let lane = LANES.max; lane > LANES.min; lane--) {
      assert.equal(player.trySwitch(-1), true);
      finishSwitch();
    }
    assert.equal(player.lane, LANES.min);
    assert.equal(player.trySwitch(-1), false);
  });

  it("lifts along the hop curve and returns to the water", () => {
    const player = new Player();

    assert.equal(player.hopLift(), 0);
    assert.equal(player.tryJump(), true);
    player.step(PLAYER.jumpMs / 2000);

    assert.ok(player.hopLift() > 0);
    assert.equal(player.hopLift(50), hopCurve(player.hopT) * 50);

    player.step(PLAYER.jumpMs / 2000);
    assert.equal(player.airborne, false);
    assert.equal(player.hopLift(), 0);
  });

  it("reports a buffered hop start exactly once", () => {
    const player = new Player();

    assert.equal(player.consumeHopStart(), false);
    assert.equal(player.tryJump(), true);
    player.step(PLAYER.jumpMs / 1000);
    assert.equal(player.tryJump(), false);

    const cooldownGap = (PLAYER.jumpCooldownMs - PLAYER.jumpMs) / 1000;
    player.step(cooldownGap + 0.001);

    assert.equal(player.airborne, true);
    assert.equal(player.consumeHopStart(), true);
    assert.equal(player.consumeHopStart(), false);
  });

  it("keeps the lane on the side of the chute the raft is still on", () => {
    const player = new Player();
    player.trySwitch(1);

    player.step(LANES.switchMs / 4000);
    assert.equal(player.lane, 0);
    assert.ok(player.collisionLane > 0 && player.collisionLane < 0.5);
    assert.equal(player.laneX, player.collisionLane * LANES.width);

    player.step(LANES.switchMs / 2000);
    assert.equal(player.lane, 1);
  });
});

/** World depth where the chute banks hardest to the left, throwing a raft at the right wall. */
const HARD_BEND_Z = 800;
const FRAME = 1 / 60;

function inLane(lane: number, z: number): Player {
  const player = new Player();
  player.z = z;
  for (let i = 0; i < Math.abs(lane); i++) {
    player.trySwitch(lane < 0 ? -1 : 1);
    player.step(LANES.switchMs / 1000);
  }
  return player;
}

/** Step until `done`, capped so a broken condition fails the assertion instead of hanging. */
function stepUntil(player: Player, done: () => boolean, limit: number): number {
  let elapsed = 0;
  while (!done() && elapsed < limit) {
    player.step(FRAME);
    elapsed += FRAME;
  }
  return elapsed;
}

describe("Player washing off the chute", () => {
  it("rides up the bank and washes out if it stays out there", () => {
    assert.ok(chuteBank(HARD_BEND_Z) < -0.9, "fixture wants the sharpest part of a bend");
    const player = inLane(LANES.max, HARD_BEND_Z);

    stepUntil(player, () => player.offChute, 2);
    assert.equal(player.offChute, true);
    assert.ok(player.collisionLane > LANES.max, "the bend should slide the raft past its lane");
    assert.equal(player.fallen, false);

    const held = stepUntil(player, () => player.fallen, FEEL.fallTimeS * 3);
    assert.ok(Math.abs(held - FEEL.fallTimeS) < 0.05, `washed out after ${held}s, not ${FEEL.fallTimeS}s`);
    assert.equal(player.hp, 0);
  });

  it("pays the wipeout timer back once the raft is over water again", () => {
    const player = inLane(LANES.max, HARD_BEND_Z);
    stepUntil(player, () => player.offChute, 2);
    stepUntil(player, () => false, FEEL.fallTimeS * 0.5);
    assert.ok(player.fallT > 0);

    assert.equal(player.trySwitch(-1), true);
    stepUntil(player, () => false, FEEL.fallTimeS * 2);
    assert.equal(player.offChute, false);
    assert.equal(player.fallT, 0);
    assert.equal(player.fallen, false);
    assert.equal(player.hp, PLAYER.maxHp);
  });

  it("leaves the middle lanes alone through the same bend", () => {
    for (const lane of [-1, 0, 1]) {
      const player = inLane(lane, HARD_BEND_Z);
      stepUntil(player, () => player.offChute, 2);
      assert.equal(player.slip, 0);
      assert.equal(player.laneX, lane * LANES.width);
      assert.equal(player.fallen, false);
    }
  });
});
