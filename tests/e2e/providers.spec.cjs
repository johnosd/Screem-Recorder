// Escolha do provedor da transcrição posterior (feature 002), com rede simulada.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { root, apiUrl, withExtension } = require('./helpers.cjs');

const DEEPGRAM = 'https://api.deepgram.com/v1/listen';
const media = path.join(root, 'tests/fixtures/video-audio.webm');

const deepgramBody = { results: { channels: [{ alternatives: [{
  transcript: 'Olá do Deepgram',
  words: [
    { word: 'olá', punctuated_word: 'Olá', start: 0, end: 0.4 },
    { word: 'do', punctuated_word: 'do', start: 0.5, end: 0.7 },
    { word: 'deepgram', punctuated_word: 'Deepgram', start: 0.8, end: 1.2 }
  ]
}] }] } };

const elevenBody = { text: 'Olá da ElevenLabs', words: [
  { type: 'word', text: 'Olá', start: 0, end: 0.4 },
  { type: 'word', text: 'da', start: 0.5, end: 0.7 },
  { type: 'word', text: 'ElevenLabs', start: 0.8, end: 1.2 }
] };

const saveKeys = (page, keys) => page.evaluate(stored => chrome.storage.local.set(stored), keys);

// Bloqueia tudo que não é da extensão, registra as requisições e responde os dois serviços.
async function mockServices(context, { deepgram, eleven } = {}) {
  const seen = { deepgram: [], eleven: [], other: [] };
  await context.route('**/*', route => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith('chrome-extension://')) return route.continue();
    if (url.startsWith(DEEPGRAM)) {
      seen.deepgram.push(request);
      return deepgram ? deepgram(route) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deepgramBody) });
    }
    if (url === apiUrl) {
      seen.eleven.push(request);
      return eleven ? eleven(route) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(elevenBody) });
    }
    seen.other.push(url);
    return route.abort();
  });
  return seen;
}

async function importMedia(page) {
  await page.locator('#import-file').setInputFiles(media);
  await expect(page.locator('#post-status')).toContainText('Arquivo pronto');
}

test('Deepgram escolhido: envia só o áudio com a chave dele e entrega texto, TXT e SRT', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    const seen = await mockServices(context);
    await saveKeys(page, { deepgramKey: 'dg-e2e', elevenLabsKey: 'el-e2e' });
    await importMedia(page);
    await page.locator('#post-provider').selectOption('deepgram');
    await page.locator('#post-lang').selectOption('pt-BR');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Transcrição concluída');
    await expect(page.locator('#transcript-preview')).toHaveText('Olá do Deepgram');

    expect(seen.eleven).toHaveLength(0);
    expect(seen.deepgram).toHaveLength(1);
    const request = seen.deepgram[0];
    expect(request.method()).toBe('POST');
    expect(request.headers().authorization).toBe('Token dg-e2e');
    expect(request.headers()['content-type']).toBe('audio/webm');
    const query = new URL(request.url()).searchParams;
    expect(query.get('model')).toBe('nova-3');
    expect(query.get('language')).toBe('pt-BR');
    const sent = request.postDataBuffer();
    expect(sent.length).toBeLessThan((await fs.stat(media)).size);
    expect(sent.toString('latin1')).not.toContain('video/webm');

    const txt = page.waitForEvent('download');
    await page.locator('#btn-dl-txt').click();
    expect(await fs.readFile(await (await txt).path(), 'utf8')).toBe('Olá do Deepgram');
    const srt = page.waitForEvent('download');
    await page.locator('#btn-dl-srt').click();
    const srtText = await fs.readFile(await (await srt).path(), 'utf8');
    expect(srtText).toContain('Olá');
    expect(srtText).toContain('Deepgram');
    expect(seen.other).toEqual([]);
  });
});

test('ElevenLabs escolhido: comportamento atual e nenhuma requisição ao Deepgram', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    const seen = await mockServices(context);
    await saveKeys(page, { deepgramKey: 'dg-e2e', elevenLabsKey: 'el-e2e' });
    await importMedia(page);
    await page.locator('#post-provider').selectOption('elevenlabs');
    await page.locator('#post-start').click();
    await expect(page.locator('#transcript-preview')).toHaveText('Olá da ElevenLabs');
    expect(seen.deepgram).toHaveLength(0);
    expect(seen.eleven).toHaveLength(1);
    expect(seen.eleven[0].headers()['xi-api-key']).toBe('el-e2e');
    expect(seen.other).toEqual([]);
  });
});

test('o aviso de envio e a dica de chave mudam com o serviço escolhido', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ page }) => {
    await importMedia(page);
    await expect(page.locator('#post-provider')).toHaveValue('elevenlabs');
    await expect(page.locator('#post-notice')).toContainText('somente o áudio será enviado a ElevenLabs');
    await expect(page.locator('#post-key-hint')).toContainText('chave ElevenLabs');
    await page.locator('#post-provider').selectOption('deepgram');
    await expect(page.locator('#post-notice')).toContainText('somente o áudio será enviado a Deepgram');
    await expect(page.locator('#post-notice')).not.toContainText('ElevenLabs');
    await expect(page.locator('#post-key-hint')).toContainText('chave Deepgram');
  });
});

test('sem a chave do provedor escolhido só orienta para as Configurações e não envia nada', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    const seen = await mockServices(context);
    await saveKeys(page, { elevenLabsKey: 'el-e2e' });
    await importMedia(page);
    await page.locator('#post-provider').selectOption('deepgram');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Informe e salve a chave Deepgram em ⚙ Configurações');
    await expect(page.locator('#post-status')).not.toContainText('ElevenLabs');
    expect(seen.deepgram).toHaveLength(0);
    expect(seen.eleven).toHaveLength(0);

    await page.evaluate(() => chrome.storage.local.remove('elevenLabsKey'));
    await saveKeys(page, { deepgramKey: 'dg-e2e' });
    await page.locator('#post-provider').selectOption('elevenlabs');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Informe e salve a chave ElevenLabs em ⚙ Configurações');
    expect(seen.deepgram).toHaveLength(0);
    expect(seen.eleven).toHaveLength(0);
  });
});

test('o seletor fica desabilitado durante o processamento e volta ao concluir', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await mockServices(context, { deepgram: async route => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deepgramBody) });
    } });
    await saveKeys(page, { deepgramKey: 'dg-e2e' });
    await importMedia(page);
    await page.locator('#post-provider').selectOption('deepgram');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('aguardando resposta de Deepgram');
    await expect(page.locator('#post-provider')).toBeDisabled();
    release();
    await expect(page.locator('#post-status')).toContainText('Transcrição concluída');
    await expect(page.locator('#post-provider')).toBeEnabled();
  });
});

for (const [status, message] of [
  [401, 'Chave Deepgram recusada'],
  [402, 'Créditos insuficientes na conta Deepgram'],
  [413, 'excede o limite de 2 GB de Deepgram'],
  [429, 'Limite temporário de Deepgram'],
  [503, 'Deepgram indisponível']
]) {
  test(`erro HTTP ${status} do Deepgram cita o serviço correto e não sugere o outro`, async ({}, testInfo) => {
    await withExtension(testInfo, async ({ context, page }) => {
      const seen = await mockServices(context, { deepgram: route =>
        route.fulfill({ status, contentType: 'application/json', body: '{}' }) });
      await saveKeys(page, { deepgramKey: 'dg-e2e', elevenLabsKey: 'el-e2e' });
      await importMedia(page);
      await page.locator('#post-provider').selectOption('deepgram');
      await page.locator('#post-start').click();
      await expect(page.locator('#post-status')).toContainText(message);
      await expect(page.locator('#post-status')).not.toContainText('ElevenLabs');
      await expect(page.locator('#post-start')).toHaveText('Tentar novamente');
      expect(seen.eleven).toHaveLength(0);
    });
  });
}

test('retranscrever com outro provedor preserva o texto até concluir e mostra quem o gerou', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await mockServices(context, { deepgram: async route => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deepgramBody) });
    } });
    await saveKeys(page, { deepgramKey: 'dg-e2e', elevenLabsKey: 'el-e2e' });
    await importMedia(page);
    await page.locator('#post-provider').selectOption('elevenlabs');
    await page.locator('#post-start').click();
    await expect(page.locator('#transcript-preview')).toHaveText('Olá da ElevenLabs');
    await expect(page.locator('#transcript-origin')).toHaveText('Transcrito por ElevenLabs (pt-BR)');

    await page.locator('#post-provider').selectOption('deepgram');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-provider')).toBeDisabled();
    await expect(page.locator('#transcript-preview')).toHaveText('Olá da ElevenLabs');
    await expect(page.locator('#transcript-origin')).toHaveText('Transcrito por ElevenLabs (pt-BR)');
    release();
    await expect(page.locator('#transcript-preview')).toHaveText('Olá do Deepgram');
    await expect(page.locator('#transcript-origin')).toHaveText('Transcrito por Deepgram (pt-BR)');
  });
});

test('cancelar ou falhar na retranscrição mantém o texto e o provedor anteriores', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    let fail = false;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await mockServices(context, { deepgram: async route => {
      if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      await gate;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deepgramBody) });
    } });
    await saveKeys(page, { deepgramKey: 'dg-e2e', elevenLabsKey: 'el-e2e' });
    await importMedia(page);
    await page.locator('#post-start').click();
    await expect(page.locator('#transcript-origin')).toHaveText('Transcrito por ElevenLabs (pt-BR)');

    await page.locator('#post-provider').selectOption('deepgram');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-cancel')).toBeVisible();
    await page.locator('#post-cancel').click();
    release();
    await expect(page.locator('#post-status')).toContainText('cancelada');
    await expect(page.locator('#transcript-preview')).toHaveText('Olá da ElevenLabs');
    await expect(page.locator('#transcript-origin')).toHaveText('Transcrito por ElevenLabs (pt-BR)');
    await expect(page.locator('#btn-dl-txt')).toBeEnabled();

    fail = true;
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Deepgram indisponível');
    await expect(page.locator('#post-status')).not.toContainText('ElevenLabs');
    await expect(page.locator('#transcript-preview')).toHaveText('Olá da ElevenLabs');
    await expect(page.locator('#transcript-origin')).toHaveText('Transcrito por ElevenLabs (pt-BR)');
  });
});

test('a última escolha de provedor é lembrada e valor inválido cai na ElevenLabs', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ page }) => {
    await importMedia(page);
    await expect(page.locator('#post-provider')).toHaveValue('elevenlabs');
    await page.locator('#post-provider').selectOption('deepgram');
    await page.reload();
    await importMedia(page);
    await expect(page.locator('#post-provider')).toHaveValue('deepgram');
    await expect(page.locator('#post-notice')).toContainText('enviado a Deepgram');

    await page.evaluate(() => chrome.storage.local.set({ postProvider: 'inexistente' }));
    await page.reload();
    await importMedia(page);
    await expect(page.locator('#post-provider')).toHaveValue('elevenlabs');
    await expect(page.locator('#post-notice')).toContainText('enviado a ElevenLabs');
  });
});
