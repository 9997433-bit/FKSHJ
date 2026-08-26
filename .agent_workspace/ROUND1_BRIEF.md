# Round 1 简报 — 扩玩法 + 多游戏目录（收口）

## 已实现

- **目录隔离**：海上生存整包在 `games/sea/`；根 `index.html` 是多游戏入口。
- **物品**：`data/catalog.ts` 14 件可辨认物 + `sim/inventory.ts` 原子道具袋。
  与 `Resources` 并列，不改建造/产消。海面剪影走 `world/items.ts`，未知 id 回退。
- **剧情**：`story/` 10 条日记/广播；`createStory` / `updateStory`；HUD 左下日记卡。
- **新循环**：岛民请求板 `sim/expand.ts`（交建材换水粮，限时、连击）。Q/E 交付。
- **HUD**：可选 `storyBeat` / `quest` / `lootToast`；不传则与 Round 3 一致。
- **存档**：`cww_sea_v1` 加 `seen[]` 图鉴，旧档缺字段当空表。
- **探针**：`snapshot()` 未扩字段；请求板接在威胁之后且 5s 探针早于首张条子。
  期望 hash 仍为 `728b59b5`。测试 13/13。
- **文案/审计**：`STORY.md`（12+3+8）与 `AUDIT.md`（P0：内容面几乎为零，循环底座够用）。

## 云端三路

- fable-sota HUD 层已 push（`storyBeat` / `quest` / `lootToast`）。
- opus-content 外观登记表 / 14 件配图 / 水花 / 存档 `seen` 已 push。
- fable-arch 晚到：`ARCHITECTURE` / `GAME_SPEC` / `INVENTORY`·`REQUESTS`·`STORY` 新常数已 push。
  父调度器只接线 session，不重写它的文档。

## 遗留 / 下轮重点

1. **请求板与道具袋还没进经济闭环**：袋里的 tarp/barrel 等不会从海面刷出（`SALVAGE` 仍只四种建材）。
2. **审计 P0 与实现有张力**：审计要求「禁止并行第二套经济」；本轮袋是并列层，Round 2 要决定折回 `Resources` 还是让袋成为拾荒入口。
3. **里程碑目标链**未单独做（可并进请求板：首座净水机 / 撑过风暴 / 木筏 ≥12）。
4. **浏览器键鼠走完一局**尚未当人工验收关掉。
5. `constants.ts` 的 BOARD 数值仍在 `expand.ts` 本地表，未搬真源。
6. 线上 Pages 仍是合 main 前的单游戏包；三轮后再合。

## 不要动

- 官方 IP / 陈小春 / 官方曲 / 照抄数值表
- TILE、建造花费、风暴/海盗旧数（除非有意更新探针 hash）
- 把游戏搬回根 `src/`
