# SOTA 基准线 — 视觉 / HUD / 菜单 / 手感（Round 3 · fable-sota · 海上末日重开）

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

## 2.5 Round 2 增量（fable-sota，对照手游浮岛基建的轻松感）

Round 1 结束后 session 已接线 HUD/菜单主链路；本轮补的是「危险也不吓人」的
预警层——手游基建里风暴/饥荒从来不是 jump scare，是提前几秒的柔和布告。

**本轮加了什么（全部走可选字段，session 未传时零变化、零崩溃）：**

- `HudInfo` 新增三个可选字段：`storm01?`（风暴预警 0..1）、`starve01?`
  （断供宽限消耗 0..1）、`hintDanger?`（一句危险短提示）。
- **风暴预警层** `drawAlerts`（drawHud 内最先画，辉光垫在面板下）：
  - 顶缘珊瑚辉光：呼吸脉冲 + 偶发「闪电感」短促提亮（双频正弦相乘做随机感，
    零 RNG 可复现）；`prefers-reduced-motion` 下恒定不闪。
  - 顶部中央预警条胶囊：闪电图标 + 分段轻松文案（「远处乌云在集合」→
    「风暴在攒劲儿，扶稳」）+ storm01 进度条；随 storm01 缓入。
  - 全部贴顶缘（y ≤ 92 < 浮岛网格上沿 96），中央舞台零遮挡。
- **岛民饿态**：`fed < total` 或 `starve01 > 0.4` 时小人珊瑚色 + 柔和呼吸，
  胶囊下淡入「肚子咕咕叫，快补点水粮」（覆盖断水/断粮两路，语气松弛）；
  `starve01 > 0` 时胶囊底部一条珊瑚「宽限余量」细条（1−starve01，静态不闪）。
- **危险短提示胶囊**：`hintDanger` 顶部中央珊瑚点 + 文案（风暴条下方顺排），
  宽度按文本估算（不依赖 measureText，stub ctx 单测安全）。
- **建造栏空选中引导**：slots 全未 selected 时提示行换成潟湖青
  「先按 1–5 挑个建筑 · 点海面放置」并轻呼吸；选中后回到调用方 hint。
  花费不够的半透明 + 珊瑚花费保持 Round 1 原样。

**还缺什么（给下轮 / 父调度器）：**

- session 侧接线（见 §5 更新版）：`stormWarnRatio` 已传海面但没传 HUD；
  `starve01` 直接用 `economy.starve / STARVE.limitS`（现成状态，不用改 sim）。
- 海盗方向预告没做：`hintDanger` 只有文案位，屏幕对应边缘的方向雾/箭头
  还缺（P1 §4-5 仍欠）。
- 建造栏鼠标点选（hitTestBuildBar）仍欠；触屏拇指目标未放大。
- 结算数字滚动、新纪录彩带、岛民表情（P2）未动。

## 2.6 Round 3 增量（fable-sota，小步打磨——预警层已接线，不重写）

session 已把 storm01 / starve01 / hintDanger 全部接上（src/session.ts draw()
末尾），本轮只磨真实别扭处 + 留一个下轮接线位。

**预警层打磨（hud.ts，全部 surgical）：**

- 危险短提示胶囊不再整体抖 alpha：出现瞬间 0.25s 淡入（文案变化会重新淡入），
  之后胶囊本体恒定、只有珊瑚点轻呼吸——布告不该闪。reduced-motion 下全静止。
- `drawAlerts` 补上与其他三分件一致的 `syncHudState` 调用：单独调用
  （分阶段接线 / stub ctx 单测）时淡入状态同样正确。
- **新可选字段 `placeHint?: string`**（session 下一轮才传；不传不画、逐帧行为
  与 Round 2 一致）：放置被拒短句，文案直接用 sim/rules 现成的
  `placeHint(reason)`（「得贴着木筏放」「材料不够」…）。画在建造栏上方提示行，
  珊瑚色 + 出现瞬间轻弹（复用资源 pop 曲线）。提示行三级优先：
  placeHint > 空选中「先按 1–5」引导 > 调用方 hint。新状态已进 resetHud。
- 弃权说明：风暴条 / 辉光 / 饿态本轮实测代码路径无别扭，未动——避免重写。

**菜单 / CSS（只修真实别扭处，共三处）：**

- **结算 350ms 落定期**（menus.ts）：死亡瞬间玩家往往还按着空格捞取或连点海面，
  面板一出焦点就落在「再来一局」上，原生 Space/Enter/点击会在看清结算前误触重开。
  gameover 的再来一局 / 回标题 / Enter 在落定期内不响应；
  标题、暂停面板不受影响（Enter 秒响应是刻意保留的）。
- kbd 键帽文字居中（index.css）：帮助面板整体左对齐，键帽里的「W」原来贴左边框。
- 面板细滚动条（index.css）：帮助展开 + 矮屏时原生粗滚动条压 22px 圆角，
  换 `scrollbar-width: thin` + 透明轨道。

**仍缺什么（给下轮 / 父调度器）：**

- **浏览器实机手感未走查**：三轮验证全是 tsc / node:test / vite build / 无头
  probe，没有一次真浏览器 devserver 键鼠走查。预警层实际观感（辉光强度、
  胶囊节奏）、held-space 防误触、Enter 全链路需要实机确认，最好留一份录屏。
- **Pages 还是旧滑道**：`.github/workflows/pages.yml` 只在 push main 时部署，
  本分支（agent/crazy-sea-world）未合并前线上永远是旧构建。要么合并进 main，
  要么给 workflow 加分支输入再手动 dispatch（workflow 文件不在本席位写集内）。
- placeHint 接线：session 侧一行状态 + 一行传参，见 §5 更新版。
- 继承 Round 2 未动清单：海盗方向预告（屏幕边缘方向雾/箭头）、建造栏鼠标点选
  `hitTestBuildBar`、结算数字滚动 / 新纪录彩带、岛民表情。

## 2.7 Round 4 增量（fable-sota · 新波次 R1：物品 / 轻剧情 / 岛民请求 UI 契约）

对照浮岛基建手游：这类游戏的「剧情」从来不是过场动画，是角落里一张会说话的
小卡片——NPC 眨个眼提个需求、捞到东西「叮」一下、广播里飘一句闲话。本轮把
这三张小卡片的 UI 契约立起来（全部可选字段，session 未传时**逐像素一致**）。

**本轮加了什么（hud.ts；menus API 未动一字）：**

- `HudInfo` 新增三个全可选字段 + 新导出 `drawStoryLayer(ctx, info)`
  （drawHud 内最后画、叠在各面板之上；也可单独调用，stub ctx 安全）：
  - `lootToast?: { name; qty }` — 拾取轻提示：左上生存条正下方小胶囊
    （暖阳四角星 + 名称 + ×数量），出现瞬间弹跳（资源 pop 同曲线）+ 0.2s
    淡入。name×qty 组合变化即重新弹跳——同名连续拾取把 qty 累计上去就有
    「+1 +2 +3」的连击感。
  - `quest?: { name; progress }` — 岛民请求胶囊：右上岛民胶囊下方
    （潟湖青小旗 + 任务名 + 进度行）。新任务整胶囊淡入；progress 变化瞬间
    进度行轻弹——手游任务栏「有进展」的确认感。
  - `storyBeat?: { title; body }` — 日记/广播卡：左下角压底（电波图标 +
    暖阳标题 + 正文自动换行 ≤3 行），节拍变化时淡入上浮 0.35s。末世但不丧
    的文案主阵地：广播里聊天气、老周惦记他的钓竿。
- 布局红线复核：三块全部贴边（左列 y 154–184 / 右列 y 124–170 / 左下角
  卡宽 288 < 建造栏左缘 325），中央舞台零遮挡；与既有资源条 / 天数徽章 /
  预警层 / 建造栏互不重叠（含岛民饿态提示行 ~y116 之下 8px 起）。
- 超长文案安全：新增 `wrapText` 逐字换行 + 省略号（单行截断 = maxLines 1），
  与 estTextWidth 同源、不依赖 measureText——任务名 / 物品名 / 正文再长
  也不会撑出胶囊或碰到舞台。
- 三块的入场时间戳全进 `resetHud` 与 day 回退自愈；`prefers-reduced-motion`
  下瞬现、无弹跳无上浮。现有资源条 / 生存条 / 预警层未动一行。

**还缺什么（给下轮 / 父调度器）：**

- **数据源全欠**：sim 目前没有任务/剧情系统。lootToast 最快落地——session
  在捞取入账处存 `{ name, qty, at }` 传 2 秒即可（见 §5）；storyBeat 可先做
  session 侧硬编码节拍表（按天数/事件触发）；quest 等 sim 长出请求状态。
- 任务完成瞬间没有专门庆祝动画：约定是把 progress 换成「完成！」传 1–2 秒
  （进度行会弹一下），但没有勾勾图标 / 小彩带——差手游「叮 + 领奖」半步。
- 日记卡无队列：同一时刻只显示一拍，连发节拍会互相顶掉重新淡入；
  拾取提示单条不堆叠，连续捞多种材料只显示最新一条。节奏由 session 控。
- 岛民请求胶囊里只有小旗没有头像/表情，与 P2「岛民表情」一起做。

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
  // ---- Round 2 新增（全可选，不传 = 不画，行为与 Round 1 一致）----
  storm01: stormWarnRatio(this.threats),       // 已传海面的同一个值，直接复用
  starve01: this.economy.starve / STARVE.limitS, // economy 现成状态（import { STARVE } from "./sim/economy"）
                                               // 或存 updateEconomy 返回的 tick.starveRatio
  hintDanger: this.threats.pirates.length > 0 ? "海盗盯上木筏了" : undefined,
  // ---- Round 3 新增（可选；不传不画）----
  // tryPlaceAt 的拒绝分支先存：this.denied = { text: placeHint(check.reason), at: this.time };
  placeHint: this.denied && this.time - this.denied.at < 2.5 ? this.denied.text : undefined,
  // ---- Round 4 新增（可选；不传不画，逐像素与 Round 3 一致）----
  // 拾取提示：捞取入账处存 this.loot = { name: "木板", qty: 1, at: this.time }；
  // 同名 2 秒内再捞就 qty++ 并刷新 at——名×量变化会重新弹跳，自带连击感。
  lootToast:
    this.loot && this.time - this.loot.at < 2
      ? { name: this.loot.name, qty: this.loot.qty }
      : undefined,
  // 岛民请求：等 sim 长出请求状态后折算成两句短文案（超长会自动省略号）。
  quest: this.quest
    ? { name: "老周想要木板", progress: "木板 3/5" } // 完成后把 progress 换成「完成！」传 1–2 秒再撤
    : undefined,
  // 轻剧情：session 存节拍表（按天数/事件触发），到点传 6–10 秒；
  // title+body 变化即重新淡入上浮，别逐帧换字符串。
  storyBeat:
    this.beat && this.time - this.beat.at < 8
      ? { title: "无线电 · 第 3 天", body: "北边渔场的老赵说，最近漂来的木箱成色不错，手快有手慢无。" }
      : undefined,
});
// HUD 的饿态阈值 >0.4 与 economy 的 STARVE.warnAt = 0.4 对齐，无需换算。
// placeHint 的文案用 sim/rules 现成的 placeHint(reason)，撤掉时机由 session 掌握
//（建议拒绝后显示 2–3 秒；HUD 只负责画 + 出现瞬间轻弹）。

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
  `drawDayBadge(ctx, info)`、`drawBuildBar(ctx, info)`、
  `drawAlerts(ctx, info)`（Round 2：storm01 / hintDanger 预警层；
  Round 3：`HudInfo.placeHint?` 放置被拒短句，画在建造栏提示行）、
  `drawStoryLayer(ctx, info)`（Round 4：`storyBeat?` / `quest?` / `lootToast?`
  剧情层三件，三字段都缺省时不触碰 ctx）。
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
