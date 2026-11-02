// Gravador em partes: fecha a parte atual ao alcançar `limitBytes` e continua em outra, trocando só o
// MediaRecorder (o MediaStream e as faixas ficam intactos). A troca é sequencial: o recorder novo só inicia
// depois do `onstop` do antigo, sem sobreposição. Não conhece remux, IndexedDB nem interface: tudo por callbacks.
// Regras em sdd/specs/003-dividir-gravacoes-longas/logic/split-recorder.md.
// Prazo máximo para o `onstop` depois de parar um recorder; evita travar se o evento nunca chegar.
const STOP_TIMEOUT_MS = 5000;

export function createSplitRecorder({ createRecorder, limitBytes, timeslice = 1000, mimeType = 'video/webm',
  onChunk, onPartClosed, onError, stopTimeoutMs = STOP_TIMEOUT_MS } = {}) {
  const limit = Number.isFinite(limitBytes) && limitBytes > 0 ? limitBytes : Infinity;
  const closedParts = [];
  let current = null;       // { index, recorder, chunks, bytes }
  let nextIndex = 1;
  let started = false;
  let rotating = false;
  let rotation = Promise.resolve();
  let stopping = null;
  let failure = null;
  let paused = false;

  function open() {
    const index = nextIndex++;
    const recorder = createRecorder();
    const part = { index, recorder, chunks: [], bytes: 0 };
    // O onstop é registrado já na criação: o Chrome também encerra o recorder sozinho (ex.: ao parar o
    // compartilhamento) e o último pedaço chega depois, então "já inativo" não significa "já terminou".
    part.stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.ondataavailable = event => onData(part, event);
    recorder.start(timeslice);
    if (paused) recorder.pause?.();
    current = part;
    return part;
  }

  function onData(part, event) {
    const blob = event?.data;
    if (!blob || !blob.size) return;
    part.chunks.push(blob);
    part.bytes += blob.size;
    try { onChunk?.({ part: part.index, blob }); } catch { /* a guarda não pode derrubar a gravação */ }
    if (part === current && !rotating && !stopping && part.bytes >= limit) rotate();
  }

  // Para o recorder da parte (se ainda gravando) e espera o `onstop`, que vem depois do último pedaço.
  async function closePart(part) {
    if (part.recorder.state !== 'inactive') {
      try { part.recorder.stop(); } catch { /* já parando */ }
    }
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(resolve, stopTimeoutMs); });
    await Promise.race([part.stopped, timeout]);
    clearTimeout(timer);
    return new Blob(part.chunks, { type: mimeType });
  }

  async function closeAndRecord(part) {
    const blob = await closePart(part);
    if (current === part) current = null;
    if (!blob.size) return;                       // parte vazia: descartada, sem consumir índice visível
    const closed = { index: part.index, blob };
    closedParts.push(closed);
    try { onPartClosed?.(closed); } catch { /* idem */ }
  }

  function fail(error) {
    failure = error;
    current = null;
    try { onError?.(error); } catch { /* idem */ }
  }

  function rotate() {
    rotating = true;
    const closing = current;
    rotation = (async () => {
      await closeAndRecord(closing);
      if (!stopping) {
        try { open(); } catch (error) { fail(error); }
      }
      rotating = false;
    })();
  }

  return {
    start() {
      if (started) throw new Error('A gravação já foi iniciada');
      started = true;
      open();
    },
    pause() {
      paused = true;
      current?.recorder.pause?.();
    },
    resume() {
      paused = false;
      current?.recorder.resume?.();
    },
    stop() {
      if (!stopping) {
        stopping = (async () => {
          await rotation;
          if (current) await closeAndRecord(current);
          return { parts: closedParts.slice(), error: failure };
        })();
      }
      return stopping;
    },
    get state() {
      if (rotating) return 'recording';
      return current ? current.recorder.state : 'inactive';
    }
  };
}
