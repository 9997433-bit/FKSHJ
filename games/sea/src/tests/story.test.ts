import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STORY_BEATS, beatById, createStory, updateStory } from "../story";

const STORY_ORDER = STORY_BEATS.map((b) => b.id);

describe("story unlock order", () => {
  it("queues and displays simultaneously unlocked beats in narrative order", () => {
    const buildings = { floor: 16, collector: 1, purifier: 1, fish: 1, turret: 1 };
    let elapsed = 700;
    let story = updateStory(createStory(), { day: 7, buildings, elapsed });

    assert.deepEqual(story.unlocked, STORY_ORDER);
    assert.equal(story.beat?.id, STORY_ORDER[0]);
    assert.deepEqual(story.queue, STORY_ORDER.slice(1));

    const displayed: string[] = [];
    for (let i = 0; i < STORY_ORDER.length; i++) {
      assert.ok(story.beat, `expected beat ${STORY_ORDER[i]} to be displayed`);
      displayed.push(story.beat.id);

      const definition = beatById(story.beat.id);
      assert.ok(definition);
      elapsed += definition.holdS;
      story = updateStory(story, { day: 7, buildings, elapsed });
    }

    assert.deepEqual(displayed, STORY_ORDER);
    assert.equal(story.beat, null);
    assert.deepEqual(story.queue, []);
  });
});
