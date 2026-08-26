# Round 3 简报 — SOTA 收口

Round 1–2 已接线。探针须保持 `728b59b5`。`snapshot()` 不要扩字段。

## 本轮只做这些

1. **点袋吃喝**：读 `constants.ITEM_USE`（kelp / driedFish / freshWater → `gain`）。原子出袋，满仓截断。session 接线仍归父调度器；你们只提供 `useItem(inv, id)` 一类纯函数。
2. **HUD**：袋格可点（或给出点击区矩形 API）；庆祝音效钩子给 fx，不要挡舞台。不传新字段则与现在一致。
3. **音效**：任务完成 / 里程碑短音，不引入官方曲。
4. **打磨**：夜景/剪影可读、菜单/gameover 空格防误触仍在。
5. **单测**：ITEM_USE 原子性；旧 17 测必须仍绿。
6. **规格**：写清吃喝线与「合 main 后 Pages 地址」：入口 `/`，游戏 `/games/sea/`。

## 不要做

官方 IP；改 TILE/花费/风暴；扩 snapshot；搬回根 `src/`；静默换模型；自己合 main。

## Round 3 收口（父调度器）

已接线：点袋 → `useItem`；`sfx.questDone` / `sfx.milestone`。
`npm test` 21/21，探针仍 `728b59b5`。
合 main 后 Pages：入口 https://9997433-bit.github.io/FKSHJ/ ，游戏 https://9997433-bit.github.io/FKSHJ/games/sea/
