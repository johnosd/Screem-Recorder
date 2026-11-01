# CLAUDE.md

Orientações para trabalhar neste repositório. Consulte também `README.md` para as funcionalidades e o fluxo de uso atuais.

## Projeto

Extensão Chrome Manifest V3 para gravar tela e áudio, com microfone opcional e transcrição opcional via Deepgram. O código-fonte JavaScript fica em `src/`; o Webpack gera os bundles em `dist/`.

## Build e validação

```bash
npm install
npm test
npm run build
```

O projeto tem testes Jest e comandos de teste e build no `package.json`. Não há script de lint nem de type-check declarado. Não edite `dist/` manualmente.

Para verificar comportamento no Chrome, rode o build, carregue a raiz deste repositório em `chrome://extensions/` como extensão sem compactação e recarregue a extensão após mudanças. Testes Jest e build não substituem a verificação dos fluxos de captura, permissões, áudio e transcrição no Chrome.

## Arquitetura

- `src/popup.js` abre ou restaura a janela do gravador.
- `src/background.js` é o service worker que solicita a captura de tela.
- `src/recorder.js` coordena captura, mixagem de áudio, gravação, transcrição e downloads.
- `src/audio-processor.js` processa PCM para a transcrição.
- `recorder.html` e `popup.html` definem as interfaces da extensão.
- `manifest.json` declara permissões, páginas e service worker.

O fluxo de gravação usa o seletor nativo do Chrome, `getUserMedia`, Web Audio API e `MediaRecorder`. A transcrição envia áudio ao Deepgram quando ativada; trate a chave da API como dado sensível e não a registre em código, logs ou relatórios.
