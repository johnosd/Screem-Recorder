import { createPostTranscriptionSession } from '../../src/post-transcription-session.js';

const media = () => new Blob(['audio'], { type: 'audio/webm' });
const source = () => ({ blob: media(), name: 'fala.webm', origin: 'selected', kind: 'audio' });
const result = () => ({ text: 'Fala', segments: [{ start: 0, end: 1, text: 'Fala' }] });

test('fonte não pronta e envio sem confirmação não chamam o serviço', async () => {
  const transcribe = jest.fn(async () => result());
  const session = createPostTranscriptionSession({ transcribe });
  await expect(session.start({ language: 'en', confirmedExternalSend: true }))
    .rejects.toMatchObject({ code: 'MEDIA_NOT_READY' });
  session.setSource(source());
  await expect(session.start({ language: 'en', confirmedExternalSend: false }))
    .rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  expect(transcribe).not.toHaveBeenCalled();
});

test('erro preserva texto anterior e resultado sem tempos conserva texto novo', async () => {
  const transcribe = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error('secret'), { code: 'NETWORK_ERROR' }))
    .mockResolvedValueOnce({ text: 'Novo', segments: [] })
    .mockResolvedValueOnce({ text: '', segments: [] })
    .mockResolvedValueOnce(result());
  const session = createPostTranscriptionSession({ transcribe });
  session.setSource(source());
  session.setExistingTranscript({ text: 'Anterior', segments: [], language: 'pt-BR', origin: 'live' });
  await session.start({ language: 'pt-BR', confirmedExternalSend: true });
  expect(session.getSnapshot()).toMatchObject({ status: 'error', error: 'NETWORK_ERROR',
    transcript: { text: 'Anterior' } });
  await session.start({ language: 'pt-BR', confirmedExternalSend: true });
  expect(session.getSnapshot()).toMatchObject({ status: 'completed', error: null,
    transcript: { text: 'Novo', segments: [], origin: 'post' } });
  await session.start({ language: 'pt-BR', confirmedExternalSend: true });
  expect(session.getSnapshot()).toMatchObject({ status: 'no-speech', transcript: { text: 'Novo' } });
  await session.start({ language: 'pt-BR', confirmedExternalSend: true });
  expect(session.getSnapshot()).toMatchObject({ status: 'completed', transcript: { text: 'Fala', origin: 'post' } });
});

test('cancelamento ignora resposta tardia e nova fonte apaga texto da fonte anterior', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const session = createPostTranscriptionSession({ transcribe: () => pending });
  session.setSource(source());
  const job = session.start({ language: 'en', confirmedExternalSend: true });
  expect(() => session.setSource(source())).toThrow(expect.objectContaining({ code: 'ALREADY_RUNNING' }));
  session.cancel();
  resolve(result());
  await job;
  expect(session.getSnapshot().status).toBe('cancelled');
  session.setSource(source());
  expect(session.getSnapshot()).toMatchObject({ status: 'ready', transcript: null });
});

test('texto da ElevenLabs sem tempos validos continua disponivel para TXT', async () => {
  const session = createPostTranscriptionSession({ transcribe: async () => ({
    text: 'Fala reconhecida',
    segments: [{ start: 0, end: 0, text: 'Fala' }]
  }) });
  session.setSource(source());
  await session.start({ language: 'pt-BR', confirmedExternalSend: true });
  expect(session.getSnapshot()).toMatchObject({
    status: 'completed', error: null,
    transcript: { text: 'Fala reconhecida', segments: [], origin: 'post' }
  });
});

test('tempos parcialmente válidos disponibilizam SRT sem perder palavras', async () => {
  const timingInfo = { words: 3, valid: 2, missing: 0, invalid: 1 };
  const session = createPostTranscriptionSession({ transcribe: async () => ({
    text: 'Fala sem tempo', timingInfo, segments: [
      { start: 0, end: 0.3, text: 'Fala' },
      { start: 0.3, end: 0.3, text: 'sem' },
      { start: 0.4, end: 0.8, text: 'tempo' }
    ]
  }) });
  session.setSource(source());
  await session.start({ language: 'pt-BR', confirmedExternalSend: true });
  expect(session.getSnapshot()).toMatchObject({ status: 'completed',
    transcript: { timingInfo, segments: [
      { start: 0, end: 0.3, text: 'Fala sem' },
      { start: 0.4, end: 0.8, text: 'tempo' }
    ] } });
});

test('SRT válido da ElevenLabs continua disponível sem tempos por palavra', async () => {
  const srt = '1\n00:00:00,100 --> 00:00:00,800\nFala reconhecida';
  const session = createPostTranscriptionSession({ transcribe: async () => ({
    text: 'Fala reconhecida', segments: [], srt
  }) });
  session.setSource(source());
  await session.start({ language: 'pt-BR', confirmedExternalSend: true });
  expect(session.getSnapshot()).toMatchObject({ status: 'completed',
    transcript: { text: 'Fala reconhecida', segments: [], srt } });
});

test('sessão conserva apenas diagnóstico seguro de rejeição HTTP', async () => {
  const session = createPostTranscriptionSession({ transcribe: async () => {
    const error = new Error('secret text');
    error.code = 'REQUEST_REJECTED';
    error.httpStatus = 422;
    error.field = 'additional_formats';
    throw error;
  } });
  session.setSource(source());
  await session.start({ language: 'pt-BR', confirmedExternalSend: true });
  expect(session.getSnapshot()).toMatchObject({ status: 'error', error: 'REQUEST_REJECTED',
    errorInfo: { httpStatus: 422, field: 'additional_formats' } });
  expect(JSON.stringify(session.getSnapshot())).not.toContain('secret text');
});

test('sessão conserva contagem segura de tempos quando SRT não está disponível', async () => {
  const timingInfo = { words: 3, valid: 1, missing: 1, invalid: 1 };
  const session = createPostTranscriptionSession({ transcribe: async () => ({
    text: 'Uma frase', segments: [{ start: 0, end: 0, text: 'Uma' }], timingInfo
  }) });
  session.setSource(source());
  await session.start({ language: 'pt-BR', confirmedExternalSend: true });
  expect(session.getSnapshot().transcript.timingInfo).toEqual(timingInfo);
});

describe('provedor da transcrição (feature 002)', () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
  };

  test('sem provider usa ElevenLabs e o snapshot indica quem está processando', async () => {
    const gate = deferred();
    const transcribe = jest.fn(async () => { await gate.promise; return result(); });
    const session = createPostTranscriptionSession({ transcribe });
    session.setSource(source());
    const running = session.start({ language: 'pt-BR', confirmedExternalSend: true });
    expect(session.getSnapshot()).toMatchObject({ status: 'processing', provider: 'elevenlabs' });
    gate.resolve();
    await running;
    expect(transcribe.mock.calls[0][0].provider).toBe('elevenlabs');
    expect(session.getSnapshot().transcript.provider).toBe('elevenlabs');
  });

  test('provider inválido é recusado sem publicar processamento nem chamar o serviço', async () => {
    const transcribe = jest.fn(async () => result());
    const session = createPostTranscriptionSession({ transcribe });
    session.setSource(source());
    await expect(session.start({ language: 'pt-BR', provider: 'toString', confirmedExternalSend: true }))
      .rejects.toMatchObject({ code: 'INVALID_PROVIDER' });
    expect(transcribe).not.toHaveBeenCalled();
    expect(session.getSnapshot().status).toBe('ready');
  });

  test('cancelar uma nova tentativa com outro provedor preserva o resultado e o provedor anteriores', async () => {
    const gate = deferred();
    const transcribe = jest.fn()
      .mockResolvedValueOnce({ text: 'Primeiro', segments: [] })
      .mockImplementationOnce(async () => { await gate.promise; return { text: 'Tardio', segments: [] }; });
    const session = createPostTranscriptionSession({ transcribe });
    session.setSource(source());
    await session.start({ language: 'pt-BR', provider: 'elevenlabs', confirmedExternalSend: true });
    const second = session.start({ language: 'pt-BR', provider: 'deepgram', confirmedExternalSend: true });
    expect(session.getSnapshot()).toMatchObject({ status: 'processing', provider: 'deepgram',
      transcript: { text: 'Primeiro', provider: 'elevenlabs' } });
    session.cancel();
    gate.resolve();
    await second;
    expect(session.getSnapshot()).toMatchObject({ status: 'cancelled',
      transcript: { text: 'Primeiro', provider: 'elevenlabs' } });
  });

  test('transcrição ao vivo registrada é do Deepgram e é substituída pelo resultado do provedor escolhido', async () => {
    const transcribe = jest.fn(async () => ({ text: 'Posterior', segments: [] }));
    const session = createPostTranscriptionSession({ transcribe });
    session.setSource(source());
    session.setExistingTranscript({ text: 'Ao vivo', segments: [], language: 'pt-BR', origin: 'live' });
    expect(session.getSnapshot().transcript).toMatchObject({ origin: 'live', provider: 'deepgram' });
    await session.start({ language: 'pt-BR', provider: 'deepgram', confirmedExternalSend: true });
    expect(session.getSnapshot().transcript).toMatchObject({ text: 'Posterior', origin: 'post', provider: 'deepgram' });
  });
});
