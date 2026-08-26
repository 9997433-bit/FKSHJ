type OscKind = OscillatorType;

export type SfxOptions = {
  /** 允许以静音状态开局；解锁前所有播放都是空操作。 */
  muted?: boolean;
};

/** 程序化合成音效，无外部音频文件。 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private lastCoinAt = 0;
  private coinStep = 0;

  constructor(opts: SfxOptions = {}) {
    this.muted = opts.muted ?? false;
  }

  /** 必须在用户手势里调用；没有 Web Audio 的环境下静默降级。 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    if (typeof AudioContext === "undefined") return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  get enabled(): boolean {
    return this.ctx !== null && !this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): boolean {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  toggleMute(): boolean {
    return this.setMuted(!this.muted);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscKind,
    gain: number,
    delay = 0,
    endFreq = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq > 0) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.015, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master ?? ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /** 短琶音：几个音符依次落下，用于宝石和水环。 */
  private arp(freqs: number[], type: OscKind, gain: number, step = 0.055, dur = 0.13): void {
    for (let i = 0; i < freqs.length; i++) {
      this.tone(freqs[i], dur, type, gain * (1 - i * 0.08), i * step);
    }
  }

  coin(): void {
    const ctx = this.ctx;
    const now = ctx ? ctx.currentTime : 0;
    // 连拾时音阶逐级上行，断连后回到起点
    if (now - this.lastCoinAt > 0.9) this.coinStep = 0;
    else this.coinStep = Math.min(6, this.coinStep + 1);
    this.lastCoinAt = now;
    this.tone(784 * Math.pow(2, this.coinStep / 12), 0.09, "triangle", 0.05);
  }

  gem(): void {
    this.arp([880, 1174.7, 1568], "triangle", 0.05);
  }

  ring(): void {
    this.arp([659.3, 987.8, 1318.5, 1760], "square", 0.038, 0.05, 0.16);
    this.tone(2637, 0.22, "sine", 0.02, 0.2);
  }

  boost(tier: 1 | 2 = 1): void {
    const dur = tier === 2 ? 0.34 : 0.2;
    this.tone(180, dur, "sawtooth", 0.045, 0, tier === 2 ? 720 : 480);
    if (tier === 2) this.tone(90, dur, "square", 0.03, 0.02, 240);
  }

  hit(): void {
    this.tone(180, 0.22, "square", 0.07, 0, 60);
  }

  jump(): void {
    this.tone(420, 0.12, "sine", 0.05, 0, 720);
  }
}
