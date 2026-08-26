import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBoard, updateBoard } from "../sim/expand";
import { createResources, createRng } from "../sim/rules";

const SEED = 0x728b_59b5;
const STEP_SECONDS = [1 / 60, 1, 5, 11] as const;

function runBoard(seed: number) {
  const board = createBoard();
  const resources = createResources({ wood: 99, plastic: 99, metal: 99, rope: 99 });
  const rng = createRng(seed);
  const eventBatches = [];

  for (let tick = 0; tick < 120; tick++) {
    eventBatches.push(updateBoard(board, resources, STEP_SECONDS[tick % STEP_SECONDS.length] ?? 0, rng));
  }

  return { board, eventBatches };
}

describe("request board determinism", () => {
  it("reproduces board state and events from the same seed", () => {
    const first = runBoard(SEED);
    const second = runBoard(SEED);

    assert.ok(first.board.seq > 3, "expected the run to exercise multiple random request rolls");
    assert.deepEqual(first, second);
  });
});
