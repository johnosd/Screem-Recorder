import { createPostTranscriptionSession } from './post-transcription-session.js';
import { buildSrt } from './subtitles.js';

function sampleMedia() {
  return new Blob(['sample media'], { type: 'video/webm' });
}

function sampleResult(text = 'Fala gravada') {
  return {
    text,
    segments: [{ start: 0.2, end: 1.4, text }],
    language: 'pt-BR',
    origin: 'post'
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('US1/AC1 FR-001 FR-006: transcreve a mídia recém-finalizada sem download prévio', async () => {
  const media = sampleMedia();
  const transcribe = jest.fn(async () => sampleResult());
  const session = createPostTranscriptionSession({ transcribe });
  session.setSource({ blob: media, name: 'gravacao-video.webm', origin: 'recorded', kind: 'video' });

  await session.start({ language: 'pt-BR', confirmedExternalSend: true });

  expect(transcribe).toHaveBeenCalledTimes(1);
  expect(transcribe.mock.calls[0][0]).toMatchObject({ media, language: 'pt-BR' });
  expect(session.getSnapshot()).toMatchObject({
    status: 'completed',
    transcript: { text: 'Fala gravada', origin: 'post' }
  });
});

test('FR-004 Constitution II: não envia mídia sem confirmação explícita', async () => {
  const transcribe = jest.fn(async () => sampleResult());
  const session = createPostTranscriptionSession({ transcribe });
  session.setSource({ blob: sampleMedia(), name: 'gravacao-video.webm', origin: 'recorded', kind: 'video' });

  await expect(session.start({ language: 'pt-BR', confirmedExternalSend: false }))
    .rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  expect(transcribe).not.toHaveBeenCalled();
});

test('US1/AC4 FR-008 FR-009: cancelar preserva resultado ao vivo e ignora resposta tardia', async () => {
  const pending = deferred();
  const session = createPostTranscriptionSession({ transcribe: () => pending.promise });
  const media = sampleMedia();
  session.setSource({ blob: media, name: 'gravacao-video.webm', origin: 'recorded', kind: 'video' });
  session.setExistingTranscript({
    text: 'Texto ao vivo',
    segments: [{ start: 0, end: 1, text: 'Texto ao vivo' }],
    language: 'pt-BR',
    origin: 'live'
  });

  const job = session.start({ language: 'pt-BR', confirmedExternalSend: true }).catch(() => {});
  session.cancel();
  pending.resolve(sampleResult('Texto tardio'));
  await job;

  expect(session.getSnapshot()).toMatchObject({
    status: 'cancelled',
    source: { blob: media },
    transcript: { text: 'Texto ao vivo', origin: 'live' }
  });
});

test('FR-012: segunda tentativa simultânea é rejeitada sem envio duplicado', async () => {
  const pending = deferred();
  const transcribe = jest.fn(() => pending.promise);
  const session = createPostTranscriptionSession({ transcribe });
  session.setSource({ blob: sampleMedia(), name: 'gravacao-video.webm', origin: 'recorded', kind: 'video' });

  const first = session.start({ language: 'pt-BR', confirmedExternalSend: true }).catch(() => {});
  await expect(session.start({ language: 'pt-BR', confirmedExternalSend: true }))
    .rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
  expect(transcribe).toHaveBeenCalledTimes(1);
  pending.resolve(sampleResult());
  await first;
});

test('FR-010 SC-005: SRT preserva a lacuna de pausa na linha do tempo final', () => {
  const srt = buildSrt([
    { start: 0.2, end: 1.4, text: 'Antes da pausa.' },
    { start: 4.8, end: 5.2, text: 'Depois da pausa.' }
  ]);

  expect(srt).toContain('00:00:00,200 --> 00:00:01,400\nAntes da pausa.');
  expect(srt).toContain('00:00:04,800 --> 00:00:05,200\nDepois da pausa.');
});
