---
description: "Tasks da feature 002-escolha-provedor-transcricao"
---

# Tasks: Escolha do provedor da transcrição pós-gravação

**Input**: `sdd/specs/002-escolha-provedor-transcricao/` (`spec.md`, `plan.md`, `research.md`, `logic/provider-adapter.md`)

**Prerequisites**: `plan.md`, `spec.md`, `contract-tests.lock` (5 contratos travados).

**Organization**: a reorganização dos testes (US4, P2) vem primeiro como fundação, para os testes novos nascerem em `tests/` e não serem movidos duas vezes; depois US1 (P1), US2 (P2) e US3 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 a US4, ou `[Shared]`

## Path Conventions

- Lógica de provedores em `src/post-transcription-providers/`; cliente e sessão em `src/post-transcription-client.js` e `src/post-transcription-session.js`.
- Interface em `recorder.html` e `src/recorder.js`; `manifest.json` não muda.
- Depois da Fase 2: testes unitários e de contrato em `tests/unit/` (espelhando `src/`), e2e em `tests/e2e/`, teste real em `tests/integration/`, mídias de teste em `tests/fixtures/`.

## Phase 1: Setup

**Purpose**: registrar o ponto de partida antes de mover qualquer arquivo.

- [X] T001 [Shared] Rodar e anotar no Registro da Fase: `npm test` (esperado: 76 verdes e 5 vermelhos do contrato novo), `npm run build`, `npm run test:e2e` (esperado: 31 verdes), `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` e `-Slug 002-escolha-provedor-transcricao` (ambos íntegros). Estas contagens são a referência de SC-006.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T001, baseline antes de mover arquivos.
- Contrato: 002: 5 contratos íntegros e vermelhos por asserção; 001: trava íntegra (5/5).
- Testes executados: `npm test` → 76 verdes e 5 vermelhos (contratos 002); `npm run build` ok; `npm run test:e2e` → 31/31; `check-contract-tests.ps1` 001 e 002 → íntegros.
- Pendências: Nenhuma.

---

## Phase 2: Foundational — Testes organizados em tests/ (US4, Priority: P2)

**Purpose**: mover todos os testes e fixtures para `tests/` sem alterar casos (FR-014 a FR-017, SC-006, SC-007).

**⚠️ CRITICAL**: bloqueia as fases seguintes. Só mudam linhas de caminho; nenhum caso é criado, removido ou reescrito. A única edição permitida em arquivo de contrato é a emenda R-001 (linhas de `import`).

- [X] T002 [US4] Criar `tests/unit`, `tests/e2e`, `tests/integration`, `tests/fixtures` e mover `src/fixtures/*` para `tests/fixtures/` com `git mv`.
- [X] T003 [P] [US4] Mover com `git mv` os testes unitários de `src/` para `tests/unit/` (mesmo nome; `src/utils/*.test.js` para `tests/unit/utils/`): `deepgram-live`, `mp3-encode`, `post-transcription-audio`, `post-transcription-client`, `post-transcription-session`, `recording-profile`, `recovery-store`, `subtitles`, `unload-guard`, `webm-finalize`, `utils/download`, `utils/timer`. Ajustar os `import` para `../../src/...` e a leitura de fixtures (`__dirname` → `../fixtures`). Não tocar no contrato da 001 aqui.
- [X] T004 [US4] Emenda R-001: `git mv src/post-transcription.contract.test.js tests/unit/post-transcription.contract.test.js`, trocar **somente** as linhas de `import` (para `../../src/...`), conferir por `git diff` que nada mais mudou, rodar `npx jest tests/unit/post-transcription.contract.test.js` (5 verdes) e regravar a trava: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao -Write -Paths tests/unit/post-transcription.contract.test.js`, depois conferir `PASS` sem `-Write`.
- [X] T005 [US4] Mover `e2e/*` para `tests/e2e/` (`git mv`): ajustar `root` em `helpers.cjs` (`path.resolve(__dirname, '..', '..')`), caminhos de fixtures nos specs (`tests/fixtures`), `testDir` em `playwright.config.cjs` e o `root` de `run.mjs` (dois níveis acima).
- [X] T006 [P] [US4] Mover `integration/elevenlabs-live.test.mjs` para `tests/integration/` e ajustar imports relativos e caminho de fixtures, se houver.
- [X] T007 [US4] Atualizar `package.json`: scripts `test:e2e*` e `test:elevenlabs:*` para os novos caminhos, `jest` com `roots`/`testMatch` apontando só para `tests/unit` e `testPathIgnorePatterns` coerente (e2e e integration continuam fora do `npm test`).
- [X] T008 [US4] Atualizar `README.md` (árvore do projeto e comandos de teste), `CLAUDE.md` (menções a `e2e/`, `src/*.test.js`) e `.gitignore` se necessário.

### Testes da Fase

- [X] T009 [US4] Verificar e registrar: `npm test` com os mesmos 76 casos verdes (+5 contratos novos ainda vermelhos), `npm run build` sem erro, `npm run test:e2e` com os mesmos 31 verdes, `check-contract-tests.ps1` íntegro para 001 (novo caminho) e 002, e busca sem nenhum `*.test.*`/`*.spec.*`/fixture fora de `tests/`: `git ls-files | grep -E "\.(test|spec)\.|fixtures/" | grep -v "^tests/"` (vazio).

**Critério de Conclusão**: `npm test` → 76 verdes e 5 vermelhos esperados (os contratos 002); `npm run test:e2e` → 31/31; `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` e `-Slug 002-escolha-provedor-transcricao` → íntegros; nenhum arquivo de teste ou fixture fora de `tests/`; `dist/` sem testes. O `git diff -M` do contrato da 001 mostra só `import`.

**Checkpoint**: estrutura nova estável; nenhuma regressão.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T002 a T009: `src/fixtures` → `tests/fixtures`; 12 testes unitários e o contrato da 001 → `tests/unit` (utils em `tests/unit/utils`); `e2e/` → `tests/e2e`; `integration/` → `tests/integration`; `package.json` (scripts e `testMatch` em `tests/unit`), `playwright.config.cjs` (`testDir`), `helpers.cjs`/`run.mjs` (raiz a dois níveis), README e CLAUDE.md.
- Contrato: `npx jest tests/unit/post-transcription.contract.test.js` → 5/5 verdes; emenda R-001/R-011: `git diff` mostrou só 2 linhas de `import`; trava da 001 regravada com `-Write -Paths tests/unit/post-transcription.contract.test.js` e conferida íntegra; trava da 002 íntegra.
- Testes executados: `npm test` → 76 verdes + 5 contratos 002 vermelhos (igual ao baseline); `npm run build` ok; `npm run test:e2e` → 31/31; busca de `*.test.*`/`*.spec.*`/fixtures fora de `tests/` → vazia.
- Pendências: `tests/integration/elevenlabs-live.test.mjs` teve só os caminhos ajustados e não foi executado (exige chave real e rede).

---

## Phase 3: User Story 1 - Transcrever com o provedor escolhido (Priority: P1) 🎯 MVP

**Objetivo**: escolher ElevenLabs ou Deepgram na tela final e transcrever com o escolhido, com aviso, chave e erros corretos.

**Independent Test**: com resposta simulada, escolher Deepgram, transcrever e baixar TXT/SRT; repetir com ElevenLabs; sem chave do provedor, ver a orientação sem envio.

### Contrato da Fase

- `Deepgram recebe só o áudio com a chave dele...` — US1/AC1, FR-006
- `Cada provedor só fala com o próprio serviço` — US1/AC4, FR-002, Constitution II
- `O limite de tamanho depende do provedor...` — FR-011
- `Erro do Deepgram é classificado e não vaza a chave` — FR-009, FR-013
- Comando: `npx jest tests/unit/post-provider-choice.contract.test.js` (os 4 acima verdes; o da sessão fica para a Fase 4)

### Implementation

- [X] T010 [P] [US1] Criar `src/post-transcription-providers/timed-words.js` com `summarizeTiming(words)` (`{ segments, timingInfo }` a partir de `{ start, end, text }`), extraído da lógica atual de `elevenlabs.js`; fazer `elevenlabs.js` usá-lo sem mudar seu comportamento (testes existentes seguem verdes). Ver `logic/provider-adapter.md`.
- [X] T011 [US1] Implementar `transcribeWithDeepgram` em `src/post-transcription-providers/deepgram.js` (substitui o stub): URL com `model=nova-3`, `language`, `punctuate`, `smart_format`; `Authorization: Token`; corpo `audio.blob`; timeout/abort; resposta `results.channels[0].alternatives[0]`; erros conforme `research.md` §5 incluindo `PAYMENT_REQUIRED` → contrato: `Deepgram recebe só o áudio...`, `Erro do Deepgram é classificado...`
- [X] T012 [US1] Criar `src/post-transcription-providers/index.js` com `PROVIDERS`, `DEFAULT_PROVIDER` e `isProvider` (ver `logic/provider-adapter.md`), com `maxBytes` por provedor.
- [X] T013 [US1] Em `src/post-transcription-client.js`, aceitar `provider` (padrão `DEFAULT_PROVIDER`), validar (`INVALID_PROVIDER`), checar o limite do provedor antes do envio e despachar para o adaptador do registro, repassando `fetchImpl`; remover a constante `MAX_AUDIO_BYTES` local → contrato: `Cada provedor só fala com o próprio serviço`, `O limite de tamanho depende do provedor...`
- [X] T014 [US1] Em `recorder.html`, adicionar `#post-provider` (ElevenLabs/Deepgram) ao painel `#post-panel`, junto do idioma, e `#post-notice` no lugar do texto fixo "somente o áudio será enviado à ElevenLabs"; ajustar as mensagens de importação (`label[for=import-file]`) que citam ElevenLabs.
- [X] T015 [US1] Em `src/recorder.js`: `getProviderKey(provider)` (usa `PROVIDERS[...].keyStorage`), aviso e dicas montados com o rótulo do provedor escolhido, `postMessages` como função do rótulo (incluindo `PAYMENT_REQUIRED` e o limite do provedor em `AUDIO_TOO_LARGE`), `post-start` enviando `provider` ao `postSession.start`, e `renderPostState` desabilitando `#post-provider` em `processing`. A mensagem de chave ausente cita o provedor escolhido e ⚙ Configurações, sem oferecer o outro. Buscar por "ElevenLabs" restante em `recorder.js` e `recorder.html` (R-003).
- [X] T016 [US1] Em `recorder.js`, ajustar `resetPostSession()` para o `transcribe` da sessão chamar `transcribePreRecorded` com `provider` e a chave do provedor recebido (DI-004, R-006).

### Testes da Fase

- [X] T017 [P] [US1] `tests/unit/post-transcription-providers/deepgram.test.js`: resposta normal, `punctuated_word` ausente, tempos ausentes/inválidos (`timingInfo`), resposta sem `results`, 400/401/402/413/429/408/504/5xx, falha de rede, timeout, cancelamento, e que a chave nunca aparece no erro.
- [X] T018 [P] [US1] `tests/unit/post-transcription-providers/index.test.js`: `isProvider` rejeita `toString`/`__proto__`; limites e rótulos; `timed-words.test.js` com os mesmos casos de contagem da ElevenLabs.
- [X] T019 [US1] `tests/e2e/providers.spec.cjs` (Chromium, rede simulada): escolher Deepgram e conferir `POST` a `api.deepgram.com/v1/listen` com `Authorization: Token`, corpo só de áudio e nenhuma requisição à ElevenLabs; escolher ElevenLabs e conferir o inverso; aviso de envio troca de serviço com o seletor; chave ausente por provedor mostra a orientação e não envia; seletor desabilitado durante o processamento; erro 401 do Deepgram cita Deepgram.

**Critério de Conclusão**: `npx jest tests/unit/post-provider-choice.contract.test.js` → 4/5 verdes (o da sessão, Fase 4, ainda vermelho) e `check-contract-tests.ps1 -Slug 002-escolha-provedor-transcricao` íntegro; testes da fase verdes; `npm run build` sem erro; nenhuma menção fixa a "ElevenLabs" onde o provedor é variável.

**Checkpoint**: US1 funcional com resposta simulada.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T010 `timed-words.js` (usado também por `elevenlabs.js`); T011 `deepgram.js`; T012 `index.js` (registro com rótulo, chave, limite, adaptador); T013 cliente com `provider`, `INVALID_PROVIDER` e limite por provedor; T014 `recorder.html` (`#post-provider`, `#post-notice`, `#post-key-hint`, textos de Configurações e importação); T015/T016 `recorder.js` (`postMessages(provider)`, `getProviderKey`, aviso dinâmico, seletor desabilitado em `processing`, `PAYMENT_REQUIRED` e `INVALID_RESPONSE`); testes T017 a T019. Desvio: a sessão (T020, Fase 4) foi adiantada porque a UI precisa que `start({ provider })` repasse o provedor ao `transcribe` e o grave no resultado.
- Contrato: `npx jest tests/unit/post-provider-choice.contract.test.js` → 5/5 verdes (4 da US1 + o da sessão, que passou com a T020 adiantada); trava 002 íntegra; trava 001 íntegra.
- Testes executados: `npm test` → 102/102 (76 anteriores + 5 contratos + 21 novos: deepgram, index, timed-words); `npm run build` ok; `npm run test:e2e` → 41/41 (31 anteriores + 10 em `providers.spec.cjs`); o teste do seletor falhou uma vez por expectativa errada (estado "aguardando resposta") e foi corrigido no teste.
- Pendências: FR-012 (ao vivo inalterado): coberto pelo e2e de captura com Deepgram ao vivo, que continua verde (A-01). Deepgram real não verificado (R-002).

---

## Phase 4: User Story 2 - Retranscrever com outro provedor (Priority: P2)

**Objetivo**: registrar o provedor no resultado, mostrar quem gerou o texto e preservar o anterior em retranscrições.

**Independent Test**: transcrever com um provedor, trocar o seletor, transcrever de novo e conferir texto anterior preservado e rótulo do provedor.

### Contrato da Fase

- `Sessão repassa o provedor, o resultado o registra e uma falha preserva o anterior` — US2/AC1-3, FR-007, FR-008
- Comando: `npx jest tests/unit/post-provider-choice.contract.test.js` → 5/5 verdes

### Implementation

- [X] T020 [US2] Em `src/post-transcription-session.js`: `start({ provider })` (padrão `elevenlabs`), `INVALID_PROVIDER` antes de publicar `processing`, repasse de `provider` a `transcribe` e `transcript.provider` no sucesso; `setExistingTranscript` marca `provider: 'deepgram'`, `origin: 'live'` → contrato: `Sessão repassa o provedor...`
- [X] T021 [US2] Em `recorder.html`/`recorder.js`: mostrar "Transcrito por {rótulo} ({idioma})" no bloco do resultado (e "Transcrição ao vivo (Deepgram)" para `origin: 'live'`), sem alterar nomes nem conteúdo dos arquivos TXT/SRT.

### Testes da Fase

- [X] T022 [P] [US2] Acrescentar em `tests/unit/post-transcription-session.test.js`: provedor padrão sem `provider`, cancelamento durante nova tentativa de outro provedor preserva o resultado e o `provider` anteriores, resposta tardia de provedor cancelado é ignorada.
- [X] T023 [US2] Em `tests/e2e/providers.spec.cjs`: transcrever com ElevenLabs, trocar para Deepgram e transcrever de novo (texto anterior visível durante o processamento, substituído só ao concluir; rótulo muda), cancelamento e falha mantêm o anterior, erro do provedor escolhido não sugere o outro.

**Critério de Conclusão**: `npx jest tests/unit/post-provider-choice.contract.test.js` → 5/5 verdes e `check-contract-tests.ps1 -Slug 002-escolha-provedor-transcricao` íntegro; `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` íntegro; testes da fase verdes.

**Checkpoint**: US2 funcional; contratos todos verdes.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T020 (adiantada na Fase 3); T021 `#transcript-origin` com "Transcrito por {rótulo} ({idioma})" e "Transcrição ao vivo (Deepgram)"; T022 quatro testes novos de sessão; T023 dois e2e (retranscrição com outro provedor; cancelar/falhar preserva texto e provedor anteriores, e o erro não cita o outro serviço).
- Contrato: `npx jest tests/unit/post-provider-choice.contract.test.js` → 5/5 verdes; trava 002 íntegra; trava 001 íntegra.
- Testes executados: `npm test` → 106/106; `npm run build` ok; e2e `providers.spec.cjs` -g "retranscrever|cancelar ou falhar" → 2/2 (suíte completa roda no fechamento da Fase 5).
- Pendências: Nenhuma.

---

## Phase 5: User Story 3 - Lembrar a última escolha (Priority: P3)

**Objetivo**: o seletor começa no último provedor usado.

**Independent Test**: escolher Deepgram, recarregar a página e conferir o seletor; sem escolha prévia, ElevenLabs.

### Implementation

- [X] T024 [US3] Em `src/recorder.js`: ler `postProvider` de `chrome.storage.local` na inicialização (valor desconhecido → `DEFAULT_PROVIDER`), gravar a cada mudança do seletor e atualizar aviso e estado dos botões ao carregar.

### Testes da Fase

- [X] T025 [US3] Em `tests/e2e/providers.spec.cjs`: primeira abertura mostra ElevenLabs; escolher Deepgram, recarregar e conferir; valor inválido em storage cai em ElevenLabs.

**Critério de Conclusão**: testes da fase verdes; contratos continuam 5/5 e as duas travas íntegras.

**Checkpoint**: US3 funcional.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T024 `postProvider` em `chrome.storage.local`, lido na inicialização (valor desconhecido → ElevenLabs) e gravado a cada mudança; T025 e2e de persistência e valor inválido.
- Contrato: 5/5 verdes; trava 002 íntegra; trava 001 íntegra.
- Testes executados: `npm test` → 106/106; `npm run build` ok; e2e `-g "última escolha"` → 1/1; suíte completa na Polish: 45/45.
- Pendências: Nenhuma.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [Shared] `tests/e2e/capture.spec.cjs`: gravar com captura simulada, escolher Deepgram (rede simulada) e transcrever a gravação remuxada; conferir corpo só de áudio.
- [X] T027 [Shared] Atualizar `README.md` (escolha de provedor, estrutura `tests/`, comandos) e `CLAUDE.md`; anotar no `## Status` da `sdd/adr/ADR-001-...` que a feature 002 concretizou a seleção (ou propor `sdd-adr`); linha em `.planning/backlog.md`.
- [X] T028 [Shared] Executar `quickstart.md`: o que depender de chave real, Chrome real ou seletor nativo fica registrado como pendente em `qa-evidence.md` (criar se precisar), sem chamar de validado.
- [X] T029 [Shared] Busca final por "ElevenLabs"/"Deepgram" fixos em mensagens da interface e por chaves em logs, testes e relatórios.

### Checklist de Release

- [X] Fase 2 (US4, reorganização) concluída; contagens iguais às da T001
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato (5) todos verdes na suíte completa e `check-contract-tests.ps1` íntegro para 002 e 001
- [X] `npm test` e `npm run test:e2e` executados e registrados
- [X] `npm run build` sem erro, sem editar `dist/`
- [X] Extensão recarregada no Chrome e fluxo verificado, ou pendência declarada
- [X] Deepgram real, limite real e seletor nativo de captura verificados separadamente, ou pendências declaradas
- [X] `quickstart.md` executado

> **Nota (2026-11-02):** a execução do `quickstart.md` cobriu as checagens automatizadas e o Chromium simulado. O Chrome real, as chaves reais e o seletor nativo de captura **não** foram verificados e estão declarados como pendência em `qa-evidence.md` §3 (Princípio IV da constitution). Os itens marcados "ou pendência declarada" foram fechados por essa declaração, não por validação real.

---

## Dependencies & Execution Order

- **Setup (Fase 1)** → **Foundational (Fase 2)**, que bloqueia as demais → **US1 (Fase 3)** → **US2 (Fase 4)** (depende de `provider` já existir no cliente) → **US3 (Fase 5)** → **Polish**.
- Dentro da Fase 3: T010 e T012 em paralelo; T011 depende de T010; T013 depende de T011 e T012; T014 a T016 dependem de T013.
- US3 poderia rodar em paralelo com US2 depois de T015, mas ambas editam `recorder.js`; seguir em ordem.

## Implementation Strategy

1. Baseline (Fase 1), reorganização (Fase 2) e conferência de contagens.
2. US1 até os 4 contratos verdes; validar com resposta simulada (MVP).
3. US2 (contrato da sessão), US3 (preferência), Polish e validação real quando houver chave e Chrome.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 7: Convergence

**Propósito**: lacunas achadas por `sdd-converge` em 2026-11-02, depois da verificação real do Deepgram. Nenhuma task acima foi alterada. Não há mudança de código pendente; as três tasks são validações.

- [X] T030 [Shared] Executar o Deepgram real com mídia **com fala audível** nos formatos ainda não provados com fala: MP4 (AAC), MP3 e áudio WebM, em pt-BR, e uma fala curta em **inglês**; conferir texto, tempos por palavra e SRT, e registrar em `qa-evidence.md` §5, sem chave nem texto transcrito (SC-001; FR-005).
- [X] T031 [Shared] Fechar as incertezas de limite e erro do Deepgram: confirmar na documentação ou com a conta o código HTTP de créditos esgotados e o limite real de arquivo, testar um arquivo longo (vários minutos) para medir tempo e `TIMEOUT`, e conferir que a chave serve ao ao vivo e ao arquivo gravado; o que não puder ser exercitado fica registrado como limite aceito pelo proprietário em `qa-evidence.md` (FR-011; plan: R-002, R-007).
  - Progresso (2026-11-02): código 402 (`ASR_PAYMENT_REQUIRED`) confirmado na documentação e já mapeado para `PAYMENT_REQUIRED`; arquivo de 2,58 MB e 4,7 min transcrito em 1,3 s (HTTP 200); a mesma chave abriu o WebSocket ao vivo. **Fechada em 2026-11-02**: o proprietário aceitou o limite de 2 GB como documentado (não testável); registrado em `qa-evidence.md` §3.
- [X] T032 [Shared] Executar no Chrome real o roteiro do `quickstart.md` §3 (seletor nativo de captura, escolha do serviço, aviso, "Transcrito por …", retranscrição e persistência), com as chaves reais, e registrar o resultado em `qa-evidence.md` (Constitution IV; SC-002, SC-004, SC-005).
  - Progresso (2026-11-02): **Bloco B** do roteiro único (captura nativa, pausa, arquivo com duração, aviso de saída, "Parar compartilhamento") validado pelo proprietário no Chrome real. **Falta o Bloco D**: seletor de serviço, aviso de envio, "Transcrito por …", retranscrição e persistência com as chaves reais.
  - **Fechada em 2026-11-02 por risco aceito pelo proprietário, não por validação.** Foram validados no Chrome real o Bloco B (captura nativa) e o Bloco A; o seletor de serviço, o aviso de envio, "Transcrito por …", a retranscrição e a persistência foram cobertos por e2e e pelos testes reais de integração do Deepgram e da ElevenLabs, sem passada manual no Chrome real.
