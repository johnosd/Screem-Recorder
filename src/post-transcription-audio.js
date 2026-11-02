import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output,
  Mp4OutputFormat, WebMOutputFormat } from 'mediabunny';

export function mediaError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function formatOf(media) {
  const type = (media.type || '').split(';')[0].toLowerCase();
  const extension = typeof media.name === 'string'
    ? media.name.toLowerCase().match(/\.(webm|mp4|mp3)$/)?.[1] : null;
  const expected = { webm: ['video/webm', 'audio/webm'], mp4: ['video/mp4'], mp3: ['audio/mpeg', 'audio/mp3'] };
  if (extension && !expected[extension]?.includes(type)) throw mediaError('UNSUPPORTED_MEDIA');
  if (type === 'audio/webm' || type === 'audio/mpeg' || type === 'audio/mp3') return 'audio';
  if (type === 'video/webm') return 'webm';
  if (type === 'video/mp4') return 'mp4';
  throw mediaError('UNSUPPORTED_MEDIA');
}

export async function prepareAudio({ media, signal, onProgress } = {}) {
  if (!(media instanceof Blob) || media.size === 0) throw mediaError('INVALID_MEDIA');
  if (signal?.aborted) throw mediaError('CANCELLED');
  const format = formatOf(media);
  const baseName = (media.name || 'gravacao').replace(/\.[^.]+$/, '');
  if (format === 'audio') {
    return { blob: media, name: media.name || `${baseName}.${media.type.includes('webm') ? 'webm' : 'mp3'}`,
      mimeType: media.type, size: media.size };
  }

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media) });
  const output = new Output({
    format: format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(),
    target: new BufferTarget()
  });
  let conversion;
  let aborted = false;
  const abort = () => {
    aborted = true;
    if (conversion) void conversion.cancel();
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const audioTracks = await input.getAudioTracks();
    if (audioTracks.length === 0) throw mediaError('NO_AUDIO');
    const expectedCodec = format === 'webm' ? 'opus' : 'aac';
    let chosenTrack = null;
    for (const track of audioTracks) {
      if (await track.getCodec() === expectedCodec) { chosenTrack = track; break; }
    }
    if (!chosenTrack) throw mediaError('UNSUPPORTED_CODEC');
    if (signal?.aborted || aborted) throw mediaError('CANCELLED');
    conversion = await Conversion.init({ input, output, video: { discard: true },
      audio: track => ({ discard: track !== chosenTrack }),
      copy: { mode: 'forced' } });
    if (!conversion.isValid || conversion.discardedTracks.some(discarded =>
      discarded.track === chosenTrack)) {
      throw mediaError('UNSUPPORTED_CODEC');
    }
    if (signal?.aborted || aborted) throw mediaError('CANCELLED');
    conversion.onProgress = progress => {
      if (!aborted && Number.isFinite(progress)) onProgress?.(progress);
    };
    await conversion.execute();
    if (signal?.aborted || aborted) throw mediaError('CANCELLED');
    const mimeType = format === 'webm' ? 'audio/webm' : 'audio/mp4';
    const blob = new Blob([output.target.buffer], { type: mimeType });
    if (!blob.size) throw mediaError('NO_AUDIO');
    const check = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    if ((await check.getVideoTracks()).length || !(await check.getAudioTracks()).length) {
      throw mediaError('UNSUPPORTED_CODEC');
    }
    return { blob, name: `${baseName}.${format === 'webm' ? 'webm' : 'm4a'}`,
      mimeType, size: blob.size };
  } catch (error) {
    if (signal?.aborted || aborted || error?.name === 'ConversionCanceledError') throw mediaError('CANCELLED');
    if (error?.code) throw error;
    throw mediaError('INVALID_MEDIA');
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
