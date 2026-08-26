import { readFileSync, existsSync } from "node:fs";

const required = [
  "index.html",
  "package.json",
  "src/main.ts",
  "src/session.ts",
  "src/data/constants.ts",
  ".agent_workspace/GAME_SPEC.md",
];

let failed = 0;
for (const f of required) {
  if (!existsSync(f)) {
    console.error("missing", f);
    failed += 1;
  }
}

const html = readFileSync("index.html", "utf8");
if (!html.includes("疯狂水世界")) {
  console.error("index.html missing title");
  failed += 1;
}

if (failed) {
  console.error(`smoke failed: ${failed}`);
  process.exit(1);
}
console.log("smoke ok");
