import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LANES, PLAYER } from "../data/constants";
import { hopCurve, Player } from "../entities/player";

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
});
