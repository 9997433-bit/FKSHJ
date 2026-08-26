# Round 1 结论简报

父调度器已合并 6 路成果到 `agent/crazy-water-world`。验证：`npm test` 14/14、`smoke`、`probe` 确定性、`build` 通过。

## 已实现

| 来源 | 落地 |
| --- | --- |
| 父骨架 | 可玩闭环：标题→滑道→暂停→结算；5 车道、跳、金币/宝石/水环、障碍、加速带、四主题段 |
| fable-arch | 引擎契约、DPR 画布、场景 FSM、切标签页暂停、ARCHITECTURE.md |
| fable-sota | 主题段间混色、语义色、无 alert 菜单、连击/速度条 HUD、SOTA_BAR.md |
| opus-core | 指数趋近速度、加速包络、弯道掉速、镜头随滑道弯曲、跳弧缓冲、墙刮、完整滑道网格 |
| opus-content | 主题生成表、剪影天空、实体剪影绘制、加速带可见、粒子上限 400、琶音、存档 lastRunAt/runs/totalCoins |
| gpt-test | 玩家/存档/会话/主题/世界种子单测 |
| gpt-probe | bench 中位预算、确定性 session 磁带、加严 smoke |

## 遗留缺陷（Round 2 必做加粗）

1. **世界预生成到 ~7200 单位后变空** — 需流式续生
2. **主题停在霓虹不再循环** — 规格允许循环或更长拼接
3. **无 BGM**，只有 SFX
4. **落水失败未实现**（偏离滑道过久）
5. 换道时 `player.lane` 立刻跳到目标，碰撞比视觉超前（改需同步 player.test）
6. `drawFoam` 全宽浪线切过滑道墙，读起来像海挡在滑道前
7. 泳圈仍缺高光/投影/入水涟漪的完整造型
8. 无受击顿帧 / 加速速度线（镜头震动已有 `kickCamera`）
9. 种子未混入 `dateDay`（规格 §5）
10. 物理/镜头魔法数仍散落模块内，未进 `constants.ts`
11. physics→camera 的 `kickCamera` 耦合偏臭
12. Canvas/GPU 帧时未做浏览器基准

## 性能

- generateWorld×200 中位 < 2ms；stepSpeed×20 万 < 3ms；360 粒子×300 帧 < 1ms
- 探针 runId `0xc0ffee` 仍确定性；内容密度上升后同磁带分数/金币更高（属预期）
- 未测真实 1080p 60fps 画布填充

## Round 2 攻坚重点

1. 流式关卡 + 主题循环，保证长局不空
2. 水面/泳圈/泡沫与滑道透视对齐，去掉挡墙浪线
3. 落水失败、换道碰撞与视觉一致
4. 轻量 BGM + 受击/加速反馈
5. 单测跟上新生成器与 hop；更新 BENCH 快照
6. 对照 SOTA_BAR 把 P0 项打勾
