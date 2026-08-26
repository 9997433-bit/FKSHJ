# SOTA 基准线 — 视觉 / UX / 手感（Round 3 更新 · fable-sota）

> 目的：定义「2026 年的水上乐园街机网页游戏」应该达到的体验底线，对照当前构建打分，
> 并列出必修项与验收 rubric。所有主题色一律经 `src/ui/theme.ts`，数值一律经 `src/data/constants.ts`。
> Round 3 更新：对照合并后的 `agent/crazy-water-world`（8601a51，六路 R2 成果已并入）重新盘点，
> 勾掉 R2 落地的 P0/P1，并记录本轮 fable-sota 的 HUD 交付与接线交接。

## 1. 2026 年街机水滑道网页游戏应有的样子

### 1.1 首帧体验（0–10 秒）
- 打开即见标题 + 动态水面预览，无白屏、无加载条（离线单文件构建）。
- 一个主按钮、一次点击（或按 Enter）进入游戏；操作说明内联展开，绝不使用 `alert()`。
- 最高分立即可见，制造"再来一把"的钩子。

### 1.2 视觉
- 60fps @1080p；粒子峰值 < 400（规格红线）。
- 伪 3D 滑道：近大远小、消失点在画布上方 18%，弯道左右摆动带出速度感。
- 水面 ≥ 2 层正弦叠加 + 泡沫带；玩家泳圈有高光、投影、入水涟漪。
- 四个主题段（热带港 / 洞穴瀑 / 火山泉 / 霓虹夜）**循环流转**且相邻段平滑插值过渡，
  天空、水色、雾色不允许硬切——包括一圈结束混回热带港的那一段。
- 所有 gameplay 色值语义化（hp / coin / gem / danger），随主题联动，禁止模块内散落 hex。

### 1.3 手感（juice）
- 每次得分都有确认感：金币音阶上行、连击计数弹跳（scale pop + 回弹）。
- 受击要"疼"：短促屏震（<120ms）、HP 心形脉冲、速度骤降的镜头拉近。
- 加速带要"爽"：速度条冲入红区、速度线 / FOV 拉伸、水花密度提升。
- 换道插值 120–180ms，带轻微倾斜（roll）预告方向。
- 失败要"有预兆"：被弯道甩向滑道边缘时，玩家必须在落水前就看见警告并有时间自救。

### 1.4 HUD / UI
- HUD 全部贴边：左上分数/距离、左中连击、右上 HP + 主题徽章、左下速度条，**永不遮挡滑道中线**。
- HUD 动画状态跨局隔离：上一局尾帧的连击弹跳 / 掉血脉冲不得串进新一局。
- 菜单为卡片式面板：入场动画（fade + scale ≤ 300ms）、统计格、控制提示胶囊（kbd 风格）。
- 结算页一屏读完：分数 / 距离 / 金币 / 历史最高 四格 + 新纪录徽章。
- 音效可一键静音（按钮 + M 键），状态可见（`aria-pressed`）。

### 1.5 无障碍（accessibility-lite）
- 全部按钮可 Tab 聚焦，`:focus-visible` 有 3px 高对比描边；命中区 ≥ 44px。
- Enter 在标题=开始、暂停=继续、结算=再来一局；Esc/P 暂停。
- `prefers-reduced-motion` 下关闭装饰动画（DOM 面板动画与画布内持续脉冲同理）。
- 面板带 `role="dialog"` 和 `aria-label`；帮助按钮带 `aria-expanded`。

### 1.6 音频
- 程序化合成（Web Audio），零外部文件；首次交互解锁。
- 金币 / 宝石 / 加速 / 受击 / 跳跃五类 SFX 音色可区分；连击升高时金币音调上行。
- 轻量 BGM 垫底，与静音开关同门控。

## 2. 当前构建评分（基线 = Round 2 合并 8601a51 + 本轮）

| 维度 | 得分/10 | 依据 |
| --- | --- | --- |
| 首帧体验 | 8 | 标题一击 / Enter 进入、内联帮助、最高分可见；标题背后即是实时水面（loop 始终画 session） |
| 滑道视觉 | 7→8 | R2 合并修掉了 R1 遗留的泡沫切墙：`drawFoam` 现经 `project` 投影并夹在 `FOAM_HALF` 水槽内，跟着滑道弯曲、近大远小 |
| 主题系统 | 7→8 | R2 `themeIndex` 取模循环 + `themeCycleAt` 跨圈混色落地，跑多远都不再卡霓虹；遗留：`themeAt`（钳制）双路径仍在，新绘制必须走 cycle（见 §4） |
| 手感 juice | 5→6 | R2 补上失败预兆链路（弯道甩出 → 擦边计时 → `fallen` 落水）与换道中点翻面判定；本轮把预兆接到 HUD 可视化；仍缺 hitstop（`FEEL.hitstopS` 无消费方）、加速速度线 |
| HUD | 8→9 | 连击 pop、速度条、主题徽章、心形 HP、语义 panel 色；本轮加 `offChute01` 甩出预警（边缘雾 + 胶囊 + 计时条）与跨局动画状态重置（`resetHud` + 距离回退自愈） |
| 菜单 UX | 8 | 卡片面板 + 统计格 + 控制胶囊 + Enter 快捷键 + 静音按钮；R2 起 main.ts 三处 renderOverlay 已传 `audio`，接线闭环 |
| 无障碍 | 7 | focus-visible、≥46px 命中区、aria、reduced-motion；本轮画布内甩出预警的呼吸脉冲也尊重 `prefers-reduced-motion` |
| 音频 | 6→7 | 五类 SFX + 金币连拾音阶上行 + R2 程序化 BGM 落地，静音一键全静；缺 BGM 随主题段变奏 |
| 性能 | 7 | 粒子上限守住；流式生成已测到 10 万距离仍便宜，但实体数组只增不删（R3 可扫尾回收）；真实 1080p 填充率仍未测 |

## 3. 已落地盘点

### Round 1（合并审计）
- `theme.ts` 插值过渡 + 语义色 + 段长读 constants：已合并生效。
- `menus.ts` 内联帮助 / 统计格 / Enter 全场景 / 自动聚焦：已合并生效。
- `hud.ts` 连击 pop / 速度条 / 主题徽章 / 心形 HP：已合并生效。
- `session.ts` 去硬编码色值：已完成，`rg "#[0-9a-fA-F]{6}" src/session.ts` 零命中。
- 受击屏震（physics → `kickCamera`）、金币连击音调上行（`coinStep`）：已落地。

### Round 2（合并审计，对照 ROUND2_BRIEF）
- **关卡流式生成**：双 LCG 游标续生，分块与一次生成一致；长局探针 `worldEmptyAhead: false`。
- **主题循环**：`themeIndex` 取模 + `themeCycleAt` 跨圈混色，圈与圈之间也是渐变。
- **失败链路**：弯道甩出滑道（`slip`/`offChute`）、擦边计时（`fallT`）、落水 `fallen`；
  玩家侧暴露 `offChute01`（0..1 落水计时进度）给任何想预警的模块。
- **泡沫透视对齐**（R1 简报缺陷 6 / 原 P0-3）：`drawFoam` 改经 `project`，浪线不再横贯切墙。
- **泳圈质感**：`drawPlayerRing` 高光 / 投影 / 涟漪 / 换道 roll，session 已接线。
- **音频**：程序化 BGM + 静音拆桥；main.ts 三处 renderOverlay 传 `audio`（原 P1-11 接线完成）。
- **数值收拢**：`CAMERA`/`FEEL` 建组，session 已接入；camera/physics/player 仍留内联副本（见 §4）。
- **循环加固**：先预约再 tick，tick 抛错不再卡死 rAF；dispose 后 start 拒绝。

### Round 3（本轮 fable-sota 交付）
- **`src/ui/hud.ts` 跨局重置**（ROUND2_BRIEF 风险 4）：模块级动画状态（连击弹跳 / 掉血脉冲时间戳）
  新增两道防线——导出 `resetHud()` 供开局显式调用；`drawHud` 同时监测 `distance` 回退
  （一局内单调递增，回退必是新局）自动清一次。两者幂等，未接线也不再串场。
- **`src/ui/hud.ts` 甩出预警**：`HudInfo.offChute01?`（读 `Player.offChute01`）驱动两级预警——
  轻度只在屏幕两侧染 danger 渐变雾（静止、无闪烁），计时过 0.12 后顶部中央淡入警示胶囊
  （警示三角 + 「即将甩出滑道！」+ 落水计时条）。胶囊贴上缘、雾只染边缘，不进画布中线
  ±120px 带、不遮滑道；呼吸脉冲在 `prefers-reduced-motion` 下关闭（matchMedia 有 node 守卫）。
- 接线需求（session/main 各一行，不在本轮写集内）：见 §6。

## 4. 必修清单（Round 3 剩余，按优先级）

### P0（不修不算 SOTA）
1. ~~`session.ts` 去硬编码色值~~ ✅ R1 完成。
2. ~~玩家泳圈质感（高光 / 投影 / 涟漪）~~ ✅ R2 `src/ui/tube.ts` 完成并接线。
3. ~~水面 / 泡沫与滑道透视对齐~~ ✅ R2 完成（`drawFoam` 经 `project` 投影 + `FOAM_HALF` 夹紧）。
4. **受击 hitstop 40–60ms**：`FEEL.hitstopS`（0.05s）仍无消费方；入口在 `session.update` 的
   `hurt()` 分支或 loop 层。屏震已有，缺命中短停。
5. ~~流式关卡 + 主题循环~~ ✅ R2 完成（`themeIndex` 取模 + `themeCycleAt`；长局探针不再空）。
6. **HUD 预警 / 重置接线**（父调度器，2 行）：本轮 UI 侧已就绪，见 §6。未接线时预警不显示
   （`offChute01` 缺省 0）、重置靠距离回退自愈，均不会出错，但预警是失败预兆链路的最后一环。
7. **camera/physics/player 改读 `CAMERA`/`FEEL` 并删内联副本**（ROUND2_BRIEF 风险 2）：
   双份真相是数值漂移的温床；迁移数值一致、行为无损。

### P1（强烈建议）
8. 加速带速度线 / 边缘径向模糊感（`fx/particles.ts` 已有 `spark` 线型粒子可复用，别上真模糊）。
9. 金币收集飞向分数面板的吸附拖尾；水环穿越全屏一帧闪光（约 8% 白色叠加）。
10. ~~连击音调上行~~ ✅ R1（`coinStep`）。
11. ~~换道泳圈 roll 倾斜~~ ✅ R2（`ringRoll`）。
12. ~~轻量 BGM 层~~ ✅ R2（程序化 BGM，与静音同门控）。
13. ~~静音接线~~ ✅ R2（main.ts 三处 renderOverlay 已传 `audio`）。
14. 远离玩家的实体扫尾回收（ROUND2_BRIEF 风险 5）：数组只增不删，10 万距离仍便宜但不该裸奔。
15. `themeAt`（钳制）与 `themeCycleAt`（循环）双路径对齐或文档标明前者废弃
    （ROUND2_BRIEF 风险 1）：新绘制一律走 cycle。
16. 刷新 BENCH.md 快照（长局不再空）；真实浏览器画布 60fps / GPU 填充率实测。

### P2（锦上添花）
17. 触屏虚拟提示：首次触屏 3 秒内显示左右半屏点按区域示意。
18. 结算数字滚动动画（CSS 或 rAF 计数）。
19. 主题徽章在段切换瞬间闪一次 accent 光。
20. BGM 随主题段变奏（换和弦垫即可）。

## 5. 验收 rubric（Round 3 结束时逐项打勾）

- [x] `npm install && npm test && npm run build` 全绿（本轮提交时验证）。
- [ ] 一局跑满 2000m：天空 / 水色在 410–500、910–1000、1410–1500 区间可见渐变，无任何硬切帧；
      跑满一圈（2000）后混回热带港同样无硬切。
- [x] `rg "#[0-9a-fA-F]{6}" src/session.ts src/world src/entities` 无 gameplay 硬编码色
      （HUD/theme 定义处除外；world 剩天空 / 剪影装饰色，属主题定义延伸）。
- [ ] 受击瞬间可感知屏震 + 心形脉冲 + hitstop；帧率仍 ≥ 55fps。
- [ ] 标题 → Enter 开始 → P 暂停 → Enter 继续 → 撞死 → Enter 再来一局，全程无鼠标可玩。
- [ ] 再来一局的第一帧：无上一局残留的连击弹跳 / 掉血脉冲 / 甩出预警（跨局重置生效）。
- [ ] 贴墙滑过弯道：两侧先见 danger 雾，计时过约 1/8 后见「即将甩出滑道！」胶囊与计时条；
      回到水道后预警随 `fallT` 回落淡出；预警全程不进画布中线 ±120px 带。
- [ ] Tab 遍历所有按钮均有可见焦点环；按钮命中区 ≥ 44px（含静音按钮）。
- [ ] `prefers-reduced-motion: reduce` 下无面板动画、无徽章脉冲、甩出胶囊无呼吸脉冲。
- [ ] 泳圈：贴水可见涟漪扩散，跳起涟漪淡出、影子变小，换道有倾斜，无敌泛 accent 呼吸光。
- [ ] 静音按钮点击 / M 键切换后，金币音效与 BGM 立即无声；`aria-pressed` 同步。

## 6. 接线交接（给父调度器）

本轮 HUD 侧已就绪，差两行接线（`src/session.ts` / `src/main.ts` 不在本轮写集内）：

```ts
// 1) src/session.ts — draw() 末尾的 drawHud 调用加一个字段：
drawHud(ctx, {
  score: this.score,
  distance: this.distance,
  combo: this.combo,
  hp: this.player.hp,
  theme,
  speed: this.player.motion.speed,
  offChute01: this.player.offChute01, // ← 甩出预警数据源
});

// 2) src/main.ts — startRun() 里显式重置（可选但推荐；未接时距离回退自愈兜底）：
import { resetHud } from "./ui/hud";
function startRun(): void {
  sfx.unlock();
  resetHud(); // ← 新局清空 HUD 动画状态
  session = new Session(sfx);
  // ...
}
```

`Player.offChute01` 已存在（entities/player.ts，0..1 落水计时进度），无需改玩家模块。
`resetHud()` 幂等；即使父级忘记接线，`drawHud` 检测到 `distance` 回退也会自动清一次，
不会出现跨局串场——接线的价值是把重置时机提前到「新局第一帧之前」，语义更明确。
