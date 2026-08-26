# 架构 —《疯狂水世界》海上末日生存原型

Round 1 fable-arch 出品，Round 2 与运行中的 sim 对齐。本文是各子代理
之间的**接口契约**：模块归属见 `OWNERSHIP.md`，玩法定义见 `GAME_SPEC.md`。

**数值的真相在哪（Round 2 更正）**：

- 运行时数值的真相在 sim 侧本地副本：`sim/rules.ts`（资源/建筑/网格）、
  `sim/economy.ts`（产出/吃喝/维修/断粮）、`sim/threats.ts`（风暴/海盗波/
  炮塔）、`entities/skiff.ts` 与 `entities/pirate.ts`（小船/海盗手感）。
- `src/data/constants.ts` 是**文档 + 共享数**：其中 CANVAS、LOOP、
  SAVE_KEY、DAY、SALVAGE 被运行时真实消费（junk/ocean/engine/loop/save
  从它 import）；其余段落是与 sim 手工同步的镜像，仅供查数与平衡讨论。
- 改平衡：改 sim 原件，再同步 constants 的镜像段。两边不一致时，
  **以能跑的 sim 为准**。
- 全游戏只有一套网格（TILE = 64px、原点画布正中、有符号格坐标），
  **禁止再发明第二套网格**。

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
│  data/constants.ts（fable-arch）：被消费的共享数（CANVAS/LOOP/     │
│  SAVE_KEY/DAY/SALVAGE）+ sim 数值的文档镜像（以 sim 为准）          │
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
- 木筏网格只有一套（真相在 `sim/rules.ts`）：格边长 `TILE = 64`px；
  格坐标是**有符号整数** (gx, gy)；`RAFT_ORIGIN`（画布正中 640, 360）
  是 (0, 0) 格的**中心**，`center = RAFT_ORIGIN + (gx, gy) × TILE`，
  换算走 `tileCenter` / `worldToTile`。没有 gridW/gridH——网格无边界，
  木筏靠四邻接向外扩张。
- 开局 3×3（|gx| ≤ 1 且 |gy| ≤ 1），中心 (0, 0) 是指挥中心 `core`
  （不可建造、不可拆除；Round 1 文档旧名 `hq` 已废弃）。
- 小船、海盗、漂浮物在连续坐标系运动，只有建筑吸附网格。小船活动
  范围是 `SEA_BOUNDS`（木筏为中心 1920×1080）；漂浮物默认只在可见
  画布内漂（见 junk.ts 的 DEFAULT_BOUNDS）。

## 5. 玩法契约

### 5.1 建造（真相：sim/rules.ts checkPlace / place）

放置请求 = `(building: PlaceableId, gx, gy)`。**全部校验通过后一次性
扣费落地**，任何一条不过则整体拒绝、分文不扣（原子性，走 `pay()`）：

1. 邻接：`floor` 目标必须是**空海面**且四向（上下左右，不含斜角）至少
   贴一块已有木筏格；其余建筑目标必须是**空地基**（格子是 floor）。
   网格无边界，没有「格子在网格内」这一条。
2. 库存 ≥ `BUILDINGS[building].cost` 的每一项。
3. 校验顺序刻意是「位置先于价格」：位置不对时 HUD 报邻接错误，
   不先怪玩家穷。

落地即时生效：在空地基上盖房是**原格升级**——血量按原比例换算到新
maxHp，不能靠重建洗血。无建造耗时。`refund` / `scrapValue`（半价
向下取整）已在 sim 里备好，但目前没有接进玩家操作。

### 5.2 产出与消耗（真相：sim/economy.ts updateEconomy）

1. **产出**：产出建筑自带 timer，**攒满 intervalS 吐一次整数货**
   （collector 每 5s 木+塑各 1；purifier 每 3s 水 3；fish 每 3s 食 2），
   不是每帧小数流。残血建筑按 `efficiencyOf` 减速（50%–100%）。
   入库被 `RESOURCE_CAP`（建材 99、水/食 100）截断，溢出丢弃。
2. **捞取**：小船在 `SKIFF.scoopRadius`（1.5 格 = 96px）内按空格捞，
   按 `SALVAGE.yields` 掷整数入库，同样受上限截断。
3. **维修**：岛民每 `REPAIR.intervalS`（2s）挑血量比例最低的一格
   （指挥中心加权优先），花 1 木板补 9 血。
4. **消耗**：人口 = `CREW.base`（3）+ 每座存活的非地基建筑 1；
   每人每秒扣水 `UPKEEP.water`（0.12）、食 `UPKEEP.food`（0.1），
   扣到 0 为止（不出现负库存）。
5. **断供判定**：淡水或食物任一**没足额供上**，同一条断粮计时器就
   按 dt 上走；喂饱后按 `STARVE.recoverMul`（2×）回落。计满
   `STARVE.limitS`（25s）→ economy 抛 `starved`，session 切 gameover。

产销平衡基准：一座净水机（1 水/s）> 全队水耗，一座钓鱼台（0.67 食/s）
> 全队食耗（注意每盖一座建筑人口 +1，收支要连人一起算）；收集器只是
慢流，建材大头靠开船拾荒。

### 5.3 风暴（真相：sim/threats.ts STORM）

- 调度：首场 `firstS`（50s）；之后场间隔从 `gapS`（42s）每场缩
  `gapDecayS`（3s），下限 `gapMinS`（22s）。全部基于 sim 的 elapsed。
- 预警：落雷前 `warnS`（4s）就选好落点并抛 `storm-warn` 事件
  （带目标格），HUD 才能提前把那几格标红；音频只读事件表现。
- 结算：从**外圈**（至少缺一个四邻居的格子；只剩指挥中心时才打它）
  随机抽 `1 + ⌊elapsed / extraEveryS⌋` 格（上限 `maxTargets` = 5），
  每格**一次性**吃 `damage`（22）——一场啃不掉满血地基（40），两场
  可以。归零的结构立即拆除，外圈随之重算——多包几层地板就是防波堤，
  这是往外扩建的核心动机（岛民维修见 §5.2，能把啃过的格子补回来）。

### 5.4 海盗（真相：sim/threats.ts WAVE/TURRET + entities/pirate.ts）

- 调度：首波 `WAVE.firstS`（55s，晚于首场风暴，留出立炮塔的窗口）；
  波间隔从 46s 每波缩 2.5s，下限 22s。波内人数 `min(6, 1 + ⌊波数/2⌋)`，
  同屏上限 `maxAlive`（8）。同一波从相近方位来，一侧炮塔守得住。
- 行为：木筏外约 `spawnRadius`（760px）生成 → 直线驶向**最近的木筏
  格**（不限外圈）→ 进入 `reach`（46px）后以 4.5 dps 持续拆，拆完换
  最近目标。速度 58 + 4/波（上限 130），血量 30 + 8/波。
- 反制：炮塔是**单发制**——每 `shotIntervalS`（0.5s）对
  `range`（5 格 = 320px）内最近海盗打 `damage`（9），DPS = 18。
  射击节奏借用 cell.timer（炮塔不在 PRODUCTION 表里，economy 不碰它）。
- 海盗被打死掉 `dropMetal`（2）金属——后期金属的稳定来源。
  海盗碰到小船不掉血（死法只有断粮和拆家），无近战。

### 5.5 胜负（真相：session.ts fail + sim 判定）

无胜利条件，是活多久的生存赛。gameover 触发条件（满足其一）：

- 指挥中心 `core` 血量归零（`isCoreDown`；core 归零不删格，结算画面
  还画得出残骸）；
- 断粮计时器计满 `STARVE.limitS`（25s，见 §5.2）。

结算面板展示：存活天数（`elapsed / DAY.lengthS`，120s 一天）、建筑数、
累计捞取；最好成绩走 data/save.ts 落 localStorage。

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

- 存档（save.ts，opus-content）目前只落「最好成绩」（天数/捞取数），
  键用 `SAVE_KEY`；局中进度存档（库存/格子/威胁计时）仍未做。
- 人口 = 3 + 每座非地基建筑 1（economy CREW），是被动增长；
  主动招募/岛民个体化仍是后续议题。
- `refund` / `scrapValue` 已在 sim 备好但没接进玩家操作（无拆迁按钮）。
- sim 各文件的本地数值副本与 constants 镜像段的**机械同步**（让 sim
  直接 import constants）留给后续轮；本轮只保证两边数字一致。
- 音频节点图、HUD 具体布局分别归 opus-content / fable-sota，不在本文约束。
