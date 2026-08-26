import { generateWorld } from "../src/world/levels";
import { stepParticles, type Particle } from "../src/fx/particles";
import { stepSpeed, type Motion } from "../src/game/physics";

type BenchResult = {
  work: string;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  budgetMs: number;
  pass: boolean;
  checksum: number;
};

const WARMUPS = 3;
const SAMPLES = 9;
const WORLD_COUNT = 200;
const SPEED_STEPS = 200_000;
const PARTICLE_COUNT = 360;
const PARTICLE_FRAMES = 300;

function percentile(sorted: number[], value: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function measure<T>(
  work: string,
  budgetMs: number,
  prepare: () => T,
  run: (state: T) => number,
): BenchResult {
  let checksum = 0;
  for (let i = 0; i < WARMUPS; i++) checksum += run(prepare());

  const timings: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const state = prepare();
    const start = performance.now();
    checksum += run(state);
    timings.push(performance.now() - start);
  }

  if (!Number.isFinite(checksum)) throw new Error(`${work} produced a non-finite checksum`);
  timings.sort((a, b) => a - b);
  const medianMs = timings[Math.floor(timings.length / 2)];
  return {
    work,
    medianMs: rounded(medianMs),
    p95Ms: rounded(percentile(timings, 0.95)),
    minMs: rounded(timings[0]),
    budgetMs,
    pass: medianMs <= budgetMs,
    checksum: rounded(checksum),
  };
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    x: i % 30,
    y: Math.floor(i / 30),
    vx: (i % 7) - 3,
    vy: (i % 11) - 5,
    life: 30,
    max: 30,
    r: 2 + (i % 3),
    color: "#7cf7ff",
  }));
}

const results = [
  measure(
    `generateWorld × ${WORLD_COUNT}`,
    75,
    () => undefined,
    () => {
      let checksum = 0;
      for (let i = 0; i < WORLD_COUNT; i++) {
        const world = generateWorld(i);
        checksum += world.pickups.length + world.hazards.length + world.boosters.length;
      }
      return checksum;
    },
  ),
  measure(
    `stepSpeed × ${SPEED_STEPS}`,
    50,
    (): Motion => ({ speed: 280, boostLeft: 1.2 }),
    (motion) => {
      let checksum = 0;
      for (let i = 0; i < SPEED_STEPS; i++) checksum += stepSpeed(motion, 1 / 60);
      return checksum;
    },
  ),
  measure(
    `stepParticles × ${PARTICLE_COUNT} particles × ${PARTICLE_FRAMES} frames`,
    75,
    makeParticles,
    (particles) => {
      for (let i = 0; i < PARTICLE_FRAMES; i++) stepParticles(particles, 1 / 60);
      const first = particles[0];
      return particles.length + first.x + first.y + first.life;
    },
  ),
];

console.log(
  JSON.stringify({
    methodology: { warmups: WARMUPS, samples: SAMPLES, budgetMetric: "medianMs" },
    results,
  }, null, 2),
);

const failures = results.filter((result) => !result.pass);
if (failures.length > 0) {
  throw new Error(`benchmark budget exceeded: ${failures.map((result) => result.work).join(", ")}`);
}
