# CLAUDE.md

Orientações para trabalhar neste repositório. Consulte também `README.md` para as funcionalidades e o fluxo de uso atuais.

## Projeto

Extensão Chrome Manifest V3 para gravar tela e áudio, com microfone opcional e transcrição opcional via Deepgram. O código-fonte JavaScript fica em `src/`; o Webpack gera os bundles em `dist/`.

## Build e validação

```bash
npm install
npm test
npm run build
npm run build:prod   # bundle minificado, sem source maps
npm run test:e2e     # Playwright com a extensão carregada no Chromium (tests/e2e/capture.spec.cjs simula captura com flags do Chromium)
```

Os testes ficam em `tests/` (`unit`, `e2e`, `integration`, `fixtures`); `src/` só tem código da extensão. O projeto tem testes Jest e comandos de teste e build no `package.json`. Não há script de lint nem de type-check declarado. Não edite `dist/` manualmente.

Para verificar comportamento no Chrome, rode o build, carregue a raiz deste repositório em `chrome://extensions/` como extensão sem compactação e recarregue a extensão após mudanças. Testes Jest e build não substituem a verificação dos fluxos de captura, permissões, áudio e transcrição no Chrome.

## Arquitetura

- `src/popup.js` abre ou restaura a janela do gravador.
- `src/background.js` é um service worker vazio (reservado). Ele continua declarado no manifest porque os testes e2e obtêm o ID da extensão a partir dele. A captura de tela é pedida em `recorder.js`.
- `src/recorder.js` coordena captura, mixagem de áudio, gravação, transcrição e downloads.
- `src/audio-processor.js` processa PCM para a transcrição ao vivo.
- `src/mp3-worker.js` codifica MP3 fora da thread principal; `src/webm-finalize.js` regrava o WebM com duração; `src/recording-profile.js` define os perfis de qualidade; `src/deepgram-live.js` e `src/unload-guard.js` isolam o fechamento do Deepgram e o aviso de saída; `src/recovery-store.js` guarda a gravação em IndexedDB para recuperação.
- `recorder.html` e `popup.html` definem as interfaces da extensão.
- `manifest.json` declara permissões, páginas e service worker.

O fluxo de gravação usa o seletor nativo do Chrome, `getUserMedia`, Web Audio API e `MediaRecorder`. A transcrição envia áudio ao Deepgram quando ativada; trate a chave da API como dado sensível e não a registre em código, logs ou relatórios.
