import { generateWorld } from "../src/world/levels";
import { comboBonus, stepSpeed, type Motion } from "../src/game/physics";

const t0 = performance.now();
for (let i = 0; i < 200; i++) generateWorld(i);
const genMs = performance.now() - t0;

const m: Motion = { speed: 280, boostLeft: 0 };
const t1 = performance.now();
for (let i = 0; i < 20000; i++) {
  stepSpeed(m, 0.016);
  comboBonus((i % 12) + 1);
}
const stepMs = performance.now() - t1;

console.log(
  JSON.stringify(
    { generateWorld_200: Number(genMs.toFixed(2)), stepSpeed_20k: Number(stepMs.toFixed(2)) },
    null,
    2,
  ),
);
