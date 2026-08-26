# SOTA 基准线 — 视觉 / UX / 手感（Round 2 更新 · fable-sota）

> 目的：定义「2026 年的水上乐园街机网页游戏」应该达到的体验底线，对照当前构建打分，
> 并列出必修项与验收 rubric。所有主题色一律经 `src/ui/theme.ts`，数值一律经 `src/data/constants.ts`。
> Round 2 更新：对照合并后的 `agent/crazy-water-world`（c571d02）重新盘点 Round 1 实际落地，
> 勾掉已完成的 P0，并记录本轮 fable-sota 的交付与接线交接。

## 1. 2026 年街机水滑道网页游戏应有的样子

### 1.1 首帧体验（0–10 秒）
- 打开即见标题 + 动态水面预览，无白屏、无加载条（离线单文件构建）。
- 一个主按钮、一次点击（或按 Enter）进入游戏；操作说明内联展开，绝不使用 `alert()`。
- 最高分立即可见，制造"再来一把"的钩子。

### 1.2 视觉
- 60fps @1080p；粒子峰值 < 400（规格红线）。
- 伪 3D 滑道：近大远小、消失点在画布上方 18%，弯道左右摆动带出速度感。
- 水面 ≥ 2 层正弦叠加 + 泡沫带；玩家泳圈有高光、投影、入水涟漪。
- 四个主题段（热带港 / 洞穴瀑 / 火山泉 / 霓虹夜）之间**平滑插值过渡**，天空、水色、雾色不允许硬切。
- 所有 gameplay 色值语义化（hp / coin / gem / danger），随主题联动，禁止模块内散落 hex。

### 1.3 手感（juice）
- 每次得分都有确认感：金币音阶上行、连击计数弹跳（scale pop + 回弹）。
- 受击要"疼"：短促屏震（<120ms）、HP 心形脉冲、速度骤降的镜头拉近。
- 加速带要"爽"：速度条冲入红区、速度线 / FOV 拉伸、水花密度提升。
- 换道插值 120–180ms，带轻微倾斜（roll）预告方向。

### 1.4 HUD / UI
- HUD 全部贴边：左上分数/距离、左中连击、右上 HP + 主题徽章、左下速度条，**永不遮挡滑道中线**。
- 菜单为卡片式面板：入场动画（fade + scale ≤ 300ms）、统计格、控制提示胶囊（kbd 风格）。
- 结算页一屏读完：分数 / 距离 / 金币 / 历史最高 四格 + 新纪录徽章。
- 音效可一键静音（按钮 + M 键），状态可见（`aria-pressed`）。

### 1.5 无障碍（accessibility-lite）
- 全部按钮可 Tab 聚焦，`:focus-visible` 有 3px 高对比描边；命中区 ≥ 44px。
- Enter 在标题=开始、暂停=继续、结算=再来一局；Esc/P 暂停。
- `prefers-reduced-motion` 下关闭装饰动画。
- 面板带 `role="dialog"` 和 `aria-label`；帮助按钮带 `aria-expanded`。

### 1.6 音频
- 程序化合成（Web Audio），零外部文件；首次交互解锁。
- 金币 / 宝石 / 加速 / 受击 / 跳跃五类 SFX 音色可区分；连击升高时金币音调上行。

## 2. 当前构建评分（基线 = Round 1 合并 c571d02 + 本轮）

| 维度 | 得分/10 | 依据 |
| --- | --- | --- |
| 首帧体验 | 8 | 标题一击 / Enter 进入、内联帮助、最高分可见；标题背后即是实时水面（loop 始终画 session） |
| 滑道视觉 | 5→7 | R1 合并补了滑道网格 / 镜头弯曲 / 剪影天空；本轮泳圈补齐高光 / 投影 / 涟漪 / 换道倾斜；遗留：泡沫带全宽切墙（opus-content 本轮修） |
| 主题系统 | 7 | 插值过渡 + 语义色 + panel 底色联动；遗留：主题停在霓虹不循环（等流式关卡，见 §4 协作注意） |
| 手感 juice | 5 | 屏震已接全（applyHit 0.9 / 刮墙 0.35 / 加速 0.22 → kickCamera）；缺 hitstop、加速速度线 |
| HUD | 8 | 连击 pop、速度条、主题徽章、心形 HP；本轮面板底色改 `theme.panel` 语义色随主题染色 |
| 菜单 UX | 8 | 卡片面板 + 统计格 + 控制胶囊 + Enter 快捷键；本轮加静音按钮（M 键联动，待 main.ts 接线） |
| 无障碍 | 7 | focus-visible、≥46px 命中区、aria、reduced-motion；静音按钮带 `aria-pressed` |
| 音频 | 6 | 五类 SFX + 金币连拾音阶上行（`coinStep`）已落地；缺 BGM；静音 UI 就绪待接线 |
| 性能 | 7 | 粒子上限守住；泳圈绘制每帧约 3 个渐变 + 3 圈涟漪描边，可忽略；未测真实 1080p 填充率 |

## 3. 已落地盘点

### Round 1（合并后审计，与当初自报对照）
- `theme.ts` 插值过渡 + 语义色 + 段长读 constants：**已合并生效**。
- `menus.ts` 内联帮助 / 统计格 / Enter 全场景 / 自动聚焦：**已合并生效**。
- `hud.ts` 连击 pop / 速度条 / 主题徽章 / 心形 HP：**已合并生效**。
- 原 P0「session.ts 去硬编码色值」：**Round 1 合并时已完成** —— session 现全部走
  `theme.coin / gem / ink / hp / accent / danger / foam`，`rg "#[0-9a-fA-F]{6}" src/session.ts` 为零命中。
- 受击屏震：**已由 opus-core 落地**（physics 的 applyHit/applyWallScrape/applyBoost → `kickCamera`）。
- 金币连击音调上行：**已由 opus-content 落地**（audio.ts `coinStep` 半音上行，断连 0.9s 重置）。
- 水面正弦波：drawFoam 已是两层正弦叠加，但整条浪线横穿滑道墙（Round 1 简报缺陷 6），
  透视对齐归 opus-content 本轮修，**不在本模块动**。

### Round 2（本轮 fable-sota 交付）
- **`src/ui/tube.ts`（新增）**：`drawPlayerRing(ctx, opts)` —— 泳圈完整造型：
  顶部受光 / 底部吸水色渐变、内圈水洞（waterDeep→water）、8 道充气焊缝、左上镜面新月高光 + 亮点、
  软边接触投影（跳起变小变淡）、三圈错相入水涟漪（速度越快节奏越急、离水淡出）、
  贴水浮沉、无敌 accent 呼吸混色 + 光环；`ringRoll(player)` 由换道进度算 -1..1 倾斜（≈10° 上限）。
- **`src/session.ts`（最小接线）**：+1 行 import；玩家 drawable 内联椭圆换成一次
  `drawPlayerRing` 调用（translate 锚点改为水面点，抬升交给 tube 内部处理）。其余逐字未动。
  这同时消灭了 session 里最后一个裸色值 `rgba(0,0,0,0.25)`。
- **`src/ui/theme.ts`**：新增语义色 `panel`（半透明面板底色，四主题各配色，mixThemes 同步插值）。
- **`src/ui/hud.ts`**：面板底色由硬编码 `rgba(4,20,28,0.45)` 改为 `theme.panel`，HUD 零裸色值。
- **`src/ui/menus.ts`**：`MenuPayload.audio?: { muted, onToggle }` —— 提供后三个面板右上角
  出现静音按钮（`aria-pressed` 状态、悬停 / 焦点样式），面板打开期间 M 键同步切换。
- **`src/index.css`**：`.mute` 按钮样式（46px 命中区、绝对定位面板右上、按下态染 --sun）。

## 4. 必修清单（Round 2 剩余，按优先级）

### P0（不修不算 SOTA）
1. ~~`src/session.ts` 去硬编码色值~~ ✅ Round 1 合并完成（本轮顺手清掉最后的投影裸色）。
2. ~~玩家泳圈质感（高光 / 投影 / 涟漪）~~ ✅ 本轮 `src/ui/tube.ts` 完成并已接线。
3. **水面 / 泡沫与滑道透视对齐**（`world/water.ts`，opus-content 认领）：两层正弦已有，
   但全宽浪线切过滑道墙，读起来像海挡在滑道前 —— 需要贴滑道透视或裁剪到滑道内。
4. **受击 hitstop 40–60ms**：屏震已有，缺命中短停；入口在 `session.ts` `hurt()` 分支或 loop 层。
5. **流式关卡 + 主题循环**（levels/opus 侧）：世界 ~7200 单位后变空、主题停在霓虹。
   ⚠️ 协作注意：`themeAt`（theme.ts）与 `themeIndex`（levels.ts）目前都**钳制在最后一段**，
   两处必须同一 PR 内一起改成取模循环并更新 `theme.test.ts`（循环后段尾 90 单位应向下一循环
   的热带港过渡），单改一处会造成视觉与生成错位。本轮未动，留给做流式生成的人。

### P1（强烈建议）
6. 加速带速度线 / 边缘径向模糊感（`fx/particles.ts` 加线型粒子即可，别上真模糊）。
7. 金币收集飞向分数面板的吸附拖尾；水环穿越全屏一帧闪光（约 8% 白色叠加）。
8. ~~连击音调上行~~ ✅ opus-content 已落地（coinStep）。
9. ~~换道泳圈 roll 倾斜~~ ✅ 本轮 `ringRoll` 完成。
10. 轻量 BGM 层（Web Audio 琶音垫底即可），与静音开关同门控。
11. 静音接线（父调度器，见 §6）：main.ts 三处 renderOverlay 传 `audio`。

### P2（锦上添花）
12. 触屏虚拟提示：首次触屏 3 秒内显示左右半屏点按区域示意。
13. 结算数字滚动动画（CSS 或 rAF 计数）。
14. 主题徽章在段切换瞬间闪一次 accent 光。

## 5. 验收 rubric（Round 2 结束时逐项打勾）

- [x] `npm install && npm test && npm run build` 全绿（本轮提交时验证）。
- [ ] 一局跑满 2000m：天空 / 水色在 410–500、910–1000、1410–1500 区间可见渐变，无任何硬切帧。
- [x] `rg "#[0-9a-fA-F]{6}" src/session.ts src/world src/entities` 无 gameplay 硬编码色
      （HUD/theme 定义处除外；session 本轮起零命中，world 剩天空 / 剪影装饰色，属主题定义延伸）。
- [ ] 受击瞬间可感知屏震 + 心形脉冲 + hitstop；帧率仍 ≥ 55fps。
- [ ] 标题 → Enter 开始 → P 暂停 → Enter 继续 → 撞死 → Enter 再来一局，全程无鼠标可玩。
- [ ] Tab 遍历所有按钮均有可见焦点环；按钮命中区 ≥ 44px（含静音按钮）。
- [ ] HUD 元素与画布水平中线 ±120px 区域零重叠（连击 pop 除外时也不得进入该区）。
- [ ] `prefers-reduced-motion: reduce` 下无面板动画、无徽章脉冲。
- [ ] 泳圈：贴水可见涟漪扩散，跳起涟漪淡出、影子变小，换道有倾斜，无敌泛 accent 呼吸光。
- [ ] 静音按钮点击 / M 键切换后，金币音效立即无声；`aria-pressed` 同步。

## 6. 接线交接（给父调度器）

静音开关 UI 与键位已就绪，只差 main.ts（不在本轮写集内）三处 `renderOverlay` 传入：

```ts
const audio = { muted: sfx.isMuted(), onToggle: () => sfx.toggleMute() };
// showTitle / pause / finish 的 payload 里各加一行：
renderOverlay(overlay, "title", { hiScore: Session.hiScore(), onStart: startRun, audio });
```

`Sfx.isMuted / toggleMute / setMuted` 均已存在（fx/audio.ts），无需改音频模块。
若还想在滑行中按 M 静音，需在 `game/input.ts` 加一个 consume 键位，属加分项非必须。

`drawPlayerRing` 本轮已在 session.ts 完成最小接线（+1 import、玩家 drawable 换一次调用），
无需父级再动；若与其他分支冲突，以 `src/ui/tube.ts` 文件头的调用示例为准重接即可。
