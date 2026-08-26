import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateWorld, themeIndex } from "../world/levels";

describe("levels", () => {
  it("is deterministic for a seed", () => {
    const a = generateWorld(7);
    const b = generateWorld(7);

    assert.ok(a.pickups.length > 0);
    assert.ok(a.hazards.length > 0);
    assert.ok(a.boosters.length > 0);
    assert.deepEqual(a, b);
  });

  it("generates different worlds for different seeds", () => {
    const a = generateWorld(7);
    const b = generateWorld(8);

    assert.notDeepEqual(a, b);
  });

  it("themeIndex cycles after neon", () => {
    assert.equal(themeIndex(0), 0);
    assert.equal(themeIndex(499), 0);
    assert.equal(themeIndex(500), 1);
    assert.equal(themeIndex(2000), 0);
    assert.equal(themeIndex(99999), 3);
  });
});
