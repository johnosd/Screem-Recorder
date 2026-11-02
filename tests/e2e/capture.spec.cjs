// Fluxos de captura reais no Chromium, com tela/áudio do sistema e microfone falsos.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { apiUrl, saveElevenLabsKey, withExtension, CAPTURE_ARGS } = require('./helpers.cjs');

const record = (testInfo, scenario) => withExtension(testInfo, scenario, { args: CAPTURE_ARGS });

async function inspectWebm(file) {
  const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(new Blob([await fs.readFile(file)])) });
  return {
    duration: await input.getDurationFromMetadata(),
    video: (await input.getVideoTracks()).length,
    audio: (await input.getAudioTracks()).length
  };
}

async function startRecording(page, mode = 'video') {
  if (mode === 'audio') await page.locator('.mbtn[data-m="audio"]').click();
  await page.locator('#btn-start').click();
  await expect(page.locator('#v-rec')).toHaveClass(/on/);
}

async function download(page, selector) {
  const promise = page.waitForEvent('download');
  await page.locator(selector).click();
  return promise;
}

// Guarda o stream de captura para os testes simularem "Parar compartilhamento".
const exposeCapture = context => context.addInitScript(() => {
  const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async constraints => {
    window.__capture = await original(constraints);
    return window.__capture;
  };
});

test('grava vídeo com pausa e entrega WebM com duração, vídeo e áudio', async ({}, testInfo) => {
  await record(testInfo, async ({ page }) => {
    await startRecording(page);
    await page.waitForTimeout(1500);
    await page.locator('#btn-pause').click();
    await expect(page.locator('#st')).toContainText('Pausado');
    await page.waitForTimeout(500);
    await page.locator('#btn-pause').click();
    await expect(page.locator('#st')).toContainText('Gravando');
    await page.waitForTimeout(1500);
    await page.locator('#btn-stop').click();
    await expect(page.locator('#v-done')).toHaveClass(/on/);
    await expect(page.locator('#done-sub')).toHaveText('Arquivo .webm pronto');
    const file = await download(page, '#btn-dl');
    expect(file.suggestedFilename()).toMatch(/^gravacao-video_.*\.webm$/);
    const info = await inspectWebm(await file.path());
    expect(info.duration).toBeGreaterThan(1);
    expect(info.video).toBe(1);
    expect(info.audio).toBe(1);
  });
});

test('modo só áudio encerra ao parar o compartilhamento pelo Chrome', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page }) => {
    await exposeCapture(context);
    await page.reload();
    await startRecording(page, 'audio');
    await page.waitForTimeout(1600);
    await page.evaluate(() => window.__capture.getVideoTracks()[0].dispatchEvent(new Event('ended')));
    await expect(page.locator('#v-done')).toHaveClass(/on/);
    await expect(page.locator('#done-sub')).toHaveText('Arquivo .webm pronto');
    const info = await inspectWebm(await (await download(page, '#btn-dl')).path());
    expect(info.video).toBe(0);
    expect(info.audio).toBe(1);
  });
});

test('fechar a janela gravando pede confirmação e baixar o arquivo libera a saída', async ({}, testInfo) => {
  await record(testInfo, async ({ page }) => {
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.type()); dialog.dismiss(); });
    await startRecording(page);
    await page.waitForTimeout(1600);
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs).toEqual(['beforeunload']);
    expect(page.isClosed()).toBe(false);
    await page.locator('#btn-stop').click();
    await expect(page.locator('#done-sub')).toHaveText('Arquivo .webm pronto');
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => dialogs.length).toBe(2);
    await download(page, '#btn-dl');
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => page.isClosed()).toBe(true);
    expect(dialogs).toHaveLength(2);
  });
});

test('gravação interrompida pela queda da janela é recuperada na reabertura', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page, id }) => {
    await startRecording(page);
    await page.waitForTimeout(3000);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('chrome-extension://' + id + '/recorder.html');
    await expect(reopened.locator('#recovery')).toBeVisible();
    await reopened.locator('#recovery-restore').click();
    await expect(reopened.locator('#done-title')).toHaveText('Gravação recuperada');
    const info = await inspectWebm(await (await download(reopened, '#btn-dl')).path());
    expect(info.duration).toBeGreaterThan(1);
    expect(info.video).toBe(1);
    await reopened.reload();
    await expect(reopened.locator('#recovery')).toBeHidden();
  });
});

test('transcreve a gravação final remuxada enviando só áudio', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page }) => {
    let payload = '';
    await context.route(apiUrl, async route => {
      payload = route.request().postDataBuffer().toString('latin1');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        text: 'Olá mundo', words: [
          { type: 'word', text: 'Olá', start: 0, end: 0.4 },
          { type: 'word', text: 'mundo', start: 0.5, end: 0.9 }
        ] }) });
    });
    await saveElevenLabsKey(page);
    await startRecording(page);
    await page.waitForTimeout(1500);
    await page.locator('#btn-stop').click();
    await expect(page.locator('#done-sub')).toHaveText('Arquivo .webm pronto');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Transcrição concluída');
    await expect(page.locator('#transcript-preview')).toHaveText('Olá mundo');
    expect(payload).toContain('Content-Type: audio/webm');
    expect(payload).not.toContain('Content-Type: video/webm');
  });
});

test('Deepgram: CloseStream entrega o trecho final e a pausa suspende o áudio', async ({}, testInfo) => {
  await record(testInfo, async ({ page }) => {
    const seen = { binary: 0, keepAlive: 0, closeStream: 0 };
    await page.routeWebSocket(/api\.deepgram\.com/, ws => {
      ws.onMessage(message => {
        if (typeof message !== 'string') { seen.binary++; return; }
        const type = JSON.parse(message).type;
        if (type === 'KeepAlive') seen.keepAlive++;
        if (type === 'CloseStream') {
          seen.closeStream++;
          ws.send(JSON.stringify({ is_final: true, start: 0, duration: 1,
            channel: { alternatives: [{ transcript: 'frase final do servidor' }] } }));
          ws.close();
        }
      });
    });
    await page.evaluate(() => chrome.storage.local.set({ deepgramKey: 'e2e-fake-key' }));
    await page.locator('#toggle-transcript').check();
    await startRecording(page);
    await expect.poll(() => seen.binary, { timeout: 8000 }).toBeGreaterThan(3);
    // O MediaRecorder só emite dados após ~1 s; gravar menos que isso resulta em arquivo vazio.
    await page.waitForTimeout(1800);
    await page.locator('#btn-pause').click();
    await page.waitForTimeout(500);
    const paused = seen.binary;
    await page.waitForTimeout(4800);
    expect(seen.binary).toBe(paused);
    expect(seen.keepAlive).toBeGreaterThan(0);
    await page.locator('#btn-pause').click();
    await expect.poll(() => seen.binary, { timeout: 5000 }).toBeGreaterThan(paused);
    await page.waitForTimeout(1200);
    await page.locator('#btn-stop').click();
    await expect(page.locator('#done-sub')).toHaveText('Arquivo .webm pronto');
    await expect(page.locator('#transcript-preview')).toHaveText(/frase final do servidor/);
    expect(seen.closeStream).toBe(1);
  });
});

test('transcreve com o Deepgram a gravação remuxada, enviando só o áudio (feature 002)', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page }) => {
    const requests = [];
    await context.route('https://api.deepgram.com/v1/listen**', async route => {
      requests.push(route.request());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        results: { channels: [{ alternatives: [{ transcript: 'Texto do Deepgram', words: [
          { word: 'texto', punctuated_word: 'Texto', start: 0, end: 0.4 },
          { word: 'do', start: 0.5, end: 0.7 },
          { word: 'deepgram', punctuated_word: 'Deepgram', start: 0.8, end: 1.2 }
        ] }] }] } }) });
    });
    await context.route(apiUrl, route => route.abort());
    await page.evaluate(() => chrome.storage.local.set({ deepgramKey: 'dg-e2e' }));
    await startRecording(page);
    await page.waitForTimeout(1800);
    await page.locator('#btn-stop').click();
    await expect(page.locator('#done-sub')).toHaveText('Arquivo .webm pronto');
    await page.locator('#post-provider').selectOption('deepgram');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Transcrição concluída');
    await expect(page.locator('#transcript-preview')).toHaveText('Texto do Deepgram');
    await expect(page.locator('#transcript-origin')).toHaveText('Transcrito por Deepgram (pt-BR)');
    expect(requests).toHaveLength(1);
    expect(requests[0].headers()['content-type']).toBe('audio/webm');
    expect(requests[0].postDataBuffer().toString('latin1')).not.toContain('video/webm');
  });
});
