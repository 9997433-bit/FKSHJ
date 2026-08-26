# 疯狂水世界 — 架构说明（Round 2 / fable-arch）

本文是引擎层契约与全局结构的权威描述，基于 Round 1 六路合并后的
代码（`c571d02`）重新审计。玩法数值一律以 `src/data/constants.ts`
为准（GAME_SPEC §9），本文不重复数值。

## 1. 模块图与分层（R1 合并后现状）

```
第 0 层  纯数据 / 纯函数（无 DOM、可在 Node 直接单测）
  data/constants.ts      数值表（唯一来源；本轮新增 CAMERA / FEEL 组）
  game/collision.ts      circleHit / overlapDepth / nearMiss / sameLane
  game/camera.ts         2.5D 投影 + 弯道 + 震动（← constants）⚠ 含模块级状态 cam
  game/physics.ts        速度模型（← constants, camera.kickCamera）⚠ 见 §7-11
  entities/collectible.ts entities/obstacle.ts entities/booster.ts  实体工厂
  fx/particles.ts        粒子模拟/绘制（draw 需 ctx，step 纯函数）

第 1 层  平台基建（DOM / WebAudio / localStorage）
  game/engine.ts   画布 backing store + 场景状态机（← constants）
  game/loop.ts     rAF 循环、dt clamp、隐藏暂停（← constants；Node 可安全 import）
  game/input.ts    键盘 + 指针 → 逻辑输入（含指针捕获防卡键）
  fx/audio.ts      程序化 SFX（连拾音阶上行、琶音；无 BGM）
  data/save.ts     hiScore/hiDistance/lastRunAt/runs/totalCoins 持久化

第 2 层  内容与呈现
  entities/player.ts  泳圈状态机：换道插值/跳跃缓冲/刮墙/carve
                      （← constants, physics.applyWallScrape, camera.chuteBank）
  world/levels.ts     种子化世界生成 + SPAWN_TABLES（← constants, entities/*）
  world/track.ts      滑道网格/墙/导流箭头（← constants, camera, ui/theme）
  world/water.ts      天空/剪影/泡沫（← constants, ui/theme）
  ui/theme.ts         四主题色板 + 段间混色 themeAt（← constants）
  ui/hud.ts           局内 HUD：连击 pop/速度条/心形 HP（← constants, theme）
  fx/splash.ts        水花预设（← particles）
  ui/menus.ts         DOM overlay 菜单（不进 canvas）

第 3 层  聚合
  session.ts   「一局」聚合体：持有 player/world/particles/分数，update + draw
               （本轮接入 FEEL 判定窗口 / CAMERA.entityCullZ）
  main.ts      组合根：装配 Engine/Loop/Input/Sfx/Session，驱动场景切换
```

分层规则：**只允许向下 import**；只有 `session.ts` / `main.ts` 允许
同时触碰多个子系统。R1 合并引入两条带状态的第 0 层内部边——
`physics → camera`（kickCamera 副作用）与 `player → camera`
（chuteBank 纯查询）。后者无害；前者是已登记的坏味道（§7-11），
Round 3 处理，本轮不越权改 opus-core 文件。

## 2. 场景状态机（GAME_SPEC §7）

状态由 `Engine` 持有（`SceneId`），迁移表 `SCENE_FLOW`：

```
boot ──► title ──► playing ──► gameover ──► title
                    │  ▲   │                （或 gameover ──► playing 再来一局）
                    ▼  │   └──► gameover
                  paused ──► playing
                  paused ──► title
```

- `boot` 是构造期占位：main.ts 模块底部同步调用 `showTitle()`，
  boot 存活 0 帧即走合法迁移 boot→title。规格 §7 要求该状态存在，
  它同时保证任何监听者看到的第一次迁移都有一致的 prev 值——
  **不是死代码，不要移除**。
- 触发点全部在 `main.ts`：`showTitle / startRun / pause / finish` 与
  局内 `consumePause`。
- 契约：`engine.scene = next` 与 `engine.setScene(next)` 等价；
  **同值幂等**（返回 false，不通知监听者）；不在迁移表内的切换
  `console.warn` 后**仍放行**——多代理协作下宁可吵闹也不软锁死游戏。
- `engine.onSceneChange(fn)` 返回退订函数，是 BGM/菜单动效的推荐
  接入点（Round 2 opus-content 加 BGM 时应从这里起停，而不是在
  main.ts 再铺一层命令式调用）。

## 3. 帧数据流

```
rAF(t)
 └─ loop：先排下一帧 rAF；dt = clamp((t-last)/1000, ≤ LOOP.maxDtS)；elapsed += dt
     └─ main tick(dt)
         ├─ playing：consumePause→pause；否则
         │    session.update(dt, steer, consumeJump())
         │      ├─ player.step（换道插值 / 跳跃缓冲 / 无敌与刮墙冷却 / carve）
         │      ├─ physics.stepSpeed(motion, dt) → dz = spd·dt·FEEL.worldScale
         │      ├─ collect / hazards / boosts（FEEL 窗口粗筛 + sameLane + circleHit）
         │      └─ hp≤0 → over → finish()（commitRun 写 localStorage）
         ├─ paused：consumePause → 回 playing
         └─ session.draw(ctx)：themeAt → sky → silhouettes → track(syncCamera)
                                → foam → 按 z 降序画实体与玩家 → 粒子 → HUD
```

- 镜头状态在 `drawTrack → syncCamera(cameraZ, time)` 中推进，模拟
  代码通过 `kickCamera` 推入冲击。**绘制顺序即镜头时序**：任何在
  drawTrack 之前调用 project 的代码会用上一帧的镜头（当前无此调用，
  新增绘制层时注意）。
- 画布内只画游戏世界与 HUD；菜单是 DOM overlay（`ui/menus.ts`）。
- 非 playing 场景下 session.draw 仍每帧执行（标题背景即上一局定格），
  这是有意行为。

## 4. Engine 契约（src/game/engine.ts）

本轮全文复审，**无缺陷，零改动**。要点复述：

- **逻辑坐标系**：绘制代码工作在 `CANVAS.w × CANVAS.h`（1280×720），
  Engine 按 devicePixelRatio（截断到 `CANVAS.maxDpr`）放大 backing
  store 并 `setTransform` 抹平；`fit()` 在尺寸未变时不写
  canvas.width/height（写入会整体重置上下文状态）。
- **DPR/resize 自愈**：resize 直接 refit；跨屏拖窗靠对当前 dppx 的
  一次性 media query（触发后重挂新值）。轮换的 MediaQueryList 监听
  始终带 AbortController signal，dispose 一次性摘干净——**无泄漏**。
- **上下文丢失**：contextlost/contextrestored（Chromium 系）自动恢复；
  `engine.contextLost` 可用于跳过丢失期间的绘制（main 目前未接，
  丢失期间多画几帧空操作，无害）。
- `dispose()` 经 AbortController 摘除全部监听并清空场景监听者；
  仅整体卸载时调用。

## 5. Loop 契约（src/game/loop.ts）

- `createLoop(tick)`；`tick(dt, elapsed)`——dt 为本帧模拟秒数（clamp
  到 `LOOP.maxDtS`），elapsed 为累计模拟秒数（暂停/隐藏期间不增长）。
- **隐藏即暂停**：document.hidden 停发帧，恢复后时间基准归零走
  `LOOP.fallbackDtS`，隐藏期间的真实时间不计入 elapsed。
- **本轮修复 ①（异常隔离）**：下一帧 rAF 现在在调用 tick **之前**
  排入。旧实现里 tick 抛错会静默停帧且 `running` 仍为 true，
  `start()` 因幂等守卫也救不回来——一次内容层异常就永久黑屏。
  现在错误照常上抛（可见可上报），下一帧仍会到来；tick 内部调用
  stop()/dispose() 会取消这次预约，语义不变。
- **本轮修复 ②（dispose 守卫）**：`dispose()` 后的 `start()` 变为
  warn + no-op。旧实现会复活一个丢失了 visibilitychange 监听的
  循环，「隐藏即暂停」静默失效。
- `now()` 暴露最近 rAF 时间戳（ms）；`running` 表示运行意图。
  API 无任何增删。

## 6. 数值表（src/data/constants.ts）

分组：CANVAS/LOOP（引擎）、LANES/PLAYER/SPEED/SCORE（玩法 §4）、
GEN（生成 §5）、**CAMERA / FEEL（本轮新增）**、SAVE_KEY、ThemeId。

CAMERA/FEEL 的定位：**把 R1 遗留在各模块内的物理/镜头魔法数收进
唯一数值来源**（ROUND1_BRIEF 缺陷 10）。每个字段与现存内联常量
**数值完全一致**，并在注释里标注现持有者，接入是行为无损的。

| 分组 | 字段 | 现状 |
| --- | --- | --- |
| CAMERA 投影/弯道/震动 | horizonFrac, near, scaleMin/Span, depthCurve, bottomPad, bend\*, bankFull, shakeDecay | 镜像 `camera.ts` 内联值；**待 opus-core 接入** |
| CAMERA | entityCullZ | ✅ 已由 session.draw 消费（原三处 `1800`） |
| FEEL 速度模型 | minSpeed, approachRise/Fall, settleRate, boostAttackS/ReleaseS, bankLoss, bankScrub | 镜像 `physics.ts` 内联值；**待 opus-core 接入** |
| FEEL 玩家操控 | jumpBufferS, switchCarve, chuteCarve, airCarve, hopLiftPx, wallScrapeCdS, hurtInvulnS | 镜像 `player.ts` 内联值；**待 opus-core 接入** |
| FEEL 会话判定 | worldScale, playerAnchorZ, pickup/hazard/boostZMin/Max, laneTol, vortexLaneTol, vortexSlowMul, ringInvulnS | ✅ 已由 session.ts 消费（本轮接线，探针快照逐位一致） |
| FEEL 反馈强度 | hitKick, wallKick, boostKick | 镜像 `physics.ts` 的 kickCamera 力度；待接入 |
| FEEL | hitstopS | 规划值（缺陷 8 / SOTA P0-4），尚无消费方 |

迁移规则：接入方必须**删除模块内副本**，禁止两处并存；数值一致时
接入不需要改任何测试。camera.ts 的 far 裁剪继续用 `GEN.horizon`，
不设第二字段；syncCamera 里的怠速摇摆微系数（若干 sin 项）属每帧
纯装饰，**有意留在模块内**，不值得进数值表。

改会影响手感/计分的字段必须同步 `src/tests` 断言与 BENCH 快照。

## 7. 遗留风险（对照 ROUND1_BRIEF 12 条，Round 2 期间的现状）

1. **世界 ~7200 单位后变空**（R2 opus-content）：`generateWorld` 一次
   性预生成 `GEN.horizon*3`。改流式后 GEN 组是扩窗口参数的落点；
   注意 probe 磁带 1200 帧只跑 ~1400 单位，流式化不应改变前 7200
   单位的生成序列，否则要同步 BENCH 快照并说明。
2. **主题停在霓虹**（R2 opus-content）：`levels.themeIndex` clamp 到
   3。⚠ 与 `theme.themeAt` 是**双实现**（公式当前一致）：任何一侧
   单独加循环（取模）另一侧不动，就会出现「生成表已回热带、天空
   还是霓虹」的静默漂移。收敛方案：把 距离→段索引 做成单一函数，
   levels 与 theme 共用（放 constants.ts 或新的第 0 层小模块均可，
   由 opus-content / fable-sota 协商归属）。
3. **无 BGM**（R2 opus-content）：接入点 `engine.onSceneChange`；
   Sfx 已有 master GainNode，BGM 应挂同一 master 以复用静音开关。
4. **落水失败未实现**（R2 opus-core）：§4.4 的第二种死法。判定素材
   已齐：刮墙冷却（wallCd）、carve、hp。入口建议在 session.update
   聚合层，别让 player.ts 直接触发结算。
5. **换道判定超前视觉**（R2 opus-core）：`player.step` 里
   `this.lane = this.toLane` 立即吸附；判定用离散 lane、绘制用插值
   laneX。改为按 laneX 判定时**必须同步 player.test**。
6. **drawFoam 全宽浪线切过滑道墙**（R2 fable-sota/opus-content）：
   water.drawFoam 画的是屏幕空间横线，不随滑道透视。
7. **泳圈缺高光/投影/涟漪**（§6；R2 fable-sota）：玩家绘制仍是
   session.draw 里的两枚椭圆，建议抽到 entities/player.ts 绘制层。
8. **无受击顿帧/加速速度线**：`FEEL.hitstopS` 已备好；顿帧实现应在
   session.update 顶部对 dt 做衰减，**不要**动 loop.ts（loop 只管
   真实时间，游戏时间缩放是会话层职责）。
9. **种子未混 dateDay**（§5；R2 opus-content）：现为 `0x51ed ^ runId`。
   改时给 probe 留一个可注入的固定 dateDay，否则确定性磁带隔天失效。
10. **魔法数散落**：session.ts 部分本轮已清（见 §6）；camera/physics/
    player 的副本等 opus-core 按迁移规则接入 CAMERA/FEEL。
11. **physics→camera 耦合**：`applyHit/applyBoost/applyWallScrape`
    直接调 kickCamera，第 0 层纯函数带了渲染副作用（bench 跑 20 万次
    stepSpeed 不受影响，但 applyHit 在 Node 里也会震一个没人看的
    镜头）。R3 方案：physics 返回冲击强度（或写入 Motion 事件字段），
    由 session 统一转发给 camera——kick 力度常量已入 FEEL 备用。
12. **Canvas/GPU 帧时未做浏览器基准**（R2 gpt-probe）：BENCH.md 只有
    Node 微基准；另外 BENCH.md 的探针快照仍是密度上调前的旧值
    （score 328.919，当前基线 545.74），需要 gpt-probe 刷新。

新增观察（本轮审计发现，未在 BRIEF 内）：

- `main.ts` 76–78 行空 if 死代码仍在（父调度器文件，未越权动）。
- HUD 模块级动画状态（lastCombo/hpPulseAt）跨局不重置：新一局首个
  连击的 pop 基线可能残留上一局值，影响极小，fable-sota 顺手可修。
- `session.result()` 的 `isNew` 语义：平最高分不算新纪录（`>` 比较，
  R1 记录的 `>=` 问题已被合并修正），维持现状。

## 8. Round 3 验收清单（fable-arch 复审时逐项打勾）

**门禁（全绿才进入评审）**

- [ ] `npm install && npm test && npm run build` 全绿
- [ ] `npm run smoke` / `npm run probe` / `npm run bench` 全绿，
      BENCH.md 快照与当前基线一致（含浏览器 1080p 帧时段落）

**架构收敛**

- [ ] camera.ts / physics.ts / player.ts 全部改读 CAMERA/FEEL，模块内
      同值常量已删除（用 `rg '0\.22|1\.15|BEND_|RISE|FALL' src/game`
      抽查无内联副本）
- [ ] 距离→主题段索引只有一个实现，levels 与 theme 共用且循环一致
- [ ] physics 不再 import camera；镜头冲击经 session 转发
- [ ] 种子 = `dateDay ^ runId`，probe 以固定 dateDay 注入保持确定性

**玩法完成度（GAME_SPEC §4/§5/§7）**

- [ ] 长局（≥ 3×GEN.horizon 距离）滑道不空，四主题循环出现
- [ ] 落水失败可触发并正确进结算；HP=0 与落水两条死法都有反馈
- [ ] 换道中段撞击/漏接与视觉一致（判定用插值 laneX），player.test 覆盖
- [ ] BGM 随场景起停并共享静音开关；受击顿帧（FEEL.hitstopS）生效

**视觉底线（GAME_SPEC §6 + SOTA_BAR P0）**

- [ ] 泳圈高光/投影/入水涟漪；泡沫与滑道透视对齐（不再切墙）
- [ ] `rg "#[0-9a-fA-F]{6}" src/session.ts` 无 gameplay 硬编码色
- [ ] 粒子峰值 < 400 红线不破；1080p 桌面 ≥ 55fps
