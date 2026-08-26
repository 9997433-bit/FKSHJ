import { CANVAS } from "../data/constants";
import { HOTBAR } from "../sim/rules";
import type { PlaceableId, Vec2 } from "../sim/rules";

/**
 * 输入层：把键鼠触摸压成一份「本帧意图」。
 *
 * 契约：
 * - 持续量（ax/ay）用 getter 直读按键状态；一次性动作（捞取/暂停/点击）
 *   进队列，由 session 用 consumeXxx 取走，保证一次按键只被消费一次。
 * - **菜单里的按钮是真 DOM 按钮**：焦点在按钮/输入框上时，空格和回车属于
 *   浏览器（要能激活按钮），这时不抢按键、不 preventDefault、不排队捞取。
 *   否则「点开始 → 空格再按一次」会同时激活按钮和捞一把。
 * - 场景切换时调 clearQueued()：把菜单里按出来的暂停/捞取/点击丢掉，
 *   不让它们泄漏到下一个场景（历史上踩过这个坑）。
 * - 坐标一律换算到 CANVAS.w × CANVAS.h 的逻辑坐标系，与 Engine 的绘制
 *   坐标系一致；相机偏移由调用方自己加。
 */

const LEFT_KEYS = ["KeyA", "ArrowLeft"];
const RIGHT_KEYS = ["KeyD", "ArrowRight"];
const UP_KEYS = ["KeyW", "ArrowUp"];
const DOWN_KEYS = ["KeyS", "ArrowDown"];
const SCOOP_KEYS = ["Space"];
const PAUSE_KEYS = ["KeyP", "Escape"];
/** 交付岛民请求板当前条子 */
const DELIVER_KEYS = ["KeyQ", "KeyE"];
/** 游戏自己吃掉的键：不许浏览器拿去滚页面 */
const OWNED_KEYS = [...LEFT_KEYS, ...RIGHT_KEYS, ...UP_KEYS, ...DOWN_KEYS, ...SCOOP_KEYS, ...DELIVER_KEYS];

/** 拖动超过这个距离才算「摇杆」，否则算点按 */
const DRAG_PX = 18;
/** 摇杆推到底的距离 */
const DRAG_FULL_PX = 70;
/** 点击队列上限，连点不至于把内存吃了 */
const CLICK_QUEUE_MAX = 4;

export type ClickPoint = Vec2 & {
  /** true = 右键/副键，用来取消选中 */
  readonly secondary: boolean;
};

export type InputState = {
  /** 横向意图 −1..1 */
  readonly ax: number;
  /** 纵向意图 −1..1（下为正，和画布 y 轴同向） */
  readonly ay: number;
  /** 捞取键是否按住（配合小船冷却做连续捞） */
  readonly scoopHeld: boolean;
  /** 队列里有没有待消费的捞取 */
  readonly scoop: boolean;
  readonly pause: boolean;
  /** 当前选中的建筑，null = 没选 */
  readonly selected: PlaceableId | null;
  /** 指针在逻辑坐标系里的位置（做建造预览用） */
  readonly pointer: Vec2;
  /** 指针是否在画布上 */
  readonly pointerOver: boolean;
  consumeScoop(): boolean;
  consumePause(): boolean;
  /** 取一次「交付条子」按键；没有返回 false */
  consumeDeliver(): boolean;
  /** 取一次未处理的点击；没有返回 null */
  consumeClick(): ClickPoint | null;
  /** UI 按钮改选中态用；传 null 取消选中 */
  select(id: PlaceableId | null): void;
  /** 丢掉所有待消费动作（场景切换时必调） */
  clearQueued(): void;
  /** 连按住的键一起清（结算/回标题时用） */
  reset(): void;
  dispose(): void;
};

/** 焦点在菜单控件上吗？在的话按键归浏览器管。 */
function inMenuControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A", "OPTION"].includes(target.tagName);
}

/** 数字键 1–5 → 建筑 id；其它返回 null */
function hotbarOf(code: string): PlaceableId | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (!m) return null;
  const idx = Number(m[1]) - 1;
  return idx < HOTBAR.length ? HOTBAR[idx] : null;
}

export function createInput(target: HTMLElement): InputState {
  const down = new Set<string>();
  const clicks: ClickPoint[] = [];
  const aborter = new AbortController();
  const signal = aborter.signal;

  let scoopQueued = false;
  let pauseQueued = false;
  let deliverQueued = false;
  let selected: PlaceableId | null = null;
  const pointer: Vec2 = { x: CANVAS.w / 2, y: CANVAS.h / 2 };
  let pointerOver = false;

  // 触摸摇杆：按下点是原点，拖离原点的方向就是推力方向
  let dragId: number | null = null;
  let dragOrigin: Vec2 | null = null;
  let dragging = false;
  let dragX = 0;
  let dragY = 0;

  const held = (keys: readonly string[]) => keys.some((k) => down.has(k));

  /** 客户端坐标 → 逻辑坐标 */
  const toLogical = (clientX: number, clientY: number): Vec2 => {
    const rect = target.getBoundingClientRect();
    const sx = rect.width > 0 ? CANVAS.w / rect.width : 1;
    const sy = rect.height > 0 ? CANVAS.h / rect.height : 1;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  };

  const pushClick = (p: Vec2, secondary: boolean) => {
    if (clicks.length >= CLICK_QUEUE_MAX) clicks.shift();
    clicks.push({ x: p.x, y: p.y, secondary });
  };

  const endDrag = () => {
    dragId = null;
    dragOrigin = null;
    dragging = false;
    dragX = 0;
    dragY = 0;
  };

  const clearQueued = () => {
    scoopQueued = false;
    pauseQueued = false;
    deliverQueued = false;
    clicks.length = 0;
    endDrag();
  };

  const onKey = (e: KeyboardEvent, pressed: boolean) => {
    const menu = inMenuControl(e.target);
    if (!menu && e.cancelable && OWNED_KEYS.includes(e.code)) e.preventDefault();

    // 焦点在按钮上：空格该按按钮，不该捞东西。
    // 连按住状态也不记——浏览器的 repeat keydown 会绕过下面的 e.repeat 提前返回，
    // 键就永远留在 down 里，松手后 scoopHeld 一直是 true。
    if (menu) {
      down.delete(e.code);
      return;
    }

    if (pressed) down.add(e.code);
    else down.delete(e.code);
    if (!pressed || e.repeat) return;

    if (SCOOP_KEYS.includes(e.code)) scoopQueued = true;
    if (DELIVER_KEYS.includes(e.code)) deliverQueued = true;
    if (PAUSE_KEYS.includes(e.code)) {
      // Esc 先当「取消选中」，没得取消才当暂停
      if (e.code === "Escape" && selected !== null) selected = null;
      else pauseQueued = true;
    }
    const pick = hotbarOf(e.code);
    if (pick) selected = selected === pick ? null : pick;
  };

  window.addEventListener("keydown", (e) => onKey(e, true), { passive: false, signal });
  window.addEventListener("keyup", (e) => onKey(e, false), { passive: false, signal });
  // 按住键时切走标签页收不到 keyup，回来会一直往那个方向漂
  window.addEventListener("blur", () => down.clear(), { signal });

  target.addEventListener(
    "pointerdown",
    (e) => {
      pointerOver = true;
      const p = toLogical(e.clientX, e.clientY);
      pointer.x = p.x;
      pointer.y = p.y;
      if (e.button === 2) return; // 右键交给 contextmenu 处理
      dragId = e.pointerId;
      dragOrigin = { x: e.clientX, y: e.clientY };
      dragging = false;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // 捕获失败无所谓，pointerleave 兜底
      }
    },
    { signal },
  );

  target.addEventListener(
    "pointermove",
    (e) => {
      pointerOver = true;
      const p = toLogical(e.clientX, e.clientY);
      pointer.x = p.x;
      pointer.y = p.y;
      if (dragId !== e.pointerId || !dragOrigin) return;
      const dx = e.clientX - dragOrigin.x;
      const dy = e.clientY - dragOrigin.y;
      if (!dragging && Math.hypot(dx, dy) < DRAG_PX) return;
      dragging = true;
      dragX = Math.max(-1, Math.min(1, dx / DRAG_FULL_PX));
      dragY = Math.max(-1, Math.min(1, dy / DRAG_FULL_PX));
    },
    { signal },
  );

  const finishPointer = (e: PointerEvent, cancelled: boolean) => {
    if (dragId !== e.pointerId) return;
    // 没拖动过 = 一次点按；拖过就是开船，不再当点击
    if (!cancelled && !dragging) pushClick(toLogical(e.clientX, e.clientY), e.button === 2);
    endDrag();
  };
  target.addEventListener("pointerup", (e) => finishPointer(e, false), { signal });
  target.addEventListener("pointercancel", (e) => finishPointer(e, true), { signal });
  target.addEventListener(
    "pointerleave",
    (e) => {
      pointerOver = false;
      if (!target.hasPointerCapture?.(e.pointerId)) endDrag();
    },
    { signal },
  );
  target.addEventListener("pointerenter", () => {
    pointerOver = true;
  }, { signal });

  // 右键取消选中，同时别弹系统菜单
  target.addEventListener(
    "contextmenu",
    (e) => {
      e.preventDefault();
      if (selected !== null) selected = null;
      else pushClick(toLogical(e.clientX, e.clientY), true);
    },
    { signal },
  );

  return {
    get ax() {
      const kb = (held(RIGHT_KEYS) ? 1 : 0) - (held(LEFT_KEYS) ? 1 : 0);
      return kb !== 0 ? kb : dragging ? dragX : 0;
    },
    get ay() {
      const kb = (held(DOWN_KEYS) ? 1 : 0) - (held(UP_KEYS) ? 1 : 0);
      return kb !== 0 ? kb : dragging ? dragY : 0;
    },
    get scoopHeld() {
      return held(SCOOP_KEYS);
    },
    get scoop() {
      return scoopQueued;
    },
    get pause() {
      return pauseQueued;
    },
    get selected() {
      return selected;
    },
    get pointer() {
      return pointer;
    },
    get pointerOver() {
      return pointerOver;
    },
    consumeScoop() {
      const v = scoopQueued;
      scoopQueued = false;
      return v;
    },
    consumePause() {
      const v = pauseQueued;
      pauseQueued = false;
      return v;
    },
    consumeDeliver() {
      const v = deliverQueued;
      deliverQueued = false;
      return v;
    },
    consumeClick() {
      return clicks.shift() ?? null;
    },
    select(id) {
      selected = id;
    },
    clearQueued,
    reset() {
      clearQueued();
      down.clear();
      selected = null;
    },
    dispose() {
      aborter.abort();
      down.clear();
      clicks.length = 0;
    },
  };
}
