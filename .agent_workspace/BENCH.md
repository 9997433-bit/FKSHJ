# Round 2 基准与确定性探针

## 入口

```bash
npm run bench
npm run probe
npm run smoke
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

## 实测基线

以下数据来自 2026-08-26 UTC 在 commit `d24d745` 上的一次 `npm run bench`。
每项数字是脚本预热 2 次后采集 7 个样本所得的中位数与 p95，并非预算值。运行环境为
Node `v22.14.0`、4 vCPU Intel Xeon 虚拟机，预算倍数为默认值 `1`。

| 日期 | commit | Node / CPU | raft median / p95 | debris median / p95 | prod-consume median / p95 | 结论 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 2026-08-26 | `d24d745` | Node v22.14.0 / Intel Xeon（4 vCPU） | 9.337 / 13.766 ms | 158.246 / 164.065 ms | 7.852 / 7.940 ms | 3/3 通过 |

对应吞吐量分别为 2,620,656、75,832、76,414,022 ops/s；本轮 workload
checksum 为 `925273169`。

## Session 确定性探针

`probe-session.ts` 使用种子 `0x5ea52026` 和固定 300 tick 输入磁带。磁带先按住
`D`、再按住 `W` 开船，随后在开局 3×3 木筏东侧铺两格地基并放置收集器。
脚本创建两局、以固定 `1/60 s` 步长重放，并逐字节比较按稳定键序列化的状态轨迹。
不一致时输出首个差异位置并失败。

2026-08-26 实测结果为 `ok: true`、`status: "deterministic"`，种子
`1587879974`，共推进 300 tick、重放 9 个磁带事件。两局轨迹均为 2,389 bytes，
稳定哈希为 `728b59b5`。

## Smoke

`npm run smoke` 实测通过，共检查 16 个必需文件。

## Round 3 当前 HEAD 复测

2026-08-26 UTC 在 commit `3da67417de15bc65a290400bdf7045d173ee5c81`
上使用 Node `v22.14.0` 和默认预算倍数 `1` 依次实跑
`npm run probe`、`npm run bench`、`npm run smoke`。

| workload | median | p95 | 预算 | 结论 |
| --- | ---: | ---: | ---: | --- |
| raft-expansion | 9.211 ms | 9.550 ms | 120 ms | 通过 |
| debris-generation | 159.228 ms | 163.834 ms | 225 ms | 通过 |
| production-consumption-step | 7.885 ms | 7.958 ms | 80 ms | 通过 |

基准汇总为 3/3 通过，workload checksum 为 `925273169`。确定性探针结果为
`ok: true`、`status: "deterministic"`，probe hash 为 `728b59b5`（300 tick、
9 个磁带事件、2,389 bytes）。Smoke 检查 16/16 个必需文件并通过。

## Round 1 gpt-probe 当前实测

2026-08-26 UTC 在 commit `ffca49b9fc29d19b3be41314222fc9e49b4c454e`
上使用 Node `v22.14.0`、4 vCPU 和默认预算倍数 `1` 实测。目标游戏目录为
`games/sea/`；因 npm scripts 定义在仓库根 `package.json`，三个命令均从仓库根
`/workspace` 执行。

| 命令 / workload | median | p95 | 预算 | 结论 |
| --- | ---: | ---: | ---: | --- |
| `npm run probe` | — | — | — | 确定性通过，hash `728b59b5` |
| raft-expansion | 9.148 ms | 9.634 ms | 120 ms | 通过 |
| debris-generation | 158.985 ms | 163.982 ms | 225 ms | 通过 |
| production-consumption-step | 7.879 ms | 7.928 ms | 80 ms | 通过 |
| `npm run smoke` | — | — | — | 17 个源文件通过（`dist/` 为构建产物，不列入必需） |

`npm run bench` 汇总为 3/3 通过，workload checksum 为 `925273169`；对应吞吐量
分别为 2,674,637、75,479、76,153,304 ops/s。探针使用 300 tick、9 个输入磁带
事件，轨迹为 2,389 bytes，结果为 `ok: true`、`status: "deterministic"`。

Smoke 同时验证 hub 入口 `index.html` 与 Sea 源入口 `games/sea/index.html`。
`dist/` 是构建产物、不列入 smoke 必需项。检查本身未运行 Vite。
