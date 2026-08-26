import { GEN, THEME_ORDER } from "../data/constants";
import { makeBooster, type Booster } from "../entities/booster";
import { makePickup, type Pickup } from "../entities/collectible";
import { makeHazard, type Hazard } from "../entities/obstacle";

export type WorldStuff = {
  pickups: Pickup[];
  hazards: Hazard[];
  boosters: Booster[];
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function generateWorld(runId: number): WorldStuff {
  const rand = rng(0x51ed ^ runId);
  const pickups: Pickup[] = [];
  const hazards: Hazard[] = [];
  const boosters: Booster[] = [];

  for (let z = 220; z < GEN.horizon * 3; z += GEN.coinGap) {
    const lane = Math.floor(rand() * 5) - 2;
    const roll = rand();
    if (roll < 0.08) pickups.push(makePickup("gem", lane, z));
    else if (roll < 0.14) pickups.push(makePickup("ring", lane, z + 30));
    else pickups.push(makePickup("coin", lane, z));
  }

  for (let z = 380; z < GEN.horizon * 3; z += GEN.obstacleGap) {
    const density = 0.55 + Math.min(0.35, z / 8000);
    if (rand() > density) continue;
    const lane = Math.floor(rand() * 5) - 2;
    const r = rand();
    const kind = r < 0.55 ? "tube" : r < 0.8 ? "duck" : "vortex";
    hazards.push(makeHazard(kind, lane, z));
    if (rand() < 0.2) boosters.push(makeBooster(Math.max(-2, Math.min(2, lane + 1)), z + 70));
  }

  return { pickups, hazards, boosters };
}

export function themeIndex(distance: number): number {
  return Math.min(THEME_ORDER.length - 1, Math.floor(distance / GEN.segmentLen));
}
