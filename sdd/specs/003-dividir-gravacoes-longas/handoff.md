# Handoff: 003-dividir-gravacoes-longas

Resumo autossuficiente para o `sdd-execute`, escrito em 2026-11-02 pelo `sdd-plan`.

## Contexto

- Repositório `screen recorder`, branch `feature/indetect`. Extensão Chrome MV3 em JavaScript (Webpack 5, Jest 30, Playwright 1.64, `mediabunny`).
- Próximo comando: `/sdd-execute 003-dividir-gravacoes-longas`. Status no backlog: **Planejada**.
- Depende da feature 002 (implementada, só a T032 manual aberta). Arquivos que mudaram nesta sessão: `src/recovery-store.js` (stub `markPartDownloaded`), `src/recording-parts.js` e `src/split-recorder.js` (novos, stubs) e `tests/unit/split-recording.contract.test.js` (novo, travado).

## O que a feature entrega

- **US1 (P1)**: a gravação fecha a parte ao chegar em 1,4 GB e continua em outra, trocando de `MediaRecorder` sobre o **mesmo** `MediaStream`; cada parte é um `.webm` completo e remuxado.
- **US2 (P1)**: lista de partes na tela final com Baixar, Transcrever (uma sessão de transcrição por parte, feature 002), Baixar todas e bloco ao vivo só com TXT.
- **US3 (P2)**: a recuperação devolve todas as partes não baixadas.
- Decisões do usuário que contrariam a expectativa óbvia: **uma parte mantém a tela e o nome de hoje** (sem lista e sem sufixo); **o limite é fixo** (não configurável); **não há texto unificado** das partes; a transcrição ao vivo **não** vira SRT por parte.
- Decisão do plano sobre a spec: o limite real é **1,4 GB** (a spec diz "cerca de 1,5 GB") para a parte ficar abaixo do teto do remux; o **MP3** do modo áudio só existe com uma parte.

## Leitura obrigatória, em ordem

1. `sdd/specs/003-dividir-gravacoes-longas/spec.md` — 13 FR, 6 SC, 3 histórias.
2. `plan.md` — DI-001..DI-012, Constitution Check, riscos R-001..R-010.
3. `tasks.md` — 24 tasks em 6 fases, com o contrato da Fase 2.
4. `logic/split-recorder.md` — assinaturas e as 8 regras do gravador em partes, nomes, limite e a extensão do `recovery-store`.
5. `logic/parts-ui.md` — como `recorder.js` e `recorder.html` usam os módulos (estado, lista, sessões por parte).
6. `research.md` — a medição da troca (~0,09 s) e por que 1,4 GB.
7. `quickstart.md` — verificação manual e itens pendentes do Chrome real.
8. `.planning/memory/constitution.md` — princípios I a IV.

## Testes de contrato

- Arquivo travado: `tests/unit/split-recording.contract.test.js` (5 casos, todos na Fase 2). Comando: `npx jest tests/unit/split-recording.contract.test.js`. Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 003-dividir-gravacoes-longas`.
- Estão **vermelhos de propósito**: `npm test` mostra 5 falhas e 106 verdes (baseline, não regressão).
- Travas de **outras** features que esta pode quebrar: `001-transcricao-pos-gravacao` (`tests/unit/post-transcription.contract.test.js`) e `002-escolha-provedor-transcricao` (`tests/unit/post-provider-choice.contract.test.js`): mexer em `recorder.js` e na sessão exige conferir as duas.

## Stubs criados

- `src/split-recorder.js`: `createSplitRecorder` lança `not implemented` (T004).
- `src/recording-parts.js`: `PART_LIMIT_BYTES` é real (1_400_000_000); `resolvePartLimit` e `partFileName` lançam `not implemented` (T002).
- `src/recovery-store.js`: `markPartDownloaded` lança `not implemented` (T003); o resto do arquivo é o atual.

## Armadilhas já mapeadas

- **Não pare as faixas na troca de parte** (DI-003): `MediaRecorder.stop()` não as para, mas o `cleanup()` do `recorder.js` sim; só o chame no fim da gravação.
- **Troca sequencial**: iniciar o recorder novo só no `onstop` do antigo (DI-002); o `stop()` entrega o último pedaço **antes** do `onstop`, e esse pedaço pertence à parte antiga (o contrato 1 espera 130 bytes na parte 1).
- O contrato 5 chama `appendChunk(blob, part)` e lê `loadSession().parts`; mantenha `loadSession().blob` e o formato legado (`Blob` solto) porque `tests/unit/recovery-store.test.js` e as gravações já salvas dependem disso.
- `MAX_FINALIZE_BYTES` (1,5 GB) continua em `src/webm-finalize.js`; o contrato 4 exige `PART_LIMIT_BYTES` menor que ele. Não suba o limite.
- O e2e de captura exige gravações com mais de 1,5 s e a tela falsa gera ~60 a 150 KB/s; use `?partLimitBytes` entre 200 mil e 400 mil para dividir em poucos segundos. Mexer na tela real não é necessário (o Chromium gera frames sozinho).
- Gravar menos de ~1 s resulta em arquivo vazio (o `MediaRecorder` só emite dados após a primeira fatia); por isso partes vazias são descartadas (DI-011).
- `renderPostState`, `postSession` e `resetPostSession` são globais em `recorder.js`; ao criar sessões por parte, mantenha `postSession` apontando para a parte selecionada.
- `Object.hasOwn`/`URLSearchParams`/`structuredClone` estão disponíveis no Chromium alvo; o Jest roda em Node 22.
- Docs históricas citam caminhos antigos; deixe-as como estão.

## Pendências do Analyze

- **A-01 (MEDIUM)** O MP3 do modo áudio não está na spec para várias partes; o plano decidiu oferecer só `.webm` por parte (DI-009, R-006). Recomendação: aceitar, ou abrir uma emenda à spec se o MP3 por parte for desejado.
- **A-02 (MEDIUM)** A lacuna real e o uso de memória e disco com partes de 1,4 GB não podem ser provados aqui (R-001, R-003, R-004). Recomendação: declarar como pendência no QA e validar no Chrome real.
- **A-03 (LOW)** A spec fala em "cerca de 1,5 GB" e o plano usa 1,4 GB. Recomendação: aceitar (dentro dos 5% de SC-002) e manter a justificativa em `research.md` §2.
- **A-04 (LOW)** "Transcrever" por parte seleciona a parte e abre o painel; a transcrição começa no botão **Transcrever áudio** (dois cliques). Recomendação: aceitar, para manter o aviso de envio e o provedor visíveis antes do envio (Constitution II).
- **A-05 (LOW)** US2 (interface) não tem teste de contrato; é coberta por e2e (T019). Recomendação: aceitar.

## Gate de pronto

- Contratos 5/5 verdes e as três travas (003, 002, 001) íntegras.
- `npm test` (106 + novos, todos verdes), `npm run build` sem erro, `npm run test:e2e` (45 + novos) verdes; os e2e antigos de gravação passam sem alteração (SC-003).
- Docs no Polish: `README.md`, `CLAUDE.md`, `.planning/backlog.md`, `qa-evidence.md`.
- A passada no Chrome real (lacuna, memória, "Baixar todas") é **recomendação**, não gate: registre como pendência declarada (Princípio IV) se não for feita.
