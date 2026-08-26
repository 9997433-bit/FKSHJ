# 疯狂水世界 — 架构说明（Round 1 / fable-arch）

本文是引擎层契约与全局结构的权威描述。玩法数值一律以
`src/data/constants.ts` 为准（GAME_SPEC §9），本文不重复数值。

## 1. 模块图与分层

```
第 0 层  纯数据 / 纯函数（无 DOM、可在 Node 直接单测）
  data/constants.ts      数值表（唯一来源）
  game/collision.ts      circleHit / sameLane
  game/physics.ts        速度模型（← constants）
  game/camera.ts         2.5D 投影（← constants）
  entities/collectible.ts entities/obstacle.ts entities/booster.ts  实体工厂
  fx/particles.ts        粒子模拟/绘制（draw 需 ctx，step 纯函数）

第 1 层  平台基建（DOM / WebAudio / localStorage）
  game/engine.ts   画布 backing store + 场景状态机（← constants）
  game/loop.ts     rAF 循环、dt clamp、隐藏暂停（← constants；Node 可安全 import）
  game/input.ts    键盘 + 指针 → 逻辑输入
  fx/audio.ts      程序化 SFX
  data/save.ts     最高分持久化（← constants）

第 2 层  内容与呈现
  entities/player.ts  泳圈状态机（换道插值/跳跃/无敌）（← constants, physics）
  world/levels.ts     种子化世界生成（← constants, entities/*）
  world/track.ts      滑道绘制（← constants, camera, ui/theme）
  world/water.ts      天空/泡沫（← constants, ui/theme）
  ui/theme.ts         四主题色板（← constants）
  ui/hud.ts           局内 HUD（← constants, theme）
  fx/splash.ts        水花（← particles）
  ui/menus.ts         DOM overlay 菜单（不进 canvas）

第 3 层  聚合
  session.ts   「一局」聚合体：持有 player/world/particles/分数，update + draw
  main.ts      组合根：装配 Engine/Loop/Input/Sfx/Session，驱动场景切换
```

分层规则：**只允许向下 import**。第 0/1/2 层横向之间按上图箭头，
禁止反向依赖；只有 `session.ts` / `main.ts` 允许同时触碰多个子系统。
新增模块先归层，再接线。

## 2. 场景状态机（GAME_SPEC §7）

状态由 `Engine` 持有（`SceneId`），迁移表 `SCENE_FLOW`：

```
boot ──► title ──► playing ──► gameover ──► title
                    │  ▲   │                （或 gameover ──► playing 再来一局）
                    ▼  │   └──► gameover
                  paused ──► title
                  paused ──► playing
```

- 触发点全部在 `main.ts`：`showTitle / startRun / pause / finish` 与
  局内 `consumePause`。
- 契约：`engine.scene = next` 与 `engine.setScene(next)` 等价；
  **同值幂等**（返回 false，不通知监听者）；不在迁移表内的切换
  `console.warn` 后**仍放行**——多代理协作下宁可吵闹也不软锁死游戏。
- `engine.onSceneChange(fn)` 返回退订函数，是菜单/音频响应切换的
  推荐接入点（当前 main.ts 仍是命令式调用 renderOverlay，两者兼容）。

## 3. 帧数据流

```
rAF(t)
 └─ loop：dt = clamp((t-last)/1000, ≤ LOOP.maxDtS)；elapsed += dt
     └─ main tick(dt)
         ├─ playing：consumePause→pause；否则
         │    session.update(dt, steer, consumeJump())
         │      ├─ player.step（换道插值 / 跳跃 / 无敌计时）
         │      ├─ physics.stepSpeed → distance / score 累加
         │      ├─ collect / hazards / boosts（sameLane 粗筛 + circleHit 窄相）
         │      └─ hp≤0 → over → finish()（commitRun 写 localStorage）
         ├─ paused：consumePause → 回 playing
         └─ session.draw(ctx)：theme → sky → track → foam
                                → 按 z 降序画实体与玩家 → 粒子 → HUD
```

- 画布内只画游戏世界与 HUD；title/paused/gameover 菜单是 DOM
  overlay（`ui/menus.ts`），事件走 DOM，不经过 input.ts。
- 非 playing 场景下 session.draw 仍每帧执行（标题背景即上一局定格），
  这是有意行为。

## 4. Engine 契约（src/game/engine.ts）

- **逻辑坐标系**：所有绘制代码工作在 `CANVAS.w × CANVAS.h`（1280×720）。
  Engine 按 `devicePixelRatio`（截断到 `CANVAS.maxDpr`）放大 backing
  store 并 `setTransform` 抹平，绘制模块**永远不感知物理像素**。
  CSS 尺寸由 index.css 控制，与 backing store 解耦。
- **DPR/resize 自愈**：window resize 直接 refit；跨屏拖窗口靠对当前
  dppx 的一次性 media query（触发后重挂新值）。
- **上下文丢失**：监听 `contextlost` / `contextrestored`（Chromium 系；
  其他浏览器不派发即安全降级）。游戏每帧全量重绘，恢复只需 refit
  重建变换。`engine.contextLost` 可用于跳过丢失期间的绘制。
- `fit()` 在尺寸未变时不写 canvas.width/height（写入会整体重置
  上下文状态），但始终重设变换。
- `dispose()` 经 AbortController 摘除全部监听；仅整体卸载时调用。

## 5. Loop 契约（src/game/loop.ts）

- `createLoop(tick)`；`tick(dt, elapsed)` —— dt 为本帧模拟秒数
  （clamp 到 `LOOP.maxDtS`），elapsed 为累计模拟秒数（暂停/隐藏
  期间不增长，适合水面/动画相位）。旧的单参回调仍然类型兼容。
- **隐藏即暂停**：`document.hidden` 时停发帧（浏览器本身也节流 rAF，
  这里显式化），恢复可见后时间基准归零、下一帧走 `LOOP.fallbackDtS`，
  隐藏期间的真实时间不计入 elapsed，不会出现巨帧。
- 首帧同样走 fallbackDt（无上一帧可差分）。
- `now()` 暴露最近 rAF 时间戳（ms）；`running` 表示运行意图
  （隐藏时仍为 true）。
- 模块在 Node 环境可安全 import（document 判空），便于 gpt-test 直测。

## 6. 数值表约定（src/data/constants.ts）

- 按规格章节分组注释：CANVAS/LOOP（引擎）、LANES/PLAYER/SPEED/SCORE
  （玩法 §4）、GEN（生成 §5）、SAVE_KEY、ThemeId/THEME_ORDER。
- 改会影响手感/计分的字段必须同步 `src/tests` 断言。
- 本轮**未改动任何既有数值**，仅新增 `CANVAS.maxDpr` 与 `LOOP.*`。

## 7. 扩展点（给 Round 2+）

1. `engine.onSceneChange`：BGM 起停、菜单动效、埋点。
2. `SCENE_FLOW`：加新场景（如商店/皮肤）时先扩表再接线。
3. `tick(dt, elapsed)` 第二参：water/track 目前靠 session.time 自累计，
   可迁移到 elapsed 消除重复计时。
4. `loop.now()` + `engine.dpr`：性能 HUD / 基准探针（gpt-probe）。
5. `engine.contextLost`：main tick 可在丢失期间跳过 session.draw。
6. 世界流式生成：levels.ts 改为按 distance 滚动补段后，GEN 组即扩
   充窗口参数的落点。

## 8. 已观察缺陷（按所有权分给 Round 2，本轮未越权修改）

**opus-core（physics/collision/input/camera/player/track）**

- 撞墙未实现：规格 §4.2「撞滑道边缘掉速+溅水」；`SPEED.wallPenalty`
  目前无人消费，车道只是 clamp。
- 落水失败条件未实现（§4.4：HP=0 **或** 落水）。
- `physics.stepSpeed` 魔法数：速度下限 90、逼近系数 0.35 应入 SPEED。
- `player.ts`：换道一开始 `lane` 即吸附到目标车道，视觉在两道之间
  而判定已在新道，中途撞击/漏接会显得不公平；`motion.speed` 初值
  280 与 `SPEED.base` 重复硬编码。
- `camera.ts` 魔法数：地平线比例 0.18、near 40、纵深 2400（与
  GEN.horizon 重复）、指数 1.15，建议入 constants 的 CAMERA 组
  （本轮未预置，避免出现双份真相）。
- `input.ts`：无 pointercancel / pointerleave 处理，指针滑出画布会
  卡住 TouchLeft/TouchRight 方向键。

**opus-content（levels/water/entities 非 player/fx/save）**

- 种子偏离规格 §5：应为 `seed = dateDay ^ runId`，现为 `0x51ed ^ runId`。
- 世界只预生成到 `GEN.horizon*3`=7200 世界单位（约 60–130 秒可跑完），
  之后滑道全空；需要流式补段。
- 主题在 2000 单位后永远停在 neon（themeIndex clamp）；规格是流式
  拼接，长局应循环。
- `fx/audio.ts` 无 BGM（§2 要求 BGM/SFX）。

**fable-sota（theme/menus/hud）**

- `ui/theme.ts` 的 `themeAt` 硬编码 500（应用 `GEN.segmentLen`）且与
  `levels.ts#themeIndex` 双实现，还依赖 `Object.keys` 顺序而非
  `THEME_ORDER`——改 segmentLen 时两处会静默漂移。
- `ui/hud.ts` 硬编码 `#ff5dab` / `#ff6b9a`，违反 §6「主题色必须走
  theme.ts」。
- `ui/menus.ts` 操作说明用 `alert()`，体验粗糙。

**父调度器（session.ts / main.ts / index.html）**

- `session.ts` 魔法数：玩家锚点 z=80、各判定窗口（-20…220）、
  速度→距离系数 0.2、无敌时长 0.85/0.6、粒子上限 360；玩家配色
  硬编码（违反 §6）。
- `session.result()` 的 `isNew` 用 `>=`，平最高分也算新纪录（可接受，
  记录在案）。
- `main.ts` 76–78 行空 if 是死代码。
- `index.html` 的 `user-scalable=no` 有无障碍代价（游戏场景常见取舍）。

## 9. 风险

- 场景 FSM 采用「警告后放行」：违规迁移可见但不致命；若 Round 2 想
  收紧为硬失败，先确认 main.ts 全部调用路径。
- `contextlost` 事件仅 Chromium 派发；其余浏览器等价于旧行为。
- `CANVAS.maxDpr = 2`：3x 屏按 2x 渲染，是刻意的填充率上限。
- theme 双实现（§8 fable-sota 条目）是当前最可能因并行改动而漂移的
  共享真相，建议 Round 2 收敛为单一函数。
