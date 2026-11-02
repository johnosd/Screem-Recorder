// Estados de erro da transcrição posterior exibidos na interface (qa-evidence, cenário 6).
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { root, apiUrl, saveElevenLabsKey, withExtension } = require('./helpers.cjs');

const fixture = name => path.join(root, 'tests/fixtures', name);

test('sem chave ElevenLabs orienta o usuário e não envia nada', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    let requests = 0;
    await context.route(apiUrl, route => { requests++; return route.abort(); });
    await page.locator('#import-file').setInputFiles(fixture('video-audio.webm'));
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Informe e salve a chave ElevenLabs');
    expect(requests).toBe(0);
    await expect(page.locator('#btn-dl-txt')).toBeDisabled();
  });
});

test('sem conexão com a ElevenLabs mostra erro e permite tentar de novo', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    await context.route(apiUrl, route => route.abort('connectionrefused'));
    await page.locator('#import-file').setInputFiles(fixture('video-audio.webm'));
    await saveElevenLabsKey(page);
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Sem conexão com ElevenLabs');
    await expect(page.locator('#post-start')).toHaveText('Tentar novamente');
    await expect(page.locator('#post-start')).toBeEnabled();
    await expect(page.locator('#btn-dl-txt')).toBeDisabled();
  });
});

for (const [status, message] of [
  [429, 'Limite temporário de ElevenLabs'],
  [503, 'ElevenLabs indisponível'],
  [504, 'demorou demais']
]) {
  test(`HTTP ${status} da ElevenLabs mostra mensagem específica`, async ({}, testInfo) => {
    await withExtension(testInfo, async ({ context, page }) => {
      await context.route(apiUrl, route => route.fulfill({ status, contentType: 'application/json', body: '{}' }));
      await page.locator('#import-file').setInputFiles(fixture('video-audio.webm'));
      await saveElevenLabsKey(page);
      await page.locator('#post-start').click();
      await expect(page.locator('#post-status')).toContainText(message);
    });
  });
}

test('arquivo corrompido falha na preparação local sem chamar o serviço', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    let requests = 0;
    await context.route(apiUrl, route => { requests++; return route.abort(); });
    await page.locator('#import-file').setInputFiles({
      name: 'quebrado.webm', mimeType: 'video/webm', buffer: Buffer.from('isto não é um webm de verdade')
    });
    await saveElevenLabsKey(page);
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Arquivo inválido ou corrompido');
    expect(requests).toBe(0);
  });
});

test('vídeo sem faixa de áudio é recusado sem enviar nada', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    let requests = 0;
    await context.route(apiUrl, route => { requests++; return route.abort(); });
    await page.locator('#import-file').setInputFiles(fixture('video-silent.webm'));
    await saveElevenLabsKey(page);
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('não contém uma faixa de áudio');
    expect(requests).toBe(0);
  });
});

test('extensão e tipo discrepantes ou vazio são recusados ao selecionar', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ page }) => {
    await page.locator('#import-file').setInputFiles({
      name: 'video.mp4', mimeType: 'video/webm', buffer: Buffer.from('x')
    });
    await expect(page.locator('#import-file-name')).toContainText('Arquivo inválido ou tipo incompatível');
    await expect(page.locator('#v-idle')).toHaveClass(/on/);
    await page.locator('#import-file').setInputFiles({
      name: 'vazio.webm', mimeType: 'video/webm', buffer: Buffer.alloc(0)
    });
    await expect(page.locator('#import-file-name')).toContainText('Arquivo inválido ou tipo incompatível');
    await expect(page.locator('#v-idle')).toHaveClass(/on/);
  });
});
