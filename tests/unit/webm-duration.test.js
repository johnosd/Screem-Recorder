import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDuration } from '../../src/webm-duration.js';

const fixture = name => new Blob([readFileSync(join(__dirname, '..', 'fixtures', name))]);

test('lê a duração de WebM, MP4 e MP3 com áudio', async () => {
  for (const name of ['video-audio.webm', 'video-audio.mp4', 'audio-only.webm', 'audio-only.mp3']) {
    const duration = await readDuration(fixture(name));
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThan(60);
  }
});

test('devolve null para vazio, não-Blob e conteúdo inválido', async () => {
  expect(await readDuration(new Blob([]))).toBeNull();
  expect(await readDuration('texto')).toBeNull();
  expect(await readDuration(null)).toBeNull();
  expect(await readDuration(new Blob(['isto não é mídia']))).toBeNull();
});
