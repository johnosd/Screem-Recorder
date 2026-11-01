import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const clipsDir = process.argv[2];
if (!clipsDir) throw new Error('Informe a pasta dos trechos como primeiro argumento.');
const retryErrors = process.argv.includes('--retry-errors');
const samplesArg = process.argv.find(arg => arg.startsWith('--samples='));
const selectedSamples = samplesArg
  ? new Set(samplesArg.slice('--samples='.length).split(',').map(value => value.trim()).filter(Boolean))
  : null;
const providerArg = process.argv.find(arg => arg.startsWith('--providers='));
const selectedProviders = new Set(
  (providerArg?.slice('--providers='.length) ?? 'deepgram,elevenlabs,assemblyai')
    .split(',').map(value => value.trim()).filter(Boolean),
);
const validProviders = new Set(['deepgram', 'soniox', 'elevenlabs', 'assemblyai']);
if (!selectedProviders.size || [...selectedProviders].some(value => !validProviders.has(value))) {
  throw new Error('Use --providers=deepgram,soniox,elevenlabs,assemblyai com pelo menos um provedor válido.');
}

const outputPath = path.join(clipsDir, 'results.json');
const models = [
  ['deepgram-nova-3', 'DEEPGRAM_API_KEY', 0.258],
  ['soniox-stt-async-v5', 'SONIOX_API_KEY', 0.10],
  ['elevenlabs-scribe-v2', 'ELEVENLABS_API_KEY', 0.22],
  ['assemblyai-universal-2', 'ASSEMBLYAI_API_KEY', 0.15],
  ['assemblyai-universal-3-5-pro', 'ASSEMBLYAI_API_KEY', 0.21],
].filter(([label]) => selectedProviders.has(label.split('-')[0]));

for (const [, keyName] of models) {
  if (!process.env[keyName]) throw new Error(`Falta ${keyName} no ambiente do processo.`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const seconds = value => value !== null && value !== undefined && Number.isFinite(Number(value))
  ? Number(value)
  : null;
const errorFromStatus = (provider, response) => new Error(`${provider}: HTTP ${response.status}`);

async function fetchWithTimeout(url, options, timeoutMs = 180_000) {
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...options, signal });
}

async function transcribeDeepgram(media) {
  const response = await fetchWithTimeout(
    'https://api.deepgram.com/v1/listen?model=nova-3&language=pt-BR&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/webm',
      },
      body: media,
    },
  );
  if (!response.ok) throw errorFromStatus('Deepgram', response);
  const body = await response.json();
  const alternative = body?.results?.channels?.[0]?.alternatives?.[0];
  if (!alternative || typeof alternative.transcript !== 'string') {
    throw new Error('Deepgram: resposta sem transcrição.');
  }
  return {
    text: alternative.transcript,
    words: (alternative.words ?? []).map(word => ({
      text: word.punctuated_word ?? word.word,
      start: seconds(word.start),
      end: seconds(word.end),
    })),
  };
}

async function transcribeElevenLabs(media, fileName) {
  const form = new FormData();
  form.append('file', new Blob([media], { type: 'audio/webm' }), fileName);
  form.append('model_id', 'scribe_v2');
  form.append('language_code', 'pt');
  form.append('timestamps_granularity', 'word');
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');
  const response = await fetchWithTimeout(
    'https://api.elevenlabs.io/v1/speech-to-text',
    {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: form,
    },
  );
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const detail = errorBody?.detail;
    const code = typeof detail === 'object' ? detail?.status ?? detail?.code : null;
    const description = typeof detail === 'object' ? detail?.message : null;
    throw new Error(
      `ElevenLabs: HTTP ${response.status}${code ? ` (${code})` : ''}${description ? `: ${String(description).slice(0, 300)}` : ''}`,
    );
  }
  const body = await response.json();
  if (typeof body.text !== 'string') throw new Error('ElevenLabs: resposta sem transcrição.');
  return {
    text: body.text,
    words: (body.words ?? []).filter(word => word.type === 'word').map(word => ({
      text: word.text,
      start: seconds(word.start),
      end: seconds(word.end),
    })),
  };
}

async function sonioxFetch(endpoint, options = {}) {
  const response = await fetchWithTimeout(`https://api.soniox.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.SONIOX_API_KEY}`,
      ...options.headers,
    },
  });
  if (!response.ok) throw errorFromStatus('Soniox', response);
  return response;
}

async function transcribeSoniox(media, fileName) {
  let fileId;
  let transcriptionId;
  try {
    const form = new FormData();
    form.append('file', new Blob([media], { type: 'audio/webm' }), fileName);
    const uploaded = await sonioxFetch('/files', { method: 'POST', body: form });
    fileId = (await uploaded.json()).id;
    if (typeof fileId !== 'string') throw new Error('Soniox: upload sem ID.');

    const created = await sonioxFetch('/transcriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'stt-async-v5', file_id: fileId, language_hints: ['pt'] }),
    });
    transcriptionId = (await created.json()).id;
    if (typeof transcriptionId !== 'string') throw new Error('Soniox: job sem ID.');

    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      await sleep(3000);
      const poll = await sonioxFetch(`/transcriptions/${encodeURIComponent(transcriptionId)}`);
      const status = await poll.json();
      if (status.status === 'error' || status.status === 'failed') {
        throw new Error(`Soniox: job com erro (${status.error_type ?? 'sem código'}).`);
      }
      if (status.status === 'completed') {
        const response = await sonioxFetch(`/transcriptions/${encodeURIComponent(transcriptionId)}/transcript`);
        const body = await response.json();
        if (!Array.isArray(body.tokens)) throw new Error('Soniox: resposta sem tokens.');
        return {
          text: body.tokens.map(token => token.text ?? '').join('').trim(),
          words: body.tokens.filter(token => token.start_ms != null && token.end_ms != null)
            .map(token => ({
              text: token.text,
              start: seconds(token.start_ms) / 1000,
              end: seconds(token.end_ms) / 1000,
            })),
        };
      }
    }
    throw new Error('Soniox: espera superior a cinco minutos.');
  } finally {
    if (transcriptionId) {
      try { await sonioxFetch(`/transcriptions/${encodeURIComponent(transcriptionId)}`, { method: 'DELETE' }); }
      catch { process.stderr.write(`Soniox: confira a limpeza manual do job ${transcriptionId}.\n`); }
    }
    if (fileId) {
      try { await sonioxFetch(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }); }
      catch { process.stderr.write(`Soniox: confira a limpeza manual do arquivo ${fileId}.\n`); }
    }
  }
}

async function uploadAssemblyAI(media) {
  const response = await fetchWithTimeout('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { authorization: process.env.ASSEMBLYAI_API_KEY },
    body: media,
  });
  if (!response.ok) throw errorFromStatus('AssemblyAI upload', response);
  const body = await response.json();
  if (typeof body.upload_url !== 'string') throw new Error('AssemblyAI: upload sem URL.');
  return body.upload_url;
}

async function transcribeAssemblyAI(uploadUrl, model) {
  const headers = {
    authorization: process.env.ASSEMBLYAI_API_KEY,
    'Content-Type': 'application/json',
  };
  const response = await fetchWithTimeout('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      audio_url: uploadUrl,
      speech_models: [model],
      language_code: 'pt',
    }),
  });
  if (!response.ok) throw errorFromStatus('AssemblyAI job', response);
  const job = await response.json();
  if (typeof job.id !== 'string') throw new Error('AssemblyAI: job sem ID.');
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const poll = await fetchWithTimeout(
      `https://api.assemblyai.com/v2/transcript/${encodeURIComponent(job.id)}`,
      { headers: { authorization: process.env.ASSEMBLYAI_API_KEY } },
    );
    if (!poll.ok) throw errorFromStatus('AssemblyAI poll', poll);
    const body = await poll.json();
    if (body.status === 'error') throw new Error('AssemblyAI: job com erro.');
    if (body.status === 'completed') {
      if (typeof body.text !== 'string') throw new Error('AssemblyAI: resposta sem transcrição.');
      return {
        text: body.text,
        words: (body.words ?? []).map(word => ({
          text: word.text,
          start: seconds(word.start) === null ? null : seconds(word.start) / 1000,
          end: seconds(word.end) === null ? null : seconds(word.end) / 1000,
        })),
      };
    }
  }
  throw new Error('AssemblyAI: espera superior a cinco minutos.');
}

async function loadResults() {
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { createdAt: new Date().toISOString(), results: {} };
    throw error;
  }
}

async function saveResults(results) {
  const temporary = `${outputPath}.tmp`;
  await writeFile(temporary, JSON.stringify(results, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, outputPath);
}

const allFiles = (await readdir(clipsDir))
  .filter(name => /^sample0[1-4]\.webm$/i.test(name))
  .sort();
if (allFiles.length !== 4) throw new Error('Esperados sample01.webm a sample04.webm na pasta indicada.');
const files = selectedSamples ? allFiles.filter(name => selectedSamples.has(name)) : allFiles;
if (!files.length || (selectedSamples && files.length !== selectedSamples.size)) {
  throw new Error('A seleção --samples deve conter nomes existentes de sample01.webm a sample04.webm.');
}

const results = await loadResults();
const blockedProviders = new Set();
for (const fileName of files) {
  const filePath = path.join(clipsDir, fileName);
  const size = (await stat(filePath)).size;
  if (size > 25_000_000) throw new Error(`${fileName} excede 25 MB.`);
  const media = await readFile(filePath);
  results.results[fileName] ??= {};
  const sha256 = createHash('sha256').update(media).digest('hex');
  if (results.results[fileName].sha256 !== sha256) {
    results.results[fileName] = { sha256 };
  }
  let assemblyUploadUrl;

  for (const [label, keyName, usdPerHour] of models) {
    if (blockedProviders.has(keyName)) continue;
    const previousStatus = results.results[fileName][label]?.status;
    if (previousStatus === 'ok' || (previousStatus === 'error' && !retryErrors)) continue;
    const started = performance.now();
    try {
      let result;
      if (keyName === 'DEEPGRAM_API_KEY') result = await transcribeDeepgram(media);
      if (keyName === 'SONIOX_API_KEY') result = await transcribeSoniox(media, fileName);
      if (keyName === 'ELEVENLABS_API_KEY') result = await transcribeElevenLabs(media, fileName);
      if (keyName === 'ASSEMBLYAI_API_KEY') {
        assemblyUploadUrl ??= await uploadAssemblyAI(media);
        result = await transcribeAssemblyAI(
          assemblyUploadUrl,
          label.replace('assemblyai-', ''),
        );
      }
      results.results[fileName][label] = {
        status: 'ok',
        elapsedSeconds: Math.round((performance.now() - started) / 100) / 10,
        usdPerHourReference: usdPerHour,
        ...result,
      };
      process.stdout.write(`${fileName} ${label}: concluído\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      results.results[fileName][label] = {
        status: 'error',
        elapsedSeconds: Math.round((performance.now() - started) / 100) / 10,
        message,
      };
      if (/HTTP (401|402|403)|balance_exhausted|budget_exhausted/i.test(message)) {
        blockedProviders.add(keyName);
      }
      process.stdout.write(`${fileName} ${label}: erro (ver results.json)\n`);
    }
    await saveResults(results);
  }
}
process.stdout.write(`Resultados locais: ${outputPath}\n`);
