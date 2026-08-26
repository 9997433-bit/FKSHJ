/**
 * Headless microbenchmarks for the three simulation hot paths.
 *
 * Keep these kernels deterministic: that makes regressions attributable to code
 * changes instead of world-generation noise. Budgets are deliberately applied
 * to the median of seven samples so an isolated noisy VM timeslice does not
 * fail the run; p95 is still reported for diagnosis.
 */

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

type BenchCase = {
  name: string;
  budgetMs: number;
  operations: number;
  run(): number;
};

type Point = { x: number; y: number };
type Debris = { x: number; y: number; vx: number; spin: number };

const SAMPLE_COUNT = 7;
const WARMUP_COUNT = 2;
const DIRS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const parsedMultiplier = Number(process.env.BENCH_BUDGET_MULTIPLIER ?? "1");
const budgetMultiplier =
  Number.isFinite(parsedMultiplier) && parsedMultiplier > 0 ? parsedMultiplier : 1;

let blackHole = 0;

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Grow a connected raft from the 3x3 opening platform. The frontier set models
 * placement validation and prevents duplicate candidates as the perimeter grows.
 */
function raftExpansionKernel(): number {
  const scenarioCount = 12;
  const targetTiles = 2_048;
  let checksum = 0;

  for (let scenario = 0; scenario < scenarioCount; scenario += 1) {
    const occupied = new Set<string>();
    const frontierKeys = new Set<string>();
    const frontier: Point[] = [];

    const enqueueNeighbors = (x: number, y: number) => {
      for (const dir of DIRS) {
        const next = { x: x + dir.x, y: y + dir.y };
        const nextKey = key(next.x, next.y);
        if (!occupied.has(nextKey) && !frontierKeys.has(nextKey)) {
          frontierKeys.add(nextKey);
          frontier.push(next);
        }
      }
    };

    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) occupied.add(key(x, y));
    }
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) enqueueNeighbors(x, y);
    }

    let cursor = 0;
    while (occupied.size < targetTiles) {
      const cell = frontier[cursor];
      cursor += 1;
      if (!cell) throw new Error("raft frontier exhausted before reaching target");
      const cellKey = key(cell.x, cell.y);
      frontierKeys.delete(cellKey);
      if (occupied.has(cellKey)) continue;
      occupied.add(cellKey);
      enqueueNeighbors(cell.x, cell.y);
      checksum = (checksum + Math.imul(cell.x + 2_048, cell.y + 4_096)) | 0;
    }
    checksum ^= occupied.size + frontierKeys.size + scenario;
  }

  return checksum;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/**
 * Spawn, drift and compact floating debris. This intentionally exercises object
 * allocation plus the in-place cull used by a long-lived world entity list.
 */
function debrisGenerationKernel(): number {
  const frameCount = 12_000;
  const maxDebris = 900;
  const dt = 1 / 60;
  const rng = createRng(0xc0ffee);
  const debris: Debris[] = [];
  let spawnCredit = 0;
  let spawned = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    let write = 0;
    for (let read = 0; read < debris.length; read += 1) {
      const item = debris[read];
      item.x += item.vx * dt;
      item.y += Math.sin(item.spin + frame * 0.015) * 0.08;
      item.spin += dt;
      if (item.x > -96) {
        debris[write] = item;
        write += 1;
      }
    }
    debris.length = write;

    spawnCredit += 0.72;
    while (spawnCredit >= 1 && debris.length < maxDebris) {
      spawnCredit -= 1;
      debris.push({
        x: 1_376 + rng() * 240,
        y: 48 + rng() * 624,
        vx: -(32 + rng() * 44),
        spin: rng() * Math.PI * 2,
      });
      spawned += 1;
    }
  }

  let checksum = spawned ^ debris.length;
  for (let i = 0; i < debris.length; i += 23) {
    checksum ^= Math.round(debris[i].x * 31 + debris[i].y * 17);
  }
  return checksum;
}

/**
 * Advance collector/purifier/fishing output and islander water/food demand.
 * Resource clamping and periodic construction purchases keep both producer and
 * consumer branches active throughout the sample.
 */
function productionConsumptionKernel(): number {
  const stepCount = 600_000;
  const dt = 1 / 60;
  const resources = {
    wood: 80,
    plastic: 60,
    water: 40,
    food: 36,
  };
  let collectors = 2;
  let purifiers = 2;
  let fishers = 2;
  let islanders = 6;
  let starvationSeconds = 0;
  let checksum = 0;

  for (let step = 1; step <= stepCount; step += 1) {
    resources.wood += collectors * 0.34 * dt;
    resources.plastic += collectors * 0.22 * dt;
    resources.water += purifiers * 0.48 * dt - islanders * 0.115 * dt;
    resources.food += fishers * 0.39 * dt - islanders * 0.09 * dt;

    resources.wood = Math.min(999, Math.max(0, resources.wood));
    resources.plastic = Math.min(999, Math.max(0, resources.plastic));
    resources.water = Math.min(240, Math.max(0, resources.water));
    resources.food = Math.min(240, Math.max(0, resources.food));

    if (resources.water === 0 || resources.food === 0) starvationSeconds += dt;
    else starvationSeconds = Math.max(0, starvationSeconds - dt * 0.5);

    if (step % 1_800 === 0 && resources.wood >= 24 && resources.plastic >= 14) {
      resources.wood -= 24;
      resources.plastic -= 14;
      const choice = (step / 1_800) % 3;
      if (choice === 0) collectors += 1;
      else if (choice === 1) purifiers += 1;
      else fishers += 1;
    }
    if (step % 7_200 === 0 && resources.food > 80 && resources.water > 80) islanders += 1;
    if (step % 10_000 === 0) {
      checksum ^= Math.round(
        resources.wood * 3 +
          resources.plastic * 5 +
          resources.water * 7 +
          resources.food * 11 +
          starvationSeconds,
      );
    }
  }

  return checksum ^ collectors ^ purifiers ^ fishers ^ islanders;
}

const cases: BenchCase[] = [
  {
    name: "raft-expansion",
    budgetMs: 120,
    operations: 12 * (2_048 - 9),
    run: raftExpansionKernel,
  },
  {
    name: "debris-generation",
    budgetMs: 225,
    operations: 12_000,
    run: debrisGenerationKernel,
  },
  {
    name: "production-consumption-step",
    budgetMs: 80,
    operations: 600_000,
    run: productionConsumptionKernel,
  },
];

const results = cases.map((bench) => {
  for (let i = 0; i < WARMUP_COUNT; i += 1) blackHole ^= bench.run();

  const samples: number[] = [];
  let expectedChecksum: number | undefined;
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const started = performance.now();
    const checksum = bench.run();
    samples.push(performance.now() - started);
    if (expectedChecksum === undefined) expectedChecksum = checksum;
    else if (checksum !== expectedChecksum) {
      throw new Error(`${bench.name} produced a nondeterministic checksum`);
    }
    blackHole = Math.imul(blackHole ^ checksum, 16_777_619);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const budgetMs = bench.budgetMs * budgetMultiplier;
  return {
    name: bench.name,
    operations: bench.operations,
    samples: SAMPLE_COUNT,
    medianMs: Number(medianMs.toFixed(3)),
    p95Ms: Number(p95Ms.toFixed(3)),
    opsPerSecond: Math.round(bench.operations / (medianMs / 1_000)),
    budgetMs,
    pass: medianMs <= budgetMs,
  };
});

const failed = results.filter((result) => !result.pass);
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      budgetMetric: "median",
      budgetMultiplier,
      results,
      checksum: blackHole >>> 0,
    },
    null,
    2,
  ),
);

if (failed.length > 0) {
  console.error(
    `benchmark budget exceeded: ${failed.map((result) => result.name).join(", ")}`,
  );
  process.exitCode = 1;
}
