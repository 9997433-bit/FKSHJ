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
| Round 1 | 完成 | 六路交卷；`session.ts` / `main.ts` 已由父调度器接线 |
| Round 2 | 进行中 | 3 云端 + 3 本机已派出 |
| Round 3 | 未开始 | |
| 归档合并 | 未开始 | |

## Round 1 派发记录

| 角色 | 环境 | Agent ID | 状态 |
| --- | --- | --- | --- |
| fable-arch | cloud | `bc-658d8d8d-37c1-5405-84a2-37bc3e355b2a` | 已完成 |
| fable-sota | cloud | `bc-40ef3122-9243-503b-915a-449b96c3ec03` | 已完成 |
| opus-content | cloud | `bc-6b3e6f99-a4b1-5e24-9993-57af91344234` | 已完成 |
| opus-core | local | `bc-3ba5f66e-a5a2-5ac1-ab94-9b21edbb7260` | 已交卷（sim/小船/输入） |
| gpt-test | local | `bc-ebf2d1df-9248-5220-93c7-06151af93865` | 已交卷（4 测） |
| gpt-probe | local | `bc-5ac6090a-b4ff-56d2-bd56-15e566fa3366` | 已交卷（bench/probe） |

## Round 2 派发记录

| 角色 | 环境 | Agent ID | 状态 |
| --- | --- | --- | --- |
| fable-arch | cloud | `bc-15fd94ca-2aab-5d28-b10d-e020f5079b32` | 进行中 |
| fable-sota | cloud | `bc-b89f8894-bd24-5d85-89e3-ac6fff25db25` | 进行中 |
| opus-content | cloud | `bc-88106807-a276-5c5d-a0aa-ade423772102` | 进行中 |
| opus-core | local | `bc-8c47b3ae-d84a-5025-a678-bd7a041b4b7e` | 已交卷（placeHint + 捞取/菜单空格修复） |
| gpt-test | local | `bc-4d22ee57-eafd-55d3-9b3c-059f72ddf5d8` | 已交卷（session/menus 单测） |
| gpt-probe | local | `bc-20a977e8-e26f-53ff-a16c-890f40fe8b3f` | 已交卷（BENCH 已按接线后实测刷新） |
