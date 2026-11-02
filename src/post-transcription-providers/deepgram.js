import { mediaError } from '../post-transcription-audio.js';

// STUB (sdd-plan 002): o sdd-execute implementa o adaptador de arquivo gravado do Deepgram.
// Contrato de saída igual ao de elevenlabs.js: { text, segments, srt: null, timingInfo, language, origin: 'post' }.
export async function transcribeWithDeepgram({ audio, language, key, signal, fetchImpl = fetch,
  timeoutMs = 30 * 60 * 1000 }) {
  void audio; void language; void key; void signal; void fetchImpl; void timeoutMs; void mediaError;
  throw new Error('not implemented');
}
