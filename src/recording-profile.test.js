import { DEFAULT_QUALITY, QUALITY_PRESETS, buildDisplayConstraints, buildRecorderOptions,
  pickMimeType, resolveQuality } from './recording-profile.js';

test('qualidade desconhecida ou ausente cai no perfil equilibrado', () => {
  expect(resolveQuality(undefined)).toBe(DEFAULT_QUALITY);
  expect(resolveQuality('toString')).toBe(DEFAULT_QUALITY);
  expect(resolveQuality('alta')).toBe('alta');
});

test('perfis ordenam bitrate e resolução da economia à alta qualidade', () => {
  const { economica, equilibrada, alta } = QUALITY_PRESETS;
  expect(economica.videoBitsPerSecond).toBeLessThan(equilibrada.videoBitsPerSecond);
  expect(equilibrada.videoBitsPerSecond).toBeLessThan(alta.videoBitsPerSecond);
  expect(economica.height).toBeLessThan(equilibrada.height);
});

test('pickMimeType prefere VP9 e recua para VP8 e WebM genérico', () => {
  expect(pickMimeType('video', () => true)).toBe('video/webm;codecs=vp9,opus');
  expect(pickMimeType('video', t => t.includes('vp8'))).toBe('video/webm;codecs=vp8,opus');
  expect(pickMimeType('video', () => false)).toBe('video/webm');
  expect(pickMimeType('audio', () => true)).toBe('audio/webm;codecs=opus');
  expect(pickMimeType('audio', () => false)).toBe('audio/webm');
});

test('restrições de captura e opções do recorder seguem o perfil', () => {
  expect(buildDisplayConstraints('economica')).toEqual({
    width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 24 } });
  expect(buildRecorderOptions('video', 'video/webm', 'alta')).toEqual({
    mimeType: 'video/webm', audioBitsPerSecond: 160_000, videoBitsPerSecond: 8_000_000 });
  const audio = buildRecorderOptions('audio', 'audio/webm', 'economica');
  expect(audio.videoBitsPerSecond).toBeUndefined();
  expect(audio.audioBitsPerSecond).toBe(96_000);
});
