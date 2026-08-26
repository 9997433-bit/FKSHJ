# 疯狂水世界 — 编排进度（海上末日重开）

- **Goal**: 模仿益世界《疯狂水世界》的浏览器海上末日生存原型（拾荒 / 浮岛 / 养活岛民）
- **隔离分支**: `agent/crazy-sea-world`
- **父调度器**: Cursor Grok 4.6
- **仓库**: github.com/9997433-bit/FKSHJ
- **纠正**: 上一轮做成了滑道街机，已整支清掉重开。已合并的 PR #1/#2 留在历史上，不再改写。

## 模型映射（禁止静默降级）

| 简称 | slug | 职能 |
| --- | --- | --- |
| fable | claude-fable-5-thinking-xhigh | 架构 / SOTA |
| opus-fast | claude-opus-5-thinking-high-fast | 玩法与内容落地 |
| gpt-sol | gpt-5.6-sol-xhigh-fast | 探针 / 基准 / 测试 |

## 循环状态

| 轮次 | 状态 | 说明 |
| --- | --- | --- |
| 准备 | 进行中 | 清滑道代码、新规格、派 Round 1 |
| Round 1 | 进行中 | 6 路并发 |
| Round 2 | 未开始 | |
| Round 3 | 未开始 | |
| 归档合并 | 未开始 | |

## Round 1 派发记录

待写入 Agent ID。
