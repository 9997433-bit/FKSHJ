import { Session } from "../games/sea/src/session";

type ProbeAction =
  | { kind: "key"; code: "KeyW" | "KeyA" | "KeyS" | "KeyD"; pressed: boolean }
  | { kind: "select-build"; buildingId: "floor" | "collector" }
  | { kind: "place-build"; gridX: number; gridY: number };

type TapeEntry = {
  tick: number;
  action: ProbeAction;
};

type ProbeSession = {
  update(dt: number): void;
  applyProbeAction?(action: ProbeAction): unknown;
  dispatchProbeAction?(action: ProbeAction): unknown;
  probeSnapshot?(): unknown;
  snapshot?(): unknown;
  setProbeSeed?(seed: number): void;
  resetForProbe?(seed: number): void;
  dispose?(): void;
};

type ProbeSessionOptions = {
  seed: number;
  headless: true;
};

const SessionConstructor = Session as unknown as new (
  options?: ProbeSessionOptions,
) => ProbeSession;

const SEED = 0x5ea5_2026;
const DT = 1 / 60;
const TOTAL_TICKS = 300;
const SNAPSHOT_INTERVAL = 30;

/**
 * Semantic input tape: sail east, turn north, extend the opening 3x3 raft by
 * two cells, then place a collector on the first new foundation.
 */
const TAPE: readonly TapeEntry[] = [
  { tick: 0, action: { kind: "key", code: "KeyD", pressed: true } },
  { tick: 54, action: { kind: "key", code: "KeyD", pressed: false } },
  { tick: 60, action: { kind: "key", code: "KeyW", pressed: true } },
  { tick: 102, action: { kind: "key", code: "KeyW", pressed: false } },
  { tick: 120, action: { kind: "select-build", buildingId: "floor" } },
  { tick: 121, action: { kind: "place-build", gridX: 2, gridY: 0 } },
  { tick: 150, action: { kind: "place-build", gridX: 3, gridY: 0 } },
  { tick: 180, action: { kind: "select-build", buildingId: "collector" } },
  { tick: 181, action: { kind: "place-build", gridX: 2, gridY: 0 } },
];

class ProbeNotWiredError extends Error {}

function actionDriver(session: ProbeSession): (action: ProbeAction) => unknown {
  if (typeof session.applyProbeAction === "function") {
    return (action) => session.applyProbeAction?.(action);
  }
  if (typeof session.dispatchProbeAction === "function") {
    return (action) => session.dispatchProbeAction?.(action);
  }
  throw new ProbeNotWiredError(
    "Session needs applyProbeAction(action) or dispatchProbeAction(action)",
  );
}

function snapshotReader(session: ProbeSession): () => unknown {
  if (typeof session.probeSnapshot === "function") return () => session.probeSnapshot?.();
  if (typeof session.snapshot === "function") return () => session.snapshot?.();
  throw new ProbeNotWiredError("Session needs probeSnapshot() or snapshot()");
}

function normalize(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "[NaN]";
    if (value === Number.POSITIVE_INFINITY) return "[Infinity]";
    if (value === Number.NEGATIVE_INFINITY) return "[-Infinity]";
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "function" || typeof value === "symbol") {
    throw new TypeError(`probe snapshot contains unsupported ${typeof value}`);
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) throw new TypeError("probe snapshot contains a cycle");

  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => normalize(item, seen));
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Map) {
      return [...value.entries()]
        .map(([mapKey, mapValue]) => [normalize(mapKey, seen), normalize(mapValue, seen)])
        .sort(([left], [right]) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
    }
    if (value instanceof Set) {
      return [...value.values()]
        .map((item) => normalize(item, seen))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    }
    if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);

    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) normalized[key] = normalize(record[key], seen);
    return normalized;
  } finally {
    seen.delete(value);
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function firstDifference(left: string, right: string): {
  offset: number;
  first: string;
  second: string;
} {
  let offset = 0;
  while (offset < left.length && offset < right.length && left[offset] === right[offset]) {
    offset += 1;
  }
  const start = Math.max(0, offset - 60);
  const end = offset + 120;
  return {
    offset,
    first: left.slice(start, end),
    second: right.slice(start, end),
  };
}

function runTape(): string {
  const session = new SessionConstructor({ seed: SEED, headless: true });
  try {
    if (typeof session.resetForProbe === "function") session.resetForProbe(SEED);
    else if (typeof session.setProbeSeed === "function") session.setProbeSeed(SEED);

    const dispatch = actionDriver(session);
    const readSnapshot = snapshotReader(session);
    const trace: Array<{ tick: number; state: unknown }> = [];
    let tapeIndex = 0;

    for (let tick = 0; tick < TOTAL_TICKS; tick += 1) {
      let actionApplied = false;
      while (tapeIndex < TAPE.length && TAPE[tapeIndex].tick === tick) {
        const accepted = dispatch(TAPE[tapeIndex].action);
        if (accepted === false) {
          throw new Error(`Session rejected probe action at tick ${tick}`);
        }
        tapeIndex += 1;
        actionApplied = true;
      }
      session.update(DT);
      if (actionApplied || tick % SNAPSHOT_INTERVAL === 0 || tick === TOTAL_TICKS - 1) {
        // Detach immediately: snapshot() may expose a live state object that is
        // mutated by later ticks, which would otherwise collapse the whole trace.
        trace.push({ tick, state: normalize(readSnapshot()) });
      }
    }

    if (tapeIndex !== TAPE.length) throw new Error("probe tape contains unreachable events");
    return canonicalJson(trace);
  } finally {
    session.dispose?.();
  }
}

try {
  const first = runTape();
  const second = runTape();
  if (first !== second) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          status: "nondeterministic",
          seed: SEED,
          tapeEvents: TAPE.length,
          difference: firstDifference(first, second),
        },
        null,
        2,
      ),
    );
    throw new Error("Session produced different traces for the same seed and input tape");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        status: "deterministic",
        seed: SEED,
        ticks: TOTAL_TICKS,
        dt: DT,
        tapeEvents: TAPE.length,
        traceBytes: first.length,
        traceHash: hashString(first),
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (!(error instanceof ProbeNotWiredError)) throw error;
  console.log(
    JSON.stringify(
      {
        ok: true,
        status: "not-wired",
        reason: error.message,
        note: "Session is still the Round 1 shell; rerun after the headless probe hooks are wired.",
        required: {
          constructor: "new Session({ seed, headless: true })",
          input: "applyProbeAction(action) or dispatchProbeAction(action)",
          snapshot: "probeSnapshot() or snapshot() returning simulation-only state",
        },
      },
      null,
      2,
    ),
  );
}
