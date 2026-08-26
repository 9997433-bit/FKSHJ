export type Booster = {
  lane: number;
  z: number;
  used: boolean;
};

export function makeBooster(lane: number, z: number): Booster {
  return { lane, z, used: false };
}
