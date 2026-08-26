import { PLAYER } from "../src/data/constants";
import { Sfx } from "../src/fx/audio";
import { Session } from "../src/session";

type Steer = -1 | 0 | 1;
type TapeEvent = {
  frame: number;
  steer: Steer;
  jump: boolean;
};

const RUN_ID = 0xc0ffee;
const DT = 1 / 60;
const TOTAL_FRAMES = 1_200;

// Discrete key presses captured as a reproducible 20-second input tape.
const INPUT_TAPE: readonly TapeEvent[] = [
  { frame: 0, steer: 0, jump: true },
  { frame: 45, steer: -1, jump: true },
  { frame: 90, steer: 1, jump: true },
  { frame: 135, steer: 1, jump: true },
  { frame: 180, steer: -1, jump: true },
  { frame: 225, steer: -1, jump: true },
  { frame: 270, steer: 1, jump: true },
  { frame: 315, steer: 0, jump: true },
  { frame: 360, steer: 1, jump: true },
  { frame: 405, steer: -1, jump: true },
  { frame: 450, steer: -1, jump: true },
  { frame: 495, steer: 1, jump: true },
  { frame: 540, steer: 1, jump: true },
  { frame: 585, steer: 0, jump: true },
  { frame: 630, steer: -1, jump: true },
  { frame: 675, steer: 1, jump: true },
  { frame: 720, steer: 1, jump: true },
  { frame: 765, steer: -1, jump: true },
  { frame: 810, steer: -1, jump: true },
  { frame: 855, steer: 0, jump: true },
  { frame: 900, steer: 1, jump: true },
  { frame: 945, steer: -1, jump: true },
  { frame: 990, steer: -1, jump: true },
  { frame: 1_035, steer: 1, jump: true },
  { frame: 1_080, steer: 1, jump: true },
  { frame: 1_125, steer: -1, jump: true },
  { frame: 1_170, steer: 0, jump: true },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`session probe assertion failed: ${message}`);
}

function snapshot(session: Session) {
  return {
    runId: session.runId,
    score: session.score,
    distance: session.distance,
    hp: session.player.hp,
    coins: session.coins,
    combo: session.combo,
    lane: session.player.lane,
    speed: session.player.motion.speed,
    boostLeft: session.player.motion.boostLeft,
    over: session.over,
    pickupsTaken: session.world.pickups.filter((pickup) => pickup.taken).length,
    hazardsHit: session.world.hazards.filter((hazard) => hazard.hit).length,
    boostersUsed: session.world.boosters.filter((booster) => booster.used).length,
  };
}

function replay(runId: number): ReturnType<typeof snapshot> {
  const session = new Session(new Sfx(), runId);
  let tapeIndex = 0;

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    let steer: Steer = 0;
    let jump = false;
    const event = INPUT_TAPE[tapeIndex];
    if (event?.frame === frame) {
      steer = event.steer;
      jump = event.jump;
      tapeIndex += 1;
    }

    session.update(DT, steer, jump);
    assert(Number.isFinite(session.score), `score became non-finite at frame ${frame}`);
    assert(Number.isFinite(session.player.hp), `hp became non-finite at frame ${frame}`);
  }

  assert(tapeIndex === INPUT_TAPE.length, "not every canned input event was consumed");
  assert(session.score >= 0, "score must be non-negative");
  assert(session.distance > 0, "distance did not advance");
  assert(session.player.hp >= 0 && session.player.hp <= PLAYER.maxHp, "hp is outside the valid range");
  return snapshot(session);
}

const first = replay(RUN_ID);
const second = replay(RUN_ID);
assert(
  JSON.stringify(first) === JSON.stringify(second),
  `same-runId replay diverged:\nfirst=${JSON.stringify(first)}\nsecond=${JSON.stringify(second)}`,
);

console.log(JSON.stringify({
  sessionProbe: {
    runId: RUN_ID,
    frames: TOTAL_FRAMES,
    inputEvents: INPUT_TAPE.length,
    deterministic: true,
    snapshot: {
      ...first,
      score: Number(first.score.toFixed(3)),
      distance: Number(first.distance.toFixed(3)),
      speed: Number(first.speed.toFixed(3)),
      boostLeft: Number(first.boostLeft.toFixed(3)),
    },
  },
}, null, 2));
