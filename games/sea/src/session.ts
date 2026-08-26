import { isItemId, itemName } from "./data/catalog";
import { bestDay, commitRun, markSeen } from "./data/save";
import { sfx } from "./fx/audio";
import { MAX_PARTICLES, type Particle, capParticles, drawParticles, stepParticles } from "./fx/particles";
import { type Ripple, drawRipples, stepRipples } from "./fx/ripple";
import { boatWake, buildChips, salvageSplash } from "./fx/splash";
import {
  BUILDINGS,
  HOTBAR,
  RESOURCE_CAP,
  STARVE,
  type PlaceableId,
  type Raft,
  type Resources,
  SEA_BOUNDS,
  SKIFF,
  allCells,
  canAfford,
  canPlace,
  countBuilding,
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
  placeHint,
  type Skiff,
  type ThreatState,
  beginScoop,
  updateEconomy,
  updateSkiff,
  updateThreats,
  worldToTile,
} from "./sim";
import {
  canComplete,
  complete,
  completeHint,
  costLabel as requestCost,
  createBoard,
  nextMilestone,
  noteStorm,
  readyRequests,
  updateBoard,
  updateMilestones,
  type BoardState,
} from "./sim/expand";
import {
  DEFAULT_SLOTS,
  addItem,
  createInventory,
  createItemPity,
  listItems,
  rollItemDrop,
  useItem,
  usedSlots,
  type Inventory,
  type ItemPity,
} from "./sim/inventory";
import { stormWarnRatio } from "./sim/threats";
import { createStory, updateStory, type StoryState } from "./story";
import type { EndReason } from "./ui/menus";
import { clickBagStrip, drawHud, resetHud, type BuildSlot } from "./ui/hud";
import { itemLabel } from "./world/items";
import { drawJunkField, drawJunkHighlight, makeJunkField, reapJunk, type JunkField, updateJunk } from "./world/junk";
import { drawPirates, drawSkiff } from "./world/craft";
import { dayNumber, dayPhase, drawOcean } from "./world/ocean";
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
  bag: Inventory;
  story: StoryState;
  board: BoardState;
  selected: PlaceableId | null = null;
  rng: () => number;
  private denied: { text: string; at: number } | null = null;
  private loot: { name: string; qty: number; at: number } | null = null;
  private questDone: { name: string; reward?: string; at: number } | null = null;
  private pity: ItemPity = createItemPity();
  private seenThisRun = new Set<string>();

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
    this.bag = createInventory({}, { maxSlots: DEFAULT_SLOTS });
    this.story = createStory();
    this.board = createBoard();
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
    const saved = commitRun(this.day, this.salvaged, this.seenThisRun);
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
      else if (!this.tryBagClick(click.x, click.y)) this.tryPlaceAt(click.x, click.y);
    }

    updateJunk(this.junk, dt);
    const eco = updateEconomy(this.economy, this.raft, this.res, dt);
    const events = updateThreats(this.threats, this.raft, this.res, dt, this.rng);
    // 请求板必须接在威胁之后：贴单才消耗 rng，不贴单一次都不抽。
    // BOARD.firstS=12，探针 300 tick（5s）窗口内零贴单。
    const boardEvents = updateBoard(this.board, this.res, dt, this.rng);
    for (const ev of events) {
      if (ev.type === "storm-strike") noteStorm(this.board);
    }
    const mileEvents = updateMilestones(this.board, this.res, {
      day: this.day,
      tiles: this.raft.cells.size,
      purifiers: countBuilding(this.raft, "purifier"),
    });
    boardEvents.push(...mileEvents);
    this.story = updateStory(this.story, {
      day: this.day,
      buildings: {
        floor: countBuilding(this.raft, "floor"),
        collector: countBuilding(this.raft, "collector"),
        purifier: countBuilding(this.raft, "purifier"),
        fish: countBuilding(this.raft, "fish"),
        turret: countBuilding(this.raft, "turret"),
        core: countBuilding(this.raft, "core"),
      },
      elapsed: this.time,
    });

    if (!this.headless) {
      sfx.setStorm(stormWarnRatio(this.threats));
      for (const ev of events) {
        if (ev.type === "storm-warn" || ev.type === "wave") sfx.warn();
        if (ev.type === "storm-strike" || ev.type === "core-hit" || ev.type === "cell-lost") sfx.hit();
        if (ev.type === "turret-fire") sfx.shoot();
        if (ev.type === "pirate-killed") sfx.scoop();
      }
      for (const ev of boardEvents) {
        if (ev.type === "request-posted") sfx.warn();
        if (ev.type === "request-done") {
          sfx.questDone();
          this.questDone = { name: ev.request.title, reward: requestCost(ev.got), at: this.time };
        }
        if (ev.type === "request-expired") sfx.deny();
        if (ev.type === "milestone-done") {
          sfx.milestone();
          this.questDone = { name: ev.milestone.title, reward: requestCost(ev.got), at: this.time };
        }
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
    this.seenThisRun.add(haul.look);
    markSeen(haul.look);
    const extra = rollItemDrop(this.rng, this.pity);
    if (extra) {
      addItem(this.bag, extra, 1, { partial: true });
      this.seenThisRun.add(extra);
      markSeen(extra);
    }
    this.loot = {
      name: extra ? itemName(extra) : itemLabel(haul.look),
      qty: extra ? 1 : haul.amount,
      at: this.time,
    };
    if (!this.headless) {
      salvageSplash(this.particles, haul.junk.x, haul.junk.y, haul.look);
      sfx.scoop();
    }
    return true;
  }

  /** 交付板上第一条交得起的条子；没有可交的就提示缺料。 */
  tryDeliver(): boolean {
    if (this.over) return false;
    const ready = readyRequests(this.board, this.res);
    const target = ready[0] ?? this.board.open[0];
    if (!target) {
      this.denied = { text: "板上还没条子", at: this.time };
      if (!this.headless) sfx.deny();
      return false;
    }
    const out = complete(this.board, this.res, target.id);
    if (!out.ok) {
      this.denied = { text: completeHint(out.reason), at: this.time };
      if (!this.headless) sfx.deny();
      return false;
    }
    this.denied = null;
    this.questDone = { name: out.request.title, reward: requestCost(out.got), at: this.time };
    if (!this.headless) sfx.scoop();
    return true;
  }

  private bagHud() {
    return {
      used: usedSlots(this.bag),
      max: this.bag.maxSlots,
      items: listItems(this.bag).map((s) => ({ id: s.id, name: itemName(s.id), count: s.count })),
      onUse: (item: { id?: string }) => {
        if (item.id && isItemId(item.id)) this.tryUseItem(item.id);
      },
    };
  }

  private tryBagClick(x: number, y: number): boolean {
    return clickBagStrip(x, y, this.bagHud(), this.time);
  }

  tryUseItem(id: string): boolean {
    if (!isItemId(id)) {
      this.denied = { text: "这个不能吃", at: this.time };
      if (!this.headless) sfx.deny();
      return false;
    }
    const out = useItem(this.bag, this.res, id);
    if (!out.ok) {
      this.denied = { text: out.reason === "not-usable" ? "这个不能吃" : "袋里没有了", at: this.time };
      if (!this.headless) sfx.deny();
      return false;
    }
    this.denied = null;
    this.loot = { name: itemName(id), qty: 1, at: this.time };
    if (!this.headless) sfx.scoop();
    return true;
  }

  private tryPlaceAt(x: number, y: number): boolean {
    if (!this.selected) return false;
    const tile = worldToTile(x, y);
    const id = this.selected;
    const check = place(this.raft, this.res, id, tile.gx, tile.gy);
    if (check.ok) {
      this.built += 1;
      this.denied = null;
      if (!this.headless) {
        buildChips(this.particles, x, y, "#d2a36a");
        sfx.build();
      }
      return true;
    }
    this.denied = { text: placeHint(check.reason), at: this.time };
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

    drawPirates(ctx, this.threats.pirates, this.time, { palette });
    drawSkiff(ctx, this.skiff, this.time, { palette });
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
      build: { slots, hint: "WASD 开船 · 空格捞 · 1–5 建造 · Q 交付岛民条子" },
      time: this.time,
      storm01,
      starve01: this.economy.starve / STARVE.limitS,
      hintDanger: this.threats.pirates.length > 0 ? "海盗盯上木筏了" : undefined,
      placeHint:
        this.denied && this.time - this.denied.at < 2.5 ? this.denied.text : undefined,
      storyBeat: this.story.beat
        ? { title: this.story.beat.title, body: this.story.beat.body }
        : undefined,
      quest: questInfo(this.board, this.res),
      questDone:
        this.questDone && this.time - this.questDone.at < 2.2
          ? { name: this.questDone.name, reward: this.questDone.reward }
          : undefined,
      bagSlots: this.bagHud(),
      lootToast:
        this.loot && this.time - this.loot.at < 2.2
          ? { name: this.loot.name, qty: this.loot.qty }
          : undefined,
    });
  }
}

function questInfo(board: BoardState, res: Resources): { name: string; progress: string } | undefined {
  const req = board.open[0];
  if (req) {
    const ready = canComplete(board, res, req.id);
    const clock = `${Math.max(0, Math.ceil(req.ttl))}s`;
    return {
      name: `${req.who} · ${req.title}`,
      progress: ready ? `${requestCost(req.want)} · 按 Q 交付` : `${requestCost(req.want)} · ${clock}`,
    };
  }
  const mile = nextMilestone(board);
  if (!mile) return undefined;
  return { name: mile.title, progress: `${mile.have}/${mile.goal}` };
}

function costLabel(cost: Partial<Record<string, number>>): string {
  const names: Record<string, string> = { wood: "木", plastic: "塑", metal: "铁", rope: "绳" };
  return Object.entries(cost)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => `${names[k] ?? k}${n}`)
    .join(" ");
}
