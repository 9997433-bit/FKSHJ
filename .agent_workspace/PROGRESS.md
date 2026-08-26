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
| 准备 | 完成 | 规格、所有权、可玩骨架 |
| Round 1 | 完成 | 6 路已合并；见 ROUND1_BRIEF.md。14 测 + smoke/probe/build 绿 |
| Round 2 | 派发中 | 云端 VM 上限 3：3 云端 + 3 本机 |
| Round 3 | 未开始 | SOTA 打磨与验收 |
| 归档合并 | 未开始 | 结构化 PR |

## Round 1 派发记录

| 角色 | 环境 | Agent ID | 状态 |
| --- | --- | --- | --- |
| fable-arch | cloud | `bc-c3841b55-6495-55ed-b91f-0bfe541a404e` | 已合并 |
| fable-sota | cloud | `bc-680fc86e-e1a4-5034-8aea-9f8e61d7dd17` | 已合并 |
| opus-content | cloud | `bc-287bff11-630f-5105-9ac1-e75ab4e735e8` | 已合并 |
| opus-core | local | `bc-f3586f19-030d-5668-9bb1-afa8ace61564` | 已合并 |
| gpt-test | local | `bc-9fcce4c8-069a-5523-9d38-a0c8200a928f` | 已合并 |
| gpt-probe | local | `bc-aaa77fd6-0569-5a4c-948c-c5252e446880` | 已合并 |

## Round 2 派发计划

1. fable-arch — 对照 BRIEF 复审架构，更新 ARCHITECTURE
2. fable-sota — 泳圈造型 / 泡沫与滑道对齐 / SOTA P0
3. opus-core — 落水失败、换道视觉与碰撞一致
4. opus-content — 流式关卡、主题循环、BGM
5. gpt-test — 新生成器 / hop / 存档回归
6. gpt-probe — 更新 BENCH 快照与长局探针
