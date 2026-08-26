import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GEN, THEME_ORDER } from "../data/constants";
import {
  generateAhead,
  generateWorld,
  seedWorld,
  spawnTableAt,
  themeCycleAt,
  themeIndex,
  THEME_CYCLE,
} from "../world/levels";

/** Everything that has to match for two worlds to be considered the same. */
function shape(world: ReturnType<typeof generateWorld>) {
  return {
    pickups: world.pickups.map((p) => [p.kind, p.lane, Math.round(p.z * 1e6)]),
    hazards: world.hazards.map((h) => [h.kind, h.lane, Math.round(h.z * 1e6)]),
    boosters: world.boosters.map((b) => [b.lane, Math.round(b.z * 1e6), b.tier]),
  };
}

describe("streaming world", () => {
  it("keeps appending instead of running dry past the pregenerated horizon", () => {
    const world = generateWorld(7);
    const pregenerated = world.pickups.length;
    assert.ok(pregenerated > 0);

    // Walk far past the initial fill and check the camera always has content ahead.
    for (let distance = 0; distance <= 60_000; distance += 400) {
      generateAhead(world, distance + GEN.horizon);
      const ahead = world.pickups.filter((p) => p.z > distance && p.z < distance + GEN.horizon);
      assert.ok(ahead.length > 0, `no pickups ahead of ${distance}`);
    }
    assert.ok(world.pickups.length > pregenerated * 5);
    assert.ok(world.hazards.length > 0);
    assert.ok(world.boosters.length > 0);
  });

  it("produces the same world however the appends are chunked", () => {
    const monolithic = generateWorld(0xc0ffee, 40_000);

    const chunked = generateWorld(0xc0ffee, 1_000);
    for (let to = 1_137; to < 40_000; to += 1_137) generateAhead(chunked, to);
    generateAhead(chunked, 40_000);

    assert.deepEqual(shape(chunked), shape(monolithic));
  });

  it("ignores appends that do not move the cursor forward", () => {
    const world = generateWorld(11, 5_000);
    const before = shape(world);
    generateAhead(world, 5_000);
    generateAhead(world, 100);
    assert.deepEqual(shape(world), before);
  });

  it("leaves hand-built worlds without a cursor alone", () => {
    const world = { pickups: [], hazards: [], boosters: [] };
    generateAhead(world, 10_000);
    assert.equal(world.pickups.length, 0);
  });

  it("cycles theme segments and spawn tables instead of sticking on the last one", () => {
    assert.equal(themeIndex(THEME_CYCLE), 0);
    assert.equal(themeIndex(THEME_CYCLE + GEN.segmentLen), 1);
    for (let lap = 0; lap < 4; lap++) {
      for (let i = 0; i < THEME_ORDER.length; i++) {
        const z = lap * THEME_CYCLE + i * GEN.segmentLen + 10;
        assert.equal(themeIndex(z), i);
        assert.equal(spawnTableAt(z).id, THEME_ORDER[i]);
      }
    }
  });

  it("repeats theme colours every cycle and blends across the wrap", () => {
    for (const z of [0, 120, 640, 1_100, 1_700]) {
      assert.deepEqual(themeCycleAt(z + THEME_CYCLE * 3), themeCycleAt(z));
    }
    // The last few units of a lap must already be leaning back toward the first theme.
    const edge = themeCycleAt(THEME_CYCLE - 1);
    assert.notEqual(edge.water, themeCycleAt(THEME_CYCLE - 200).water);
  });

  it("mixes the day into the run seed but stays reproducible for a fixed day", () => {
    assert.equal(seedWorld(7, 0), 7);
    assert.equal(seedWorld(0, 19_000), 19_000);
    assert.equal(seedWorld(7, 19_000), seedWorld(7, 19_000));
    assert.notEqual(seedWorld(7, 19_000), seedWorld(7, 19_001));
    assert.ok(seedWorld(Date.now(), 19_000) >= 0);
  });
});
