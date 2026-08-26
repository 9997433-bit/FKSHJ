import { LANES, PLAYER, SCORE, SPEED } from "./data/constants";
import { commitRun, loadSave } from "./data/save";
import { drawBooster } from "./entities/booster";
import { drawPickup } from "./entities/collectible";
import { drawHazard } from "./entities/obstacle";
import { Player } from "./entities/player";
import { Sfx } from "./fx/audio";
import { capParticles, drawParticles, MAX_PARTICLES, type Particle } from "./fx/particles";
import { bigSplash, boostWake, sparkle, splash } from "./fx/splash";
import { circleHit, sameLane } from "./game/collision";
import { project } from "./game/camera";
import { applyBoost, applyHit, comboBonus, stepSpeed } from "./game/physics";
import { generateWorld, type WorldStuff } from "./world/levels";
import { drawTrack } from "./world/track";
import { drawFoam, drawSilhouettes, drawSky } from "./world/water";
import { themeAt } from "./ui/theme";
import { drawHud } from "./ui/hud";
import { drawPlayerRing, ringRoll } from "./ui/tube";

export type RunResult = {
  score: number;
  distance: number;
  coins: number;
  isNew: boolean;
  hiScore: number;
};

export class Session {
  player = new Player();
  world: WorldStuff;
  particles: Particle[] = [];
  score = 0;
  distance = 0;
  combo = 0;
  comboT = 0;
  coins = 0;
  cleanHits = 0;
  time = 0;
  runId: number;
  sfx: Sfx;
  over = false;

  constructor(sfx: Sfx, runId = Date.now()) {
    this.sfx = sfx;
    this.runId = runId;
    this.world = generateWorld(runId);
  }

  get speed01(): number {
    const t = (this.player.motion.speed - SPEED.base) / (SPEED.max - SPEED.base);
    return Math.max(0, Math.min(1, t));
  }

  result(): RunResult {
    const prev = loadSave();
    const saved = commitRun(this.score, this.distance, this.coins);
    return {
      score: this.score,
      distance: this.distance,
      coins: this.coins,
      isNew: Math.floor(this.score) > prev.hiScore,
      hiScore: saved.hiScore,
    };
  }

  static hiScore(): number {
    return loadSave().hiScore;
  }

  update(dt: number, steer: -1 | 0 | 1, wantJump: boolean): void {
    if (this.over) return;
    this.time += dt;
    if (steer) this.player.trySwitch(steer);
    if (wantJump && this.player.tryJump()) this.sfx.jump();
    this.player.step(dt);
    if (this.player.consumeHopStart()) this.sfx.jump();
    const spd = stepSpeed(this.player.motion, dt);
    const dz = spd * dt * 0.2;
    this.distance += dz;
    this.score += dz * SCORE.distMul;
    this.player.z = this.distance;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    this.collect();
    this.hazards();
    this.boosts();
    if (this.player.hp <= 0) this.over = true;
  }

  private collect(): void {
    const pz = 80;
    const theme = themeAt(this.distance);
    for (const p of this.world.pickups) {
      if (p.taken) continue;
      const rel = p.z - this.distance;
      if (rel < -20 || rel > 220) continue;
      if (!sameLane(this.player.lane, p.lane)) continue;
      if (!circleHit(this.player.laneX, pz, PLAYER.radius, p.lane * LANES.width, rel, p.r)) continue;
      p.taken = true;
      const at = project(p.lane * LANES.width, rel);
      if (p.kind === "coin") {
        this.coins += 1;
        this.addCombo(1, SCORE.coin);
        sparkle(this.particles, at.x, at.y, theme.coin, 6);
        this.sfx.coin();
      } else if (p.kind === "gem") {
        this.addCombo(3, SCORE.gem);
        sparkle(this.particles, at.x, at.y, theme.gem, 12);
        this.sfx.gem();
      } else {
        this.addCombo(2, SCORE.ring);
        this.player.invuln = Math.max(this.player.invuln, 0.6);
        sparkle(this.particles, at.x, at.y, theme.ink, 14);
        this.sfx.ring();
      }
    }
  }

  private hazards(): void {
    const pz = 80;
    for (const h of this.world.hazards) {
      if (h.hit) continue;
      const rel = h.z - this.distance;
      if (rel < -20 || rel > 180) continue;
      if (!sameLane(this.player.lane, h.lane, h.kind === "vortex" ? 0.85 : 0.35)) continue;
      if (h.jumpable && this.player.airborne) continue;
      if (!circleHit(this.player.laneX, pz, PLAYER.radius, h.lane * LANES.width, rel, h.r)) continue;
      h.hit = true;
      if (h.kind === "vortex") {
        this.player.trySwitch(this.player.lane <= 0 ? 1 : -1);
        this.player.motion.speed *= 0.7;
      }
      if (this.player.hurt()) {
        applyHit(this.player.motion);
        this.combo = 0;
        this.cleanHits = 0;
        const at = project(h.lane * LANES.width, rel);
        bigSplash(this.particles, at.x, at.y, themeAt(this.distance).foam, this.speed01);
        this.sfx.hit();
      }
    }
  }

  private boosts(): void {
    for (const b of this.world.boosters) {
      if (b.used) continue;
      const rel = b.z - this.distance;
      if (rel < -10 || rel > 140) continue;
      if (!sameLane(this.player.lane, b.lane)) continue;
      b.used = true;
      applyBoost(this.player.motion);
      const at = project(b.lane * LANES.width, Math.max(0, rel));
      boostWake(this.particles, at.x, at.y, themeAt(this.distance).accent);
      this.sfx.boost(b.tier);
    }
  }

  private addCombo(n: number, base: number): void {
    this.combo += n;
    this.comboT = SCORE.comboTimeoutMs / 1000;
    this.score += base + comboBonus(this.combo);
    this.cleanHits += 1;
    if (this.cleanHits >= SCORE.healEvery && this.player.hp < PLAYER.maxHp) {
      this.player.hp += 1;
      this.cleanHits = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const theme = themeAt(this.distance);
    const speed01 = this.speed01;
    drawSky(ctx, theme, this.time);
    drawSilhouettes(ctx, theme, this.distance, this.time);
    drawTrack(ctx, this.distance, theme, this.time);
    drawFoam(ctx, theme, this.time, speed01);

    const drawables: { z: number; draw: () => void }[] = [];

    for (const b of this.world.boosters) {
      if (b.used) continue;
      const rel = b.z - this.distance;
      if (rel < 0 || rel > 1800) continue;
      drawables.push({
        z: rel,
        draw: () => {
          const pr = project(b.lane * LANES.width, rel);
          ctx.save();
          ctx.translate(pr.x, pr.y);
          ctx.scale(pr.s, pr.s);
          drawBooster(ctx, b.tier, this.time, theme.accent);
          ctx.restore();
        },
      });
    }

    for (const p of this.world.pickups) {
      if (p.taken) continue;
      const rel = p.z - this.distance;
      if (rel < 0 || rel > 1800) continue;
      drawables.push({
        z: rel,
        draw: () => {
          const pr = project(p.lane * LANES.width, rel);
          ctx.save();
          ctx.translate(pr.x, pr.y);
          ctx.scale(pr.s, pr.s);
          drawPickup(ctx, p.kind, this.time + p.z * 0.01, theme.accent);
          ctx.restore();
        },
      });
    }

    for (const h of this.world.hazards) {
      if (h.hit) continue;
      const rel = h.z - this.distance;
      if (rel < 0 || rel > 1800) continue;
      drawables.push({
        z: rel,
        draw: () => {
          const pr = project(h.lane * LANES.width, rel);
          ctx.save();
          ctx.translate(pr.x, pr.y);
          ctx.scale(pr.s, pr.s);
          drawHazard(ctx, h.kind, h.r, this.time + h.z * 0.01);
          ctx.restore();
        },
      });
    }

    drawables.push({
      z: 80,
      draw: () => {
        const pr = project(this.player.laneX, 80);
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.scale(pr.s, pr.s);
        drawPlayerRing(ctx, {
          theme,
          time: this.time,
          speed01,
          lift: this.player.hopLift(),
          roll: ringRoll(this.player),
          invuln: this.player.invuln,
        });
        ctx.restore();
        if (Math.random() < 0.3 + speed01 * 0.4) {
          splash(this.particles, pr.x, pr.y + 10, theme.foam, speed01);
        }
      },
    });

    drawables.sort((a, b) => b.z - a.z);
    for (const d of drawables) d.draw();

    capParticles(this.particles, MAX_PARTICLES);
    drawParticles(ctx, this.particles);

    drawHud(ctx, {
      score: this.score,
      distance: this.distance,
      combo: this.combo,
      hp: this.player.hp,
      theme,
      speed: this.player.motion.speed,
    });
  }
}
