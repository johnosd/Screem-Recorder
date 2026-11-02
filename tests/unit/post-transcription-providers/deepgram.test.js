import { transcribeWithDeepgram } from '../../../src/post-transcription-providers/deepgram.js';

const KEY = 'chave-de-teste-deepgram';
const audio = { blob: new Blob(['a'], { type: 'audio/mp4' }), name: 'a.m4a', mimeType: 'audio/mp4', size: 1 };
const reply = (status, data = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const body = (words, transcript = 'texto') => ({ results: { channels: [{ alternatives: [{ transcript, words }] }] } });

test('monta o pedido com idioma, modelo, chave e o próprio MIME do áudio', async () => {
  const fetchImpl = jest.fn(async () => reply(200, body([])));
  await transcribeWithDeepgram({ audio, language: 'en', key: ` ${KEY} `, fetchImpl });
  const [url, options] = fetchImpl.mock.calls[0];
  const query = new URL(url).searchParams;
  expect(query.get('language')).toBe('en');
  expect(query.get('model')).toBe('nova-3');
  expect(query.get('smart_format')).toBe('true');
  expect(options.headers).toEqual({ Authorization: `Token ${KEY}`, 'Content-Type': 'audio/mp4' });
  expect(options.body).toBe(audio.blob);
});

test('usa a palavra pontuada, cai em word e conta tempos ausentes e inválidos', async () => {
  const result = await transcribeWithDeepgram({ audio, language: 'pt-BR', key: KEY,
    fetchImpl: async () => reply(200, body([
      { word: 'olá', punctuated_word: 'Olá,', start: 0, end: 0.4 },
      { word: 'mundo', start: 0.5, end: 0.9 },
      { word: 'sem', start: null, end: 1.2 },
      { word: 'ruim', start: 2, end: 2 }
    ], 'Olá, mundo sem ruim')) });
  expect(result.segments.map(segment => segment.text)).toEqual(['Olá,', 'mundo', 'sem', 'ruim']);
  expect(result.timingInfo).toEqual({ words: 4, valid: 2, missing: 1, invalid: 1 });
  expect(result).toMatchObject({ text: 'Olá, mundo sem ruim', srt: null, language: 'pt-BR', origin: 'post' });
});

test('resposta sem fala ou sem a estrutura esperada vira texto vazio, sem exceção', async () => {
  for (const data of [body([], '   '), {}, { results: { channels: [] } }]) {
    const result = await transcribeWithDeepgram({ audio, language: 'pt-BR', key: KEY,
      fetchImpl: async () => reply(200, data) });
    expect(result.text).toBe('');
    expect(result.segments).toEqual([]);
  }
});

test.each([
  [400, 'REQUEST_REJECTED'], [401, 'AUTH_FAILED'], [402, 'PAYMENT_REQUIRED'], [403, 'AUTH_FAILED'],
  [413, 'AUDIO_TOO_LARGE'], [422, 'REQUEST_REJECTED'], [429, 'RATE_LIMITED'], [408, 'TIMEOUT'],
  [504, 'TIMEOUT'], [500, 'SERVICE_UNAVAILABLE'], [503, 'SERVICE_UNAVAILABLE'], [418, 'SERVICE_ERROR']
])('HTTP %i vira %s e o erro não carrega a chave nem o corpo', async (status, code) => {
  const failure = await transcribeWithDeepgram({ audio, language: 'pt-BR', key: KEY,
    fetchImpl: async () => reply(status, { err_msg: 'conteúdo do serviço' }) }).catch(error => error);
  expect(failure.code).toBe(code);
  if (code === 'REQUEST_REJECTED') expect(failure.httpStatus).toBe(status);
  expect(`${failure.message} ${JSON.stringify(failure)}`).not.toContain(KEY);
  expect(`${failure.message} ${JSON.stringify(failure)}`).not.toContain('conteúdo do serviço');
});

test('chave vazia, cancelamento prévio, rede e JSON inválido têm código próprio e não enviam sem chave', async () => {
  const fetchImpl = jest.fn(async () => reply(200, body([])));
  await expect(transcribeWithDeepgram({ audio, language: 'pt-BR', key: '  ', fetchImpl }))
    .rejects.toMatchObject({ code: 'KEY_REQUIRED' });
  const controller = new AbortController();
  controller.abort();
  await expect(transcribeWithDeepgram({ audio, language: 'pt-BR', key: KEY, fetchImpl, signal: controller.signal }))
    .rejects.toMatchObject({ code: 'CANCELLED' });
  expect(fetchImpl).not.toHaveBeenCalled();
  await expect(transcribeWithDeepgram({ audio, language: 'pt-BR', key: KEY,
    fetchImpl: async () => { throw new TypeError('rede'); } })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  await expect(transcribeWithDeepgram({ audio, language: 'pt-BR', key: KEY,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('json'); } }) }))
    .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('cancelar durante o envio e estourar o tempo são erros distintos', async () => {
  const hang = (url, { signal }) => new Promise((_, reject) =>
    signal.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' }))));
  const controller = new AbortController();
  const cancelled = transcribeWithDeepgram({ audio, language: 'pt-BR', key: KEY, fetchImpl: hang,
    signal: controller.signal });
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ code: 'CANCELLED' });
  await expect(transcribeWithDeepgram({ audio, language: 'pt-BR', key: KEY, fetchImpl: hang, timeoutMs: 10 }))
    .rejects.toMatchObject({ code: 'TIMEOUT' });
});
