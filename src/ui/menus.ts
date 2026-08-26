export type MenuKind = "title" | "paused" | "gameover";

/** 静音开关挂钩：菜单只负责渲染与键位，音频实例由调用方持有。 */
export type AudioControl = {
  /** 渲染面板时的静音初始状态。 */
  muted: boolean;
  /** 切换并返回新的静音状态（典型接法：() => sfx.toggleMute()）。 */
  onToggle: () => boolean;
};

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
  /** 提供后面板右上角出现静音按钮，并在面板打开期间绑定 M 键。 */
  audio?: AudioControl;
  /** 结算死因：落水 vs 撞瘪。缺省保持旧文案。 */
  endedBy?: "washout" | "deflated";
};

export function gameoverCopy(p: Pick<MenuPayload, "isNew" | "endedBy">): { title: string; tag: string } {
  if (p.endedBy === "washout") {
    return {
      title: p.isNew ? "载入史册" : "冲出滑道",
      tag: p.isNew ? "甩进水里也创了纪录" : "离心力把泳圈甩进了水里",
    };
  }
  if (p.endedBy === "deflated") {
    return {
      title: p.isNew ? "载入史册" : "气漏光了",
      tag: p.isNew ? "气漏光了，但分数留了下来" : "橡皮鸭和漩涡把泳圈撞瘪了",
    };
  }
  return {
    title: p.isNew ? "载入史册" : "冲上岸了",
    tag: "CRAZY WATER WORLD · 本局结算",
  };
}

/** 上一个菜单挂的全局键盘监听，重渲染 / 隐藏时移除，避免泄漏与重复触发。 */
let disposeKeys: (() => void) | null = null;

function muteLabel(muted: boolean): string {
  return muted ? "音效 关" : "音效 开";
}

function muteHtml(audio?: AudioControl): string {
  if (!audio) return "";
  return `<button id="btn-mute" class="mute" aria-pressed="${audio.muted}"
    aria-label="静音切换" title="静音切换（M）">${muteLabel(audio.muted)}</button>`;
}

function toggleMute(root: HTMLElement, audio: AudioControl): void {
  const muted = audio.onToggle();
  const btn = root.querySelector<HTMLButtonElement>("#btn-mute");
  if (btn) {
    btn.textContent = muteLabel(muted);
    btn.setAttribute("aria-pressed", String(muted));
  }
}

function bindMuteButton(root: HTMLElement, audio?: AudioControl): void {
  if (!audio) return;
  root
    .querySelector<HTMLButtonElement>("#btn-mute")
    ?.addEventListener("click", () => toggleMute(root, audio));
}

function bindKeys(action: () => void, root: HTMLElement, audio?: AudioControl): void {
  const handler = (e: KeyboardEvent) => {
    if (audio && e.code === "KeyM") {
      e.preventDefault();
      toggleMute(root, audio);
      return;
    }
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
      <span>左 / 中 / 右三分屏：左换道、中跳跃、右换道 · 水平滑动换道</span></div>
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
        ${muteHtml(payload.audio)}
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
    bindMuteButton(root, payload.audio);
    bindKeys(() => payload.onStart?.(), root, payload.audio);
    focusPrimary(root);
    return;
  }

  if (kind === "paused") {
    root.innerHTML = `
      <div class="panel" role="dialog" aria-label="已暂停">
        ${muteHtml(payload.audio)}
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
    bindMuteButton(root, payload.audio);
    bindKeys(() => payload.onResume?.(), root, payload.audio);
    focusPrimary(root);
    return;
  }

  const over = gameoverCopy(payload);
  root.innerHTML = `
    <div class="panel" role="dialog" aria-label="本局结算">
      ${muteHtml(payload.audio)}
      ${payload.isNew ? '<div class="badge-new">新纪录！</div>' : ""}
      <h1>${over.title}</h1>
      <div class="tag">${over.tag}</div>
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
  bindMuteButton(root, payload.audio);
  bindKeys(() => payload.onRetry?.(), root, payload.audio);
  focusPrimary(root);
}
