# 疯狂水世界 — Probe / Benchmark Baseline

Measured on 2026-08-26 with Node.js v22.14.0 on x86_64. Run with:

```sh
npm run bench
npm run probe
```

## Microbenchmarks

Each case gets 3 warmups and 9 measured samples. The budget is checked against the
median to reduce one-off scheduler and GC noise; p95 is reported for visibility.

| Workload | Median | p95 | Budget (median) | Result |
| --- | ---: | ---: | ---: | --- |
| `generateWorld` × 200 seeds | 1.479 ms | 1.574 ms | ≤ 75 ms | PASS |
| `stepSpeed` × 200,000 steps | 2.813 ms | 2.831 ms | ≤ 50 ms | PASS |
| `stepParticles` × 360 particles × 300 frames | 0.391 ms | 0.423 ms | ≤ 75 ms | PASS |

The particle budget is 0.25 ms per simulated frame at the 360-particle gameplay
cap, leaving most of a 16.67 ms frame for rendering and other systems. The world
and speed budgets respectively cap average work at 0.375 ms/world and
0.25 µs/step.

## Deterministic session probe

Run ID `12648430` (`0xc0ffee`) was replayed twice using the same 1,200-frame,
27-event input tape. Both the replay and long-run probes explicitly construct
their initial world with `seedWorld(runId, 0)`. Pinning `dateDay` to zero avoids
the function's boot-day default, so this benchmark fixture does not change
across calendar days. The complete replay snapshots matched exactly.

| Metric | Value |
| --- | ---: |
| Score | 586.233 |
| Distance | 1191.165 |
| HP | 0 |
| Coins / pickups | 12 / 10 |
| Hazards hit | 3 |
| Boosters used | 0 |
| Final speed | 159.013 |
| Run over | true |

`pickupsTaken` can read lower than `coins` because `recycleBehind` drops
entities already behind the raft; score and coins are the source of truth.

## Long-run world coverage probe

The same run ID was advanced with neutral steering until it passed 10,000 world
units. Collision damage was suppressed so the session could not end before the
coverage measurement.

| Metric | Value |
| --- | ---: |
| Target / reached distance | 10000 / 10000.253 |
| Frames simulated | 8576 |
| Remaining pickups ahead | 111 |
| Remaining hazards ahead | 46 |
| Farthest pickup / hazard z | 17154.400 / 17061.600 |
| World empty ahead | **false** |

Streaming generation keeps both pickups and hazards ahead of the player beyond
distance 10,000; the former empty-world condition is no longer present.

## Scope and risks

These are CPU microbenchmarks, not end-to-end frame timings. The particle case
measures update/removal scanning with 360 live particles; it excludes particle
spawn and Canvas drawing. Browser rendering, GPU/driver behavior, audio, and
GC under a full play session still need browser profiling.
