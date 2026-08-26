import { CANVAS } from "../data/constants";

export type SceneId = "title" | "playing" | "paused" | "gameover";

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  scene: SceneId = "title";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.fit();
    window.addEventListener("resize", () => this.fit());
  }

  fit(): void {
    this.canvas.width = CANVAS.w;
    this.canvas.height = CANVAS.h;
  }

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
  }
}
