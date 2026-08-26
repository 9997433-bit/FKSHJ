# 架构 —《疯狂水世界》海上末日生存原型

fable-arch 维护。本文是各子代理之间的**接口契约**：模块归属见
`OWNERSHIP.md`，玩法定义见 `GAME_SPEC.md`。Round 1 新增两块：多游戏
目录契约（§0）与物品/请求板/剧情三个新系统的接线契约（§7）。三个
新模块已落地，§7 与实现逐项核对过——**实现即真相**，父调度器照
§7.5 的清单把它们接进 session。Round 2（把新层折进同一套海）的四条
支线：掉落线与吃喝线在 §7.5，海面外观线与里程碑线在 §7.7——
原则是**不开新经济、不开新场景、不扩 snapshot**。

**数值的真相在哪（现状）**：

- 既有玩法：`games/sea/src/data/constants.ts` 是**唯一真源**——sim
  （rules/economy/threats）与 entities（skiff/pirate）已全部改为直接
  import 它的表，不留本地副本。改平衡改 constants 一处即可（上一
  周期 Round 3 完成的收编，现已是常态）。
- constants 没有对应条目的少量细节（SEA_BOUNDS、HOTBAR、BUILDINGS
  的 name/desc/onWater、残血效率曲线、波内人数公式等）仍写死在各
  sim 文件里，归属见各文件头注释。
- Round 1 新系统：接线用的新数（ITEM_DROP / ITEM_USE）在 constants
  且是真相；inventory / expand 本轮**刻意自带数值**（DEFAULT_SLOTS、
  BOARD，见各自文件头注释），constants 的 BAG / BOARD 只是镜像，
  收编待后续轮（§7.6）。**内容表**（物品定义/请求模板/剧情条目）
  住各自模块，不进 constants。
- 全游戏只有一套网格（TILE = 64px、原点画布正中、有符号格坐标），
  **禁止再发明第二套网格**。

## 0. 多游戏目录

仓库根是**多游戏入口**，海上生存整包住在 `games/sea/`：

```
/                     仓库根：入口导航页 + 工程配置，不放游戏源码
├── index.html        多游戏入口页（父调度器专管，链到 ./games/sea/）
├── games/sea/        海上生存整包（index.html + src/**）
│   └── src/…         本文其余章节的相对路径全部指这里
├── scripts/          探针/冒烟/基准（gpt-probe），全部指向 games/sea
├── vite.config.ts    多入口构建：hub = 根 index.html，sea = games/sea/index.html
└── .agent_workspace/ 规格 / 架构 / 进度文档
```

- 以后新游戏加 `games/<id>/`，**不往根塞 `src/`**；每款游戏自带自己的
  `index.html` 与源码目录，互不 import。
- 构建是 vite 多入口（`rollupOptions.input` 里 hub + sea，`base: "./"`
  相对路径互链），产物 `dist/index.html` 是入口页、
  `dist/games/sea/index.html` 是游戏。
- `npm test`（games/sea/src/tests）、`npm run probe`、`npm run smoke`
  都指向 games/sea 的路径；加第二款游戏时它们不需要动。
- 存档键继续 `cww_sea_v1`（SAVE_KEY）。给存档加字段只能**增量可选**：
  save.ts 读侧对缺字段回退零值，老档必须能读，禁止换键冲掉玩家纪录。

## 1. 模块图

```
                     ┌───────────────────────┐
                     │  根 index.html 入口页  │  多游戏导航（父调度器专管）
                     └───────────┬───────────┘
                                 │ 链到 ./games/sea/
                     ┌───────────▼───────────┐
                     │ games/sea/src/main.ts │  DOM 查询、Engine/Session/Loop 接线（父管）
                     └───────────┬───────────┘
                                 │ 组装
        ┌────────────────┬───────┴────────┬─────────────────┐
        ▼                ▼                ▼                 ▼
┌───────────────┐ ┌─────────────┐ ┌──────────────┐ ┌───────────────┐
│ game/engine.ts │ │ game/loop.ts │ │  session.ts  │ │ data/save.ts  │
│ 画布/DPR/场景机 │ │  rAF 主循环  │ │ 一局聚合(父管)│ │ 存档(content) │
└───────┬───────┘ └──────┬──────┘ └──────┬───────┘ └───────────────┘
        │ scene 事件      │ dt,elapsed    │ 每帧调用 ↓（顺序固定，见 §3）
        ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│  sim/rules|economy|threats + entities/**：木筏格子、建造规则、      │
│  产消结算、风暴/海盗、小船 —— 纯数据 + 纯函数（本轮冻结，无人有     │
│  写权）；game/input.ts：键鼠采样 → 每帧输入快照                    │
├─────────────────────────────────────────────────────────────────┤
│  Round 1 新增（互相不 import，session 统一接线，契约见 §7）：       │
│  · data/catalog.ts + sim/inventory.ts（opus-items）物品表/道具袋   │
│  · sim/expand.ts（opus-play）岛民请求板 —— 本轮的新循环            │
│  · story/**（opus-story）日记/电台条目表 + 解锁调度                │
├─────────────────────────────────────────────────────────────────┤
│  world/**、fx/**、data/save.ts（opus-content）：海面/木筏/实体绘制、│
│  粒子、音频、存档                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ui/**、index.css（fable-sota）：标题/暂停/结算 overlay、HUD       │
│  （物品栏/委托板/台词的展示也归这里）                              │
├─────────────────────────────────────────────────────────────────┤
│  data/constants.ts（fable-arch）：全部共享数值的唯一真源            │
└─────────────────────────────────────────────────────────────────┘
```

依赖方向自上而下单向：sim 不 import 渲染层；渲染层只读 sim 暴露的
状态，不回写。新系统同理：inventory/expand/story 是纯数据模块，
不碰 DOM/Canvas，互相不 import（inventory 只吃 catalog，expand 只吃
rules，story 谁都不吃，全靠 session 传状态）。跨层通信只走两条路：
Loop 的 `tick(dt, elapsed)` 与 Engine 的 `onSceneChange`。

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
- 新系统不新增场景：物品吃喝、请求板交单、剧情条目展示全部发生在
  playing 内、非模态（见 GAME_SPEC §6–§8）。

## 3. 帧数据

`createLoop(tick)` 每帧回调 `tick(dt, elapsed)`：

| 量 | 含义 | 保证 |
| --- | --- | --- |
| `dt` | 本帧模拟时长（秒） | 已被 clamp 到 `LOOP.maxDtS`（0.033s），永不为负 |
| `elapsed` | 累计模拟时长（秒） | 历次 dt 之和；暂停/页面隐藏期间**不增长** |

一帧内的固定顺序（session.ts 按此接线，任何人不得私自调换）：

```
input.snapshot()              采样键鼠 → 只读快照（本帧内不再变）
  └▶ sim.update(dt, snap)     建造 → 产出 → 消耗 → 风暴 → 海盗 → 胜负
       └▶ updateBoard(dt)     请求板倒计时/贴单/过期（§7.3；交单走玩家操作，不在帧序里）
            └▶ updateMilestones(ctx) 里程碑达成判定（§7.7.2，Round 2；纯阈值零 rng）
              └▶ updateStory(ctx) 剧情解锁与排队（§7.4；immutable，吃 day/建筑计数/elapsed）
                 └▶ world/fx.draw()  清屏 → 海面 → 木筏 → 实体 → 粒子
                      └▶ ui.hud()    资源/道具袋/请求板/剧情条目/预警（最后画，最上层）
```

约束：

- **模拟只认 dt**：所有速率写成「单位/秒 × dt」，禁止按帧计数。
  昼夜相位、风暴/海盗/请求板计时一律基于模拟时间（暂停自动冻结）；
  剧情不自己计时，只读 ctx.elapsed。
- **渲染无副作用**：draw 不改 sim/inventory/board/story 状态；
  需要动画相位就用 `elapsed`。
- `scene !== "playing"` 或局已结束（`session.over`）时跳过整条 update
  链（含 board/story），但照常 draw（暂停画面是冻结的世界 + 遮罩，
  不是黑屏）。
- 长挂起（断点、切后台）恢复后单帧最多推进 0.033s，不会出现风暴
  一口气结算完、海盗瞬移贴脸、条子批量过期的隧穿。

## 4. 坐标与网格

- 逻辑画布 1280×720（`CANVAS`），engine.fit 按 DPR 放大 backing store，
  绘制代码不感知物理像素。整局**俯视**视角；实体配色要一眼分得开
  （可读性要求，world/craft.ts 遵循）。
- 木筏建造网格只有一套（数值在 constants.TILE，换算函数在
  sim/rules.ts）：格边长 `TILE = 64`px；格坐标是**有符号整数** (gx, gy)；
  `RAFT_ORIGIN`（画布正中 640, 360）是 (0, 0) 格的**中心**，
  `center = RAFT_ORIGIN + (gx, gy) × TILE`，换算走 `tileCenter` /
  `worldToTile`。没有 gridW/gridH——网格无边界，木筏靠四邻接向外扩张。
- 开局 3×3（|gx| ≤ 1 且 |gy| ≤ 1），中心 (0, 0) 是指挥中心 `core`
  （不可建造、不可拆除）。
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
   按 `SALVAGE.yields` 掷整数入库，同样受上限截断。捞取成功后另掷
   物品掉落（§7.2，物品走独立的 INVENTORY 上限）。
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
慢流，建材大头靠开船拾荒。请求板（§7.3）叠在这套收支之上：拿富余
建材换水/食，给「捞回来的料」第二个去处；交单永远不倒扣（过期只
丢奖励、清连击），不给资源盘放血。

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
累计捞取；最好成绩走 data/save.ts 落 localStorage。请求板战绩
（§7.3 的 `boardSummary`：done/expired/bestStreak）建议一并进结算
——增量展示，不改老字段。

## 6. Engine / Loop 契约要点

两模块接口冻结，本轮复核无行为改动。使用方须知：

- **Engine**：backing store 随 DPR/resize 自动重建；Canvas2D 上下文
  丢失自动恢复（每帧全量重绘前可用 `engine.contextLost` 跳过无效
  绘制）；`dispose()` 只在整体卸载时调用。
- **Loop**：`start()` 幂等；页面隐藏自动停帧、恢复可见自动续跑且
  隐藏时长不计入 elapsed；tick 抛错不停帧（错误正常上抛可上报）；
  `dispose()` 之后 `start()` 为 warn + no-op。
- 已知非缺陷备案：loop 以 `last === 0` 作「无上一帧」哨兵，理论上
  与「rAF 时间戳恰为 0」冲突，但 rAF 时基是 navigation start，首帧
  必然 > 0，实际不可达，故不为此加状态位。

## 7. 新系统接线契约（Round 1：物品 / 请求板 / 剧情）

三个新系统分属三个代理，**都没改既有 sim 文件**（rules/economy/
threats/entities/sim/index.ts 本轮无人有写权，已核实）。它们是自带
状态的纯数据模块，模块本体已落地，本节与实现逐项核对——**实现即
真相**。父调度器已把 bag/board/story 接进 session（直接按文件路径
import，没动 `sim/index.ts` 的桶口）；两条接线（掉落/吃喝）留给
Round 2，现状见 §7.5。

三个模块共同满足的纪律（与 sim 一致，复核过）：纯数据 + 纯函数，
不碰 DOM/Canvas/定时器；随机走传入的 `Rng`（同种子可复现）；只返回
事件/新状态，不切场景、不放音效；失败路径不抛异常、不产生扣一半的
中间态。

### 7.1 物品表 `games/sea/src/data/catalog.ts`（opus-items，已落地）

- `ItemId`：**14 种**物品的闭合字符串联合。前四个 id（wood/plastic/
  metal/rope）与 `ResourceId` 同名是**刻意的**（将来捞取入袋不用做
  id 映射），但袋里的数量与资源账本是两本账，**不相加**。
- `ItemSpec = { id; name; desc; stack; tags }`：name 是原创中文名、
  desc 一句话风味；`stack` 是**单格堆叠上限**（散料 99、成件杂物
  5–30、独件 1）；`tags: ItemTag[]`（salvage / material / food /
  drink / tool / medical / container / relic，多选），`TAG_NAMES`
  给 HUD 分栏用。
- `ITEMS: Record<ItemId, ItemSpec>`；`ITEM_IDS`（**书写顺序 = 全局
  排序真源**，列举/快照/原子操作都按它，新物品往末尾加）；
  `ItemBundle = Partial<Record<ItemId, number>>`（形状同 Cost）。
- 查询与守卫：`isItemId`（存档回读先过它）、`itemSpec / itemName /
  stackLimit / hasTag / itemsByTag / compareItems`。
- 不 import 任何模块，Node 可直测。

### 7.2 道具袋 `games/sea/src/sim/inventory.ts`（opus-items，已落地）

```ts
export type Inventory = { maxSlots: number; stacks: Map<ItemId, number> };
export const DEFAULT_SLOTS = 16;      // 袋子格数（constants.BAG 是它的镜像）
createInventory(init?: ItemBundle, opts?: { maxSlots?: number }): Inventory
// 写（全部原子；要「能装多少装多少」的溢出丢弃语义，显式传 { partial: true }）
addItem(inv, id, n?, opts?): AddResult      // { ok, added, overflow }
removeItem(inv, id, n?, opts?): RemoveResult // { ok, removed, missing }
addItems(inv, bundle): boolean               // 跨物品全或无
removeItems(inv, bundle): boolean            // 配方扣料：同 rules.pay 语义
// 读（确定性：一律按 ITEM_IDS 排序）
countOf / totalItems / has / hasAll / listItems(inv): ItemStack[]
usedSlots / freeSlots / isFull / capacityFor(inv, id)  // 容量判断唯一正确算法
// 存档
inventorySnapshot(inv): ItemBundle           // 键序稳定，JSON 可比对
restoreInventory(raw, opts?) / sanitizeBundle(raw)     // 脏数据洗净再进袋
```

- 容量是两道闸：单格上限 `ITEMS[id].stack` × 袋子 `maxSlots` 格，
  一种东西可占多格——判断「还装得下几件」只能用 `capacityFor`。
- **不动 Resources**：与资源的汇率放接线层（§7.5 的吃喝线 +
  constants.ITEM_USE）。

### 7.3 请求板 `games/sea/src/sim/expand.ts`（opus-play，已落地）——本轮的新循环

给富余建材第二个去处：岛民往板上贴条子收建材，兑水/食（偶尔搭
材料）。「现在缺水，先交哪张单」是新的短期决策。

```ts
export const BOARD = { slots: 3, firstS: 12, postGapS: 26, postMinS: 13,
  postDecayS: 1.5, ttlS: 75, ttlMinS: 42, ttlPerTier: 11, tierEveryS: 150,
  maxTier: 3, wantPerTier: 1, rewardPerTier: 0.35, streakAt: 3,
  streakMul: 1.5, diaryMax: 12, urgentAt: 0.3 };   // 真相在这里，constants.BOARD 是镜像
export const REQUEST_KINDS: readonly RequestKind[]; // 8 个模板（人物/文案全原创）
export type IslanderRequest = { id; kind; who; title; want: Cost; reward: Cost;
  ttl; ttlMax; doneNote; failNote; state: "open" | "done" | "expired" };
export type BoardState = { elapsed; open: IslanderRequest[]; postT; postGap;
  seq; done; expired; streak; bestStreak; diary: DiaryEntry[] };
export type BoardEvent =
  | { type: "request-posted" | "request-expired"; request }
  | { type: "request-done"; request; reward: Cost; got: Cost; streak: number }
  | { type: "diary"; entry: DiaryEntry };          // DiaryEntry = { at, who, text, tone }

createBoard(): BoardState / resetBoard(state)
updateBoard(state, res, dt, rng): BoardEvent[]   // 倒计时/过期/贴单；res 只读
complete(state, res, id): CompleteResult         // 交单：pay 原子扣，gainAll 入库
canComplete / requestById / missingFor / completeHint(reason)
urgencyOf / isUrgent / costLabel / readyRequests / boardSummary / recentDiary
```

- 节奏：首单 12s（早于首场风暴 50s，先给玩家一个主动目标）；贴单
  间隔 26s 起每张 −1.5s、下限 13s；板满 3 张时压住计时等空位。
  时限 75s 起、随难度档 −11s 到下限 42s；难度档 = ⌊板龄/150s⌋（≤3），
  每档需求 +1/种、奖励 ×(1 + 0.35×档)。
- **板上不出死单**：挑模板时按最坏需求筛「当场交得起」的，开局
  个位数库存也不会挂满交不起的条子。
- 交单原子（pay 先查后扣）；奖励 gainAll 入库、超上限截断（`got`
  报实收）；连交 `streakAt`（3）张奖励 ×1.5，过期清连击、**从不
  倒扣资源**。拒因 `unknown / cannot-afford`，`completeHint` 给 HUD
  文案，`missingFor` 报还差多少。
- 顺手产剧情素材：贴单/交单/过期都写 `diary`（≤12 条，
  `recentDiary(n)` 给 HUD）——这是与 §7.4 互补的第二路文本。
- 交单入口是玩家操作：HUD 画条子与「交」按钮（fable-sota），
  session 收到点击调 `complete`——所以它不在 §3 帧序里。

### 7.4 剧情 `games/sea/src/story/**`（opus-story，已落地）

两个文件：`story/beats.ts`（条目表，纯内容）+ `story/index.ts`
（解锁调度，纯函数）。

```ts
// beats.ts —— 10 条起步；id 是存档稳定键，改文案可以、改 id 不行
export type Beat = { id; title; body };
export type BeatKind = "journal" | "broadcast";  // 日记 8s / 电台 10s（holdS）
export type BeatRequirement = { day?; elapsed?; buildings?: Record<string, number> };
export type StoryBeat = Beat & { kind; require: BeatRequirement; holdS };
export const STORY_BEATS: readonly StoryBeat[];  // 表序 = 同帧多条时的排队序
export const BEAT_COUNT: number;

// index.ts —— 不可变状态：没变化时原样返回旧引用，UI 可用 !== 判重绘
export type StoryCtx = { day: number; buildings: Record<string, number>; elapsed: number };
export type StoryState = { unlocked: readonly string[]; queue: readonly string[];
  beat: Beat | null; shownAt: number };
createStory(): StoryState
updateStory(state, ctx): StoryState   // 没有 dt：时间全从 ctx.elapsed 来
currentBeat(state): Beat | null       // 当前该上屏的一条
unlockedBeats(state): StoryBeat[]     // 日志本回看，按解锁顺序
storyProgress(state)                  // { unlocked, total }，UI 显示 3/10
hasUnlocked(state, id) / beatById(id)
```

- 解锁条件是 day / elapsed / buildings 三项**与**关系的下限，全不写
  = 开局即解锁（首条 `salt-dawn` 就是，保证开局必有一条上屏）。
  `buildings` 是各类建筑的**数量**（键对 BuildingId，故意用宽松
  string 键——story 不 import sim，剧情层不绑死玩法层类型）。
- 一帧最多上屏一条；同帧满足多条按表序排队；当前条停留 `holdS`
  后自动收走再上下一条。已解锁的 id 永不重复入队。
- 展示归 fable-sota：画 `state.beat` 的 title + body，kind 区分
  日记/电台样式。非模态，不暂停不弹窗。

### 7.5 接线现状与剩余清单（session.ts 归父调度器）

已落地（Round 1，核对过 session.ts）：

- Session 字段：`bag: Inventory`（createInventory，DEFAULT_SLOTS）、
  `board: BoardState`（createBoard）、`story: StoryState`（createStory）。
- 帧序（§3）：updateEconomy / updateThreats 之后 →
  `updateBoard(board, res, dt, rng)` → `story = updateStory(story,
  { day, buildings 计数, elapsed })`。over 时整条链跳过
  （board/story 不调用即冻结）。
- 捞取入袋：tryScoop 成功后 `addItem(bag, haul.kind, n,
  { partial: true })`——捞到的建材**同步映射**进袋（同名 id 的设计
  用途），溢出丢弃。
- 交单：键位 Q/E 选单交单走 `complete(board, res, id)`；HUD 显示
  日记卡（story.beat 的 title/body）与当前条子（quest）。

留给 Round 2 的接线（另两条支线——海面外观与里程碑——见 §7.7）：

- **掉落线**（数在 constants.ITEM_DROP，接线即真相）：捞取成功后
  掷 `rng() < chance`，或连续 `pityScoops` 次未中时强制命中；命中
  从目录物（排除与资源同名的四种散料）抽一件
  `addItem(bag, id, 1, { partial: true })` 并清零保底计数。
  实现放 inventory 侧、session 只调用，正式签名：

  ```ts
  export type ItemPity = { misses: number };
  export function createItemPity(): ItemPity;
  export function rollItemDrop(rng: Rng, pity: ItemPity, look?: string): ItemId | null;
  ```

  约束：负责推进/清零 `pity.misses`；每次调用的 rng 抽取次数**恒定**
  （命中与否都一样，建议恒 2 次：命中判定 + 选品），同种子同序列；
  可选参数 `look` 是这次捞的外观 id（§7.7.1），实现可用它加权偏向
  （穿油布外观的更容易掉油布），但不许因此改变抽取次数。池子权重是
  opus-items 的设计空间（catalog 加字段或 inventory 本地表均可）。
  session 持 `pity`，在 tryScoop 用 session.rng 掷——探针磁带不含
  捞取动作，基线哈希不受影响。
- **吃喝线**（汇率在 constants.ITEM_USE）：HUD 点袋子，id 在表里
  → `removeItem(bag, id, 1)` 成功后按表 `gain(res, …)` 入库。

硬约束（Round 2 起生效）：`snapshot()` **冻结**——不加字段不改语义，
探针哈希须保持 `728b59b5`；新系统状态走 HUD 与 `result()` 结算展示，
不进 snapshot。`result()` / save.ts 要记生涯交单数、解锁数时只加
可选字段，读侧缺省回退 0（save.ts 的 num() 已是这个语义）。

### 7.6 constants 第三段现状（fable-arch）

| 表 | 类别 | 说明 |
| --- | --- | --- |
| `ITEM_DROP` | 接线时消费 | 捞取附带掉物品的 chance / pityScoops，接线即真相 |
| `ITEM_USE` | 接线时消费 | 咸海带/鱼干/净水囊 → 资源的兑换率 |
| `INVENTORY` | 被运行时消费 | HUD 道具袋条一屏小格数（hudSlots，ui/hud.ts 吃） |
| `BAG` | 文档镜像 | = inventory 的 DEFAULT_SLOTS（16 格） |
| `BOARD` | 文档镜像 | = expand 的 BOARD 全表（逐键同名同值） |
| `JUNK_LOOKS` | Round 2 真相 | 漂浮物穿目录外观的概率（§7.7.1，第四段） |
| `MILESTONES` | Round 2 真相 | 四条里程碑的判定阈值 + id/顺序（§7.7.2，第四段） |

inventory / expand 本轮**刻意自带数值**（见各自文件头注释「等定型
了再搬过去」）；收编（原件改为 import constants）待后续轮、归各
属主，收编前改平衡改原件、同步镜像。ROUND2_BRIEF 第 4 条说的
「expand.ts 改读 REQUESTS」即指收编到这里的 `BOARD` 镜像（表名以
本文件为准），且收编后必须保持「开局 5 秒内不贴单、不抽 rng」
（BOARD.firstS = 12 本来就满足）。内容表（物品/模板/条目）住各自
模块不进 constants。既有两段（CANVAS/LOOP/…/SKIFF）本轮一个数
没动，探针基线不受影响。

### 7.7 Round 2 支线契约（海面外观 / 里程碑）

与 §7.5 的掉落线/吃喝线并列的另两条支线，数值新表在 constants
第四段（JUNK_LOOKS / MILESTONES，出生即唯一真源、直接 import）。
共同原则：**不开新经济、不开新场景、不扩 snapshot**——都是在
Round 1 已有的管道上开支线。

#### 7.7.1 海面刷目录物（opus-content：world/junk.ts + world/items.ts）

- 用**已有**的 `Junk.look` 字段：新刷漂浮物按 `JUNK_LOOKS.chance`
  （35%）穿一件目录物外观——油布/空油桶/咸海带等，items.ts 已登记
  14 件的画法，`spawnJunk` 的 `opts.look` 通道也是现成的。
  look → 建材 kind 的映射是内容，住 junk.ts / items.ts（例：油布→
  plastic、空油桶→metal、咸海带→wood；一件 look 只配一种 kind，
  同种子可复现）。
- **不另开掉落经济**：`Junk.kind` 仍限四种建材；捞取入库仍按 kind
  走 `gain()`、产出仍按 `SALVAGE.yields` 掷——look 不改产出、不加
  新 kind、不触发额外入账。玩家看见的是「一只空油桶」，捞到手的
  是金属。
- 换装抽取走 `JunkField` 自带的 LCG（同种子同海面），**不碰
  session.rng**——威胁/请求板的随机序列纹丝不动；探针磁带又不含
  捞取动作，基线双保险。
- `JunkHaul.look` 已把外观 id 带回 session：飘字/水花/图鉴按 look
  表现（「捞到 空油桶」而不是「捞到 金属」），§7.5 掉落线的
  `rollItemDrop(rng, pity, look)` 也拿它做偏向。

#### 7.7.2 里程碑旁路（opus-play：sim/expand.ts）

判定阈值在 `constants.MILESTONES`（四条：首座净水机 / 撑过首场
风暴 / 木筏 ≥ 12 格 / 活到第 3 天）；expand.ts 长出一条与请求板
并列的旁路，**要有可测状态，不是只写文案**：

```ts
export type MilestoneCtx = {
  purifiers: number;       // countBuilding(raft, "purifier")
  stormsSurvived: number;  // threats.storm.count（已结算场数；局未结束即算撑过）
  tiles: number;           // raft.cells.size
  day: number;             // session.day
};
export type MilestoneState = { done: MilestoneId[] };  // 按达成顺序，可序列化可断言
export type MilestoneEvent = { type: "milestone"; id: MilestoneId;
                               title: string; note: string };
export function createMilestones(): MilestoneState;
/** 逐条查 MILESTONES：ctx[stat] >= goal 且未达成 → 记入 done 并返回事件。
 *  纯阈值、零 rng；同帧多条达成按 MILESTONE_IDS 顺序全部返回。 */
export function updateMilestones(state: MilestoneState, ctx: MilestoneCtx): MilestoneEvent[];
```

- 每条一生一次（done 去重保序）；title/note 文案住 expand.ts；
  若配奖励，`updateMilestones` **不动账本**——session 拿事件走
  gain / addItem，函数保持纯。
- 可测：单测/探针可直接断言 `state.done`（如 headless 铺到 12 格后
  done 含 `"raft-12"`）。顺手可把达成写进 board.diary
  （tone: "good"），请求板日记免费获得展示。
- 接线（父调度器）：帧序排在 updateBoard 之后（§3）；
  `milestones.done.length` 可进 `result()` 增量字段；庆祝表现归
  fable-sota——HUD 已有 quest 胶囊 / questDone 庆祝 / toast 管道，
  不传新字段则画面与现状一致。
- 探针安全（三重）：判定零 rng；探针窗口内（第 1 天、至多 11 格、
  零净水机、零风暴）一条不触发；里程碑不进 snapshot()。

## 8. 未决事项（交给后续轮）

- **四条支线待 Round 2 接完**：ITEM_DROP 掉落线与 ITEM_USE 吃喝线
  （§7.5）、海面外观线与里程碑线（§7.7）；接完 GAME_SPEC §9 的
  新验收条目才可全绿。
- BAG / BOARD 的收编（inventory / expand 原件改为 import constants）
  待后续轮，归各属主；收编前 constants 里是镜像。
- 道具袋与请求板暂不相通：条子只收资源账本里的建材，「收袋装物品
  的条子」和工具类物品（扳手/鱼钩/急救包）的机械效果是后续议题。
- 局中进度存档（库存/格子/威胁计时/袋子/板面）仍未做；save.ts 目前
  只落生涯纪录。袋子侧已备好 `inventorySnapshot` / `restoreInventory`，
  入档时按 §0 的增量可选字段规矩来。
- `refund` / `scrapValue` 已在 sim 备好但没接进玩家操作（无拆迁按钮）。
- 人口 = 3 + 每座非地基建筑 1（economy CREW），是被动增长；请求板的
  `who` 只是代称，不是真岛民实体——岛民个体化仍是后续议题。
- 物品吃喝 / 交单的具体键位与点击区归 fable-sota 定，本文只约束
  「局内、非模态」；触屏适配同理。
- 音频节点图、HUD 具体布局分别归 opus-content / fable-sota，不在本文约束。
