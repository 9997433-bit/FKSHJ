import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ITEM_USE } from "../data/constants";
import { addItems, createInventory, inventorySnapshot, removeItems, useItem } from "../sim/inventory";
import { createResources } from "../sim/rules";

describe("inventory atomicity", () => {
  it("rolls back a bundle addition when a later item cannot fit", () => {
    const inventory = createInventory({ wood: 98 }, { maxSlots: 1 });
    const before = inventorySnapshot(inventory);

    assert.equal(addItems(inventory, { wood: 1, plastic: 1 }), false);
    assert.deepEqual(inventorySnapshot(inventory), before);
  });

  it("does not remove any item when one bundle requirement is missing", () => {
    const inventory = createInventory({ wood: 3, plastic: 1 }, { maxSlots: 2 });
    const before = inventorySnapshot(inventory);

    assert.equal(removeItems(inventory, { wood: 2, plastic: 2 }), false);
    assert.deepEqual(inventorySnapshot(inventory), before);
  });
});

describe("item use", () => {
  it("keeps the edible and drinkable exchange rates in ITEM_USE", () => {
    assert.deepEqual(ITEM_USE, {
      kelp: { food: 4 },
      driedFish: { food: 8 },
      freshWater: { water: 8 },
    });
  });

  it("uses exactly one supported item at a time", () => {
    const inventory = createInventory({ kelp: 2 });
    const resources = createResources({ food: 10 });

    assert.deepEqual(useItem(inventory, resources, "kelp"), {
      ok: true,
      gained: { food: ITEM_USE.kelp.food },
      reason: null,
    });
    assert.deepEqual(inventorySnapshot(inventory), { kelp: 1 });
    assert.equal(resources.food, 14);
  });

  it("leaves both ledgers unchanged when the item is missing or cannot be used", () => {
    const inventory = createInventory({ wood: 2 });
    const resources = createResources({ food: 10 });
    const bagBefore = inventorySnapshot(inventory);
    const resourcesBefore = { ...resources };

    assert.deepEqual(useItem(inventory, resources, "kelp"), {
      ok: false,
      gained: {},
      reason: "not-held",
    });
    assert.deepEqual(useItem(inventory, resources, "wood"), {
      ok: false,
      gained: {},
      reason: "not-usable",
    });
    assert.deepEqual(inventorySnapshot(inventory), bagBefore);
    assert.deepEqual(resources, resourcesBefore);
  });

  it("consumes atomically while reporting the ITEM_USE gain after capping", () => {
    const inventory = createInventory({ freshWater: 2 });
    const resources = createResources({ water: 99 });

    assert.deepEqual(useItem(inventory, resources, "freshWater"), {
      ok: true,
      gained: { water: 1 },
      reason: null,
    });
    assert.deepEqual(useItem(inventory, resources, "freshWater"), {
      ok: true,
      gained: { water: 0 },
      reason: null,
    });
    assert.equal(resources.water, 100);
    assert.deepEqual(inventorySnapshot(inventory), {});
  });
});
