# Implementation Plan: Divisão automática de gravações longas em partes

**Slug**: `003-dividir-gravacoes-longas` | **Date**: 2026-11-02 | **Spec**: `sdd/specs/003-dividir-gravacoes-longas/spec.md`

## Summary

Trocar o `MediaRecorder` único de `recorder.js` por um **gravador em partes** (`src/split-recorder.js`): ele conta os bytes que cada parte já recebeu e, ao alcançar `PART_LIMIT_BYTES` (1,4 GB, abaixo do teto de remux de 1,5 GB), para o recorder atual, espera o `onstop` e abre outro `MediaRecorder` sobre o **mesmo `MediaStream`**. A troca sequencial perde cerca de 0,09 s (medido, `research.md` §1). Cada parte é remuxada em fila serial, ganha duração lida do arquivo e vira um item da lista da tela final, com **Baixar**, **Transcrever** (uma sessão de transcrição por parte, reaproveitando a feature 002) e **Baixar todas**. Os pedaços são guardados em IndexedDB por parte, para a recuperação oferecer todas as partes depois de uma queda. Uma gravação de uma parte segue o caminho e a tela de hoje, sem lista nem sufixo (SC-003).

Desenho em `logic/split-recorder.md` (módulos, regras, recuperação) e `logic/parts-ui.md` (ligação em `recorder.js` e `recorder.html`).

## Technical Context

**Language/Version**: JavaScript (módulos ES) no Chrome Manifest V3; Babel via `babel-jest` nos testes.

**Primary Dependencies**: Webpack 5, `mediabunny` (remux e leitura de duração), Jest 30, Playwright 1.64, `fake-indexeddb`. Nenhuma dependência nova.

**Storage**: IndexedDB `recorder-recovery` (versão 1 mantida; valores de `chunks` passam a `{ part, blob }`, lendo também `Blob` solto); `chrome.storage.local` sem mudança. Partes e resultados na sessão.

**Testing**: Jest (unidade e contrato, com `MediaRecorder` falso e `fake-indexeddb`), Playwright com captura simulada (`tests/e2e/helpers.cjs`, `CAPTURE_ARGS`). Verificação no Chrome real e com partes de 1,4 GB permanece manual.

**Target Platform**: extensão Chrome Manifest V3.

**Performance Goals**: lacuna de no máximo 1 s por troca (spec FR-002); medida ~0,09 s. Remux de uma parte por vez.

**Constraints**: nenhuma permissão nova; `dist/` não se edita; a gravação de uma parte não pode mudar de comportamento; o limite de teste só pela URL.

**Scale/Scope**: gravações de horas (dezenas de partes); dois modos (vídeo e áudio); 1 a N partes.

## Decisões Invariantes

- **DI-001**: `PART_LIMIT_BYTES = 1_400_000_000`, sempre menor que `MAX_FINALIZE_BYTES` (1,5 GB). Toda parte cabe no remux e muito abaixo dos limites dos provedores.
- **DI-002**: a troca de parte é **sequencial**: o recorder novo só inicia depois do `onstop` do antigo. Nunca dois recorders gravando ao mesmo tempo (sem sobreposição).
- **DI-003**: o `MediaStream`, o `AudioContext` e as faixas **não** são parados nem recriados na troca; só o `MediaRecorder` muda. Parar as faixas só ocorre ao fim da gravação, como hoje.
- **DI-004**: uma gravação de uma parte percorre o mesmo caminho de hoje (`recordedBlob`, `postSession`, `#btn-dl`, MP3 no modo áudio, transcrição ao vivo na sessão), sem lista e sem sufixo no nome (SC-003).
- **DI-005**: o limite reduzido para testes vem **só** de `?partLimitBytes=N` na URL, validado por `resolvePartLimit`; nenhum controle na interface nem em `chrome.storage`.
- **DI-006**: o remux de partes roda em **fila serial**, uma parte por vez; a duração exibida vem do arquivo remuxado.
- **DI-007**: cada parte tem a **sua** sessão de transcrição; resultados nunca se misturam; só uma transcrição por vez em toda a janela (FR-007).
- **DI-008**: a transcrição ao vivo continua única e contínua; em gravações de várias partes aparece em um bloco próprio com TXT e **sem SRT**. Não vai para nenhuma sessão de parte.
- **DI-009**: o **MP3** do modo áudio só é oferecido em gravações de uma parte; por parte, o formato baixado é `.webm`.
- **DI-010**: nenhum download automático; "Baixar todas" só ocorre por clique e percorre as partes na ordem, sem renomear nem recodificar.
- **DI-011**: parte de 0 bytes é descartada em silêncio (não entra na lista nem consome índice); os índices ficam sequenciais.
- **DI-012**: o gravador em partes não conhece remux, IndexedDB, interface nem duração; recebe tudo por callbacks.

## Constitution Check

*GATE: avaliado antes e depois do design.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Contrato verificável por mudança | OK | OK | A spec define comportamento, aceite, fora de escopo, retenção (partes na sessão e na cópia local até baixar ou descartar), cancelamento e falha (FR-011). A troca entre qualidade e tamanho tem meta verificável: parte ≤ 1,4 GB e lacuna ≤ 1 s (SC-001, SC-002). O 1,4 GB (e não 1,5 GB) está justificado em `research.md` §2, dentro da tolerância de 5% da spec. Sem ampliar escopo. |
| II. Envio transparente e proteção de credenciais | OK | OK | Nenhum envio novo: a transcrição por parte reaproveita o aviso, o provedor e a chave da feature 002. A divisão não envia dados. |
| III. Plataforma e responsabilidades explícitas | OK | OK | Chrome MV3 mantido. Divisão em `src/split-recorder.js`, limite e nomes em `src/recording-parts.js`, guarda em `src/recovery-store.js`, interface em `recorder.js`/`recorder.html`. Sem permissão nova e sem duplicar responsabilidade entre janela, popup e service worker. `dist/` não é editado. |
| IV. Evidência proporcional ao comportamento | OK | OK | `npm test`, `npm run build` e e2e em cada fase. A lacuna e a memória com partes de 1,4 GB, a captura nativa e "Baixar todas" no Chrome real ficam **declaradas como pendentes de validação** (R-001, R-003, R-005), sem serem chamadas de validadas. |

Sem violações; `## Complexity Tracking` fica vazio. Nenhuma ADR contrariada (a ADR-001 trata de provedores, não de gravação).

## Project Structure

### Documentation (this feature)

```text
sdd/specs/003-dividir-gravacoes-longas/
├── spec.md
├── plan.md
├── research.md              # medição da troca de recorder, limite, guarda das partes
├── logic/
│   ├── split-recorder.md    # gravador em partes, nomes, limite e recuperação
│   └── parts-ui.md          # ligação em recorder.js e recorder.html
├── quickstart.md
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
src/
  split-recorder.js            # NOVO (stub): createSplitRecorder
  recording-parts.js           # NOVO (stub): PART_LIMIT_BYTES, resolvePartLimit, partFileName
  webm-duration.js             # NOVO: readDuration(blob) com mediabunny
  recovery-store.js            # + parte nos pedaços, markPartDownloaded, loadSession().parts
  recorder.js                  # usa o gravador em partes; fila de remux; lista; sessões por parte
  webm-finalize.js             # sem mudança (MAX_FINALIZE_BYTES continua 1,5 GB)
recorder.html                  # #part-indicator, #parts-block, #parts-list, #btn-dl-all, #post-part-title, #live-block
tests/
  unit/
    split-recording.contract.test.js   # travado (5 casos)
    split-recorder.test.js             # NOVO (complementar)
    recording-parts.test.js            # NOVO (complementar)
    webm-duration.test.js              # NOVO
    recovery-store.test.js             # + casos de partes e Blob legado
  e2e/
    parts.spec.cjs                     # NOVO: divisão, lista, downloads, transcrição por parte, recuperação
```

**Structure Decision**: a lógica de divisão e de nomes fica em módulos independentes da interface (testáveis com `MediaRecorder` falso), a guarda em `recovery-store.js` mantendo compatibilidade, e a interface em `recorder.js`/`recorder.html` sem criar arquivos novos de interface. Os testes seguem a estrutura `tests/` da feature 002.

## Complexity Tracking

Sem violações do Constitution Check.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
npm run build
npm test
npm run test:e2e
```

- **Unitário**: gravador em partes com recorder falso (rotação repetida, `stop()` durante a rotação, `stop()` repetido, parte vazia, falha ao abrir, dados de tamanho zero, `onChunk`); `recording-parts`; `webm-duration`; `recovery-store` (partes, `Blob` legado, `markPartDownloaded`).
- **E2E (Chromium, captura simulada, limite reduzido por URL)**: divisão em 2 ou mais partes, soma das durações sem lacuna acima da meta, partes abrindo com duração e avanço, pausa atravessando uma divisão, "Parar compartilhamento" durante a rotação, nome e tela de uma parte inalterados, lista e Baixar/Baixar todas, transcrição por parte com rede simulada (cada parte com o seu resultado, uma por vez), bloco ao vivo sem SRT, recuperação de várias partes e partes baixadas que não voltam.
- **Manual (quickstart)**: Chrome real, captura de tela e áudio reais, memória e disco com partes de 1,4 GB, "Baixar todas" com o aviso de vários downloads.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`: `tests/unit/split-recording.contract.test.js`

Comando: `npx jest tests/unit/split-recording.contract.test.js`

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 003-dividir-gravacoes-longas`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| Ao atingir o limite fecha a parte e continua em outra sem perder nem duplicar dados | US1/AC1, FR-001, FR-002 | Fase 2 | `Error: not implemented` em `createSplitRecorder` |
| Pausa e retomada na divisão não perdem dados e a nova parte nasce gravando | US1/AC3, FR-002 | Fase 2 | `Error: not implemented` em `createSplitRecorder` |
| Falha ao abrir a nova parte preserva as partes fechadas e encerra com erro | FR-011, SC-006 | Fase 2 | `Error: not implemented` em `createSplitRecorder` |
| Sem divisão há uma parte; nomes ordenáveis; limite abaixo do teto do remux e reduzível em teste | US1/AC4, FR-004, SC-003 | Fase 2 | `Error: not implemented` em `createSplitRecorder` |
| Recuperação devolve as partes na ordem e partes baixadas não voltam | US3/AC1-3, FR-008, FR-009, SC-004 | Fase 2 | asserção: `parts` indefinido (`[]` em vez de `[1, 2, 3]`) |

Os 5 casos falham pelo motivo esperado (conferido em 2026-11-02). Stubs criados pelo plan (ponto de partida, não travados): `src/split-recorder.js` (`createSplitRecorder` lança `not implemented`), `src/recording-parts.js` (`PART_LIMIT_BYTES` real; `resolvePartLimit` e `partFileName` lançam `not implemented`) e `markPartDownloaded` em `src/recovery-store.js` (lança `not implemented`). A US2 (lista, downloads, transcrição por parte) é interface e fica coberta por e2e, não por contrato.

## Estado Atual

| Área | Estado |
| --- | --- |
| Fases 1 a 6 | Concluídas. |
| Fase 7 (Convergência) | Parcial: T026, T027 e T029 feitas; T028 (Chrome real) pendente. |
| Contratos | 5/5 verdes; travas 003, 002 e 001 íntegras. |
| Gates | `npm test` 129/129; `npm run build` ok; `npm run test:e2e` 64/64. |
| Pendente | Chrome real, partes de 1,4 GB, memória/disco, tela estática, "Baixar todas" e queda real (qa-evidence §4; T028). |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A lacuna entre partes foi medida só com captura simulada (~0,09 s por troca). Com captura real a latência do `stop` pode ser maior. | Perda de conteúdo acima da meta de 1 s. | Risco aceito pelo proprietário (2026-11-02, sem validação no Chrome real; se ocorrer, abrir bugfix): Troca sequencial sem esperar remux (DI-002); e2e mede a soma das durações contra o tempo corrido; validar no Chrome real (quickstart §3). Se passar de 1 s, voltar ao plano para avaliar iniciar o recorder novo antes de parar o antigo, aceitando uma sobreposição mínima. |
| R-002 | Em tela estática o `MediaRecorder` só grava vídeo quando há frames: a parte nova pode ficar sem dados até haver mudança; observou-se "Gravação vazia" para gravações muito curtas. | Parte de 0 bytes ou muito curta logo após uma troca. | Risco aceito pelo proprietário (2026-11-02, sem validação no Chrome real; se ocorrer, abrir bugfix): Parte vazia é descartada em silêncio (DI-011); o índice não é consumido; documentado; e2e cobre `stop()` logo após uma troca. |
| R-003 | Os pedaços de uma parte ficam em memória (`Blob`) e em IndexedDB até ser baixada; uma gravação longa ocupa muito disco e o navegador pode limitar o armazenamento. | Falha ao guardar, perda da recuperação. | Risco aceito pelo proprietário (2026-11-02, sem validação no Chrome real; se ocorrer, abrir bugfix): FR-011: falha ao guardar encerra a gravação com mensagem e preserva as partes fechadas; as partes baixadas saem do IndexedDB; documentar o uso de disco no README; validar com partes grandes no Chrome real. |
| R-004 | O remux de uma parte de 1,4 GB cria uma cópia em memória enquanto a gravação continua. | Pico de memória, aba lenta ou encerrada. | Risco aceito pelo proprietário (2026-11-02, sem validação no Chrome real; se ocorrer, abrir bugfix): Fila serial (DI-006), limite 1,4 GB abaixo do teto do remux; `finalizeWebm` já devolve o original em qualquer falha; validar memória no Chrome real. |
| R-005 | "Baixar todas" dispara vários downloads; o Chrome pede permissão para múltiplos downloads. | Algumas partes não baixadas sem o usuário notar. | Risco aceito pelo proprietário (2026-11-02, sem validação no Chrome real; se ocorrer, abrir bugfix): Downloads sequenciais com pausa curta; cada item marca **Baixado** só depois do clique; o aviso é descrito no quickstart. |
| R-006 | A spec não trata o MP3 do modo áudio em gravações de várias partes. | Funcionalidade de uma parte ausente em várias. | Resolvido: DI-009: MP3 só em uma parte; por parte, `.webm`. Registrado como decisão e sinalizado no Analyze. |
| R-007 | `resetPostSession`, descarte, importação e recuperação usam hoje uma única sessão de transcrição. | Resultados de uma gravação vazarem para outra, ou sessões de partes sem cancelar. | Resolvido: `parts-ui.md`: todas as saídas cancelam e esvaziam o mapa de sessões; testes e2e de descarte e de nova gravação. |
| R-008 | `loadSession` agora devolve `parts` além de `blob`; chunks gravados pela versão anterior são `Blob` soltos. | Perder gravações antigas ou quebrar os testes do `recovery-store`. | Resolvido: Ler os dois formatos; manter `blob` e os testes existentes verdes (research §4). |
| R-009 | `ended` da faixa de vídeo ou `Parar` durante uma rotação. | Parte perdida ou parada duas vezes. | Resolvido: Regra 6 de `split-recorder.md`: `stop()` espera a rotação e é idempotente; e2e cobre `ended` no meio da rotação. |
| R-010 | A feature depende da 002 (provedor e transcrição) e a T032 dela (Chrome real) segue manual. | Regressão não vista na transcrição de partes. | Risco aceito pelo proprietário (2026-11-02, sem validação no Chrome real; se ocorrer, abrir bugfix): O e2e de transcrição por parte usa o mesmo mock de rede da 002; quickstart repete o roteiro com chaves reais. |
| R-011 | **Decisão do proprietário (2026-11-02), do `sdd-converge`:** conflito entre FR-011 (encerrar a gravação se não der para guardar) e SC-003 (gravações de uma parte não mudam). | A cópia de segurança pode falhar durante a gravação ou já estar indisponível no início. | Resolvido: Falha **durante** a gravação: encerrar com mensagem e preservar as partes (FR-011). Indisponível **no início**: a gravação segue, com aviso visível na tela de gravação de que não há recuperação após queda (preserva SC-003 e deixa de ser silencioso). Implementado na T026. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-11-02 | Fases 1 e 2 | Baseline registrado; `split-recorder`, `recording-parts`, `recovery-store` por parte e `webm-duration` implementados; 5/5 contratos verdes, Jest 127. | Integração em `recorder.js` (Fase 3). |
| 2026-11-02 | Fase 3 (US1) | Gravador em partes integrado: indicador de parte, lista com Baixar, fila de remux, caminho de uma parte idêntico; 7 e2e novos; fechamento do recorder esperando o onstop (descoberta). | Baixar todas, transcrição por parte e bloco ao vivo (Fase 4). |
| 2026-11-02 | Fase 4 (US2) | Baixar todas, sessão por parte, bloco ao vivo, nomes de TXT/SRT com a parte; 4 e2e novos. | Recuperação de várias partes (Fase 5). |
| 2026-11-02 | Fase 5 (US3) | Recuperação de várias partes com numeração preservada; 4 e2e novos; 60 e2e no total. | Documentação e QA no Polish. |
| 2026-11-02 | Polish | README e CLAUDE.md atualizados; e2e do modo Só Áudio (descoberto no QA); QA com a medição da lacuna (0,03 s por troca). | Validação real no Chrome. |
| 2026-11-02 | Fase 7 (Convergência) | FR-011 "guardar": falha de escrita durante a gravação encerra com mensagem e preserva partes; sem armazenamento no início avisa na tela; e2e do aviso de saída com partes; README. Decisão R-011. | T028 (Chrome real). |

**PRÓXIMO**: T028: roteiro manual do `quickstart.md` no Chrome real; depois `sdd-converge` outra vez.

## Arquivos Principais

- `src/recorder.js` (`handleStorageFailure`, `interruptionReason`)
- `tests/e2e/parts.spec.cjs`
- `sdd/specs/003-dividir-gravacoes-longas/qa-evidence.md`
- `README.md`

## Cuidados para Retomada

- O contrato `tests/unit/split-recording.contract.test.js` está vermelho de propósito até a Fase 2. `npm test` mostra 5 falhas e 106 verdes: é o baseline, não regressão.
- Não edite contratos nem as travas das features 001 e 002.
- A medição de lacuna do `research.md` usou captura simulada; não a trate como prova no Chrome real.
- `split-recorder` chama `onPartClosed` com `{ index, blob }` já com o `type` dos pedaços; o remux e a duração acontecem em `recorder.js` (fila serial).
- `doStop` é assíncrono: as faixas só param depois de `splitRecorder.stop()` resolver (o último pedaço pode chegar depois de o recorder ficar `inactive`). Em gravações de várias partes `#post-panel` fica escondido até a Fase 4.
- No e2e, esperar `#part-indicator` mostrar "Parte N" é mais estável que contar segundos: a captura falsa varia de 60 a 150 KB/s.
- Uma parte vazia (sem dados) é descartada: em e2e que dependem de ≥2 partes, espere ~1,5 s depois do indicador "Parte N" antes de parar.
- `postSession` aponta para a sessão da parte selecionada; o botão Transcrever da lista só seleciona, a transcrição começa em "Transcrever áudio".
- Na recuperação, `totalParts()` usa o maior índice para o nome (`_parte-02`) e o título ("Parte 2 de 3") mesmo que a parte 1 já tenha sido baixada.
- Falha de escrita no IndexedDB durante a gravação chama `doStop()` sozinha: a tela final aparece sem clicar em Parar. O e2e simula a falha trocando `IDBObjectStore.prototype.add` por `addInitScript`.

## Resultado Final

**Convergida em 2026-11-02, com risco aceito pelo proprietário.**

- **Construído**: gravador em partes (`src/split-recorder.js`) que fecha a parte em 1,4 GB e continua em outra trocando só o `MediaRecorder` (troca sequencial, medida em cerca de 0,03 s no e2e); fila serial de remux e duração lida do arquivo; indicador de parte; lista de partes com Baixar, Transcrever e Baixar todas; sessão de transcrição por parte (uma por vez); bloco ao vivo só com TXT; guarda por parte em IndexedDB com recuperação, numeração preservada e remoção das partes baixadas; falha ao guardar encerra com mensagem. Contratos 5/5 verdes e íntegros.
- **Desvios**: limite de **1,4 GB** (a spec dizia cerca de 1,5 GB, para caber no remux); o `onstop` passou a ser sempre aguardado e `doStop` ficou assíncrono (descoberta com "Parar compartilhamento"); o MP3 do modo áudio só existe com uma parte (DI-009); a parte "guardar" do FR-011, que a T012 dava como feita, foi implementada depois (T026, decisão R-011).
- **Evidência**: e2e com captura simulada e limite reduzido pela URL (divisão, durações, pausa, `ended`, Baixar todas, transcrição por parte, ao vivo, recuperação, falha ao guardar, Só Áudio, aviso de saída). Jest 129/129, e2e 64/64.
- **Risco aceito**: a lacuna real com captura de tela, partes de 1,4 GB de verdade, memória e disco, tela estática, "Baixar todas" com o aviso do Chrome e a queda real do navegador (Blocos G e H, T028) foram fechados por **aceite do proprietário**, sem validação no Chrome real. Se der problema, abrir bugfix (R-001 a R-005 e R-010 ficam como risco aceito).
