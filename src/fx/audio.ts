type OscKind = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private muted = false;

  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private beep(freq: number, dur: number, type: OscKind, gain = 0.06): void {
    if (this.muted || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  coin(): void {
    this.beep(880, 0.08, "triangle", 0.05);
  }
  gem(): void {
    this.beep(1180, 0.12, "square", 0.04);
  }
  boost(): void {
    this.beep(240, 0.16, "sawtooth", 0.04);
  }
  hit(): void {
    this.beep(90, 0.18, "square", 0.07);
  }
  jump(): void {
    this.beep(420, 0.1, "sine", 0.05);
  }
}
