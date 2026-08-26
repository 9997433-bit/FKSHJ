# Round 1 结论 — 海上末日重开

平台上限 3 个云端 VM：本轮 3 云端 + 3 本机，**六路均已交卷**。

## 各路成果

| 角色 | 环境 | 产出 |
| --- | --- | --- |
| fable-arch | cloud | `ARCHITECTURE.md` + `src/data/constants.ts` 数值表 |
| fable-sota | cloud | `SOTA_BAR.md`、`src/ui/menus.ts`、`src/ui/hud.ts`、阳光色 `index.css` |
| opus-content | cloud | `src/world/{ocean,raft,junk}.ts`、`src/fx/*`、`src/data/save.ts` |
| opus-core | local | `src/sim/**`、`entities/skiff`、`entities/pirate`、`src/game/input.ts` |
| gpt-test | local | `src/tests/rules.test.ts`（花费 / 邻接 / 产消 / 断粮） |
| gpt-probe | local | `scripts/bench.ts`、`scripts/probe-session.ts`、`BENCH.md` |

父调度器已接线 `src/session.ts` / `src/main.ts`：标题 ↔ 开局 ↔ 暂停 ↔ 结算，海面/木筏/漂浮物/小船/海盗/HUD 同帧绘制。无头探针走 `new Session({ seed, headless: true })` + `applyProbeAction` + `snapshot`。

## 运行时真相（接线必须对齐 sim，不是 constants 镜像）

- 网格：`TILE = 64`，`RAFT_ORIGIN` = 画布中心，开局 3×3，指挥中心 `(0,0)` id=`core`
- 资源：`wood/plastic/metal/rope/water/food`；`canAfford` / `pay` / `gain` 原子
- 热键栏 `HOTBAR`：`floor`（贴海、四邻接）/ `collector` / `purifier` / `fish` / `turret`（盖空地板）
- 小船：加速度 + 水阻，`scoopRadius = TILE*1.5`，`beginScoop` 冷却
- 威胁：`updateThreats` 出风暴/海盗/炮塔事件；`stormWarnRatio` 给海面与 HUD
- 绘制：`drawOcean` → palette；`drawRaft(ctx, allCells(raft), view)`；`makeJunkField` / `reapJunk`
- UI：`renderOverlay(root, kind, payload)`，结算 `endedBy: "starved" | "coreDown"`
- 存档键 `cww_sea_v1`：`bestDay()` / `commitRun(day, salvage)`

## 已知契约冲突（Round 2 必收）

`src/data/constants.ts` 另有一套未消费镜像：`TILE.sizePx: 48`、15×11 网格、`STARTING_STOCK`、`BUILD_COST`、指挥中心叫 `hq`。
**`src/sim/rules.ts` 才是运行时真相。** junk 已改读 sim 网格。新代码不要再读 constants 的 TILE 布局。
两套产消/风暴数字不一致，平衡未实机验证。

## 观感债

- 小船 / 海盗仍是 session 里的占位剪影，应抽到 `src/world/` 并加重绘
- HUD 还缺风暴预警条、岛民饥饿进度（`economy.starveRatio` 已有，未接线）
- 标题/结算底下能看见静态海面，但未做浏览器端到端点选验收
- `session.ts` 刚接上，缺局级单测

## 下轮重点

1. 统一 constants ↔ sim（单一数值源）
2. 小船/海盗绘制质感 + 风暴/饥饿 HUD
3. Session / 菜单单测，刷新 BENCH，探针保持 deterministic
4. 浏览器可玩：捞、建、停、死、再来一局
