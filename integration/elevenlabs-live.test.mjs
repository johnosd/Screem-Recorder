import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { transcribePreRecorded } from '../src/post-transcription-client.js';
import { buildSrt, validSegments } from '../src/subtitles.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function readKey() {
  const env = await readFile(join(root, '.env'), 'utf8');
  const line = env.split(/\r?\n/).reverse().find(value => /^\s*ELEVENLABS_API_KEY\s*=/.test(value));
  const raw = line?.slice(line.indexOf('=') + 1).trim();
  const key = raw?.replace(/^(["'])(.*)\1$/, '$2').trim();
  assert.ok(key, 'ELEVENLABS_API_KEY ausente no .env');
  return key;
}

test(process.argv.includes('--auth-only') ? 'ElevenLabs real: valida autenticação sem áudio'
  : 'ElevenLabs real: transcreve áudio e gera SRT de tempos por palavra',
  { timeout: 120_000 }, async () => {
    const key = await readKey();
    const auth = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(10_000)
    });
    const authBody = await auth.json().catch(() => null);
    const authDetail = !auth.ok ? authBody?.detail : null;
    const authCode = typeof authDetail?.status === 'string' &&
      /^[a-z0-9_.-]{1,80}$/i.test(authDetail.status) ? authDetail.status : null;
    const tier = typeof authBody?.subscription?.tier === 'string' ? authBody.subscription.tier : null;
    process.stdout.write(`${JSON.stringify({ authStatus: auth.status, authCode, tier })}\n`);
    if (authCode === 'detected_unusual_activity') {
      throw new Error('A ElevenLabs bloqueou a autenticação por atividade incomum; áudio não enviado.');
    }
    if (process.argv.includes('--auth-only')) return;
    const audioPath = process.env.ELEVENLABS_TEST_AUDIO ||
      join(tmpdir(), 'screen-recorder-stt-eval-20261031', 'sample01.webm');
    const bytes = await readFile(audioPath);
    const extension = extname(audioPath).toLowerCase();
    assert.equal(extension, '.webm', 'O teste usa uma amostra WebM com fala.');
    const media = new File([bytes], 'amostra.webm', { type: 'video/webm' });
    let httpStatus = null;
    let providerCode = null;
    let responseField = null;
    const fetchImpl = async (url, options) => {
      const response = await fetch(url, options);
      httpStatus = response.status;
      if (!response.ok) {
        const detail = (await response.clone().json().catch(() => null))?.detail;
        const code = typeof detail?.status === 'string' ? detail.status : detail?.code;
        if (typeof code === 'string' && /^[a-z0-9_.-]{1,80}$/i.test(code)) providerCode = code;
        const fields = Array.isArray(detail) ? detail.flatMap(item => item?.loc || []) : [];
        responseField = fields.find(item => typeof item === 'string' &&
          ['file', 'model_id', 'language_code', 'timestamps_granularity',
            'additional_formats'].includes(item)) || null;
      }
      return response;
    };
    let result;
    try {
      result = await transcribePreRecorded({ media, language: 'pt-BR', key,
        signal: AbortSignal.timeout(90_000), fetchImpl });
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ httpStatus, providerCode, responseField,
        appCode: error?.code || 'UNKNOWN' })}\n`);
      throw new Error('Transcrição real falhou; veja o diagnóstico sem segredos acima.');
    }
    const hasSrt = validSegments(result.segments);
    const srt = hasSrt ? buildSrt(result.segments) : null;
    process.stdout.write(`${JSON.stringify({ httpStatus, mediaBytes: bytes.length,
      textLength: result.text.length, timingInfo: result.timingInfo,
      srtCues: hasSrt ? result.segments.length : 0, srtBytes: srt?.length || 0 })}\n`);
    assert.ok(result.text.trim(), 'A resposta não trouxe texto.');
    assert.ok(hasSrt, 'A resposta não trouxe tempos válidos para SRT.');
    assert.ok(srt?.includes(' --> '), 'O arquivo SRT não contém intervalos.');
  });
