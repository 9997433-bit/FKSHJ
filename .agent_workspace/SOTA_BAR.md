# SOTA 基准线 — 视觉 / HUD / 菜单 / 手感（Round 1 · fable-sota · 海上末日重开）

> 目的：定义「2026 年的海上末日拾荒建造网页游戏」应该达到的体验底线。
> 基调一句话：**手游浮岛基建的轻松感——末世但不丧**。天塌了海涨了，
> 但画面里永远晒得到太阳：暖阳黄 + 潟湖青压深海底色，危险用珊瑚色不用血红，
> 文案带摸鱼的松弛感，结算永远给「再来一局」的钩子。
> 对照对象是益世界《疯狂水世界》一类休闲基建手游的 UI 手感（禁止照抄素材与数值）。

## 1. 这个品类的 UI 应有的样子

### 1.1 首帧体验（0–10 秒）
- 打开即见标题卡片 + 背后实时海面（loop 始终画 session），无白屏无加载条。
- 一个主按钮、一次点击（或 Enter）出海；玩法说明内联展开，绝不 `alert()`。
- 「最长存活 N 天」立即可见——生存品类的复玩钩子是天数不是分数。

### 1.2 视觉基调
- 深海底色上必须有暖色光源（晨光 / 暖阳黄点缀），整屏不允许灰暗压抑。
- 面板圆角 ≥ 12px、卡片式、半透明毛玻璃；按钮做成阳光木牌感（暖黄渐变）。
- 危险 / 不足 / 断粮一律珊瑚色 `#ff8a5c` 系，禁止纯血红大警报。
- 图标全程序化绘制（Canvas 路径 / CSS），零外链素材。

### 1.3 HUD
- 布局红线：资源与生存条贴左上、天数贴右上、建造栏贴底部中央，
  **画面中央（浮岛与小船的舞台）永不遮挡**。
- 材料（木板/塑料/金属/绳索）图标 + 数字；数字在入账瞬间弹跳（scale pop ≤ 0.35s）。
- 淡水 / 食物是持续消耗的生存条：胶囊条 + 图标，低于 25% 柔和呼吸脉冲
  （`prefers-reduced-motion` 下静止），不闪屏不弹窗。
- 天数徽章：太阳 + 当天进度弧；换天瞬间徽章弹一下，给「又活过一天」的确认感。
- 建造快捷栏：1–5 键位角标 + 建筑图标 + 名称 + 花费；选中格抬升 + 亮边，
  造不起的格子半透明、花费染珊瑚色——玩家不用点进任何菜单就知道差什么料。

### 1.4 菜单
- 三面板（title / paused / gameover）卡片式，入场 fade+scale ≤ 300ms。
- 结算一屏读完：**存活天数**（highlight 放大）/ 建筑 / 拾荒 / 最长存活 四格 +
  新纪录徽章；死因文案分「断粮」「指挥中心被拆」两路，语气自嘲不悲情。
- Enter 在标题=出海、暂停=继续、结算=再来一局；P/Esc 暂停（input 归 opus-core）。
- 静音按钮右上角 + M 键，`aria-pressed` 状态可见。

### 1.5 手感（juice，UI 侧份额）
- 资源入账 = 数字弹跳；换天 = 徽章弹跳；选建筑 = 格子抬升。
- 悬停按钮上浮 2px、按下缩 0.97——手游按钮的「有肉感」。
- 世界侧 juice（捞取水花、建造落地弹、炮塔后座）归 opus-content/fx 与 core。

### 1.6 无障碍（accessibility-lite）
- 按钮可 Tab 聚焦，`:focus-visible` 3px 潟湖青描边；命中区 ≥ 44px。
- 面板带 `role="dialog"` + `aria-label`；帮助按钮带 `aria-expanded`。
- `prefers-reduced-motion` 下：面板无入场动画、徽章不脉冲、HUD 低量条不呼吸。

## 2. 当前构建评分（基线 = 重开脚手架 1a07e6a → 本轮交付后）

| 维度 | 得分/10 | 依据 |
| --- | --- | --- |
| 首帧体验 | 2→6 | 脚手架是静态 innerHTML 占位 → 本轮 `renderOverlay("title")`：一键出海 + Enter + 内联说明 + 最长存活钩子；差实时海面背景（opus-content）与 main 接线 |
| 视觉基调 | 2→4 | 画布仍是 session 占位纯色；CSS 端已完成阳光化（晨光背景 / 暖阳标题 / 木牌按钮），画布内基调等海面与浮岛落地后再评 |
| HUD | 0→6 | 本轮交付资源条 / 生存条 / 天数徽章 / 岛民胶囊 / 建造快捷栏全套绘制 API；未接线前不显示，接线见 §5；缺实测数据流验证 |
| 菜单 UX | 1→7 | 三面板全套 + 结算存活天数 highlight + 死因双路文案 + 静音/M + Enter 全场景 + 自动聚焦；扣分：回标题不二次确认、结算数字无滚动动画 |
| 手感 juice | 1→4 | UI 侧已备：资源 pop / 换天 pop / 选中抬升 / 低量脉冲 / 按钮微交互；世界侧（水花 / 落地弹 / 屏震）全部未开工 |
| 无障碍 | 1→6 | focus-visible / aria / ≥46px 命中区 / reduced-motion（DOM 与画布内脉冲都尊重）已备；未做整机键盘走查 |

## 3. 本轮必做（fable-sota 写集：SOTA_BAR / src/ui/** / index.css）

- [x] **P0 `src/ui/menus.ts`**：title / paused / gameover 三面板，中文；标题「疯狂水世界」+
      副标「海上末日 · 拾荒建造」；结算含存活天数（highlight）；静音按钮 + M 键；
      Enter 快捷路径；内联玩法说明；`gameoverCopy` 导出供单测。
- [x] **P0 `src/ui/hud.ts`**：`drawHud` 聚合 + `drawResourceBar` / `drawDayBadge` /
      `drawBuildBar` 三分件；资源入账弹跳、换天弹跳、低量脉冲；`resetHud` 跨局清态
      （day 回退自愈兜底）；全字段可选、分阶段接线不炸；Node 可安全 import。
- [x] **P0 `src/index.css`**：阳光浮岛基调重制——晨光背景、暖阳标题、木牌主按钮、
      珊瑚危险色、统计格 highlight、胶囊/kbd/帮助面板/静音按钮/reduced-motion 全套。
- [x] **P0 布局红线**：HUD 贴边，画面中央永不遮挡（资源左上 / 天数右上 / 建造栏底中）。

## 4. 后续轮次待办（按优先级，给下轮 fable-sota / 父调度器）

### P0（不修不算 SOTA）
1. **接线**（session/main，父调度器，见 §5）：HUD 与菜单没接线前全部不可见。
2. 建造栏点选支持（鼠标点格子 = 按数字键）：需要 input 侧把点击坐标透出，
   HUD 侧可加 `hitTestBuildBar(x, y): number | null`——下轮补。
3. 捞取反馈闭环：漂浮物入账瞬间世界侧水花（fx）+ HUD 数字 pop 同帧发生。

### P1（强烈建议）
4. 断粮倒计时可视化：食物条空后在天数徽章下淡入「断粮 N 秒」珊瑚胶囊（不闪）。
5. 风暴 / 海盗来袭预告：屏幕对应边缘柔和珊瑚雾 + 方向箭头，复用轻松基调。
6. 结算数字滚动动画；新纪录徽章入场彩带（CSS 即可）。
7. 触屏布局：建造栏格子放大为拇指目标（≥ 56px），左下虚拟摇杆区域预留。

### P2（锦上添花）
8. 天数徽章日落变奏：dayProgress01 > 0.75 时太阳换暖橙、弧变月白。
9. 岛民胶囊表情：喂饱笑脸 / 挨饿囧脸（两条路径的嘴角弧线）。
10. 标题面板背后海面视差（等 opus-content 海面落地）。

## 5. 接线交接（给父调度器；session.ts / main.ts 不在本轮写集内）

```ts
// 1) src/session.ts — draw() 末尾（世界画完后叠 HUD）：
import { drawHud } from "./ui/hud";
drawHud(ctx, {
  day: this.day,                        // 必填，其余全可选
  dayProgress01: this.dayProgress01,
  resources: { wood: 12, plastic: 8, metal: 3, rope: 5 }, // 键名对齐 constants.ResourceId
  water01: this.water / WATER_MAX,
  food01: this.food / FOOD_MAX,
  islanders: { fed: 3, total: 4 },
  build: {
    slots: [
      { key: "1", name: "地基", icon: "floor", cost: "木×2", affordable: true, selected: true },
      { key: "2", name: "收集器", icon: "collector", cost: "木×4 塑×2" },
      // …purifier / fish / turret
    ],
  },
  time: this.time,                      // 建议传 session 累计秒，动画随暂停冻结
});

// 2) src/main.ts — 场景切换处：
import { renderOverlay } from "./ui/menus";
import { resetHud } from "./ui/hud";
renderOverlay(overlay, "title", { hiDays, onStart, audio });   // audio 可省
renderOverlay(overlay, "hidden", { hiDays });                  // 进入 playing
renderOverlay(overlay, "paused", { hiDays, onResume, onTitle });
renderOverlay(overlay, "gameover", {
  hiDays, days, built, salvaged, isNew,
  endedBy: "starved" | "coreDown",     // 缺省走通用文案
  onRetry, onTitle,
});
// 开新局时：resetHud()（幂等；忘了接也有 day 回退自愈兜底）
```

导出面（供 gpt-test 写单测）：
- `menus.ts`：`MenuKind` `AudioControl` `EndReason` `MenuPayload`、
  `gameoverCopy(p): { title; tag }`、`renderOverlay(root, kind | "hidden", payload)`。
- `hud.ts`：`ResourceKind` `BuildIcon` `BuildSlot` `HudInfo` `HUD_COLORS`、
  `resetHud()`、`drawHud(ctx, info)`、`drawResourceBar(ctx, info)`、
  `drawDayBadge(ctx, info)`、`drawBuildBar(ctx, info)`。
- `gameoverCopy` 纯函数可直接断言；hud/menus 模块 import 无副作用（Node 安全）。

## 6. 验收 rubric（Round 1 结束时逐项打勾）

- [x] `npm test && npm run build && npm run smoke` 全绿（本轮提交时验证）。
- [ ] 接线后：标题 → Enter 出海 → 捞一件材料见数字 pop → 换天见徽章 pop →
      P 暂停 → Enter 继续 → 断粮死 → 结算见「存活 N 天」→ Enter 再来一局，全程无鼠标可玩。
- [ ] 再来一局第一帧无上局残留 pop（`resetHud` 或 day 回退自愈生效）。
- [ ] 建造栏：选中格抬升亮边；材料不够的格子半透明且花费为珊瑚色。
- [ ] 淡水 / 食物低于 25% 时条子柔和脉冲；`prefers-reduced-motion` 下静止。
- [ ] Tab 遍历所有按钮均有可见焦点环；按钮命中区 ≥ 44px（含静音按钮）。
- [ ] 静音按钮点击 / M 键切换后 `aria-pressed` 同步（音频模块落地后验实际静音）。
- [ ] HUD 任何元素不进画面中央舞台区（资源左上 / 天数右上 / 建造栏底中贴边）。
