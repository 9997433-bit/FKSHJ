export type PickupKind = "coin" | "gem" | "ring";

export type Pickup = {
  kind: PickupKind;
  lane: number;
  z: number;
  taken: boolean;
  r: number;
};

export function makePickup(kind: PickupKind, lane: number, z: number): Pickup {
  return { kind, lane, z, taken: false, r: kind === "ring" ? 36 : 16 };
}
