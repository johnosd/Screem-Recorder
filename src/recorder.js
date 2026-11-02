import { fmt } from './utils/timer.js';
import { createPostTranscriptionSession } from './post-transcription-session.js';
import { transcribePreRecorded } from './post-transcription-client.js';
import { DEFAULT_PROVIDER, PROVIDERS, isProvider } from './post-transcription-providers/index.js';
import { closeDeepgramSocket, startKeepAlive } from './deepgram-live.js';
import { downloadBlob, timestamp } from './utils/download.js';
import { floatToInt16 } from './mp3-encode.js';
import { createUnloadGuard } from './unload-guard.js';
import { finalizeWebm } from './webm-finalize.js';
import { openRecoveryStore } from './recovery-store.js';
import { createSplitRecorder } from './split-recorder.js';
import { partFileName, resolvePartLimit } from './recording-parts.js';
import { readDuration } from './webm-duration.js';
import { DEFAULT_QUALITY, QUALITY_PRESETS, buildDisplayConstraints, buildRecorderOptions,
  pickMimeType, resolveQuality } from './recording-profile.js';
import { buildSrt, groupCaptionSegments, validSegments, validSrt } from './subtitles.js';


// recorder.js v4 — Runs in recorder.html (extension page in its own tab)
// This page stays open, so no popup-closing issues.

// ---- State ----
let mode = 'video';
let splitRecorder = null;
let parts = [];
let finalizeQueue = Promise.resolve();
let captureStream = null;
let micStream = null;
let audioCtx = null;
let timerInterval = null;
let startTime = null;
let pausedMs = 0;
let pauseStart = null;
let paused = false;
let finalDur = '00:00';
let recordingFilename = '';
let transcriptEnabled = false;
let transcriptLang = 'pt-BR';
let deepgramSocket = null;
let transcriptFull = '';
let transcriptSegments = [];
let audioWorkletNode = null;
let transcriptAudioCtx = null;
let recordedBlob = null;
let stopping = false;
let wasPaused = false;
let postSession;
let transcriptClosing = Promise.resolve();
let unsavedRecording = false;
let quality = DEFAULT_QUALITY;
let transcriptPaused = false;
let stopKeepAlive = null;
let showErrTimer = null;
let recovery = null;
let savedDeepgramKey = '';
let savedElevenKey = '';

// ---- DOM ----
const $ = (s) => document.getElementById(s) || document.querySelector(s);
const vIdle = $('v-idle'), vRec = $('v-rec'), vDone = $('v-done');
const btnStart = $('btn-start'), btnPause = $('btn-pause'), btnStop = $('btn-stop');
const btnDl = $('btn-dl'), btnDlMp3 = $('btn-dl-mp3'), btnDiscard = $('btn-discard');
const timer = $('timer'), st = $('st'), wave = $('wave');
const doneLabel = $('done-label'), doneDur = $('done-dur'), doneSub = $('done-sub');
const errEl = $('err'), warnEl = $('warn'), logEl = $('log');

// Mensagens da transcrição posterior: sempre citam o serviço que a executou ou vai executá-la.
function postMessages(provider) {
  const { label, maxBytes } = PROVIDERS[isProvider(provider) ? provider : DEFAULT_PROVIDER];
  return {
    KEY_REQUIRED: `Informe e salve a chave ${label} em ⚙ Configurações para transcrever.`,
    AUTH_FAILED: `Chave ${label} recusada. Confira a chave e tente novamente.`,
    PAYMENT_REQUIRED: `Créditos insuficientes na conta ${label}. Verifique o saldo ou o plano.`,
    ACTIVITY_RESTRICTED: `${label} bloqueou a transcrição por atividade incomum nesta conta ou rede. Verifique a conta ou procure o suporte de ${label}.`,
    AUDIO_TOO_LARGE: `O áudio preparado excede o limite de ${maxBytes / 1e9} GB de ${label}.`,
    INVALID_MEDIA: 'Arquivo inválido ou corrompido.',
    REQUEST_REJECTED: `${label} rejeitou a solicitação`,
    UNSUPPORTED_MEDIA: 'Formato ou tipo de arquivo não aceito.',
    NO_AUDIO: 'Este vídeo não contém uma faixa de áudio utilizável.',
    UNSUPPORTED_CODEC: 'A faixa de áudio não pode ser copiada sem conversão.',
    NETWORK_ERROR: `Sem conexão com ${label}. Tente novamente.`,
    RATE_LIMITED: `Limite temporário de ${label}. Tente novamente mais tarde.`,
    TIMEOUT: `${label} demorou demais para responder. Tente novamente.`,
    SERVICE_UNAVAILABLE: `${label} indisponível. Tente novamente.`,
    INVALID_RESPONSE: `Resposta inesperada de ${label}. Tente novamente.`,
    INCOMPLETE_RESULT: 'A resposta não trouxe tempos válidos para as legendas.',
    TRANSCRIPTION_FAILED: 'Não foi possível concluir a transcrição.'
  };
}

function selectedProvider() {
  const value = $('post-provider').value;
  return isProvider(value) ? value : DEFAULT_PROVIDER;
}

function getProviderKey(provider) {
  const storageKey = PROVIDERS[provider].keyStorage;
  return new Promise(resolve => chrome.storage.local.get(storageKey,
    result => resolve(result[storageKey] || '')));
}

function getElevenLabsKey() {
  return getProviderKey('elevenlabs');
}

// Aviso de envio e dica de chave seguem o serviço escolhido (Constitution II).
function renderProviderNotice() {
  const { label } = PROVIDERS[selectedProvider()];
  $('post-notice').textContent = `Para vídeos, a faixa de áudio será separada neste computador. Após clicar em Transcrever, somente o áudio será enviado a ${label}.`;
  $('post-key-hint').textContent = `A chave ${label} é configurada em ⚙ Configurações.`;
}

function renderPostState(state) {
  const processing = state.status === 'processing';
  const active = isProvider(state.provider) ? state.provider : selectedProvider();
  const messages = postMessages(active);
  const { label } = PROVIDERS[active];
  $('post-provider').disabled = processing;
  $('post-start').disabled = processing || !state.source;
  $('post-start').textContent = state.status === 'error' || state.status === 'cancelled' ||
    state.status === 'no-speech' ? 'Tentar novamente' : 'Transcrever áudio';
  $('post-cancel').classList.toggle('hidden', !processing);
  const stages = { preparing: 'Preparando áudio localmente', sending: `Enviando somente áudio a ${label}`,
    waiting: `Envio em andamento; aguardando resposta de ${label}` };
  const counts = state.transcript?.timingInfo;
  const timingSummary = counts
    ? ` ${counts.words} ${counts.words === 1 ? 'palavra' : 'palavras'}; ${counts.valid} ${counts.valid === 1 ? 'tempo válido' : 'tempos válidos'}${counts.missing ? `; ${counts.missing} ${counts.missing === 1 ? 'ausente' : 'ausentes'}` : ''}${counts.invalid ? `; ${counts.invalid} ${counts.invalid === 1 ? 'inválido' : 'inválidos'}` : ''}.`
    : '';
  const statusText = {
    idle: '', ready: 'Arquivo pronto para transcrição.', completed: validSrt(state.transcript?.srt) || validSegments(state.transcript?.segments)
      ? counts && !validSrt(state.transcript?.srt) && counts.valid > 0 && counts.missing + counts.invalid > 0
        ? `Transcrição concluída. SRT disponível com palavras sem tempo próprio agrupadas às vizinhas; sincronização aproximada nesses trechos.${timingSummary}`
        : 'Transcrição concluída.'
      : `Transcrição concluída. TXT disponível; SRT indisponível sem tempos válidos.${timingSummary}`,
    cancelled: 'Transcrição cancelada. A mídia e o texto anterior permanecem disponíveis.',
    'no-speech': 'Nenhuma fala reconhecível. Nenhum TXT ou SRT vazio será gerado.',
    error: state.error === 'REQUEST_REJECTED'
      ? `${messages.REQUEST_REJECTED} (HTTP ${state.errorInfo?.httpStatus || '?'}${state.errorInfo?.field ? `; campo ${state.errorInfo.field}` : ''}).`
      : messages[state.error] || messages.TRANSCRIPTION_FAILED
  };
  $('post-status').textContent = processing
    ? `${stages[state.stage] || 'Processando'}${state.stage === 'preparing' && Number.isFinite(state.progress) ? ` (${Math.round(state.progress * 100)}%)` : ''}.`
    : statusText[state.status];
  const transcript = state.transcript;
  const hasText = Boolean(transcript?.text?.trim());
  $('transcript-done-block').classList.toggle('hidden', !hasText);
  $('transcript-preview').textContent = hasText ? transcript.text : '';
  $('transcript-origin').textContent = !hasText ? ''
    : transcript.origin === 'live' ? 'Transcrição ao vivo (Deepgram)'
      : isProvider(transcript.provider) ? `Transcrito por ${PROVIDERS[transcript.provider].label} (${transcript.language})` : '';
  $('btn-dl-txt').disabled = !hasText;
  $('btn-dl-srt').disabled = !hasText || !(validSrt(transcript?.srt) || validSegments(transcript?.segments)) ||
    (transcript.origin === 'live' && wasPaused);
  $('btn-dl-srt').title = transcript?.origin === 'live' && wasPaused
    ? 'Após uma gravação pausada, transcreva o arquivo final para obter SRT sincronizado.' : '';
}

function resetPostSession() {
  $('post-panel').classList.remove('hidden');
  postSession?.cancel();
  postSession = createPostTranscriptionSession({
    transcribe: async ({ media, language, provider, signal, onStage }) =>
      transcribePreRecorded({ media, language, provider, signal, onStage, key: await getProviderKey(provider) })
  });
  postSession.subscribe(renderPostState);
}

resetPostSession();

const MAX_LOG_LINES = 300;

// ---- Recuperação ----
// A gravação em andamento é copiada em IndexedDB; a cópia só é apagada quando o arquivo é baixado ou descartado.
function markSaved() {
  unsavedRecording = false;
  recovery?.clear().catch(error => log('Falha ao limpar cópia de segurança: ' + error.message));
}

// ---- Helpers ----
function view(name) {
  [vIdle, vRec, vDone].forEach(v => v.classList.remove('on'));
  ({ idle: vIdle, rec: vRec, done: vDone })[name].classList.add('on');
}


function log(msg) {
  console.log('[REC]', msg);
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  while (logEl.childElementCount > MAX_LOG_LINES) logEl.firstElementChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

function showErr(msg) {
  errEl.textContent = msg;
  errEl.classList.add('on');
  clearTimeout(showErrTimer);
  showErrTimer = setTimeout(() => errEl.classList.remove('on'), 10000);
}

function showWarn(msg) {
  warnEl.textContent = msg;
  warnEl.classList.add('on');
}

// Toggle log panel
$('toggle-log').addEventListener('click', () => {
  logEl.classList.toggle('open');
  $('toggle-log').textContent = logEl.classList.contains('open') ? '▾ log' : '▸ log';
});

// ---- Mode toggle ----
document.querySelectorAll('.mbtn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.mbtn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    mode = b.dataset.m;
    log('Mode: ' + mode);
  });
});

// ---- START ----
btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  btnStart.textContent = 'Abrindo seletor...';
  errEl.classList.remove('on');

  // Minimize before the picker opens so this window isn't visible in the capture
  await new Promise(resolve => {
    chrome.windows.getCurrent(win => {
      chrome.windows.update(win.id, { state: 'minimized' }, resolve);
    });
  });

  try {
    log('Requesting display capture...');

    // getDisplayMedia with selfBrowserSurface:'exclude' hides this tab from the picker
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: buildDisplayConstraints(quality),
      audio: true,
      selfBrowserSurface: 'exclude'
    });

    const aTracks = captureStream.getAudioTracks();
    const vTracks = captureStream.getVideoTracks();
    log(`Capture stream: ${aTracks.length} audio, ${vTracks.length} video tracks`);
    aTracks.forEach((t, i) => log(`  audio[${i}]: "${t.label}" enabled=${t.enabled} muted=${t.muted} state=${t.readyState}`));
    vTracks.forEach((t, i) => log(`  video[${i}]: "${t.label}" enabled=${t.enabled}`));

    if (aTracks.length === 0) {
      showWarn('⚠ Áudio do sistema não detectado. Tentando microfone...');
    }

    // 3. Try to add microphone and mix
    let finalStream = captureStream;

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      log('Microphone captured');

      if (aTracks.length > 0) {
        audioCtx = new AudioContext({ sampleRate: 48000 });
        await audioCtx.resume();
        const dest = audioCtx.createMediaStreamDestination();

        const sysSrc = audioCtx.createMediaStreamSource(new MediaStream(aTracks));
        sysSrc.connect(dest);

        const micSrc = audioCtx.createMediaStreamSource(micStream);
        const gain = audioCtx.createGain();
        gain.gain.value = 0.85;
        micSrc.connect(gain);
        gain.connect(dest);

        const tracks = [...dest.stream.getAudioTracks()];
        if (mode === 'video') tracks.push(...vTracks);
        finalStream = new MediaStream(tracks);
        log('Mixed: system audio + mic');
      } else {
        const tracks = [...micStream.getAudioTracks()];
        if (mode === 'video') tracks.push(...vTracks);
        finalStream = new MediaStream(tracks);
        log('Using mic audio only (no system audio)');
      }
    } catch (micErr) {
      log('Mic not available: ' + micErr.message);
      if (aTracks.length === 0 && mode === 'audio') {
        throw new Error('Sem áudio do sistema e sem microfone disponível');
      }
      if (aTracks.length > 0) {
        const tracks = [...aTracks];
        if (mode === 'video') tracks.push(...vTracks);
        finalStream = new MediaStream(tracks);
        log('Using system audio only (mic unavailable)');
      }
    }

    log('Final tracks:');
    finalStream.getTracks().forEach(t => log(`  ${t.kind}: "${t.label}" enabled=${t.enabled}`));

    // 4. MediaRecorder
    const mime = pickMimeType(mode, type => MediaRecorder.isTypeSupported(type));

    log(`MIME: ${mime} (qualidade: ${quality})`);

    try {
      await recovery?.startSession({ mode, type: mime.split(';')[0], startedAt: Date.now() });
    } catch (error) {
      log('Cópia de segurança indisponível: ' + error.message);
      recovery = null;
    }
    $('recovery').classList.add('hidden');

    recordedBlob = null;
    stopping = false;
    wasPaused = false;
    parts = [];
    finalizeQueue = Promise.resolve();
    $('part-indicator').classList.add('hidden');
    splitRecorder = createSplitRecorder({
      createRecorder: () => new MediaRecorder(finalStream, buildRecorderOptions(mode, mime, quality)),
      limitBytes: resolvePartLimit(location.search),
      timeslice: 1000,
      mimeType: mode === 'video' ? 'video/webm' : 'audio/webm',
      onChunk: ({ part, blob }) => recovery?.appendChunk(blob, part)
        .catch(error => log('Cópia de segurança falhou: ' + error.message)),
      onPartClosed: handlePartClosed,
      onError: handleSplitError
    });

    // If user stops sharing via Chrome native button (a faixa de vídeo existe em ambos os modos)
    captureStream.getVideoTracks().forEach(t => {
      t.addEventListener('ended', () => {
        log('Video track ended (user stopped sharing)');
        doStop();
      });
    });

    splitRecorder.start();
    log('✅ Recording started!');
    if (transcriptEnabled) startTranscription(finalStream);

    // 5. UI
    view('rec');
    warnEl.classList.remove('on');
    paused = false;
    transcriptFull = '';
    transcriptSegments = [];
    resetPostSession();
    updateTranscriptLive('');
    document.getElementById('transcript-panel').classList.toggle('hidden', !transcriptEnabled);
    document.getElementById('transcript-done-block').classList.add('hidden');
    startTime = Date.now();
    pausedMs = 0;
    pauseStart = null;
    setRecUI('rec');

    timerInterval = setInterval(() => {
      timer.textContent = fmt(Date.now() - startTime - pausedMs);
    }, 200);

  } catch (err) {
    if (err.name === 'NotAllowedError') {
      log('User cancelled picker');
    } else {
      log('❌ Start failed: ' + err.message);
      showErr(err.message);
      splitRecorder = null;
      cleanup();
    }
    chrome.windows.getCurrent(win => {
      chrome.windows.update(win.id, { state: 'normal', focused: true });
    });
  }

  resetStart();
});

function resetStart() {
  btnStart.disabled = false;
  btnStart.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg> Iniciar Gravação`;
}

// ---- PAUSE / RESUME ----
btnPause.addEventListener('click', () => {
  if (!splitRecorder) return;
  if (!paused) {
    splitRecorder.pause();
    paused = true;
    wasPaused = true;
    pauseStart = Date.now();
    // Sem áudio na pausa: o Deepgram não transcreve o que não entra no arquivo.
    transcriptPaused = true;
    if (deepgramSocket) stopKeepAlive = startKeepAlive(deepgramSocket);
    clearInterval(timerInterval);
    timerInterval = null;
    setRecUI('pau');
    log('Paused');
  } else {
    splitRecorder.resume();
    paused = false;
    transcriptPaused = false;
    stopKeepAlive?.(); stopKeepAlive = null;
    if (pauseStart) { pausedMs += Date.now() - pauseStart; pauseStart = null; }
    timerInterval = setInterval(() => {
      timer.textContent = fmt(Date.now() - startTime - pausedMs);
    }, 200);
    setRecUI('rec');
    log('Resumed');
  }
});

function setRecUI(s) {
  timer.className = 'timer ' + s;
  st.className = 'status ' + s;
  st.innerHTML = s === 'rec' ? '<span class="dot"></span>Gravando' : '⏸ Pausado';
  wave.className = 'wave' + (s === 'pau' ? ' pau' : '');
  btnPause.innerHTML = s === 'rec'
    ? `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>Pausar`
    : `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Retomar`;
}

// ---- STOP ----
btnStop.addEventListener('click', () => doStop());

async function doStop() {
  if (stopping || !splitRecorder) return;
  stopping = true;
  const recorder = splitRecorder;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (pauseStart) { pausedMs += Date.now() - pauseStart; pauseStart = null; }
  finalDur = fmt(Date.now() - startTime - pausedMs);

  transcriptClosing = stopTranscription();
  unsavedRecording = true;

  chrome.windows.getCurrent(win => {
    chrome.windows.update(win.id, { state: 'normal', focused: true });
  });
  paused = false;

  recordingFilename = `${mode === 'video' ? 'gravacao-video' : 'gravacao-audio'}_${timestamp()}`;
  $('done-title').textContent = 'Gravação Concluída';
  doneLabel.textContent = mode === 'video' ? 'Vídeo + Áudio' : 'Só Áudio';
  doneDur.textContent = 'Duração: ' + finalDur;
  doneSub.textContent = 'Finalizando gravação...';
  btnDl.disabled = true;
  btnDlMp3.disabled = true;
  btnDl.style.display = '';
  btnDiscard.textContent = 'Descartar';
  btnDlMp3.style.display = mode === 'audio' ? '' : 'none';
  $('parts-block').classList.add('hidden');
  view('done');
  log('Stopped. Duration: ' + finalDur);

  // As faixas só param depois de o último pedaço ser entregue: parar antes poderia perdê-lo.
  try {
    const { error } = await recorder.stop();
    cleanup();
    await finalizeQueue;
    if (splitRecorder !== recorder) return;   // descartada enquanto finalizava
    await completeRecording(recorder, error);
  } catch (failure) {
    cleanup();
    log('❌ Falha ao finalizar a gravação: ' + failure.message);
    doneSub.textContent = 'Falha ao finalizar a gravação: ' + failure.message;
  }
}

// ---- PARTES ----
function handlePartClosed(part) {
  log(`Parte ${part.index} fechada: ${(part.blob.size / 1024 / 1024).toFixed(2)} MB`);
  enqueueFinalize(part);
  if (!stopping) {
    $('part-indicator').textContent = `Parte ${part.index + 1}`;
    $('part-indicator').classList.remove('hidden');
  }
}

// Remux e duração, uma parte por vez, para não somar a memória de dois remuxes (DI-006).
function enqueueFinalize(part) {
  const entry = { index: part.index, name: '', blob: part.blob, size: part.blob.size,
    durationSec: null, downloaded: false };
  parts.push(entry);
  finalizeQueue = finalizeQueue.then(async () => {
    const finalBlob = await finalizeWebm(part.blob);
    if (finalBlob === part.blob) log(`Parte ${part.index}: WebM mantido como gravado (remux indisponível)`);
    entry.blob = finalBlob;
    entry.size = finalBlob.size;
    entry.durationSec = await readDuration(finalBlob);
  }).catch(error => log(`Parte ${part.index}: falha ao finalizar (${error.message})`));
}

function handleSplitError(error) {
  log('❌ Falha ao abrir a próxima parte: ' + error.message);
  showErr('Não foi possível continuar a gravação: ' + error.message);
  doStop();
}

function formatPartDuration(seconds) {
  return Number.isFinite(seconds) ? fmt(seconds * 1000) : '--:--';
}

function renderPartsList() {
  const list = $('parts-list');
  list.textContent = '';
  for (const part of parts) {
    const item = document.createElement('div');
    item.className = 'part-item';
    item.dataset.part = String(part.index);
    const info = document.createElement('div');
    info.className = 'part-info';
    const name = document.createElement('span');
    name.className = 'part-name';
    name.textContent = part.name;
    const meta = document.createElement('span');
    meta.className = 'part-meta';
    meta.textContent = `${formatPartDuration(part.durationSec)} · ${(part.size / 1024 / 1024).toFixed(1)} MB` +
      (part.downloaded ? ' · baixada' : '');
    info.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'part-actions';
    const download = document.createElement('button');
    download.className = 'part-btn';
    download.dataset.act = 'dl';
    download.textContent = 'Baixar';
    actions.append(download);
    item.append(info, actions);
    list.append(item);
  }
}

function downloadPart(index) {
  const part = parts.find(entry => entry.index === index);
  if (!part) return;
  downloadBlob(part.blob, part.name);
  part.downloaded = true;
  unsavedRecording = parts.some(entry => !entry.downloaded);
  recovery?.markPartDownloaded(part.index)
    .catch(error => log('Falha ao limpar cópia de segurança: ' + error.message));
  log(`Download: ${part.name} (${(part.size / 1024 / 1024).toFixed(2)} MB)`);
  renderPartsList();
}

$('parts-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;
  const index = Number(button.closest('.part-item').dataset.part);
  if (button.dataset.act === 'dl') downloadPart(index);
});

// Fim da gravação: uma parte segue o caminho de sempre (DI-004); várias viram a lista de partes.
async function completeRecording(recorder, error) {
  log(`Gravação encerrada: ${parts.length} parte(s)`);
  if (error) log('Gravação interrompida: ' + error.message);
  if (parts.length === 0) {
    markSaved();
    doneSub.textContent = error ? `Gravação interrompida: ${error.message}` : 'Gravação vazia. Tente novamente.';
    return;
  }
  parts.forEach(part => { part.name = partFileName(recordingFilename, part.index, parts.length); });
  if (parts.length > 1) {
    btnDl.style.display = 'none';
    btnDlMp3.style.display = 'none';
    $('post-panel').classList.add('hidden');
    renderPartsList();
    $('parts-block').classList.remove('hidden');
    doneSub.textContent = error ? `${parts.length} partes (interrompida: ${error.message})` : `${parts.length} partes prontas`;
    return;
  }
  recordedBlob = parts[0].blob;
  postSession.setSource({ blob: recordedBlob, name: `${recordingFilename}.webm`,
    origin: 'recorded', kind: mode });
  doneSub.textContent = error ? `Arquivo .webm pronto (interrompida: ${error.message})` : 'Arquivo .webm pronto';
  btnDl.disabled = false;
  btnDlMp3.disabled = false;
  // Aguarda o Deepgram entregar os últimos resultados antes de fixar o texto ao vivo.
  await transcriptClosing;
  if (splitRecorder !== recorder) return;
  if (transcriptFull.trim()) {
    try {
      postSession.setExistingTranscript({ text: transcriptFull.trim(), segments: transcriptSegments,
        language: transcriptLang, origin: 'live' });
    } catch (liveError) {
      log('Transcrição ao vivo não aplicada: ' + liveError.message);
    }
  }
}

// ---- DOWNLOAD ----
btnDl.addEventListener('click', () => {
  if (!recordedBlob) { doneSub.textContent = 'Aguardando finalização da gravação.'; return; }
  const blob = recordedBlob;
  markSaved();
  log('Download: ' + (blob.size / 1024 / 1024).toFixed(2) + ' MB');

  downloadBlob(blob, `${recordingFilename}.webm`);
});

// ---- ENCODE MP3 ----
// A decodificação fica na página (AudioContext não existe em Worker); a codificação roda no worker.
async function encodeMp3(webmBlob, onProgress) {
  const arrayBuffer = await webmBlob.arrayBuffer();
  const decodeCtx = new AudioContext();
  const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  const left = floatToInt16(audioBuffer.getChannelData(0));
  const right = audioBuffer.numberOfChannels > 1 ? floatToInt16(audioBuffer.getChannelData(1)) : null;

  return new Promise((resolve, reject) => {
    const worker = new Worker(chrome.runtime.getURL('dist/mp3-worker.bundle.js'));
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { onProgress?.(data.progress); return; }
      worker.terminate();
      if (data.type === 'done') resolve(data.blob);
      else reject(new Error(data.message));
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'Falha no worker de MP3')); };
    const transfer = [left.buffer, ...(right ? [right.buffer] : [])];
    worker.postMessage({ left, right, sampleRate: audioBuffer.sampleRate, kbps: 128 }, transfer);
  });
}

// ---- DOWNLOAD MP3 ----
btnDlMp3.addEventListener('click', async () => {
  if (!recordedBlob) { doneSub.textContent = 'Aguardando finalização da gravação.'; return; }

  btnDlMp3.disabled = true;
  btnDlMp3.textContent = 'Convertendo…';
  try {
    const webmBlob = recordedBlob;
    const mp3Blob = await encodeMp3(webmBlob, progress => {
      btnDlMp3.textContent = `Convertendo… ${Math.round(progress * 100)}%`;
    });
    markSaved();
    log('MP3: ' + (mp3Blob.size / 1024 / 1024).toFixed(2) + ' MB');

    downloadBlob(mp3Blob, `gravacao-audio_${timestamp()}.mp3`);
  } catch (e) {
    log('MP3 error: ' + e.message);
    showErr('Erro ao converter para MP3: ' + e.message);
  } finally {
    btnDlMp3.disabled = false;
    btnDlMp3.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Baixar .mp3`;
  }
});

// ---- DISCARD ----
btnDiscard.addEventListener('click', () => {
  recordedBlob = null;
  splitRecorder = null;
  parts = [];
  $('parts-block').classList.add('hidden');
  markSaved();
  resetPostSession();
  $('import-file').value = '';
  cleanup();
  view('idle');
  log('Discarded');
});

// ---- CLEANUP ----
function cleanup() {
  if (captureStream) { captureStream.getTracks().forEach(t => t.stop()); captureStream = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioCtx && audioCtx.state !== 'closed') { audioCtx.close().catch(() => {}); audioCtx = null; }
}

// ---- TRANSCRIPT ----
function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get('deepgramKey', r => resolve(r.deepgramKey || ''));
  });
}

function saveApiKey(key) {
  chrome.storage.local.set({ deepgramKey: key });
}

async function startTranscription(stream) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    showWarn('⚠ API key Deepgram não configurada. Salve a key em ⚙ Configurações antes de gravar.');
    return;
  }

  deepgramSocket = new WebSocket(
    `wss://api.deepgram.com/v1/listen?language=${transcriptLang}&model=nova-3&punctuate=true&interim_results=true&encoding=linear16&sample_rate=16000`,
    ['token', apiKey]
  );

  deepgramSocket.onopen = async () => {
    log('Deepgram connected');
    try {
      transcriptAudioCtx = new AudioContext({ sampleRate: 16000 });
      await transcriptAudioCtx.audioWorklet.addModule(chrome.runtime.getURL('dist/audio-processor.js'));
      const source = transcriptAudioCtx.createMediaStreamSource(stream);
      audioWorkletNode = new AudioWorkletNode(transcriptAudioCtx, 'audio-collector');
      source.connect(audioWorkletNode);
      audioWorkletNode.port.onmessage = (e) => {
        if (!transcriptPaused && deepgramSocket?.readyState === WebSocket.OPEN) {
          deepgramSocket.send(e.data);
        }
      };
      log('AudioWorklet → Deepgram stream ativo');
    } catch (e) {
      log('AudioWorklet error: ' + e.message);
    }
  };

  deepgramSocket.onmessage = (e) => {
    const data = JSON.parse(e.data);
    const text = data?.channel?.alternatives?.[0]?.transcript;
    if (!text) return;
    if (data.is_final) {
      transcriptSegments.push({ start: data.start, end: data.start + data.duration, text });
      transcriptFull += text + ' ';
      updateTranscriptLive(transcriptFull);
    } else {
      updateTranscriptLive(transcriptFull + text);
    }
  };

  deepgramSocket.onerror = () => log('Deepgram error');
  deepgramSocket.onclose = (e) => log('Deepgram closed: code=' + e.code);
}

function stopTranscription() {
  stopKeepAlive?.(); stopKeepAlive = null;
  transcriptPaused = false;
  if (audioWorkletNode) { audioWorkletNode.disconnect(); audioWorkletNode = null; }
  const socket = deepgramSocket;
  deepgramSocket = null;
  if (transcriptAudioCtx && transcriptAudioCtx.state !== 'closed') {
    transcriptAudioCtx.close().catch(() => {});
    transcriptAudioCtx = null;
  }
  return closeDeepgramSocket(socket);
}

function updateTranscriptLive(text) {
  const el = document.getElementById('transcript-live');
  if (el) { el.textContent = text; el.scrollTop = el.scrollHeight; }
}

document.getElementById('toggle-transcript').addEventListener('change', (e) => {
  transcriptEnabled = e.target.checked;
  document.getElementById('lang-row').classList.toggle('hidden', !transcriptEnabled);
});

$('btn-settings').addEventListener('click', () => $('card').classList.add('settings-open'));
$('btn-settings-close').addEventListener('click', () => {
  document.querySelectorAll('.btn-eye').forEach(btn => setReveal(btn, false));
  $('card').classList.remove('settings-open');
});

document.querySelectorAll('.lbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lbtn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    transcriptLang = btn.dataset.lang;
    log('Idioma transcrição: ' + transcriptLang);
  });
});

document.getElementById('btn-save-key').addEventListener('click', async () => {
  const key = document.getElementById('input-api-key').value.trim();
  if (!key) return;

  const btn = document.getElementById('btn-save-key');
  const statusEl = document.getElementById('key-status');

  btn.disabled = true;
  btn.textContent = 'Validando...';
  statusEl.className = 'key-status checking';
  statusEl.textContent = 'Verificando com o Deepgram...';
  statusEl.classList.remove('hidden');

  try {
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { 'Authorization': 'Token ' + key }
    });
    if (res.ok) {
      saveApiKey(key);
      savedDeepgramKey = key;
      log('API key Deepgram válida e salva');
      statusEl.className = 'key-status ok';
      statusEl.textContent = '✓ Key válida — salva com sucesso';
      btn.textContent = 'Salvo ✓';
      setTimeout(() => { btn.textContent = 'Salvar'; }, 3000);
    } else {
      log('API key inválida: HTTP ' + res.status);
      statusEl.className = 'key-status err';
      statusEl.textContent = `✗ Key inválida (HTTP ${res.status}) — verifique no console Deepgram`;
      btn.textContent = 'Salvar';
    }
  } catch (e) {
    log('Erro ao validar key: ' + e.message);
    statusEl.className = 'key-status err';
    statusEl.textContent = '✗ Sem conexão — não foi possível validar';
    btn.textContent = 'Salvar';
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-dl-txt').addEventListener('click', () => {
  const transcript = postSession.getSnapshot().transcript;
  if (!transcript?.text?.trim()) return;
  downloadBlob(new Blob([transcript.text.trim()], { type: 'text/plain;charset=utf-8' }),
    `transcricao_${timestamp()}.txt`);
});

document.getElementById('btn-dl-srt').addEventListener('click', () => {
  const transcript = postSession.getSnapshot().transcript;
  if (transcript?.origin === 'live' && wasPaused) return;
  const srt = validSrt(transcript?.srt) ? transcript.srt
    : validSegments(transcript?.segments) ? buildSrt(transcript.origin === 'post'
      ? groupCaptionSegments(transcript.segments) : transcript.segments) : null;
  if (!srt) return;
  downloadBlob(new Blob([srt], { type: 'text/plain;charset=utf-8' }), `${recordingFilename}.srt`);
});

$('post-start').addEventListener('click', async () => {
  try {
    await postSession.start({ language: $('post-lang').value, provider: selectedProvider(),
      confirmedExternalSend: true });
  } catch (error) {
    $('post-status').textContent = postMessages(selectedProvider())[error.code] || 'A gravação ainda não está pronta.';
  }
});

$('post-cancel').addEventListener('click', () => postSession.cancel());
// Última escolha de provedor: lembrada entre aberturas (valor desconhecido cai no padrão).
$('post-provider').addEventListener('change', () => {
  renderProviderNotice();
  chrome.storage.local.set({ postProvider: selectedProvider() });
});
chrome.storage.local.get('postProvider', result => {
  $('post-provider').value = isProvider(result.postProvider) ? result.postProvider : DEFAULT_PROVIDER;
  renderProviderNotice();
});
renderProviderNotice();

$('post-save-key').addEventListener('click', () => {
  const key = $('post-key').value.trim();
  if (!key) {
    $('post-key-status').textContent = 'Informe uma chave ElevenLabs.';
    return;
  }
  chrome.storage.local.set({ elevenLabsKey: key }, () => {
    savedElevenKey = key;
    setKeyStatus($('post-key-status'), 'ok',
      '✓ Chave salva localmente. A validade será conferida na próxima transcrição.');
  });
});

// ---- Estado visível das chaves ----
function setKeyStatus(el, state, text) {
  el.className = 'key-status ' + state;
  el.textContent = text;
}

function syncDeepgramStatus() {
  const current = $('input-api-key').value.trim();
  const el = $('key-status');
  if (current && current === savedDeepgramKey) setKeyStatus(el, 'ok', '✓ Key salva');
  else if (current) setKeyStatus(el, 'none', 'Alterações não salvas — clique em Salvar.');
  else if (savedDeepgramKey) setKeyStatus(el, 'none', 'Campo vazio — a key salva continua em uso.');
  else setKeyStatus(el, 'none', 'Nenhuma chave configurada.');
}

function syncElevenStatus() {
  const current = $('post-key').value.trim();
  const el = $('post-key-status');
  if (current && current === savedElevenKey) setKeyStatus(el, 'ok', '✓ Chave ElevenLabs salva localmente.');
  else if (current) setKeyStatus(el, 'none', 'Alterações não salvas — clique em Salvar.');
  else if (savedElevenKey) setKeyStatus(el, 'none', 'Campo vazio — a chave salva continua em uso.');
  else setKeyStatus(el, 'none', 'Chave ElevenLabs ainda não configurada.');
}

$('input-api-key').addEventListener('input', syncDeepgramStatus);
$('post-key').addEventListener('input', syncElevenStatus);

// Olho: mostra ou oculta a chave digitada/salva.
function setReveal(btn, show) {
  $(btn.dataset.target).type = show ? 'text' : 'password';
  btn.setAttribute('aria-pressed', String(show));
  const label = show ? 'Ocultar chave' : 'Mostrar chave';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

document.querySelectorAll('.btn-eye').forEach(btn => btn.addEventListener('click', () =>
  setReveal(btn, btn.getAttribute('aria-pressed') !== 'true')));

$('import-file').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const extension = file.name.toLowerCase().match(/\.(webm|mp4|mp3)$/)?.[1];
  const allowed = { webm: ['video/webm', 'audio/webm'], mp4: ['video/mp4'],
    mp3: ['audio/mpeg', 'audio/mp3'] };
  if (!extension || !allowed[extension].includes(file.type) || !file.size) {
    $('import-file-name').textContent = 'Arquivo inválido ou tipo incompatível. Escolha WebM, MP4 ou MP3 válido.';
    event.target.value = '';
    return;
  }
  resetPostSession();
  recordingFilename = file.name.replace(/\.(webm|mp4|mp3)$/i, '');
  postSession.setSource({ blob: file, name: file.name, origin: 'selected',
    kind: file.type.startsWith('video/') ? 'video' : 'audio' });
  $('import-file-name').textContent = file.name;
  $('done-title').textContent = 'Arquivo selecionado';
  doneSub.textContent = 'Pronto para transcrição';
  doneLabel.textContent = file.name;
  doneDur.textContent = file.type;
  btnDl.style.display = 'none';
  btnDlMp3.style.display = 'none';
  btnDiscard.textContent = 'Selecionar outro arquivo';
  view('done');
});

// ---- Quality ----
function applyQuality(name) {
  quality = resolveQuality(name);
  document.querySelectorAll('.qbtn').forEach(b => b.classList.toggle('on', b.dataset.q === quality));
  const p = QUALITY_PRESETS[quality];
  $('quality-desc').textContent = `Formato WebM (VP9 + Opus). ${p.label}: até ${p.height}p a ${p.frameRate} fps, ` +
    `vídeo ${p.videoBitsPerSecond / 1_000_000} Mbps, áudio ${p.audioBitsPerSecond / 1000} kbps.`;
}

document.querySelectorAll('.qbtn').forEach(btn => btn.addEventListener('click', () => {
  applyQuality(btn.dataset.q);
  chrome.storage.local.set({ recordingQuality: quality });
  log('Qualidade: ' + quality);
}));

chrome.storage.local.get('recordingQuality', r => applyQuality(r.recordingQuality));

// ---- Recover interrupted recording ----
async function offerRecovery() {
  try {
    recovery = await openRecoveryStore();
    const session = await recovery.loadSession();
    if (!session) return;
    const when = session.meta.startedAt ? new Date(session.meta.startedAt).toLocaleString() : 'data desconhecida';
    const mb = (session.blob.size / 1024 / 1024).toFixed(1);
    $('recovery-text').textContent = `Encontrada uma gravação interrompida (${when}, ${mb} MB). ` +
      'Iniciar uma nova gravação descarta esta cópia.';
    $('recovery').classList.remove('hidden');
    $('recovery-restore').onclick = () => restoreRecording(session);
    $('recovery-discard').onclick = () => {
      markSaved();
      $('recovery').classList.add('hidden');
      log('Gravação interrompida descartada');
    };
  } catch (error) {
    log('Cópia de segurança indisponível: ' + error.message);
    recovery = null;
  }
}

async function restoreRecording({ meta, blob }) {
  $('recovery-restore').disabled = true;
  try {
    const finalBlob = await finalizeWebm(blob);
    mode = meta.mode === 'audio' ? 'audio' : 'video';
    splitRecorder = null;
    parts = [];
    stopping = false;
    wasPaused = false;
    recordedBlob = finalBlob;
    recordingFilename = `${mode === 'video' ? 'gravacao-video' : 'gravacao-audio'}_recuperada_${timestamp(new Date(meta.startedAt || Date.now()))}`;
    resetPostSession();
    postSession.setSource({ blob: finalBlob, name: `${recordingFilename}.webm`, origin: 'recorded', kind: mode });
    unsavedRecording = true;
    $('done-title').textContent = 'Gravação recuperada';
    doneLabel.textContent = mode === 'video' ? 'Vídeo + Áudio' : 'Só Áudio';
    doneDur.textContent = 'Duração: não registrada';
    doneSub.textContent = 'Arquivo .webm pronto';
    btnDl.disabled = false;
    btnDlMp3.disabled = false;
    btnDl.style.display = '';
    btnDlMp3.style.display = mode === 'audio' ? '' : 'none';
    btnDiscard.textContent = 'Descartar';
    $('recovery').classList.add('hidden');
    view('done');
    log('Gravação interrompida recuperada');
  } catch (error) {
    showErr('Não foi possível recuperar a gravação: ' + error.message);
  } finally {
    $('recovery-restore').disabled = false;
  }
}

// ---- Exit guard ----
createUnloadGuard(window, () =>
  (splitRecorder && splitRecorder.state !== 'inactive') || unsavedRecording);

// ---- Init ----
getApiKey().then(k => {
  savedDeepgramKey = k;
  $('input-api-key').value = k;
  syncDeepgramStatus();
});
getElevenLabsKey().then(k => {
  savedElevenKey = k;
  $('post-key').value = k;
  syncElevenStatus();
});
offerRecovery();
log('Recorder page loaded. Ready.');
