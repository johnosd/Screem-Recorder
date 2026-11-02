import { mediaError } from '../post-transcription-audio.js';
import { validSrt } from '../subtitles.js';

const ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';

function statusCode(status) {
  if (status === 401 || status === 403) return 'AUTH_FAILED';
  if (status === 413) return 'AUDIO_TOO_LARGE';
  if (status === 422 || status === 400) return 'REQUEST_REJECTED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 408 || status === 504) return 'TIMEOUT';
  if (status >= 500) return 'SERVICE_UNAVAILABLE';
  return 'SERVICE_ERROR';
}

export async function transcribeWithElevenLabs({ audio, language, key, signal, fetchImpl = fetch,
  timeoutMs = 30 * 60 * 1000 }) {
  if (!key?.trim()) throw mediaError('KEY_REQUIRED');
  if (signal?.aborted) throw mediaError('CANCELLED');
  const form = new FormData();
  form.append('file', audio.blob, audio.name);
  form.append('model_id', 'scribe_v2');
  form.append('language_code', language === 'pt-BR' ? 'pt' : 'en');
  form.append('timestamps_granularity', 'word');
  form.append('diarize', 'false');
  form.append('tag_audio_events', 'false');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let response;
  try {
    response = await fetchImpl(ENDPOINT, { method: 'POST',
      headers: { 'xi-api-key': key.trim() }, body: form, signal: controller.signal });
  } catch (error) {
    throw mediaError(timedOut ? 'TIMEOUT' : signal?.aborted || error?.name === 'AbortError' ? 'CANCELLED' : 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
  if (!response.ok) {
    let detail;
    if ([400, 401, 422].includes(response.status)) {
      try { detail = (await response.json())?.detail; } catch { /* Sem diagnóstico estruturado. */ }
    }
    const error = mediaError(response.status === 401 &&
      detail?.status === 'detected_unusual_activity' ? 'ACTIVITY_RESTRICTED'
      : statusCode(response.status));
    if (error.code === 'REQUEST_REJECTED') {
      error.httpStatus = response.status;
      const allowedFields = new Set(['file', 'model_id', 'language_code',
        'timestamps_granularity', 'additional_formats', 'diarize', 'tag_audio_events']);
      const locations = Array.isArray(detail) ? detail : [];
      error.field = locations.flatMap(item => Array.isArray(item?.loc) ? item.loc : [])
        .find(part => typeof part === 'string' && allowedFields.has(part)) || null;
    }
    throw error;
  }
  let data;
  try { data = await response.json(); } catch { throw mediaError('INVALID_RESPONSE'); }
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  const words = Array.isArray(data?.words)
    ? data.words.filter(word => word?.type === 'word' || !word?.type) : [];
  const segments = words.map(word => ({ start: word.start, end: word.end, text: word.text }));
  const timingInfo = { words: words.length, valid: 0, missing: 0, invalid: 0 };
  for (const word of words) {
    if (!Number.isFinite(word?.start) || !Number.isFinite(word?.end)) timingInfo.missing++;
    else if (word.start < 0 || word.end <= word.start ||
      typeof word.text !== 'string' || !word.text.trim()) timingInfo.invalid++;
    else timingInfo.valid++;
  }
  const exported = data?.additional_formats?.find(format =>
    format?.requested_format === 'srt' || format?.file_extension === 'srt');
  let srt = null;
  if (typeof exported?.content === 'string') {
    try {
      srt = exported.is_base64_encoded
        ? new TextDecoder().decode(Uint8Array.from(atob(exported.content), char => char.charCodeAt(0)))
        : exported.content;
    } catch { srt = null; }
  }
  return { text, segments, srt: validSrt(srt) ? srt : null,
    timingInfo, language, origin: 'post' };
}
