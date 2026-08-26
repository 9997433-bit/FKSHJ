/**
 * 音频 —— 全部现场合成，零外部音频文件。
 *
 * 契约：
 * - `unlock()` 必须在用户手势里调用（浏览器不允许自动出声）；没有
 *   Web Audio 的环境（SSR / 单测 / 老浏览器）静默降级成空操作，
 *   所有播放接口照常可调，只是不响。
 * - `toggleMute()` / `setMuted()` 是全局开关：静音时连振荡器一起停，
 *   不让环境音在零增益后面空转。
 * - 每个音效都是「几个振荡器 + 一段带通白噪」的短包络，
 *   互不共享节点，随便同时触发也不会互相掐断。
 */

export type SfxOptions = {
  /** 允许以静音状态开局 */
  muted?: boolean;
  /** 关掉环境音床，只留音效 */
  ambient?: boolean;
};

/* ------------------------------------------------------------------ *
 * 环境音床：一层海风般的滤波噪声 + 一层极慢的低频 pad。
 * 不是「背景音乐」，只是让海面不至于死寂；风暴时会自己变凶。
 * ------------------------------------------------------------------ */

const AMBIENT = {
  /** 噪声层增益 */
  windGain: 0.014,
  /** pad 层增益 */
  padGain: 0.016,
  /** 淡入 / 淡出时间常数（秒） */
  fadeInS: 2.2,
  fadeOutS: 0.25,
  /** 风声带通中心频率（Hz） */
  windHz: 380,
  /** 呼吸 LFO 频率（Hz） */
  breathHz: 0.06,
} as const;

type AmbientRig = {
  gain: GainNode;
  wind: AudioBufferSourceNode | null;
  windFilter: BiquadFilterNode | null;
  padA: OscillatorNode;
  padB: OscillatorNode;
  lfo: OscillatorNode;
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private wantAmbient: boolean;
  private rig: AmbientRig | null = null;
  private lastWarnAt = -99;
  private lastScoopAt = 0;
  private scoopStep = 0;
  /** 白噪缓冲只建一次：水花、锤击、撞击、风声都从它上面取 */
  private noiseBuf: AudioBuffer | null = null;

  constructor(opts: SfxOptions = {}) {
    this.muted = opts.muted ?? false;
    this.wantAmbient = opts.ambient ?? true;
  }

  /** 必须在用户手势里调用；没有 Web Audio 就静默降级。 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      this.syncAmbient();
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
    this.syncAmbient();
  }

  /** 已解锁且没静音 —— UI 想显示喇叭图标状态时读它。 */
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
    this.syncAmbient();
    return this.muted;
  }

  /** 一键切静音，返回切换后的状态。 */
  toggleMute(): boolean {
    return this.setMuted(!this.muted);
  }

  /** 开关环境音床。解锁前调用只记下意向，`unlock()` 时才真的响。 */
  setAmbient(on: boolean): boolean {
    this.wantAmbient = on;
    this.syncAmbient();
    return this.wantAmbient;
  }

  isAmbientOn(): boolean {
    return this.rig !== null;
  }

  /**
   * 风的凶狠程度 0..1：风暴来了把带通推高、增益抬起来。
   * 没有音床时是空操作，会话可以无脑每帧调。
   */
  setStorm(storm01: number): void {
    const ctx = this.ctx;
    const rig = this.rig;
    if (!ctx || !rig || !rig.windFilter) return;
    const s = Math.max(0, Math.min(1, storm01));
    rig.windFilter.frequency.setTargetAtTime(AMBIENT.windHz * (1 + s * 2.6), ctx.currentTime, 0.6);
    rig.gain.gain.setTargetAtTime(1 + s * 1.8, ctx.currentTime, 0.8);
  }

  /** 唯一决定音床该不该响的地方：意向、静音、AudioContext 三者取与。 */
  private syncAmbient(): void {
    const should = this.wantAmbient && !this.muted && this.ctx !== null;
    if (should && !this.rig) this.startAmbient();
    else if (!should && this.rig) this.stopAmbient();
  }

  private startAmbient(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.setTargetAtTime(1, ctx.currentTime, AMBIENT.fadeInS);
    gain.connect(master);

    // 风：白噪过带通，带通中心由一条极慢 LFO 推着呼吸
    let wind: AudioBufferSourceNode | null = null;
    let windFilter: BiquadFilterNode | null = null;
    const buf = this.ensureNoise();
    if (buf) {
      windFilter = ctx.createBiquadFilter();
      windFilter.type = "bandpass";
      windFilter.frequency.value = AMBIENT.windHz;
      windFilter.Q.value = 0.7;

      const windGain = ctx.createGain();
      windGain.gain.value = AMBIENT.windGain;
      windFilter.connect(windGain).connect(gain);

      wind = ctx.createBufferSource();
      wind.buffer = buf;
      wind.loop = true;
      wind.connect(windFilter);
      wind.start();
    }

    // pad：两个失谐低频，垫住底部
    const padGain = ctx.createGain();
    padGain.gain.value = AMBIENT.padGain;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 420;
    padGain.connect(padFilter).connect(gain);

    const padA = ctx.createOscillator();
    padA.type = "sine";
    padA.frequency.value = 82.4;
    padA.connect(padGain);

    const padB = ctx.createOscillator();
    padB.type = "triangle";
    padB.frequency.value = 123.5;
    padB.detune.value = 9;
    padB.connect(padGain);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = AMBIENT.breathHz;
    const depth = ctx.createGain();
    depth.gain.value = 160;
    lfo.connect(depth).connect(padFilter.frequency);

    padA.start();
    padB.start();
    lfo.start();

    this.rig = { gain, wind, windFilter, padA, padB, lfo };
  }

  private stopAmbient(): void {
    const rig = this.rig;
    this.rig = null;
    if (!rig) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    rig.gain.gain.cancelScheduledValues(now);
    rig.gain.gain.setTargetAtTime(0.0001, now, AMBIENT.fadeOutS);
    const stopAt = now + AMBIENT.fadeOutS * 6;
    const sources: { stop(when?: number): void }[] = [rig.padA, rig.padB, rig.lfo];
    if (rig.wind) sources.push(rig.wind);
    for (const s of sources) {
      try {
        s.stop(stopAt);
      } catch {
        // 已经停过了
      }
    }
    setTimeout(() => rig.gain.disconnect(), (AMBIENT.fadeOutS * 6 + 0.2) * 1000);
  }

  /* ---------------------------------------------------------------- *
   * 合成基元
   * ---------------------------------------------------------------- */

  private ensureNoise(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.noiseBuf) return this.noiseBuf;
    // 单测里的 AudioContext 桩没有 createBuffer：噪声层整体跳过
    if (typeof ctx.createBuffer !== "function" || typeof ctx.createBufferSource !== "function") {
      return null;
    }
    try {
      const rate = ctx.sampleRate || 44100;
      const buf = ctx.createBuffer(1, Math.ceil(rate * 0.8), rate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      return buf;
    } catch {
      return null;
    }
  }

  /** 一个带包络的振荡器音；`endFreq > 0` 时做指数滑音。 */
  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
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

  /** 一段扫频白噪：水花、木锤、撞击的「质感」都靠它。 */
  private noise(dur: number, gain: number, from = 2400, to = 400, delay = 0, q = 0.9): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const buf = this.ensureNoise();
    if (!buf) return;
    try {
      const t0 = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = q;
      band.frequency.setValueAtTime(from, t0);
      band.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.02, dur * 0.25));
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      src.connect(band).connect(env).connect(this.master ?? ctx.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch {
      // 边角情况丢一声，别把整帧带崩
    }
  }

  /** 短琶音：几个音依次落下。 */
  private arp(freqs: number[], type: OscillatorType, gain: number, step = 0.06, dur = 0.14): void {
    for (let i = 0; i < freqs.length; i++) {
      this.tone(freqs[i], dur, type, gain * (1 - i * 0.08), i * step);
    }
  }

  /* ---------------------------------------------------------------- *
   * 音效
   * ---------------------------------------------------------------- */

  /**
   * 捞：抄起一把海水的「哗」+ 到手的上扬音。
   * 连着捞时音阶逐级上行，手感跟连击一样上头；断一秒回到起点。
   */
  scoop(): void {
    const ctx = this.ctx;
    const now = ctx ? ctx.currentTime : 0;
    if (now - this.lastScoopAt > 1.1) this.scoopStep = 0;
    else this.scoopStep = Math.min(6, this.scoopStep + 1);
    this.lastScoopAt = now;

    this.noise(0.22, 0.05, 2800, 420);
    this.tone(392 * Math.pow(2, this.scoopStep / 12), 0.13, "sine", 0.036, 0.01, 0);
    this.tone(180, 0.09, "triangle", 0.026, 0.02, 120);
  }

  /** 建：两记木锤 + 一个上行二度的完成音。 */
  build(): void {
    this.tone(160, 0.07, "square", 0.05, 0, 96);
    this.noise(0.06, 0.042, 2000, 500);
    this.tone(190, 0.07, "square", 0.045, 0.11, 110);
    this.noise(0.06, 0.038, 1800, 460, 0.11);
    this.arp([523.3, 784], "triangle", 0.038, 0.07, 0.16);
  }

  /** 建造被拒（格子不合法 / 材料不够）：一声短促的闷响。 */
  deny(): void {
    this.tone(150, 0.13, "square", 0.04, 0, 92);
  }

  /**
   * 警告：两声下行汽笛 + 一记低频。风暴预警、海盗来袭共用。
   * 自带 0.6s 节流，一波海盗不会叠成一片糊。
   */
  warn(): void {
    const ctx = this.ctx;
    const now = ctx ? ctx.currentTime : 0;
    if (now - this.lastWarnAt < 0.6) return;
    this.lastWarnAt = now;
    this.tone(680, 0.28, "sawtooth", 0.042, 0, 430);
    this.tone(680, 0.28, "sawtooth", 0.042, 0.34, 430);
    this.tone(110, 0.6, "square", 0.02);
  }

  /** 受击：木头被撞裂的闷响 + 碎裂噪声。风暴砸格子、海盗拆房都用它。 */
  hit(): void {
    this.tone(180, 0.22, "square", 0.06, 0, 60);
    this.noise(0.18, 0.045, 1400, 180);
  }

  /** 炮塔开火：短促的低频砰 + 一层扫频噪声。 */
  shoot(): void {
    this.tone(240, 0.1, "square", 0.04, 0, 90);
    this.noise(0.1, 0.035, 3200, 700);
  }

  /** 熬过一天：一串上行钟音。 */
  dayBreak(): void {
    this.arp([523.3, 659.3, 784, 1046.5], "triangle", 0.04, 0.1, 0.42);
  }

  /** 结算：一串下行的低音，明确告诉玩家「这局到此为止」。 */
  gameOver(): void {
    this.arp([392, 329.6, 261.6, 196], "triangle", 0.05, 0.16, 0.5);
    this.noise(0.9, 0.03, 700, 90, 0.1, 0.5);
  }
}
