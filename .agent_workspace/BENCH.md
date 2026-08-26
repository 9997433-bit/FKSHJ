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
| `generateWorld` × 200 seeds | 2.040 ms | 2.171 ms | ≤ 75 ms | PASS |
| `stepSpeed` × 200,000 steps | 2.412 ms | 2.446 ms | ≤ 50 ms | PASS |
| `stepParticles` × 360 particles × 300 frames | 0.392 ms | 0.418 ms | ≤ 75 ms | PASS |

The particle budget is 0.25 ms per simulated frame at the 360-particle gameplay
cap, leaving most of a 16.67 ms frame for rendering and other systems. The world
and speed budgets respectively cap average work at 0.375 ms/world and
0.25 µs/step.

## Deterministic session probe

Run ID `12648430` (`0xc0ffee`) was replayed twice using the same 1,200-frame,
27-event input tape. The complete snapshots matched exactly.

| Metric | Value |
| --- | ---: |
| Score | 545.740 |
| Distance | 1388.701 |
| HP | 3 |
| Coins / pickups | 9 / 10 |
| Hazards hit | 4 |
| Boosters used | 1 |
| Final speed | 365.517 |
| Run over | false |

## Long-run world coverage probe

The same run ID was advanced with neutral steering until it passed 10,000 world
units. Collision damage was suppressed so the session could not end before the
coverage measurement.

| Metric | Value |
| --- | ---: |
| Target / reached distance | 10000 / 10000.503 |
| Frames simulated | 8619 |
| Remaining pickups ahead | 0 |
| Remaining hazards ahead | 0 |
| Farthest pickup / hazard z | 7169.800 / 7144.800 |
| World empty ahead | **true** |

The generated content currently ends near z=7,200, so the player has no pickups
or hazards ahead by distance 10,000. The probe reports this bug without failing,
allowing it to turn `worldEmptyAhead` false when streaming generation is added.

## Scope and risks

These are CPU microbenchmarks, not end-to-end frame timings. The particle case
measures update/removal scanning with 360 live particles; it excludes particle
spawn and Canvas drawing. Browser rendering, GPU/driver behavior, audio, and
GC under a full play session still need browser profiling.
