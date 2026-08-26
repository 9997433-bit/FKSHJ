import { readFileSync, statSync } from "node:fs";

const required = [
  "index.html",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "src/main.ts",
  "src/index.css",
  "src/session.ts",
  "src/data/constants.ts",
  "src/data/save.ts",
  "src/entities/booster.ts",
  "src/entities/collectible.ts",
  "src/entities/obstacle.ts",
  "src/entities/player.ts",
  "src/fx/audio.ts",
  "src/fx/particles.ts",
  "src/fx/splash.ts",
  "src/game/camera.ts",
  "src/game/collision.ts",
  "src/game/engine.ts",
  "src/game/input.ts",
  "src/game/loop.ts",
  "src/game/physics.ts",
  "src/ui/hud.ts",
  "src/ui/menus.ts",
  "src/ui/theme.ts",
  "src/world/levels.ts",
  "src/world/track.ts",
  "src/world/water.ts",
  "scripts/bench.ts",
  "scripts/probe-session.ts",
  "scripts/smoke.mjs",
  ".agent_workspace/BENCH.md",
  ".agent_workspace/GAME_SPEC.md",
];

const failures = [];
for (const f of required) {
  try {
    const stat = statSync(f);
    if (!stat.isFile()) failures.push(`${f} is not a regular file`);
    else if (stat.size === 0) failures.push(`${f} is empty`);
  } catch {
    failures.push(`missing ${f}`);
  }
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

let html = "";
try {
  html = readFileSync("index.html", "utf8");
} catch {
  // The required-file check above reports the actionable error.
}
check(html.includes("<title>疯狂水世界</title>"), "index.html missing title");
check(/<canvas\b[^>]*\bid=["']game["']/.test(html), "index.html missing #game canvas");
check(/<div\b[^>]*\bid=["']overlay["']/.test(html), "index.html missing #overlay");
check(
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']\/src\/main\.ts["']/.test(html),
  "index.html missing module entrypoint",
);
check(
  !/(?:src|href)=["']https?:\/\//i.test(html),
  "index.html references an external HTTP resource",
);

let pkg;
try {
  pkg = JSON.parse(readFileSync("package.json", "utf8"));
} catch {
  failures.push("package.json is not valid JSON");
}
check(pkg?.type === "module", 'package.json must set "type": "module"');
for (const script of ["build", "test", "bench", "smoke"]) {
  check(typeof pkg?.scripts?.[script] === "string" && pkg.scripts[script].length > 0, `missing npm script: ${script}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`smoke failed: ${failures.length} check(s)`);
  process.exit(1);
}
console.log(`smoke ok: ${required.length} files and 10 content checks`);
