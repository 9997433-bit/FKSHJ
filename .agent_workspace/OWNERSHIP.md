# Round 文件所有权（减少并行冲突）

## Round 2

| 代理 | 模型 slug | 可写路径 |
| --- | --- | --- |
| fable-arch | claude-fable-5-thinking-xhigh | `.agent_workspace/ARCHITECTURE.md` `src/game/engine.ts` `src/game/loop.ts` `src/data/constants.ts` |
| fable-sota | claude-fable-5-thinking-xhigh | `.agent_workspace/SOTA_BAR.md` `src/ui/theme.ts` `src/ui/menus.ts` `src/ui/hud.ts` `src/index.css` |
| opus-core | claude-opus-5-thinking-high-fast | `src/game/physics.ts` `src/game/collision.ts` `src/game/input.ts` `src/game/camera.ts` `src/entities/player.ts` `src/world/track.ts` |
| opus-content | claude-opus-5-thinking-high-fast | `src/world/levels.ts` `src/world/water.ts` `src/entities/collectible.ts` `src/entities/obstacle.ts` `src/entities/booster.ts` `src/fx/**` `src/data/save.ts` |
| gpt-test | gpt-5.6-sol-xhigh-fast | `src/tests/**` |
| gpt-probe | gpt-5.6-sol-xhigh-fast | `scripts/**` `.agent_workspace/BENCH.md` `package.json`（仅 scripts） |

`src/session.ts` / `src/main.ts` 由父调度器在回合间合并。子代理只允许最小接线。
