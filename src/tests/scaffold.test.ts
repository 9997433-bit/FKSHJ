import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANVAS, LOOP } from "../data/constants";

describe("scaffold", () => {
  it("keeps the logical canvas and frame clamp", () => {
    assert.equal(CANVAS.w, 1280);
    assert.equal(CANVAS.h, 720);
    assert.ok(LOOP.maxDtS <= 0.05);
  });
});
