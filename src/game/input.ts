export type InputState = {
  left: boolean;
  right: boolean;
  jump: boolean;
  pause: boolean;
  consumeJump(): boolean;
  consumePause(): boolean;
};

export function createInput(target: HTMLElement): InputState {
  const down = new Set<string>();
  let jumpQueued = false;
  let pauseQueued = false;
  let touchX: number | null = null;

  const onKey = (e: KeyboardEvent, pressed: boolean) => {
    down[pressed ? "add" : "delete"](e.code);
    if (pressed && (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW")) {
      jumpQueued = true;
      e.preventDefault();
    }
    if (pressed && (e.code === "KeyP" || e.code === "Escape")) {
      pauseQueued = true;
    }
  };

  window.addEventListener("keydown", (e) => onKey(e, true));
  window.addEventListener("keyup", (e) => onKey(e, false));

  target.addEventListener("pointerdown", (e) => {
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    touchX = x;
    if (x < rect.width * 0.33) down.add("TouchLeft");
    else if (x > rect.width * 0.67) down.add("TouchRight");
    else jumpQueued = true;
  });
  target.addEventListener("pointerup", () => {
    down.delete("TouchLeft");
    down.delete("TouchRight");
    touchX = null;
  });
  target.addEventListener("pointermove", (e) => {
    if (touchX == null) return;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x - touchX < -24) {
      down.add("TouchLeft");
      down.delete("TouchRight");
    } else if (x - touchX > 24) {
      down.add("TouchRight");
      down.delete("TouchLeft");
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
  };
}
