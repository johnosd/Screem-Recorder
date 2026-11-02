import { recoverTimedSegments, validSrt } from './subtitles.js';
import { DEFAULT_PROVIDER, isProvider } from './post-transcription-providers/index.js';

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function createPostTranscriptionSession({ transcribe }) {
  if (typeof transcribe !== 'function') throw failure('TRANSCRIBER_REQUIRED');
  let snapshot = { status: 'idle', source: null, transcript: null, stage: null, progress: null,
    error: null, errorInfo: null, provider: null };
  let active = null;
  let generation = 0;
  const listeners = new Set();

  function publish(patch) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener({ ...snapshot }));
  }

  return {
    setSource(source) {
      if (active) throw failure('ALREADY_RUNNING');
      if (!source || !(source.blob instanceof Blob) || source.blob.size === 0 ||
          !source.name || !['recorded', 'selected'].includes(source.origin) ||
          !['video', 'audio'].includes(source.kind)) throw failure('INVALID_SOURCE');
      publish({ source: { ...source, mimeType: source.blob.type, ready: true },
        transcript: null, status: 'ready', stage: null, progress: null, error: null, errorInfo: null });
    },
    setExistingTranscript(transcript) {
      if (active) throw failure('ALREADY_RUNNING');
      if (!snapshot.source) throw failure('MEDIA_NOT_READY');
      if (!transcript || typeof transcript.text !== 'string' || !transcript.text.trim()) return;
      publish({ transcript: { ...transcript, text: transcript.text.trim(), origin: 'live', provider: 'deepgram' } });
    },
    async start({ language, provider = DEFAULT_PROVIDER, confirmedExternalSend } = {}) {
      if (active) throw failure('ALREADY_RUNNING');
      if (!snapshot.source?.ready) throw failure('MEDIA_NOT_READY');
      if (!['pt-BR', 'en'].includes(language)) throw failure('INVALID_LANGUAGE');
      if (!isProvider(provider)) throw failure('INVALID_PROVIDER');
      if (confirmedExternalSend !== true) throw failure('CONSENT_REQUIRED');
      const controller = new AbortController();
      const id = ++generation;
      active = { id, controller };
      publish({ status: 'processing', stage: 'preparing', progress: null, error: null,
        errorInfo: null, provider });
      try {
        const result = await transcribe({ media: snapshot.source.blob, language, provider,
          signal: controller.signal,
          onStage(stage, progress = null) {
            if (active?.id === id) publish({ stage, progress });
          } });
        if (active?.id !== id) return { ...snapshot };
        if (!result || typeof result.text !== 'string' || !result.text.trim()) {
          publish({ status: 'no-speech', stage: null, progress: null });
        } else {
          const segments = recoverTimedSegments(result.segments);
          publish({ status: 'completed', stage: null, progress: null, error: null, errorInfo: null,
            transcript: { text: result.text.trim(), segments, timingInfo: result.timingInfo || null,
              srt: validSrt(result.srt) ? result.srt : null, language, origin: 'post', provider } });
        }
        return { ...snapshot };
      } catch (error) {
        if (active?.id !== id) return { ...snapshot };
        publish({ status: 'error', stage: null, progress: null,
          error: error?.code || (controller.signal.aborted ? 'CANCELLED' : 'TRANSCRIPTION_FAILED'),
          errorInfo: error?.code === 'REQUEST_REJECTED' &&
            [400, 422].includes(error.httpStatus)
            ? { httpStatus: error.httpStatus, field: error.field || null } : null });
        return { ...snapshot };
      } finally {
        if (active?.id === id) active = null;
      }
    },
    cancel() {
      if (!active) return false;
      const previous = active;
      active = null;
      generation++;
      previous.controller.abort();
      publish({ status: 'cancelled', stage: null, progress: null, error: null, errorInfo: null });
      return true;
    },
    getSnapshot() { return { ...snapshot }; },
    subscribe(listener) {
      if (typeof listener !== 'function') throw failure('INVALID_LISTENER');
      listeners.add(listener);
      listener({ ...snapshot });
      return () => listeners.delete(listener);
    }
  };
}
