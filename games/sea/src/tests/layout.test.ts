import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("HTML entry points", () => {
  it("provides the sea game canvas", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

    assert.match(html, /<canvas\b[^>]*\bid=["']game["'][^>]*>/i);
  });

  it("links the repository entry point to the sea game", () => {
    const html = readFileSync(new URL("../../../../index.html", import.meta.url), "utf8");

    assert.match(html, /games\/sea/);
  });
});
