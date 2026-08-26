import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Session } from "../session";

const SEED = 0x5ea5_2026;

describe("headless Session", () => {
  it("produces the same snapshot for the same seed", () => {
    const first = new Session({ seed: SEED, headless: true });
    const second = new Session({ seed: SEED, headless: true });

    first.update(1 / 60);
    second.update(1 / 60);

    assert.deepEqual(first.snapshot(), second.snapshot());
  });

  it("plays a build tape through floor and collector placement", () => {
    const session = new Session({ seed: SEED, headless: true });
    const beforeFloor = session.snapshot();
    const woodBeforeFloor = session.res.wood;
    const ropeBeforeFloor = session.res.rope;

    session.applyProbeAction({ kind: "select-build", buildingId: "floor" });
    session.applyProbeAction({ kind: "place-build", gridX: 2, gridY: 0 });

    assert.equal(session.snapshot().tiles, beforeFloor.tiles + 1);
    assert.ok(session.res.wood < woodBeforeFloor);
    assert.ok(session.res.rope < ropeBeforeFloor);

    const builtBeforeCollector = session.built;
    session.applyProbeAction({ kind: "select-build", buildingId: "collector" });
    session.applyProbeAction({ kind: "place-build", gridX: 2, gridY: 0 });

    assert.equal(session.built, builtBeforeCollector + 1);
  });

  it("rejects a diagonal-only floor placement", () => {
    const session = new Session({ seed: SEED, headless: true });
    const tilesBefore = session.snapshot().tiles;

    session.applyProbeAction({ kind: "select-build", buildingId: "floor" });
    session.applyProbeAction({ kind: "place-build", gridX: 2, gridY: 2 });

    assert.equal(session.snapshot().tiles, tilesBefore);
  });
});
