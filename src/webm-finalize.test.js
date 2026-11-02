import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output,
  WebMOutputFormat } from 'mediabunny';
import { finalizeWebm } from './webm-finalize.js';

const source = () => new Blob([readFileSync(join(__dirname, 'fixtures', 'video-audio.webm'))],
  { type: 'video/webm' });
const open = blob => new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });

// Simula a saída do MediaRecorder: WebM append-only, sem duração nos metadados.
async function liveWebm() {
  const output = new Output({ format: new WebMOutputFormat({ appendOnly: true }),
    target: new BufferTarget() });
  const conversion = await Conversion.init({ input: open(source()), output, copy: { mode: 'forced' } });
  await conversion.execute();
  return new Blob([output.target.buffer], { type: 'video/webm' });
}

test('regrava o WebM com duração nos metadados sem perder faixas', async () => {
  const live = await liveWebm();
  expect(await open(live).getDurationFromMetadata()).toBeNull();
  const fixed = await finalizeWebm(live);
  expect(fixed).not.toBe(live);
  expect(fixed.type).toBe('video/webm');
  const input = open(fixed);
  expect(await input.getDurationFromMetadata()).toBeGreaterThan(0);
  expect(await input.getVideoTracks()).toHaveLength(1);
  expect(await input.getAudioTracks()).toHaveLength(1);
  expect(Math.abs((await input.computeDuration()) - (await open(live).computeDuration())))
    .toBeLessThan(0.1);
});

test('devolve o original quando o arquivo é inválido, vazio ou grande demais', async () => {
  const garbage = new Blob(['não é webm'], { type: 'video/webm' });
  expect(await finalizeWebm(garbage)).toBe(garbage);
  const empty = new Blob([], { type: 'video/webm' });
  expect(await finalizeWebm(empty)).toBe(empty);
  const media = source();
  expect(await finalizeWebm(media, { maxBytes: 10 })).toBe(media);
});
