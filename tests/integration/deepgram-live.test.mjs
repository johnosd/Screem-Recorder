// Teste REAL do Deepgram para arquivo gravado (feature 002). Fora do npm test e do Playwright.
// Lê DEEPGRAM_API_KEY do .env; a saída traz só status HTTP, códigos e contagens, nunca chave nem texto.
// Pode consumir créditos. `--auth-only` valida só a autenticação, sem enviar áudio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { transcribePreRecorded } from '../../src/post-transcription-client.js';
import { buildSrt, validSegments } from '../../src/subtitles.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const authOnly = process.argv.includes('--auth-only');

async function readKey() {
  const env = await readFile(join(root, '.env'), 'utf8');
  const line = env.split(/\r?\n/).reverse().find(value => /^\s*DEEPGRAM_API_KEY\s*=/.test(value));
  const raw = line?.slice(line.indexOf('=') + 1).trim();
  const key = raw?.replace(/^(["'])(.*)\1$/, '$2').trim();
  assert.ok(key, 'DEEPGRAM_API_KEY ausente no .env');
  return key;
}

function report(data) { process.stdout.write(`${JSON.stringify(data)}\n`); }

// Encapsula o fetch para registrar só o status HTTP e o código de erro do serviço.
function spy() {
  const seen = { httpStatus: null, requestId: null };
  const fetchImpl = async (url, options) => {
    const response = await fetch(url, options);
    seen.httpStatus = response.status;
    return response;
  };
  return { seen, fetchImpl };
}

async function media(path, type) {
  const bytes = await readFile(path);
  return { bytes, file: new File([bytes], basename(path), { type }) };
}

test('Deepgram real: valida autenticação sem áudio', { timeout: 30_000 }, async () => {
  const key = await readKey();
  const response = await fetch('https://api.deepgram.com/v1/projects', {
    headers: { Authorization: `Token ${key}` }, signal: AbortSignal.timeout(15_000) });
  report({ authStatus: response.status });
  assert.equal(response.status, 200, 'O Deepgram não aceitou a chave do .env.');
});

if (!authOnly) {
  test('Deepgram real: transcreve fala em PT-BR e gera SRT', { timeout: 180_000 }, async () => {
    const key = await readKey();
    const audioPath = process.env.DEEPGRAM_TEST_AUDIO ||
      join(tmpdir(), 'screen-recorder-stt-eval-20261031', 'sample01.webm');
    const { bytes, file } = await media(audioPath, 'video/webm');
    const { seen, fetchImpl } = spy();
    let result;
    try {
      result = await transcribePreRecorded({ media: file, language: 'pt-BR', key,
        provider: 'deepgram', signal: AbortSignal.timeout(120_000), fetchImpl });
    } catch (error) {
      report({ httpStatus: seen.httpStatus, appCode: error?.code || 'UNKNOWN' });
      throw new Error('Transcrição real falhou; veja o diagnóstico sem segredos acima.');
    }
    const hasSrt = validSegments(result.segments);
    const srt = hasSrt ? buildSrt(result.segments) : null;
    report({ httpStatus: seen.httpStatus, mediaBytes: bytes.length, textLength: result.text.length,
      timingInfo: result.timingInfo, srtCues: hasSrt ? result.segments.length : 0, srtBytes: srt?.length || 0 });
    assert.ok(result.text.trim(), 'A resposta não trouxe texto.');
    assert.ok(hasSrt, 'A resposta não trouxe tempos válidos para SRT.');
    assert.ok(srt?.includes(' --> '), 'O SRT não contém intervalos.');
  });

  // Os quatro formatos aceitos pelo app: o serviço precisa aceitar o áudio preparado (HTTP 200).
  // As fixtures são sintéticas; o texto pode vir vazio, o que importa é o formato ter sido aceito.
  for (const [name, type, language] of [
    ['video-audio.webm', 'video/webm', 'pt-BR'],
    ['video-audio.mp4', 'video/mp4', 'pt-BR'],
    ['audio-only.webm', 'audio/webm', 'en'],
    ['audio-only.mp3', 'audio/mpeg', 'en']
  ]) {
    test(`Deepgram real: aceita o formato ${name} (${language})`, { timeout: 120_000 }, async () => {
      const key = await readKey();
      const { file } = await media(join(root, 'tests', 'fixtures', name), type);
      const { seen, fetchImpl } = spy();
      let outcome;
      try {
        const result = await transcribePreRecorded({ media: file, language, key, provider: 'deepgram',
          signal: AbortSignal.timeout(90_000), fetchImpl });
        outcome = { ok: true, textLength: result.text.length, words: result.timingInfo.words };
      } catch (error) {
        outcome = { ok: false, appCode: error?.code || 'UNKNOWN' };
      }
      report({ file: name, language, httpStatus: seen.httpStatus, ...outcome });
      assert.equal(seen.httpStatus, 200, `O Deepgram recusou ${name}.`);
      assert.equal(outcome.ok, true);
    });
  }

  // Fala audível em cada formato aceito pelo app e nos dois idiomas. As amostras saem de
  // tests/integration/generate-speech-samples.ps1 (fora do repositório); sem elas, os casos são pulados.
  const speechDir = process.env.DEEPGRAM_SPEECH_DIR ||
    join(tmpdir(), 'screen-recorder-stt-eval-20261031', 'formats');
  const types = { webm: 'audio/webm', mp3: 'audio/mpeg', mp4: 'video/mp4' };
  for (const [prefix, language] of [['fala-pt', 'pt-BR'], ['fala-en', 'en']]) {
    for (const extension of ['webm', 'mp3', 'mp4']) {
      const path = join(speechDir, `${prefix}.${extension}`);
      test(`Deepgram real: fala ${language} em ${extension.toUpperCase()} gera texto, tempos e SRT`,
        { timeout: 180_000, skip: existsSync(path) ? false : `amostra ausente: ${basename(path)}` }, async () => {
          const key = await readKey();
          const { file } = await media(path, types[extension]);
          const { seen, fetchImpl } = spy();
          let result;
          try {
            result = await transcribePreRecorded({ media: file, language, key, provider: 'deepgram',
              signal: AbortSignal.timeout(150_000), fetchImpl });
          } catch (error) {
            report({ file: basename(path), httpStatus: seen.httpStatus, appCode: error?.code || 'UNKNOWN' });
            throw new Error('Transcrição real falhou; veja o diagnóstico sem segredos acima.');
          }
          const hasSrt = validSegments(result.segments);
          report({ file: basename(path), language, httpStatus: seen.httpStatus, textLength: result.text.length,
            timingInfo: result.timingInfo, srtCues: hasSrt ? result.segments.length : 0 });
          assert.ok(result.text.trim(), 'A resposta não trouxe texto.');
          assert.ok(hasSrt, 'A resposta não trouxe tempos válidos para SRT.');
          assert.equal(result.timingInfo.invalid, 0);
          // Conteúdo conhecido da amostra sintetizada em inglês (verificado sem imprimir o texto).
          if (language === 'en') assert.match(result.text, /fox/i);
        });
    }
  }

  // Arquivo longo (vários MB): mede o tempo de resposta e confirma que o limite de tamanho real não barra.
  const longPath = join(speechDir, 'fala-pt-longa.mp3');
  test('Deepgram real: arquivo longo de vários MB é aceito e transcrito', {
    timeout: 600_000, skip: existsSync(longPath) ? false : 'amostra ausente: fala-pt-longa.mp3' }, async () => {
    const key = await readKey();
    const { bytes, file } = await media(longPath, 'audio/mpeg');
    const { seen, fetchImpl } = spy();
    const started = Date.now();
    let result;
    try {
      result = await transcribePreRecorded({ media: file, language: 'pt-BR', key, provider: 'deepgram',
        signal: AbortSignal.timeout(540_000), fetchImpl });
    } catch (error) {
      report({ file: 'fala-pt-longa.mp3', mediaBytes: bytes.length, httpStatus: seen.httpStatus,
        appCode: error?.code || 'UNKNOWN', elapsedMs: Date.now() - started });
      throw new Error('Transcrição real do arquivo longo falhou; veja o diagnóstico sem segredos acima.');
    }
    report({ file: 'fala-pt-longa.mp3', mediaBytes: bytes.length, httpStatus: seen.httpStatus,
      elapsedMs: Date.now() - started, textLength: result.text.length, timingInfo: result.timingInfo });
    assert.equal(seen.httpStatus, 200);
    assert.ok(result.text.trim());
    assert.equal(result.timingInfo.invalid, 0);
  });

  // A mesma chave do arquivo gravado abre o WebSocket ao vivo (só o handshake; nenhum áudio é enviado).
  test('Deepgram real: a mesma chave abre o WebSocket da transcrição ao vivo', { timeout: 30_000 }, async () => {
    const key = await readKey();
    const outcome = await new Promise(resolve => {
      const socket = new WebSocket('wss://api.deepgram.com/v1/listen?language=pt-BR&model=nova-3' +
        '&encoding=linear16&sample_rate=16000', ['token', key]);
      const timer = setTimeout(() => { socket.close(); resolve('timeout'); }, 20_000);
      socket.onopen = () => { clearTimeout(timer); socket.close(); resolve('open'); };
      socket.onerror = () => { clearTimeout(timer); resolve('error'); };
    });
    report({ liveWebSocket: outcome });
    assert.equal(outcome, 'open');
  });
}
