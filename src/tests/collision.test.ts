import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { circleHit, sameLane } from "../game/collision";

describe("collision", () => {
  it("circleHit detects overlap", () => {
    assert.equal(circleHit(0, 0, 10, 5, 0, 10), true);
    assert.equal(circleHit(0, 0, 10, 40, 0, 10), false);
  });

  it("sameLane respects tolerance", () => {
    assert.equal(sameLane(0, 0), true);
    assert.equal(sameLane(0, 1), false);
    assert.equal(sameLane(0, 0.2), true);
  });
});
