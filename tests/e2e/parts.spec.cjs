// Divisão de gravações longas em partes (feature 003), com captura simulada e limite reduzido pela URL.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { withExtension, CAPTURE_ARGS, apiUrl } = require('./helpers.cjs');

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

// ---------- US2: baixar todas e transcrição por parte ----------
const DEEPGRAM = 'https://api.deepgram.com/v1/listen';
const deepgramBody = { results: { channels: [{ alternatives: [{
  transcript: 'Texto do Deepgram',
  words: [{ word: 'texto', punctuated_word: 'Texto', start: 0, end: 0.4 },
    { word: 'do', start: 0.5, end: 0.7 }, { word: 'deepgram', punctuated_word: 'Deepgram', start: 0.8, end: 1.2 }]
}] }] } };
const elevenBody = { text: 'Texto da ElevenLabs', words: [
  { type: 'word', text: 'Texto', start: 0, end: 0.4 }, { type: 'word', text: 'da', start: 0.5, end: 0.7 },
  { type: 'word', text: 'ElevenLabs', start: 0.8, end: 1.2 }] };

async function mockServices(context, { deepgram } = {}) {
  const seen = { deepgram: 0, eleven: 0 };
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) return route.continue();
    if (url.startsWith(DEEPGRAM)) {
      seen.deepgram++;
      return deepgram ? deepgram(route) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deepgramBody) });
    }
    if (url === apiUrl) {
      seen.eleven++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(elevenBody) });
    }
    return route.abort();
  });
  return seen;
}

async function recordThreeParts(page, id) {
  await open(page, id, LIMIT);
  await startRecording(page);
  await expect(page.locator('#part-indicator')).toHaveText('Parte 3', { timeout: 40_000 });
  await page.waitForTimeout(1200);
  await page.locator('#btn-stop').click();
  await expect(page.locator('#parts-block')).toBeVisible({ timeout: 30_000 });
  expect(await page.locator('.part-item').count()).toBeGreaterThanOrEqual(3);
}

test('cada parte guarda a própria transcrição, com provedores diferentes, e só uma roda por vez', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page, id }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await mockServices(context, { deepgram: async route => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deepgramBody) });
    } });
    await page.evaluate(() => chrome.storage.local.set({ deepgramKey: 'dg-e2e', elevenLabsKey: 'el-e2e' }));
    await recordThreeParts(page, id);
    await expect(page.locator('#post-part-title')).toContainText('Parte 1 de');

    // Parte 1 com ElevenLabs.
    await page.locator('#post-provider').selectOption('elevenlabs');
    await page.locator('#post-start').click();
    await expect(page.locator('#transcript-preview')).toHaveText('Texto da ElevenLabs');
    await expect(page.locator('.part-item[data-part="1"]')).toContainText('transcrito por ElevenLabs');

    // Parte 2 com Deepgram, travada no servidor simulado.
    await page.locator('.part-item[data-part="2"] button[data-act="tx"]').click();
    await expect(page.locator('#post-part-title')).toContainText('Parte 2 de');
    await expect(page.locator('#transcript-preview')).toBeHidden();   // o texto da parte 1 não vaza
    await page.locator('#post-provider').selectOption('deepgram');
    await page.locator('#post-start').click();
    await expect(page.locator('.part-item[data-part="2"]')).toContainText('transcrevendo');

    // Enquanto isso, a parte 3 não inicia outra transcrição, mas pode ser baixada.
    await page.locator('.part-item[data-part="3"] button[data-act="tx"]').click();
    await expect(page.locator('#post-start')).toBeDisabled();
    await expect(page.locator('#post-status')).toContainText('outra transcrição em andamento');
    const file = await downloadPart(page, 3);
    expect((await inspectWebm(file.path)).duration).toBeGreaterThan(0);

    release();
    await expect(page.locator('.part-item[data-part="2"]')).toContainText('transcrito por Deepgram');
    await expect(page.locator('#post-start')).toBeEnabled();

    // Cada parte conserva o seu resultado.
    await page.locator('.part-item[data-part="2"] button[data-act="tx"]').click();
    await expect(page.locator('#transcript-preview')).toHaveText('Texto do Deepgram');
    await expect(page.locator('#transcript-origin')).toHaveText('Transcrito por Deepgram (pt-BR)');
    await page.locator('.part-item[data-part="1"] button[data-act="tx"]').click();
    await expect(page.locator('#transcript-preview')).toHaveText('Texto da ElevenLabs');

    // O SRT e o TXT levam o nome da parte selecionada.
    const srtPromise = page.waitForEvent('download');
    await page.locator('#btn-dl-srt').click();
    expect((await srtPromise).suggestedFilename()).toMatch(/_parte-01\.srt$/);
    const txtPromise = page.waitForEvent('download');
    await page.locator('#btn-dl-txt').click();
    expect((await txtPromise).suggestedFilename()).toMatch(/_parte-01\.txt$/);
  });
});

test('Baixar todas baixa as partes na ordem, sem recodificar', async ({}, testInfo) => {
  await record(testInfo, async ({ page, id }) => {
    await recordThreeParts(page, id);
    const count = await page.locator('.part-item').count();
    const names = [];
    page.on('download', download => names.push(download.suggestedFilename()));
    await page.locator('#btn-dl-all').click();
    await expect.poll(() => names.length, { timeout: 15_000 }).toBe(count);
    names.forEach((name, i) => expect(name).toMatch(new RegExp(`_parte-0${i + 1}\\.webm$`)));
    for (let index = 1; index <= count; index++) {
      await expect(page.locator(`.part-item[data-part="${index}"]`)).toContainText('baixada');
    }
  });
});

test('a transcrição ao vivo da gravação inteira fica num bloco só com TXT, sem SRT', async ({}, testInfo) => {
  await record(testInfo, async ({ page, id }) => {
    await page.routeWebSocket(/api\.deepgram\.com/, ws => {
      ws.onMessage(message => {
        if (typeof message === 'string' && JSON.parse(message).type === 'CloseStream') {
          ws.send(JSON.stringify({ is_final: true, start: 0, duration: 1,
            channel: { alternatives: [{ transcript: 'fala contínua da gravação inteira' }] } }));
          ws.close();
        }
      });
    });
    await page.evaluate(() => chrome.storage.local.set({ deepgramKey: 'dg-e2e' }));
    await open(page, id, LIMIT);
    await page.locator('#toggle-transcript').check();
    await startRecording(page);
    await expect(page.locator('#part-indicator')).toHaveText('Parte 2', { timeout: 40_000 });
    await page.waitForTimeout(1500);   // dá tempo de a parte 2 ter dados (senão seria descartada)
    await page.locator('#btn-stop').click();
    await expect(page.locator('#parts-block')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#live-block')).toBeVisible();
    await expect(page.locator('#live-preview')).toHaveText('fala contínua da gravação inteira');
    // Nenhuma sessão de parte recebeu o texto ao vivo.
    await expect(page.locator('#transcript-done-block')).toBeHidden();
    await expect(page.locator('#live-block #btn-dl-srt')).toHaveCount(0);
    const promise = page.waitForEvent('download');
    await page.locator('#btn-dl-live').click();
    const file = await promise;
    expect(file.suggestedFilename()).toMatch(/^transcricao-ao-vivo_.*\.txt$/);
    expect(await fs.readFile(await file.path(), 'utf8')).toBe('fala contínua da gravação inteira');
  });
});

test('descartar uma gravação em partes limpa lista, sessões e bloco ao vivo; a próxima gravação curta não tem lista', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page, id }) => {
    await mockServices(context);
    await page.evaluate(() => chrome.storage.local.set({ deepgramKey: 'dg-e2e', elevenLabsKey: 'el-e2e' }));
    await recordThreeParts(page, id);
    await page.locator('.part-item[data-part="1"] button[data-act="tx"]').click();
    await page.locator('#post-start').click();
    await expect(page.locator('#transcript-preview')).toBeVisible();
    await page.locator('#btn-discard').click();
    await expect(page.locator('#v-idle')).toHaveClass(/on/);
    await expect(page.locator('#parts-block')).toBeHidden();
    await expect(page.locator('#live-block')).toBeHidden();

    await open(page, id);
    await startRecording(page);
    await page.waitForTimeout(1800);
    await page.locator('#btn-stop').click();
    await expect(page.locator('#done-sub')).toHaveText('Arquivo .webm pronto', { timeout: 30_000 });
    await expect(page.locator('#parts-block')).toBeHidden();
    await expect(page.locator('#post-part-title')).toBeHidden();
    await expect(page.locator('#transcript-done-block')).toBeHidden();
  });
});

// ---------- US3: recuperação de várias partes ----------
// Simula a queda da janela no meio da gravação: fecha a página sem parar e reabre a extensão.
async function crashWithParts(context, page, id) {
  await open(page, id, LIMIT);
  await startRecording(page);
  await expect(page.locator('#part-indicator')).toHaveText('Parte 3', { timeout: 40_000 });
  await page.waitForTimeout(1500);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${id}/recorder.html`);
  return reopened;
}

test('queda no meio de uma gravação dividida: todas as partes aparecem para recuperar e abrem', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page, id }) => {
    const reopened = await crashWithParts(context, page, id);
    await expect(reopened.locator('#recovery')).toBeVisible();
    await expect(reopened.locator('#recovery-text')).toContainText('partes de uma gravação interrompida');
    await expect(reopened.locator('#recovery-text')).toContainText('descarta');
    await reopened.locator('#recovery-restore').click();
    await expect(reopened.locator('#done-title')).toHaveText('Gravação recuperada');
    await expect(reopened.locator('#parts-block')).toBeVisible();
    const count = await reopened.locator('.part-item').count();
    expect(count).toBeGreaterThanOrEqual(3);
    await expect(reopened.locator('#post-part-title')).toContainText(`Parte 1 de ${count}`);
    for (const index of [1, count]) {
      const file = await downloadPart(reopened, index);
      expect(file.name).toMatch(new RegExp(`_recuperada_.*_parte-0${index}\\.webm$`));
      const info = await inspectWebm(file.path);
      expect(info.duration).toBeGreaterThan(0);
      expect(info.video).toBe(1);
    }
  });
});

test('parte baixada não volta; baixar todas encerra a recuperação', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page, id }) => {
    const reopened = await crashWithParts(context, page, id);
    await reopened.locator('#recovery-restore').click();
    await expect(reopened.locator('#parts-block')).toBeVisible();
    const count = await reopened.locator('.part-item').count();
    await downloadPart(reopened, 1);

    await reopened.reload();
    await expect(reopened.locator('#recovery')).toBeVisible();
    await reopened.locator('#recovery-restore').click();
    await expect(reopened.locator('#parts-block')).toBeVisible();
    expect(await reopened.locator('.part-item').count()).toBe(count - 1);
    await expect(reopened.locator('.part-item').first()).toHaveAttribute('data-part', '2');
    await expect(reopened.locator('#post-part-title')).toContainText(`Parte 2 de ${count}`);

    const names = [];
    reopened.on('download', download => names.push(download.suggestedFilename()));
    await reopened.locator('#btn-dl-all').click();
    await expect.poll(() => names.length, { timeout: 15_000 }).toBe(count - 1);
    expect(names[0]).toMatch(/_parte-02\.webm$/);

    await reopened.reload();
    await expect(reopened.locator('#recovery')).toBeHidden();
  });
});

test('descartar a recuperação apaga as partes guardadas', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page, id }) => {
    const reopened = await crashWithParts(context, page, id);
    await expect(reopened.locator('#recovery')).toBeVisible();
    await reopened.locator('#recovery-discard').click();
    await expect(reopened.locator('#recovery')).toBeHidden();
    await reopened.reload();
    await expect(reopened.locator('#recovery')).toBeHidden();
  });
});

test('sobrando só uma parte (a 2) a recuperação mostra a lista, sem perder o número da parte', async ({}, testInfo) => {
  await record(testInfo, async ({ context, page, id }) => {
    await open(page, id);
    // Semeia duas partes direto no banco: a parte 1 já foi baixada (não existe), restou a 2.
    const bytes = (await fs.readFile(require('node:path').join(__dirname, '..', 'fixtures', 'video-audio.webm'))).toString('base64');
    await page.evaluate(async b64 => {
      const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'video/webm' });
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('recorder-recovery', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['meta', 'chunks'], 'readwrite');
        tx.objectStore('meta').put({ mode: 'video', type: 'video/webm', startedAt: Date.now() }, 'current');
        tx.objectStore('chunks').add({ part: 2, blob });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, bytes);
    await page.reload();
    await expect(page.locator('#recovery')).toBeVisible();
    await page.locator('#recovery-restore').click();
    await expect(page.locator('#parts-block')).toBeVisible();
    await expect(page.locator('.part-item')).toHaveCount(1);
    await expect(page.locator('.part-item').first()).toHaveAttribute('data-part', '2');
    await expect(page.locator('#post-part-title')).toContainText('Parte 2 de 2');
    const file = await downloadPart(page, 2);
    expect(file.name).toMatch(/_parte-02\.webm$/);
    await page.reload();
    await expect(page.locator('#recovery')).toBeHidden();
  });
});

// ---------- Modo Só Áudio ----------
test('modo Só Áudio também se divide; cada parte é só áudio e não oferece MP3', async ({}, testInfo) => {
  await record(testInfo, async ({ page, id }) => {
    await open(page, id, 50_000);   // o áudio gera poucos KB por segundo: usa o limite mínimo permitido
    await startRecording(page, 'audio');
    await expect(page.locator('#part-indicator')).toHaveText('Parte 2', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.locator('#btn-stop').click();
    await expect(page.locator('#parts-block')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#btn-dl-mp3')).toBeHidden();
    await expect(page.locator('#btn-dl')).toBeHidden();
    const count = await page.locator('.part-item').count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let index = 1; index <= count; index++) {
      const file = await downloadPart(page, index);
      expect(file.name).toMatch(new RegExp(`^gravacao-audio_.*_parte-0${index}\\.webm$`));
      const info = await inspectWebm(file.path);
      expect(info.video).toBe(0);
      expect(info.audio).toBe(1);
      expect(info.duration).toBeGreaterThan(0.3);
    }
  });
});
