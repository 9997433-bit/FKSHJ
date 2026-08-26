import { LOOP } from "../data/constants";

/**
 * 每帧回调。
 * @param dt      本帧模拟时长（秒），已被 clamp 到 LOOP.maxDtS
 * @param elapsed 累计模拟时长（秒）= 历次 dt 之和；暂停/隐藏期间不增长，
 *                适合做与游戏时间同步的动画相位
 */
export type TickFn = (dt: number, elapsed: number) => void;

export type GameLoop = {
  start(): void;
  stop(): void;
  /** 是否处于运行意图中（页面隐藏时仍为 true，恢复可见自动续跑） */
  readonly running: boolean;
  /** 最近一帧的 rAF 时间戳（ms，performance.now 时基）；未跑过帧为 0 */
  now(): number;
  /** 累计模拟时长（秒），与 TickFn 收到的 elapsed 一致 */
  elapsed(): number;
  /** 移除 visibilitychange 监听并停帧；仅整体卸载时调用 */
  dispose(): void;
};

/**
 * rAF 主循环。
 *
 * 契约：
 * - dt clamp：单帧最多推进 LOOP.maxDtS 秒，长时间挂起后不会一次性
 *   推进大量物理（隧穿/连击瞬间超时）。
 * - 隐藏即暂停：document.hidden 时主动停发帧（浏览器本身也会节流
 *   rAF，这里显式化语义），恢复可见后重置时间基准，隐藏期间的
 *   真实时间不计入 elapsed。
 * - 首帧与恢复帧没有可差分的上一帧时间戳，使用 LOOP.fallbackDtS。
 * - 模块在 Node 环境可安全 import（便于单测），仅 start 后才依赖 rAF。
 */
export function createLoop(tick: TickFn): GameLoop {
  let raf = 0;
  let last = 0; // 上一帧 rAF 时间戳；0 表示下一帧走 fallbackDt
  let running = false;
  let nowMs = 0;
  let elapsedS = 0;

  const frame = (t: number) => {
    if (!running) return;
    nowMs = t;
    const dt =
      last > 0 ? Math.min(LOOP.maxDtS, Math.max(0, (t - last) / 1000)) : LOOP.fallbackDtS;
    last = t;
    elapsedS += dt;
    tick(dt, elapsedS);
    raf = requestAnimationFrame(frame);
  };

  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  };

  const onVisibility = () => {
    if (!running) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      last = 0;
      schedule();
    }
  };

  const hasDoc = typeof document !== "undefined";
  if (hasDoc) document.addEventListener("visibilitychange", onVisibility);

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      if (!hasDoc || !document.hidden) schedule();
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      last = 0;
    },
    get running() {
      return running;
    },
    now: () => nowMs,
    elapsed: () => elapsedS,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      if (hasDoc) document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
