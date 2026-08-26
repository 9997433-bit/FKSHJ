# Round 1 基准与确定性探针

## 入口

```bash
npm run bench
npm run probe
```

`bench` 是无 DOM 的微基准，覆盖三个预期热路径：

1. **木筏扩张**：从 3×3 木筏开始，以四向邻接 frontier 扩至 2,048 格，测
   `Set` 查重、邻接候选维护和铺板循环。
2. **垃圾生成**：固定 xorshift32 种子，持续生成、漂移并原地压缩回收漂浮物数组。
3. **产消步进**：固定 `1/60 s` 步长推进收集器、净水机、钓鱼台、岛民消耗、
   资源上限和周期性建造分支。

每项先预热 2 次，再取 7 个样本。预算判定使用中位数，p95 仅用于观察抖动；
每次运行还校验 workload checksum，避免基准本身意外变成不确定。默认预算如下：

| workload | 单样本工作量 | median 预算 |
| --- | ---: | ---: |
| raft-expansion | 12 × (2,048 - 9) 次铺板 | 120 ms |
| debris-generation | 12,000 帧 | 225 ms |
| production-consumption-step | 600,000 步 | 80 ms |

慢速或共享 CI 机器可显式设置 `BENCH_BUDGET_MULTIPLIER`，例如
`BENCH_BUDGET_MULTIPLIER=1.5 npm run bench`。正式基线必须使用默认值，并记录
Node 版本、CPU、commit 和空闲机器状态。

## 基线占位表

Round 1 各玩法模块仍在并行接线；合并后的正式数据在同一台空闲机器连续跑三次，
填写三次运行的中位数，不能把预算值当作实测值。

| 日期 | commit | Node / CPU | raft median / p95 | debris median / p95 | prod-consume median / p95 | 结论 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待接线后建立基线 |

## Session 确定性探针

`probe-session.ts` 使用种子 `0x5ea52026` 和固定 300 tick 输入磁带。磁带先按住
`D`、再按住 `W` 开船，随后在开局 3×3 木筏东侧铺两格地基并放置收集器。
脚本创建两局、以固定 `1/60 s` 步长重放，并逐字节比较按稳定键序列化的状态轨迹。
不一致时输出首个差异位置并失败。

当前 `src/session.ts` 仍是 Round 1 空壳，只有 `update/draw`，因此探针会明确输出
`status: "not-wired"`（成功退出，避免阻塞并行合并），不会误报确定性通过。父调度器
接线时应提供以下 headless 契约之一：

- `new Session({ seed, headless: true })`，可选 `resetForProbe(seed)` 或
  `setProbeSeed(seed)`；
- `applyProbeAction(action)` 或 `dispatchProbeAction(action)`；
- `probeSnapshot()` 或 `snapshot()`，只返回模拟状态，不含墙钟、渲染对象或函数。

接线后 `npm run probe` 会自动从 `not-wired` 切换为实际双跑比较。
