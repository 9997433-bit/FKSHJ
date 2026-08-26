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
| Round 1 | 完成 | 见 ROUND1_BRIEF.md |
| Round 2 | 完成 | 见 ROUND2_BRIEF.md。34 测 + 长局不再空 |
| Round 3 | 派发中 | 云端 VM 上限 3：3 云端 + 3 本机 |
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

## Round 2 派发记录

| 角色 | 环境 | Agent ID | 状态 |
| --- | --- | --- | --- |
| fable-arch | cloud | `bc-4a967bf5-2bd9-56d2-8c94-7b7dc4a38f3e` | 已完成（CAMERA/FEEL + loop 修复已摘并） |
| fable-sota | cloud | `bc-993634f2-a713-5fc9-a207-a4f641dc65d4` | 已完成（泳圈绘制 + 静音开关已摘并） |
| opus-content | cloud | `bc-2ce5cda9-7350-5957-9a67-eaea45bfbec1` | 已完成（流式关卡 / 主题循环 / BGM 已摘并） |
| opus-core | local | `bc-f33f8ea2-5c35-50b7-9683-9baff7d16890` | 已完成（落水失败 + 换道碰撞已收编） |
| gpt-test | local | `bc-85d38b55-2e52-5bdc-b07f-833077a49cce` | 已完成（18 测已收编） |
| gpt-probe | local | `bc-dc2e5c29-59d2-5a8c-81db-9e1a8e89959d` | 已完成（长局空关卡已记录，脚本已收编） |
