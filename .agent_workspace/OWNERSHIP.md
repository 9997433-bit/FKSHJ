# Round 1 文件所有权（10 路）

游戏代码根：`games/sea/`。根目录 `index.html` 是多游戏入口，只有父调度器改。
`games/sea/src/session.ts` / `games/sea/src/main.ts` 只由父调度器接线。

| 代理 | slug | 环境 | 可写路径 |
| --- | --- | --- | --- |
| fable-arch | claude-fable-5-thinking-xhigh | cloud | `.agent_workspace/ARCHITECTURE.md` `.agent_workspace/GAME_SPEC.md` `games/sea/src/data/constants.ts` `games/sea/src/game/engine.ts` `games/sea/src/game/loop.ts` README.md |
| fable-sota | claude-fable-5-thinking-xhigh | cloud | `.agent_workspace/SOTA_BAR.md` `games/sea/src/ui/**` `games/sea/src/index.css` |
| fable-narrative | claude-fable-5-thinking-xhigh | local | `.agent_workspace/STORY.md` |
| fable-audit | claude-fable-5-thinking-xhigh | local | `.agent_workspace/AUDIT.md` |
| opus-content | claude-opus-5-thinking-high-fast | cloud | `games/sea/src/world/**` `games/sea/src/fx/**` `games/sea/src/data/save.ts` |
| opus-items | claude-opus-5-thinking-high-fast | local | `games/sea/src/data/catalog.ts` `games/sea/src/sim/inventory.ts` |
| opus-story | claude-opus-5-thinking-high-fast | local | `games/sea/src/story/**` |
| opus-play | claude-opus-5-thinking-high-fast | local | `games/sea/src/sim/expand.ts` |
| gpt-test | gpt-5.6-sol-xhigh-fast | local | `games/sea/src/tests/**` |
| gpt-probe | gpt-5.6-sol-xhigh-fast | local | `scripts/**` `.agent_workspace/BENCH.md` |

禁止改别人的路径。禁止静默换模型。本机代理禁止 git commit/push/checkout。
云端代理只提交自己的路径，push 前 `git pull --rebase origin agent/sea-sota-expand`，禁止 force-push / 开 PR。
