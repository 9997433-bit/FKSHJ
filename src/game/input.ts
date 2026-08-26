export type InputState = {
  left: boolean;
  right: boolean;
  jump: boolean;
  pause: boolean;
  consumeJump(): boolean;
  consumePause(): boolean;
  /** Drop leftover jump/pause presses so a menu key cannot fire on the next scene. */
  clearQueued(): void;
};

const JUMP_KEYS = ["Space", "ArrowUp", "KeyW"];
const PAUSE_KEYS = ["KeyP", "Escape"];
/** Keys the game owns: the browser must not scroll or re-click a button with them. */
const OWNED_KEYS = [...JUMP_KEYS, "ArrowDown", "ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyS"];
const SWIPE_PX = 24;

/** The overlay menus are real buttons, so leave keys alone while one has focus. */
function typingOrClicking(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A"].includes(target.tagName);
}

export function createInput(target: HTMLElement): InputState {
  const down = new Set<string>();
  let jumpQueued = false;
  let pauseQueued = false;
  let touchX: number | null = null;

  const onKey = (e: KeyboardEvent, pressed: boolean) => {
    if (OWNED_KEYS.includes(e.code) && e.cancelable && !typingOrClicking(e.target)) {
      e.preventDefault();
    }
    if (pressed) down.add(e.code);
    else down.delete(e.code);
    if (!pressed || e.repeat || typingOrClicking(e.target)) return;
    if (JUMP_KEYS.includes(e.code)) jumpQueued = true;
    if (PAUSE_KEYS.includes(e.code)) pauseQueued = true;
  };

  window.addEventListener("keydown", (e) => onKey(e, true), { passive: false });
  window.addEventListener("keyup", (e) => onKey(e, false), { passive: false });
  // A held key never gets its keyup, so drop everything when the tab loses focus.
  window.addEventListener("blur", () => down.clear());

  let captured = false;
  target.addEventListener("pointerdown", (e) => {
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    touchX = x;
    try {
      target.setPointerCapture(e.pointerId);
      captured = true;
    } catch {
      captured = false;
    }
    if (x < rect.width * 0.33) down.add("TouchLeft");
    else if (x > rect.width * 0.67) down.add("TouchRight");
    else jumpQueued = true;
  });
  const endTouch = () => {
    down.delete("TouchLeft");
    down.delete("TouchRight");
    touchX = null;
  };
  target.addEventListener("pointerup", endTouch);
  target.addEventListener("pointercancel", endTouch);
  // Capture keeps events coming while dragging off-canvas; without it, leaving would stick a lane key.
  target.addEventListener("pointerleave", () => {
    if (!captured) endTouch();
  });
  target.addEventListener("pointermove", (e) => {
    if (touchX == null) return;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x - touchX < -SWIPE_PX) {
      down.add("TouchLeft");
      down.delete("TouchRight");
      touchX = x + SWIPE_PX;
    } else if (x - touchX > SWIPE_PX) {
      down.add("TouchRight");
      down.delete("TouchLeft");
      touchX = x - SWIPE_PX;
    }
  });

  return {
    get left() {
      return down.has("ArrowLeft") || down.has("KeyA") || down.has("TouchLeft");
    },
    get right() {
      return down.has("ArrowRight") || down.has("KeyD") || down.has("TouchRight");
    },
    get jump() {
      return jumpQueued;
    },
    get pause() {
      return pauseQueued;
    },
    consumeJump() {
      const v = jumpQueued;
      jumpQueued = false;
      return v;
    },
    consumePause() {
      const v = pauseQueued;
      pauseQueued = false;
      return v;
    },
    clearQueued() {
      jumpQueued = false;
      pauseQueued = false;
    },
  };
}
