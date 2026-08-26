export type HazardKind = "tube" | "vortex" | "duck";

export type Hazard = {
  kind: HazardKind;
  lane: number;
  z: number;
  r: number;
  hit: boolean;
  jumpable: boolean;
};

export function makeHazard(kind: HazardKind, lane: number, z: number): Hazard {
  return {
    kind,
    lane,
    z,
    r: kind === "vortex" ? 30 : 24,
    hit: false,
    jumpable: kind === "duck",
  };
}
