export function floatToInt16(floatArr) {
  const int16 = new Int16Array(floatArr.length);
  for (let i = 0; i < floatArr.length; i++) {
    const s = Math.max(-1, Math.min(1, floatArr[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

// Codifica PCM Int16 em blocos. `Mp3Encoder` vem do lamejs (carregado no worker).
export function encodePcmToMp3(Mp3Encoder, { left, right, sampleRate, kbps = 128 }, onProgress) {
  const channels = right ? 2 : 1;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);
  const parts = [];
  const blockSize = 1152;
  let lastReported = -1;
  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const encoded = right ? encoder.encodeBuffer(l, right.subarray(i, i + blockSize))
      : encoder.encodeBuffer(l);
    if (encoded.length > 0) parts.push(encoded);
    const pct = Math.floor((i / left.length) * 100);
    if (pct !== lastReported) { lastReported = pct; onProgress?.(pct / 100); }
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) parts.push(flushed);
  return parts;
}
