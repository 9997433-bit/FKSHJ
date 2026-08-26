import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEEL, SPEED } from "../data/constants";
import { applyBoost, applyHit, applyWallScrape, comboBonus, stepSpeed, takeKick, type Motion } from "../game/physics";

describe("physics", () => {
  it("comboBonus matches spec", () => {
    assert.equal(comboBonus(0), 0);
    assert.equal(comboBonus(1), 0);
    assert.equal(comboBonus(4), 24);
  });

  it("hit slashes speed and clears boost", () => {
    const m: Motion = { speed: 400, boostLeft: 1 };
    applyHit(m);
    assert.ok(m.speed < 200);
    assert.equal(m.boostLeft, 0);
    assert.equal(m.hitstopLeft, FEEL.hitstopS);
    assert.equal(takeKick(m), FEEL.hitKick);
    assert.equal(takeKick(m), 0);
  });

  it("queues camera punches without touching the camera", () => {
    const m: Motion = { speed: SPEED.base, boostLeft: 0 };
    applyWallScrape(m);
    applyBoost(m);
    assert.ok(Math.abs(takeKick(m) - (FEEL.wallKick + FEEL.boostKick)) < 1e-9);
  });

  it("boost raises speed over time", () => {
    const m: Motion = { speed: 280, boostLeft: 0 };
    applyBoost(m);
    const before = m.speed;
    for (let i = 0; i < 20; i++) stepSpeed(m, 0.016);
    assert.ok(m.speed > before);
    assert.ok(m.boostLeft > 0);
  });
});
