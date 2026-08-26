/**
 * DOM 菜单面板（fable-sota，Round 1）：title / paused / gameover，全中文。
 * 基调：末世但不丧——文案带点摸鱼的松弛感，结算永远给「再来一局」的钩子。
 * 面板样式在 src/index.css；session/main 由父调度器接线（见 SOTA_BAR §6）。
 */

export type MenuKind = "title" | "paused" | "gameover";

/** 静音开关挂钩：菜单只负责渲染与 M 键，音频实例由调用方持有。 */
export type AudioControl = {
  /** 渲染面板时的静音初始状态。 */
  muted: boolean;
  /** 切换并返回新的静音状态（典型接法：() => sfx.toggleMute()）。 */
  onToggle: () => boolean;
};

/** 结算死因（GAME_SPEC §2）：断粮 vs 指挥中心被拆。 */
export type EndReason = "starved" | "coreDown";

export type MenuPayload = {
  /** 历史最长存活天数（标题钩子 + 结算对照）。 */
  hiDays: number;
  /** 本局存活天数（结算必填）。 */
  days?: number;
  /** 本局盖了几座建筑。 */
  built?: number;
  /** 本局捞了几件漂浮物。 */
  salvaged?: number;
  /** 本局是否刷新最长存活纪录。 */
  isNew?: boolean;
  /** 结算死因；缺省用通用文案。 */
  endedBy?: EndReason;
  onStart?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onTitle?: () => void;
  /** 提供后面板右上角出现静音按钮，并在面板打开期间绑定 M 键。 */
  audio?: AudioControl;
};

/** 结算标题与副文案。导出便于单测覆盖所有死因分支。 */
export function gameoverCopy(p: Pick<MenuPayload, "isNew" | "endedBy">): {
  title: string;
  tag: string;
} {
  if (p.endedBy === "starved") {
    return {
      title: p.isNew ? "饿着肚子创了纪录" : "锅底刮干净了",
      tag: p.isNew ? "下次先把钓鱼台盖起来" : "岛民们决定去别的木筏碰碰运气",
    };
  }
  if (p.endedBy === "coreDown") {
    return {
      title: p.isNew ? "沉船前留下了传说" : "指挥中心进水了",
      tag: p.isNew ? "海盗抢得走木板，抢不走纪录" : "下次让炮塔先说话",
    };
  }
  return {
    title: p.isNew ? "载入史册" : "这一程到此为止",
    tag: "疯狂水世界 · 本局结算",
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
    <div class="help-row"><span class="help-k">开船</span>
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键开拾荒小船 ·
      <kbd>空格</kbd> 或点按捞起漂浮物</span></div>
    <div class="help-row"><span class="help-k">建造</span>
      <span><kbd>1</kbd>–<kbd>5</kbd> 选建筑，点海面铺地基或在空地板上盖房 ·
      地基必须贴着已有木筏</span></div>
    <div class="help-row"><span class="help-k">生存</span>
      <span>淡水和食物会持续消耗：净水机产水、钓鱼台产粮、收集器攒料 ·
      风暴打外圈、海盗靠近让炮塔招呼 · 指挥中心没了或断粮太久就结算</span></div>
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
        <div class="tag">海上末日 · 拾荒建造</div>
        <p class="subtitle">陆地沉了，太阳照常升起。<br/>捞木板、攒塑料，把三块木筏过成一座岛。</p>
        <div class="chips" aria-label="快捷操作提示">
          <span class="chip"><kbd>WASD</kbd> 开船</span>
          <span class="chip"><kbd>空格</kbd> 捞取</span>
          <span class="chip"><kbd>1</kbd>–<kbd>5</kbd> 建造</span>
          <span class="chip"><kbd>P</kbd> 暂停</span>
        </div>
        <div class="stats">
          <div class="stat"><span class="num">${Math.max(0, Math.floor(payload.hiDays))} 天</span><span class="lbl">最长存活</span></div>
        </div>
        <div class="btn-row">
          <button id="btn-start" class="primary">出海拾荒</button>
          <button id="btn-help" class="ghost" aria-expanded="false" aria-controls="help-panel">玩法说明</button>
        </div>
        ${HELP_HTML}
        <p class="hint">按 <kbd>Enter</kbd> 立即出海</p>
      </div>`;
    root.querySelector("#btn-start")?.addEventListener("click", () => payload.onStart?.());
    const helpBtn = root.querySelector<HTMLButtonElement>("#btn-help");
    const helpPanel = root.querySelector<HTMLElement>("#help-panel");
    helpBtn?.addEventListener("click", () => {
      if (!helpPanel) return;
      const open = helpPanel.hidden;
      helpPanel.hidden = !open;
      helpBtn.setAttribute("aria-expanded", String(open));
      helpBtn.textContent = open ? "收起说明" : "玩法说明";
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
        <h1>靠岸歇口气</h1>
        <p class="subtitle">海浪替你看着家，木筏又不会跑。</p>
        <div class="btn-row">
          <button id="btn-resume" class="primary">继续漂流</button>
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
      ${payload.isNew ? '<div class="badge-new">最长存活新纪录！</div>' : ""}
      <h1>${over.title}</h1>
      <div class="tag">${over.tag}</div>
      <div class="stats">
        <div class="stat highlight"><span class="num">${Math.max(0, Math.floor(payload.days ?? 0))} 天</span><span class="lbl">存活天数</span></div>
        <div class="stat"><span class="num">${Math.max(0, Math.floor(payload.built ?? 0))}</span><span class="lbl">建筑</span></div>
        <div class="stat"><span class="num">${Math.max(0, Math.floor(payload.salvaged ?? 0))}</span><span class="lbl">拾荒</span></div>
        <div class="stat"><span class="num">${Math.max(0, Math.floor(payload.hiDays))} 天</span><span class="lbl">最长存活</span></div>
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
