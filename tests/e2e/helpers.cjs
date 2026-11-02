const { expect, chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const apiUrl = 'https://api.elevenlabs.io/v1/speech-to-text';

async function saveElevenLabsKey(page) {
  await page.locator('#btn-settings').click();
  await page.locator('#post-key').fill('e2e-fake-key');
  await page.locator('#post-save-key').click();
  await expect(page.locator('#post-key-status')).toContainText('Chave salva');
  await page.locator('#btn-settings-close').click();
}

// `args` extras permitem simular captura de tela/áudio e microfone no Chromium.
async function withExtension(testInfo, scenario, { args = [] } = {}) {
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
    channel: 'chromium', headless: true, acceptDownloads: true,
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root, ...args]
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

// Tela e áudio do sistema falsos, microfone falso e seletor de captura respondido sem clique.
const CAPTURE_ARGS = ['--auto-select-desktop-capture-source=Entire screen',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

module.exports = { root, apiUrl, saveElevenLabsKey, withExtension, CAPTURE_ARGS };
