export type TickFn = (dt: number) => void;

export function createLoop(tick: TickFn): { start(): void; stop(): void } {
  let raf = 0;
  let last = 0;
  let running = false;

  const frame = (t: number) => {
    if (!running) return;
    const dt = last ? Math.min(0.033, (t - last) / 1000) : 0.016;
    last = t;
    tick(dt);
    raf = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
