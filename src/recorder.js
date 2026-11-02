import { fmt } from './utils/timer.js';
import { createPostTranscriptionSession } from './post-transcription-session.js';
import { transcribePreRecorded } from './post-transcription-client.js';
import { buildSrt, groupCaptionSegments, validSegments, validSrt } from './subtitles.js';


// recorder.js v4 — Runs in recorder.html (extension page in its own tab)
// This page stays open, so no popup-closing issues.

// ---- State ----
let mode = 'video';
let mediaRecorder = null;
let chunks = [];
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

// ---- DOM ----
const $ = (s) => document.getElementById(s) || document.querySelector(s);
const vIdle = $('v-idle'), vRec = $('v-rec'), vDone = $('v-done');
const btnStart = $('btn-start'), btnPause = $('btn-pause'), btnStop = $('btn-stop');
const btnDl = $('btn-dl'), btnDlMp3 = $('btn-dl-mp3'), btnDiscard = $('btn-discard');
const timer = $('timer'), st = $('st'), wave = $('wave');
const doneLabel = $('done-label'), doneDur = $('done-dur'), doneSub = $('done-sub');
const errEl = $('err'), warnEl = $('warn'), logEl = $('log');

const postMessages = {
  KEY_REQUIRED: 'Informe e salve a chave ElevenLabs em ⚙ Configurações para transcrever.',
  AUTH_FAILED: 'Chave ElevenLabs recusada. Confira a chave e tente novamente.',
  ACTIVITY_RESTRICTED: 'A ElevenLabs bloqueou a transcrição por atividade incomum nesta conta ou rede. Verifique a conta ou procure o suporte da ElevenLabs.',
  AUDIO_TOO_LARGE: 'O áudio preparado excede o limite de 5 GB da ElevenLabs.',
  INVALID_MEDIA: 'Arquivo inválido ou corrompido.',
  REQUEST_REJECTED: 'A ElevenLabs rejeitou a solicitação',
  UNSUPPORTED_MEDIA: 'Formato ou tipo de arquivo não aceito.',
  NO_AUDIO: 'Este vídeo não contém uma faixa de áudio utilizável.',
  UNSUPPORTED_CODEC: 'A faixa de áudio não pode ser copiada sem conversão.',
  NETWORK_ERROR: 'Sem conexão com a ElevenLabs. Tente novamente.',
  RATE_LIMITED: 'Limite temporário da ElevenLabs. Tente novamente mais tarde.',
  TIMEOUT: 'A ElevenLabs demorou demais para responder. Tente novamente.',
  SERVICE_UNAVAILABLE: 'ElevenLabs indisponível. Tente novamente.',
  INCOMPLETE_RESULT: 'A resposta não trouxe tempos válidos para as legendas.',
  TRANSCRIPTION_FAILED: 'Não foi possível concluir a transcrição.'
};

function getElevenLabsKey() {
  return new Promise(resolve => chrome.storage.local.get('elevenLabsKey',
    result => resolve(result.elevenLabsKey || '')));
}

function renderPostState(state) {
  const processing = state.status === 'processing';
  $('post-start').disabled = processing || !state.source;
  $('post-start').textContent = state.status === 'error' || state.status === 'cancelled' ||
    state.status === 'no-speech' ? 'Tentar novamente' : 'Transcrever áudio';
  $('post-cancel').classList.toggle('hidden', !processing);
  const stages = { preparing: 'Preparando áudio localmente', sending: 'Enviando somente áudio à ElevenLabs',
    waiting: 'Envio em andamento; aguardando resposta da ElevenLabs' };
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
      ? `${postMessages.REQUEST_REJECTED} (HTTP ${state.errorInfo?.httpStatus || '?'}${state.errorInfo?.field ? `; campo ${state.errorInfo.field}` : ''}).`
      : postMessages[state.error] || postMessages.TRANSCRIPTION_FAILED
  };
  $('post-status').textContent = processing
    ? `${stages[state.stage] || 'Processando'}${state.stage === 'preparing' && Number.isFinite(state.progress) ? ` (${Math.round(state.progress * 100)}%)` : ''}.`
    : statusText[state.status];
  const transcript = state.transcript;
  const hasText = Boolean(transcript?.text?.trim());
  $('transcript-done-block').classList.toggle('hidden', !hasText);
  $('transcript-preview').textContent = hasText ? transcript.text : '';
  $('btn-dl-txt').disabled = !hasText;
  $('btn-dl-srt').disabled = !hasText || !(validSrt(transcript?.srt) || validSegments(transcript?.segments)) ||
    (transcript.origin === 'live' && wasPaused);
  $('btn-dl-srt').title = transcript?.origin === 'live' && wasPaused
    ? 'Após uma gravação pausada, transcreva o arquivo final para obter SRT sincronizado.' : '';
}

function resetPostSession() {
  postSession?.cancel();
  postSession = createPostTranscriptionSession({
    transcribe: async ({ media, language, signal, onStage }) =>
      transcribePreRecorded({ media, language, signal, onStage, key: await getElevenLabsKey() })
  });
  postSession.subscribe(renderPostState);
}

resetPostSession();

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
  logEl.scrollTop = logEl.scrollHeight;
}

function showErr(msg) {
  errEl.textContent = msg;
  errEl.classList.add('on');
  setTimeout(() => errEl.classList.remove('on'), 10000);
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
      video: {
        width: { max: 1920 },
        height: { max: 1080 },
        frameRate: { max: 30 }
      },
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
    const mime = mode === 'video'
      ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus'
        : 'video/webm')
      : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : 'audio/webm');

    log('MIME: ' + mime);

    chunks = [];
    recordedBlob = null;
    stopping = false;
    wasPaused = false;
    mediaRecorder = new MediaRecorder(finalStream, {
      mimeType: mime,
      videoBitsPerSecond: mode === 'video' ? 5000000 : undefined,
      audioBitsPerSecond: 128000
    });
    const recorderForSession = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      if (mediaRecorder !== recorderForSession) return;
      const totalBytes = chunks.reduce((s, c) => s + c.size, 0);
      log(`Recorder stopped. ${chunks.length} chunks, ${(totalBytes/1024/1024).toFixed(2)} MB`);
      if (!totalBytes) {
        doneSub.textContent = 'Gravação vazia. Tente novamente.';
        return;
      }
      recordedBlob = new Blob(chunks, { type: mode === 'video' ? 'video/webm' : 'audio/webm' });
      postSession.setSource({ blob: recordedBlob, name: `${recordingFilename}.webm`,
        origin: 'recorded', kind: mode });
      if (transcriptFull.trim()) {
        postSession.setExistingTranscript({ text: transcriptFull.trim(), segments: transcriptSegments,
          language: transcriptLang, origin: 'live' });
      }
      doneSub.textContent = 'Arquivo .webm pronto';
      btnDl.disabled = false;
      btnDlMp3.disabled = false;
    };

    mediaRecorder.onerror = (e) => {
      log('Recorder error: ' + (e.error?.message || e));
      showErr('Erro no MediaRecorder');
    };

    // If user stops sharing via Chrome native button
    finalStream.getVideoTracks().forEach(t => {
      t.addEventListener('ended', () => {
        log('Video track ended (user stopped sharing)');
        doStop();
      });
    });

    mediaRecorder.start(1000);
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
  if (!mediaRecorder) return;
  if (!paused) {
    mediaRecorder.pause();
    paused = true;
    wasPaused = true;
    pauseStart = Date.now();
    clearInterval(timerInterval);
    timerInterval = null;
    setRecUI('pau');
    log('Paused');
  } else {
    mediaRecorder.resume();
    paused = false;
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

function doStop() {
  if (stopping || !mediaRecorder) return;
  stopping = true;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (pauseStart) { pausedMs += Date.now() - pauseStart; pauseStart = null; }
  finalDur = fmt(Date.now() - startTime - pausedMs);

  if (mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  stopTranscription();
  cleanup();

  chrome.windows.getCurrent(win => {
    chrome.windows.update(win.id, { state: 'normal', focused: true });
  });
  paused = false;

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  recordingFilename = `${mode === 'video' ? 'gravacao-video' : 'gravacao-audio'}_${ts}`;
  $('done-title').textContent = 'Gravação Concluída';
  doneLabel.textContent = mode === 'video' ? 'Vídeo + Áudio' : 'Só Áudio';
  doneDur.textContent = 'Duração: ' + finalDur;
  doneSub.textContent = 'Finalizando gravação...';
  btnDl.disabled = true;
  btnDlMp3.disabled = true;
  btnDl.style.display = '';
  btnDiscard.textContent = 'Descartar';
  btnDlMp3.style.display = mode === 'audio' ? '' : 'none';
  view('done');
  log('Stopped. Duration: ' + finalDur);
}

// ---- DOWNLOAD ----
btnDl.addEventListener('click', () => {
  if (!recordedBlob) { doneSub.textContent = 'Aguardando finalização da gravação.'; return; }
  const blob = recordedBlob;
  log('Download: ' + (blob.size / 1024 / 1024).toFixed(2) + ' MB');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${recordingFilename}.webm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
});

// ---- ENCODE MP3 ----
async function encodeMp3(webmBlob) {
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);

  function toInt16(floatArr) {
    const int16 = new Int16Array(floatArr.length);
    for (let i = 0; i < floatArr.length; i++) {
      const s = Math.max(-1, Math.min(1, floatArr[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  const left = toInt16(audioBuffer.getChannelData(0));
  const right = channels > 1 ? toInt16(audioBuffer.getChannelData(1)) : left;

  const mp3Chunks = [];
  const blockSize = 1152;
  for (let i = 0; i < left.length; i += blockSize) {
    const encoded = encoder.encodeBuffer(
      left.subarray(i, i + blockSize),
      right.subarray(i, i + blockSize)
    );
    if (encoded.length > 0) mp3Chunks.push(encoded);
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) mp3Chunks.push(flushed);

  return new Blob(mp3Chunks, { type: 'audio/mpeg' });
}

// ---- DOWNLOAD MP3 ----
btnDlMp3.addEventListener('click', async () => {
  if (!recordedBlob) { doneSub.textContent = 'Aguardando finalização da gravação.'; return; }

  btnDlMp3.disabled = true;
  btnDlMp3.textContent = 'Convertendo…';
  try {
    const webmBlob = recordedBlob;
    const mp3Blob = await encodeMp3(webmBlob);
    log('MP3: ' + (mp3Blob.size / 1024 / 1024).toFixed(2) + ' MB');

    const url = URL.createObjectURL(mp3Blob);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gravacao-audio_${ts}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
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
  chunks = [];
  recordedBlob = null;
  mediaRecorder = null;
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
    `wss://api.deepgram.com/v1/listen?language=${transcriptLang}&model=nova-2&punctuate=true&interim_results=true&encoding=linear16&sample_rate=16000`,
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
        if (deepgramSocket?.readyState === WebSocket.OPEN) {
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
  if (audioWorkletNode) { audioWorkletNode.disconnect(); audioWorkletNode = null; }
  if (deepgramSocket) { deepgramSocket.close(); deepgramSocket = null; }
  if (transcriptAudioCtx && transcriptAudioCtx.state !== 'closed') {
    transcriptAudioCtx.close().catch(() => {});
    transcriptAudioCtx = null;
  }
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
$('btn-settings-close').addEventListener('click', () => $('card').classList.remove('settings-open'));

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
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([transcript.text.trim()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transcricao_${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
});

document.getElementById('btn-dl-srt').addEventListener('click', () => {
  const transcript = postSession.getSnapshot().transcript;
  if (transcript?.origin === 'live' && wasPaused) return;
  const srt = validSrt(transcript?.srt) ? transcript.srt
    : validSegments(transcript?.segments) ? buildSrt(transcript.origin === 'post'
      ? groupCaptionSegments(transcript.segments) : transcript.segments) : null;
  if (!srt) return;
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${recordingFilename}.srt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
});

$('post-start').addEventListener('click', async () => {
  try {
    await postSession.start({ language: $('post-lang').value, confirmedExternalSend: true });
  } catch (error) {
    $('post-status').textContent = postMessages[error.code] || 'A gravação ainda não está pronta.';
  }
});

$('post-cancel').addEventListener('click', () => postSession.cancel());

$('post-save-key').addEventListener('click', () => {
  const key = $('post-key').value.trim();
  if (!key) {
    $('post-key-status').textContent = 'Informe uma chave ElevenLabs.';
    return;
  }
  chrome.storage.local.set({ elevenLabsKey: key }, () => {
    $('post-key-status').textContent = 'Chave salva localmente. A validade será conferida na próxima transcrição.';
    $('post-key').value = '';
  });
});

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

// ---- Init ----
getApiKey().then(k => {
  if (k) {
    document.getElementById('input-api-key').value = k;
    const statusEl = document.getElementById('key-status');
    statusEl.className = 'key-status ok';
    statusEl.textContent = '✓ Key salva';
    statusEl.classList.remove('hidden');
  }
});
getElevenLabsKey().then(k => {
  $('post-key-status').textContent = k ? 'Chave ElevenLabs salva localmente.' : 'Chave ElevenLabs ainda não configurada.';
});
log('Recorder page loaded. Ready.');
