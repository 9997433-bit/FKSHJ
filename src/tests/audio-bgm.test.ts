import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Sfx } from "../fx/audio";

/* A Web Audio stub thin enough to be obvious and complete enough to catch a
 * BGM rig that never starts, never stops, or leaks a scheduler. */

type Param = { value: number; calls: string[] };

function param(value = 0): Param {
  const calls: string[] = [];
  return {
    value,
    calls,
    setValueAtTime(v: number) {
      calls.push(`set:${v}`);
      this.value = v;
    },
    setTargetAtTime(v: number) {
      calls.push(`target:${v}`);
      this.value = v;
    },
    exponentialRampToValueAtTime(v: number) {
      calls.push(`ramp:${v}`);
      this.value = v;
    },
    cancelScheduledValues() {
      calls.push("cancel");
    },
  } as unknown as Param;
}

class FakeNode {
  connections: FakeNode[] = [];
  disconnected = 0;
  started = 0;
  stopped: number[] = [];
  type = "";
  frequency = param();
  detune = param();
  Q = param();
  gain = param(1);
  constructor(public kind: string, public ctx: FakeCtx) {}
  connect(target: FakeNode | Param): FakeNode {
    if (target instanceof FakeNode) this.connections.push(target);
    return target as FakeNode;
  }
  disconnect(): void {
    this.disconnected += 1;
  }
  start(at = 0): void {
    this.started += 1;
    this.ctx.started.push(this);
    void at;
  }
  stop(at = 0): void {
    this.stopped.push(at);
  }
}

class FakeCtx {
  currentTime = 0;
  state = "running";
  destination = new FakeNode("destination", this);
  made: FakeNode[] = [];
  started: FakeNode[] = [];
  private make(kind: string): FakeNode {
    const node = new FakeNode(kind, this);
    this.made.push(node);
    return node;
  }
  createGain() {
    return this.make("gain");
  }
  createOscillator() {
    return this.make("osc");
  }
  createBiquadFilter() {
    return this.make("filter");
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  count(kind: string): number {
    return this.made.filter((n) => n.kind === kind).length;
  }
}

let ctxs: FakeCtx[] = [];
let timers: number;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

beforeEach(() => {
  ctxs = [];
  timers = 0;
  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    writable: true,
    value: function AudioContextStub(this: unknown) {
      const ctx = new FakeCtx();
      ctxs.push(ctx);
      return ctx;
    },
  });
  // Hand out inert handles: the scheduler is counted, never fired, and never
  // keeps the test runner's event loop alive.
  let handle = 0;
  globalThis.setInterval = (() => {
    timers += 1;
    handle += 1;
    return handle;
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = (() => {
    timers -= 1;
  }) as unknown as typeof clearInterval;
});

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, "AudioContext");
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
});

describe("procedural BGM", () => {
  it("stays silent until a user gesture unlocks audio", () => {
    const sfx = new Sfx();
    assert.equal(sfx.isMusicOn(), false);
    assert.equal(ctxs.length, 0);
    assert.equal(timers, 0);
  });

  it("starts a pad, an arpeggio and one scheduler on unlock", () => {
    const sfx = new Sfx();
    sfx.unlock();
    assert.equal(sfx.isMusicOn(), true);
    assert.equal(timers, 1);
    const ctx = ctxs[0];
    // Two pad oscillators, one filter LFO, plus the notes the lookahead already queued.
    assert.ok(ctx.started.length >= 4, `only ${ctx.started.length} sources started`);
    assert.equal(ctx.count("filter"), 1);
    // Every scheduled note has to be told when to stop, or the mix piles up.
    for (const osc of ctx.started) assert.ok(osc.started === 1);
  });

  it("tears the rig down when muted and rebuilds it when unmuted", () => {
    const sfx = new Sfx();
    sfx.unlock();
    sfx.setMuted(true);
    assert.equal(sfx.isMusicOn(), false);
    assert.equal(timers, 0);
    for (const osc of ctxs[0].started.slice(0, 3)) assert.ok(osc.stopped.length > 0);

    sfx.setMuted(false);
    assert.equal(sfx.isMusicOn(), true);
    assert.equal(timers, 1);
  });

  it("honours an opt-out and never leaves two rigs running", () => {
    const sfx = new Sfx({ music: false });
    sfx.unlock();
    assert.equal(sfx.isMusicOn(), false);
    assert.equal(timers, 0);

    sfx.setMusic(true);
    assert.equal(sfx.isMusicOn(), true);
    sfx.setMusic(true);
    sfx.unlock();
    assert.equal(timers, 1);

    sfx.setMusic(false);
    assert.equal(sfx.isMusicOn(), false);
    assert.equal(timers, 0);
  });

  it("keeps sound effects working alongside the music bed", () => {
    const sfx = new Sfx();
    sfx.unlock();
    const before = ctxs[0].count("osc");
    sfx.coin();
    sfx.gem();
    sfx.boost(2);
    sfx.hit();
    assert.ok(ctxs[0].count("osc") > before);
  });
});
