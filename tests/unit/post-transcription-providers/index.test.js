import { DEFAULT_PROVIDER, PROVIDERS, isProvider } from '../../../src/post-transcription-providers/index.js';

test('o padrão é a ElevenLabs e cada provedor tem rótulo, chave de storage, limite e adaptador', () => {
  expect(DEFAULT_PROVIDER).toBe('elevenlabs');
  expect(PROVIDERS.elevenlabs).toMatchObject({ label: 'ElevenLabs', keyStorage: 'elevenLabsKey', maxBytes: 5_000_000_000 });
  expect(PROVIDERS.deepgram).toMatchObject({ label: 'Deepgram', keyStorage: 'deepgramKey', maxBytes: 2_000_000_000 });
  for (const provider of Object.values(PROVIDERS)) expect(typeof provider.transcribe).toBe('function');
});

test('isProvider só aceita identificadores próprios do registro', () => {
  expect(isProvider('deepgram')).toBe(true);
  expect(isProvider('elevenlabs')).toBe(true);
  for (const value of ['toString', '__proto__', 'constructor', 'Deepgram', '', null, undefined, 1]) {
    expect(isProvider(value)).toBe(false);
  }
});
