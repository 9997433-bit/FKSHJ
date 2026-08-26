# Round 文件所有权（减少云端并行冲突）

父调度器已提交可运行骨架。子代理 **只改自己的文件**；共享文件只允许「增加 import / 一行接线」，禁止重写。

## Round 1

| 代理 | 模型 slug | 可写路径 |
| --- | --- | --- |
| fable-arch | claude-fable-5-thinking-xhigh | `.agent_workspace/ARCHITECTURE.md` `src/game/engine.ts` `src/game/loop.ts` `src/data/constants.ts` |
| fable-sota | claude-fable-5-thinking-xhigh | `.agent_workspace/SOTA_BAR.md` `src/ui/theme.ts` `src/ui/menus.ts` `src/ui/hud.ts` |
| opus-core | claude-opus-5-thinking-high-fast | `src/game/physics.ts` `src/game/collision.ts` `src/game/input.ts` `src/game/camera.ts` `src/entities/player.ts` `src/world/track.ts` |
| opus-content | claude-opus-5-thinking-high-fast | `src/world/levels.ts` `src/world/water.ts` `src/entities/*.ts`（除 player） `src/fx/**` `src/data/save.ts` |
| gpt-test | gpt-5.6-sol-xhigh-fast | `src/tests/**` `package.json`（仅 scripts/devDependencies） |
| gpt-probe | gpt-5.6-sol-xhigh-fast | `scripts/**` `.agent_workspace/BENCH.md` |

`src/main.ts` / `index.html` / `index.css` 由父调度器在回合间合并，子代理不要大改。
