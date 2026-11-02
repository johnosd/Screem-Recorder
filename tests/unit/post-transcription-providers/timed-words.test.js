import { summarizeTiming } from '../../../src/post-transcription-providers/timed-words.js';

test('gera segmentos e conta tempos válidos, ausentes e inválidos sem guardar texto de diagnóstico', () => {
  const { segments, timingInfo } = summarizeTiming([
    { start: 0, end: 0.4, text: 'Uma' },
    { start: null, end: 0.9, text: 'frase' },
    { start: 1, end: 1, text: 'x' },
    { start: 2, end: 3, text: '  ' }
  ]);
  expect(segments).toHaveLength(4);
  expect(timingInfo).toEqual({ words: 4, valid: 1, missing: 1, invalid: 2 });
});

test('lista vazia não gera segmentos', () => {
  expect(summarizeTiming([])).toEqual({ segments: [], timingInfo: { words: 0, valid: 0, missing: 0, invalid: 0 } });
});
