import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gameoverCopy } from "../ui/menus";

describe("gameoverCopy", () => {
  it("returns non-empty titles for starved, coreDown, and new-record branches", () => {
    const branches = [
      gameoverCopy({ endedBy: "starved", isNew: false }),
      gameoverCopy({ endedBy: "coreDown", isNew: false }),
      gameoverCopy({ endedBy: undefined, isNew: true }),
    ];

    for (const copy of branches) assert.ok(copy.title.trim().length > 0);
  });
});
