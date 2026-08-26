import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gameoverCopy } from "../ui/menus";

describe("gameover copy", () => {
  it("distinguishes a washout from a deflated tube", () => {
    assert.deepEqual(gameoverCopy({ endedBy: "washout" }), {
      title: "冲出滑道",
      tag: "离心力把泳圈甩进了水里",
    });
    assert.deepEqual(gameoverCopy({ endedBy: "deflated" }), {
      title: "气漏光了",
      tag: "橡皮鸭和漩涡把泳圈撞瘪了",
    });
  });

  it("keeps the record headline and still names the cause", () => {
    assert.equal(gameoverCopy({ isNew: true, endedBy: "washout" }).title, "载入史册");
    assert.equal(gameoverCopy({ isNew: true, endedBy: "deflated" }).title, "载入史册");
    assert.match(gameoverCopy({ isNew: true, endedBy: "washout" }).tag, /甩进水里/);
  });

  it("falls back to the old landing line when the cause is unknown", () => {
    assert.equal(gameoverCopy({}).title, "冲上岸了");
    assert.equal(gameoverCopy({ isNew: true }).title, "载入史册");
  });
});
