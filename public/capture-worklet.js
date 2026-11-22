class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = [];
    this.count = 0;
    this.target = 2048;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    const copy = new Float32Array(channel);
    this.pending.push(copy);
    this.count += copy.length;

    if (this.count >= this.target) {
      const merged = new Float32Array(this.count);
      let offset = 0;
      for (const chunk of this.pending) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      this.port.postMessage(merged, [merged.buffer]);
      this.pending = [];
      this.count = 0;
    }
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
