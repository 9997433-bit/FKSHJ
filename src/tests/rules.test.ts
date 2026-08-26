import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEconomy, crewOf, netRates, updateEconomy } from "../sim/economy";
import {
  BUILDINGS,
  checkPlace,
  createRaft,
  createResources,
  isAdjacentToRaft,
  pay,
  place,
} from "../sim/rules";

describe("resource costs", () => {
  it("returns false without partially deducting an unaffordable cost", () => {
    const resources = createResources({ wood: 3, plastic: 9 });
    const before = { ...resources };

    assert.equal(pay(resources, { wood: 4, plastic: 5 }), false);
    assert.deepEqual(resources, before);
  });
});

describe("foundation placement", () => {
  it("accepts cardinal adjacency and rejects diagonal-only adjacency", () => {
    const raft = createRaft();
    const resources = createResources();

    assert.equal(isAdjacentToRaft(raft, 2, 0), true);
    assert.equal(checkPlace(raft, resources, "floor", 2, 0).ok, true);
    assert.equal(isAdjacentToRaft(raft, 2, 2), false);
    assert.deepEqual(checkPlace(raft, resources, "floor", 2, 2), {
      ok: false,
      reason: "not-adjacent",
      cost: BUILDINGS.floor.cost,
    });
  });
});

describe("production and consumption balance", () => {
  it("lets one purifier cover crew water use at a bounded rate", () => {
    const raft = createRaft();
    const resources = createResources({ plastic: 99, metal: 99, water: 10, food: 100 });

    assert.equal(place(raft, resources, "purifier", 1, 1).ok, true);
    assert.equal(crewOf(raft), 4);

    const waterRate = netRates(raft).water;
    assert.ok(waterRate > 0, `expected positive net water, got ${waterRate}`);
    assert.ok(waterRate < 1, `expected a bounded net water rate, got ${waterRate}`);

    const before = resources.water;
    updateEconomy(createEconomy(), raft, resources, 3);
    const gained = resources.water - before;
    assert.ok(gained > 1, `expected purifier to beat upkeep over one cycle, got ${gained}`);
    assert.ok(gained < 3, `expected upkeep to consume part of purifier output, got ${gained}`);
  });
});
