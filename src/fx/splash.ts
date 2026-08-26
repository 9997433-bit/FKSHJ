import { spawnBurst, type Particle } from "./particles";

export function splash(list: Particle[], x: number, y: number, color: string): void {
  spawnBurst(list, x, y, color, 16);
}
