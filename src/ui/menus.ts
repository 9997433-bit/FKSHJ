export type MenuKind = "title" | "paused" | "gameover";

export type MenuPayload = {
  hiScore: number;
  score?: number;
  distance?: number;
  coins?: number;
  isNew?: boolean;
  onStart?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onTitle?: () => void;
};

/** 上一个菜单挂的全局键盘监听，重渲染 / 隐藏时移除，避免泄漏与重复触发。 */
let disposeKeys: (() => void) | null = null;

function bindEnter(action: () => void): void {
  const handler = (e: KeyboardEvent) => {
    if (e.code !== "Enter" && e.code !== "NumpadEnter") return;
    // 焦点在按钮上时交给按钮原生激活（点击事件），避免双触发
    if (document.activeElement instanceof HTMLButtonElement) return;
    e.preventDefault();
    action();
  };
  window.addEventListener("keydown", handler);
  disposeKeys = () => window.removeEventListener("keydown", handler);
}

function focusPrimary(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>("button.primary")?.focus({ preventScroll: true });
}

const HELP_HTML = `
  <div id="help-panel" class="help-panel" hidden>
    <div class="help-row"><span class="help-k">键盘</span>
      <span><kbd>A</kbd>/<kbd>←</kbd> 左换道 · <kbd>D</kbd>/<kbd>→</kbd> 右换道 ·
      <kbd>空格</kbd>/<kbd>W</kbd>/<kbd>↑</kbd> 跳跃 · <kbd>P</kbd>/<kbd>Esc</kbd> 暂停</span></div>
    <div class="help-row"><span class="help-k">触屏</span>
      <span>左右半屏点按换道 · 中间点按跳跃 · 水平滑动换道</span></div>
    <div class="help-row"><span class="help-k">规则</span>
      <span>金币 +10 · 宝石 +50 · 水环 +100 并短暂无敌 · 连击越高加成越多 ·
      连续无伤收集 15 个回 1 点气量</span></div>
  </div>`;

export function renderOverlay(
  root: HTMLElement,
  kind: MenuKind | "hidden",
  payload: MenuPayload,
): void {
  disposeKeys?.();
  disposeKeys = null;

  if (kind === "hidden") {
    root.innerHTML = "";
    root.classList.add("hud-hidden");
    return;
  }
  root.classList.remove("hud-hidden");

  if (kind === "title") {
    root.innerHTML = `
      <div class="panel" role="dialog" aria-label="疯狂水世界 标题菜单">
        <h1>疯狂水世界</h1>
        <div class="tag">CRAZY WATER WORLD · 滑道竞速街机</div>
        <p class="subtitle">坐上充气泳圈冲下滑道！<br/>捡金币、钻水环、躲开橡皮鸭。</p>
        <div class="chips" aria-label="快捷操作提示">
          <span class="chip"><kbd>A</kbd><kbd>D</kbd> 换道</span>
          <span class="chip"><kbd>空格</kbd> 跳跃</span>
          <span class="chip"><kbd>P</kbd> 暂停</span>
          <span class="chip">触屏：点按 / 滑动</span>
        </div>
        <div class="stats">
          <div class="stat"><span class="num">${Math.floor(payload.hiScore)}</span><span class="lbl">最高分</span></div>
        </div>
        <div class="btn-row">
          <button id="btn-start" class="primary">开始冲浪</button>
          <button id="btn-help" class="ghost" aria-expanded="false" aria-controls="help-panel">操作说明</button>
        </div>
        ${HELP_HTML}
        <p class="hint">按 <kbd>Enter</kbd> 立即开始</p>
      </div>`;
    root.querySelector("#btn-start")?.addEventListener("click", () => payload.onStart?.());
    const helpBtn = root.querySelector<HTMLButtonElement>("#btn-help");
    const helpPanel = root.querySelector<HTMLElement>("#help-panel");
    helpBtn?.addEventListener("click", () => {
      if (!helpPanel) return;
      const open = helpPanel.hidden;
      helpPanel.hidden = !open;
      helpBtn.setAttribute("aria-expanded", String(open));
      helpBtn.textContent = open ? "收起说明" : "操作说明";
    });
    bindEnter(() => payload.onStart?.());
    focusPrimary(root);
    return;
  }

  if (kind === "paused") {
    root.innerHTML = `
      <div class="panel" role="dialog" aria-label="已暂停">
        <h1>暂停</h1>
        <p class="subtitle">水流还在耳边轰鸣，随时回来。</p>
        <div class="btn-row">
          <button id="btn-resume" class="primary">继续</button>
          <button id="btn-title" class="ghost">回标题</button>
        </div>
        <p class="hint"><kbd>P</kbd> / <kbd>Esc</kbd> 或 <kbd>Enter</kbd> 继续</p>
      </div>`;
    root.querySelector("#btn-resume")?.addEventListener("click", () => payload.onResume?.());
    root.querySelector("#btn-title")?.addEventListener("click", () => payload.onTitle?.());
    bindEnter(() => payload.onResume?.());
    focusPrimary(root);
    return;
  }

  root.innerHTML = `
    <div class="panel" role="dialog" aria-label="本局结算">
      ${payload.isNew ? '<div class="badge-new">新纪录！</div>' : ""}
      <h1>${payload.isNew ? "载入史册" : "冲上岸了"}</h1>
      <div class="stats">
        <div class="stat"><span class="num">${Math.floor(payload.score ?? 0)}</span><span class="lbl">分数</span></div>
        <div class="stat"><span class="num">${Math.floor(payload.distance ?? 0)}m</span><span class="lbl">距离</span></div>
        <div class="stat"><span class="num">${payload.coins ?? 0}</span><span class="lbl">金币</span></div>
        <div class="stat"><span class="num">${Math.floor(payload.hiScore)}</span><span class="lbl">历史最高</span></div>
      </div>
      <div class="btn-row">
        <button id="btn-retry" class="primary">再来一局</button>
        <button id="btn-title" class="ghost">回标题</button>
      </div>
      <p class="hint">按 <kbd>Enter</kbd> 再来一局</p>
    </div>`;
  root.querySelector("#btn-retry")?.addEventListener("click", () => payload.onRetry?.());
  root.querySelector("#btn-title")?.addEventListener("click", () => payload.onTitle?.());
  bindEnter(() => payload.onRetry?.());
  focusPrimary(root);
}
