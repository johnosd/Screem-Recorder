# Lógica: gravador em partes, nomes, limite e recuperação

Delimita o "como" onde um executor poderia errar. Os testes de contrato travados (`tests/unit/split-recording.contract.test.js`) definem o comportamento; este arquivo fixa assinaturas e o porquê.

## `src/recording-parts.js`

```js
export const PART_LIMIT_BYTES = 1_400_000_000;   // < MAX_FINALIZE_BYTES (1_500_000_000)
const MIN_TEST_LIMIT = 50_000;

export function resolvePartLimit(search, fallback = PART_LIMIT_BYTES) {
  const raw = new URLSearchParams(search).get('partLimitBytes');
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return value >= MIN_TEST_LIMIT && value <= fallback ? value : fallback;
}

export function partFileName(baseName, index, total) {
  if (total <= 1) return `${baseName}.webm`;
  const width = Math.max(2, String(total).length);
  return `${baseName}_parte-${String(index).padStart(width, '0')}.webm`;
}
```

- Uma única parte mantém o nome de hoje (`gravacao-video_<ts>.webm`), por SC-003.
- O sufixo usa a largura do total para continuar ordenável (`parte-012` de 120).

## `src/split-recorder.js`

Assinatura (os testes injetam um `MediaRecorder` falso em `createRecorder`):

```js
createSplitRecorder({
  createRecorder,        // () => objeto tipo MediaRecorder: start(timeslice), stop(), pause(), resume(), state, ondataavailable, onstop
  limitBytes,            // fecha a parte quando os bytes dela alcançam este valor
  timeslice = 1000,
  mimeType,              // `type` dos Blobs das partes
  onChunk,               // ({ part, blob }) a cada pedaço recebido (persistência em IndexedDB)
  onPartClosed,          // ({ index, blob }) quando uma parte fecha, na ordem
  onError                // (error) falha ao abrir a próxima parte
}) -> {
  start(),               // cria a parte 1 e inicia
  pause(), resume(),     // delegam ao recorder atual
  stop(): Promise<{ parts: [{ index, blob }], error: Error|null }>,
  get state(),           // 'inactive' | 'recording' | 'paused'
}
```

Regras:

1. **Contagem**: cada `ondataavailable` do recorder da parte `n` soma `data.size` aos bytes da parte `n`, guarda o `Blob` e chama `onChunk({ part: n, blob })`. Dados de tamanho zero são ignorados.
2. **Gatilho**: se, depois de somar, `bytes >= limitBytes` e não há rotação nem parada em andamento, inicia a rotação. Pausado não chega pedaço; o gatilho dispara no primeiro pedaço depois de retomar.
3. **Rotação**: marcar `rotating = true`; chamar `recorder.stop()` do recorder **atual**; no `onstop` dele: montar o `Blob` da parte com `new Blob(chunks, { type: mimeType })`, chamar `onPartClosed({ index, blob })` e só então `createRecorder()` + `start(timeslice)` da próxima parte (índice + 1). Não esperar o remux. A parte seguinte só começa a receber pedaços depois disso.
4. **Sequencial, nunca simultâneo**: não iniciar a nova parte antes do `onstop` da antiga. É o que garante ausência de sobreposição (contrato 1) e custa cerca de 0,09 s (research §1).
5. **Falha ao abrir a próxima parte** (`createRecorder` ou `start` lançam): chamar `onError(error)` uma vez, ficar em estado `inactive` com `error` guardado e **manter as partes já fechadas**. `stop()` depois disso resolve com `{ parts, error }` sem lançar.
6. **`stop()`**: se houver rotação em andamento, esperar ela terminar; depois parar o recorder atual, esperar o `onstop`, fechar a última parte (mesma montagem e `onPartClosed`) e resolver `{ parts, error: null }`. Chamar `stop()` de novo devolve o mesmo resultado, sem reabrir nada.
7. **Estado**: `state` reflete o recorder atual; durante a janela da rotação continua `recording` (o usuário não vê a troca).
8. **Parte vazia**: se o `Blob` de uma parte tiver 0 bytes (por exemplo, `stop()` logo após uma rotação numa tela estática), não entra em `parts` nem chama `onPartClosed`; os índices restantes continuam sequenciais e sem buracos.

Não faz parte do módulo: remux, duração, IndexedDB, downloads ou interface. Quem usa (`recorder.js`) liga `onChunk` ao `recovery.appendChunk(blob, part)` e `onPartClosed` à fila de remux.

## `src/recovery-store.js` (extensão compatível)

- `appendChunk(blob, part = 1)` grava `{ part, blob }` no object store `chunks` (autoIncrement, **sem** mudar a versão do banco).
- `loadSession()`: ler cada valor de `chunks`; se for `Blob`, tratar como `{ part: 1, blob }`. Devolver `{ meta, blob, parts }` com:
  - `parts`: `[{ index, blob }]` ordenado por `index`, cada `blob` com os pedaços daquela parte na ordem de gravação e `type = meta.type`;
  - `blob`: todos os pedaços juntos (comportamento atual; só usado por gravações de uma parte e pelos testes existentes);
  - `null` se não houver meta ou bytes.
- `markPartDownloaded(part)`: apagar com cursor todos os valores com aquela parte; se não restar nenhum valor em `chunks`, apagar também `meta`.
- `clear()` e `startSession()` continuam iguais.

## Duração e remux (`recorder.js`)

- `onPartClosed` entra numa **fila serial**: `finalizeWebm(blob)` e depois a duração por `mediabunny`. Uma parte por vez, para não somar a memória de dois remuxes. A fila termina antes de a tela final aparecer.
- A fila também alimenta a lista de partes (nome, duração, tamanho); em uma gravação de uma parte o resultado vira `recordedBlob` como hoje.
