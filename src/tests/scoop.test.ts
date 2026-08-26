import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSkiff, nearestInScoop, SKIFF } from "../entities/skiff";
import { makeJunkField, pickJunk, spawnJunk } from "../world/junk";

describe("scoop target selection", () => {
  it("highlights exactly the radius-overlapping junk that pickJunk can collect", () => {
    const skiff = createSkiff(200, 200);
    const field = makeJunkField(0x5c00_2026, 0);
    const target = spawnJunk(field, {
      kind: "wood",
      x: skiff.x + SKIFF.scoopRadius,
      y: skiff.y,
      drift: 0,
    });
    target.r = 12;

    target.x = skiff.x + SKIFF.scoopRadius + target.r - 0.5;
    assert.ok(target.x - skiff.x > SKIFF.scoopRadius, "target center should be outside the base scoop radius");
    assert.equal(pickJunk(field, skiff.x, skiff.y), target);
    assert.equal(nearestInScoop(skiff, field.items.filter((junk) => !junk.taken)), target);

    target.x = skiff.x + SKIFF.scoopRadius + target.r + 0.5;
    assert.equal(pickJunk(field, skiff.x, skiff.y), null);
    assert.equal(nearestInScoop(skiff, field.items.filter((junk) => !junk.taken)), undefined);
  });
});
