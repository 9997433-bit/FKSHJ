# AUDIT — Round 2 重审：把新层折进同一套海之前，先把账算清

MODEL_SLUG: claude-fable-5-thinking-xhigh
（Round 2 fable-audit · 本机 · 只审不改。审计基线 = `agent/sea-sota-expand`
@ `2218e76`（Round 1 已落地），**外加**审计进行中观察到的并行 WIP 工作区快照，
两者在文中分开标注。Round 1 审计原文见 git 历史 `2218e76:.agent_workspace/AUDIT.md`。）

---

## 〇、现场情况：基线不是静止的

审计期间（08:06–08:14）工作区被并行代理持续写入，必须先把「已落地」和
「在飞」分开，否则 P0 会开错药：

- **已落地（HEAD `2218e76`）**：session 接线了道具袋 / 剧情卡 / 请求板
  （`3c6f7ff`），探针 hash `728b59b5` 本机复核未漂移，旧 13 测全绿。
- **WIP（未提交，审计时仍在变）**：
  - `data/catalog.ts`：+`dropWeight` 权重轴、+`pickDropByRoll` 加权抽签、
    +2 新条目 `netScrap`/`glassFloat`（共 16 件）；
  - `sim/inventory.ts`：+`ItemPity` 保底计数、+`rollItemDrop`（读
    `constants.ITEM_DROP`，固定每次消耗 2 次 rng）；
  - `sim/expand.ts`：BOARD 节奏数折进 `constants.REQUESTS`（35/40/3/90），
    +`PROBE_QUIET_S`/`quietThroughProbe` 守护，+`MILESTONES` 目标链
    （4 条：首台净水机 / 撑过风暴 / 木筏 12 格 / 活到第 3 天）；
  - `story/beats.ts`：10 条 → 14 条（+`twelve-planks`/`still-drip`/
    `after-storm`/`third-morning`）；
  - 3 个未跟踪测试文件（expand / inventory / story）。
- **当前门禁是红的**：`npm test` = 17 测 **16 过 1 挂**。挂的是新
  `story.test.ts`「story unlock order」——期望表还是 10 条的旧序，
  `beats.ts` 已经 14 条。旧 13 测仍绿，但「全绿才算收口」这条线现在没过。
- `session.ts`（08:06 后未再动）**尚未接**任何 WIP 新面：没有调
  `rollItemDrop`、没有调 `updateMilestones`、没有 `noteStorm`、没有任何
  `spawnJunk({ look })` 调用点。

---

## 一、袋 vs Resources：怎么折

### 1.1 现状判定：同名双账本，已经开始说谎

HEAD 的 `session.tryScoop()`（session.ts 239–256）对每次捞取做了**两笔记账**：
`gain(res, haul.kind, amount)` 入资源账本，**同时**
`addItem(bag, haul.kind, amount)` 入袋。而 `haul.kind` 永远是四种建材
（`Junk.kind` 只认 `JunkKind`），`isItemId()` 对这四个 id 恒真——所以：

- 袋里只可能出现 wood/plastic/metal/rope 四行，是 `Resources` 的**影子副本**；
- 花钱的路（建造 `pay`、交单 `pay`、维修）只扣 `res` 不扣袋——开局捞十把后
  袋里写着「木板 ×40」而仓库剩 6，两个同名数字已经对不上；
- 袋是只写不读：全工程没有第二处读 `session.bag`，HUD 也没有物品栏字段
  （`HudInfo` 只有 storyBeat/quest/lootToast）。

这正是 Round 1 审计红线「禁止并行第二套经济」担心的形态：现在没人看见所以
没炸，Round 2 简报第 5 条一旦把「可选物品栏条」画出来，玩家看到的就是一栏
假数。**双写必须在 HUD 显示袋子之前拆掉。**

### 1.2 折法（裁决）

1. **`Resources` 仍是唯一可花账本**：建造、请求板、产消、维修，一律
   `pay`/`gain`，一行不动。
2. **四种建材停止入袋**：删掉 `tryScoop` 里对建材的 `addItem` 双写。
   `markSeen`/`seenThisRun`（图鉴）与 lootToast 和袋无关，原样保留。
3. **袋 = 杂货位，入口只有 `rollItemDrop`**：只装 `dropWeight > 0` 的
   12 件（tarp/barrel/kelp/…/glassFloat）。WIP catalog 里那句注释
   「四种建材……入 `Resources` 同时进袋」是**错误方向**，接线时要一并纠正。
4. **袋要有出口，最低限三件补给品**：kelp/driedFish → food、
   freshWater → water，由 session 层做「先 `removeItem(bag)`、成了再
   `gain(res)`」的两步序（两个操作各自原子，先出袋后入库，永不倒扣）。
   **不改 `pay`/`gain` 签名**，汇率进 constants 新表（如 `ITEM_USE`），
   不散在 session 里。工具/珍品（hook/wrench/flare/compass/medkit/
   glassFloat/netScrap 的效果）本轮只作图鉴 + 结算展示，效果留 P1。
   没有出口的袋子就是死胡同经济，等于换个姿势违反「折回 Resources 轴」。
5. **常数真源冲突要销账**：`constants.INVENTORY.maxPerItem = 20`（按种类
   上限哲学）与 `inventory.ts` 的格子×堆叠模型（`DEFAULT_SLOTS = 16` +
   catalog 逐件 `stack`）是两套互斥的容量论，实现从未读过 maxPerItem。
   裁决：以实现为准，`INVENTORY.maxPerItem` 删除或改注释标废，
   `hudSlots` 只管展示。别留两份「真源」各说各话。

---

## 二、海面 look：不算闭环

**判定：不算。** `look` 是一条铺设完整但从未通水的管道：

- 管道侧全齐：`Junk.look` / `SpawnOpts.look` / `junkArtId()` / `takeJunk`
  返回 `look` / `drawJunk` 对任意登记 id 照画、未登记兜底「未知包裹」，
  高亮环缺口还会露出该物 tint（junk.ts 436–443）；
- 调用侧为零：全库 `spawnJunk` 没有任何一处传 `look`。海面从开服到现在
  只刷四种建材剪影，14（现 16）件目录物有 10（12）件**永远不可见**，
  存档图鉴 `seen[]` 的上限被钉死在 4 条。

**WIP 的 `rollItemDrop` 单独落地也闭不了环。** 它注释里写的接线点是
「`tryScoop` 捞取成功之后掷」——那是「捞木板时凭空从袋里多出一把海带」，
补上了简报第 2 条（进袋），但不满足第 1 条「**用已有 look 字段让玩家看见**
油布/桶/海带」。品类的快感在「远远看见一只桶、开过去捞它」，不在结算飘字。

**闭环的验收标准**（缺一环都不算）：
海面出现带 `look` 的剪影 → 高亮环露它的颜色 → 捞取 → lootToast 报条目名
→ 入袋 → `seen[]` 图鉴点亮。

**落法（P0-3）**：把掉签**前置到 `spawnJunk`**——刷新时按
`ITEM_DROP.chance` 掷「这件带不带货」，带货就 `look = 抽中条目`，保底
（pity）挂在 `JunkField` 上；`rollItemDrop(rng, pity)` 本身是 rng 源无关的
纯函数，包一层 field LCG 适配器即可直接复用。捞取时 session 只需：
`haul.look` 是杂货 id → `addItem(bag, look)` + lootToast + `markSeen`。

**指纹安全性（已核）**：探针磁带（scripts/probe-session.ts）只有移动 + 3 次
建造、**无捞取**；`snapshot()` 无任何 junk 字段；collector 产出走
`PRODUCTION` 表不吃 junk。所以 spawn 期多消耗 field LCG 只挪漂浮物落点，
**不进指纹**——`728b59b5` 理论不动，但 P0 要求跑一次探针实测锁死，
不许凭推理签收。反过来若坚持捞取时用 `session.rng` 掷，虽然探针窗口内
同样安全（磁带不捞），但「看见」这一环就永远缺——**结论：用 spawn 期方案**。

小尾巴：WIP 新条目 `netScrap`/`glassFloat` 在 `world/items.ts` **没有登记
外观**，上了海面会全画成「未知包裹」。P0 内补两张登记
（`registerItemArt` 入口现成），否则「新条目」首秀就是兜底皮。

---

## 三、里程碑：sim 层已就位，缺的全是接线和信号

WIP 的 `MILESTONES`（expand.ts 215–252）质量过关：4 条对齐简报、无 rng、
`best` 单调不回退、幂等（`done` 里有就跳过）、奖励走 `gainAll` 不会失败、
事件出口 `milestone-done` 照 `ThreatEvent` 模式——「要有可测状态，不要只写
文案」这条达标。**但它现在是一座没有引线的炮**，缺五样：

1. **session 接线**：没人调 `updateMilestones`。需要每帧（或降频）用现成
   信号现凑 `MilestoneFacts`：`countBuilding(raft, "purifier")`、
   `raft.cells.size`、`this.day`——三样 session 手边全有。
2. **「撑过风暴」的事实源**：`threats.ts` 没有 storm-end 事件，只有
   `storm-warn`/`storm-strike`（每场一次，threats.ts 178）。判定语义要
   钉死：**收到 `storm-strike` 且本帧未 `over` = 撑过一场**，session 在
   事件分发循环里调 `noteStorm(board)` 即可，`expand.ts` 已留好这个口。
   顺带记一笔：story 的 `after-storm` beat 用 `elapsed: 60` 冒充
   「风后」（首暴 54s 落下所以大致成立），是定时器硬编码的擦边球——
   里程碑绝不能抄这个近路，story 侧 P1 也该改挂真实事件。
3. **HUD 展示位**：`HudInfo` 没有里程碑字段。最低限复用现有 quest 胶囊
   ——板上没条子时挂 `nextMilestone().hint`，达成瞬间把 progress 换成
   「完成！」传 1–2 秒（hud.ts 注释本来就预留了这个用法），庆祝可复用
   storyBeat 卡发 `milestone.note`。不新开 HUD 面。
4. **结算面**：`result()`/menus 不知道 `milestoneSummary()` 的存在。
   结算页至少报一行「里程碑 n/4」，否则长目标做完了玩家也不知道。
5. **测试与探针守护**：
   - 4 条里程碑在探针 5s 窗口内都不可能达成（tiles 起 9、磁带只加 2 格
     = 11 < 12；day = 1 < 3；purifier = 0；storm 首暴 50s 后）——安全,
     但要有单测锁「探针磁带 300 tick 内零 `milestone-done`」，别靠默契；
   - `updateMilestones` 不吃 dt 不抽 rng，挂在 `updateBoard` 之后接线
     不会碰贴单的 rng 序列（`quietThroughProbe` 守护已在 WIP 里，好评）；
   - milestone 奖励会改 `res`——这就是它必须被上面那条「窗口内零达成」
     测试锁住的原因，否则指纹会被 `gainAll` 悄悄改掉。

---

## 四、P0 清单（Round 2 收口顺序）

1. **把门禁修绿**：`story.test.ts` 期望表与 14 条 `beats.ts` 对齐（表序
   验证连同 4 条新 beat 一起锁）。规矩：**测试红着，后面一切不签收**。
   现状 16/17。
2. **袋的折法落地**（§一）：删 `tryScoop` 四建材入袋双写；`rollItemDrop`
   出的杂货是袋的唯一入口；三件补给品（kelp/driedFish/freshWater）给
   使用出口（session 层先出袋后 `gain`）；`INVENTORY.maxPerItem` 销账。
   验收：袋里永远不出现四建材行；用一件海带 → food 数字涨、袋里少一件、
   两边永不双花。
3. **look 闭环**（§二）：掉签前置 `spawnJunk`（field LCG + pity 挂
   field），带货漂浮物以条目剪影上屏；捞取 → lootToast 报条目名 → 入袋
   → `seen[]`；`netScrap`/`glassFloat` 补外观登记。验收：一局 5 分钟内
   海面肉眼可见 ≥3 件非建材剪影；探针实跑 hash 仍 `728b59b5`。
4. **里程碑接线**（§三）：session 喂 facts 调 `updateMilestones`；
   `storm-strike` 且未 over → `noteStorm`；quest 胶囊空闲时挂当前目标、
   达成庆祝；结算报 n/4。验收：headless 造 12 格 / 熬过首暴 / 撑到第 3 天
   各能在单测里打点达成且只发一次奖。
5. **确定性守护成文**：单测锁 `quietThroughProbe()`、探针窗口内零贴单 /
   零 `milestone-done`；`snapshot()` 不扩字段；概率/权重全走
   `constants.ITEM_DROP` + catalog `dropWeight`，session 不留本地数。
6. **隔离与存档防回归**：3 个新测试文件已在 `games/sea/src/tests`（对）；
   新增一律不回流根 `src/`；`seen[]` 继续兼容读 `cww_sea_v1` 旧档
   （缺字段当空表，已成立，别破）。

### 负面清单（Round 2 增补，叠加 Round 1 全部条款）

- 不给袋子做货币/交易/第二价格系统；杂货出口只有「使用折回 Resources」
  和图鉴，别的都是 P1 之后的事。
- 不在 `economy`/`threats` 老文件里挂物品效果；medkit/wrench/flare 的
  效果化留 P1，且到时也走事件出口，不改老签名。
- 不动四建材的 `SALVAGE.weights`/`yields`、TILE、花费、风暴旧数——
  除非有意换探针 hash，且必须在提交信息里明说。
- 不扩 `snapshot()`；官方 IP 零接触照旧。

---

## 五、P1 备忘（P0 之外，本轮见缝插针不强求）

- 工具/珍品效果化：wrench 修理加速、flare 逼退一波海盗、medkit 补最残格
  ——全走事件，先设计后动手。
- story 触发器接真实事件（`pirate-killed`/`storm-strike`），替掉
  `after-storm` 的 elapsed 擦边球；日记本回看界面消费 `unlockedBeats`。
- 结算页展示本局新点亮图鉴数 / 交单数 / 里程碑；`boardSummary` 与
  `milestoneSummary` 都是现成的。
- 浏览器实机键鼠走完一局 + 录屏（Round 2/3 一路欠到现在的人工验收）。

---

## 六、返回摘要

**MODEL_SLUG**: `claude-fable-5-thinking-xhigh`

三问三答：

1. **袋 vs Resources**：`Resources` 唯一可花账本；四建材**停止入袋**（删
   双写）；袋只装 `rollItemDrop` 出的杂货，补给品给「出袋 → `gain`」的
   使用出口，工具珍品本轮止步图鉴；`INVENTORY.maxPerItem` 与实现冲突,
   销账。
2. **海面 look**：**不算闭环**——管道全通、调用为零，海上仍只有四种剪影;
   捞取后掷的 `rollItemDrop` 只补「进袋」不补「看见」。掉签前置到
   `spawnJunk`（field LCG + pity 挂 field），指纹已核不受影响，但须实测
   锁 `728b59b5`。
3. **里程碑**：WIP sim 层合格，缺 session 接线、`storm-strike`→
   `noteStorm` 的事实源、HUD/结算展示位、以及「探针窗口零达成」的守护
   测试。另有一条现行红测（story 10 vs 14）挡在所有验收前面。

P0：①修绿 story 红测 → ②袋折法（删双写 + 补给品出口）→ ③look 闭环
（spawn 期掉签 + 新条目补图）→ ④里程碑接线四件套 → ⑤确定性守护成文 →
⑥隔离/存档防回归。
