import { CANVAS } from "../data/constants";

/** 场景 ID（GAME_SPEC §5：boot → title → playing ⇄ paused → gameover → title） */
export type SceneId = "boot" | "title" | "playing" | "paused" | "gameover";

/** 合法场景迁移表；键 = 当前场景，值 = 允许进入的下一场景 */
const SCENE_FLOW: Record<SceneId, readonly SceneId[]> = {
  boot: ["title"],
  title: ["playing"],
  playing: ["paused", "gameover"],
  paused: ["playing", "title"],
  gameover: ["playing", "title"],
};

export type SceneListener = (next: SceneId, prev: SceneId) => void;

/**
 * Engine：画布 backing store / 逻辑坐标系 / 场景状态机的唯一持有者。
 *
 * 契约：
 * - 所有绘制代码工作在 CANVAS.w × CANVAS.h 的逻辑坐标系；Engine 按
 *   devicePixelRatio（上限 CANVAS.maxDpr）放大 backing store 并通过
 *   setTransform 抹平差异，绘制模块不感知物理像素。
 * - DPR 变化（跨屏拖动窗口、浏览器缩放）与 resize 自动重建 backing store。
 * - Canvas2D 上下文丢失（contextlost/contextrestored，Chromium 系支持）
 *   自动恢复：游戏每帧全量重绘，恢复只需重建变换；丢失期间可通过
 *   contextLost 跳过无效绘制。
 * - 场景切换统一走 scene setter / setScene：同值幂等，不合法迁移
 *   console.warn 后仍放行（多代理协作下宁可吵闹也不软锁死游戏）。
 */
export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  private sceneValue: SceneId = "boot";
  private readonly sceneListeners = new Set<SceneListener>();
  private dprValue = 1;
  private lost = false;
  private readonly aborter = new AbortController();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.fit();

    const signal = this.aborter.signal;
    window.addEventListener("resize", () => this.fit(), { signal });
    this.watchDpr();

    canvas.addEventListener(
      "contextlost",
      (e: Event) => {
        e.preventDefault(); // 声明我们会自行恢复
        this.lost = true;
      },
      { signal },
    );
    canvas.addEventListener(
      "contextrestored",
      () => {
        this.lost = false;
        this.fit(); // 上下文重置会清空变换等状态
      },
      { signal },
    );
  }

  /** 当前场景；赋值等价于 setScene */
  get scene(): SceneId {
    return this.sceneValue;
  }

  set scene(next: SceneId) {
    this.setScene(next);
  }

  /** 切换场景。同值 no-op 返回 false；不合法迁移 warn 后仍执行。 */
  setScene(next: SceneId): boolean {
    const prev = this.sceneValue;
    if (next === prev) return false;
    if (!SCENE_FLOW[prev].includes(next)) {
      console.warn(`[engine] 非常规场景迁移 ${prev} → ${next}（规格 §5）`);
    }
    this.sceneValue = next;
    for (const fn of this.sceneListeners) fn(next, prev);
    return true;
  }

  /** 订阅场景变化（菜单/音频响应切换用），返回退订函数 */
  onSceneChange(fn: SceneListener): () => void {
    this.sceneListeners.add(fn);
    return () => this.sceneListeners.delete(fn);
  }

  /** 逻辑宽度（等于 CANVAS.w，绘制坐标系尺寸） */
  get width(): number {
    return CANVAS.w;
  }

  /** 逻辑高度（等于 CANVAS.h） */
  get height(): number {
    return CANVAS.h;
  }

  /** 当前生效的 devicePixelRatio（已被 CANVAS.maxDpr 截断） */
  get dpr(): number {
    return this.dprValue;
  }

  /** 2D 上下文是否处于丢失状态（丢失期间绘制是无效空操作） */
  get contextLost(): boolean {
    return this.lost;
  }

  /** 按 DPR 重建 backing store，并把逻辑坐标系映射到物理像素 */
  fit(): void {
    const dpr = Math.max(1, Math.min(CANVAS.maxDpr, window.devicePixelRatio || 1));
    this.dprValue = dpr;
    const bw = Math.round(CANVAS.w * dpr);
    const bh = Math.round(CANVAS.h * dpr);
    // 改 width/height 会整体重置上下文状态，尺寸未变时跳过
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** 以纯色清屏（逻辑坐标系全幅） */
  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
  }

  /** 移除全部监听；仅整体卸载时调用 */
  dispose(): void {
    this.aborter.abort();
    this.sceneListeners.clear();
  }

  /**
   * 监听 DPR 变化。resize 事件覆盖不了「窗口拖到另一块屏」的场景，
   * 需要对当前 dppx 建一次性 media query，触发后重挂到新值上。
   */
  private watchDpr(): void {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener(
      "change",
      () => {
        this.fit();
        this.watchDpr();
      },
      { once: true, signal: this.aborter.signal },
    );
  }
}
