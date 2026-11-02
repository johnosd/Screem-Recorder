# Lógica: ligação da divisão em `recorder.js` e `recorder.html`

Complementa `split-recorder.md`. Fixa como a interface e a sessão de transcrição convivem com várias partes sem quebrar o caminho de uma parte.

## Estado novo em `recorder.js`

```js
let splitRecorder = null;     // substitui `mediaRecorder` para pausa, parada e o aviso de saída
let parts = [];               // [{ index, name, blob, size, durationSec, downloaded }]  (após a fila de remux)
let finalizeQueue = Promise.resolve();
const partSessions = new Map(); // index -> sessão de transcrição própria
let selectedPart = 1;
```

- `mediaRecorder` deixa de existir. As referências (`pause`, `resume`, `doStop`, guarda de saída) passam a usar `splitRecorder.state`/métodos.
- `chunks` deixa de existir; os pedaços ficam dentro do `splitRecorder`.
- O guarda de saída fica `splitRecorder?.state !== 'inactive'` ou alguma parte não baixada (`unsavedRecording`).

## Início da gravação

- `splitRecorder = createSplitRecorder({ createRecorder: () => new MediaRecorder(finalStream, buildRecorderOptions(mode, mime, quality)), limitBytes: resolvePartLimit(location.search), timeslice: 1000, mimeType: mode === 'video' ? 'video/webm' : 'audio/webm', onChunk: ({ part, blob }) => recovery?.appendChunk(blob, part)…, onPartClosed: enqueueFinalize, onError: handleSplitError })`.
- O evento `ended` da faixa de vídeo continua chamando `doStop()`.
- Indicador discreto na tela de gravação: `#part-indicator` aparece só quando existe a parte 2 ou mais ("Parte 2"), atualizado em `onPartClosed` (a parte seguinte é `índice + 1`). Em uma parte, escondido (SC-003).

## Parada (`doStop`)

1. Congelar o cronômetro como hoje (`finalDur`).
2. `const { parts: closed, error } = await splitRecorder.stop()`; esperar `finalizeQueue`.
3. Partes de 0 bytes já não chegam (regra 8). Se `closed.length === 0`: "Gravação vazia" como hoje.
4. **1 parte**: caminho **idêntico ao atual** (`recordedBlob`, `postSession.setSource`, `#btn-dl`, MP3 no modo áudio, transcrição ao vivo na sessão). Sem lista (`#parts-block` escondido).
5. **2 ou mais partes**: esconder `#btn-dl` e `#btn-dl-mp3` (MP3 não é oferecido por parte nesta feature: R-006), mostrar `#parts-block`, montar a lista e selecionar a parte 1.
6. Se `error`: `showErr` com a mensagem, e a tela final mostra as partes já fechadas (FR-011).

## Lista de partes (US2)

- `#parts-list` com um item por parte: nome (`partFileName`), duração (`mm:ss`), tamanho (MB) e botões **Baixar** e **Transcrever**, mais indicador de estado ("Transcrito por X" quando houver).
- **Baixar**: `downloadBlob(part.blob, part.name)`, `part.downloaded = true`, `recovery.markPartDownloaded(part.index)`; se todas baixadas, `markSaved()`.
- **Baixar todas** (`#btn-dl-all`): percorre as partes em ordem, uma por vez, com ~400 ms entre elas; não renomeia nem recodifica (FR-013).
- **Transcrever** de uma parte: seleciona a parte (`selectPart(index)`), abre o painel `#post-panel` para ela e foca `#post-provider`; a transcrição começa em **Transcrever áudio**, como na feature 002 (aviso, provedor e chave inalterados).
- `selectPart(index)`: cancela a assinatura anterior, `postSession = ensurePartSession(index)`, `postSession.subscribe(renderPostState)`, atualiza `#post-part-title` ("Parte N de M") e re-renderiza a lista.
- `ensurePartSession(index)`: cria uma sessão com o mesmo `transcribe` de hoje e `setSource({ blob: part.blob, name: part.name, origin: 'recorded', kind: mode })`. Resultados ficam em cada sessão (FR-007: nunca misturam).
- **Uma transcrição por vez**: `isAnyProcessing()` = alguma sessão com `status === 'processing'`. Com isso verdadeiro, o botão **Transcrever áudio** das outras partes fica desabilitado e mostra "Há outra transcrição em andamento". **Baixar** continua liberado em todas.
- Transcrição ao vivo em gravação com várias partes: **não** vai para nenhuma sessão de parte. Aparece em `#live-block` ("Transcrição ao vivo da gravação inteira") com **Baixar .txt**, sem SRT.

## Descartar, nova gravação, importar arquivo

- `resetPostSession()` passa a cancelar e descartar **todas** as sessões de partes e voltar ao caminho de uma parte (como hoje para importar arquivo).
- Descartar: limpa `parts`, sessões, `recovery.clear()` e `#parts-block`.

## O que não muda

Pausa e retomada, cronômetro corrido, qualidade, mixagem de áudio, transcrição ao vivo (Deepgram), `webm-finalize` e o aviso de saída.
