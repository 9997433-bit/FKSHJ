import { Engine } from "./game/engine";
import { createLoop } from "./game/loop";
import { Session } from "./session";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const overlay = document.querySelector<HTMLElement>("#overlay");
if (!canvas || !overlay) throw new Error("DOM 节点缺失");

const engine = new Engine(canvas);
const session = new Session();
engine.scene = "title";

overlay.innerHTML = `
  <div class="panel" role="dialog" aria-label="标题">
    <h1>疯狂水世界</h1>
    <div class="tag">海上末日 · 拾荒建造</div>
    <p class="subtitle">陆地没了，木筏还在。老大，先活下来。</p>
    <p class="hint">Round 1 脚手架：子代理正在补玩法。</p>
  </div>`;

const loop = createLoop((dt) => {
  session.update(dt);
  session.draw(engine.ctx);
});
loop.start();
