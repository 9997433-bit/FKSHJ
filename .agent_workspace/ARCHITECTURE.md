# 架构 —《疯狂水世界》海上末日生存原型

Round 1 fable-arch 出品。本文是各子代理之间的**接口契约**：
模块归属见 `OWNERSHIP.md`，玩法定义见 `GAME_SPEC.md`，全部数值只在
`src/data/constants.ts` 一处（改数不许绕开它）。

## 1. 模块图

```
                       ┌────────────────────┐
                       │  main.ts（父调度器） │  DOM 查询、Engine/Session/Loop 接线
                       └─────────┬──────────┘
                                 │ 组装
        ┌────────────────┬───────┴────────┬─────────────────┐
        ▼                ▼                ▼                 ▼
┌───────────────┐ ┌─────────────┐ ┌──────────────┐ ┌───────────────┐
│ game/engine.ts │ │ game/loop.ts │ │  session.ts  │ │ data/save.ts  │
│ 画布/DPR/场景机 │ │  rAF 主循环  │ │ 一局聚合(父管)│ │ 存档(content) │
└───────┬───────┘ └──────┬──────┘ └──────┬───────┘ └───────────────┘
        │ scene 事件      │ dt,elapsed    │ 每帧调用 ↓（顺序固定）
        ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│  sim/**（opus-core）：木筏格子状态、建造规则、产消结算、           │
│  风暴/海盗调度、胜负判定 —— 纯数据 + 纯函数，不碰 DOM/Canvas       │
├─────────────────────────────────────────────────────────────────┤
│  entities/**（opus-core）：小船、海盗、漂浮物的运动与碰撞          │
│  game/input.ts（opus-core）：键鼠采样 → 每帧输入快照               │
├─────────────────────────────────────────────────────────────────┤
│  world/**、fx/**（opus-content）：海面/木筏/漂浮物绘制、粒子、音频  │
│  ui/**、index.css（fable-sota）：标题/暂停/结算 overlay、HUD       │
├─────────────────────────────────────────────────────────────────┤
│  data/constants.ts（fable-arch）：唯一数值表 + ResourceId 等共享型 │
└─────────────────────────────────────────────────────────────────┘
```

依赖方向自上而下单向：sim 不 import 渲染层；渲染层只读 sim 暴露的
状态，不回写。跨层通信只走两条路：Loop 的 `tick(dt, elapsed)` 与
Engine 的 `onSceneChange`。

## 2. 场景流

```
boot ──▶ title ──▶ playing ◀──▶ paused
                      │            │
                      ▼            ▼
                  gameover ──▶  title
                      │
                      └────▶ playing（直接再来一局）
```

- 状态机唯一持有者是 `Engine`（`engine.scene` / `setScene`）。
- 合法迁移表 `SCENE_FLOW` 写死在 engine.ts；不合法迁移 `console.warn`
  后**仍放行**——多代理协作下宁可吵闹也不软锁死游戏。
- 同值赋值幂等（返回 false、不广播），listener 可安全地在回调里再次
  setScene 而不用担心自触发死循环。
- UI（fable-sota）通过 `onSceneChange` 挂/卸 overlay；音频（opus-content）
  同理切 BGM。谁触发迁移：input 层（P/Esc → paused）、sim 层（判负 →
  gameover）、UI 按钮（title/playing）。

## 3. 帧数据

`createLoop(tick)` 每帧回调 `tick(dt, elapsed)`：

| 量 | 含义 | 保证 |
| --- | --- | --- |
| `dt` | 本帧模拟时长（秒） | 已被 clamp 到 `LOOP.maxDtS`（0.033s），永不为负 |
| `elapsed` | 累计模拟时长（秒） | 历次 dt 之和；暂停/页面隐藏期间**不增长** |

一帧内的固定顺序（session.ts 按此接线，任何人不得私自调换）：

```
input.snapshot()            采样键鼠 → 只读快照（本帧内不再变）
  └▶ sim.update(dt, snap)   建造 → 产出 → 消耗 → 风暴 → 海盗 → 胜负
       └▶ world/fx.draw()   清屏 → 海面 → 木筏 → 实体 → 粒子
            └▶ ui.hud()     资源条 / 预警 / 天数（最后画，永远在最上层）
```

约束：

- **模拟只认 dt**：所有速率写成「单位/秒 × dt」，禁止按帧计数。
  昼夜相位、风暴/海盗计时一律基于 `elapsed`（暂停自动冻结）。
- **渲染无副作用**：draw 不改 sim 状态；需要动画相位就用 `elapsed`。
- `scene !== "playing"` 时跳过 `sim.update`，但照常 draw（暂停画面
  是冻结的世界 + 遮罩，不是黑屏）。
- 长挂起（断点、切后台）恢复后单帧最多推进 0.033s，不会出现风暴
  一口气结算完、海盗瞬移贴脸的隧穿。

## 4. 坐标与网格

- 逻辑画布 1280×720（`CANVAS`），engine.fit 按 DPR 放大 backing store，
  绘制代码不感知物理像素。
- 木筏网格见 `TILE`：15×11 格、每格 48px、居中（origin 280, 96）。
  `px = TILE.originX + gx * TILE.sizePx`。开局正中 3×3 木筏，
  中心格 (7, 5) 为指挥中心（hq，不可建造、不可拆除）。
- 小船、海盗、漂浮物在连续坐标系运动；只有建筑吸附网格。

## 5. 玩法契约

### 5.1 建造

放置请求 = `(building: BuildingId, gx, gy)`。**全部校验通过后一次性
扣费落地**，任何一条不过则整体拒绝、分文不扣（原子性）：

1. 格子在网格内：`0 ≤ gx < gridW && 0 ≤ gy < gridH`。
2. 邻接：`floor` 目标必须是**海面**且四向（上下左右，不含斜角）至少
   贴一块已有木筏格；其余建筑目标必须是**空地板**（有 floor、无建筑）。
3. 库存 ≥ `BUILD_COST[building]` 的每一项。

落地即时生效：血量 = `STRUCTURE_HP[building]`，产出建筑从下一帧开始
计产。Round 1 不做建造耗时、不做拆迁返还。

### 5.2 产出与消耗（每帧，在 sim.update 内按此顺序）

1. **产出**：每座建筑按 `PRODUCTION[building]` 结算 `rate × dt`，
   入库时被 `RESOURCE_CAP` 截断，溢出直接丢弃（不欠账、不转移）。
2. **捞取**：小船在 `BOAT.pickupRadiusPx` 内触发捞取，按
   `SALVAGE.yields` 掷整数入库，同样受上限截断。
3. **消耗**：`UPKEEP.crew × 各 perCrewPerS × dt` 扣淡水与食物，
   扣到 0 为止（不出现负库存）。
4. **断供判定**：淡水、食物**各自独立**维护一条宽限计时
   （初始 `UPKEEP.starveGraceS`）。库存为 0 → 该条计时按 dt 递减；
   恢复供应 → 按同速回填（封顶 starveGraceS）。任一条归零 → gameover。

产销平衡基准（见 constants 注释）：一座净水机 > 全队水耗，一座钓鱼台
> 全队食耗；收集器只是慢流，建材大头靠开船拾荒。

### 5.3 风暴

- 调度：首场 `STORM.firstAtS`，之后 `intervalS ± intervalJitterS`
  随机取下一场；全部基于 `elapsed`。
- 预警：开打前 `warnLeadS` 秒置起 `stormWarning` 标志，HUD 与音频
  只读该标志表现，不自行计时。
- 结算：从**外圈**（四向邻格含海面的结构，含 hq 若暴露在外）随机抽
  `ringHits` 格，每格在 `durationS` 内均匀承受 `tileDamage` 总伤。
  血量归零的结构立即拆除（floor 被拆后其上建筑一并消失），外圈随之
  重新计算——多包几层地板就是防波堤，这是往外扩建的核心动机。

### 5.4 海盗

- 调度：首波 `PIRATE.firstAtS`（晚于首场风暴，留出攒金属造炮塔的
  窗口），之后 `intervalS ± intervalJitterS`；波内人数
  `min(countMax, countBase + ⌊已出波数 / growthEveryWaves⌋)`。
- 行为：画布边缘外随机点生成 → 直线驶向**最近的外圈结构** → 贴上后
  以 `PIRATE.dps` 持续拆，拆完换最近目标。
- 反制：炮塔对 `TURRET.rangePx` 内**最近**海盗持续输出 `TURRET.dps`
  （12 dps × 24 hp = 2 秒/杀；海盗 60 px/s 穿 220px 射程需约 3.7 秒，
  单座炮塔守得住一个来向）。小船不能撞死海盗，Round 1 无近战。
- 海盗血量归零即沉没，无掉落（Round 1 不做赏金）。

### 5.5 胜负

Round 1 无胜利条件，是活多久的生存赛。gameover 触发条件（满足其一）：

- 指挥中心 hq 血量归零；
- 任一断供宽限计时归零（见 §5.2）。

结算面板展示：存活天数（`elapsed / DAY.lengthS`）、建筑数、累计捞取。

## 6. Engine / Loop 契约要点（复审结论）

两模块本轮复审通过，接口冻结；只修了注释里指向旧规格章节号的引用
（重开后 GAME_SPEC 场景章节是 §5，注释原写 §7）。使用方须知：

- **Engine**：backing store 随 DPR/resize 自动重建；Canvas2D 上下文
  丢失自动恢复（每帧全量重绘前可用 `engine.contextLost` 跳过无效
  绘制）；`dispose()` 只在整体卸载时调用。
- **Loop**：`start()` 幂等；页面隐藏自动停帧、恢复可见自动续跑且
  隐藏时长不计入 elapsed；tick 抛错不停帧（错误正常上抛可上报）；
  `dispose()` 之后 `start()` 为 warn + no-op。
- 已知非缺陷备案：loop 以 `last === 0` 作「无上一帧」哨兵，理论上
  与「rAF 时间戳恰为 0」冲突，但 rAF 时基是 navigation start，首帧
  必然 > 0，实际不可达，故不为此加状态位。

## 7. 未决事项（交给后续轮）

- 存档字段布局（save.ts，opus-content）：建议存 `{ 版本, 库存, 格子
  数组, elapsed, 风暴/海盗下次时刻 }`，键用 `SAVE_KEY`。
- 岛民只是消耗系数（`UPKEEP.crew` 固定 3），招募/人口是 Round 2 议题。
- 音频节点图、HUD 具体布局分别归 opus-content / fable-sota，不在本文约束。
