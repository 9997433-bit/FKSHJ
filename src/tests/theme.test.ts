import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { THEME_ORDER } from "../data/constants";
import { themeAt } from "../ui/theme";
import { themeIndex } from "../world/levels";

describe("distance themes", () => {
  it("maps segment boundaries to theme indices", () => {
    assert.equal(themeIndex(0), 0);
    assert.equal(themeIndex(499), 0);
    assert.equal(themeIndex(500), 1);
    assert.equal(themeIndex(1000), 2);
    assert.equal(themeIndex(1500), 3);
    assert.equal(themeIndex(2000), 0);
    assert.equal(themeIndex(99999), 3);
  });

  it("returns the theme selected by themeIndex outside the blend band", () => {
    for (const distance of [0, 200, 500, 700, 1000, 1200, 1500]) {
      assert.equal(themeAt(distance).id, THEME_ORDER[themeIndex(distance)]);
    }
  });
});
