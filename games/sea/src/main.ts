import { Engine } from "./game/engine";
import { createInput } from "./game/input";
import { createLoop } from "./game/loop";
import { isMuted, toggleMute, unlock } from "./fx/audio";
import { Session } from "./session";
import { resetHud } from "./ui/hud";
import { renderOverlay } from "./ui/menus";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const overlayEl = document.querySelector<HTMLElement>("#overlay");
if (!canvas || !overlayEl) throw new Error("DOM 节点缺失");
const overlay = overlayEl;

const engine = new Engine(canvas);
const input = createInput(canvas);
let session = new Session();

function audio() {
  return { muted: isMuted(), onToggle: () => toggleMute() };
}

function showTitle(): void {
  input.reset();
  engine.scene = "title";
  renderOverlay(overlay, "title", {
    hiDays: Session.hiDays(),
    onStart: startRun,
    audio: audio(),
  });
}

function startRun(): void {
  unlock();
  resetHud();
  input.reset();
  session = new Session();
  engine.scene = "playing";
  renderOverlay(overlay, "hidden", { hiDays: Session.hiDays() });
}

function pause(): void {
  input.clearQueued();
  engine.scene = "paused";
  renderOverlay(overlay, "paused", {
    hiDays: Session.hiDays(),
    onResume: () => {
      input.clearQueued();
      engine.scene = "playing";
      renderOverlay(overlay, "hidden", { hiDays: Session.hiDays() });
    },
    onTitle: showTitle,
    audio: audio(),
  });
}

function finish(): void {
  input.reset();
  const r = session.result();
  engine.scene = "gameover";
  renderOverlay(overlay, "gameover", {
    hiDays: r.hiDays,
    days: r.days,
    built: r.built,
    salvaged: r.salvaged,
    isNew: r.isNew,
    endedBy: r.endedBy,
    onRetry: startRun,
    onTitle: showTitle,
    audio: audio(),
  });
}

const loop = createLoop((dt) => {
  if (engine.scene === "playing") {
    if (input.consumePause()) {
      pause();
    } else {
      session.selected = input.selected;
      if (input.consumeScoop() || input.scoopHeld) session.tryScoop();
      if (input.consumeDeliver()) session.tryDeliver();
      const click = input.consumeClick();
      session.update(dt, {
        ax: input.ax,
        ay: input.ay,
        click: click ? { x: click.x, y: click.y, secondary: click.secondary } : null,
      });
      if (session.over) finish();
    }
  } else if (engine.scene === "paused" && input.consumePause()) {
    input.clearQueued();
    engine.scene = "playing";
    renderOverlay(overlay, "hidden", { hiDays: Session.hiDays() });
  }

  const live = engine.scene === "playing";
  session.draw(engine.ctx, live && input.pointerOver ? input.pointer : undefined, {
    hud: live || engine.scene === "paused",
  });
});

showTitle();
loop.start();
