# 架构 —《疯狂水世界》海上末日生存原型

fable-arch 维护。本文是各子代理之间的**接口契约**：模块归属见
`OWNERSHIP.md`，玩法定义见 `GAME_SPEC.md`。本轮（扩玩法 Round 1）
新增两块：多游戏目录契约（§0）与物品/委托/剧情三个新系统的接线
契约（§7）——新系统的实现代理照 §7 的类型名/函数签名写，父调度器
照 §7.5 接线，互相不用等。

**数值的真相在哪（现状）**：

- `games/sea/src/data/constants.ts` 是**唯一真源**：sim（rules/
  economy/threats）与 entities（skiff/pirate）已全部改为直接 import
  它的表，不留本地副本。改平衡改 constants 一处即可（上一周期
  Round 3 完成的收编，现已是常态）。
- constants 没有对应条目的少量细节（SEA_BOUNDS、HOTBAR、BUILDINGS
  的 name/desc/onWater、残血效率曲线、波内人数公式等）仍写死在各
  sim 文件里，归属见各文件头注释。
- Round 1 新系统的数（INVENTORY / ITEM_DROP / REQUESTS / STORY）
  出生即在 constants（§7.6）；**内容表**（物品定义/委托生成/台词）
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
│  · data/catalog.ts + sim/inventory.ts（opus-items）物品目录/物品栏 │
│  · sim/expand.ts（opus-play）岛民委托板 —— 本轮的新循环            │
│  · story/**（opus-story）日记/闲话触发器 + 台词表                  │
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
不碰 DOM/Canvas，不互相 import（谁都不 import 谁，全靠 session 传
状态）。跨层通信只走两条路：Loop 的 `tick(dt, elapsed)` 与 Engine 的
`onSceneChange`。

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
- 新系统不新增场景：物品使用、委托交付、剧情展示全部发生在 playing
  内、非模态（见 GAME_SPEC §6–§8）。

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
       └▶ updateExpand(dt)    委托板发单/过期（§7.3；交付走玩家操作，不在帧序里）
            └▶ updateStory(dt) 剧情触发（§7.4；吃 day/建筑/本帧线索，只追加日志）
                 └▶ world/fx.draw()  清屏 → 海面 → 木筏 → 实体 → 粒子
                      └▶ ui.hud()    资源/物品栏/委托板/台词/预警（最后画，最上层）
```

约束：

- **模拟只认 dt**：所有速率写成「单位/秒 × dt」，禁止按帧计数。
  昼夜相位、风暴/海盗/委托/剧情计时一律基于模拟时间（暂停自动冻结）。
- **渲染无副作用**：draw 不改 sim/inventory/expand/story 状态；
  需要动画相位就用 `elapsed`。
- `scene !== "playing"` 或局已结束（`session.over`）时跳过整条 update
  链（含 expand/story），但照常 draw（暂停画面是冻结的世界 + 遮罩，
  不是黑屏）。
- 长挂起（断点、切后台）恢复后单帧最多推进 0.033s，不会出现风暴
  一口气结算完、海盗瞬移贴脸、委托批量过期的隧穿。

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
慢流，建材大头靠开船拾荒。委托板（§7.3）叠在这套收支之上，
**净收益必须为正**——它给资源盘回血，不给资源盘放血。

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
累计捞取；最好成绩走 data/save.ts 落 localStorage。委托完成数（§7.3
的 `done`）建议一并进结算——增量展示，不改老字段。

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

## 7. 新系统接线契约（Round 1：物品 / 委托 / 剧情）

三个新系统分属三个代理，**都不改既有 sim 文件**（rules/economy/
threats/entities/sim/index.ts 本轮无人有写权）；它们是自带状态的纯
数据模块，由父调度器在 session.ts 里按 §3 的帧序接线（直接按文件
路径 import，不动 `sim/index.ts` 的桶口）。下面的类型名/函数签名是
**正式接口**，实现代理不要改名——改名要先改本文再动代码。

通用纪律（全部继承自 sim）：纯数据 + 纯函数，不碰 DOM/Canvas/
localStorage；随机一律走传入的 `Rng`（sim/rules.ts 导出的类型），
禁止 `Math.random`；速率全部「单位/秒 × dt」；资源变动只走
rules 的 `gain` / `pay`，物品变动只走 inventory 的
`addItem` / `takeItems`，保持原子语义。

### 7.1 物品目录 `games/sea/src/data/catalog.ts`（opus-items）

```ts
export type ItemId = /* 闭合的字符串字面量联合，禁止裸 string */;
export type ItemKind = "consumable" | "material" | "trinket";
export type ItemDef = {
  id: ItemId;
  name: string;   // 可辨认中文名（≤ 6 字为宜），原创，禁官方 IP
  desc: string;   // 一句话用途/风味
  kind: ItemKind;
  /** 使用后立刻入库的资源（consumable 必填非空；其余省略） */
  effect?: Partial<Record<ResourceId, number>>;
  /** 捞取掉落权重（0 = 不从海里出，只能从委托奖励出） */
  dropWeight: number;
};
export const ITEMS: Record<ItemId, ItemDef>;
export const ITEM_IDS: readonly ItemId[];   // 稳定顺序，HUD/存档按它排
```

- 依赖方向：catalog 只 import `data/constants`（要 `ResourceId` 类型），
  不 import sim/story/ui。
- 至少 8 种、三类各有代表（见 GAME_SPEC §6 的验收）。

### 7.2 物品栏 `games/sea/src/sim/inventory.ts`（opus-items）

```ts
export type Inventory = Partial<Record<ItemId, number>>; // 纯数据，可 JSON 序列化
export type ItemPity = { misses: number };               // 掉落保底计数

export function createInventory(): Inventory;
export function createItemPity(): ItemPity;
export function countItem(inv: Inventory, id: ItemId): number;
/** 入库，返回实际入库数（受 INVENTORY.maxPerItem 截断，溢出丢弃） */
export function addItem(inv: Inventory, id: ItemId, n?: number): number;
/** 原子扣取：want 里每一项都够才扣，任何一项不够整单拒绝、分文不动 */
export function takeItems(inv: Inventory, want: Partial<Record<ItemId, number>>): boolean;
/** 用一件：扣 1 并按 ITEMS[id].effect 走 rules.gain() 入资源；无货或无 effect 返回 false */
export function useItem(inv: Inventory, res: Resources, id: ItemId): boolean;
/** 非零持有列表，按 ITEM_IDS 顺序，HUD 直接遍历 */
export function listInventory(inv: Inventory): { id: ItemId; count: number }[];
/** 捞取附带掉落：命中率 ITEM_DROP.chance，连续 ITEM_DROP.pityScoops 次
 *  未命中则必出；按 dropWeight 加权抽 id；负责推进/清零 pity.misses */
export function rollItemDrop(rng: Rng, pity: ItemPity): ItemId | null;
```

- 掉落的接线点在 session.tryScoop()：**捞取成功后**由 session 调
  `rollItemDrop`（用 session.rng），命中就 `addItem`——junk.ts /
  world 层完全不用动。
- 物品与六种资源分开存，互不占上限；`useItem` 的资源入库同样受
  `RESOURCE_CAP` 截断（gain 自带）。

### 7.3 委托板 `games/sea/src/sim/expand.ts`（opus-play）——本轮的新循环

```ts
export type RequestId = string;   // 每单唯一（如 `req-3`，用 counter 生成）
export type RequestWants = {
  items?: Partial<Record<ItemId, number>>;
  res?: Cost;                     // sim/rules.ts 的 Cost
};
export type IslanderRequest = {
  id: RequestId;
  asker: string;                  // 岛民代称，自拟，禁官方名
  text: string;                   // 一句话委托文案
  wants: RequestWants;            // 交付内容（items/res 至少一样非空）
  reward: RequestWants;           // 完成奖励（净收益为正）
  ageS: number;                   // 已挂板秒数，updateExpand 推进；
                                  // 剩余时间 = REQUESTS.expireS − ageS
};
export type ExpandState = {
  board: IslanderRequest[];       // 当前挂着的单（≤ REQUESTS.maxOpen）
  nextT: number;                  // 距下一单的秒数（板满时冻结在 0）
  counter: number;                // 历史发单总数（生成 RequestId 用）
  done: number;                   // 已完成数（HUD/结算/剧情线索用）
  expired: number;                // 已过期数
};
export type ExpandEvent =
  | { type: "request-posted"; request: IslanderRequest }
  | { type: "request-done"; request: IslanderRequest }
  | { type: "request-expired"; request: IslanderRequest };
export type ExpandCtx = { raft: Raft; res: Resources; inv: Inventory; day: number; rng: Rng };

export function createExpand(): ExpandState;   // nextT = REQUESTS.firstS
/** 发单/推龄/过期；只产生 posted/expired 事件，交付不在这里发生 */
export function updateExpand(state: ExpandState, ctx: ExpandCtx, dt: number): ExpandEvent[];
/** 玩家交付：wants 的 res 与 items 全够才扣（res 走 pay、items 走
 *  takeItems，两边先各自校验再一起扣，不存在扣一半），奖励走
 *  gain/addItem 入库（受上限截断），单子出板、done += 1，返回
 *  request-done 事件；id 不在板上或付不起返回 null 且分文不动 */
export function fulfillRequest(state: ExpandState, res: Resources, inv: Inventory, id: RequestId): ExpandEvent | null;
```

- 节奏数在 constants.REQUESTS（§7.6）；**单子内容生成表**（要什么、
  给什么、随天数怎么涨）写在 expand.ts 内部，是 opus-play 的设计
  空间，约束只有三条：单子**当下可完成**（别要玩家还没见过的东西
  凑不齐的量）、奖励净收益为正、全随机走 ctx.rng。
- 交付入口是玩家操作：HUD 提供交付按钮/点击区（fable-sota），
  session 收到点击后调 `fulfillRequest`——所以它不在 §3 帧序里。

### 7.4 剧情 `games/sea/src/story/**`（opus-story）

两个文件：`story/index.ts`（状态与触发逻辑）+ `story/lines.ts`
（台词表，纯内容）。

```ts
// story/index.ts
export type StoryCue =            // session 从事件机械映射，story 决定编辑逻辑
  | "storm-warn" | "storm-strike" | "wave" | "pirate-killed" | "core-hit"
  | "item-found" | "item-used" | "request-posted" | "request-done"
  | "request-expired" | "salvage" | "build";
export type StoryLine = { id: string; speaker: string; text: string };
export type StoryCtx = {
  day: number;                        // session.day
  built: number;                      // session.built（累计建造数）
  buildings: ReadonlySet<BuildingId>; // 场上现存建筑种类
  cues: readonly StoryCue[];          // 本帧线索
};
export type StoryState = {
  seen: Set<string>;    // 已触发的台词 id（一生一次）
  log: StoryLine[];     // 日志（≤ STORY.logMax，超出丢最旧）
  cooldownT: number;    // 节流计时（STORY.minGapS）
};

export function createStory(): StoryState;
/** 返回本帧新触发的台词（0–1 条，受 minGapS 节流），已顺手进 log */
export function updateStory(state: StoryState, ctx: StoryCtx, dt: number): StoryLine[];
```

- 触发器至少三类：天数达到 N、首次盖出某建筑（查 ctx.buildings）、
  cue 线索；「首次」语义由 seen 保证，session 只做机械映射不做去重。
- story 不 import sim（依赖方向：只吃 ctx 快照）；可 import
  `data/constants` 与 `data/catalog`（台词里报物品名用）。
- 展示契约：session 持有「最新一条 + 已显示秒数」，交给 HUD 画
  toast/字幕（形式归 fable-sota；STORY.toastS 是停留秒数）。
  非模态，不暂停不弹窗。

### 7.5 接线清单（父调度器在 session.ts 落地）

- Session 新增字段（建议名，父调度器可微调）：`inv: Inventory`、
  `pity: ItemPity`、`expand: ExpandState`、`story: StoryState`，
  构造时用各自 create 函数初始化。
- update 内顺序（§3）：`updateEconomy` / `updateThreats` 之后 →
  `updateExpand(this.expand, ctx, dt)` → 把 ThreatEvent/ExpandEvent/
  捞取与建造结果机械映射成 `StoryCue[]` → `updateStory`。
  `this.over` 为真时整条链照旧跳过。
- 事件 → cue 映射表（机械，一对一）：`storm-warn → "storm-warn"`、
  `storm-strike → "storm-strike"`、`wave → "wave"`、
  `pirate-killed → "pirate-killed"`、`core-hit → "core-hit"`、
  `request-* → "request-*"`；捞取成功 → `"salvage"`（掉物品再补
  `"item-found"`）；建造成功 → `"build"`；`useItem` 成功 →
  `"item-used"`。
- `snapshot()`（探针兼容）**只加不改**：建议加 `items`（物品总件数）、
  `requestsOpen`、`requestsDone`；老字段名与语义都不许动。
- `result()` / save.ts 如要记生涯委托数、物品数：同样只加可选字段，
  读侧缺省回退 0（save.ts 的 num() 已是这个语义）。
- sfx 建议（opus-content 自选）：request-posted 用 warn 系、
  request-done 用 scoop 系，不新增强制接口。

### 7.6 constants 新增段（fable-arch，已落地）

`data/constants.ts` 新开第三段「Round 1 新系统」，出生即唯一真源，
新模块直接 import、不留本地副本：

| 表 | 消费方 | 内容 |
| --- | --- | --- |
| `INVENTORY` | sim/inventory.ts | maxPerItem（单种上限）、hudSlots |
| `ITEM_DROP` | sim/inventory.ts | chance（掉率）、pityScoops（保底） |
| `REQUESTS` | sim/expand.ts | firstS / intervalS / maxOpen / expireS |
| `STORY` | story/index.ts | toastS / minGapS / logMax |

内容表不进 constants：物品定义在 catalog.ts、委托生成表在
expand.ts、台词在 story/lines.ts。既有段（CANVAS/LOOP/…/SKIFF）
本轮一个数没动，探针基线不受影响。

## 8. 未决事项（交给后续轮）

- 局中进度存档（库存/格子/威胁计时/物品/委托板）仍未做；save.ts
  目前只落生涯纪录。新系统状态若入档，只能按 §0 的增量可选字段规矩来。
- `refund` / `scrapValue` 已在 sim 备好但没接进玩家操作（无拆迁按钮）。
- 人口 = 3 + 每座非地基建筑 1（economy CREW），是被动增长；委托板的
  `asker` 只是代称，不是真岛民实体——岛民个体化仍是后续议题。
- 物品使用 / 委托交付的具体键位与点击区归 fable-sota 定，本文只约束
  「局内、非模态」；触屏适配同理。
- 音频节点图、HUD 具体布局分别归 opus-content / fable-sota，不在本文约束。
