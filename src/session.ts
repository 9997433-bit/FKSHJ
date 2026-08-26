import { bestDay, commitRun } from "./data/save";
import { sfx } from "./fx/audio";
import { MAX_PARTICLES, type Particle, capParticles, drawParticles, stepParticles } from "./fx/particles";
import { type Ripple, drawRipples, stepRipples } from "./fx/ripple";
import { boatWake, buildChips, scoopSplash } from "./fx/splash";
import {
  BUILDINGS,
  HOTBAR,
  RESOURCE_CAP,
  type PlaceableId,
  type Raft,
  type Resources,
  SEA_BOUNDS,
  SKIFF,
  allCells,
  canAfford,
  canPlace,
  createEconomy,
  createRaft,
  createResources,
  createRng,
  createSkiff,
  createThreats,
  crewOf,
  gain,
  isCoreDown,
  nearestInScoop,
  place,
  type Skiff,
  type ThreatState,
  beginScoop,
  updateEconomy,
  updateSkiff,
  updateThreats,
  worldToTile,
} from "./sim";
import { stormWarnRatio } from "./sim/threats";
import type { EndReason } from "./ui/menus";
import { drawHud, resetHud, type BuildSlot } from "./ui/hud";
import { drawJunkField, drawJunkHighlight, makeJunkField, reapJunk, type JunkField, updateJunk } from "./world/junk";
import { dayNumber, dayPhase, drawOcean, swayAt } from "./world/ocean";
import { drawRaft } from "./world/raft";

export type ProbeAction =
  | { kind: "key"; code: "KeyW" | "KeyA" | "KeyS" | "KeyD"; pressed: boolean }
  | { kind: "select-build"; buildingId: PlaceableId }
  | { kind: "place-build"; gridX: number; gridY: number };

export type SessionOpts = { seed?: number; headless?: boolean };

export type DrawOpts = {
  /** 菜单底下只留海面和木筏，不盖 HUD */
  hud?: boolean;
};

export class Session {
  time = 0;
  over = false;
  endedBy: EndReason | null = null;
  salvaged = 0;
  built = 0;
  seed: number;
  headless: boolean;

  raft: Raft;
  res: Resources;
  economy = createEconomy();
  threats: ThreatState;
  skiff: Skiff;
  junk: JunkField;
  selected: PlaceableId | null = null;
  rng: () => number;

  particles: Particle[] = [];
  ripples: Ripple[] = [];
  private keys = { w: false, a: false, s: false, d: false };
  private finished = false;

  constructor(opts: SessionOpts = {}) {
    this.seed = opts.seed ?? 0x5ea5_2026;
    this.headless = opts.headless ?? false;
    this.rng = createRng(this.seed);
    this.raft = createRaft();
    this.res = createResources();
    this.threats = createThreats();
    this.skiff = createSkiff();
    this.junk = makeJunkField(this.seed, 8);
    resetHud();
  }

  get day(): number {
    return dayNumber(this.time);
  }

  applyProbeAction(action: ProbeAction): boolean {
    if (action.kind === "key") {
      const on = action.pressed;
      if (action.code === "KeyW") this.keys.w = on;
      if (action.code === "KeyA") this.keys.a = on;
      if (action.code === "KeyS") this.keys.s = on;
      if (action.code === "KeyD") this.keys.d = on;
      return true;
    }
    if (action.kind === "select-build") {
      this.selected = action.buildingId;
      return true;
    }
    const id = this.selected ?? "floor";
    const check = place(this.raft, this.res, id, action.gridX, action.gridY);
    if (check.ok) this.built += 1;
    return true;
  }

  snapshot() {
    return {
      time: Number(this.time.toFixed(4)),
      day: this.day,
      over: this.over,
      wood: Math.floor(this.res.wood),
      plastic: Math.floor(this.res.plastic),
      metal: Math.floor(this.res.metal),
      water: Math.floor(this.res.water),
      food: Math.floor(this.res.food),
      tiles: this.raft.cells.size,
      boat: { x: Math.round(this.skiff.x), y: Math.round(this.skiff.y) },
      salvaged: this.salvaged,
    };
  }

  result() {
    const saved = commitRun(this.day, this.salvaged);
    return {
      days: this.day,
      built: this.built,
      salvaged: this.salvaged,
      isNew: saved.isBest,
      hiDays: saved.bestDay,
      endedBy: this.endedBy ?? "starved",
    };
  }

  static hiDays(): number {
    return bestDay();
  }

  dispose(): void {
    this.particles.length = 0;
    this.ripples.length = 0;
  }

  update(
    dt: number,
    steer?: { ax: number; ay: number; scoop?: boolean; click?: { x: number; y: number; secondary?: boolean } | null },
  ): void {
    if (this.over) return;
    this.time += dt;
    const ax = steer ? steer.ax : (this.keys.d ? 1 : 0) + (this.keys.a ? -1 : 0);
    const ay = steer ? steer.ay : (this.keys.s ? 1 : 0) + (this.keys.w ? -1 : 0);
    updateSkiff(this.skiff, ax, ay, dt, SEA_BOUNDS);

    if (steer?.scoop) this.tryScoop();

    const click = steer?.click ?? null;
    if (click) {
      if (click.secondary) this.selected = null;
      else this.tryPlaceAt(click.x, click.y);
    }

    updateJunk(this.junk, dt);
    const eco = updateEconomy(this.economy, this.raft, this.res, dt);
    const events = updateThreats(this.threats, this.raft, this.res, dt, this.rng);

    if (!this.headless) {
      sfx.setStorm(stormWarnRatio(this.threats));
      for (const ev of events) {
        if (ev.type === "storm-warn" || ev.type === "wave") sfx.warn();
        if (ev.type === "storm-strike" || ev.type === "core-hit" || ev.type === "cell-lost") sfx.hit();
        if (ev.type === "turret-fire") sfx.shoot();
        if (ev.type === "pirate-killed") sfx.scoop();
      }
      stepParticles(this.particles, dt);
      capParticles(this.particles, MAX_PARTICLES);
      stepRipples(this.ripples, dt);
      if (this.skiff.thrust > 0.2) {
        boatWake(this.particles, this.skiff.x, this.skiff.y, this.skiff.heading, "#9be7df");
      }
    }

    if (eco.starved) this.fail("starved");
    if (isCoreDown(this.raft)) this.fail("coreDown");
  }

  tryScoop(): boolean {
    if (!beginScoop(this.skiff)) return false;
    const haul = reapJunk(this.junk, this.skiff.x, this.skiff.y, SKIFF.scoopRadius);
    if (!haul) return false;
    gain(this.res, haul.kind, haul.amount);
    this.salvaged += 1;
    if (!this.headless) {
      scoopSplash(this.particles, haul.junk.x, haul.junk.y, "#7ad7ff");
      sfx.scoop();
    }
    return true;
  }

  private tryPlaceAt(x: number, y: number): boolean {
    if (!this.selected) return false;
    const tile = worldToTile(x, y);
    const id = this.selected;
    const check = place(this.raft, this.res, id, tile.gx, tile.gy);
    if (check.ok) {
      this.built += 1;
      if (!this.headless) {
        buildChips(this.particles, x, y, "#d2a36a");
        sfx.build();
      }
      return true;
    }
    if (!this.headless) sfx.deny();
    return false;
  }

  private fail(why: EndReason): void {
    if (this.over) return;
    this.over = true;
    this.endedBy = why;
    if (!this.headless && !this.finished) sfx.gameOver();
    this.finished = true;
  }

  draw(ctx: CanvasRenderingContext2D, hover?: { x: number; y: number }, opts: DrawOpts = {}): void {
    const storm01 = stormWarnRatio(this.threats);
    const palette = drawOcean(ctx, { time: this.time, storm01 });
    drawJunkField(ctx, this.junk, this.time);
    const near = nearestInScoop(
      this.skiff,
      this.junk.items.filter((j) => !j.taken),
    );
    if (near) drawJunkHighlight(ctx, near, this.time);

    const tile = hover ? worldToTile(hover.x, hover.y) : null;
    const ghost =
      this.selected && tile
        ? {
            gx: tile.gx,
            gy: tile.gy,
            id: this.selected,
            ok: canPlace(this.raft, this.res, this.selected, tile.gx, tile.gy),
          }
        : null;

    drawRaft(ctx, allCells(this.raft), {
      time: this.time,
      palette,
      ghost,
      cursor: tile,
      alert01: storm01,
      marks: this.threats.storm.targets,
    });

    this.drawPirates(ctx);
    this.drawSkiff(ctx);
    drawParticles(ctx, this.particles);
    drawRipples(ctx, this.ripples);

    if (opts.hud === false) return;

    const crew = crewOf(this.raft);
    const slots: BuildSlot[] = HOTBAR.map((id, i) => ({
      key: String(i + 1),
      name: BUILDINGS[id].name,
      icon: id,
      cost: costLabel(BUILDINGS[id].cost),
      affordable: canAfford(this.res, BUILDINGS[id].cost),
      selected: this.selected === id,
    }));

    drawHud(ctx, {
      day: this.day,
      dayProgress01: dayPhase(this.time),
      resources: {
        wood: Math.floor(this.res.wood),
        plastic: Math.floor(this.res.plastic),
        metal: Math.floor(this.res.metal),
        rope: Math.floor(this.res.rope),
      },
      water01: this.res.water / RESOURCE_CAP.water,
      food01: this.res.food / RESOURCE_CAP.food,
      islanders: { fed: this.economy.starving ? 0 : crew, total: crew },
      build: { slots, hint: "WASD 开船 · 空格捞 · 1–5 建造" },
      time: this.time,
    });
  }

  private drawSkiff(ctx: CanvasRenderingContext2D): void {
    const sway = swayAt(this.skiff.x, this.skiff.y, this.time, 0.6);
    ctx.save();
    ctx.translate(this.skiff.x + sway.dx, this.skiff.y + sway.dy);
    ctx.rotate(this.skiff.heading + sway.rot);
    ctx.fillStyle = "#c47a3a";
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-14, 11);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-14, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff6d8";
    ctx.fillRect(-5, -3.5, 9, 7);
    ctx.restore();
  }

  private drawPirates(ctx: CanvasRenderingContext2D): void {
    for (const p of this.threats.pirates) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = "#1b1210";
      ctx.fillRect(-16, -8, 32, 16);
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.moveTo(-2, -18);
      ctx.lineTo(14, -11);
      ctx.lineTo(-2, -7);
      ctx.fill();
      ctx.restore();
    }
  }
}

function costLabel(cost: Partial<Record<string, number>>): string {
  const names: Record<string, string> = { wood: "木", plastic: "塑", metal: "铁", rope: "绳" };
  return Object.entries(cost)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => `${names[k] ?? k}${n}`)
    .join(" ");
}
