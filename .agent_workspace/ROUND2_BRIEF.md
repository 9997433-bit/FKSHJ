# Round 2 简报 — 在已接线的海上生存上收口

父调度器已接线。`npm test` 4/4，`npm run probe` = deterministic（`728b59b5`），`vite build` 打进 25 个模块。

## 不要动

- `src/session.ts` / `src/main.ts` 只由父调度器改
- 别人的路径（见 `OWNERSHIP.md`）
- 禁止静默换模型；首行必须：`MODEL_SLUG: <实际 slug>`
- 禁止官方角色名/立绘、陈小春肖像、官方曲、照抄数值表
- 这是海上拾荒 + 浮岛基建，不是滑道街机

## 运行时真相（sim，不是 constants 镜像）

- `TILE = 64`，`RAFT_ORIGIN` = 画布中心，开局 3×3，指挥中心 `(0,0)` id=`core`
- 资源键：`wood/plastic/metal/rope/water/food`
- `HOTBAR`：`floor` `collector` `purifier` `fish` `turret`
- 小船 `SKIFF.scoopRadius = TILE * 1.5`，`beginScoop` 有冷却
- HUD 资源键必须是 `wood` 不是 `plank`；结算 `endedBy: "starved" | "coreDown"`
- 存档键 `cww_sea_v1`

`src/data/constants.ts` 里那套 `sizePx:48` / `hq` / `STARTING_STOCK` **是谎言**。画图与放置以 sim 为准。

## 本轮目标

统一数值表、补小船/海盗质感、HUD 风暴/饥饿、局级单测、刷新 BENCH。
