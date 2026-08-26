# Round 2 结论

六路均已交卷。父调度器已把 HUD 新字段和 `world/craft` 船体接到 `session.ts`。
`npm test` 8/8，`npm run probe` 仍为 deterministic（`728b59b5`）。

| 角色 | 产出 |
| --- | --- |
| fable-arch | `constants.ts` 与 sim 数字对齐；ARCHITECTURE / README 改口「sim 是运行时真相」 |
| fable-sota | HUD 可选 `storm01` / `starve01` / `hintDanger`；空选中建造提示 |
| opus-content | `src/world/craft.ts`：`drawSkiff` / `drawPirate(s)`，与涌浪同相 |
| opus-core | `placeHint`；捞取高亮与 `pickJunk` 同半径；菜单空格不再粘住 `scoopHeld` |
| gpt-test | headless Session 建造磁带 + `gameoverCopy` |
| gpt-probe | BENCH 换成接线后实测，探针不再是 not-wired |

## 还没做完（Round 3）

- sim / entities 仍持有本地数值副本，未改 import constants
- 浏览器端到端（捞、建、停、死、再来）未当验收关掉
- GitHub Pages 仍是旧滑道包，合 `main` 后要重跑 workflow
