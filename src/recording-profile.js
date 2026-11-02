// Perfis de qualidade da gravação. WebM com VP9 + Opus segue como formato único:
// é o melhor equilíbrio entre eficiência e custo de codificação em tempo real
// no MediaRecorder (AV1 em software pesa demais) e é o que o fluxo de transcrição aceita.
export const QUALITY_PRESETS = {
  alta: { label: 'Alta', width: 1920, height: 1080, frameRate: 30,
    videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 },
  equilibrada: { label: 'Equilibrada', width: 1920, height: 1080, frameRate: 30,
    videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 },
  economica: { label: 'Econômica', width: 1280, height: 720, frameRate: 24,
    videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 }
};

export const DEFAULT_QUALITY = 'equilibrada';

export function resolveQuality(name) {
  return Object.hasOwn(QUALITY_PRESETS, name) ? name : DEFAULT_QUALITY;
}

export function pickMimeType(mode, isSupported = () => false) {
  const candidates = mode === 'video'
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find(isSupported) || candidates.at(-1);
}

export function buildDisplayConstraints(quality) {
  const { width, height, frameRate } = QUALITY_PRESETS[resolveQuality(quality)];
  return { width: { max: width }, height: { max: height }, frameRate: { max: frameRate } };
}

export function buildRecorderOptions(mode, mimeType, quality) {
  const preset = QUALITY_PRESETS[resolveQuality(quality)];
  const options = { mimeType, audioBitsPerSecond: preset.audioBitsPerSecond };
  if (mode === 'video') options.videoBitsPerSecond = preset.videoBitsPerSecond;
  return options;
}
