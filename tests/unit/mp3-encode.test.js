import { encodePcmToMp3, floatToInt16 } from '../../src/mp3-encode.js';

test('floatToInt16 satura em ±1 e escala para 16 bits', () => {
  expect(Array.from(floatToInt16([0, 1, -1, 2, -2, 0.5]))).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
});

function fakeEncoder() {
  const calls = [];
  class Mp3Encoder {
    constructor(channels, rate, kbps) { calls.push({ channels, rate, kbps }); }
    encodeBuffer(l, r) { calls.push({ l: l.length, r: r?.length }); return new Int8Array(l.length ? 2 : 0); }
    flush() { return new Int8Array(1); }
  }
  return { Mp3Encoder, calls };
}

test('codifica em blocos de 1152 amostras, reporta progresso e finaliza com flush', () => {
  const { Mp3Encoder, calls } = fakeEncoder();
  const progress = jest.fn();
  const parts = encodePcmToMp3(Mp3Encoder, { left: new Int16Array(2500), right: new Int16Array(2500),
    sampleRate: 48000 }, progress);
  expect(calls[0]).toEqual({ channels: 2, rate: 48000, kbps: 128 });
  expect(calls.slice(1).map(c => c.l)).toEqual([1152, 1152, 196]);
  expect(parts).toHaveLength(4);
  expect(progress).toHaveBeenCalled();
  expect(Math.max(...progress.mock.calls.map(c => c[0]))).toBeLessThan(1);
});

test('áudio mono usa um canal só', () => {
  const { Mp3Encoder, calls } = fakeEncoder();
  encodePcmToMp3(Mp3Encoder, { left: new Int16Array(100), right: null, sampleRate: 44100 });
  expect(calls[0].channels).toBe(1);
  expect(calls[1].r).toBeUndefined();
});
