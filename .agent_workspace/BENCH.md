# 疯狂水世界 — Probe / Benchmark Baseline

Measured on 2026-08-26 with Node.js v22.14.0 on x86_64. Run with:

```sh
npm run bench
node --import tsx scripts/probe-session.ts
```

## Microbenchmarks

Each case gets 3 warmups and 9 measured samples. The budget is checked against the
median to reduce one-off scheduler and GC noise; p95 is reported for visibility.

| Workload | Median | p95 | Budget (median) | Result |
| --- | ---: | ---: | ---: | --- |
| `generateWorld` × 200 seeds | 1.057 ms | 1.413 ms | ≤ 75 ms | PASS |
| `stepSpeed` × 200,000 steps | 1.350 ms | 1.537 ms | ≤ 50 ms | PASS |
| `stepParticles` × 360 particles × 300 frames | 0.344 ms | 0.360 ms | ≤ 75 ms | PASS |

The particle budget is 0.25 ms per simulated frame at the 360-particle gameplay
cap, leaving most of a 16.67 ms frame for rendering and other systems. The world
and speed budgets respectively cap average work at 0.375 ms/world and
0.25 µs/step.

## Deterministic session probe

Run ID `12648430` (`0xc0ffee`) was replayed twice using the same 1,200-frame,
27-event input tape. The complete snapshots matched exactly.

| Metric | Value |
| --- | ---: |
| Score | 328.919 |
| Distance | 1394.593 |
| HP | 3 |
| Coins / pickups | 5 / 5 |
| Hazards hit | 2 |
| Final speed | 359.929 |
| Run over | false |

## Scope and risks

These are CPU microbenchmarks, not end-to-end frame timings. The particle case
measures update/removal scanning with 360 live particles; it excludes particle
spawn and Canvas drawing. Browser rendering, GPU/driver behavior, audio, and
GC under a full play session still need browser profiling.
