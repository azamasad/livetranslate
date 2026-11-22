const WHISPER_RATE = 16000;

/** Box-filter resample into the 16 kHz rate Whisper expects. */
export function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === WHISPER_RATE) return input;
  if (fromRate <= 0 || input.length === 0) return new Float32Array();

  const outLength = Math.max(1, Math.round((input.length * WHISPER_RATE) / fromRate));
  const output = new Float32Array(outLength);
  const ratio = fromRate / WHISPER_RATE;

  for (let i = 0; i < outLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.ceil((i + 1) * ratio)));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j] ?? 0;
      count += 1;
    }
    output[i] = count === 0 ? 0 : sum / count;
  }

  return output;
}
