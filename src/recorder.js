import { fmt } from './utils/timer.js';


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

// ---- DOM ----
const $ = (s) => document.getElementById(s) || document.querySelector(s);
const vIdle = $('v-idle'), vRec = $('v-rec'), vDone = $('v-done');
const btnStart = $('btn-start'), btnPause = $('btn-pause'), btnStop = $('btn-stop');
const btnDl = $('btn-dl'), btnDlMp3 = $('btn-dl-mp3'), btnDiscard = $('btn-discard');
const timer = $('timer'), st = $('st'), wave = $('wave');
const doneLabel = $('done-label'), doneDur = $('done-dur'), doneSub = $('done-sub');
const errEl = $('err'), warnEl = $('warn'), logEl = $('log');

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

  try {
    // 1. Ask background to open desktopCapture picker
    log('Requesting desktopCapture picker...');
    const res = await chrome.runtime.sendMessage({ action: 'request-desktop-capture' });

    log('Picker response: ' + JSON.stringify(res));

    if (!res) {
      throw new Error('Sem resposta do background. Recarregue a extensão.');
    }
    if (res.error) {
      if (res.error === 'cancelled') {
        log('User cancelled picker');
        resetStart();
        return;
      }
      throw new Error(res.error);
    }
    if (!res.streamId) {
      throw new Error('streamId vazio');
    }

    const streamId = res.streamId;
    log('Got streamId: ' + streamId.substring(0, 30) + '...');

    // 2. getUserMedia with chromeMediaSource:'desktop' — captures SYSTEM audio
    log('Calling getUserMedia (chromeMediaSource: desktop)...');

    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      }
    };

    constraints.video = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: streamId,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 30
      }
    };

    captureStream = await navigator.mediaDevices.getUserMedia(constraints);

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
    mediaRecorder = new MediaRecorder(finalStream, {
      mimeType: mime,
      videoBitsPerSecond: mode === 'video' ? 5000000 : undefined,
      audioBitsPerSecond: 128000
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const totalBytes = chunks.reduce((s, c) => s + c.size, 0);
      log(`Recorder stopped. ${chunks.length} chunks, ${(totalBytes/1024/1024).toFixed(2)} MB`);
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

    chrome.windows.getCurrent(win => {
      chrome.windows.update(win.id, { state: 'minimized' });
    });

    // 5. UI
    view('rec');
    warnEl.classList.remove('on');
    paused = false;
    transcriptFull = '';
    transcriptSegments = [];
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
    log('❌ Start failed: ' + err.message);
    showErr(err.message);
    cleanup();
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
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (pauseStart) { pausedMs += Date.now() - pauseStart; pauseStart = null; }
  finalDur = fmt(Date.now() - startTime - pausedMs);

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
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
  doneLabel.textContent = mode === 'video' ? 'Vídeo + Áudio' : 'Só Áudio';
  doneDur.textContent = 'Duração: ' + finalDur;
  doneSub.textContent = 'Arquivo .webm pronto';
  btnDlMp3.style.display = mode === 'audio' ? '' : 'none';
  if (transcriptFull.trim()) {
    const tBlock = document.getElementById('transcript-done-block');
    const tPreview = document.getElementById('transcript-preview');
    if (tBlock) tBlock.classList.remove('hidden');
    if (tPreview) tPreview.textContent = transcriptFull.trim().slice(0, 400) + (transcriptFull.length > 400 ? '…' : '');
  }
  view('done');
  log('Stopped. Duration: ' + finalDur);
}

// ---- DOWNLOAD ----
btnDl.addEventListener('click', () => {
  if (chunks.length === 0) { showErr('Nenhum dado!'); return; }

  const isV = mode === 'video';
  const blob = new Blob(chunks, { type: isV ? 'video/webm' : 'audio/webm' });
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
  if (chunks.length === 0) { showErr('Nenhum dado!'); return; }

  btnDlMp3.disabled = true;
  btnDlMp3.textContent = 'Convertendo…';
  try {
    const webmBlob = new Blob(chunks, { type: 'audio/webm' });
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
  mediaRecorder = null;
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
    showWarn('⚠ API key Deepgram não configurada. Ative o toggle e salve a key antes de gravar.');
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
  if (transcriptEnabled) {
    getApiKey().then(k => { if (k) document.getElementById('input-api-key').value = k; });
  }
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

function buildSRT(segments) {
  function fmtTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  }
  return segments
    .filter(seg => seg.text.trim())
    .map((seg, i) => `${i + 1}\n${fmtTime(seg.start)} --> ${fmtTime(seg.end)}\n${seg.text.trim()}`)
    .join('\n\n');
}

document.getElementById('btn-dl-txt').addEventListener('click', () => {
  if (!transcriptFull.trim()) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([transcriptFull.trim()], { type: 'text/plain;charset=utf-8' });
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
  if (!transcriptSegments.length) return;
  const blob = new Blob([buildSRT(transcriptSegments)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${recordingFilename}.srt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
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
log('Recorder page loaded. Ready.');
