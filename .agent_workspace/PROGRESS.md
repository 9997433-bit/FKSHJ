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
| 准备 | 完成 | 分支已建；游戏迁入 `games/sea/` |
| Round 1 | 收口 | 本机 7 路 + HUD/绘制已收编；arch 卡住由父调度器补规格；session 已接线 |
| Round 2 | 未开始 | |
| Round 3 | 未开始 | |
| 归档合并 | 未开始 | |

## Round 1 派发记录

| 角色 | 环境 | Agent ID | 状态 |
| --- | --- | --- | --- |
| fable-arch | cloud | `bc-aa1c9505-b960-5fb5-9803-09841114b9ae` | 晚到已收编（规格 + 新常数表） |
| fable-sota | cloud | `bc-baf18290-096b-5db8-a4a7-cfcb55b12075` | 已收编（HUD storyBeat/quest/lootToast） |
| fable-narrative | local | `bc-fe56061c-2fa3-53ce-a12a-268576a1000e` | 已收编（STORY.md 12+3+8） |
| fable-audit | local | `bc-5cba4e0d-c853-5e07-aa3d-aa198e968705` | 已收编（AUDIT.md P0 清单） |
| opus-content | cloud | `bc-89a8c819-edd8-5319-a02b-71e7ae9a6f39` | 已收编（items 登记表 / 水花 / save.seen） |
| opus-items | local | `bc-d166590b-8c41-5fdd-b654-c4fa0443585b` | 已收编（14 件目录 + 原子道具袋） |
| opus-story | local | `bc-ba5cd3cd-34a4-55db-b530-3094c6bfdc6a` | 已收编（10 条日记/广播） |
| opus-play | local | `bc-4e92a6fc-7d71-50d2-bea6-4da1b77c9b2f` | 已收编（岛民请求板） |
| gpt-test | local | `bc-8e95d48d-86db-5134-a8ac-dcfd4da95f61` | 已收编（layout 目录测试，13/13） |
| gpt-probe | local | `bc-d7ecead5-df9f-53dd-ba23-cf9435f92b31` | 已收编（探针 hash 仍 728b59b5） |
