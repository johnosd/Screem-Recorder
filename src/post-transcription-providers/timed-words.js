// Normaliza palavras com tempo de qualquer provedor: segmentos para o SRT e contagem de tempos.
export function summarizeTiming(words) {
  const segments = words.map(word => ({ start: word.start, end: word.end, text: word.text }));
  const timingInfo = { words: words.length, valid: 0, missing: 0, invalid: 0 };
  for (const word of words) {
    if (!Number.isFinite(word?.start) || !Number.isFinite(word?.end)) timingInfo.missing++;
    else if (word.start < 0 || word.end <= word.start ||
      typeof word.text !== 'string' || !word.text.trim()) timingInfo.invalid++;
    else timingInfo.valid++;
  }
  return { segments, timingInfo };
}
