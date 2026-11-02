# Handoff: 002-escolha-provedor-transcricao

Resumo autossuficiente para o `sdd-execute`, escrito em 2026-11-02 pelo `sdd-plan`.

## Contexto

- Repositório `screen recorder`, branch `feature/indetect`. Extensão Chrome MV3 em JavaScript (Webpack 5, Jest 30, Playwright 1.64, `mediabunny`).
- Próximo comando: `/sdd-execute 002-escolha-provedor-transcricao`. Status no backlog: **Planejada**.
- Arquivos que mudaram fora desta sessão e valem uma releitura: `sdd/specs/001-transcricao-pos-gravacao/plan.md` (linha R-011 anexada), `src/post-transcription-providers/deepgram.js` (stub novo) e `tests/unit/post-provider-choice.contract.test.js` (contrato novo).
- Se for rodar o e2e, o build é feito por `npm run test:e2e` (`npm run build && playwright`).

## O que a feature entrega

- **US1 (P1)**: seletor ElevenLabs/Deepgram na tela final; transcrição pelo escolhido com aviso, chave, erros e limite próprios; sem chave só orienta para ⚙ Configurações; seletor desabilitado durante o processamento; nenhum dado vai ao outro serviço.
- **US2 (P2)**: resultado registra o provedor ("Transcrito por X"); retranscrever com o outro preserva o anterior até concluir; erro **não** sugere o outro provedor.
- **US3 (P3)**: lembra o último provedor (`postProvider` em `chrome.storage.local`); primeira abertura mostra ElevenLabs.
- **US4 (P2, fundação)**: todos os testes e fixtures vão para `tests/` (`unit`, `e2e`, `integration`, `fixtures`). O contrato da 001 muda de caminho por **emenda aprovada** (só linhas de `import`).
- Decisão do usuário contraintuitiva: o nome dos arquivos TXT/SRT baixados **não** inclui o provedor; a transcrição **ao vivo continua Deepgram** e não muda.

## Leitura obrigatória, em ordem

1. `sdd/specs/002-escolha-provedor-transcricao/spec.md` — 17 FR, 7 SC, 4 histórias e as respostas da clarificação.
2. `plan.md` — DI-001..DI-010, Constitution Check, riscos R-001..R-008 e a estratégia de testes.
3. `tasks.md` — 29 tasks em 6 fases, com o contrato por fase.
4. `logic/provider-adapter.md` — assinaturas do registro, do cliente, do adaptador Deepgram e da sessão.
5. `research.md` — endpoint e parâmetros do Deepgram, mapa de erros, limites e a reorganização de testes.
6. `quickstart.md` — verificação manual e itens que dependem de chave/Chrome real.
7. `.planning/memory/constitution.md` — princípios I a IV (II e IV pesam aqui).
8. `sdd/adr/ADR-001-provedores-transcricao-por-modalidade-adaptador.md` — o contrato de adaptador que esta feature concretiza.

## Testes de contrato

- Arquivo travado: `tests/unit/post-provider-choice.contract.test.js` (5 casos; US1: 4, US2: 1). Comando: `npx jest tests/unit/post-provider-choice.contract.test.js`. Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 002-escolha-provedor-transcricao`.
- Estão **vermelhos de propósito** (falha por asserção, confirmada em 2026-11-02): `npm test` mostra 5 falhas e 76 verdes; isso é o baseline, não regressão.
- Trava de **outra** feature que esta mexe: `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` (arquivo `src/post-transcription.contract.test.js`). A Fase 2 (T004) o move para `tests/unit/post-transcription.contract.test.js`. Só `import` pode mudar; depois regrave com `-Write -Paths tests/unit/post-transcription.contract.test.js`. Emenda aprovada, registrada como R-001 aqui e R-011 no plano da 001.

## Stubs criados

- `src/post-transcription-providers/deepgram.js`: exporta `transcribeWithDeepgram`, que lança `not implemented` (T011 o substitui). O resto do código **não o importa ainda**; é o `index.js` (T012) que o liga.

## Armadilhas já mapeadas

- `start()` sem `provider` tem de continuar igual à 001 (DI-006): o contrato da 001 chama sem `provider` e não pode ser editado.
- O cliente **não** lê `chrome.storage` (DI-004); `recorder.js` resolve a chave. O contrato 1 compara `options.body` por **identidade** com o `Blob` e lê `options.headers.Authorization` / `['Content-Type']` como objeto simples: não use `FormData` nem `Headers`.
- O contrato 4 simula 3 GB com `Object.defineProperty(media, 'size', ...)`; o limite compara `audio.size >= maxBytes` **antes** de qualquer `fetch`.
- O contrato 5 serializa o erro inteiro (`message`, `JSON.stringify`, `stack`) e exige que a chave não apareça: nada de chave em `cause`, `details` ou mensagem.
- `Object.hasOwn(PROVIDERS, id)` em vez de `id in PROVIDERS` (evita `toString`/`__proto__`).
- A interface tem "ElevenLabs" fixo em `postMessages`, no aviso de `#post-panel`, em `label[for=import-file]` e em `#post-key-status`; troque todas (R-003) e confirme com busca textual.
- `resetPostSession()` roda ao iniciar gravação, descartar e importar arquivo; o provedor escolhido deve ficar no seletor/storage, não na sessão (R-006).
- Jest hoje ignora `/e2e/` e `/integration/` via `testPathIgnorePatterns`; ao mover (T007) mantenha e2e e integração fora do `npm test`. `tests/e2e/helpers.cjs` usa `root = path.resolve(__dirname, '..')`; passa a precisar de dois níveis. `run.mjs` e `playwright.config.cjs` também. `PLAYWRIGHT_BROWSERS_PATH` aponta para `.playwright-browsers` na raiz.
- `manifest.json` **não muda**: `https://api.deepgram.com/*` já está nos `host_permissions`.
- O e2e de captura (`capture.spec.cjs`) exige gravações de pelo menos 1,5 s, senão sai "Gravação vazia".
- Docs históricas da 001 citam caminhos antigos (`src/*.test.js`, `e2e/`); são registro, deixe como estão.

## Pendências do Analyze

- **A-01 (MEDIUM)** FR-012 (ao vivo inalterado) não tem task própria: o e2e de captura com Deepgram ao vivo (`capture.spec.cjs`) já o cobre; recomendação: citar isso no Registro da Fase 3 ao mover o spec.
- **A-02 (LOW)** `npm test` fica vermelho (5 contratos) entre a Fase 1 e a Fase 3: documentado em T001 e `plan.md` (Cuidados). Recomendação: comparar contagens, não "verde/vermelho".
- **A-03 (LOW)** Premissas do Deepgram em arquivo (formatos, `pt-BR`, 402, limite 2 GB) não verificadas: R-002 e quickstart §4. Recomendação: executar com chave real ao final.
- **A-04 (LOW)** US3 (P3) sem teste de contrato por escolha de orçamento; coberta por e2e (T025).

## Gate de pronto

- Contratos 5/5 verdes e as duas travas (002 e 001) íntegras.
- `npm test` (76 + novos testes, todos verdes), `npm run build` sem erro, `npm run test:e2e` (31 + novos) verdes.
- Nenhum `*.test.*`, `*.spec.*` ou fixture fora de `tests/`.
- Docs no Polish: `README.md`, `CLAUDE.md`, nota na ADR-001, `.planning/backlog.md`.
- A passada em Chrome real, com chaves reais e seletor nativo, é **recomendação**, não gate: registre como pendência declarada (Princípio IV) se não for feita.
