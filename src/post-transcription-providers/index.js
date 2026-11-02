import { transcribeWithElevenLabs } from './elevenlabs.js';
import { transcribeWithDeepgram } from './deepgram.js';

export const DEFAULT_PROVIDER = 'elevenlabs';

// Fonte única de rótulo, chave de storage, limite de áudio preparado e adaptador de cada serviço.
export const PROVIDERS = {
  elevenlabs: { id: 'elevenlabs', label: 'ElevenLabs', keyStorage: 'elevenLabsKey',
    maxBytes: 5_000_000_000, transcribe: transcribeWithElevenLabs },
  deepgram: { id: 'deepgram', label: 'Deepgram', keyStorage: 'deepgramKey',
    maxBytes: 2_000_000_000, transcribe: transcribeWithDeepgram }
};

export function isProvider(id) {
  return typeof id === 'string' && Object.hasOwn(PROVIDERS, id);
}
