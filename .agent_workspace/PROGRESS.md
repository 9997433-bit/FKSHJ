# 疯狂水世界 — 编排进度

- **Goal**: 写一个模仿「疯狂水世界」的浏览器滑道街机游戏
- **隔离分支**: `agent/crazy-water-world`
- **父调度器**: Cursor Grok 4.6（主循环）
- **仓库**: github.com/9997433-bit/FKSHJ

## 模型映射（禁止静默降级）

| 简称 | slug | 本任务职能 |
| --- | --- | --- |
| fable | claude-fable-5-thinking-xhigh | 架构 / SOTA 审计验收 |
| opus-fast | claude-opus-5-thinking-high-fast | 核心玩法与内容落地 |
| gpt-sol | gpt-5.6-sol-xhigh-fast | 探针、基准、边界测试 |

## 循环状态

| 轮次 | 状态 | 说明 |
| --- | --- | --- |
| 准备 | 完成 | 规格、所有权、可玩骨架（测试 7 通过，生产构建成功） |
| Round 1 | 执行中 | 云端 VM 并发上限为 3；本轮 3 云端 + 3 本机，覆盖 6 路角色 |
| Round 2 | 未开始 | 靶向重构 |
| Round 3 | 未开始 | SOTA 打磨与验收 |
| 归档合并 | 未开始 | 结构化 PR |

## Round 1 派发记录

| 角色 | 简称 | 实际 slug | 环境 | Agent ID | 状态 |
| --- | --- | --- | --- | --- | --- |
| 架构引擎 | fable | claude-fable-5-thinking-xhigh | cloud | `bc-c3841b55-6495-55ed-b91f-0bfe541a404e` | 已完成（已摘并 engine/loop/constants/ARCHITECTURE） |
| SOTA UX | fable | claude-fable-5-thinking-xhigh | cloud | `bc-680fc86e-e1a4-5034-8aea-9f8e61d7dd17` | 已完成（已摘并 theme/menus/hud/SOTA_BAR） |
| 内容特效 | opus-fast | claude-opus-5-thinking-high-fast | cloud | `bc-287bff11-630f-5105-9ac1-e75ab4e735e8` | 运行中 |
| 核心玩法 | opus-fast | claude-opus-5-thinking-high-fast | local | `bc-f3586f19-030d-5668-9bb1-afa8ace61564` | 已完成（物理/镜头/滑道已收编，session 已接 hop） |
| 单测覆盖 | gpt-sol | gpt-5.6-sol-xhigh-fast | local | `bc-9fcce4c8-069a-5523-9d38-a0c8200a928f` | 已完成（14 测全绿，已收编测试文件） |
| 探针基准 | gpt-sol | gpt-5.6-sol-xhigh-fast | local | `bc-aaa77fd6-0569-5a4c-948c-c5252e446880` | 已完成（bench/smoke/probe 已收编） |

平台约束：异步新云端 VM 上限为 3，因此 fable×2 + opus-content 走云端独立工作树；opus-core / gpt-test / gpt-probe 走本机隔离任务（文件所有权不重叠）。未静默更换模型 slug。
