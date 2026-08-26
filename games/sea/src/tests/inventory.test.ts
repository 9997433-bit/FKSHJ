import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addItems, createInventory, inventorySnapshot, removeItems } from "../sim/inventory";

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
