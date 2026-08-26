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
| Round 1 | 派发中 | 6 云端子代理：初始构建与基线探索 |
| Round 2 | 未开始 | 靶向重构 |
| Round 3 | 未开始 | SOTA 打磨与验收 |
| 归档合并 | 未开始 | 结构化 PR |

## Round 1 派发计划

1. fable-arch — 全局架构与引擎契约
2. fable-sota — SOTA 视觉/UX 复审与菜单主题
3. opus-core — 物理、碰撞、玩家、滑道
4. opus-content — 关卡、实体、特效、音频、存档
5. gpt-test — 单测与逻辑覆盖
6. gpt-probe — 性能基准与冒烟探针
