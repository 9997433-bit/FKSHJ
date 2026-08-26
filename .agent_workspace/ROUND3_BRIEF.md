# Round 3 简报 — 收口到可玩

`session.ts` / `main.ts` 已接线：海面、木筏、船体、HUD 风暴/饥饿、标题循环。
探针 hash `728b59b5`。不要改 session/main。不要另开分支，工作在 `agent/crazy-sea-world`。

## 不要动

- `src/session.ts` / `src/main.ts`
- 别人的路径（见 OWNERSHIP.md）
- 禁止静默换模型；首行 `MODEL_SLUG: <实际 slug>`
- 禁止官方角色名/立绘、陈小春肖像、官方曲、照抄数值表
- 这是海上拾荒，不是滑道

## 本轮目标

1. 能 import 的 sim 数字改为读 `src/data/constants.ts`（必须先对过，对不上就别硬接）
2. HUD / 船体 / 海面只做小修补，不要重写
3. 把 `placeHint`、捞取一致性和菜单空格粘键补进单测
4. 刷新 BENCH 到当前 HEAD
