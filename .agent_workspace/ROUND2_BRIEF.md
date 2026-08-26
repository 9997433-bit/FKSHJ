# Round 2 结论简报

6 路成果已并入 `agent/crazy-water-world`。验证：`npm test` **34/34**、`smoke`、`probe` 确定性、`build` 通过。长局探针 `worldEmptyAhead: false`。

## 相对 Round 1 的演进

| 项 | R1 | R2 |
| --- | --- | --- |
| 关卡 | 预生成到 ~7200 后变空 | 双 LCG 游标流式续生，分块与一次生成一致 |
| 主题 | 卡在霓虹夜 | `themeIndex` 取模循环；`themeCycleAt` 跨圈混色 |
| 失败 | 仅 HP=0 | 弯道甩出滑道、擦边计时、落水 `fallen` |
| 换道判定 | `lane` 立刻跳到目标 | 跟随视觉位置，中点翻面 |
| 泳圈 | 两个椭圆 | `drawPlayerRing` 高光/投影/涟漪 |
| 音频 | 仅 SFX | 程序化 BGM，静音拆rig，菜单 M 键 |
| 数值 | 散落魔法数 | `CAMERA`/`FEEL` 已建组，session 已接入 |
| 循环 | tick 抛错会卡死 rAF | 先预约再 tick；dispose 后 start 拒绝 |

## 潜在边界风险

1. `themeAt`（钳制）与 `themeCycleAt`（循环）双路径仍在；新绘制必须走 cycle。
2. `camera.ts`/`physics.ts`/`player.ts` 仍内联与 `CAMERA`/`FEEL` 同值的副本。
3. `physics → kickCamera` 耦合未拆。
4. HUD 模块级动画状态可能跨局泄漏。
5. 实体数组只增不删；已测到 10 万距离仍便宜，但 Round 3 可扫尾回收。
6. 探针磁带在新世界种子下会提前死亡（HP=0）；长局探针关碰撞所以仍能跑满。
7. 真实画布 60fps / GPU 填充仍未测。
8. 受击顿帧 `FEEL.hitstopS` 尚无消费方。

## SOTA 验收差距（Round 3 冲刺）

- [ ] camera/physics/player 改读 `CAMERA`/`FEEL` 并删内联副本
- [ ] 受击 hitstop + 加速速度线
- [ ] HUD `offChute01` 预警、跨局重置
- [ ] 远离玩家的实体回收
- [ ] `themeAt` 与循环语义对齐或文档标明废弃
- [ ] README / SOTA_BAR / ARCHITECTURE 与现网行为对齐
- [ ] 刷新 BENCH.md 快照（长局不再空）
- [ ] 浏览器里走一遍标题→再来一局
