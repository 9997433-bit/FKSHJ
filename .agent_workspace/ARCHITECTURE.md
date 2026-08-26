# 疯狂水世界 — 架构说明（Round 3 终审 / fable-arch）

本文是引擎层契约与全局结构的权威描述，基于 Round 3 收编后再加收尾轮
（拆 `physics → camera`、结算文案、三分屏帮助）。玩法数值一律以
`src/data/constants.ts` 为准（GAME_SPEC §9），本文不重复数值。

**本轮门禁实测**（收尾轮复跑）：`npm test` 39/39、`npm run build` 通过、
`npm run smoke` 34 文件 + 10 内容检查通过、`npm run bench` 三项预算全过、
`npm run probe` 确定性成立且长局 10,000 单位 `worldEmptyAhead: false`
（前方仍有 111 拾取 / 46 障碍，最远生成 z≈17,154）。磁带快照见 BENCH.md
（约 1191m、score 586.233、HP=0；`pickupsTaken` 会因回收少计）。

## 1. 模块图与分层（R3 收编后现状）

```
第 0 层  纯数据 / 纯函数（无 DOM、可在 Node 直接单测）
  data/constants.ts      数值表（唯一来源；CAMERA / FEEL 已全组接线）
  game/collision.ts      circleHit / overlapDepth / nearMiss / sameLane
                         （sameLane 默认容差 ← FEEL.laneTol）
  game/camera.ts         2.5D 投影 + 弯道 + 震动（← CAMERA，内联副本已删；
                         怠速摇摆微系数属纯装饰有意留内）⚠ 模块级状态 cam
  game/physics.ts        速度模型 + hitstop 记账 + 弯道甩出（slip/fall）
                         + CHUTE 截面几何（← FEEL；无 camera import）
  entities/collectible.ts entities/obstacle.ts entities/booster.ts  实体工厂
  fx/particles.ts        粒子模拟/绘制（draw 需 ctx，step 纯函数）

第 1 层  平台基建（DOM / WebAudio / localStorage）
  game/engine.ts   画布 backing store + 场景状态机（本轮复审零缺陷零改动，§4）
  game/loop.ts     rAF 循环、dt clamp、隐藏暂停（本轮复审零缺陷零改动，§5）
  game/input.ts    键盘 + 指针 → 逻辑输入（含指针捕获防卡键；触屏三分屏）
  fx/audio.ts      程序化 SFX + BGM（pad 双振荡器 + 八分琶音；静音时整套
                   rig 拆除，不留零增益空转；意向/静音/AudioContext 三与门）
  data/save.ts     hiScore/hiDistance/lastRunAt/runs/totalCoins 持久化

第 2 层  内容与呈现
  entities/player.ts  泳圈状态机：换道插值（中点翻面）/跳跃缓冲/刮墙/
                      carve/弯道 slip/落水 fallen（← FEEL, physics,
                      camera.chuteBank；内联副本已删）
  world/levels.ts     双 LCG 游标流式生成 + SPAWN_TABLES + seedWorld(dateDay^runId)
                      + themeIndex（取模循环）+ themeCycleAt（跨圈混色）
  world/track.ts      滑道网格/墙/导流箭头（← FEEL.chuteFloor/chuteWall：画的边就是甩出的边）
  world/water.ts      天空/剪影/泡沫（泡沫经 project 投影，随滑道弯曲、不再切墙）
  ui/theme.ts         四主题色板 + 单圈混色 themeAt（钳制语义，见 §7-1）
  ui/hud.ts           局内 HUD + 甩出预警（offChute01 两级淡入、reduced-motion
                      守卫）；模块级动画状态有 resetHud() + distance 回退自动清零
  ui/tube.ts          drawPlayerRing：高光/投影/涟漪/焊缝/无敌光环 + ringRoll
  fx/splash.ts        水花预设（← particles）
  ui/menus.ts         DOM overlay 菜单；面板打开期间绑定 M 静音键

第 3 层  聚合
  session.ts   「一局」聚合体：update（takeHitstop 先扣冻结 → 世界推进 →
               generateAhead 流式续生）+ draw（themeCycleAt 上色、
               entityCullZ 裁剪、z 降序绘制、HUD 接 offChute01）
  main.ts      组合根：装配 Engine/Loop/Input/Sfx/Session；startRun 里
               resetHud()；三处菜单接 audio 静音开关
```

分层规则：**只允许向下 import**；只有 `session.ts` / `main.ts` 允许同时
触碰多个子系统。跨界例外只剩 `player → camera`（chuteBank 纯查询，无害）。
`physics → camera` 已拆：apply* 把冲击写入 `Motion.kick`，session 经
`takeKick` 转发给 `kickCamera`。滑道边缘的单一来源是 `FEEL.chuteFloor /
chuteWall`：physics.offChuteDepth 与 track 画边读同一对数字。

## 2. 场景状态机（GAME_SPEC §7）

状态由 `Engine` 持有（`SceneId`），迁移表 `SCENE_FLOW`：

```
boot ──► title ──► playing ──► gameover ──► title
                    │  ▲   │                （或 gameover ──► playing 再来一局）
                    ▼  │   └──► gameover
                  paused ──► playing
                  paused ──► title
```

- `boot` 是构造期占位：main.ts 模块底部同步调用 `showTitle()`，boot 存活
  0 帧即走合法迁移 boot→title。规格 §7 要求该状态存在——**不是死代码**。
- 契约：`engine.scene = next` 与 `engine.setScene(next)` 等价；**同值幂等**
  （返回 false，不通知监听者）；不在迁移表内的切换 `console.warn` 后仍放行。
- `engine.onSceneChange(fn)` 返回退订函数。R2 简报曾建议 BGM 从这里起停，
  实际落地方案更简单也更对：BGM 由 `Sfx.unlock()`（首次开始的用户手势）
  启动，之后跨场景常驻，只受静音/音乐意向门控——标题与结算下有 pad 垫底
  是有意行为，不是漏接。onSceneChange 目前无消费者，保留为扩展点。

## 3. 帧数据流

```
rAF(t)
 └─ loop：先排下一帧 rAF；dt = clamp((t-last)/1000, ≤ LOOP.maxDtS)；elapsed += dt
     └─ main tick(dt)
         ├─ playing：consumePause→pause；否则
         │    session.update(dt, steer, consumeJump())
         │      ├─ time += dt；step = takeHitstop(motion, dt)  ← 受击顿帧在此吃 dt
         │      ├─ player.step(step)（换道插值 / 跳跃缓冲 / 无敌与刮墙冷却 / carve
         │      │              / slip 甩出 / fallT 落水计时 → fallen 时 hp=0）
         │      ├─ physics.stepSpeed(motion, step) → dz = spd·step·FEEL.worldScale
         │      ├─ generateAhead(world, distance + STREAM_AHEAD)  ← 流式续生
         │      ├─ collect / hazards / boosts（FEEL 窗口粗筛 + sameLane + circleHit；
         │      │   判定用 player.lane = round(laneCenter + slip)，中点翻面跟视觉）
         │      └─ hp≤0 → over；takeKick → kickCamera；finish() 带 fallen
         ├─ paused：consumePause → 回 playing
         └─ session.draw(ctx)：themeCycleAt → sky → silhouettes → track(syncCamera)
                                → foam(经 project) → z 降序实体+drawPlayerRing
                                → 粒子 → HUD(含 offChute01 甩出预警)
```

- **hitstop 语义**：`applyHit` 把 `FEEL.hitstopS` 记到 `Motion.hitstopLeft`，
  session.update 每帧用 `takeHitstop` 把冻结量从 dt 里扣掉——世界（玩家、
  速度、距离、连击计时）停一拍，但 `session.time` 仍按全额 dt 走，涟漪、
  无敌闪烁等动画在冻结期间继续呼吸。loop.ts 不感知任何游戏时间缩放，
  职责边界与 R2 设计一致（顿帧是会话层职责）。
- 镜头状态在 `drawTrack → syncCamera(cameraZ, time)` 中推进。**绘制顺序即
  镜头时序**：foam 与实体都在 track 之后 project，用的是本帧镜头；任何新
  绘制层若排在 drawTrack 之前调用 project，会用上一帧镜头。
- 两条死法（GAME_SPEC §4.4）汇成一个出口：落水把 `player.fallen` 置真并将
  hp 清零，session 只看 `hp ≤ 0`。`Session.result().fallen` 交给菜单：
  落水文案「冲出滑道」，撞瘪文案「气漏光了」（新纪录仍用「载入史册」）。
- 画布内只画游戏世界与 HUD；菜单是 DOM overlay。非 playing 场景下
  session.draw 仍每帧执行（标题背景即上一局定格），有意行为。

## 4. Engine 契约（src/game/engine.ts）

Round 3 全文复审，**无缺陷，零改动**。要点：

- **逻辑坐标系**：绘制代码工作在 `CANVAS.w × CANVAS.h`（1280×720），Engine
  按 devicePixelRatio（截断到 `CANVAS.maxDpr`）放大 backing store 并
  `setTransform` 抹平；`fit()` 在尺寸未变时不写 canvas.width/height。
- **DPR/resize 自愈**：resize 直接 refit；跨屏拖窗靠对当前 dppx 的一次性
  media query（触发后重挂新值）。所有监听都挂 AbortController signal，
  dispose 一次性摘干净——无泄漏。
- **上下文丢失**：contextlost/contextrestored（Chromium 系）自动恢复；
  `engine.contextLost` 可用于跳过丢失期间的绘制（main 未接，丢失期间多画
  几帧空操作，无害）。

## 5. Loop 契约（src/game/loop.ts）

Round 3 全文复审，**无缺陷，零改动**。要点：

- `createLoop(tick)`；`tick(dt, elapsed)`——dt clamp 到 `LOOP.maxDtS`，
  elapsed 为累计模拟秒数（暂停/隐藏期间不增长）。
- **隐藏即暂停**：document.hidden 停发帧，恢复后时间基准归零走
  `LOOP.fallbackDtS`，隐藏期间的真实时间不计入 elapsed。
- **异常隔离**（R2 修复，本轮验证仍在）：下一帧 rAF 在调用 tick **之前**
  排入，tick 抛错错误照常上抛但循环不死；tick 内 stop()/dispose() 会取消
  这次预约。**dispose 守卫**：dispose 后 start() 为 warn + no-op。
- 模块在 Node 可安全 import（`hasDoc` 守卫），仅 start 后依赖 rAF。

## 6. 数值表（src/data/constants.ts）

分组：CANVAS/LOOP（引擎）、LANES/PLAYER/SPEED/SCORE（玩法 §4）、
GEN（生成 §5，horizon×3 = 流式续生纵深）、CAMERA / FEEL、SAVE_KEY、ThemeId。

接线状态（Round 3 终审）：**CAMERA 与 FEEL 全部字段均有真实消费方**——
camera.ts（投影/弯道/震动）、physics.ts（速度模型/kick 力度/hitstop）、
player.ts（操控）、collision.ts（sameLane 默认容差）、session.ts（判定
窗口/entityCullZ/takeHitstop），模块内同值副本已删。抽查通过：
`rg 'BEND_|RISE|SETTLE|_CARVE|JUMP_BUFFER' src/game src/entities`
零命中；physics 仍持有的甩出滑道常量是下述有意例外。

甩出滑道几何与计时（`chuteFloor` / `chuteWall` / `slip*` / `rimLane` /
`fallTimeS` / `fallRecover`）已入 FEEL；physics 只留 `CHUTE` 作为
`{ floor, wall }` 别名给 `offChuteDepth`。`SPEED.wallPenalty` 由
player.scrapeWall → applyWallScrape 消费。

改会影响手感/计分的字段必须同步 `src/tests` 断言与 BENCH 快照。

## 7. Round 2 遗留清单处置（对照 ROUND2_BRIEF，R3 终审）

「潜在边界风险」8 条的结论：

1. **themeAt / themeCycleAt 双路径** —— ✅ 语义已对齐并文档化：
   `theme.themeAt` 是**单圈画笔**（0..一圈内上色 + 段间混色，末段钳制），
   `levels.themeCycleAt` 是**唯一对外入口**（距离折圈后交给 themeAt，再把
   末段平滑混回热带港）。已抽查：全部绘制路径只走 themeCycleAt，themeAt
   直接调用仅存于 levels 内部与测试；生成侧 `levels.themeIndex` 同为取模，
   视觉与生成不会漂移。
2. **camera/physics/player 内联副本** —— ✅ R3 opus-core 完成迁移，
   副本已删（见 §6），collision.sameLane 默认容差也已同源。
3. **physics → kickCamera 耦合** —— ✅ 已拆：applyHit / applyBoost /
   applyWallScrape 只写 `Motion.kick`，session.update 末尾 `takeKick`
   后转发 `kickCamera`。`rg 'kickCamera' src/game/physics.ts` 零命中。
4. **HUD 模块级动画状态跨局泄漏** —— ✅ R3 fable-sota 完成：
   `resetHud()` 在 startRun 显式调用，drawHud 内 distance 回退自动清零
   兜底，两者幂等。
5. **实体数组只增不删** —— ✅ R3 opus-content：`recycleBehind` 在
   玩家身后 400 单位扫尾，步长 200；不碰 `gen` 游标，流式确定性保持。
6. **探针磁带在新种子下早死** —— ✅ 已确认并入档：确定性磁带在 1198m
   处 HP=0 结束（over=true, score 587.644），**确定性本身不受影响**
   （两遍逐位一致）；长局探针关碰撞照常跑满 10,000。BENCH.md 已由
   gpt-probe 刷新且注明 `seedWorld(runId, 0)` 钳日基准，快照与本轮
   复跑逐项一致。
7. **真实画布 60fps / GPU 填充未测** —— ❌ 仍缺浏览器实测（§8-C）。
8. **FEEL.hitstopS 无消费方** —— ✅ R3 完成：applyHit 记账
   `Motion.hitstopLeft`，session.update 经 takeHitstop 消费（§3）。

「SOTA 验收差距（Round 3 冲刺）」清单终审：

- [x] camera/physics/player 改读 CAMERA/FEEL 并删内联副本（R3 opus-core）
- [x] 受击 hitstop + 加速速度线（R3 opus-core / opus-content `speedlines.ts`）
- [x] HUD `offChute01` 预警、跨局重置（R3 fable-sota：两级淡入预警胶囊
      + 侧缘 danger 雾 + reduced-motion 守卫 + resetHud 双保险）
- [x] 远离玩家的实体回收（R3 opus-content `recycleBehind`）
- [x] themeAt 与循环语义对齐或文档标明（本轮完成，见上 §7-1）
- [x] README / SOTA_BAR / ARCHITECTURE 与现网行为对齐（README 重写为
      流式世界/落水/静音 M/四主题循环 + 本文终审 = fable-arch 本轮；
      SOTA_BAR 已由 R3 fable-sota 重盘）
- [x] 刷新 BENCH.md 快照（R3 gpt-probe；本轮复跑逐项吻合）
- [ ] 浏览器里走一遍标题→再来一局（收尾轮补测，§8-C）

R2 相对 R1 的八项演进（流式世界、主题循环、落水失败、换道中点翻面、
泳圈质感、BGM+静音、CAMERA/FEEL 建组、loop 异常隔离）本轮全部复核确认
在位且门禁全绿，不再逐条展开。

## 8. 收尾轮清单（Round 3 之后）

**A. 架构收敛** —— ✅ 已落地

1. physics 不再 import camera：冲击写入 `Motion.kick`，session 转发。
   CHUTE / slip / fall 常量已入 FEEL。验收：`rg 'kickCamera' src/game/physics.ts`
   零命中。

**B. 玩法/呈现** —— ✅ 已落地

2. 结算文案按 `result.fallen` 区分「冲出滑道」与「气漏光了」；
   帮助与 GAME_SPEC 触控描述改为三分屏（0.33 / 0.67）。

**C. 验收收尾** —— ✅ 已落地

3. 浏览器实测（1920×1080）：标题→帮助（三分屏）→开始→换道/跳跃→暂停→
   继续→结算（冲出滑道 / 气漏光了 / 载入史册）→再来一局→回标题。
   注入采样约 60fps。

**门禁（合并前必须全绿）**

- `npm install && npm test && npm run build`
- `npm run smoke && npm run probe && npm run bench`
