import { readFileSync, statSync } from "node:fs";

const required = [
  "index.html",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "src/main.ts",
  "src/session.ts",
  "src/data/constants.ts",
  "src/game/engine.ts",
  "src/game/loop.ts",
  "src/index.css",
  ".agent_workspace/GAME_SPEC.md",
  ".agent_workspace/PROGRESS.md",
  ".agent_workspace/BENCH.md",
  "scripts/bench.ts",
  "scripts/probe-session.ts",
  "scripts/smoke.mjs",
];

const failures = [];
for (const f of required) {
  try {
    const stat = statSync(f);
    if (!stat.isFile() || stat.size === 0) failures.push(`${f} missing or empty`);
  } catch {
    failures.push(`missing ${f}`);
  }
}
const html = readFileSync("index.html", "utf8");
if (!html.includes("疯狂水世界")) failures.push("index.html missing title");
if (!html.includes('id="game"')) failures.push("index.html missing canvas");
if (failures.length) {
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`smoke ok: ${required.length} files`);
