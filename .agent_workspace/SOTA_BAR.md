# SOTA 基准线 — 视觉 / UX / 手感（Round 1 · fable-sota）

> 目的：定义「2026 年的水上乐园街机网页游戏」应该达到的体验底线，对照当前构建打分，
> 并给 Round 2 列出必修项与验收 rubric。所有主题色一律经 `src/ui/theme.ts`，数值一律经 `src/data/constants.ts`。

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

### 1.5 无障碍（accessibility-lite）
- 全部按钮可 Tab 聚焦，`:focus-visible` 有 3px 高对比描边；命中区 ≥ 44px。
- Enter 在标题=开始、暂停=继续、结算=再来一局；Esc/P 暂停。
- `prefers-reduced-motion` 下关闭装饰动画。
- 面板带 `role="dialog"` 和 `aria-label`；帮助按钮带 `aria-expanded`。

### 1.6 音频
- 程序化合成（Web Audio），零外部文件；首次交互解锁。
- 金币 / 宝石 / 加速 / 受击 / 跳跃五类 SFX 音色可区分；连击升高时金币音调上行。

## 2. 当前构建评分（基线 = commit 7e34cc2 播放版）

| 维度 | 得分/10 | 依据 |
| --- | --- | --- |
| 首帧体验 | 6 | 标题一击进入 OK；但帮助用 `alert()`（本轮已修），无 Enter 快捷键（本轮已修） |
| 滑道视觉 | 5 | 透视 + 摆动已有；水面只有泡沫线，缺双层正弦波；泳圈是两个平面椭圆，无高光/涟漪 |
| 主题系统 | 4→7 | 原 `themeAt` 段间硬切、`500` 魔法数、无语义色；本轮加入插值过渡 + hp/coin/gem/danger/ink 语义色、段长读 constants |
| 手感 juice | 3 | 无屏震、无 hitstop、无速度线；连击只是静态文本（本轮 HUD 弹跳已补一半） |
| HUD | 4→7 | 原来纯文本 + 圆点 HP；本轮补连击 pop、速度条（带基础速度刻度）、主题徽章、心形 HP 低血脉冲 |
| 菜单 UX | 4→8 | 本轮补内联帮助、控制胶囊、统计格、新纪录徽章、入场动画、Enter 快捷键 |
| 无障碍 | 2→7 | 本轮补 focus-visible、≥46px 命中区、aria、reduced-motion |
| 音频 | 5 | 五类 SFX 已有；缺连击音调上行与 BGM 层次 |
| 性能 | 7 | 粒子上限 360 已守住；未见明显逐帧分配热点（theme 插值仅在 90/500 过渡带内产生新对象） |

## 3. 本轮（Round 1）已落地

- `src/ui/theme.ts`：`lerpColor` / `mixThemes` / `themeAt(distance, blend)` 段边界 90 单位平滑过渡（smoothstep）；新增语义色 `ink / hp / coin / gem / danger`；段长与主题顺序改读 `data/constants`，消灭 `500` 魔法数。
- `src/ui/menus.ts`：标题副标题 + 控制胶囊 + 内联帮助面板（无 `alert()`）；暂停 / 结算重排为统计格 + 按钮行；Enter 键全场景接管（标题开始 / 暂停继续 / 结算重开），焦点在按钮上时让原生激活避免双触发；主按钮自动聚焦。
- `src/ui/hud.ts`：连击 pop（增量瞬间 1.45× 回弹）、速度条（accent→coin 渐变，超速转 danger，基础速度刻度线）、主题徽章（accent 圆点 + 名称）、心形 HP（低血呼吸脉冲、掉血放大脉冲）；全部贴边，不遮挡滑道中线；色值全部走 theme 语义色。
- `src/index.css`：面板入场动画、chips/kbd/stats/badge/help-panel/hint 样式、按钮 ≥46px + hover/active/focus-visible、`prefers-reduced-motion` 降级；原有选择器（`.panel/.tag/.ghost/.hud-hidden`）全部保留兼容。

## 4. Round 2 必修清单（按优先级）

### P0（不修不算 SOTA）
1. **`src/session.ts` 去硬编码色值**：`#ffd166 / #7cf7ff / #ff6b9a / #3d7dff / #ff5dab` 等改用 `theme.coin / theme.gem / theme.danger / theme.hp`（语义色本轮已备好）。
2. **玩家泳圈质感**（`session.ts` 或抽到 `entities/player.ts` 绘制层）：径向高光、更软的投影、入水涟漪环（规格 §6 明确要求）。
3. **水面双层正弦叠加**（`world/water.ts`）：至少 2 层不同频率/相位的波 + 现有泡沫带（规格 §6）。
4. **受击反馈**：屏震（camera offset ≤ 8px、<120ms）+ 命中短停（hitstop 40–60ms），入口在 `session.ts` 的 `hurt()` 分支。

### P1（强烈建议）
5. 加速带速度线 / 边缘径向模糊感（`fx/particles.ts` 加线型粒子即可，别上真模糊）。
6. 金币收集飞向分数面板的吸附拖尾；水环穿越全屏一帧闪光（约 8% 白色叠加）。
7. 连击音调上行（`fx/audio.ts` coin 音随 combo 提升半音）。
8. 换道时泳圈轻微 roll 倾斜（`entities/player.ts` 已有插值进度可复用）。

### P2（锦上添花）
9. 触屏虚拟提示：首次触屏 3 秒内显示左右半屏点按区域示意。
10. 结算数字滚动动画（CSS 或 rAF 计数）。
11. 主题徽章在段切换瞬间闪一次 accent 光。

## 5. 验收 rubric（Round 2 结束时逐项打勾）

- [ ] `npm install && npm test && npm run build` 全绿。
- [ ] 一局跑满 2000m：天空 / 水色在 410–500、910–1000、1410–1500 区间可见渐变，无任何硬切帧。
- [ ] `rg "#[0-9a-fA-F]{6}" src/session.ts src/world src/entities` 无 gameplay 硬编码色（HUD/theme 定义处除外）。
- [ ] 受击瞬间可感知屏震 + 心形脉冲；帧率仍 ≥ 55fps。
- [ ] 标题 → Enter 开始 → P 暂停 → Enter 继续 → 撞死 → Enter 再来一局，全程无鼠标可玩。
- [ ] Tab 遍历所有按钮均有可见焦点环；按钮命中区 ≥ 44px。
- [ ] HUD 元素与画布水平中线 ±120px 区域零重叠（连击 pop 除外时也不得进入该区）。
- [ ] `prefers-reduced-motion: reduce` 下无面板动画、无徽章脉冲。
