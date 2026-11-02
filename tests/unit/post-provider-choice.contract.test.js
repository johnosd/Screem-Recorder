// Contratos da feature 002-escolha-provedor-transcricao (travados por contract-tests.lock).
import { transcribePreRecorded } from '../../src/post-transcription-client.js';
import { createPostTranscriptionSession } from '../../src/post-transcription-session.js';

const KEY = 'chave-secreta-de-teste';
const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

function audioMedia(name = 'fala.webm') {
  const media = new Blob(['audio'], { type: 'audio/webm' });
  Object.defineProperty(media, 'name', { value: name });
  return media;
}

function reply(status, data = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

const deepgramBody = {
  results: { channels: [{ alternatives: [{
    transcript: 'Olá mundo',
    words: [
      { word: 'olá', punctuated_word: 'Olá', start: 0, end: 0.4 },
      { word: 'mundo', punctuated_word: 'mundo.', start: 0.5, end: 0.9 }
    ]
  }] }] }
};

const elevenLabsBody = { text: 'Hello', words: [{ type: 'word', text: 'Hello', start: 0, end: 0.5 }] };

function routedFetch() {
  return jest.fn(async url => {
    if (url.startsWith(DEEPGRAM_URL)) return reply(200, deepgramBody);
    if (url.startsWith(ELEVENLABS_URL)) return reply(200, elevenLabsBody);
    throw new TypeError('endpoint inesperado: ' + url);
  });
}

test('US1/AC1 FR-006: Deepgram recebe só o áudio com a chave dele e devolve texto e tempos normalizados', async () => {
  const media = audioMedia();
  const fetchImpl = routedFetch();

  const result = await transcribePreRecorded({ media, language: 'pt-BR', key: KEY,
    provider: 'deepgram', fetchImpl });

  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toContain(DEEPGRAM_URL);
  expect(url).toContain('model=nova-3');
  expect(url).toContain('language=pt-BR');
  expect(options.method).toBe('POST');
  expect(options.headers.Authorization).toBe('Token ' + KEY);
  expect(options.headers['Content-Type']).toBe('audio/webm');
  expect(options.body).toBe(media);
  expect(result).toMatchObject({ text: 'Olá mundo', language: 'pt-BR', origin: 'post',
    segments: [{ start: 0, end: 0.4, text: 'Olá' }, { start: 0.5, end: 0.9, text: 'mundo.' }] });
});

test('US1/AC4 FR-002 Constitution II: cada provedor só fala com o próprio serviço', async () => {
  const forDeepgram = routedFetch();
  await transcribePreRecorded({ media: audioMedia(), language: 'en', key: KEY,
    provider: 'deepgram', fetchImpl: forDeepgram });
  expect(forDeepgram.mock.calls.map(([url]) => url.split('?')[0])).toEqual([DEEPGRAM_URL]);

  const forEleven = routedFetch();
  await transcribePreRecorded({ media: audioMedia(), language: 'en', key: KEY,
    provider: 'elevenlabs', fetchImpl: forEleven });
  expect(forEleven.mock.calls.map(([url]) => url)).toEqual([ELEVENLABS_URL]);
});

test('US2/AC1-3 FR-007 FR-008: sessão repassa o provedor, o resultado o registra e uma falha preserva o anterior', async () => {
  const transcribe = jest.fn(async ({ provider }) => {
    if (provider === 'broken') throw Object.assign(new Error('falha'), { code: 'NETWORK_ERROR' });
    return { text: `Texto ${provider}`, segments: [{ start: 0, end: 1, text: provider }] };
  });
  const session = createPostTranscriptionSession({ transcribe });
  session.setSource({ blob: new Blob(['m'], { type: 'audio/webm' }), name: 'a.webm',
    origin: 'recorded', kind: 'audio' });

  await session.start({ language: 'pt-BR', provider: 'elevenlabs', confirmedExternalSend: true });
  await session.start({ language: 'pt-BR', provider: 'deepgram', confirmedExternalSend: true });

  expect(transcribe.mock.calls.map(([args]) => args.provider)).toEqual(['elevenlabs', 'deepgram']);
  expect(session.getSnapshot().transcript).toMatchObject({ text: 'Texto deepgram', provider: 'deepgram' });

  await expect(session.start({ language: 'pt-BR', provider: 'inexistente', confirmedExternalSend: true }))
    .rejects.toMatchObject({ code: 'INVALID_PROVIDER' });
  expect(session.getSnapshot().transcript).toMatchObject({ provider: 'deepgram' });
});

test('FR-011: o limite de tamanho depende do provedor e é checado antes do envio', async () => {
  const media = audioMedia('grande.webm');
  Object.defineProperty(media, 'size', { value: 3_000_000_000 });

  const forDeepgram = routedFetch();
  await expect(transcribePreRecorded({ media, language: 'pt-BR', key: KEY,
    provider: 'deepgram', fetchImpl: forDeepgram })).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE' });
  expect(forDeepgram).not.toHaveBeenCalled();

  const forEleven = routedFetch();
  await transcribePreRecorded({ media, language: 'pt-BR', key: KEY,
    provider: 'elevenlabs', fetchImpl: forEleven });
  expect(forEleven).toHaveBeenCalledTimes(1);
});

test('FR-009 FR-013 Constitution II: erro do Deepgram é classificado e não vaza a chave', async () => {
  const fetchImpl = jest.fn(async url => {
    if (url.startsWith(DEEPGRAM_URL)) return reply(401, { err_code: 'INVALID_AUTH' });
    throw new TypeError('endpoint inesperado: ' + url);
  });

  const failure = await transcribePreRecorded({ media: audioMedia(), language: 'pt-BR', key: KEY,
    provider: 'deepgram', fetchImpl }).catch(error => error);

  expect(failure).toMatchObject({ code: 'AUTH_FAILED' });
  expect(`${failure.message} ${JSON.stringify(failure)} ${failure.stack}`).not.toContain(KEY);
});
