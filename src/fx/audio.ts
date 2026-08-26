type OscKind = OscillatorType;

export type SfxOptions = {
  /** 允许以静音状态开局；解锁前所有播放都是空操作。 */
  muted?: boolean;
  /** 关掉背景音乐，只留音效。 */
  music?: boolean;
};

/* ------------------------------------------------------------------ *
 * 背景音乐：一层持续 pad + 一层八分音符琶音，全部现场合成，无外部文件。
 * ------------------------------------------------------------------ */

const BGM = {
  /** 八分音符时长（秒），≈104 BPM */
  stepS: 0.288,
  /** 提前排期的时长；标签页被节流时靠它撑住不断音 */
  lookaheadS: 0.6,
  /** 排期心跳（ms） */
  tickMs: 120,
  /** 琶音单音峰值增益 */
  arpGain: 0.03,
  /** pad 增益 */
  padGain: 0.02,
  /** 淡入 / 淡出时间常数（秒） */
  fadeInS: 1.4,
  fadeOutS: 0.18,
} as const;

/** 根音 A3。和弦用相对根音的半音数表示。 */
const BGM_ROOT_HZ = 220;
/** 四小节循环：Am add9 → F6 → Dm7 → E7sus，够热带、不抢戏。 */
const BGM_CHORDS: readonly (readonly number[])[] = [
  [0, 7, 12, 14],
  [-4, 3, 8, 12],
  [-7, 0, 5, 9],
  [-5, 2, 7, 11],
];
/** 每小节的琶音走位（索引进和弦） */
const BGM_ARP = [0, 1, 2, 3, 2, 3, 1, 2];

type MusicRig = {
  gain: GainNode;
  padA: OscillatorNode;
  padB: OscillatorNode;
  lfo: OscillatorNode;
  timer: ReturnType<typeof setInterval>;
  nextStepAt: number;
  step: number;
};

/** 程序化合成音效，无外部音频文件。 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private wantMusic: boolean;
  private rig: MusicRig | null = null;
  private lastCoinAt = 0;
  private coinStep = 0;

  constructor(opts: SfxOptions = {}) {
    this.muted = opts.muted ?? false;
    this.wantMusic = opts.music ?? true;
  }

  /** 必须在用户手势里调用；没有 Web Audio 的环境下静默降级。 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      this.syncMusic();
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
      return;
    }
    this.syncMusic();
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
    // 静音时连振荡器一起停掉，别让 BGM 在零增益后面空转。
    this.syncMusic();
    return this.muted;
  }

  toggleMute(): boolean {
    return this.setMuted(!this.muted);
  }

  /** 开关背景音乐。解锁前调用只是记下意向，`unlock()` 时才真的响。 */
  setMusic(on: boolean): boolean {
    this.wantMusic = on;
    this.syncMusic();
    return this.wantMusic;
  }

  isMusicOn(): boolean {
    return this.rig !== null;
  }

  /** 唯一决定 BGM 该不该响的地方：意向、静音、AudioContext 三者取与。 */
  private syncMusic(): void {
    const should = this.wantMusic && !this.muted && this.ctx !== null;
    if (should && !this.rig) this.startMusic();
    else if (!should && this.rig) this.stopMusic();
  }

  private startMusic(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.setTargetAtTime(1, ctx.currentTime, BGM.fadeInS);
    gain.connect(master);

    // pad：两个失谐振荡器过低通，滤波截止由一条极慢的 LFO 推着呼吸。
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.8;
    filter.connect(gain);

    const padGain = ctx.createGain();
    padGain.gain.value = BGM.padGain;
    padGain.connect(filter);

    const padA = ctx.createOscillator();
    padA.type = "sawtooth";
    padA.frequency.value = BGM_ROOT_HZ / 2;
    padA.connect(padGain);

    const padB = ctx.createOscillator();
    padB.type = "triangle";
    padB.frequency.value = (BGM_ROOT_HZ / 2) * 1.5;
    padB.detune.value = 7;
    padB.connect(padGain);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 240;
    lfo.connect(lfoDepth).connect(filter.frequency);

    padA.start();
    padB.start();
    lfo.start();

    this.rig = {
      gain,
      padA,
      padB,
      lfo,
      timer: setInterval(() => this.pumpMusic(), BGM.tickMs),
      nextStepAt: ctx.currentTime + 0.08,
      step: 0,
    };
    this.pumpMusic();
  }

  private stopMusic(): void {
    const rig = this.rig;
    this.rig = null;
    if (!rig) return;
    clearInterval(rig.timer);
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    rig.gain.gain.cancelScheduledValues(now);
    rig.gain.gain.setTargetAtTime(0.0001, now, BGM.fadeOutS);
    const stopAt = now + BGM.fadeOutS * 6;
    for (const osc of [rig.padA, rig.padB, rig.lfo]) {
      try {
        osc.stop(stopAt);
      } catch {
        // 已经停过了
      }
    }
    setTimeout(() => rig.gain.disconnect(), (BGM.fadeOutS * 6 + 0.2) * 1000);
  }

  /** 前瞻排期：把 lookahead 窗口内还没排的八分音符补上。 */
  private pumpMusic(): void {
    const ctx = this.ctx;
    const rig = this.rig;
    if (!ctx || !rig) return;
    // 后台标签页会把定时器压到 1s 一次，落后太多就重新对齐而不是补一串挤在一起的音。
    if (rig.nextStepAt < ctx.currentTime) rig.nextStepAt = ctx.currentTime + 0.02;
    const until = ctx.currentTime + BGM.lookaheadS;
    while (rig.nextStepAt < until) {
      this.scheduleStep(rig, rig.step, rig.nextStepAt);
      rig.step += 1;
      rig.nextStepAt += BGM.stepS;
    }
  }

  private scheduleStep(rig: MusicRig, step: number, at: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const chord = BGM_CHORDS[Math.floor(step / BGM_ARP.length) % BGM_CHORDS.length];
    const semis = chord[BGM_ARP[step % BGM_ARP.length] % chord.length];
    const freq = BGM_ROOT_HZ * Math.pow(2, semis / 12);

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, at);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(BGM.arpGain, at + 0.014);
    env.gain.exponentialRampToValueAtTime(0.0001, at + BGM.stepS * 0.95);
    osc.connect(env).connect(rig.gain);
    osc.start(at);
    osc.stop(at + BGM.stepS);

    // 小节头换和弦：pad 跟着滑到新的根音与五度。
    if (step % BGM_ARP.length === 0) {
      const root = (BGM_ROOT_HZ * Math.pow(2, chord[0] / 12)) / 2;
      rig.padA.frequency.setTargetAtTime(root, at, 0.35);
      rig.padB.frequency.setTargetAtTime(root * 1.5, at, 0.35);
    }
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
