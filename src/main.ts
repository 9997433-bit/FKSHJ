import { Engine } from "./game/engine";
import { createInput } from "./game/input";
import { createLoop } from "./game/loop";
import { Sfx } from "./fx/audio";
import { stepParticles } from "./fx/particles";
import { Session } from "./session";
import { renderOverlay } from "./ui/menus";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const overlayEl = document.querySelector<HTMLElement>("#overlay");
if (!canvas || !overlayEl) throw new Error("DOM 节点缺失");
const overlay = overlayEl;

const engine = new Engine(canvas);
const input = createInput(canvas);
const sfx = new Sfx();
let session = new Session(sfx);

function audioControl() {
  return {
    muted: sfx.isMuted(),
    onToggle: () => sfx.toggleMute(),
  };
}

function showTitle(): void {
  engine.scene = "title";
  renderOverlay(overlay, "title", {
    hiScore: Session.hiScore(),
    onStart: startRun,
    audio: audioControl(),
  });
}

function startRun(): void {
  sfx.unlock();
  session = new Session(sfx);
  engine.scene = "playing";
  renderOverlay(overlay, "hidden", { hiScore: Session.hiScore() });
}

function pause(): void {
  engine.scene = "paused";
  renderOverlay(overlay, "paused", {
    hiScore: Session.hiScore(),
    onResume: () => {
      engine.scene = "playing";
      renderOverlay(overlay, "hidden", { hiScore: Session.hiScore() });
    },
    onTitle: showTitle,
    audio: audioControl(),
  });
}

function finish(): void {
  const r = session.result();
  engine.scene = "gameover";
  renderOverlay(overlay, "gameover", {
    hiScore: r.hiScore,
    score: r.score,
    distance: r.distance,
    coins: r.coins,
    isNew: r.isNew,
    onRetry: startRun,
    onTitle: showTitle,
    audio: audioControl(),
  });
}

const loop = createLoop((dt) => {
  if (engine.scene === "playing") {
    if (input.consumePause()) {
      pause();
    } else {
      const steer: -1 | 0 | 1 = input.left ? -1 : input.right ? 1 : 0;
      session.update(dt, steer, input.consumeJump());
      stepParticles(session.particles, dt);
      if (session.over) finish();
    }
  } else if (engine.scene === "paused" && input.consumePause()) {
    engine.scene = "playing";
    renderOverlay(overlay, "hidden", { hiScore: Session.hiScore() });
  }

  session.draw(engine.ctx);
  if (engine.scene === "title") {
    // 标题下仍画一局预览水面
  }
});

showTitle();
loop.start();
