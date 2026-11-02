---
description: "Tasks da feature 003-dividir-gravacoes-longas"
---

# Tasks: Divisão automática de gravações longas em partes

**Input**: `sdd/specs/003-dividir-gravacoes-longas/` (`spec.md`, `plan.md`, `research.md`, `logic/split-recorder.md`, `logic/parts-ui.md`)

**Prerequisites**: `plan.md`, `spec.md`, `contract-tests.lock` (5 contratos travados). A feature 002 já está implementada.

**Organization**: a Fase 2 entrega os módulos testáveis (gravador em partes, limite e nomes, guarda por parte) e deixa os 5 contratos verdes; a Fase 3 liga tudo em `recorder.js` (US1); a Fase 4 completa a entrega e a transcrição por parte (US2); a Fase 5 liga a recuperação (US3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 a US3, ou `[Shared]`

## Path Conventions

- Módulos em `src/` (`split-recorder.js`, `recording-parts.js`, `webm-duration.js`, `recovery-store.js`); interface em `recorder.html` e `src/recorder.js`.
- Testes em `tests/unit/` (Jest) e `tests/e2e/` (Playwright, `helpers.cjs` e `CAPTURE_ARGS`); o limite reduzido em e2e vem de `?partLimitBytes=N` na URL.

## Phase 1: Setup

**Purpose**: registrar o ponto de partida antes de mexer no código.

- [X] T001 [Shared] Rodar e anotar: `npm test` (esperado: 106 verdes e 5 vermelhos do contrato novo), `npm run build`, `npm run test:e2e` (esperado: 45/45) e `check-contract-tests.ps1` para os slugs `001-transcricao-pos-gravacao`, `002-escolha-provedor-transcricao` e `003-dividir-gravacoes-longas` (todos íntegros). Essas contagens são a referência de SC-003.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T001, baseline antes de mexer no código.
- Contrato: 003: 5 contratos íntegros e vermelhos; 002 e 001: travas íntegras.
- Testes executados: `npm test` → 106 verdes e 5 vermelhos (contratos 003); `npm run build` ok; `npm run test:e2e` → 45/45.
- Pendências: Nenhuma.

---

## Phase 2: Foundational — Módulos de divisão, nomes e guarda por parte

**Purpose**: gravador em partes, limite, nomes e guarda por parte, testáveis sem navegador. Bloqueia as histórias.

**⚠️ CRITICAL**: nenhuma história começa antes dos 5 contratos ficarem verdes. Não editar `tests/unit/split-recording.contract.test.js` nem as travas das features 001 e 002.

### Contrato da Fase

- `US1/AC1 FR-001 FR-002: ao atingir o limite fecha a parte...`
- `US1/AC3 FR-002: pausa e retomada na divisão...`
- `FR-011 SC-006: falha ao abrir a nova parte...`
- `US1/AC4 FR-004 SC-003: sem divisão há uma parte; nomes ordenáveis...`
- `US3/AC1-3 FR-008 FR-009 SC-004: recuperação devolve as partes na ordem...`
- Comando: `npx jest tests/unit/split-recording.contract.test.js` → 5/5 verdes

### Implementation

- [X] T002 [P] [Shared] Implementar `resolvePartLimit` e `partFileName` em `src/recording-parts.js` (substitui os stubs; manter `PART_LIMIT_BYTES`), conforme `logic/split-recorder.md` → contrato: `sem divisão há uma parte; nomes ordenáveis...`
- [X] T003 [P] [US3] Em `src/recovery-store.js`: `appendChunk(blob, part = 1)` grava `{ part, blob }`; `loadSession()` lê `Blob` solto (parte 1) e `{ part, blob }` e devolve `{ meta, blob, parts }`; `markPartDownloaded(part)` apaga os pedaços da parte e, se não sobrar nenhum, os metadados; sem mudar a versão do banco → contrato: `recuperação devolve as partes na ordem...`
- [X] T004 [US1] Implementar `createSplitRecorder` em `src/split-recorder.js` (substitui o stub): contagem de bytes, rotação sequencial, falha ao abrir a próxima parte, `stop()` idempotente e esperando a rotação, parte vazia descartada, `onChunk`/`onPartClosed`/`onError`, conforme as 8 regras de `logic/split-recorder.md` → contrato: `ao atingir o limite...`, `pausa e retomada...`, `falha ao abrir a nova parte...`, `sem divisão há uma parte...`
- [X] T005 [P] [Shared] Criar `src/webm-duration.js` com `readDuration(blob)` (mediabunny: `getDurationFromMetadata`, reserva `computeDuration`; devolve segundos ou `null` em falha).

### Testes da Fase

- [X] T006 [P] [US1] `tests/unit/split-recorder.test.js`: três rotações seguidas; `stop()` chamado durante a rotação e chamado duas vezes; parte de 0 bytes descartada sem buraco de índice; `data.size === 0` ignorado; `onChunk` recebe a parte certa; erro em `onPartClosed` não derruba a gravação.
- [X] T007 [P] [Shared] `tests/unit/recording-parts.test.js` (bordas de `resolvePartLimit` e `partFileName`) e `tests/unit/webm-duration.test.js` com as fixtures de `tests/fixtures/`.
- [X] T008 [P] [US3] Acrescentar em `tests/unit/recovery-store.test.js`: gravações legadas (`Blob` solto) continuam recuperáveis; várias partes em ordem; `markPartDownloaded` de parte inexistente não falha.

**Critério de Conclusão**: `npx jest tests/unit/split-recording.contract.test.js` → 5/5 verdes e `check-contract-tests.ps1 -Slug 003-dividir-gravacoes-longas` íntegro; `npm test` verde (106 anteriores + 5 contratos + testes novos); `npm run build` sem erro; trava das features 001 e 002 íntegras.

**Checkpoint**: módulos prontos; nenhuma mudança na interface ainda.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T002 `resolvePartLimit` e `partFileName` em `src/recording-parts.js`; T003 `recovery-store` com parte por pedaço, leitura de `Blob` legado, `loadSession().parts` e `markPartDownloaded`; T004 `createSplitRecorder` em `src/split-recorder.js` (rotação sequencial, falha ao abrir, `stop()` idempotente e esperando a rotação, parte vazia descartada, pausa pedida durante a troca vale para a parte nova); T005 `src/webm-duration.js`; testes T006 a T008 (16 novos).
- Contrato: `npx jest tests/unit/split-recording.contract.test.js` → 5/5 verdes; trava 003 íntegra; trava 002 e 001 íntegras.
- Testes executados: `npm test` (suíte unitária) → 127/127 (106 anteriores + 5 contratos + 16 novos); `npm run build` ok.
- Pendências: Nenhuma.

---

## Phase 3: User Story 1 - Gravar sem se preocupar com o tamanho (Priority: P1) 🎯 MVP

**Objetivo**: a gravação se divide sozinha e entrega as partes na tela final.

**Independent Test**: com `?partLimitBytes` reduzido, gravar até a divisão, parar e baixar cada parte, conferindo duração, avanço no player e soma de tempo.

### Implementation

- [X] T009 [US1] Em `src/recorder.js`, trocar o `MediaRecorder` único por `createSplitRecorder` (início, `limitBytes: resolvePartLimit(location.search)`, pausa/retomada, `doStop`, evento `ended`, guarda de saída), removendo as variáveis `mediaRecorder` e `chunks`; ver `logic/parts-ui.md`.
- [X] T010 [US1] Em `src/recorder.js`: fila serial de remux por parte (`finalizeWebm`), duração por `readDuration`, `handleSplitError` (mensagem e preservação das partes) e os dois caminhos de `doStop`: uma parte idêntica a hoje (DI-004) e duas ou mais partes com `parts[]`.
- [X] T011 [US1] Em `recorder.html`/`src/recorder.js`: `#part-indicator` na tela de gravação (visível só da parte 2 em diante) e `#parts-block`/`#parts-list` na tela final com nome, duração, tamanho e **Baixar** por parte (marca baixada, `recovery.markPartDownloaded`, `markSaved()` quando todas), escondendo `#btn-dl`/`#btn-dl-mp3` quando há várias partes.
- [X] T012 [US1] Em `src/recorder.js`, ligar `onChunk` a `recovery.appendChunk(blob, part)` e manter `startSession` por gravação; falha ao guardar encerra com mensagem (FR-011).

### Testes da Fase

- [X] T013 [US1] `tests/e2e/parts.spec.cjs` (captura simulada, `?partLimitBytes=300000`): gravar até pelo menos 2 partes; a lista aparece com nomes `_parte-NN.webm`; cada parte baixada abre com duração e vídeo/áudio (mediabunny); soma das durações dentro de 1 s por troca do tempo gravado; cronômetro sem reinício; indicador de parte visível só com divisão.
- [X] T014 [US1] `tests/e2e/parts.spec.cjs`: pausa atravessando uma divisão; "Parar compartilhamento" (`ended`) logo depois de uma divisão; `Parar` imediatamente após uma divisão (parte vazia descartada); gravação curta de uma parte com tela e nome idênticos aos de hoje, sem `#parts-block`.

**Critério de Conclusão**: contratos continuam 5/5 e as três travas íntegras; testes da fase verdes; `npm run build` sem erro; os testes e2e existentes de gravação passam sem alteração (SC-003).

**Checkpoint**: US1 funcional com baixar por parte.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T009 `recorder.js` usa `createSplitRecorder` (início com `resolvePartLimit(location.search)`, pausa/retomada, `doStop` assíncrono que só para as faixas depois do último pedaço, `ended`, guarda de saída); T010 fila serial de remux por parte, duração por `readDuration`, `handleSplitError`, `completeRecording` com o caminho de uma parte idêntico ao anterior; T011 `#part-indicator` e `#parts-block`/`#parts-list` com Baixar por parte (`recovery.markPartDownloaded`); T012 `onChunk` → `recovery.appendChunk(blob, part)`. Descoberta durante a fase (corrigida em `split-recorder.js`, com 2 testes novos): o recorder encerrado pelo próprio navegador (ex.: "Parar compartilhamento") entrega o último pedaço depois de já estar `inactive`, então `closePart` passou a registrar o `onstop` na criação, sempre esperá-lo e ter um prazo de segurança (`stopTimeoutMs`, 5 s).
- Contrato: `npx jest tests/unit/split-recording.contract.test.js` → 5/5 verdes; trava 003 íntegra; trava 002 e 001 íntegras.
- Testes executados: `npm test` → 129/129 (127 + 2); `npm run build` ok; `npm run test:e2e` → 52/52 (45 anteriores sem alteração + 7 em `parts.spec.cjs`). Um e2e falhou uma vez por asserção errada do próprio teste (parte final pequena aparece como `0.0 MB`) e foi corrigido no teste; passou 2 vezes seguidas depois.
- Pendências: Lacuna real e memória com partes de 1,4 GB seguem pendentes de Chrome real (R-001, R-003, R-004). MP3 do modo áudio só existe em gravações de uma parte (R-006).

---

## Phase 4: User Story 2 - Baixar e transcrever cada parte (Priority: P1)

**Objetivo**: Baixar todas e transcrição por parte, sem misturar resultados.

**Independent Test**: com duas ou mais partes, baixar todas e transcrever duas partes com provedores diferentes, conferindo texto e SRT de cada uma.

### Implementation

- [X] T015 [US2] **Baixar todas** (`#btn-dl-all`) em `recorder.html`/`src/recorder.js`: percorre as partes em ordem, uma por vez, com pausa curta, sem renomear nem recodificar.
- [X] T016 [US2] Sessão de transcrição por parte em `src/recorder.js`: `ensurePartSession`, `selectPart`, `#post-part-title`, botão **Transcrever** de cada item que seleciona a parte e abre o painel, `isAnyProcessing()` desabilitando o início em outras partes, indicador "Transcrito por …" na lista.
- [X] T017 [US2] Bloco `#live-block` com a transcrição ao vivo da gravação inteira e **Baixar .txt**, sem SRT, só em gravações de várias partes; com uma parte, a transcrição ao vivo continua indo para a sessão como hoje.
- [X] T018 [US2] `resetPostSession`, descartar, nova gravação e importar arquivo cancelam e esvaziam todas as sessões e escondem `#parts-block` e `#live-block`.

### Testes da Fase

- [X] T019 [US2] `tests/e2e/parts.spec.cjs` (rede simulada dos dois provedores): transcrever a parte 1 com ElevenLabs e a parte 2 com Deepgram, cada uma com o seu texto e provedor; durante uma transcrição as outras partes não iniciam outra, mas baixam; **Baixar todas** baixa as partes na ordem com os nomes `_parte-NN.webm`; bloco ao vivo só com TXT; descartar limpa tudo.

**Critério de Conclusão**: contratos 5/5 e travas das três features íntegras; testes da fase verdes; uma parte continua sem lista.

**Checkpoint**: US2 funcional.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T015 `#btn-dl-all` (Baixar todas, uma por vez, na ordem, pausa de 400 ms); T016 sessão de transcrição por parte (`partSessions`, `ensurePartSession`, `selectPart`, `#post-part-title`, botão Transcrever que seleciona a parte, indicador "transcrito por …" e "transcrevendo…" na lista, `isOtherProcessing()` desabilitando o início em outra parte); TXT e SRT com o nome da parte selecionada; T017 `#live-block` com a transcrição ao vivo da gravação inteira e só TXT; T018 `resetPostSession` cancela e esvazia todas as sessões e esconde lista e bloco ao vivo.
- Contrato: `npx jest tests/unit/split-recording.contract.test.js` → 5/5 verdes; trava 003 íntegra; trava 002 e 001 íntegras.
- Testes executados: `npm test` → 129/129; `npm run build` ok; `npm run test:e2e` → 56/56 (52 + 4 novos em `parts.spec.cjs`). Um e2e (bloco ao vivo) falhou uma vez porque o teste parava logo após o indicador "Parte 2" e a parte 2 ainda estava vazia (descartada, sobrava uma parte só); corrigido no teste (espera de 1,5 s) e passou 3 vezes seguidas.
- Pendências: Nenhuma além das pendências de Chrome real (R-001, R-003, R-004, R-005).

---

## Phase 5: User Story 3 - Não perder partes se a janela cair (Priority: P2)

**Objetivo**: a recuperação oferece todas as partes não baixadas.

**Independent Test**: gravar até haver partes fechadas, fechar a janela sem baixar e reabrir; recuperar, baixar uma parte, recarregar e conferir que ela não volta.

### Implementation

- [X] T020 [US3] Em `src/recorder.js` (`offerRecovery`/`restoreRecording`): usar `loadSession().parts`; mensagem com o número de partes e tamanho total; remux serial de cada parte; lista com nomes `gravacao-…_recuperada_…_parte-NN.webm`; uma parte recuperada segue o caminho de hoje; descartar ou baixar tudo limpa a cópia; iniciar nova gravação avisa que as partes serão descartadas.

### Testes da Fase

- [X] T021 [US3] `tests/e2e/parts.spec.cjs`: queda com 2 partes fechadas e uma em andamento → recuperar mostra as partes; baixar uma e recarregar → só as demais voltam; baixar todas → nada a recuperar; gravação legada de uma parte continua recuperável (como na feature de recuperação).

**Critério de Conclusão**: contratos 5/5 e travas íntegras; testes da fase verdes; teste e2e de recuperação existente continua verde.

**Checkpoint**: US3 funcional.

**Registro da Fase**:

- Status: Concluída (2026-11-02)
- Feito: T020 `offerRecovery` diz quantas partes foram encontradas; `restoreRecording` usa `loadSession().parts`, remuxa e lê a duração de uma parte por vez, nomeia `gravacao-…_recuperada_…_parte-NN.webm` e mantém o número original das partes (`totalParts()` = maior índice); uma parte de índice 1 segue o caminho de hoje, qualquer outro caso mostra a lista; baixar uma parte a remove da cópia local e baixar todas ou descartar limpa tudo.
- Contrato: `npx jest tests/unit/split-recording.contract.test.js` → 5/5 verdes; trava 003 íntegra; trava 002 e 001 íntegras.
- Testes executados: `npm test` → 129/129; `npm run build` ok; `npm run test:e2e` → 60/60 (56 + 4 novos de recuperação; os 2 e2e anteriores de recuperação de uma parte seguem verdes).
- Pendências: Queda real do Chrome (processo morto) não foi exercitada; o e2e fecha a página sem parar a gravação.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [Shared] Atualizar `README.md` (divisão em partes, tamanho aproximado por perfil, uso de disco, MP3 só em uma parte, "Baixar todas") e `CLAUDE.md` (módulos novos e o parâmetro de teste `?partLimitBytes`); linha em `.planning/backlog.md`.
- [X] T023 [Shared] Executar `quickstart.md`: o que depender do Chrome real, de captura nativa, de partes de 1,4 GB e de memória fica registrado como pendente em `qa-evidence.md` (criar), sem chamar de validado.
- [X] T024 [Shared] Busca final: nenhum `mediaRecorder`/`chunks` residual em `recorder.js`, nenhuma referência ao limite de teste fora de `resolvePartLimit`, chaves ausentes de logs e testes.

- [X] T025 [US1] (descoberta durante o QA do Polish) e2e do modo Só Áudio com divisão em `tests/e2e/parts.spec.cjs`: cada parte só áudio, sem MP3, nomes `gravacao-audio_…_parte-NN.webm`.

### Checklist de Release

- [X] Fase 2 (módulos e contratos) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato (5) todos verdes na suíte completa e `check-contract-tests.ps1` íntegro para 003, 002 e 001
- [X] `npm test` e `npm run test:e2e` executados e registrados; contagens anteriores preservadas (SC-003)
- [X] `npm run build` sem erro, sem editar `dist/`
- [X] Lacuna real, memória e disco com partes de 1,4 GB e "Baixar todas" no Chrome real verificados, ou pendências declaradas
- [X] `quickstart.md` executado

> **Nota (2026-11-02):** a execução do `quickstart.md` cobriu as checagens automatizadas e o Chromium simulado. O Chrome real, a captura nativa, o limite de 1,4 GB de verdade, memória e disco e o aviso de vários downloads **não** foram verificados e estão declarados como pendência em `qa-evidence.md` §4 (Princípio IV). O item "…ou pendências declaradas" foi fechado por essa declaração, não por validação real.

---

## Dependencies & Execution Order

- **Setup (Fase 1)** → **Foundational (Fase 2)** → **US1 (Fase 3)** → **US2 (Fase 4)** → **US3 (Fase 5)** → **Polish**.
- Fase 2: T002, T003 e T005 em paralelo; T004 usa só `createRecorder` injetado e não depende deles; os testes T006 a T008 depois das implementações.
- Fase 3: T009 antes de T010 a T012; T011 depende de T010 (a lista usa `parts[]`).
- Fases 4 e 5 editam `recorder.js` e `recorder.html`; seguir em ordem.

## Implementation Strategy

1. Baseline (Fase 1) e módulos com 5 contratos verdes (Fase 2).
2. US1 até gravar, dividir e baixar partes em e2e (MVP).
3. US2 (Baixar todas e transcrição por parte), US3 (recuperação) e Polish; validação real quando houver Chrome.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 7: Convergence

**Propósito**: lacunas achadas por `sdd-converge` em 2026-11-02. Nenhuma task acima foi alterada.

- [X] T026 [US1] Implementar a parte "guardar" de FR-011, que a T012 marcou como feita sem estar no código: quando um pedaço não puder ser gravado no IndexedDB **durante a gravação** (`appendChunk` rejeitado, por exemplo por falta de espaço), fechar a parte atual, encerrar a gravação com mensagem clara e preservar todas as partes já fechadas, como já ocorre na falha ao abrir a próxima parte (`handleSplitError`). Cobrir com e2e que simula a falha de escrita no IndexedDB (`addInitScript` com `IDBObjectStore.prototype.add` lançando) e confirma mensagem, partes fechadas disponíveis e nenhuma perda. **Decisão a confirmar com o proprietário antes de implementar**: se o IndexedDB já estiver indisponível **no início**, hoje a gravação segue sem cópia de segurança (conflito entre FR-011 e SC-003); recomendação: manter a gravação, mas mostrar um aviso visível na tela de gravação de que não há recuperação após queda (FR-011; SC-003; edge "falta de espaço"; plan: R-003).
- [X] T027 [US1] e2e em `tests/e2e/parts.spec.cjs`: com várias partes não baixadas, fechar a janela pede confirmação (`beforeunload`); depois de **Baixar todas**, fechar não pede (edge "fechar a janela com partes não baixadas").
- [ ] T028 [Shared] Executar no Chrome real o roteiro de `quickstart.md` §3 a §5 (lacuna com captura real, partes de 1,4 GB reais, memória e disco, tela estática, "Baixar todas" com o aviso de vários downloads, queda real do navegador) e registrar o resultado em `qa-evidence.md` (Constitution IV; SC-001, SC-002, SC-004; plan: R-001 a R-005).
  - Progresso (2026-11-02): o **Bloco B** (captura nativa em gravação de uma parte) foi validado pelo proprietário no Chrome real. **Faltam** os Blocos G (divisão, lacuna, "Baixar todas", tela estática, partes de 1,4 GB) e H (queda real).
- [X] T029 [Shared] Documentar no README o que a spec não cobre mas o app faz: TXT e SRT de uma parte levam o sufixo `_parte-NN` e o bloco ao vivo baixa `transcricao-ao-vivo_*.txt` (unrequested; spec: FR-013).

**Registro da Fase**:

- Status: Parcial (2026-11-02): T026, T027 e T029 concluídas; T028 (Chrome real) pendente por depender de captura e navegador reais.
- Feito: T026 `handleStorageFailure` em `src/recorder.js`: falha de escrita no IndexedDB durante a gravação encerra com mensagem e preserva as partes (que seguem na memória); sem armazenamento no início a gravação segue e a tela de gravação avisa que não há recuperação (decisão do proprietário, 2026-11-02); `interruptionReason` mostra o motivo na tela final. T027 e2e do aviso de saída com várias partes. T029 README com os nomes `_parte-NN` do TXT e SRT, o arquivo do bloco ao vivo e o comportamento ao falhar o armazenamento.
- Contrato: `npx jest tests/unit/split-recording.contract.test.js` → 5/5 verdes; trava 003, 002 e 001 íntegras.
- Testes executados: 3 e2e novos (falha ao guardar com partes preservadas, armazenamento indisponível no início, aviso de saída com várias partes). O teste da T026 falha com o comportamento antigo (só log) e passa com a correção, conferido por reversão temporária. `npm test` → 129/129; `npm run build` ok; `npm run test:e2e` → 64/64 (a primeira execução da suíte completa teve 1 falha, com duração de 14,6 min naquele teste, o que indica suspensão da máquina; o teste passou 3 vezes isolado, o arquivo inteiro passou 19/19 e uma nova suíte completa passou 64/64; ocorrência única registrada em `qa-evidence.md` §5).
- Pendências: T028; a ocorrência única descrita acima segue como observação aberta, não como baseline ok.
