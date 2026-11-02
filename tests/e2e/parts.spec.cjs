// Divisão de gravações longas em partes (feature 003), com captura simulada e limite reduzido pela URL.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { withExtension, CAPTURE_ARGS } = require('./helpers.cjs');

const record = (testInfo, scenario) => withExtension(testInfo, scenario, { args: CAPTURE_ARGS });
// A captura falsa gera cerca de 60 a 150 KB por segundo: 150 KB fecha uma parte a cada poucos segundos.
const LIMIT = 150_000;

async function inspectWebm(file) {
  const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(new Blob([await fs.readFile(file)])) });
  return {
    duration: await input.getDurationFromMetadata(),
    video: (await input.getVideoTracks()).length,
    audio: (await input.getAudioTracks()).length
  };
}

async function open(page, id, limit) {
  await page.goto(`chrome-extension://${id}/recorder.html${limit ? `?partLimitBytes=${limit}` : ''}`);
}

async function startRecording(page, mode = 'video') {
  if (mode === 'audio') await page.locator('.mbtn[data-m="audio"]').click();
  await page.locator('#btn-start').click();
  await expect(page.locator('#v-rec')).toHaveClass(/on/);
  return Date.now();
}

async function downloadPart(page, index) {
  const promise = page.waitForEvent('download');
  await page.locator(`.part-item[data-part="${index}"] button[data-act="dl"]`).click();
  const download = await promise;
  return { name: download.suggestedFilename(), path: await download.path() };
}

const exposeCapture = context => context.addInitScript(() => {
  const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async constraints => {
    window.__capture = await original(constraints);
    return window.__capture;
  };
});

test('a gravação se divide ao atingir o limite, sem lacuna perceptível, e cada parte é um arquivo completo', async ({}, testInfo) => {
  await record(testInfo, async ({ page, id }) => {
    await open(page, id, LIMIT);
    const startedAt = await startRecording(page);
    await expect(page.locator('#part-indicator')).toHaveText('Parte 3', { timeout: 40_000 });
    await page.waitForTimeout(1500);
    const stoppedAt = Date.now();
    await page.locator('#btn-stop').click();
    await expect(page.locator('#parts-block')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#btn-dl')).toBeHidden();
    await expect(page.locator('#done-sub')).toContainText('partes prontas');

    const count = await page.locator('.part-item').count();
    expect(count).toBeGreaterThanOrEqual(3);
    const durations = [];
    for (let index = 1; index <= count; index++) {
      const file = await downloadPart(page, index);
      expect(file.name).toMatch(new RegExp(`^gravacao-video_.*_parte-0${index}\\.webm$`));
      const info = await inspectWebm(file.path);
      expect(info.duration).toBeGreaterThan(0.3);
      expect(info.video).toBe(1);
      expect(info.audio).toBe(1);
      durations.push(info.duration);
    }
    const total = durations.reduce((sum, value) => sum + value, 0);
    const wall = (stoppedAt - startedAt) / 1000;
    // Até 1 s por troca (spec FR-002) mais ~1 s de latência de início; nunca mais tempo do que o gravado.
    expect(total).toBeGreaterThan(wall - (count - 1) - 1.5);
    expect(total).toBeLessThan(wall + 2.5);
    await expect(page.locator('.part-item').first()).toContainText('baixada');
  });
});

test('o cronômetro segue corrido e o indicador de parte só aparece com divisão', async ({}, testInfo) => {
  await record(testInfo, async ({ page, id }) => {
    await open(page, id, LIMIT);
    await startRecording(page);
    await expect(page.locator('#part-indicator')).toBeHidden();
    await expect(page.locator('#part-indicator')).toHaveText('Parte 2', { timeout: 40_000 });
    const text = await page.locator('#timer').textContent();
    const [minutes, seconds] = text.split(':').map(Number);
    expect(minutes * 60 + seconds).toBeGreaterThanOrEqual(1);   // não reiniciou na troca
    await page.waitForTimeout(1200);
    const later = (await page.locator('#timer').textContent()).split(':').map(Number);
    expect(later[0] * 60 + later[1]).toBeGreaterThanOrEqual(minutes * 60 + seconds);
    await page.locator('#btn-stop').click();
    await expect(page.locator('#parts-block')).toBeVisible({ timeout: 30_000 });
  });
});

test('pausa atravessando uma divisão não perde nem duplica tempo gravado', async ({}, testInfo) => {
  await record(testInfo, async ({ page, id }) => {
    await open(page, id, LIMIT);
    const startedAt = await startRecording(page);
    await page.waitForTimeout(1800);
    await page.locator('#btn-pause').click();
    await expect(page.locator('#st')).toContainText('Pausado');
    const pausedAt = Date.now();
    await page.waitForTimeout(2000);
    await page.locator('#btn-pause').click();
    const pausedMs = Date.now() - pausedAt;
    await expect(page.locator('#part-indicator')).toHaveText('Parte 2', { timeout: 40_000 });
    await page.waitForTimeout(1500);
    const stoppedAt = Date.now();
    await page.locator('#btn-stop').click();
    await expect(page.locator('#parts-block')).toBeVisible({ timeout: 30_000 });
    const count = await page.locator('.part-item').count();
    let total = 0;
    for (let index = 1; index <= count; index++) {
      total += (await inspectWebm((await downloadPart(page, index)).path)).duration;
    }
    const recorded = (stoppedAt - startedAt - pausedMs) / 1000;
    expect(total).toBeGreaterThan(recorded - count - 1.5);
    expect(total).toBeLessThan(recorded + 2.5);
  });
});

test('"Parar compartilhamento" logo após uma divisão preserva todas as partes', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page, id }) => {
    await exposeCapture(context);
    await open(page, id, LIMIT);
    await startRecording(page);
    await expect(page.locator('#part-indicator')).toHaveText('Parte 2', { timeout: 40_000 });
    await page.evaluate(() => window.__capture.getVideoTracks()[0].dispatchEvent(new Event('ended')));
    await expect(page.locator('#parts-block')).toBeVisible({ timeout: 30_000 });
    expect(await page.locator('.part-item').count()).toBeGreaterThanOrEqual(1);
    const first = await downloadPart(page, 1);
    expect((await inspectWebm(first.path)).duration).toBeGreaterThan(0.3);
  });
});

test('parar logo depois de uma divisão não gera parte vazia nem falha', async ({}, testInfo) => {
  await record(testInfo, async ({ page, id }) => {
    await open(page, id, LIMIT);
    await startRecording(page);
    await expect(page.locator('#part-indicator')).toHaveText('Parte 2', { timeout: 40_000 });
    await page.locator('#btn-stop').click();
    await expect(page.locator('#done-sub')).not.toHaveText('Finalizando gravação...', { timeout: 30_000 });
    await expect(page.locator('#done-sub')).not.toContainText('vazia');
    const items = page.locator('.part-item');
    if (await page.locator('#parts-block').isVisible()) {
      const count = await items.count();
      for (let index = 1; index <= count; index++) {
        await expect(items.nth(index - 1)).toHaveAttribute('data-part', String(index));
        // A última parte pode ser muito curta, mas tem de ser um arquivo que abre (nunca vazia).
        const info = await inspectWebm((await downloadPart(page, index)).path);
        expect(Number.isFinite(info.duration)).toBe(true);
        expect(info.audio).toBe(1);
      }
    } else {
      await expect(page.locator('#btn-dl')).toBeEnabled();
    }
  });
});

test('uma gravação curta mantém a tela e o nome de hoje, sem lista de partes', async ({}, testInfo) => {
  await record(testInfo, async ({ page, id }) => {
    await open(page, id);
    await startRecording(page);
    await page.waitForTimeout(1800);
    await expect(page.locator('#part-indicator')).toBeHidden();
    await page.locator('#btn-stop').click();
    await expect(page.locator('#done-sub')).toHaveText('Arquivo .webm pronto', { timeout: 30_000 });
    await expect(page.locator('#parts-block')).toBeHidden();
    await expect(page.locator('#btn-dl')).toBeVisible();
    await expect(page.locator('#post-panel')).toBeVisible();
    const promise = page.waitForEvent('download');
    await page.locator('#btn-dl').click();
    const name = (await promise).suggestedFilename();
    expect(name).toMatch(/^gravacao-video_[\dT-]+\.webm$/);
    expect(name).not.toContain('parte');
  });
});

test('limite de teste inválido na URL volta ao padrão e não divide', async ({}, testInfo) => {
  await record(testInfo, async ({ page, id }) => {
    await open(page, id, 10);   // abaixo do mínimo: ignorado
    await startRecording(page);
    await page.waitForTimeout(4500);
    await expect(page.locator('#part-indicator')).toBeHidden();
    await page.locator('#btn-stop').click();
    await expect(page.locator('#done-sub')).toHaveText('Arquivo .webm pronto', { timeout: 30_000 });
    await expect(page.locator('#parts-block')).toBeHidden();
  });
});
