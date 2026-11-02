import { prepareAudio, mediaError } from './post-transcription-audio.js';
import { DEFAULT_PROVIDER, PROVIDERS, isProvider } from './post-transcription-providers/index.js';

export async function transcribePreRecorded({ media, language, key, provider = DEFAULT_PROVIDER, signal,
  onStage, fetchImpl }) {
  if (!['pt-BR', 'en'].includes(language)) throw mediaError('INVALID_LANGUAGE');
  if (!isProvider(provider)) throw mediaError('INVALID_PROVIDER');
  if (!key?.trim()) throw mediaError('KEY_REQUIRED');
  onStage?.('preparing', 0);
  const audio = await prepareAudio({ media, signal,
    onProgress: progress => onStage?.('preparing', progress) });
  if (audio.size >= PROVIDERS[provider].maxBytes) throw mediaError('AUDIO_TOO_LARGE');
  if (signal?.aborted) throw mediaError('CANCELLED');
  onStage?.('sending');
  const pending = PROVIDERS[provider].transcribe({ audio, language, key, signal, fetchImpl });
  onStage?.('waiting');
  return pending;
}
