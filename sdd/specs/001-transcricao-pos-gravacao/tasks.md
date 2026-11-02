# Tasks: Transcrição pós-gravação de vídeos e áudios

**Input**: `sdd/specs/001-transcricao-pos-gravacao/{spec,plan,research,data-model,quickstart}.md` e `logic/session-state.md`

**Prerequisites**: `spec.md`, `plan.md`, constitution 1.0.0. Os cinco testes em `src/post-transcription.contract.test.js` já existem e estão travados; o executor não os edita.

**Organization**: fundação comum → P1 recém-finalizada → P2 arquivo salvo → Polish. P1 e P2 podem ser entregues separadamente após a fundação.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode avançar em paralelo quando arquivos e dependências não se cruzam.
- **[Story]**: `[US1]` ou `[US2]`; infraestrutura comum usa `[Shared]`.

## Path Conventions

- Código-fonte e testes Jest: `src/*.js` e `src/*.test.js`; testes de contrato em `src/post-transcription.contract.test.js` são imutáveis durante `sdd-execute`.
- UI e fluxo de captura: `recorder.html` e `src/recorder.js`; popup e service worker atuais em `src/popup.js` e `src/background.js` não recebem lógica nova.
- Permissões em `manifest.json`; build em `webpack.config.js` gera `dist/`, que não é editado manualmente.
- Documentos da feature em `sdd/specs/001-transcricao-pos-gravacao/`; README de uso em `README.md`.

## Phase 1: Foundational (Shared Infrastructure)

**Objetivo**: criar processamento reutilizável de mídia final, sessão cancelável e SRT sincronizado, sem acoplar à UI.

### Implementation

- [X] T001 [Shared] Implementar `buildSrt(segments)` e validação de tempos em `src/subtitles.js`, preservando lacunas e formato HH:MM:SS,mmm conforme `logic/session-state.md` (FR-010, SC-005) → contrato: `FR-010 SC-005: SRT preserva a lacuna de pausa na linha do tempo final`.
- [X] T002 [Shared] Implementar `src/post-transcription-audio.js` com Mediabunny: detectar faixa de áudio utilizável, separar WebM/Opus ou MP4/AAC sem recodificar, entregar `Blob` somente de áudio, aceitar áudio WebM/MP3 diretamente, observar progresso/cancelamento e não ler o vídeo inteiro em `ArrayBuffer`; erro claro para codec incompatível, sem fallback de vídeo (FR-004, FR-011, FR-013, FR-014; SC-006).
- [X] T002a [Shared] Implementar `transcribePreRecorded` em `src/post-transcription-client.js` como orquestrador e `src/post-transcription-providers/elevenlabs.js` como adaptador: `POST /v1/speech-to-text` multipart **somente com áudio**, Scribe v2, idioma, chave ElevenLabs em runtime, resposta normalizada com tempos, limite documentado de 5 GB para áudio preparado, categorias de erro e cancelamento; sem log sensível. Manter contrato para novos provedores sem UI de seleção (FR-003–FR-006, FR-011, FR-014; ADR-001).
- [X] T003 [Shared] Implementar `createPostTranscriptionSession` em `src/post-transcription-session.js` conforme `logic/session-state.md`: fonte em memória, confirmação, estado/etapas, tentativa única, `AbortController`, geração contra resposta tardia, substituição atômica e ausência de fala (FR-004, FR-006–FR-009, FR-011–FR-013; SC-003, SC-004) → contratos: `US1/AC1 FR-001 FR-006`, `FR-004 Constitution II`, `US1/AC4 FR-008 FR-009`, `FR-012`.

### Testes da Fase

- [X] T004 [P] [Shared] Acrescentar testes de preparador e cliente: WebM/Opus e MP4/AAC produzem arquivo somente de áudio com duração preservada; áudio WebM/MP3 segue direto; vídeo sem áudio/codec incompatível falha sem rede; multipart ElevenLabs contém apenas áudio, idioma e modelo; resposta, 401/413/422/429/5xx, limite, cancelamento local e `AbortSignal`, sem chaves reais.
- [X] T005 [P] [Shared] Acrescentar testes de estados em `src/post-transcription-session.test.js` para erro/retry, fonte não pronta, resultado incompleto, novo arquivo e isolamento entre tentativas.
- [X] T006 [P] [Shared] Acrescentar testes de formatação em `src/subtitles.test.js` para duração acima de uma hora, segmentos inválidos e SRT vazio bloqueado.

**Critério de Conclusão**: módulos exportam as interfaces de `logic/session-state.md`; testes adicionais da fundação passam, `npm run build` compila, e nenhuma chave ou mídia é persistida/logada. A UI ainda não precisa estar ligada.

**Registro da Fase**:

- Status: Concluída no código e na automação local.
- Feito: T001–T006, inclusive T002a; sessão cancelável, remux só de áudio, adaptador ElevenLabs e SRT.
- Contrato: sem contrato nesta fase; a trava foi verificada por `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` (trava íntegra).
- Testes executados: `npm.cmd test -- --runInBand src/post-transcription-audio.test.js src/post-transcription-client.test.js` (20/20); `npm.cmd test -- --runInBand` (36/36); `npm.cmd run build` (PASS).
- Pendências: nenhuma para a fundação local; desempenho e memória no Chrome pertencem a T015/T019.

---

## Phase 2: User Story 1 - Gravação recém-finalizada (Priority: P1) 🎯 MVP

**Objetivo**: transcrever vídeo ou áudio logo após parar, sem download prévio e com acesso contínuo ao arquivo e ao texto anterior.

**Independent Test**: gravar fala em ambos os modos com transcrição ao vivo desligada, parar, transcrever e baixar mídia, TXT e SRT; repetir com transcrição ao vivo existente, falha e cancelamento.

### Contrato da Fase

- `US1/AC1 FR-001 FR-006: transcreve a mídia recém-finalizada sem download prévio`
- `FR-004 Constitution II: não envia mídia sem confirmação explícita`
- `US1/AC4 FR-008 FR-009: cancelar preserva resultado ao vivo e ignora resposta tardia`
- `FR-012: segunda tentativa simultânea é rejeitada sem envio duplicado`
- `FR-010 SC-005: SRT preserva a lacuna de pausa na linha do tempo final`
- Comando: `npm test -- --runInBand src/post-transcription.contract.test.js`

### Implementation

- [X] T007 [US1] Em `src/recorder.js`, esperar `MediaRecorder.onstop` e último `dataavailable` para construir o `Blob` único, entregar a fonte à sessão e só então anunciar arquivo pronto; manter parada pelo botão e pelo seletor nativo idempotentes (FR-001, FR-006, FR-012, FR-013; SC-001; R-003) → contrato: `US1/AC1 FR-001 FR-006`.
- [X] T008 [US1] Em `recorder.html` e `src/recorder.js`, adicionar escolha PT-BR/EN, aviso de envio de somente áudio à ElevenLabs, ação explícita, etapas de preparação/envio/aguardo, Cancelar/Tentar novamente e entrada/validação da chave ElevenLabs na tela final sem perder a mídia; manter download WebM/MP3 durante erro/cancelamento/processamento. Incluir host restrito ElevenLabs em `manifest.json`, mantendo Deepgram para ao vivo (FR-001, FR-003–FR-005, FR-007, FR-008, FR-012, FR-014; SC-001, SC-003) → contratos: `FR-004 Constitution II`, `FR-012`.
- [X] T009 [US1] Em `recorder.html` e `src/recorder.js`, mostrar destino/tipo de dado antes do toggle ao vivo, conectar cliente e sessão ao resultado existente, preservar texto durante retranscrição e bloquear resposta tardia após cancelamento; mapear falha/sem fala sem segredo ou arquivo vazio (FR-006–FR-009, FR-011, FR-013; SC-003, SC-004; Constitution II) → contrato: `US1/AC4 FR-008 FR-009`.
- [X] T010 [US1] Em `src/recorder.js` e `recorder.html`, mostrar texto completo posterior, baixar TXT/SRT do resultado correto e tratar SRT ao vivo de gravação pausada conforme DI-005; reutilizar `src/subtitles.js` (FR-009, FR-010; SC-005) → contrato: `FR-010 SC-005`.

### Testes da Fase

- [X] T011 [US1] Em `src/post-transcription-session.test.js`, cobrir fonte gravada, resultado anterior, cancelamento antes/depois da resposta e ausência de fala com metadados de vídeo/áudio (complemento aos contratos).
- [X] T012 [US1] Executar manualmente a parte P1 de `sdd/specs/001-transcricao-pos-gravacao/quickstart.md` no Chrome, incluindo gravação pausada e SRT contra reprodução; registrar separadamente o que depender de chave/cota/serviço real.
  - Progresso (2026-11-02): a parte de **gravação, pausa e arquivo** do roteiro único (Bloco B) foi validada pelo proprietário no Chrome real. **Falta o Bloco D**: transcrição, TXT/SRT e SRT contra a reprodução, inclusive com gravação pausada.
  - **Fechada em 2026-11-02 por risco aceito pelo proprietário, não por validação.** Foi validada no Chrome real a parte de gravação, pausa e arquivo (Bloco B do roteiro único) e, antes, o proprietário confirmou no Chrome real transcrição, SRT local agrupado, gravação pausada, modo Só Áudio e MP4/AAC (Registro das fases). O restante do roteiro não foi executado; se der problema, abrir bugfix.

**Critério de Conclusão**: `npm test -- --runInBand src/post-transcription.contract.test.js` → 5/5 verdes e `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` íntegro; P1 demonstrável nos dois modos sem importação, com TXT/SRT sincronizado, cancelamento e mídia disponíveis. Validação Chrome/serviço registrada com limites explícitos.

**Checkpoint**: P1 pode ser entregue isoladamente, sem P2.

**Registro da Fase**:

- Status: Código P1 concluído; gravação pausada e modo Só Áudio confirmados pelo usuário no Chrome. T012 segue parcial para demais cenários.
- Feito: T007–T011; Blob só em onstop, ação explícita, chave separada, cancelamento, resultado ao vivo preservado e TXT/SRT.
- Contrato: `npm.cmd test -- --runInBand src/post-transcription.contract.test.js` → 5/5 verdes; `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` → trava íntegra.
- Testes executados: `npm.cmd test -- --runInBand` (36/36); `npm.cmd run build` (PASS).
- Pendências: T012; testar demais estados P1 do quickstart, incluindo Deepgram ao vivo, cancelamento/retry e erros na captura real. Cancelamento com texto anterior passou no E2E simulado de arquivo importado; as confirmações de pausa/SRT e modo Só Áudio vieram do usuário. Payload e artefatos dessas tentativas não foram inspecionados pelo agente.

---

## Phase 3: User Story 2 - Arquivo salvo (Priority: P2)

**Objetivo**: selecionar arquivo local e obter transcrição sem nova captura.

**Independent Test**: abrir a janela sem gravar, selecionar um arquivo de cada formato aceito, transcrever e baixar TXT/SRT; testar arquivo inválido/sem áudio.

### Implementation

- [X] T013 [US2] Em `recorder.html` e `src/recorder.js`, adicionar seleção de arquivo na tela inicial com validação de vídeo WebM/MP4 e áudio WebM/MP3, nome/tipo visíveis, idioma e aviso de extração local e envio de somente áudio à ElevenLabs (FR-002–FR-004, FR-011, FR-014; SC-002, SC-004, SC-006).
- [X] T014 [US2] Em `src/recorder.js`, encaminhar o `File` selecionado à sessão e ao cliente da fundação, apresentar resultado/erro/cancelamento mesmo se P1 não tiver sido implementada, e ocultar download de gravação inexistente; permitir selecionar outro arquivo após tentativa encerrada, sem histórico (FR-002, FR-005–FR-008, FR-010–FR-013; SC-002, SC-003).

### Testes da Fase

- [X] T015 [US2] Em testes de cliente/preparador/sessão, cobrir fonte `selected`, MIME/extensão discrepantes, arquivo não suportado, vídeo sem áudio e falha sem troca da fonte; executar cenários P2 no Chrome com WebM longo e MP4/AAC, verificar payload sem vídeo e consumo de memória (SC-002, SC-004, SC-006).
  - **Fechada em 2026-11-02 por risco aceito pelo proprietário, não por validação.** WebM longo e conferência de memória no Chrome real não executados; MP4/AAC já confirmado pelo proprietário. Se der problema, abrir bugfix.

**Critério de Conclusão**: P2 funciona com os quatro formatos sem iniciar captura, reutiliza as proteções da P1, apresenta estados de erro honestos e permite TXT/SRT não vazios. `npm test -- --runInBand` e `npm run build` passam; validação Chrome/serviço registrada.

**Checkpoint**: P2 testável independentemente de P1 após a fundação comum.

**Registro da Fase**:

- Status: Código P2 concluído; quatro formatos curtos aprovados no Chromium Playwright com resposta simulada e MP4/AAC confirmado pelo usuário no Chrome real. T015 segue parcial.
- Feito: T013–T014 e parte automatizada de T015; importação com validação de tipo, mesma sessão e fluxos de erro; E2E P2 de vídeo WebM/MP4 e áudio WebM/MP3, com payload só áudio e SRT habilitado. Usuário confirmou importação MP4/AAC, transcrição e downloads TXT/SRT no Chrome.
- Contrato: sem contrato nesta fase; `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` → trava íntegra.
- Testes executados: `npm.cmd test -- --runInBand` (52/52), incluindo remux real em Node para WebM/Opus e MP4/AAC, sem áudio, AC3 e MIME divergente; `npm.cmd run test:e2e` (12/12, build PASS).
- Pendências: T015; testar WebM longo e memória no navegador; validar os demais formatos com serviço real separadamente. Payload e arquivos da tentativa MP4/AAC real não foram inspecionados pelo agente.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Objetivo**: fechar documentação, segurança de permissões e evidências de aceitação dos dois fluxos.

### Implementation

- [X] T016 [Shared] Atualizar `README.md` para transcrição posterior, formatos/limites/privacidade e fluxo real de captura; conferir hosts Deepgram (ao vivo) e ElevenLabs (posterior), sem permissões excedentes (Constitution II–IV; R-005).
- [X] T017 [Shared] Conferir `recorder.html` e `src/recorder.js` para estados sem texto vazio, aviso legível, botões corretos após falha/cancelamento e ausência de chave/dados sensíveis em log (FR-004, FR-007, FR-011; SC-004).

### Testes da Fase

- [X] T018 [Shared] Executar `npm test -- --runInBand`, `npm run build` e `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao`; registrar contagens e falhas.
- [X] T019 [Shared] Executar `sdd/specs/001-transcricao-pos-gravacao/quickstart.md` no Chrome com serviço real quando disponível, separar prova local/Chrome/serviço e registrar pendências aceitas sem chamar de validação concluída.
  - **Fechada em 2026-11-02 por risco aceito pelo proprietário, não por validação.** Roteiro completo do `quickstart.md` não executado no Chrome real com o serviço real; a ElevenLabs real foi exercitada pelo teste de integração (`qa-evidence` da 002 §5). Se der problema, abrir bugfix.
- [X] T020 [Shared] Descoberta no teste real: resposta com texto e tempo inválido descartava o TXT. Conservar texto não vazio, bloquear SRT sem tempos confiáveis, mostrar aviso e cobrir com Jest e Playwright; serviço real continua em T019 (FR-006, FR-010, FR-011).
- [X] T021 [Shared] Exportação nativa de SRT da ElevenLabs: parser e testes simulados existem, mas o pedido `additional_formats` foi retirado após HTTP 400 repetido inclusive com a chave que transcreveu sem esse campo. Classificação: descartada no fluxo atual, sem atribuir causa interna ao provedor; reavaliar somente com diagnóstico estruturado ou prova real de um formato aceito. O SRT local agrupado satisfaz FR-010/SC-005 (FR-010, SC-005).
  - **Fechada em 2026-11-02 como descartada**, conforme a classificação já registrada nesta task (HTTP 400 repetido do pedido nativo); o SRT local agrupado atende FR-010 e SC-005.
- [X] T022 [Shared] Corrigir diagnóstico enganoso de HTTP 400/422 após teste real: distinguir rejeição de requisição de mídia local inválida, mostrar somente status HTTP e campo validado pela ElevenLabs sem expor resposta, chave ou texto; cobrir em Jest e Playwright. A causa específica do erro real continua em T019 (FR-011).
- [X] T023 [Shared] Após novo HTTP 400 sem campo informado, retirar `additional_formats` para restaurar o pedido que antes entregou TXT; mostrar contagens não sensíveis de tempos válidos/ausentes/inválidos no resultado e cobrir com Jest e Playwright. Resposta real continua em T019 (FR-010, FR-011).
- [X] T024 [Shared] Com autorização explícita, criar teste real separado que lê `ELEVENLABS_API_KEY` do `.env` e tenta validar texto/tempos/SRT de uma amostra curta pelo cliente do app sem expor conteúdo; distinguir `detected_unusual_activity` de chave inválida no adaptador e na UI; isolar o teste real da descoberta automática do Playwright. A transcrição real foi bloqueada pelo provedor e permanece em T019 (FR-011).
- [X] T025 [Shared] Descoberta no Chrome real: uma resposta com 6.034 palavras, 5.934 intervalos válidos e 100 inválidos deixava SRT desabilitado por validação de tudo ou nada. Agrupar palavras sem tempo próprio aos trechos válidos vizinhos, sem inventar intervalos numéricos, informar sincronização aproximada, manter TXT e cobrir o download SRT em Jest e Playwright. Isolar `integration/` da descoberta automática do Jest (FR-010, FR-011; R-008).
- [X] T026 [Shared] Após validação do SRT real, usuário apontou que a alternativa local gerava uma palavra por legenda. Agrupar os intervalos em frases curtas, com quebra por pausa/pontuação e limites de duração/comprimento, sem alterar `buildSrt` ou os cinco contratos travados; cobrir em Jest e Playwright. Reativar solicitação de SRT nativo na mesma chamada conforme pedido do usuário, mantendo alternativa local (FR-010, SC-005).
- [X] T027 [Shared] Após reativar `additional_formats` com a chave que transcrevia, o usuário recebeu HTTP 400. Retirar novamente esse campo do multipart e manter as legendas locais agrupadas, com asserções do pedido sem exportação nativa em Jest e Playwright; conferir que GET do transcript não oferece exportação SRT posterior (FR-010, FR-011; R-009).

**Critério de Conclusão**: testes e build verdes, trava íntegra, cobertura das tasks ligada a FR/SC, README coerente com código e cada cenário do quickstart marcado como validado ou pendente com motivo.

**Registro da Fase**:

- Status: Parcial; documentação, gates locais e E2E Chromium concluídos; transcrição, SRT local agrupado, gravação pausada, modo Só Áudio e importação MP4/AAC confirmados pelo usuário no Chrome. Cancelamento com texto anterior passou no Chromium com resposta simulada. T019 continua pendente para os demais cenários.
- Feito: T016–T018, T020, T022–T027; README, manifesto, revisão estática da UI, TXT sem tempos, SRT por palavras agrupadas, recuperação parcial dos tempos, diagnóstico seguro, contagem de tempos e teste real isolado. T021 ficou descartada no fluxo atual por rejeição real repetida do pedido nativo. Evidências em `qa-evidence.md`.
- Contrato: `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` → 5/5 verdes na suíte e trava íntegra.
- Testes executados: `npm.cmd test -- --runInBand` (52/52, execução anterior); `npm.cmd run test:e2e` (12/12, build PASS); `npm.cmd run test:elevenlabs:auth` (HTTP 200 em execução anterior); `npm.cmd run test:elevenlabs:live` (HTTP 401 `detected_unusual_activity` em execução anterior, sem transcrição); `check-contract-tests.ps1` (trava íntegra, 5 testes, execução anterior); `git diff --check` (PASS).
- Pendências: T019; completar Deepgram ao vivo e estados de erro/cancelamento na captura real, importação real dos demais formatos e tempo/memória de WebM longo. Gravação pausada, modo Só Áudio e MP4/AAC foram confirmados pelo usuário. T021 está descartada no fluxo atual por HTTP 400 repetido.

### Checklist de Release

- [X] Phase 1 Foundational concluída.
- [X] Phase 2 P1 concluída.
- [X] Phase 3 P2 concluída.
- [X] Cinco contratos verdes na suíte completa e `check-contract-tests.ps1` íntegro.
- [X] Testes aplicáveis executados com `npm test -- --runInBand`.
- [X] Build gerado com `npm run build`, sem editar `dist/` manualmente.
- [X] Extensão recarregada no Chrome e fluxos de captura/áudio/transcrição e arquivos importados verificados conforme `quickstart.md`, ou pendências declaradas.
- [X] Serviço real, permissões, aviso de envio e proteção de credenciais verificados separadamente.

> **Nota (2026-11-02):** os itens acima foram fechados por **risco aceito pelo proprietário** (Princípio IV da constitution): parte do roteiro foi validada no Chrome real (Blocos A e B do roteiro único e as confirmações do proprietário registradas nas fases) e o restante não foi executado. Se der problema, abrir bugfix.
- [X] README e status SDD sincronizados ao comportamento entregue.

## Dependencies & Execution Order

- **Foundational (Phase 1)**: módulos de estado, cliente e SRT; bloqueia ambas as stories.
- **P1 (Phase 2)**: depende da fundação; não depende da seleção de arquivo P2.
- **P2 (Phase 3)**: depende da fundação; pode ser desenvolvida sem P1, reaproveitando a mesma sessão e a UI comum.
- **Polish (Phase 4)**: depende das stories escolhidas para entrega.

## Implementation Strategy

1. Implementar e testar a fundação sem editar o contrato.
2. Ligar a mídia finalizada à sessão e entregar P1; parar no checkpoint e validar no Chrome.
3. Acrescentar seleção de arquivos para P2; validar os quatro formatos.
4. Executar Polish, gates, `quickstart.md` e revisão SDD; não transformar ausência de serviço real em prova de aceitação.

## Phase 5: Convergence

**Propósito**: lacunas achadas por `sdd-converge` em 2026-11-02, depois dos ajustes ad-hoc de gravação (remux do WebM, `CloseStream` do Deepgram). Nenhuma task acima foi alterada.

- [X] T028 [Shared] No Chrome, gravar em Vídeo + Áudio e em Só Áudio e transcrever o arquivo final **já regravado** por `src/webm-finalize.js`: conferir que `prepareAudio` extrai só o áudio, que o envio não contém vídeo e que TXT/SRT saem normalmente. Com a transcrição ao vivo ativada, conferir que o texto ao vivo aparece na tela final até 3 s depois do fim da gravação e que a retranscrição o substitui só após concluir. Registrar em `qa-evidence.md` o que depender de chave ou serviço real (SC-006; FR-009; FR-014; Constitution IV).
  - **Fechada em 2026-11-02 por risco aceito pelo proprietário, não por validação.** A transcrição da gravação já regravada foi coberta por e2e (captura simulada, rede simulada) e pela transcrição real de arquivos; a passada no Chrome real não foi executada. Se der problema, abrir bugfix.
