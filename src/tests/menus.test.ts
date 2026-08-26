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

  it("uses new-record copy for both explicit game-over reasons", () => {
    assert.deepEqual(gameoverCopy({ endedBy: "starved", isNew: true }), {
      title: "饿着肚子创了纪录",
      tag: "下次先把钓鱼台盖起来",
    });
    assert.deepEqual(gameoverCopy({ endedBy: "coreDown", isNew: true }), {
      title: "沉船前留下了传说",
      tag: "海盗抢得走木板，抢不走纪录",
    });
  });
});
