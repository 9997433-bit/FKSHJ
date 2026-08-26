MODEL_SLUG: claude-fable-5-thinking-xhigh

# AUDIT — Round 3 收口审：合 main 前的三道闸

（Round 3 fable-audit · 本机 · 只审不改。审计基线 = `agent/sea-sota-expand`
@ HEAD `16db820`（Round 3 简报已开），**外加**审计期间（08:56–09:02）观察到的
未提交 WIP。Round 2 审计原文在 git 历史 `16db820:.agent_workspace/AUDIT.md`。）

---

## 〇、现场情况：审计期间基线又在动，且这次是往好里动

- **已落地（HEAD `16db820`）**：Round 2 六条 P0 已在 `61a6bca` 折进同一套海
  ——四建材入袋双写已拆（`tryScoop` 只 `gain(res)`，袋的唯一入口是
  `rollItemDrop`）；look 闭环已通（`c308b92` spawn 期换装 + `2342e39`
  net/float 补图）；里程碑接线四件套齐（session 217–225 行：
  `storm-strike`→`noteStorm`、每帧喂 facts 调 `updateMilestones`、quest
  胶囊空闲挂 `nextMilestone().hint`、`questDone` 庆祝）。
- **WIP（未提交，8 文件 +317/−16）**：`sim/inventory.ts` +110 行吃喝出口
  （`useItem`/`useYieldOf`/`canUseItem`/`USABLE_ITEM_IDS`）；
  `sim/expand.ts` +`Celebration` 庆祝文案派生 + `quietThroughProbe` 双头
  守护（firstS 和 postT 都查）；catalog/story 注释与文案修订；
  inventory.test.ts +4 条 item-use 测试。
- **审计中亲眼看到一次红转绿**：08:58 时 `useItem` 实现是三参
  `(inv, res, id)` 而测试按简报写的两参 `(inv, id)` 调，1 测红
  （`reason: 'not-usable'`——`res` 位被 "kelp" 顶掉）；09:00 并行代理把
  测试对齐三参签名，**全套 21/21 绿**。签名偏离简报（简报说
  `useItem(inv, id)` 一类），但三参版把「先出袋后 `gain`」的两步序锁进
  同一个函数里，比让 session 拼两步更不容易漏账——**裁决：接受三参版**，
  测试已锁，不要再改回去。

---

## 一、吃喝是否可测：sim 层可测（已验），玩家层还不可

### 已验（WIP，未提交）

- `constants.ITEM_USE`（305–312 行）就是唯一汇率真源：kelp→food 4、
  driedFish→food 8、freshWater→water 8。`inventory.ts` 的
  `USE_TABLE: Partial<Record<ItemId, Cost>> = ITEM_USE` 兼作编译期守卫，
  表里混进坏 id 先红编译不红运行时。
- `useItem` 语义正确：表外物品 `not-usable`、袋里没有 `not-held`（两种
  失败都分文不动）；成了则 `removeItem` 原子出袋 1 件再逐资源 `gain()`，
  `gained` 报**截断后**的实际入库量；满仓时 `gained` 为 0 但那件照样
  消耗——正是简报「原子出袋，满仓截断」的字面语义。
- 4 条单测全绿，含满仓截断那条（water 99 + 8 → 100，入 1 丢 7）。
  旧测未动，全套 21/21 绿。

### 未接（挡在「玩家能吃喝」前面）

1. **session 零调用**：全工程只有 inventory.ts 和测试碰 `useItem`。
   按简报这归父调度器，但合 main 时若 HUD 画着袋子却点不动，等于上一轮
   「只写不读」换了个部位。
2. **HUD 没有点击面**：`drawBagStrip` 是纯绘制，格子几何
   （x0=16、y0=192、pad=10、cell=36、gap=6、格数 `INVENTORY.hudSlots`）
   全是函数内局部量，**没有导出点击区矩形 API**——简报第 2 条两个选项
   （袋格可点 / 给矩形 API）一个都还没做。session 想 hit-test 只能抄
   一份几何常数，那是第二真源，禁止。
3. **input 路由缺位**：`consumeClick()` 的点击现在只进
   `tryPlaceAt`/取消选中两条路（session.update 205–209），没有袋区分流。

**验收标准（合 main 前）**：hud 导出 `bagSlotRects()`（或等价物）→
session 点击先查袋区、命中则 `useItem` + 飘字/音效、未命中走建造 →
一条 headless 单测从 session 层点袋吃一件海带、断言 food 涨 4 且袋少
1 件。三样都齐才算「吃喝可测」；只有 sim 层函数 + 单测的现状算**半程**。

---

## 二、探针是否仍冻：仍冻（本机实测两次，非推理）

- `npm run probe` 在**带 WIP 的工作区**跑了两遍（08:59、09:01），两次均
  `status: deterministic`、`traceHash: 728b59b5`、300 tick、9 磁带事件。
- `snapshot()`（session.ts 156–170）没扩字段：bag/story/board/milestones
  一个都不在里面，与 Round 3 简报「不要扩 snapshot」一致。
- `useItem` 不碰 rng、探针磁带无捞取无点袋，天然不进指纹；
  `quietThroughProbe` 的双头守护（firstS **和** createBoard().postT 都
  必须 > 5s）比上一轮更严，好评。
- 里程碑在 5s 窗口内零达成的结构性保证仍成立：tiles 磁带顶到 11 < 12、
  day 1 < 3、purifier 0、storm 首暴 50s。
- **两条尾巴**：① 树在动，本报告的 hash 只对审计时刻负责——合 main 的
  那个 commit 上必须再跑一次探针，绿了才许合；② `pages.yml` 的门禁只有
  `npm test` + `npm run build`，**探针不在 CI 里**——合 main 前把
  `npm run probe`（外加断言 hash）塞进 workflow 或至少写进合并检查单，
  别让指纹只活在审计员的手上。

---

## 三、Pages 地址：仓库侧已就绪，地址没写进文档

- 仓库 `9997433-bit/FKSHJ` 的 GitHub Pages **已启用**（API 实查：
  `build_type: workflow`、`html_url: https://9997433-bit.github.io/FKSHJ/`）。
- 部署链完整：`pages.yml` 在 push main 时 `npm ci → npm test →
  npm run build → deploy dist/`——测试红着连部署都不会发生，门禁顺序对。
- **合 main 后的地址**（简报第 6 条要写清的那两行）：
  - 入口导航页：`https://9997433-bit.github.io/FKSHJ/`
  - 海上生存游戏：`https://9997433-bit.github.io/FKSHJ/games/sea/`
- 路径正确性已验：vite `base: "./"`，构建产物
  `dist/games/sea/index.html` 引用 `../../assets/...` 相对路径，项目页
  子路径下不会 404；layout.test 锁了根入口 → 游戏页的链接。`dist/` 在
  .gitignore 里，不会把陈旧产物带上 main。
- **缺口**：README 只写了本地 5173/4173 地址加一句「静态托管同理」，
  GAME_SPEC 一处都没提公网地址。P0：把上面两条 URL 原文写进
  GAME_SPEC（或 README 的部署节），这是简报第 6 条的字面要求。

---

## 四、合 main 前 P0 清单（顺序即收口顺序）

1. **把 WIP 提交掉**：`useItem` 一族 + 4 条绿测 + expand/catalog/story
   修订现在全是未提交状态，审计所有绿灯都验在工作区上，不 commit 一切
   白验。（审计员无 git 权限，此条归开发侧。）
2. **吃喝走完后半程**（§一）：hud 导出袋格点击区 API → session 点击
   分流（袋区优先于建造）→ headless 单测从 session 层吃一件断言两本账。
   缺任何一环，合 main 后玩家面对的是「看得见点不动」的袋子。
3. **庆祝短音补上**：`request-done`/`milestone-done` 现在复用
   `sfx.scoop()`（session 245–257），audio.ts 没有专用短音；expand.ts
   WIP 已备好 `Celebration` 文案派生，音效钩子是简报第 3 条的正文而非
   可选项。加 `sfx.celebrate()` 一类短音，不引入官方曲。
4. **结算报里程碑 n/4**：`result()`（session 172–182）仍不知道
   `milestoneSummary()` 的存在——Round 2 P0-4 的这半条漏掉了，长目标
   做完玩家在结算页看不见。最低限加一行数字。
5. **Pages 地址进文档**（§三）：两条 URL 写进 GAME_SPEC/README。
6. **合并时点的双绿复核**：合 main 的 commit 上 `npm test` 21/21 +
   `npm run probe` = `728b59b5` 各跑一次；探针建议顺手进 CI。

### 负面清单（Round 1/2 全部条款继续有效，重点重申）

- 袋子出口只有 `useItem` 折回 Resources 和图鉴；不做货币/交易。
- 不动 TILE/花费/风暴旧数、不扩 `snapshot()`、不搬回根 `src/`、
  官方 IP 零接触、不自己合 main。
- `ITEM_USE` 是吃喝唯一真源；catalog 的 food/drink 标签只管 HUD 分栏，
  别拿标签当判据（WIP 注释已写明，执行时别走样）。

---

## 五、返回摘要

**MODEL_SLUG**: `claude-fable-5-thinking-xhigh`

三问三答：

1. **吃喝是否可测**：sim 层**可测且已测**——`useItem` 原子出袋、按
   `ITEM_USE` 入库、满仓截断，4 条单测绿（含截断）；但 session 零调用、
   HUD 无点击面、无点击区 API，玩家层**不可测**。合 main 前须走完
   「袋格矩形 API → session 分流 → headless 端到端测」后半程。
2. **探针是否仍冻**：**仍冻**——带 WIP 的树上实跑两次
   `traceHash: 728b59b5`，`snapshot()` 未扩字段，守护反而更严了；
   但探针不在 CI，合并 commit 上须再实测一次。
3. **Pages 地址**：Pages 已启用（workflow 构建），合 main 后入口
   `https://9997433-bit.github.io/FKSHJ/`、游戏
   `https://9997433-bit.github.io/FKSHJ/games/sea/`；相对路径已验不会
   404。地址还没写进任何文档，须落 GAME_SPEC/README。

P0：①提交 WIP → ②吃喝后半程（点击区 + session 分流 + 端到端测）→
③庆祝短音 → ④结算报 n/4 → ⑤地址进文档 → ⑥合并点双绿复核。
门禁现状：21/21 绿、探针绿——是三轮以来第一次审计时就全绿的收口窗口，
别让它在合并前又红回去。
