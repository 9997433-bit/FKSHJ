# Round 2 文件所有权（海上末日重开）

| 代理 | slug | 环境 | 可写路径 |
| --- | --- | --- | --- |
| fable-arch | claude-fable-5-thinking-xhigh | cloud | `.agent_workspace/ARCHITECTURE.md` `src/data/constants.ts` `src/game/engine.ts` `src/game/loop.ts` README.md |
| fable-sota | claude-fable-5-thinking-xhigh | cloud | `.agent_workspace/SOTA_BAR.md` `src/ui/**` `src/index.css` |
| opus-content | claude-opus-5-thinking-high-fast | cloud | `src/world/**` `src/fx/**` `src/data/save.ts` |
| opus-core | claude-opus-5-thinking-high-fast | local | `src/sim/**` `src/game/input.ts` `src/entities/**` |
| gpt-test | gpt-5.6-sol-xhigh-fast | local | `src/tests/**` |
| gpt-probe | gpt-5.6-sol-xhigh-fast | local | `scripts/**` `.agent_workspace/BENCH.md` |

`src/session.ts` / `src/main.ts` 只由父调度器合并。禁止改别人的路径。禁止静默换模型。
禁止 force-push。云端代理只提交自己的路径，push 前 `git pull --rebase origin agent/crazy-sea-world`。
