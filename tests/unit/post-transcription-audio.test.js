import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { prepareAudio } from '../../src/post-transcription-audio.js';

function fixture(name, type) {
  const media = new Blob([readFileSync(join(__dirname, '..', 'fixtures', name))], { type });
  Object.defineProperty(media, 'name', { value: name });
  return media;
}

test.each([
  ['video-audio.webm', 'video/webm', 'audio/webm'],
  ['video-audio.mp4', 'video/mp4', 'audio/mp4']
])('%s é copiado para arquivo somente de áudio com duração preservada', async (name, type, audioType) => {
  const media = fixture(name, type);
  const progress = jest.fn();
  const prepared = await prepareAudio({ media, onProgress: progress });
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media) });
  const output = new Input({ formats: ALL_FORMATS, source: new BlobSource(prepared.blob) });
  expect(prepared.mimeType).toBe(audioType);
  expect(prepared.size).toBeLessThan(media.size);
  expect(await output.getVideoTracks()).toHaveLength(0);
  expect(await output.getAudioTracks()).toHaveLength(1);
  expect(Math.abs((await output.computeDuration()) - (await input.computeDuration()))).toBeLessThan(0.1);
  expect(progress).toHaveBeenCalled();
});

test.each([['fala.webm', 'audio/webm'], ['fala.mp3', 'audio/mpeg']])(
  '%s de áudio segue sem cópia ou recodificação', async (name, type) => {
    const media = new Blob(['audio'], { type });
    Object.defineProperty(media, 'name', { value: name });
    expect((await prepareAudio({ media })).blob).toBe(media);
  });

test('vídeo sem áudio falha e não produz payload', async () => {
  await expect(prepareAudio({ media: fixture('video-silent.webm', 'video/webm') }))
    .rejects.toMatchObject({ code: 'NO_AUDIO' });
});

test('codec de áudio incompatível não vira transcodificação nem envio de vídeo', async () => {
  await expect(prepareAudio({ media: fixture('video-ac3.mp4', 'video/mp4') }))
    .rejects.toMatchObject({ code: 'UNSUPPORTED_CODEC' });
});

test('extensão e MIME discrepantes e cancelamento são bloqueados', async () => {
  const mismatch = fixture('video-audio.mp4', 'video/webm');
  await expect(prepareAudio({ media: mismatch })).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
  const controller = new AbortController();
  controller.abort();
  await expect(prepareAudio({ media: fixture('video-audio.webm', 'video/webm'), signal: controller.signal }))
    .rejects.toMatchObject({ code: 'CANCELLED' });
});

test('cancelamento durante o remux descarta a saída', async () => {
  const controller = new AbortController();
  await expect(prepareAudio({ media: fixture('video-audio.webm', 'video/webm'),
    signal: controller.signal, onProgress: () => controller.abort() }))
    .rejects.toMatchObject({ code: 'CANCELLED' });
});
