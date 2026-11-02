import { transcribePreRecorded } from './post-transcription-client.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function media() { return new Blob(['audio'], { type: 'audio/webm' }); }
function response(status, data = {}) { return { ok: status >= 200 && status < 300,
  status, json: async () => data }; }

test('multipart envia somente áudio, modelo e idioma, e normaliza tempos', async () => {
  const fetchImpl = jest.fn(async () => response(200, { text: 'Olá mundo',
    words: [{ start: 0, end: 0.4, text: 'Olá', type: 'word' },
      { start: 0.4, end: 0.7, text: ' ', type: 'spacing' },
      { start: 0.7, end: 1, text: 'mundo', type: 'word' }] }));
  const result = await transcribePreRecorded({ media: media(), language: 'pt-BR', key: 'test-only', fetchImpl });
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
  expect(options.method).toBe('POST');
  expect(options.body.get('model_id')).toBe('scribe_v2');
  expect(options.body.get('language_code')).toBe('pt');
  expect(options.body.get('additional_formats')).toBeNull();
  expect(options.body.get('file').type).toBe('audio/webm');
  expect(options.body.getAll('file')).toHaveLength(1);
  expect(result).toMatchObject({ text: 'Olá mundo', language: 'pt-BR', origin: 'post',
    segments: [{ start: 0, end: 0.4, text: 'Olá' }, { start: 0.7, end: 1, text: 'mundo' }] });
});

test('conta tempos ausentes e intervalos inválidos sem guardar texto de diagnóstico', async () => {
  const result = await transcribePreRecorded({ media: media(), language: 'pt-BR', key: 'test-only',
    fetchImpl: async () => response(200, { text: 'Uma frase', words: [
      { type: 'word', text: 'Uma', start: 0, end: 0.4 },
      { type: 'spacing', text: ' ', start: 0.4, end: 0.5 },
      { type: 'word', text: 'frase', start: null, end: 0.9 },
      { type: 'word', text: '!', start: 0.9, end: 0.9 }
    ] }) });
  expect(result.timingInfo).toEqual({ words: 3, valid: 1, missing: 1, invalid: 1 });
  expect(JSON.stringify(result.timingInfo)).not.toContain('Uma');
});

test('preserva SRT retornado pela ElevenLabs quando palavras não têm tempos válidos', async () => {
  const srt = '1\n00:00:00,100 --> 00:00:00,800\nOlá mundo';
  const result = await transcribePreRecorded({ media: media(), language: 'pt-BR', key: 'test-only',
    fetchImpl: async () => response(200, { text: 'Olá mundo', words: [], additional_formats: [
      { requested_format: 'srt', file_extension: 'srt', content_type: 'text/plain',
        is_base64_encoded: false, content: srt }
    ] }) });
  expect(result.srt).toBe(srt);
  expect(result.segments).toEqual([]);
});

test('decodifica SRT base64 e rejeita exportação sem marcação válida', async () => {
  const srt = '1\n00:00:00,100 --> 00:00:00,800\nFala';
  const make = content => transcribePreRecorded({ media: media(), language: 'en', key: 'test-only',
    fetchImpl: async () => response(200, { text: 'Fala', additional_formats: [content] }) });
  const encoded = await make({ requested_format: 'srt', is_base64_encoded: true,
    content: Buffer.from(srt).toString('base64') });
  expect(encoded.srt).toBe(srt);
  const invalid = await make({ requested_format: 'srt', is_base64_encoded: false,
    content: 'Fala sem tempos' });
  expect(invalid.srt).toBeNull();
});

test.each([[401, 'AUTH_FAILED'], [413, 'AUDIO_TOO_LARGE'],
  [429, 'RATE_LIMITED'], [408, 'TIMEOUT'], [504, 'TIMEOUT'], [500, 'SERVICE_UNAVAILABLE']])(
  'HTTP %s é classificado sem expor resposta', async (status, code) => {
    await expect(transcribePreRecorded({ media: media(), language: 'en', key: 'test-only',
      fetchImpl: async () => response(status, { secret: 'hidden' }) }))
      .rejects.toMatchObject({ code });
  });

test('401 por atividade incomum é distinto de chave inválida', async () => {
  await expect(transcribePreRecorded({ media: media(), language: 'pt-BR', key: 'test-only',
    fetchImpl: async () => response(401, { detail: {
      status: 'detected_unusual_activity', message: 'private response' } }) }))
    .rejects.toMatchObject({ code: 'ACTIVITY_RESTRICTED' });
});

test.each([400, 422])('HTTP %s preserva status sem chamar erro de mídia', async status => {
  const error = await transcribePreRecorded({ media: media(), language: 'en', key: 'test-only',
    fetchImpl: async () => response(status, { detail: [{ loc: ['body', 'additional_formats', 0],
      msg: 'secret text', type: 'value_error' }] }) }).catch(e => e);
  expect(error).toMatchObject({ code: 'REQUEST_REJECTED', httpStatus: status,
    field: 'additional_formats' });
  expect(String(error)).not.toContain('secret text');
});

test('sem chave ou tentativa abortada não envia áudio', async () => {
  const fetchImpl = jest.fn();
  await expect(transcribePreRecorded({ media: media(), language: 'en', key: '', fetchImpl }))
    .rejects.toMatchObject({ code: 'KEY_REQUIRED' });
  const controller = new AbortController();
  controller.abort();
  await expect(transcribePreRecorded({ media: media(), language: 'en', key: 'test-only',
    signal: controller.signal, fetchImpl })).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('vídeo sem áudio falha antes da rede', async () => {
  const source = new Blob([readFileSync(join(__dirname, 'fixtures', 'video-silent.webm'))],
    { type: 'video/webm' });
  const fetchImpl = jest.fn();
  await expect(transcribePreRecorded({ media: source, language: 'en', key: 'test-only', fetchImpl }))
    .rejects.toMatchObject({ code: 'NO_AUDIO' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('limite é aplicado ao áudio preparado', async () => {
  const oversized = media();
  Object.defineProperty(oversized, 'size', { value: 5_000_000_000 });
  const fetchImpl = jest.fn();
  await expect(transcribePreRecorded({ media: oversized, language: 'en', key: 'test-only', fetchImpl }))
    .rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('cancelamento durante a requisição usa AbortSignal e não expõe resposta tardia', async () => {
  const controller = new AbortController();
  const fetchImpl = jest.fn((_, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'),
      { name: 'AbortError' })));
  }));
  const pending = transcribePreRecorded({ media: media(), language: 'en', key: 'test-only',
    signal: controller.signal, fetchImpl });
  await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
