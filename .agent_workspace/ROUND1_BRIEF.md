# Round 1 简报 — 海上末日重开

平台上限 3 个云端 VM：本轮 3 云端 + 3 本机。

| 角色 | 环境 | 任务 |
| --- | --- | --- |
| fable-arch | cloud | 架构、数值表、引擎契约、README |
| fable-sota | cloud | 标题/暂停/结算/HUD 视觉与 SOTA 条 |
| opus-content | cloud | 海面、漂浮物、木筏格子、特效、存档 |
| opus-core | local | 小船、花费、邻接建造、产消、风暴海盗规则 |
| gpt-test | local | 规则与存档单测 |
| gpt-probe | local | smoke / bench / probe 脚本 |

父调度器负责 `session.ts` / `main.ts` 接线。
首行必须写：`MODEL_SLUG: <实际 slug>`。
