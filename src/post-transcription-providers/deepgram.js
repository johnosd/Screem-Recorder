import { mediaError } from '../post-transcription-audio.js';
import { summarizeTiming } from './timed-words.js';

const ENDPOINT = 'https://api.deepgram.com/v1/listen';

function statusCode(status) {
  if (status === 401 || status === 403) return 'AUTH_FAILED';
  if (status === 402) return 'PAYMENT_REQUIRED';
  if (status === 413) return 'AUDIO_TOO_LARGE';
  if (status === 422 || status === 400) return 'REQUEST_REJECTED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 408 || status === 504) return 'TIMEOUT';
  if (status >= 500) return 'SERVICE_UNAVAILABLE';
  return 'SERVICE_ERROR';
}

export async function transcribeWithDeepgram({ audio, language, key, signal, fetchImpl = fetch,
  timeoutMs = 30 * 60 * 1000 }) {
  if (!key?.trim()) throw mediaError('KEY_REQUIRED');
  if (signal?.aborted) throw mediaError('CANCELLED');
  const query = new URLSearchParams({ model: 'nova-3', language: language === 'pt-BR' ? 'pt-BR' : 'en',
    punctuate: 'true', smart_format: 'true' });
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${ENDPOINT}?${query}`, { method: 'POST',
      headers: { Authorization: 'Token ' + key.trim(), 'Content-Type': audio.mimeType },
      body: audio.blob, signal: controller.signal });
  } catch (error) {
    throw mediaError(timedOut ? 'TIMEOUT' : signal?.aborted || error?.name === 'AbortError' ? 'CANCELLED' : 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
  if (!response.ok) {
    const error = mediaError(statusCode(response.status));
    if (error.code === 'REQUEST_REJECTED') error.httpStatus = response.status;
    throw error;
  }
  let data;
  try { data = await response.json(); } catch { throw mediaError('INVALID_RESPONSE'); }
  const alternative = data?.results?.channels?.[0]?.alternatives?.[0];
  const text = typeof alternative?.transcript === 'string' ? alternative.transcript.trim() : '';
  const words = (Array.isArray(alternative?.words) ? alternative.words : []).map(word => ({
    start: word?.start, end: word?.end, text: word?.punctuated_word ?? word?.word }));
  const { segments, timingInfo } = summarizeTiming(words);
  return { text, segments, srt: null, timingInfo, language, origin: 'post' };
}
