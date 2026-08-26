import { CANVAS, INVENTORY } from "../data/constants";
import { SILHOUETTES, itemArt } from "../world/items";

/**
 * HUD 绘制 API（fable-sota，Round 6）。
 *
 * 设计基调：手游浮岛基建的轻松感——末世但不丧。圆角卡片、暖阳黄点缀、
 * 资源 +1 弹跳、换天徽章闪光；绝不用血红大警报吓玩家（危险态只做柔和脉冲）。
 *
 * 契约：
 * - 所有函数工作在 CANVAS.w × CANVAS.h 逻辑坐标系（Engine 已抹平 DPR）。
 * - session 每帧在世界绘制之后调用 drawHud(ctx, info)；info 里除 day 外全部
 *   可选，缺哪块就不画哪块，父调度器可以分阶段接线。
 *   Round 2 新增 storm01 / starve01 / hintDanger 三个可选预警字段，
 *   Round 3 新增 placeHint（放置被拒短句），
 *   Round 4 新增 storyBeat / quest / lootToast（轻剧情 / 岛民请求 / 拾取提示），
 *   Round 5（新波次 R2）新增 bagSlots / questDone（道具袋条 / 任务完成庆祝），
 *   Round 6（新波次 R3）新增 bagSlots.onUse 回调 + 袋格点击契约
 *   （bagStripRect / bagSlotRects / hitTestBagStrip / clickBagStrip）：
 *   session 还没传时行为与上一轮**逐像素一致**，不崩不闪。
 * - 布局红线：资源/生存条贴左上，天数贴右上，建造栏贴底部中央；
 *   预警层贴顶缘（y < 96，浮岛网格上沿之上）；剧情层贴左右两列与左下角
 *   （拾取提示接生存条下、任务胶囊接岛民胶囊下、日记卡压左下角）；
 *   道具袋条贴左列（拾取提示槽位之下）、任务完成庆祝贴右列——
 *   画面中央（浮岛与小船的舞台）永不遮挡。
 * - 模块在 Node 可安全 import（单测环境无 matchMedia/DOM，已守卫；
 *   文本宽度全部走 estTextWidth 估算，stub ctx 没有 measureText 也安全；
 *   world/items 是纯数据 + 纯函数，import 无副作用之外的要求）。
 */

/** 四种拾荒材料（GAME_SPEC §2；键名与 constants.ResourceId 的建材子集对齐）。 */
export type ResourceKind = "wood" | "plastic" | "metal" | "rope";

/** 建筑图标 id（GAME_SPEC §4）；未知 id 回退为名称首字。 */
export type BuildIcon = "floor" | "collector" | "purifier" | "fish" | "turret";

/** 建造快捷栏单格：由 sim 侧提供数据，HUD 只负责画。 */
export type BuildSlot = {
  /** 快捷键标签，如 "1".."5"。 */
  key: string;
  /** 建筑名，如「地基」。 */
  name: string;
  /** 图标 id；缺省画名称首字。 */
  icon?: BuildIcon;
  /** 花费短文案，如「木×2」；缺省不画。 */
  cost?: string;
  /** 当前资源是否够；false 时整格半透明、花费染警示色。 */
  affordable?: boolean;
  /** 当前选中格：抬升 + 亮边框。 */
  selected?: boolean;
};

/** 袋内一件物品（bagSlots.items 的元素）：id 用来配剪影，缺省按 name 散列。 */
export type BagItem = {
  id?: string;
  name: string;
  count: number;
};

export type HudInfo = {
  /** 存活天数（从 1 起）。换天瞬间徽章弹一下。 */
  day: number;
  /** 当天进度 0..1，画在太阳周围的一圈弧；缺省不画弧。 */
  dayProgress01?: number;
  /** 材料存量；缺省的键不画。资源增加瞬间数字弹跳。 */
  resources?: Partial<Record<ResourceKind, number>>;
  /** 淡水 0..1；低于 0.25 柔和脉冲提醒。缺省不画。 */
  water01?: number;
  /** 食物 0..1；同上。 */
  food01?: number;
  /** 岛民「已喂饱/总数」，画在天数徽章下方的小胶囊。缺省不画。 */
  islanders?: { fed: number; total: number };
  /** 建造快捷栏；缺省不画（底部只留通用操作提示）。 */
  build?: { slots: BuildSlot[]; hint?: string };
  /** 秒（建议传 session 累计时间）。缺省用 performance.now() 自计时。 */
  time?: number;
  /**
   * 风暴预警强度 0..1（建议传 sim 的 stormWarnRatio）。
   * 0 或缺省完全不画；>0 时顶缘柔和珊瑚辉光（带一点闪电感的偶发提亮）
   * + 顶部中央预警条胶囊，随 storm01 缓入并脉冲。
   */
  storm01?: number;
  /**
   * 断供宽限消耗 0..1（0 = 补给正常，1 = 宽限耗尽即结算）。
   * >0 时岛民胶囊底部出现珊瑚色「余量」细条；>0.4（或 fed<total）时
   * 胶囊下方淡入一句轻松的补粮提示。缺省时只按 islanders.fed 判断。
   */
  starve01?: number;
  /**
   * 一句危险短提示（如「海盗从东边来了」）。
   * 画在顶部中央珊瑚胶囊（风暴条下方，若两者都在）；缺省不画。
   */
  hintDanger?: string;
  /**
   * 放置被拒短句（如「得贴着木筏放」，现成文案见 sim/rules 的 placeHint）。
   * 传入时建造栏上方提示行换成这句珊瑚色短句（出现瞬间轻弹一下）；
   * 缺省不画、提示行行为不变。拒绝后传几秒再撤由 session 掌握。
   */
  placeHint?: string;
  /**
   * 轻剧情节拍（Round 4）：航海日记 / 无线电广播的一小段。
   * 画在左下角的「日记卡」（操作提示行上方，卡宽 ≤288 不碰建造栏）：
   * 暖阳色标题 + 正文自动换行（最多 3 行，超出省略号）。
   * title+body 变化瞬间整卡淡入上浮 0.35s（reduced-motion 下瞬现）。
   * 缺省不画。显示几秒、何时换下一拍由 session 掌握（建议 6–10 秒一拍）。
   */
  storyBeat?: { title: string; body: string };
  /**
   * 岛民请求 / 当前任务（Round 4）。画在右上岛民胶囊下方的「任务胶囊」：
   * 潟湖青小旗 + 任务名 + 进度短文案（如「木板 3/5」）。
   * name 变化 = 新任务，整胶囊淡入；progress 变化 = 有进展，进度行轻弹
   *（复用资源 pop 曲线）。缺省不画。完成后建议 session 把 progress 换成
   * 「完成！」再传 1–2 秒，然后撤掉或换下一条。
   */
  quest?: { name: string; progress: string };
  /**
   * 拾取轻提示（Round 4）：刚捞到的物品名 + 数量。
   * 画在左上生存条正下方的小胶囊：暖阳四角星 + 名称 + ×数量，
   * 出现瞬间弹跳（同资源 pop 曲线）+ 0.2s 淡入。缺省不画。
   * 撤掉时机由 session 掌握（建议 1.5–2.5 秒）；同名连续拾取建议把 qty
   * 累计上去——name×qty 组合变化就会重新弹跳。
   */
  lootToast?: { name: string; qty: number };
  /**
   * 道具袋条（Round 5）：左列拾取提示槽位之下（y 192 起）的物品栏卡。
   * 头行 = 布袋图标 +「道具袋」+ 已占/总格数（袋满时染珊瑚色柔和呼吸）；
   * 下排固定 INVENTORY.hudSlots(6) 个小格：物品剪影（world/items 的
   * itemArt 登记表；id 缺省按 name 散列成一件「未知包裹」，不崩不空白）
   * + ×数量角标；某件数量增加的瞬间那一格弹跳（资源 pop 同曲线），
   * 空格画淡色底座。items 超过 6 件只画前 6 件（袋子总况看头行数字）。
   * 缺省不画，逐像素与 Round 4 一致。
   */
  bagSlots?: {
    /** 已占格数（sim/inventory 的 usedSlots） */
    used: number;
    /** 总格数（Inventory.maxSlots） */
    max: number;
    /** 袋内物品（建议 listItems 的 catalog 顺序）；id 用来配剪影 */
    items?: BagItem[];
    /**
     * 袋格点击回调（Round 6，可选）：点中**占用格**时由 clickBagStrip 调，
     * 吃不吃得下这件（查 ITEM_USE、走 useItem 原子出袋）全归 session。
     * 传了它头行会亮「点一下就用」提示；drawBagStrip 本身不发起任何事件
     * 监听——点击坐标仍由 input/session 喂给 clickBagStrip。不传时
     * 绘制与行为与 Round 5 逐指令一致。
     */
    onUse?: (item: BagItem, index: number) => void;
  };
  /**
   * 任务完成庆祝（Round 5）：右列任务胶囊下方（quest 不在时占其原位）
   * 的庆祝胶囊——潟湖青勾章 + 任务名 +「完成！」+ 可选奖励行（暖阳色，
   * 如「+食×12」）。出现瞬间弹跳 + 0.25s 淡入，并从勾章放出一圈扩散环
   * 和一小把彩纸（0.9s 一次性，轨迹确定性零 RNG；reduced-motion 下
   * 瞬现、无彩纸）。全部贴右缘，中央舞台零遮挡。缺省不画。
   * 显示 1.5–2.5 秒后撤掉由 session 掌握；name 变化会重新庆祝。
   */
  questDone?: { name: string; reward?: string };
};

/**
 * HUD 色板：磨砂暗玻璃 + 克制信息色。
 * 饱和度只留给数字/进度/危险——面板本身是死的，不许跟海面抢。
 */
export const HUD_COLORS = {
  panel: "rgba(16, 20, 26, 0.82)",
  panelLine: "rgba(210, 196, 150, 0.16)",
  ink: "#ece8e0",
  sun: "#d4b45a",
  accent: "#4aa89c",
  danger: "#d47858",
  water: "#5a9eb0",
  food: "#7aaa62",
  wood: "#b08a54",
  plastic: "#6aa8b4",
  metal: "#a8b0b8",
  rope: "#c4a46a",
} as const;

const RESOURCE_ORDER: readonly ResourceKind[] = ["wood", "plastic", "metal", "rope"];
const RESOURCE_LABEL: Record<ResourceKind, string> = {
  wood: "木板",
  plastic: "塑料",
  metal: "金属",
  rope: "绳索",
};

/** 资源 +1 / 换天弹跳的时长（秒）。 */
const POP_S = 0.35;

/** 袋格按压反馈（潟湖青描边圈 + 内容轻缩）的时长（秒）。 */
const PRESS_S = 0.28;

/** 系统偏好减弱动态时关闭持续脉冲（低水量呼吸等）。守卫 matchMedia：node 单测没有它。 */
const REDUCED_MOTION =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- 模块级动画状态（跨局需清空，见 resetHud）----
let lastCounts: Partial<Record<ResourceKind, number>> = {};
let popAt: Partial<Record<ResourceKind, number>> = {};
let lastDay = 0;
let dayPopAt = -Infinity;
let lastDangerHint = "";
let dangerHintAt = -Infinity;
let lastPlaceHint = "";
let placeHintAt = -Infinity;
let lastStoryKey = "";
let storyAt = -Infinity;
let lastQuestName = "";
let questAt = -Infinity;
let lastQuestProgress = "";
let questProgressAt = -Infinity;
let lastLootKey = "";
let lootAt = -Infinity;
let lastQuestDone = "";
let questDoneAt = -Infinity;
let bagSeen = false;
let lastBagCounts = new Map<string, number>();
let bagPopAt = new Map<string, number>();
let bagPressAt = new Map<number, number>();

/** 清空 HUD 动画状态。新一局开始时调用，避免上一局尾帧的弹跳串进新局。幂等。 */
export function resetHud(): void {
  lastCounts = {};
  popAt = {};
  lastDay = 0;
  dayPopAt = -Infinity;
  lastDangerHint = "";
  dangerHintAt = -Infinity;
  lastPlaceHint = "";
  placeHintAt = -Infinity;
  lastStoryKey = "";
  storyAt = -Infinity;
  lastQuestName = "";
  questAt = -Infinity;
  lastQuestProgress = "";
  questProgressAt = -Infinity;
  lastLootKey = "";
  lootAt = -Infinity;
  lastQuestDone = "";
  questDoneAt = -Infinity;
  bagSeen = false;
  lastBagCounts = new Map();
  bagPopAt = new Map();
  bagPressAt = new Map();
}

/**
 * 变化侦测：资源增加 / 换天时记录弹跳时间戳；危险/放置提示、剧情节拍、
 * 任务（名与进度分开侦测）、拾取提示的内容变化时记录入场时间戳。
 * 只在值变化时写状态，同一帧内被多个绘制函数重复调用是无害的。
 * day 回退（一局内单调递增）视为新开一局，自动清一次——未接 resetHud 也不串场。
 */
function syncHudState(info: HudInfo, now: number): void {
  if (info.day < lastDay) resetHud();
  if (info.day > lastDay && lastDay > 0) dayPopAt = now;
  lastDay = info.day;
  const danger = info.hintDanger ?? "";
  if (danger && danger !== lastDangerHint) dangerHintAt = now;
  lastDangerHint = danger;
  const denial = info.placeHint ?? "";
  if (denial && denial !== lastPlaceHint) placeHintAt = now;
  lastPlaceHint = denial;
  const story = info.storyBeat ? `${info.storyBeat.title}\n${info.storyBeat.body}` : "";
  if (story && story !== lastStoryKey) storyAt = now;
  lastStoryKey = story;
  const questName = info.quest?.name ?? "";
  if (questName && questName !== lastQuestName) questAt = now;
  lastQuestName = questName;
  const questProgress = info.quest ? `${info.quest.name}\n${info.quest.progress}` : "";
  if (questProgress && questProgress !== lastQuestProgress) questProgressAt = now;
  lastQuestProgress = questProgress;
  const loot = info.lootToast ? `${info.lootToast.name}×${info.lootToast.qty}` : "";
  if (loot && loot !== lastLootKey) lootAt = now;
  lastLootKey = loot;
  const done = info.questDone?.name ?? "";
  if (done && done !== lastQuestDone) questDoneAt = now;
  lastQuestDone = done;
  if (info.bagSlots?.items) {
    // 首次见到袋子那一帧不弹（接线瞬间整排齐弹很吵）；之后新物品视为从 0 涨
    const alive = new Set<string>();
    for (const it of info.bagSlots.items) {
      alive.add(it.name);
      const prev = lastBagCounts.get(it.name) ?? (bagSeen ? 0 : undefined);
      if (prev !== undefined && it.count > prev) bagPopAt.set(it.name, now);
      lastBagCounts.set(it.name, it.count);
    }
    for (const name of [...lastBagCounts.keys()]) {
      if (!alive.has(name)) {
        lastBagCounts.delete(name); // 出袋即忘：同名再进袋按新货重新弹
        bagPopAt.delete(name);
      }
    }
    bagSeen = true;
  }
  if (!info.resources) return;
  for (const kind of RESOURCE_ORDER) {
    const v = info.resources[kind];
    if (v === undefined) continue;
    const prev = lastCounts[kind];
    if (prev !== undefined && v > prev) popAt[kind] = now;
    lastCounts[kind] = v;
  }
}

/** 弹跳缩放：触发瞬间放大后回弹，衰减 POP_S 秒。 */
function popScale(at: number | undefined, now: number): number {
  if (at === undefined) return 1;
  const t = Math.min(1, (now - at) / POP_S);
  return 1 + 0.4 * (1 - t) * (1 - t);
}

/** 一次画全 HUD：预警层 + 资源条 + 天数徽章 + 建造快捷栏 + 道具袋条 + 剧情层。session 每帧调用这个即可。 */
export function drawHud(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const now = info.time ?? performance.now() / 1000;
  syncHudState(info, now);
  ctx.save();
  drawAlerts(ctx, info); // 先画：顶缘辉光垫在各面板之下
  drawResourceBar(ctx, info);
  drawDayBadge(ctx, info);
  drawBuildBar(ctx, info);
  drawBagStrip(ctx, info); // 道具袋条：bagSlots 缺省时不触碰 ctx
  drawStoryLayer(ctx, info); // 最后画：日记卡/任务胶囊/拾取提示/完成庆祝叠在各面板之上
  ctx.restore();
}

/**
 * 顶部预警层（Round 2，可选字段没接线时不画任何东西）：
 * - storm01 > 0：顶缘珊瑚辉光（柔和呼吸 + 偶发闪电感提亮，reduced-motion 下恒定）
 *   + 顶部中央「预警条」胶囊（闪电图标 + 轻松文案 + storm01 进度）。
 * - hintDanger：其下（或原位）一枚珊瑚点短提示胶囊。
 * 全部元素贴顶缘（y ≤ 92 < 浮岛网格上沿 96），中央舞台不受遮挡。
 */
export function drawAlerts(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const now = info.time ?? performance.now() / 1000;
  syncHudState(info, now);
  const storm = Math.max(0, Math.min(1, info.storm01 ?? 0));
  const hint = info.hintDanger;
  if (storm <= 0 && !hint) return;
  ctx.save();

  let capY = 16;
  if (storm > 0) {
    // 顶缘辉光：呼吸脉冲叠一点偶发「闪电」提亮；整体强度随 storm01 走
    const breathe = REDUCED_MOTION ? 0.85 : 0.7 + 0.3 * Math.sin(now * 2.4);
    const flash = REDUCED_MOTION
      ? 0
      : Math.max(0, Math.sin(now * 7.3) * Math.sin(now * 4.1) - 0.85) * 2.5;
    const glow = storm * Math.min(1.2, breathe + flash);
    const grad = ctx.createLinearGradient(0, 0, 0, 72);
    grad.addColorStop(0, withAlpha(HUD_COLORS.danger, 0.24 * glow));
    grad.addColorStop(1, withAlpha(HUD_COLORS.danger, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS.w, 72);

    // 预警条胶囊：随 storm01 缓入，进度条柔和脉冲
    const w = 240;
    const h = 40;
    const x0 = (CANVAS.w - w) / 2;
    const fadeIn = Math.min(1, storm * 4);
    ctx.globalAlpha = fadeIn;
    panel(ctx, x0, capY, w, h);
    drawBoltIcon(ctx, x0 + 21, capY + h / 2, 9, HUD_COLORS.danger);
    ctx.fillStyle = HUD_COLORS.ink;
    ctx.font = "700 13px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(storm < 0.65 ? "远处乌云在集合" : "风暴在攒劲儿，扶稳", x0 + 38, capY + 18);
    const bx = x0 + 38;
    const bw = w - 38 - 14;
    const bh = 6;
    const by = capY + 26;
    ctx.fillStyle = withAlpha(HUD_COLORS.ink, 0.14);
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();
    const pulse = REDUCED_MOTION ? 1 : 0.8 + 0.2 * Math.sin(now * 5);
    ctx.globalAlpha = fadeIn * pulse;
    ctx.fillStyle = HUD_COLORS.danger;
    roundRect(ctx, bx, by, Math.max(bh, bw * storm), bh, bh / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    capY += h + 8;
  }

  if (hint) {
    const w = 40 + estTextWidth(hint, 13);
    const h = 28;
    const x0 = (CANVAS.w - w) / 2;
    // 出现瞬间 0.25s 淡入；之后胶囊本体恒定，只有珊瑚点轻呼吸——布告不该抖
    const fadeIn = REDUCED_MOTION ? 1 : Math.max(0, Math.min(1, (now - dangerHintAt) / 0.25));
    ctx.globalAlpha = fadeIn;
    panel(ctx, x0, capY, w, h);
    ctx.fillStyle = withAlpha(HUD_COLORS.danger, REDUCED_MOTION ? 1 : 0.7 + 0.3 * Math.sin(now * 3));
    ctx.beginPath();
    ctx.arc(x0 + 15, capY + h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = HUD_COLORS.ink;
    ctx.font = "700 13px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(hint, x0 + 27, capY + h / 2 + 5);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * 左上：材料存量卡（木板/塑料/金属/绳索，资源增加时数字弹跳）
 * 及其下方的淡水/食物生存条（低量柔和脉冲）。
 */
export function drawResourceBar(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const now = info.time ?? performance.now() / 1000;
  syncHudState(info, now);
  ctx.save();

  // 材料卡
  const shown = RESOURCE_ORDER.filter((k) => info.resources?.[k] !== undefined);
  let nextY = 14;
  if (shown.length > 0) {
    const itemW = 96;
    const x0 = 16;
    const y0 = 14;
    const h = 54;
    const w = 14 + shown.length * itemW;
    panel(ctx, x0, y0, w, h);
    shown.forEach((kind, i) => {
      const ix = x0 + 20 + i * itemW;
      const cy = y0 + h / 2 - 4;
      drawResourceIcon(ctx, kind, ix + 10, cy, 11);
      const scale = popScale(popAt[kind], now);
      ctx.save();
      ctx.translate(ix + 30, cy + 6);
      ctx.scale(scale, scale);
      ctx.fillStyle = HUD_COLORS.ink;
      ctx.font = "800 20px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${Math.floor(info.resources![kind]!)}`, 0, 0);
      ctx.restore();
      ctx.fillStyle = withAlpha(HUD_COLORS.ink, 0.55);
      ctx.font = "700 11px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(RESOURCE_LABEL[kind], ix, y0 + h - 9);
    });
    nextY = y0 + h + 8;
  }

  // 生存条：淡水 / 食物
  const meters: Array<{ v: number | undefined; color: string; label: string; icon: "drop" | "fish" }> = [
    { v: info.water01, color: HUD_COLORS.water, label: "淡水", icon: "drop" },
    { v: info.food01, color: HUD_COLORS.food, label: "食物", icon: "fish" },
  ];
  const active = meters.filter((m) => m.v !== undefined);
  if (active.length > 0) {
    const x0 = 16;
    const w = 236;
    const rowH = 30;
    const h = 10 + active.length * rowH;
    panel(ctx, x0, nextY, w, h);
    active.forEach((m, i) => {
      const cy = nextY + 10 + i * rowH + rowH / 2 - 2;
      const v = Math.max(0, Math.min(1, m.v!));
      const low = v < 0.25;
      const pulse = low && !REDUCED_MOTION ? 0.75 + 0.25 * Math.sin(now * 5) : 1;
      if (m.icon === "drop") drawDropIcon(ctx, x0 + 22, cy, 8, low ? HUD_COLORS.danger : m.color);
      else drawFishIcon(ctx, x0 + 22, cy, 9, low ? HUD_COLORS.danger : m.color);
      ctx.fillStyle = withAlpha(HUD_COLORS.ink, 0.6);
      ctx.font = "700 12px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(m.label, x0 + 38, cy + 4);
      const bx = x0 + 76;
      const bw = w - 76 - 14;
      const bh = 10;
      ctx.fillStyle = withAlpha(HUD_COLORS.ink, 0.14);
      roundRect(ctx, bx, cy - bh / 2, bw, bh, bh / 2);
      ctx.fill();
      if (v > 0.01) {
        ctx.globalAlpha = low ? pulse : 1;
        ctx.fillStyle = low ? HUD_COLORS.danger : m.color;
        roundRect(ctx, bx, cy - bh / 2, Math.max(bh, bw * v), bh, bh / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  ctx.restore();
}

/** 右上：太阳 + 当天进度弧 +「第 N 天」（换天瞬间弹跳）；下方可选岛民胶囊。 */
export function drawDayBadge(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const now = info.time ?? performance.now() / 1000;
  syncHudState(info, now);
  ctx.save();

  const w = 136;
  const h = 44;
  const x0 = CANVAS.w - 16 - w;
  const y0 = 14;
  const scale = popScale(dayPopAt, now);
  ctx.translate(x0 + w / 2, y0 + h / 2);
  ctx.scale(scale, scale);
  panel(ctx, -w / 2, -h / 2, w, h);

  // 太阳 + 进度弧
  const sx = -w / 2 + 24;
  ctx.fillStyle = HUD_COLORS.sun;
  ctx.beginPath();
  ctx.arc(sx, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  const p = Math.max(0, Math.min(1, info.dayProgress01 ?? 0));
  ctx.strokeStyle = withAlpha(HUD_COLORS.ink, 0.18);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, 0, 13, 0, Math.PI * 2);
  ctx.stroke();
  if (p > 0.01) {
    ctx.strokeStyle = HUD_COLORS.sun;
    ctx.beginPath();
    ctx.arc(sx, 0, 13, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = HUD_COLORS.ink;
  ctx.font = "800 19px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`第 ${Math.max(1, Math.floor(info.day))} 天`, sx + 24, 7);
  ctx.restore();

  // 岛民胶囊（可选）
  if (info.islanders) {
    ctx.save();
    const starve = Math.max(0, Math.min(1, info.starve01 ?? 0));
    // 饿态：session 折算的 fed<total，或父调度器接线后的 starve01 > 0.4
    const hungry = info.islanders.fed < info.islanders.total || starve > 0.4;
    const iw = 108;
    const ih = 30;
    const ix = CANVAS.w - 16 - iw;
    const iy = y0 + h + 8;
    panel(ctx, ix, iy, iw, ih);
    ctx.globalAlpha = hungry && !REDUCED_MOTION ? 0.7 + 0.3 * Math.sin(now * 4) : 1;
    ctx.fillStyle = hungry ? HUD_COLORS.danger : HUD_COLORS.accent;
    ctx.beginPath();
    ctx.arc(ix + 18, iy + ih / 2 - 3, 4, 0, Math.PI * 2); // 头
    ctx.fill();
    roundRect(ctx, ix + 13, iy + ih / 2 + 2, 10, 7, 3); // 身
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = HUD_COLORS.ink;
    ctx.font = "700 14px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`岛民 ${info.islanders.fed}/${info.islanders.total}`, ix + 32, iy + ih / 2 + 5);
    // 宽限余量细条：starve01 接线后才出现，从满慢慢缩短（珊瑚色，不闪）
    if (starve > 0) {
      const bw = iw - 22;
      ctx.fillStyle = withAlpha(HUD_COLORS.ink, 0.14);
      roundRect(ctx, ix + 11, iy + ih - 7, bw, 3, 1.5);
      ctx.fill();
      ctx.fillStyle = HUD_COLORS.danger;
      roundRect(ctx, ix + 11, iy + ih - 7, Math.max(3, bw * (1 - starve)), 3, 1.5);
      ctx.fill();
    }
    // 补粮提示：轻松文案，柔和淡入淡出，贴右缘不进舞台
    if (hungry) {
      ctx.globalAlpha = REDUCED_MOTION ? 1 : 0.7 + 0.3 * Math.sin(now * 2.2);
      ctx.fillStyle = HUD_COLORS.danger;
      ctx.font = "700 12px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("肚子咕咕叫，快补点水粮", CANVAS.w - 18, iy + ih + 16);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

/**
 * 底部中央：建造快捷栏（1–5 键位 + 图标 + 名称 + 花费；选中抬升亮边，
 * 造不起半透明）+ 上方一行提示（placeHint 传入时优先显示放置被拒短句）；
 * 左下角通用操作提示。
 */
export function drawBuildBar(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const now = info.time ?? performance.now() / 1000;
  syncHudState(info, now);
  ctx.save();

  // 左下通用操作提示（不与建造栏重叠：栏在中央，提示贴左）
  ctx.fillStyle = withAlpha(HUD_COLORS.ink, 0.55);
  ctx.font = "13px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("WASD 开船 · 空格捞取 · P 暂停", 18, CANVAS.h - 20);

  const slots = info.build?.slots ?? [];
  if (slots.length === 0) {
    ctx.restore();
    return;
  }

  const slotW = 118;
  const slotH = 62;
  const gap = 10;
  const total = slots.length * slotW + (slots.length - 1) * gap;
  const x0 = (CANVAS.w - total) / 2;
  const y0 = CANVAS.h - 16 - slotH;

  // 栏上方提示行，三级优先：放置被拒短句（珊瑚、出现瞬间轻弹）>
  // 全未选中的「先按 1–5」引导（潟湖青、轻呼吸）> 调用方文案
  if (info.placeHint) {
    ctx.save();
    const scale = popScale(placeHintAt, now);
    ctx.translate(CANVAS.w / 2, y0 - 10);
    ctx.scale(scale, scale);
    ctx.fillStyle = HUD_COLORS.danger;
    ctx.font = "700 12px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(info.placeHint, 0, 0);
    ctx.restore();
  } else {
    const noneSelected = slots.every((s) => !s.selected);
    const hint = noneSelected
      ? "先按 1–5 挑个建筑 · 点海面放置"
      : (info.build?.hint ?? "按 1–5 选建筑 · 点海面放置");
    ctx.fillStyle = noneSelected
      ? withAlpha(HUD_COLORS.accent, REDUCED_MOTION ? 0.9 : 0.7 + 0.25 * Math.sin(now * 2))
      : withAlpha(HUD_COLORS.ink, 0.55);
    ctx.font = "12px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(hint, CANVAS.w / 2, y0 - 10);
  }

  slots.forEach((slot, i) => {
    const affordable = slot.affordable !== false;
    const sx = x0 + i * (slotW + gap);
    const sy = slot.selected ? y0 - 6 : y0;
    ctx.save();
    if (!affordable) ctx.globalAlpha = 0.55;

    panel(ctx, sx, sy, slotW, slotH);
    if (slot.selected) {
      ctx.strokeStyle = HUD_COLORS.accent;
      ctx.lineWidth = 2;
      roundRect(ctx, sx, sy, slotW, slotH, 12);
      ctx.stroke();
      // 选中格顶一颗小太阳点，轻松感（不闪，静态）
      ctx.fillStyle = HUD_COLORS.sun;
      ctx.beginPath();
      ctx.arc(sx + slotW / 2, sy - 1, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 键位角标
    ctx.fillStyle = withAlpha(HUD_COLORS.ink, 0.16);
    roundRect(ctx, sx + 6, sy + 6, 18, 18, 5);
    ctx.fill();
    ctx.fillStyle = HUD_COLORS.ink;
    ctx.font = "800 12px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(slot.key, sx + 15, sy + 19);

    drawBuildIcon(ctx, slot, sx + 40, sy + slotH / 2 - 4);

    ctx.fillStyle = HUD_COLORS.ink;
    ctx.font = "700 15px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(slot.name, sx + 58, sy + 28);
    if (slot.cost) {
      ctx.fillStyle = affordable ? withAlpha(HUD_COLORS.ink, 0.55) : HUD_COLORS.danger;
      ctx.font = "700 11px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText(slot.cost, sx + 58, sy + 46);
    }
    ctx.restore();
  });

  ctx.restore();
}

// ---- 道具袋条：几何真源 + 点击契约（Round 6）----
// 画（drawBagStrip）与点（hitTestBagStrip）共用这一份数——改布局只改这里，
// 命中区永不和像素漂移。

/** 道具袋条几何（逻辑坐标）。cell 36px 是可见格；命中区见 bagSlotRects。 */
const BAG_GEO = {
  x: 16,
  y: 192,
  /** 卡内边距 */
  pad: 10,
  /** 可见小格边长 */
  cell: 36,
  /** 小格间距 */
  gap: 6,
  /** 小格顶相对卡顶的偏移（头行占高） */
  cellTop: 26,
  /** 卡高 = headH + cell + pad */
  headH: 28,
  /** 命中区外扩：36px 格子扩成 42×44 拇指目标，互不重叠、不出卡缘 */
  hitPadX: 3,
  hitPadY: 4,
} as const;

/** 逻辑坐标系里的一块矩形（Engine 已抹平 DPR；input.ts 的点击坐标可直接比）。 */
export type HudRect = { x: number; y: number; w: number; h: number };

/** 袋格命中结果：index 对齐 bagSlots.items（0 起）；空格 item 为 null。 */
export type BagHit = { index: number; item: BagItem | null };

/** 道具袋条整卡矩形。纯几何，画没画（bagSlots 传没传）由调用方自己判断。 */
export function bagStripRect(): HudRect {
  const n = INVENTORY.hudSlots;
  return {
    x: BAG_GEO.x,
    y: BAG_GEO.y,
    w: BAG_GEO.pad * 2 + n * BAG_GEO.cell + (n - 1) * BAG_GEO.gap,
    h: BAG_GEO.headH + BAG_GEO.cell + BAG_GEO.pad,
  };
}

/**
 * 全部袋格的点击矩形（index 对齐 bagSlots.items）。命中区比可见格大一圈
 * （42×44，SOTA_BAR §1.6 的拇指目标线），相邻恰好相接不重叠、全在卡内。
 */
export function bagSlotRects(): HudRect[] {
  const { x, y, pad, cell, gap, cellTop, hitPadX, hitPadY } = BAG_GEO;
  const rects: HudRect[] = [];
  for (let i = 0; i < INVENTORY.hudSlots; i++) {
    rects.push({
      x: x + pad + i * (cell + gap) - hitPadX,
      y: y + cellTop - hitPadY,
      w: cell + hitPadX * 2,
      h: cell + hitPadY * 2,
    });
  }
  return rects;
}

/**
 * 袋格命中测试（纯函数，不碰模块状态）：点 (x, y) 落在哪个袋格。
 * bag 缺省（条没画）恒 null；空格也算命中（item 为 null）；items 超过
 * hudSlots 的部分画不到也点不到——总况看头行数字。
 */
export function hitTestBagStrip(x: number, y: number, bag: HudInfo["bagSlots"]): BagHit | null {
  if (!bag) return null;
  const rects = bagSlotRects();
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return { index: i, item: bag.items?.[i] ?? null };
    }
  }
  return null;
}

/**
 * 袋格点击一站式封装（onUse 回调契约）：命中**占用格**时调 bag.onUse(item, index)
 * 并记一次按压反馈（下一帧那格潟湖青描边圈 + 内容轻缩 0.28s）。
 * 返回「点击是否被袋条吞掉」——落在整卡范围内（含头行与空格）即吞，
 * 免得点袋子的手一滑，在卡背后的海面上放了个建筑。session 接线一行：
 *   if (!clickBagStrip(click.x, click.y, bagUi, this.time)) this.tryPlaceAt(click.x, click.y);
 * timeS 必须与 HudInfo.time 同一时钟（都传 session 秒）；缺省则只回调、
 * 不做按压动画（时钟对不上宁可不动）。bag 缺省恒 false，行为与现在一致。
 */
export function clickBagStrip(
  x: number,
  y: number,
  bag: HudInfo["bagSlots"],
  timeS?: number,
): boolean {
  if (!bag) return false;
  const r = bagStripRect();
  if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return false;
  const hit = hitTestBagStrip(x, y, bag);
  if (hit?.item) {
    if (timeS !== undefined) bagPressAt.set(hit.index, timeS);
    bag.onUse?.(hit.item, hit.index);
  }
  return true;
}

/**
 * 左列第三卡：道具袋条（Round 5；bagSlots 缺省时不触碰 ctx，逐像素一致）。
 * 固定 y 192 起——拾取提示槽位（154–184）之下、左下日记卡上浮上限（~586）
 * 之上，左列三卡与建造栏互不相撞，中央舞台零遮挡。
 * - 头行：布袋图标 +「道具袋」+ `used/max`；袋满时图标与数字染珊瑚色
 *   柔和呼吸（reduced-motion 下恒定）——「捞了也装不下」提前一眼看到。
 *   传了 onUse 时头行多一句潟湖青「点一下就用」（可点的招牌）。
 * - 下排固定 INVENTORY.hudSlots 个 36px 小格：物品剪影复用 world/items
 *   的登记表（id 缺省按 name 散列出「未知包裹」，同名恒同色），格内裁切
 *   不外溢；×数量角标压右下；数量增加的那一格弹跳（资源 pop 同曲线）。
 *   clickBagStrip 点过的格子描边圈 + 轻缩 0.28s（reduced-motion 下只有
 *   恒定描边圈，无缩放）。空格画淡色底座，items 超出只画前 6 件。
 */
export function drawBagStrip(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const now = info.time ?? performance.now() / 1000;
  syncHudState(info, now);
  const bag = info.bagSlots;
  if (!bag) return;
  const FONT = "'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const slotN = INVENTORY.hudSlots;
  const { cell, gap, pad } = BAG_GEO;
  const { x: x0, y: y0, w, h } = bagStripRect();
  ctx.save();
  panel(ctx, x0, y0, w, h);

  // 头行：布袋 + 名 + 已占/总格数
  const used = Math.max(0, Math.floor(bag.used));
  const max = Math.max(0, Math.floor(bag.max));
  const full = max > 0 && used >= max;
  const pulse = full && !REDUCED_MOTION ? 0.75 + 0.25 * Math.sin(now * 4) : 1;
  ctx.globalAlpha = pulse;
  drawPouchIcon(ctx, x0 + pad + 7, y0 + 15, full ? HUD_COLORS.danger : HUD_COLORS.rope);
  ctx.globalAlpha = 1;
  ctx.fillStyle = withAlpha(HUD_COLORS.ink, 0.6);
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("道具袋", x0 + pad + 19, y0 + 19);
  if (bag.onUse) {
    // 可点的招牌：只有回调接上了才亮，免得空许诺
    ctx.fillStyle = withAlpha(HUD_COLORS.accent, 0.8);
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText("· 点一下就用", x0 + pad + 19 + estTextWidth("道具袋", 12) + 4, y0 + 19);
  }
  ctx.globalAlpha = pulse;
  ctx.fillStyle = full ? HUD_COLORS.danger : withAlpha(HUD_COLORS.ink, 0.55);
  ctx.textAlign = "right";
  ctx.fillText(`${used}/${max}${full ? " 满" : ""}`, x0 + w - pad, y0 + 19);
  ctx.globalAlpha = 1;

  // 小格排：先底座，再剪影 + 数量角标（整格一起弹）
  const items = bag.items ?? [];
  const sy = y0 + BAG_GEO.cellTop;
  for (let i = 0; i < slotN; i++) {
    const sx = x0 + pad + i * (cell + gap);
    const it = items[i];
    ctx.fillStyle = withAlpha(HUD_COLORS.ink, it ? 0.12 : 0.05);
    roundRect(ctx, sx, sy, cell, cell, 8);
    ctx.fill();
    ctx.strokeStyle = withAlpha(HUD_COLORS.ink, 0.1);
    ctx.lineWidth = 1;
    roundRect(ctx, sx, sy, cell, cell, 8);
    ctx.stroke();
    if (!it) continue;
    // 按压反馈：clickBagStrip 记过时间戳才有；时钟对不上（未来戳）视为过期
    const pressStamp = bagPressAt.get(i);
    const pressT =
      pressStamp !== undefined && now >= pressStamp
        ? Math.min(1, (now - pressStamp) / PRESS_S)
        : 1;
    const squash = REDUCED_MOTION ? 1 : 1 - 0.12 * (1 - pressT);
    const art = itemArt(it.id ?? it.name);
    const scale = popScale(bagPopAt.get(it.name), now);
    ctx.save();
    roundRect(ctx, sx, sy, cell, cell, 8);
    ctx.clip(); // 剪影与角标都不许溢出格子（pop 放大时也被裁住）
    ctx.translate(sx + cell / 2, sy + cell / 2);
    ctx.scale(scale * squash, scale * squash);
    // time 传 0：袋子里的东西是静物，摇摆留给海面
    (art.draw ?? SILHOUETTES[art.shape])(ctx, 11, { tint: art.tint, dark: art.dark, accent: art.accent }, 0);
    const qty = Math.max(1, Math.floor(it.count));
    if (qty > 1) {
      const label = `×${qty}`;
      const lw = estTextWidth(label, 10);
      ctx.fillStyle = "rgba(4, 26, 36, 0.78)";
      roundRect(ctx, cell / 2 - lw - 9, cell / 2 - 14, lw + 9, 14, 5);
      ctx.fill();
      ctx.fillStyle = HUD_COLORS.sun;
      ctx.font = `700 10px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(label, cell / 2 - 4, cell / 2 - 4);
    }
    ctx.restore();
    if (pressT < 1) {
      // 按压圈叠在内容之上：淡出 0.28s；reduced-motion 下恒定亮度、瞬现瞬撤
      ctx.strokeStyle = withAlpha(HUD_COLORS.accent, REDUCED_MOTION ? 0.7 : 0.9 * (1 - pressT));
      ctx.lineWidth = 2;
      roundRect(ctx, sx + 1, sy + 1, cell - 2, cell - 2, 7);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * 剧情层（Round 4；Round 5 追加 questDone 完成庆祝。四个字段都没接线时
 * 不画任何东西，逐像素与 Round 3 一致）：
 * - lootToast：左上生存条正下方小胶囊（暖阳四角星 + 名称 + ×数量），
 *   出现瞬间弹跳（资源 pop 同曲线）+ 0.2s 淡入。
 * - quest：右上岛民胶囊下方任务胶囊（潟湖青小旗 + 任务名 + 进度行）；
 *   新任务整胶囊淡入，进度变化瞬间进度行轻弹——「有进展」的确认感。
 * - storyBeat：左下角日记/广播卡（电波图标 + 暖阳标题 + 正文 ≤3 行自动换行），
 *   节拍变化时淡入上浮 0.35s。卡宽 288 < 建造栏左缘 325，互不相撞。
 * - questDone（Round 5）：完成庆祝胶囊——潟湖青勾章 + 任务名 +「完成！」+
 *   可选暖阳奖励行；出现瞬间弹跳 + 0.25s 淡入 + 勾章放出扩散环与一小把
 *   彩纸（0.9s 一次性，i 索引定角度定色，零 RNG 可复现）。画在任务胶囊
 *   下方 y 178（quest 不在时占其原位 y 124），彩纸活动半径 ≤34px，
 *   全程贴右缘带（x ≥ ~990）。reduced-motion 下瞬现、无环无彩纸。
 * 各块全部贴边（左列 154–184 / 右列 124–224 / 左下角压底），中央舞台零遮挡；
 * reduced-motion 下全部瞬现、无弹跳。文本宽度全走 estTextWidth，超长自动省略号。
 */
export function drawStoryLayer(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const now = info.time ?? performance.now() / 1000;
  syncHudState(info, now);
  if (!info.storyBeat && !info.quest && !info.lootToast && !info.questDone) return;
  const FONT = "'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.save();

  // 拾取轻提示：左上生存条（y 76–146）正下方
  if (info.lootToast) {
    const name = wrapText(info.lootToast.name, 13, 160, 1)[0] ?? "";
    const qtyText = `×${Math.max(1, Math.floor(info.lootToast.qty))}`;
    const nameW = estTextWidth(name, 13);
    const w = 34 + nameW + 6 + estTextWidth(qtyText, 13) + 14;
    const h = 30;
    const fadeIn = REDUCED_MOTION ? 1 : Math.max(0, Math.min(1, (now - lootAt) / 0.2));
    const scale = REDUCED_MOTION ? 1 : popScale(lootAt, now);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.translate(16 + w / 2, 154 + h / 2);
    ctx.scale(scale, scale);
    panel(ctx, -w / 2, -h / 2, w, h);
    drawSparkIcon(ctx, -w / 2 + 20, 0, 7, HUD_COLORS.sun);
    ctx.fillStyle = HUD_COLORS.ink;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(name, -w / 2 + 34, 5);
    ctx.fillStyle = HUD_COLORS.sun;
    ctx.fillText(qtyText, -w / 2 + 34 + nameW + 6, 5);
    ctx.restore();
  }

  // 任务胶囊：右上岛民胶囊（y 66–96）与饿态提示行（~116）之下，贴右缘
  if (info.quest) {
    const name = wrapText(info.quest.name, 13, 208, 1)[0] ?? "";
    const progress = wrapText(info.quest.progress, 12, 208, 1)[0] ?? "";
    const w = Math.max(120, 42 + Math.max(estTextWidth(name, 13), estTextWidth(progress, 12)));
    const h = 46;
    const x0 = CANVAS.w - 16 - w;
    const y0 = 124;
    const fadeIn = REDUCED_MOTION ? 1 : Math.max(0, Math.min(1, (now - questAt) / 0.25));
    ctx.save();
    ctx.globalAlpha = fadeIn;
    panel(ctx, x0, y0, w, h);
    drawFlagIcon(ctx, x0 + 18, y0 + 15, HUD_COLORS.accent);
    ctx.fillStyle = HUD_COLORS.ink;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(name, x0 + 30, y0 + 19);
    const scale = REDUCED_MOTION ? 1 : popScale(questProgressAt, now);
    ctx.translate(x0 + 30, y0 + 36);
    ctx.scale(scale, scale);
    ctx.fillStyle = HUD_COLORS.accent;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(progress, 0, 0);
    ctx.restore();
  }

  // 任务完成庆祝：任务胶囊之下（quest 不在时占其原位），贴右缘
  if (info.questDone) {
    const name = wrapText(info.questDone.name, 13, 150, 1)[0] ?? "";
    const doneTag = " 完成！";
    const reward = info.questDone.reward
      ? (wrapText(info.questDone.reward, 12, 190, 1)[0] ?? "")
      : "";
    const line1W = estTextWidth(name, 13) + estTextWidth(doneTag, 13);
    const w = Math.max(132, 44 + Math.max(line1W, estTextWidth(reward, 12)));
    const h = reward ? 46 : 32;
    const x0 = CANVAS.w - 16 - w;
    const y0 = info.quest ? 178 : 124;
    const fadeIn = REDUCED_MOTION ? 1 : Math.max(0, Math.min(1, (now - questDoneAt) / 0.25));
    const scale = REDUCED_MOTION ? 1 : popScale(questDoneAt, now);
    const ckx = -w / 2 + 18;
    const cky = reward ? -h / 2 + 16 : 0;
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.translate(x0 + w / 2, y0 + h / 2);
    ctx.scale(scale, scale);
    panel(ctx, -w / 2, -h / 2, w, h);
    // 勾章：潟湖青圆底 + 面板深色勾（危险色一律不进庆祝）
    ctx.fillStyle = HUD_COLORS.accent;
    ctx.beginPath();
    ctx.arc(ckx, cky, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#07242f";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ckx - 3.6, cky + 0.2);
    ctx.lineTo(ckx - 1, cky + 3);
    ctx.lineTo(ckx + 4, cky - 3.2);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = HUD_COLORS.ink;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(name, ckx + 14, cky + 5);
    ctx.fillStyle = HUD_COLORS.accent;
    ctx.fillText(doneTag, ckx + 14 + estTextWidth(name, 13), cky + 5);
    if (reward) {
      ctx.fillStyle = HUD_COLORS.sun;
      ctx.font = `700 12px ${FONT}`;
      ctx.fillText(reward, ckx + 14, cky + 22);
    }
    ctx.restore();

    // 扩散环 + 彩纸：从勾章放出，0.9s 一次性；i 索引定角度定色，零 RNG
    const t = (now - questDoneAt) / 0.9;
    if (!REDUCED_MOTION && t >= 0 && t < 1) {
      const ease = 1 - (1 - t) * (1 - t);
      const cx = x0 + 18;
      const cy = y0 + (reward ? 16 : h / 2);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.5;
      ctx.strokeStyle = HUD_COLORS.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 8 + ease * 16, 0, Math.PI * 2);
      ctx.stroke();
      const confetti = [HUD_COLORS.sun, HUD_COLORS.accent, HUD_COLORS.food, HUD_COLORS.danger];
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + 0.45;
        const dist = ease * (16 + (i % 3) * 7);
        const px = cx + Math.cos(ang) * dist;
        const py = cy + Math.sin(ang) * dist * 0.8 + ease * ease * 9; // 轻微下坠
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = confetti[i % confetti.length];
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + ease * 2.4);
        ctx.fillRect(-1.8, -1.2, 3.6, 2.4);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  // 日记/广播卡：左下角，底边锚在操作提示行（基线 CANVAS.h-20）上方
  if (info.storyBeat) {
    const w = 288;
    const pad = 12;
    const title = wrapText(info.storyBeat.title, 13, w - pad * 2 - 20, 1)[0] ?? "";
    const lines = wrapText(info.storyBeat.body, 12, w - pad * 2, 3);
    const h = lines.length > 0 ? 56 + (lines.length - 1) * 17 : 36;
    const t = REDUCED_MOTION ? 1 : Math.max(0, Math.min(1, (now - storyAt) / 0.35));
    const rise = (1 - t) * (1 - t) * 8; // 入场从 8px 低处 ease-out 上浮
    const x0 = 16;
    const y0 = CANVAS.h - 44 - h + rise;
    ctx.save();
    ctx.globalAlpha = t;
    panel(ctx, x0, y0, w, h);
    drawRadioIcon(ctx, x0 + pad + 6, y0 + 19, HUD_COLORS.sun);
    ctx.fillStyle = HUD_COLORS.sun;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(title, x0 + pad + 20, y0 + 24);
    ctx.fillStyle = withAlpha(HUD_COLORS.ink, 0.88);
    ctx.font = `12px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, x0 + pad, y0 + 44 + i * 17);
    });
    ctx.restore();
  }

  ctx.restore();
}

// ---- 图标（全部程序化绘制，零素材）----

function drawResourceIcon(
  ctx: CanvasRenderingContext2D,
  kind: ResourceKind,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  if (kind === "wood") {
    ctx.fillStyle = HUD_COLORS.wood;
    roundRect(ctx, cx - r, cy - r * 0.7, r * 2, r * 0.62, 2);
    ctx.fill();
    roundRect(ctx, cx - r * 0.8, cy + 0.08 * r, r * 2, r * 0.62, 2);
    ctx.fill();
  } else if (kind === "plastic") {
    ctx.fillStyle = HUD_COLORS.plastic;
    roundRect(ctx, cx - r * 0.28, cy - r * 1.1, r * 0.56, r * 0.42, 1.5); // 瓶口
    ctx.fill();
    roundRect(ctx, cx - r * 0.62, cy - r * 0.6, r * 1.24, r * 1.7, 3); // 瓶身
    ctx.fill();
  } else if (kind === "metal") {
    ctx.fillStyle = HUD_COLORS.metal;
    ctx.beginPath(); // 锭：梯形
    ctx.moveTo(cx - r * 0.7, cy - r * 0.45);
    ctx.lineTo(cx + r * 0.7, cy - r * 0.45);
    ctx.lineTo(cx + r, cy + r * 0.55);
    ctx.lineTo(cx - r, cy + r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = withAlpha("#ffffff", 0.4);
    ctx.fillRect(cx - r * 0.45, cy - r * 0.28, r * 0.8, r * 0.2);
  } else {
    ctx.strokeStyle = HUD_COLORS.rope; // 绳圈
    ctx.lineWidth = r * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.68, 0.35, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = r * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.62, cy + r * 0.28);
    ctx.lineTo(cx + r * 1.05, cy + r * 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

/** 四角星小图标（拾取提示用）：捞到东西的「叮」一下，暖阳色。 */
function drawSparkIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.22, cy - r * 0.22, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.22, cy + r * 0.22, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.22, cy + r * 0.22, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.22, cy - r * 0.22, cx, cy - r);
  ctx.closePath();
  ctx.fill();
}

/** 布袋小图标（道具袋条用）：鼓底束口袋 + 扎绳，绳索黄；袋满换珊瑚色。 */
function drawPouchIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath(); // 袋身：束口往下鼓
  ctx.moveTo(cx - 2.5, cy - 4);
  ctx.bezierCurveTo(cx - 7.5, cy - 1.5, cx - 7, cy + 6, cx, cy + 6);
  ctx.bezierCurveTo(cx + 7, cy + 6, cx + 7.5, cy - 1.5, cx + 2.5, cy - 4);
  ctx.closePath();
  ctx.fill();
  roundRect(ctx, cx - 3.5, cy - 7, 7, 3.2, 1.5); // 束口
  ctx.fill();
  ctx.strokeStyle = "rgba(4, 26, 36, 0.55)"; // 扎绳
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 3.8, cy - 3.6);
  ctx.lineTo(cx + 3.8, cy - 3.6);
  ctx.stroke();
  ctx.restore();
}

/** 小旗图标（任务胶囊用）：旗杆 + 三角旗，潟湖青。 */
function drawFlagIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 7);
  ctx.lineTo(cx - 4, cy + 8);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 7);
  ctx.lineTo(cx + 7, cy - 3.5);
  ctx.lineTo(cx - 4, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 电波图标（日记/广播卡用）：信号点 + 两道右扩弧，暖阳色。 */
function drawRadioIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  for (const r of [5.5, 9] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, -0.62, 0.62);
    ctx.stroke();
  }
  ctx.restore();
}

/** 闪电小图标（风暴预警条用）：经典折线闪电，珊瑚色不吓人。 */
function drawBoltIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.3, cy - r);
  ctx.lineTo(cx - r * 0.45, cy + r * 0.12);
  ctx.lineTo(cx - r * 0.05, cy + r * 0.12);
  ctx.lineTo(cx - r * 0.3, cy + r);
  ctx.lineTo(cx + r * 0.45, cy - r * 0.15);
  ctx.lineTo(cx + r * 0.05, cy - r * 0.15);
  ctx.closePath();
  ctx.fill();
}

function drawDropIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.bezierCurveTo(cx + r * 0.9, cy - r * 0.1, cx + r * 0.75, cy + r * 0.8, cx, cy + r * 0.8);
  ctx.bezierCurveTo(cx - r * 0.75, cy + r * 0.8, cx - r * 0.9, cy - r * 0.1, cx, cy - r);
  ctx.closePath();
  ctx.fill();
}

function drawFishIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.85, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // 尾鳍
  ctx.moveTo(cx + r * 0.7, cy);
  ctx.lineTo(cx + r * 1.25, cy - r * 0.5);
  ctx.lineTo(cx + r * 1.25, cy + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(4, 26, 36, 0.8)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.4, cy - r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuildIcon(ctx: CanvasRenderingContext2D, slot: BuildSlot, cx: number, cy: number): void {
  const r = 10;
  ctx.save();
  if (slot.icon === "floor") {
    ctx.fillStyle = HUD_COLORS.wood; // 2×2 地基格
    for (const dx of [-1, 0.14] as const)
      for (const dy of [-1, 0.14] as const) {
        roundRect(ctx, cx + dx * r * 0.92, cy + dy * r * 0.92, r * 0.8, r * 0.8, 2);
        ctx.fill();
      }
  } else if (slot.icon === "collector") {
    ctx.fillStyle = HUD_COLORS.metal; // 漏斗
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r * 0.7);
    ctx.lineTo(cx + r, cy - r * 0.7);
    ctx.lineTo(cx + r * 0.25, cy + r * 0.2);
    ctx.lineTo(cx - r * 0.25, cy + r * 0.2);
    ctx.closePath();
    ctx.fill();
    roundRect(ctx, cx - r * 0.22, cy + r * 0.2, r * 0.44, r * 0.7, 2);
    ctx.fill();
  } else if (slot.icon === "purifier") {
    ctx.strokeStyle = HUD_COLORS.metal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    drawDropIcon(ctx, cx, cy, r * 0.55, HUD_COLORS.water);
  } else if (slot.icon === "fish") {
    drawFishIcon(ctx, cx, cy, r * 0.95, HUD_COLORS.food);
  } else if (slot.icon === "turret") {
    ctx.fillStyle = HUD_COLORS.metal; // 底座 + 炮管
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.3, r * 0.72, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = HUD_COLORS.metal;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.1);
    ctx.lineTo(cx + r * 0.95, cy - r * 0.75);
    ctx.stroke();
  } else {
    ctx.strokeStyle = withAlpha(HUD_COLORS.ink, 0.5); // 未知：名称首字
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.ink;
    ctx.font = "700 11px 'Trebuchet MS', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(slot.name.slice(0, 1), cx, cy + 4);
  }
  ctx.restore();
}

// ---- 基础件 ----

/**
 * 磨砂暗玻璃面板：接触阴影 + 本体 + 1px 上沿高光。
 * 不用纯白描边、不用斜杠高光、不用双色廉价渐变。
 */
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  roundRect(ctx, x, y + 2, w, h, 12);
  ctx.fill();
  ctx.fillStyle = HUD_COLORS.panel;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = HUD_COLORS.panelLine;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 1);
  ctx.lineTo(x + w - 12, y + 1);
  ctx.strokeStyle = "rgba(236, 228, 208, 0.14)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** 文本宽度估算（CJK ≈ 全宽、其余 ≈ 0.55 宽）：不依赖 measureText，stub ctx 也能跑。 */
function estTextWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0xff ? px : px * 0.55;
  return w;
}

/**
 * 按 estTextWidth 逐字换行（中文文案为主，无断词需求）；
 * 超过 maxLines 行时截断、末行收省略号。maxLines=1 即单行截断。
 */
function wrapText(text: string, px: number, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  let w = 0;
  let clipped = false;
  for (const ch of text) {
    const cw = ch.charCodeAt(0) > 0xff ? px : px * 0.55;
    if (w + cw > maxW && line) {
      if (lines.length + 1 >= maxLines) {
        clipped = true;
        break;
      }
      lines.push(line);
      line = "";
      w = 0;
    }
    if (line === "" && ch === " ") continue; // 换行后的行首空格丢弃
    line += ch;
    w += cw;
  }
  if (line) lines.push(line);
  if (clipped && lines.length > 0) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/u, "…");
  }
  return lines;
}

function withAlpha(hex: string, a: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
