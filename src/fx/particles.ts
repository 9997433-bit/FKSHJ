export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
};

export function spawnBurst(
  list: Particle[],
  x: number,
  y: number,
  color: string,
  n = 12,
): void {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    list.push({
      x,
      y,
      vx: Math.cos(a) * (40 + Math.random() * 80),
      vy: Math.sin(a) * (40 + Math.random() * 80) - 30,
      life: 0.45 + Math.random() * 0.25,
      max: 0.7,
      r: 2 + Math.random() * 3,
      color,
    });
  }
}

export function stepParticles(list: Particle[], dt: number): void {
  for (const p of list) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 80 * dt;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].life <= 0) list.splice(i, 1);
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[]): void {
  for (const p of list) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
