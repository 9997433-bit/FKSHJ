import { CAMERA, CANVAS } from "../data/constants";
import { MAX_PARTICLES, type Particle } from "./particles";

/**
 * 冲刺速度线：从消失点往画面外扫出去的细长条。
 *
 * 复用 `Particle` 的 `spark` 形状 —— 它按 `-v * 0.02` 画一段线，于是条纹长度
 * 天然跟着速度走：越快越长，减速时自己收短，不需要额外的形状。
 */

/** 低于这个归一速度完全不出线：巡航时画面必须是干净的。 */
const SPEED_GATE = 0.45;
/** 满强度时每秒生成的条数；配上 ~0.26s 的寿命，同屏常驻约 30 条。 */
const RATE = 120;
/** 生成半径区间（距消失点，px）：中心留空，否则条纹会糊住玩家正前方。 */
const R_MIN = 60;
const R_MAX = 520;
/** 条纹外扫速度（px/s）；`spark` 按 v×0.02 画长度，所以这也是「条纹多长」。 */
const FLY_MIN = 520;
const FLY_MAX = 1_250;
/** 画面是 16:9：把放射方向按这个比例拉扁，条纹才沿着画面对角散开而不是挤在上下边。 */
const AX = 1.35;
const AY = 0.72;

/**
 * 速度线只是氛围，不能把水花 / 受击反馈挤出粒子上限（规格红线 400）：
 * 它最多用到总预算的这一部分，剩下的永远留给玩法反馈。
 */
const BUDGET = 0.7;
export const SPEED_LINE_BUDGET = Math.floor(MAX_PARTICLES * BUDGET);

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 按 dt 往 `list` 里补速度线，返回本帧新增条数。
 *
 * `boost01` 是加速包络强度（`boostEase`），`speed01` 是速度归一值：吃到加速带
 * 立刻拉满，纯靠重力冲到高速时也会淡淡地出线。
 *
 * 生成条数用「整数部分 + 按小数概率补一条」取整，所以模块里不需要留累加器 ——
 * 没有跨局泄漏的模块级状态，换一局就是真的换一局。
 */
export function speedLines(
  list: Particle[],
  dt: number,
  speed01: number,
  color: string,
  boost01 = 0,
): number {
  const fast = clamp01((speed01 - SPEED_GATE) / (1 - SPEED_GATE));
  const drive = Math.max(clamp01(boost01), fast * 0.7);
  if (drive <= 0 || dt <= 0) return 0;

  const room = SPEED_LINE_BUDGET - list.length;
  if (room <= 0) return 0;

  const want = RATE * drive * Math.min(dt, 0.05);
  let n = Math.floor(want);
  if (Math.random() < want - n) n += 1;
  n = Math.min(n, room);

  const cx = CANVAS.w / 2;
  const cy = CANVAS.h * CAMERA.horizonFrac;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = R_MIN + Math.random() * (R_MAX - R_MIN);
    const fly = FLY_MIN + (FLY_MAX - FLY_MIN) * drive * (0.6 + Math.random() * 0.6);
    const life = 0.18 + Math.random() * 0.16;
    list.push({
      x: cx + Math.cos(a) * r * AX,
      y: cy + Math.sin(a) * r * AY,
      vx: Math.cos(a) * fly * AX,
      vy: Math.sin(a) * fly * AY,
      life,
      max: life * 1.25,
      r: 1.6 + drive * 1.8,
      color,
      shape: "spark",
      grav: 0,
    });
  }
  return n;
}
