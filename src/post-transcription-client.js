import { prepareAudio, mediaError } from './post-transcription-audio.js';
import { transcribeWithElevenLabs } from './post-transcription-providers/elevenlabs.js';

const MAX_AUDIO_BYTES = 5_000_000_000;

export async function transcribePreRecorded({ media, language, key, signal, onStage, fetchImpl }) {
  if (!['pt-BR', 'en'].includes(language)) throw mediaError('INVALID_LANGUAGE');
  if (!key?.trim()) throw mediaError('KEY_REQUIRED');
  onStage?.('preparing', 0);
  const audio = await prepareAudio({ media, signal,
    onProgress: progress => onStage?.('preparing', progress) });
  if (audio.size >= MAX_AUDIO_BYTES) throw mediaError('AUDIO_TOO_LARGE');
  if (signal?.aborted) throw mediaError('CANCELLED');
  onStage?.('sending');
  const pending = transcribeWithElevenLabs({ audio, language, key, signal, fetchImpl });
  onStage?.('waiting');
  return pending;
}
