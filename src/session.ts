import { LANES, PLAYER, SCORE } from "./data/constants";
import { commitRun, loadSave } from "./data/save";
import { Player } from "./entities/player";
import { Sfx } from "./fx/audio";
import { drawParticles, type Particle } from "./fx/particles";
import { splash } from "./fx/splash";
import { circleHit, sameLane } from "./game/collision";
import { project } from "./game/camera";
import { applyBoost, applyHit, comboBonus, stepSpeed } from "./game/physics";
import { generateWorld, type WorldStuff } from "./world/levels";
import { drawTrack } from "./world/track";
import { drawFoam, drawSky } from "./world/water";
import { themeAt } from "./ui/theme";
import { drawHud } from "./ui/hud";

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

  result(): RunResult {
    const saved = commitRun(this.score, this.distance);
    return {
      score: this.score,
      distance: this.distance,
      coins: this.coins,
      isNew: this.score >= saved.hiScore && this.score > 0,
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
    for (const p of this.world.pickups) {
      if (p.taken) continue;
      const rel = p.z - this.distance;
      if (rel < -20 || rel > 220) continue;
      if (!sameLane(this.player.lane, p.lane)) continue;
      if (!circleHit(this.player.laneX, pz, PLAYER.radius, p.lane * LANES.width, rel, p.r)) continue;
      p.taken = true;
      if (p.kind === "coin") {
        this.coins += 1;
        this.addCombo(1, SCORE.coin);
        this.sfx.coin();
      } else if (p.kind === "gem") {
        this.addCombo(3, SCORE.gem);
        this.sfx.gem();
      } else {
        this.addCombo(2, SCORE.ring);
        this.player.invuln = Math.max(this.player.invuln, 0.6);
        this.sfx.gem();
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
      this.sfx.boost();
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
    drawSky(ctx, theme);
    drawTrack(ctx, this.distance, theme, this.time);
    drawFoam(ctx, theme, this.time);

    const drawables: { z: number; draw: () => void }[] = [];

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
          if (p.kind === "ring") {
            ctx.strokeStyle = theme.accent;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.fillStyle = p.kind === "gem" ? "#7cf7ff" : "#ffd166";
            ctx.beginPath();
            ctx.arc(0, 0, p.kind === "gem" ? 10 : 8, 0, Math.PI * 2);
            ctx.fill();
          }
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
          ctx.fillStyle = h.kind === "duck" ? "#ffd166" : h.kind === "vortex" ? "#3d7dff" : "#ff6b9a";
          ctx.beginPath();
          ctx.arc(0, 0, h.r * 0.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        },
      });
    }

    drawables.push({
      z: 80,
      draw: () => {
        const jumpLift = this.player.hopLift();
        const pr = project(this.player.laneX, 80);
        ctx.save();
        ctx.translate(pr.x, pr.y - jumpLift * pr.s);
        ctx.scale(pr.s, pr.s);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(0, 18, 26, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = this.player.invuln > 0 ? "#fff7ae" : "#ff5dab";
        ctx.beginPath();
        ctx.ellipse(0, 0, 30, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffe6f1";
        ctx.beginPath();
        ctx.ellipse(-8, -4, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (Math.random() < 0.4) splash(this.particles, pr.x, pr.y + 10, theme.foam);
      },
    });

    drawables.sort((a, b) => b.z - a.z);
    for (const d of drawables) d.draw();

    if (this.particles.length > 360) this.particles.splice(0, this.particles.length - 360);
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
