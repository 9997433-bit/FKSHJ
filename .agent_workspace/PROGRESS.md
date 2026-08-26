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
| 准备 | 完成 | 清滑道代码、新规格、隔离分支已推 |
| Round 1 | 完成 | 六路交卷；`session.ts` / `main.ts` 已接线 |
| Round 2 | 完成 | 数值对齐、船体、HUD 预警、局级单测；session 已接 HUD/craft |
| Round 3 | 派发中 | sim 改读 constants、补测、刷新 BENCH、小幅打磨 |
| 归档合并 | 未开始 | |

## Round 2 派发记录

| 角色 | 环境 | Agent ID | 状态 |
| --- | --- | --- | --- |
| fable-arch | cloud | `bc-15fd94ca-2aab-5d28-b10d-e020f5079b32` | 已完成 |
| fable-sota | cloud | `bc-b89f8894-bd24-5d85-89e3-ac6fff25db25` | 已完成 |
| opus-content | cloud | `bc-88106807-a276-5c5d-a0aa-ade423772102` | 已完成 |
| opus-core | local | `bc-8c47b3ae-d84a-5025-a678-bd7a041b4b7e` | 已交卷 |
| gpt-test | local | `bc-4d22ee57-eafd-55d3-9b3c-059f72ddf5d8` | 已交卷 |
| gpt-probe | local | `bc-20a977e8-e26f-53ff-a16c-890f40fe8b3f` | 已交卷 |

## Round 3 派发记录

| 角色 | 环境 | Agent ID | 状态 |
| --- | --- | --- | --- |
| fable-arch | cloud | `bc-254b0b07-a5a1-53ae-820d-e18dff3666dd` | 已完成（constants 收口，hq/48px 叙事已删） |
| fable-sota | cloud | `bc-8a82346a-7432-59cb-b4ef-73b47b867453` | 进行中 |
| opus-content | cloud | `bc-38531cf3-2537-51f4-bd67-178c8f004638` | 进行中 |
| opus-core | local | `bc-9c1a6d9a-3d86-536e-a7ed-fc5208d181f0` | 进行中 |
| gpt-test | local | `bc-cd7870c0-974d-55bb-87f4-68d0f9a3ef61` | 已交卷（placeHint / scoop / 新纪录文案） |
| gpt-probe | local | `bc-5bf5120d-9eb0-5217-b60e-f050f8dedffb` | 已交卷（BENCH 已按当前 HEAD 刷新） |
