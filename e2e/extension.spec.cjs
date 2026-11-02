const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const apiUrl = 'https://api.elevenlabs.io/v1/speech-to-text';

async function saveElevenLabsKey(page) {
  await page.locator('#btn-settings').click();
  await page.locator('#post-key').fill('e2e-fake-key');
  await page.locator('#post-save-key').click();
  await expect(page.locator('#post-key-status')).toContainText('Chave salva');
  await page.locator('#btn-settings-close').click();
}

async function withExtension(testInfo, scenario) {
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
    channel: 'chromium', headless: true, acceptDownloads: true,
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root]
  });
  const events = [];
  const record = (origin, level, details = {}) => events.push({
    at: new Date().toISOString(), test: testInfo.title, origin, level, ...details
  });
  const safeUrl = value => { const url = new URL(value); return url.origin + url.pathname; };
  const attachPage = page => {
    const origin = () => page.url().includes('popup.html') ? 'popup' : 'page';
    page.on('console', message => record(origin(), message.type(), {
      message: message.text(), source: message.location().url
    }));
    page.on('pageerror', error => record(origin(), 'exception', {
      message: error.message, stack: error.stack
    }));
  };
  context.pages().forEach(attachPage);
  context.on('page', attachPage);
  context.on('request', request => record('network', 'request', {
    method: request.method(), url: safeUrl(request.url())
  }));
  context.on('response', response => record('network', 'response', {
    status: response.status(), url: safeUrl(response.url())
  }));
  context.on('requestfailed', request => record('network', 'failed', {
    url: safeUrl(request.url()), failure: request.failure()?.errorText
  }));
  const attachWorker = worker => worker.on('console', message =>
    record('service-worker', message.type(), { message: message.text() }));
  context.serviceWorkers().forEach(attachWorker);
  context.on('serviceworker', attachWorker);

  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  let failed = false;
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto('chrome-extension://' + id + '/recorder.html');
    await scenario({ context, page, worker, id, events });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (failed) {
      await context.tracing.stop({ path: testInfo.outputPath('trace.zip') });
      await context.pages().at(-1)?.screenshot({ path: testInfo.outputPath('failure.png') }).catch(() => {});
    } else await context.tracing.stop();
    const logPath = testInfo.outputPath('browser-events.jsonl');
    await fs.writeFile(logPath, events.map(event => JSON.stringify(event)).join('\n') + '\n');
    await testInfo.attach('browser-events', { path: logPath, contentType: 'application/x-ndjson' });
    if (failed) await testInfo.attach('trace', {
      path: testInfo.outputPath('trace.zip'), contentType: 'application/zip'
    });
    await context.close();
  }
}

test('engrenagem abre configurações com as chaves de API e volta à tela anterior', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ page }) => {
    await expect(page.locator('#post-key')).toBeHidden();
    await expect(page.locator('#input-api-key')).toBeHidden();
    await page.locator('#btn-settings').click();
    await expect(page.locator('#input-api-key')).toBeVisible();
    await expect(page.locator('#post-key')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeHidden();
    await page.locator('#post-key').fill('e2e-fake-key');
    await page.locator('#post-save-key').click();
    await expect(page.locator('#post-key-status')).toContainText('Chave salva');
    await page.locator('#btn-settings-close').click();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#post-key')).toBeHidden();
  });
});

test('qualidade da gravação escolhida nas configurações persiste ao reabrir a página', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ page }) => {
    await page.locator('#btn-settings').click();
    await expect(page.locator('.qbtn.on')).toHaveAttribute('data-q', 'equilibrada');
    await page.locator('.qbtn[data-q="economica"]').click();
    await expect(page.locator('#quality-desc')).toContainText('720p');
    await page.reload();
    await page.locator('#btn-settings').click();
    await expect(page.locator('.qbtn.on')).toHaveAttribute('data-q', 'economica');
  });
});

test('worker de MP3 codifica PCM em MP3 e a página não pede fontes externas', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ page, events }) => {
    const result = await page.evaluate(() => new Promise((resolve, reject) => {
      const worker = new Worker(chrome.runtime.getURL('dist/mp3-worker.bundle.js'));
      const progress = [];
      worker.onerror = e => reject(new Error(e.message));
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') progress.push(data.progress);
        else if (data.type === 'done') resolve({ type: data.blob.type, size: data.blob.size, progress: progress.length });
        else reject(new Error(data.message));
      };
      const left = new Int16Array(48000 * 2).map((_, i) => Math.round(Math.sin(i / 20) * 12000));
      worker.postMessage({ left, right: left.slice(), sampleRate: 48000, kbps: 128 });
    }));
    expect(result.type).toBe('audio/mpeg');
    expect(result.size).toBeGreaterThan(1000);
    expect(result.progress).toBeGreaterThan(0);
    expect(events.filter(e => e.origin === 'network' && /googleapis|gstatic/.test(e.url || ''))).toEqual([]);
  });
});

test('recupera a gravação interrompida salva em IndexedDB e a descarta depois', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ page }) => {
    await expect(page.locator('#recovery')).toBeHidden();
    const bytes = (await fs.readFile(path.join(root, 'src', 'fixtures', 'video-audio.webm'))).toString('base64');
    await page.evaluate(async b64 => {
      const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'video/webm' });
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open('recorder-recovery', 1);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['meta', 'chunks'], 'readwrite');
        tx.objectStore('meta').put({ mode: 'video', type: 'video/webm', startedAt: Date.now() }, 'current');
        tx.objectStore('chunks').add(blob);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, bytes);
    await page.reload();
    await expect(page.locator('#recovery')).toBeVisible();
    await page.locator('#recovery-restore').click();
    await expect(page.locator('#done-title')).toHaveText('Gravação recuperada');
    await expect(page.locator('#btn-dl')).toBeEnabled();
    await expect(page.locator('#post-start')).toBeEnabled();
    await page.locator('#btn-discard').click();
    await page.reload();
    await expect(page.locator('#recovery')).toBeHidden();
  });
});

test('importa WebM, envia só áudio após clique e gera TXT/SRT', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page, events }) => {
    let requests = 0;
    let payload = '';
    await context.route('**/*', route => {
      if (route.request().url().startsWith('chrome-extension://')) return route.continue();
      return route.abort();
    });
    await context.route(apiUrl, async route => {
      requests++;
      payload = route.request().postDataBuffer().toString('latin1');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        text: 'Olá mundo', words: [
          { type: 'word', text: 'Olá', start: 0, end: 0.4 },
          { type: 'word', text: 'mundo', start: 0.5, end: 0.9 }
        ]
      }) });
    });
    await page.locator('#import-file').setInputFiles(path.join(root, 'src/fixtures/video-audio.webm'));
    await expect(page.locator('#post-status')).toContainText('Arquivo pronto');
    expect(requests).toBe(0);
    await saveElevenLabsKey(page);
    await expect(page.locator('#post-key-status')).toContainText('Chave salva');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Transcrição concluída');
    await expect(page.locator('#transcript-preview')).toHaveText('Olá mundo');
    expect(requests).toBe(1);
    expect(payload).toContain('name="model_id"');
    expect(payload).toContain('scribe_v2');
    expect(payload).not.toContain('name="additional_formats"');
    expect(payload).toMatch(/filename="[^"]+\.webm"/);
    expect(payload).toContain('Content-Type: audio/webm');
    expect(payload).not.toContain('Content-Type: video/webm');
    const txtPromise = page.waitForEvent('download');
    await page.locator('#btn-dl-txt').click();
    const txt = await txtPromise;
    expect(txt.suggestedFilename()).toMatch(/\.txt$/);
    expect(await fs.readFile(await txt.path(), 'utf8')).toBe('Olá mundo');
    const srtPromise = page.waitForEvent('download');
    await page.locator('#btn-dl-srt').click();
    const srt = await srtPromise;
    expect(srt.suggestedFilename()).toMatch(/\.srt$/);
    const srtText = await fs.readFile(await srt.path(), 'utf8');
    expect(srtText).toContain('Olá');
    expect(srtText).toContain('mundo');
    expect(events.some(e => e.origin === 'network' && e.level === 'response' &&
      e.status === 200 && e.url === apiUrl)).toBe(true);
    expect(events.filter(e => e.level === 'error' || e.level === 'exception' ||
      e.level === 'failed')).toEqual([]);
  });
});

test('importa MP4/AAC e envia M4A só de áudio no Chromium', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page, events }) => {
    let requests = 0;
    let payload = '';
    await context.route('**/*', route => route.request().url().startsWith('chrome-extension://')
      ? route.continue() : route.abort());
    await context.route(apiUrl, route => {
      requests++;
      payload = route.request().postDataBuffer().toString('latin1');
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ text: 'Fala', words: [
          { type: 'word', text: 'Fala', start: 0, end: 0.8 }
        ] }) });
    });
    await page.locator('#import-file').setInputFiles(path.join(root, 'src/fixtures/video-audio.mp4'));
    await expect(page.locator('#post-status')).toContainText('Arquivo pronto');
    expect(requests).toBe(0);
    await saveElevenLabsKey(page);
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Transcrição concluída');
    expect(requests).toBe(1);
    expect(payload).toMatch(/filename="video-audio\.m4a"/);
    expect(payload).toContain('Content-Type: audio/mp4');
    expect(payload).not.toContain('Content-Type: video/mp4');
    await expect(page.locator('#btn-dl-srt')).toBeEnabled();
    expect(events.filter(e => e.level === 'error' || e.level === 'exception' ||
      e.level === 'failed')).toEqual([]);
  });
});

for (const [filename, mimeType] of [
  ['audio-only.webm', 'audio/webm'], ['audio-only.mp3', 'audio/mpeg']
]) {
  test(`importa ${filename} sem faixa de vídeo e envia áudio diretamente`, async ({}, testInfo) => {
    await withExtension(testInfo, async ({ context, page, events }) => {
      let requests = 0;
      let payload = '';
      await context.route('**/*', route => route.request().url().startsWith('chrome-extension://')
        ? route.continue() : route.abort());
      await context.route(apiUrl, route => {
        requests++;
        payload = route.request().postDataBuffer().toString('latin1');
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ text: 'Fala', words: [
            { type: 'word', text: 'Fala', start: 0, end: 0.8 }
          ] }) });
      });
      await page.locator('#import-file').setInputFiles({
        name: filename, mimeType, buffer: await fs.readFile(path.join(root, 'src/fixtures', filename))
      });
      await expect(page.locator('#post-status')).toContainText('Arquivo pronto');
      expect(requests).toBe(0);
      await saveElevenLabsKey(page);
      await page.locator('#post-start').click();
      await expect(page.locator('#post-status')).toContainText('Transcrição concluída');
      expect(requests).toBe(1);
      expect(payload).toContain(`filename="${filename}"`);
      expect(payload).toContain(`Content-Type: ${mimeType}`);
      expect(payload).not.toContain('Content-Type: video/');
      await expect(page.locator('#btn-dl-srt')).toBeEnabled();
      expect(events.filter(e => e.level === 'error' || e.level === 'exception' ||
        e.level === 'failed')).toEqual([]);
    });
  });
}

test('cancelar nova transcrição preserva texto e downloads anteriores', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    let requests = 0;
    let releaseSecond;
    let resolveSecondSeen;
    const secondSeen = new Promise(resolve => { resolveSecondSeen = resolve; });
    await context.route('**/*', route => route.request().url().startsWith('chrome-extension://')
      ? route.continue() : route.abort());
    await context.route(apiUrl, async route => {
      requests++;
      if (requests === 2) {
        resolveSecondSeen();
        await new Promise(resolve => { releaseSecond = resolve; });
      }
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ text: requests === 1 ? 'Texto anterior' : 'Resposta tardia',
          words: [{ type: 'word', text: requests === 1 ? 'Anterior' : 'Tardia',
            start: 0, end: 0.8 }] }) }).catch(() => {});
    });
    await page.locator('#import-file').setInputFiles(path.join(root, 'src/fixtures/video-audio.webm'));
    await saveElevenLabsKey(page);
    await page.locator('#post-start').click();
    await expect(page.locator('#transcript-preview')).toHaveText('Texto anterior');
    await page.locator('#post-start').click();
    await secondSeen;
    await expect(page.locator('#post-cancel')).toBeVisible();
    await page.locator('#post-cancel').click();
    await expect(page.locator('#post-status')).toContainText('Transcrição cancelada');
    releaseSecond();
    await expect(page.locator('#transcript-preview')).toHaveText('Texto anterior');
    await expect(page.locator('#btn-dl-txt')).toBeEnabled();
    await expect(page.locator('#btn-dl-srt')).toBeEnabled();
    expect(requests).toBe(2);
  });
});

test('coletor registra página, popup, service worker e falha de rede', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page, worker, id, events }) => {
    await page.evaluate(() => console.log('e2e-page-probe'));
    await context.route('**/dist/popup.bundle.js', route => route.fulfill({
      status: 200, contentType: 'text/javascript', body: "console.log('e2e-popup-probe')"
    }));
    const popup = await context.newPage();
    await popup.goto('chrome-extension://' + id + '/popup.html');
    await worker.evaluate(() => console.log('e2e-worker-probe'));
    await context.route('https://e2e.invalid/probe', route => route.abort());
    await page.evaluate(() => fetch('https://e2e.invalid/probe').catch(() => {}));
    await page.evaluate(() => setTimeout(() => { throw new Error('e2e-page-exception'); }, 0));
    await expect.poll(() => events.some(e => e.origin === 'network' && e.level === 'failed')).toBe(true);
    await expect.poll(() => events.some(e => e.level === 'exception' &&
      e.message === 'e2e-page-exception')).toBe(true);
    expect(events.some(e => e.origin === 'page' && e.message === 'e2e-page-probe')).toBe(true);
    expect(events.some(e => e.origin === 'popup' && e.message === 'e2e-popup-probe')).toBe(true);
    expect(events.some(e => e.origin === 'service-worker' && e.message === 'e2e-worker-probe')).toBe(true);
  });
});

test('preserva TXT e avisa quando resposta real nao tem tempos para SRT', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    await context.route('**/*', route => route.request().url().startsWith('chrome-extension://')
      ? route.continue() : route.abort());
    await context.route(apiUrl, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        text: 'Fala reconhecida',
        words: [{ type: 'word', text: 'Fala', start: 0, end: 0 }]
      })
    }));
    await page.locator('#import-file').setInputFiles(path.join(root, 'src/fixtures/video-audio.webm'));
    await saveElevenLabsKey(page);
    await expect(page.locator('#post-key-status')).toContainText('Chave salva');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('TXT disponível; SRT indisponível');
    await expect(page.locator('#post-status')).toContainText('1 palavra; 0 tempos válidos; 1 inválido');
    await expect(page.locator('#transcript-preview')).toHaveText('Fala reconhecida');
    await expect(page.locator('#btn-dl-txt')).toBeEnabled();
    await expect(page.locator('#btn-dl-srt')).toBeDisabled();
  });
});

test('baixa SRT quando algumas palavras não têm intervalo válido', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    await context.route('**/*', route => route.request().url().startsWith('chrome-extension://')
      ? route.continue() : route.abort());
    await context.route(apiUrl, route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        text: 'Fala sem tempo', words: [
          { type: 'word', text: 'Fala', start: 0, end: 0.3 },
          { type: 'word', text: 'sem', start: 0.3, end: 0.3 },
          { type: 'word', text: 'tempo', start: 0.4, end: 0.8 }
        ]
      })
    }));
    await page.locator('#import-file').setInputFiles(path.join(root, 'src/fixtures/video-audio.webm'));
    await saveElevenLabsKey(page);
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('Transcrição concluída');
    await expect(page.locator('#post-status')).toContainText('SRT disponível com palavras sem tempo próprio');
    await expect(page.locator('#btn-dl-srt')).toBeEnabled();
    const download = page.waitForEvent('download');
    await page.locator('#btn-dl-srt').click();
    const srt = await fs.readFile(await (await download).path(), 'utf8');
    expect(srt).toContain('Fala sem');
    expect(srt).toContain('tempo');
    expect(srt).toMatch(/00:00:00,000 --> 00:00:00,800/);
  });
});

test('SRT agrupa palavras em frases legíveis preservando pausas', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    await context.route('**/*', route => route.request().url().startsWith('chrome-extension://')
      ? route.continue() : route.abort());
    const words = [
      [0, 0.3, 'O'], [0.3, 0.6, 'modelo'], [0.6, 0.9, 'usa'],
      [0.9, 1.2, 'um'], [1.2, 1.5, 'plano'], [1.5, 1.8, 'para'],
      [1.8, 2.1, 'separar'], [2.1, 2.4, 'dados.'],
      [4, 4.3, 'Depois'], [4.3, 4.6, 'ele'], [4.6, 5, 'classifica.']
    ].map(([start, end, text]) => ({ type: 'word', start, end, text }));
    await context.route(apiUrl, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ text: 'O modelo usa um plano para separar dados. Depois ele classifica.', words })
    }));
    await page.locator('#import-file').setInputFiles(path.join(root, 'src/fixtures/video-audio.webm'));
    await saveElevenLabsKey(page);
    await page.locator('#post-start').click();
    await expect(page.locator('#btn-dl-srt')).toBeEnabled();
    const download = page.waitForEvent('download');
    await page.locator('#btn-dl-srt').click();
    const srt = await fs.readFile(await (await download).path(), 'utf8');
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:02,400\nO modelo usa um plano para separar dados.' +
      '\n\n2\n00:00:04,000 --> 00:00:05,000\nDepois ele classifica.');
  });
});

test('baixa SRT exportado pela ElevenLabs mesmo sem tempos por palavra', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    const srt = '1\n00:00:00,100 --> 00:00:00,800\nFala reconhecida';
    await context.route('**/*', route => route.request().url().startsWith('chrome-extension://')
      ? route.continue() : route.abort());
    await context.route(apiUrl, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ text: 'Fala reconhecida', words: [], additional_formats: [
        { requested_format: 'srt', file_extension: 'srt', content_type: 'text/plain',
          is_base64_encoded: false, content: srt }
      ] })
    }));
    await page.locator('#import-file').setInputFiles(path.join(root, 'src/fixtures/video-audio.webm'));
    await saveElevenLabsKey(page);
    await expect(page.locator('#post-key-status')).toContainText('Chave salva');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toHaveText('Transcrição concluída.');
    await expect(page.locator('#btn-dl-srt')).toBeEnabled();
    const download = page.waitForEvent('download');
    await page.locator('#btn-dl-srt').click();
    expect(await fs.readFile(await (await download).path(), 'utf8')).toBe(srt);
  });
});

test('HTTP 422 de parametro mostra diagnostico sem chamar arquivo corrompido', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    await context.route('**/*', route => route.request().url().startsWith('chrome-extension://')
      ? route.continue() : route.abort());
    await context.route(apiUrl, route => route.fulfill({ status: 422, contentType: 'application/json',
      body: JSON.stringify({ detail: [{ loc: ['body', 'additional_formats', 0],
        msg: 'secret text', type: 'value_error' }] }) }));
    await page.locator('#import-file').setInputFiles(path.join(root, 'src/fixtures/video-audio.webm'));
    await saveElevenLabsKey(page);
    await expect(page.locator('#post-key-status')).toContainText('Chave salva');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('HTTP 422');
    await expect(page.locator('#post-status')).toContainText('additional_formats');
    await expect(page.locator('#post-status')).not.toContainText('Arquivo inválido');
    await expect(page.locator('#post-status')).not.toContainText('secret text');
  });
});

test('401 de atividade incomum mostra bloqueio da ElevenLabs, não chave inválida', async ({}, testInfo) => {
  await withExtension(testInfo, async ({ context, page }) => {
    await context.route('**/*', route => route.request().url().startsWith('chrome-extension://')
      ? route.continue() : route.abort());
    await context.route(apiUrl, route => route.fulfill({ status: 401, contentType: 'application/json',
      body: JSON.stringify({ detail: { status: 'detected_unusual_activity',
        message: 'private response' } }) }));
    await page.locator('#import-file').setInputFiles(path.join(root, 'src/fixtures/video-audio.webm'));
    await saveElevenLabsKey(page);
    await expect(page.locator('#post-key-status')).toContainText('Chave salva');
    await page.locator('#post-start').click();
    await expect(page.locator('#post-status')).toContainText('atividade incomum');
    await expect(page.locator('#post-status')).not.toContainText('Chave ElevenLabs recusada');
    await expect(page.locator('#post-status')).not.toContainText('private response');
  });
});
