export type MenuKind = "title" | "paused" | "gameover";

export function renderOverlay(
  root: HTMLElement,
  kind: MenuKind | "hidden",
  payload: {
    hiScore: number;
    score?: number;
    distance?: number;
    coins?: number;
    isNew?: boolean;
    onStart?: () => void;
    onResume?: () => void;
    onRetry?: () => void;
    onTitle?: () => void;
  },
): void {
  if (kind === "hidden") {
    root.innerHTML = "";
    root.classList.add("hud-hidden");
    return;
  }
  root.classList.remove("hud-hidden");

  if (kind === "title") {
    root.innerHTML = `
      <div class="panel">
        <h1>疯狂水世界</h1>
        <div class="tag">CRAZY WATER WORLD</div>
        <p>坐上充气泳圈，冲下热带滑道！<br/>捡金币、钻水环、躲开橡皮鸭。</p>
        <p>最高分 ${payload.hiScore}</p>
        <button id="btn-start">开始冲浪</button>
        <button class="ghost" id="btn-help">操作说明</button>
      </div>`;
    root.querySelector("#btn-start")?.addEventListener("click", () => payload.onStart?.());
    root.querySelector("#btn-help")?.addEventListener("click", () => {
      alert("键盘：A/← 左换道，D/→ 右换道，空格跳跃，P 暂停。\n触屏：点左右半屏换道，点中间跳跃。");
    });
    return;
  }

  if (kind === "paused") {
    root.innerHTML = `
      <div class="panel">
        <h1>暂停</h1>
        <p>水流还在耳边轰鸣。</p>
        <button id="btn-resume">继续</button>
        <button class="ghost" id="btn-title">回标题</button>
      </div>`;
    root.querySelector("#btn-resume")?.addEventListener("click", () => payload.onResume?.());
    root.querySelector("#btn-title")?.addEventListener("click", () => payload.onTitle?.());
    return;
  }

  root.innerHTML = `
    <div class="panel">
      <h1>${payload.isNew ? "新纪录！" : "冲上岸了"}</h1>
      <p>分数 ${Math.floor(payload.score ?? 0)} · 距离 ${Math.floor(payload.distance ?? 0)}m</p>
      <p>金币 ${payload.coins ?? 0} · 历史最高 ${payload.hiScore}</p>
      <button id="btn-retry">再来一局</button>
      <button class="ghost" id="btn-title">回标题</button>
    </div>`;
  root.querySelector("#btn-retry")?.addEventListener("click", () => payload.onRetry?.());
  root.querySelector("#btn-title")?.addEventListener("click", () => payload.onTitle?.());
}
