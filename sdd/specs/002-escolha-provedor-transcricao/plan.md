# Implementation Plan: Escolha do provedor da transcrição pós-gravação

**Slug**: `002-escolha-provedor-transcricao` | **Date**: 2026-11-02 | **Spec**: `sdd/specs/002-escolha-provedor-transcricao/spec.md`

## Summary

Acrescentar o Deepgram como segundo provedor da transcrição posterior, escolhido por um seletor na tela final, e reunir todos os testes em `tests/`. A abordagem segue a ADR-001: um **registro de provedores** (`src/post-transcription-providers/index.js`) liga cada identificador a rótulo, chave de storage, limite de tamanho e adaptador; `transcribePreRecorded` recebe `provider` e despacha; a sessão repassa o provedor e o grava no resultado; a interface troca textos fixos de "ElevenLabs" por rótulos do provedor escolhido. Detalhes de assinaturas em `logic/provider-adapter.md`, API do Deepgram em `research.md`.

A reorganização dos testes é a fundação (Fase 2): feita antes das histórias, evita mover os testes novos duas vezes. O teste de contrato da feature 001 muda de local por **emenda aprovada pelo proprietário** (R-001).

## Technical Context

**Language/Version**: JavaScript (módulos ES) no Chrome Manifest V3; `package.json` sem `"type": "module"` (Babel via `babel-jest` para os testes).

**Primary Dependencies**: Webpack 5, `mediabunny` (preparação do áudio), `lamejs` (MP3), Jest 30, Playwright 1.64, `fake-indexeddb`. Nenhuma dependência nova.

**Storage**: `chrome.storage.local`: `deepgramKey` (já existe, agora também usada pela transcrição posterior), `elevenLabsKey` (existe) e `postProvider` (novo, última escolha). Resultados só em memória.

**Testing**: Jest (unitário e contrato) e Playwright com Chromium (e2e, incluindo captura simulada). Verificação em Chrome real e com chaves reais permanece manual.

**Target Platform**: extensão Chrome Manifest V3.

**Performance Goals**: N/A. O envio do áudio ao Deepgram é um `fetch` com corpo `Blob`, sem cópias extras.

**Constraints**: nenhuma permissão nova (`https://api.deepgram.com/*` já está nos `host_permissions`); chaves fora de logs, erros e testes; `dist/` não se edita; o contrato da 001 só muda por emenda registrada.

**Scale/Scope**: 2 provedores, 2 idiomas, 4 formatos de mídia.

## Decisões Invariantes

- **DI-001**: o provedor padrão é `elevenlabs`; `deepgram` é a segunda opção. A primeira abertura mostra ElevenLabs (FR-010).
- **DI-002**: todo provedor passa pelo contrato de adaptador `{ audio, language, key, signal, fetchImpl }` e devolve `{ text, segments, srt, timingInfo, language, origin: 'post' }`. Sessão, SRT e downloads não conhecem o formato bruto de nenhum serviço (ADR-001).
- **DI-003**: o Deepgram do arquivo gravado usa a mesma chave `deepgramKey` do fluxo ao vivo. Não há campo de chave novo.
- **DI-004**: o cliente (`transcribePreRecorded`) não lê storage; `recorder.js` resolve a chave do provedor escolhido e a passa em `key`.
- **DI-005**: o limite de tamanho vem do registro (`maxBytes`): ElevenLabs 5 GB, Deepgram 2 GB, comparação `>=` sobre o áudio preparado, antes de qualquer `fetch`.
- **DI-006**: `start()` sem `provider` equivale a `elevenlabs`; assim o teste de contrato da 001 continua válido sem alteração de comportamento.
- **DI-007**: nenhum fallback automático: nenhuma falha de um provedor chama o outro nem o sugere na interface (FR-009).
- **DI-008**: o resultado registra `transcript.provider` (`'elevenlabs'`, `'deepgram'` ou, para o texto ao vivo, `'deepgram'` com `origin: 'live'`); a tela mostra "Transcrito por {rótulo}" e os arquivos TXT/SRT baixados não mudam (FR-007).
- **DI-009**: a estrutura de testes é `tests/unit`, `tests/e2e`, `tests/integration` e `tests/fixtures`; a reorganização não cria, remove nem reescreve casos, só caminhos (FR-014, FR-016).
- **DI-010**: testes e fixtures nunca entram em `dist/`: o webpack só tem as entradas explícitas e não há cópia de `tests/` (FR-017).

## Constitution Check

*GATE: avaliado antes e depois do design.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Contrato verificável por mudança | OK | OK | A spec define comportamento, aceite, fora de escopo, retenção em sessão e tratamento de cancelamento e falha (FR-008). Sem troca de qualidade/desempenho a justificar; o limite de 2 GB é uma meta verificável (FR-011, DI-005). Nenhum escopo ampliado: a reorganização de testes foi aprovada e entrou na spec (US4). |
| II. Envio transparente e proteção de credenciais | OK | OK | O aviso antes do envio nomeia o serviço escolhido e muda com o seletor (FR-003); envio só após clique; nenhum dado vai ao outro serviço (contrato 2). Chaves fora de logs e erros (contrato 5, R-005). Sem permissão nova: `api.deepgram.com` já consta no manifesto, e a necessidade (transcrição posterior) está descrita aqui. |
| III. Plataforma e responsabilidades explícitas | OK | OK | Chrome MV3 mantido. Interface em `recorder.html`/`recorder.js`, integração em `src/post-transcription-providers/`, regras de sessão em `post-transcription-session.js`. `dist/` não é editado. Sem duplicar responsabilidade entre janela, popup e service worker. |
| IV. Evidência proporcional ao comportamento | OK | OK | `npm test` e `npm run build` em cada fase, e2e com resposta simulada e captura simulada. O envio real ao Deepgram, o seletor nativo de captura e o limite real ficam descritos como pendentes de validação no Chrome/serviço real (quickstart), sem serem chamados de validados. |

Não há violação; `## Complexity Tracking` fica vazio. A ADR-001 é cumprida, não contrariada (research §7).

## Project Structure

### Documentation (this feature)

```text
sdd/specs/002-escolha-provedor-transcricao/
├── spec.md
├── plan.md
├── research.md             # API de arquivo do Deepgram, limites, erros, reorganização
├── logic/
│   └── provider-adapter.md # registro, cliente, adaptador, sessão, interface
├── quickstart.md
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

Antes (estado atual) e depois (alvo desta feature). Só aparecem os caminhos tocados.

```text
src/                                          src/                       (sem testes nem fixtures)
  post-transcription-client.js                  post-transcription-client.js     # provider, limite por provedor
  post-transcription-session.js                 post-transcription-session.js    # provider, INVALID_PROVIDER
  post-transcription-providers/                 post-transcription-providers/
    elevenlabs.js                                 elevenlabs.js                  # usa timed-words.js
                                                  deepgram.js                    # stub -> adaptador real
                                                  index.js                       # NOVO registro
                                                  timed-words.js                 # NOVO normalização de tempos
  recorder.js                                   recorder.js                      # seletor, chaves, mensagens
  *.test.js (10 arquivos)  ──┐
  utils/*.test.js (2)      ──┤ movem para    tests/unit/**.test.js
  fixtures/*  ───────────────┤               tests/fixtures/*
e2e/ (helpers, specs, run.mjs) ─────────────► tests/e2e/
integration/elevenlabs-live.test.mjs ───────► tests/integration/
                                              tests/unit/post-provider-choice.contract.test.js  (já criado e travado)
recorder.html                                 recorder.html                      # #post-provider, #post-notice
playwright.config.cjs                         playwright.config.cjs              # testDir ./tests/e2e
package.json                                  package.json                       # scripts e config do Jest
manifest.json                                 manifest.json                      # sem mudança
```

**Structure Decision**: a lógica de provedores fica em `src/post-transcription-providers/` (uma unidade por serviço mais um registro), a escolha e o texto de interface ficam em `recorder.js`/`recorder.html`, e todo teste e fixture vive sob `tests/`. Os testes unitários espelham `src/` (ex.: `tests/unit/utils/timer.test.js`).

## Complexity Tracking

Sem violações do Constitution Check.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (mudam de caminho só na Fase 2; os scripts do `package.json` continuam sendo a interface):

```powershell
npm run build
npm test
npm run test:e2e
```

- **Unitário**: adaptador Deepgram (resposta, tempos ausentes, cada erro HTTP, timeout, cancelamento, chave fora de erros), registro, `timed-words`, sessão com `provider`.
- **E2E (Chromium, rede simulada)**: escolher Deepgram e conferir a requisição a `api.deepgram.com/v1/listen` com `Authorization: Token` e corpo só de áudio, sem requisição à ElevenLabs (e o inverso); aviso muda com o seletor; chave ausente por provedor; seletor desabilitado durante o processamento; "Transcrito por…"; retranscrição preservando o anterior; preferência persiste após recarregar. Captura simulada (`tests/e2e/capture.spec.cjs`) cobre a gravação até a transcrição pelo Deepgram simulado.
- **Reorganização**: comparar contagens antes/depois (76 Jest + 5 contratos novos; 31 e2e) e `grep` sem arquivos de teste fora de `tests/`.
- **Manual (quickstart)**: Deepgram real com chave, os quatro formatos, 402/limites e o seletor nativo de captura.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`: `tests/unit/post-provider-choice.contract.test.js`

Comando: `npx jest tests/unit/post-provider-choice.contract.test.js`

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 002-escolha-provedor-transcricao`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| Deepgram recebe só o áudio com a chave dele e devolve texto e tempos normalizados | US1/AC1, FR-006 | Fase 3 | URL chamada é a da ElevenLabs em vez de `api.deepgram.com` |
| Cada provedor só fala com o próprio serviço | US1/AC4, FR-002, Constitution II | Fase 3 | Deepgram escolhido ainda chama o endpoint da ElevenLabs |
| Sessão repassa o provedor, o resultado o registra e uma falha preserva o anterior | US2/AC1-3, FR-007, FR-008 | Fase 4 | `transcribe` recebe `provider` indefinido |
| O limite de tamanho depende do provedor e é checado antes do envio | FR-011 | Fase 3 | Deepgram aceita 3 GB (promessa resolve em vez de rejeitar) |
| Erro do Deepgram é classificado e não vaza a chave | FR-009, FR-013, Constitution II | Fase 3 | `AUTH_FAILED` esperado, recebido `NETWORK_ERROR` |

Os 5 casos falham por asserção (conferido em 2026-11-02). Stub criado pelo plan (ponto de partida, não travado): `src/post-transcription-providers/deepgram.js` (`transcribeWithDeepgram` lança `not implemented`). A trava da feature 001 muda de caminho na Fase 2 (R-001); este contrato já nasce em `tests/unit/`.

## Estado Atual

| Área | Estado |
| --- | --- |
| Fases 1 a 5 | Concluídas. |
| Polish | Concluída: README, nota na ADR-001, e2e de captura com Deepgram, `qa-evidence.md`. |
| Contratos | 5/5 verdes; travas 002 e 001 íntegras. |
| Gates | `npm test` 106/106; `npm run build` ok; `npm run test:e2e` 45/45. |
| Pendente | Deepgram/ElevenLabs reais, Chrome real e seletor nativo (qa-evidence §3). |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | **Emenda aprovada** (proprietário, 2026-11-02): mover `src/post-transcription.contract.test.js` da feature 001 para `tests/unit/post-transcription.contract.test.js`, alterando só as linhas de `import`. O hash da trava muda. | Sem a emenda, `check-contract-tests.ps1 -Slug 001...` falharia ("arquivo sumiu") e o executor não pode editar contrato. | O plano da 001 registra R-011 com o mesmo texto (R-010 já existia lá). Na Fase 2: mover, conferir por `git diff` que só `import`/caminhos mudaram, rodar os 5 casos, regravar com `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao -Write -Paths tests/unit/post-transcription.contract.test.js` e conferir `PASS`. |
| R-002 | A API de arquivo gravado do Deepgram não foi exercitada com chave real: aceitação de WebM/Opus e M4A, `nova-3` com `pt-BR`, forma exata da resposta, código 402 e limite de 2 GB. | O adaptador pode se comportar diferente do documentado. | Adaptador defensivo (campos ausentes viram erro `INVALID_RESPONSE` ou texto vazio sem exceção); itens ligados no `quickstart.md`; um teste real opcional pode seguir o padrão de `tests/integration/`. Registrar no QA o que não foi verificado. |
| R-003 | A interface tem "ElevenLabs" fixo em `postMessages`, no aviso de envio, em dicas de chave e em `#post-key-status`. | Mensagem com o serviço errado viola a Constitution II. | Mensagens como funções do rótulo do provedor; teste e2e confere o nome do serviço no aviso e nos erros dos dois provedores; busca textual por "ElevenLabs" em `recorder.js` e `recorder.html` na Fase 3. |
| R-004 | Mover testes quebra caminhos: `__dirname` das fixtures, `root` e `fixtures` em `tests/e2e/helpers.cjs`, `run.mjs`, `playwright.config.cjs`, scripts do `package.json`, ignores do Jest. | Suítes que passam a executar menos casos ou falham por caminho. | Fase 2 comparando contagens (Jest 76 + 5 contratos novos vermelhos, e2e 31); um caminho quebrado tem de falhar visivelmente, nunca ser ignorado. |
| R-005 | Erros e logs podem carregar a chave Deepgram, agora usada também em `fetch` com `Authorization`. | Vazamento de credencial. | Mensagens de erro só com códigos e `httpStatus`; contrato 5 serializa o erro inteiro; nada de `log()` com cabeçalhos ou URL completa. |
| R-006 | `resetPostSession()` recria a sessão ao iniciar gravação, descartar e importar arquivo; o provedor escolhido vive no DOM e em storage, não na sessão. | Escolha perdida ou aviso desatualizado após reset. | O seletor é a fonte da verdade; `renderPostState` e o aviso leem o seletor, não a sessão; `start()` recebe o provedor a cada chamada. |
| R-007 | A mesma chave Deepgram agora serve dois fluxos; a validação da chave em Configurações usa `/v1/projects`. | Chave válida para o ao vivo pode não ter permissão de arquivo gravado (ou o inverso). | Mensagem `AUTH_FAILED` própria do Deepgram na transcrição posterior; QA com chave real. |
| R-008 | O ADR-001 diz que o padrão não muda sem emenda; esta feature mantém ElevenLabs como padrão inicial. | Nenhum se o padrão continuar. | Sem ADR nova; no Polish, anotar na ADR-001 que a feature 002 concretizou a seleção. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-11-02 | Fase 1 e Fase 2 | Baseline registrado e reorganização dos testes em `tests/` concluída, com emenda R-001/R-011 aplicada (só imports) e trava da 001 regravada. | Nenhuma. |
| 2026-11-02 | Fase 3 (US1) | Provedor Deepgram, registro, cliente e interface por provedor; 5/5 contratos verdes (sessão adiantada); Jest 102, e2e 41. | Deepgram real e limite real não verificados. |
| 2026-11-02 | Fases 4, 5 e Polish | Sessão com provedor e rótulo "Transcrito por", persistência da escolha, e2e de captura com Deepgram, docs e QA registrados. | Validação real (chaves, Chrome, seletor nativo). |

**PRÓXIMO**: Rodar `sdd-converge`; depois executar o roteiro manual do `quickstart.md` com chaves reais.

## Arquivos Principais

- `sdd/specs/002-escolha-provedor-transcricao/qa-evidence.md`
- `src/post-transcription-providers/`
- `src/recorder.js`, `recorder.html`
- `tests/unit/post-provider-choice.contract.test.js` (travado)

## Cuidados para Retomada

- O contrato `tests/unit/post-provider-choice.contract.test.js` está vermelho de propósito até as Fases 3 e 4. `npm test` falha com 5 casos até lá; isso não é regressão. Use a contagem Jest 76 verdes como baseline.
- Não edite contratos. A única mudança permitida em contrato é a emenda R-001 (linhas de `import` do contrato da 001), com a trava regravada.
- `Object.defineProperty(media, 'size', ...)` no contrato 4 simula 3 GB sem alocar memória; o `prepareAudio` de áudio devolve `size` do próprio `Blob`.
- `testMatch` do Jest só inclui `tests/unit/**/*.test.js`; testes novos de unidade devem ir para lá.
- A raiz do projeto nos helpers e2e e em `run.mjs` é dois níveis acima de `tests/e2e/`.
- `postMessages(provider)` e o aviso usam o provedor do **estado da sessão** (`state.provider`) quando há; sem estado, o do seletor. Assim o erro cita o serviço que falhou mesmo se o seletor mudar depois.
