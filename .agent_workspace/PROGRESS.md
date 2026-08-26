# 疯狂水世界 — 编排进度（SOTA 扩玩法 + 多游戏目录）

- **Goal**: 加玩法 / 剧情 / 物品，并做成 SOTA 打磨；海上生存单独住进 `games/sea/`，根目录留给以后其它游戏
- **隔离分支**: `agent/sea-sota-expand`
- **父调度器**: Cursor Grok 4.6
- **仓库**: github.com/9997433-bit/FKSHJ
- **平台**: 每轮 10 路（4 fable + 4 opus-fast + 2 gpt-sol）；云端 VM 上限 3 → **3 云端 + 7 本机**
- **禁止**: 官方角色名/立绘、陈小春肖像、官方曲、照抄数值表；静默换模型

## 模型映射

| 简称 | slug |
| --- | --- |
| fable | claude-fable-5-thinking-xhigh |
| opus-fast | claude-opus-5-thinking-high-fast |
| gpt-sol | gpt-5.6-sol-xhigh-fast |

## 循环状态

| 轮次 | 状态 | 说明 |
| --- | --- | --- |
| 准备 | 进行中 | 分支已建；游戏迁入 `games/sea/` |
| Round 1 | 未开始 | |
| Round 2 | 未开始 | |
| Round 3 | 未开始 | |
| 归档合并 | 未开始 | |
