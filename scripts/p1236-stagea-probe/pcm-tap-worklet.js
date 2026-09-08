// P1236 Stage A probe — the same AudioWorkletProcessor shape Decision 1 plans for
// `public/audio/pcm-tap-worklet.js`. Reports frame count and peak amplitude upstream; it
// does not buffer, because Stage A only asks whether samples ARRIVE and are NON-SILENT.
class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = 0;
    this.peak = 0;
    this.sum = 0;
    this.n = 0;
    this.lastPost = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      this.frames += ch.length;
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > this.peak) this.peak = a;
        this.sum += ch[i] * ch[i];
        this.n++;
      }
    }
    // currentTime is provided by the AudioWorkletGlobalScope.
    if (currentTime - this.lastPost >= 1) {
      this.lastPost = currentTime;
      const rms = this.n ? Math.sqrt(this.sum / this.n) : 0;
      this.port.postMessage({ frames: this.frames, peak: this.peak, rms });
      this.peak = 0; this.sum = 0; this.n = 0;
    }
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
