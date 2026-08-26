import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateWorld, themeIndex } from "../world/levels";

describe("levels", () => {
  it("is deterministic for a seed", () => {
    const a = generateWorld(7);
    const b = generateWorld(7);
    assert.equal(a.pickups.length, b.pickups.length);
    assert.equal(a.hazards.length, b.hazards.length);
    assert.deepEqual(a.pickups[0], b.pickups[0]);
  });

  it("themeIndex clamps", () => {
    assert.equal(themeIndex(0), 0);
    assert.equal(themeIndex(499), 0);
    assert.equal(themeIndex(500), 1);
    assert.equal(themeIndex(99999), 3);
  });
});
