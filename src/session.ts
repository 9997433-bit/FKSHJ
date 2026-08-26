/** 一局聚合。Round 1 由父调度器按各代理模块接线。 */
export class Session {
  time = 0;
  over = false;
  update(_dt: number): void {
    this.time += _dt;
  }
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#063a4d";
    ctx.fillRect(0, 0, 1280, 720);
  }
}
