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

- [ ] T001 [Shared] Implementar `buildSrt(segments)` e validação de tempos em `src/subtitles.js`, preservando lacunas e formato HH:MM:SS,mmm conforme `logic/session-state.md` (FR-010, SC-005) → contrato: `FR-010 SC-005: SRT preserva a lacuna de pausa na linha do tempo final`.
- [ ] T002 [Shared] Implementar `src/post-transcription-audio.js` com Mediabunny: detectar faixa de áudio utilizável, separar WebM/Opus ou MP4/AAC sem recodificar, entregar `Blob` somente de áudio, aceitar áudio WebM/MP3 diretamente, observar progresso/cancelamento e não ler o vídeo inteiro em `ArrayBuffer`; erro claro para codec incompatível, sem fallback de vídeo (FR-004, FR-011, FR-013, FR-014; SC-006).
- [ ] T002a [Shared] Implementar `transcribePreRecorded` em `src/post-transcription-client.js` como orquestrador e `src/post-transcription-providers/elevenlabs.js` como adaptador: `POST /v1/speech-to-text` multipart **somente com áudio**, Scribe v2, idioma, chave ElevenLabs em runtime, resposta normalizada com tempos, limite documentado de 5 GB para áudio preparado, categorias de erro e cancelamento; sem log sensível. Manter contrato para novos provedores sem UI de seleção (FR-003–FR-006, FR-011, FR-014; ADR-001).
- [ ] T003 [Shared] Implementar `createPostTranscriptionSession` em `src/post-transcription-session.js` conforme `logic/session-state.md`: fonte em memória, confirmação, estado/etapas, tentativa única, `AbortController`, geração contra resposta tardia, substituição atômica e ausência de fala (FR-004, FR-006–FR-009, FR-011–FR-013; SC-003, SC-004) → contratos: `US1/AC1 FR-001 FR-006`, `FR-004 Constitution II`, `US1/AC4 FR-008 FR-009`, `FR-012`.

### Testes da Fase

- [ ] T004 [P] [Shared] Acrescentar testes de preparador e cliente: WebM/Opus e MP4/AAC produzem arquivo somente de áudio com duração preservada; áudio WebM/MP3 segue direto; vídeo sem áudio/codec incompatível falha sem rede; multipart ElevenLabs contém apenas áudio, idioma e modelo; resposta, 401/413/422/429/5xx, limite, cancelamento local e `AbortSignal`, sem chaves reais.
- [ ] T005 [P] [Shared] Acrescentar testes de estados em `src/post-transcription-session.test.js` para erro/retry, fonte não pronta, resultado incompleto, novo arquivo e isolamento entre tentativas.
- [ ] T006 [P] [Shared] Acrescentar testes de formatação em `src/subtitles.test.js` para duração acima de uma hora, segmentos inválidos e SRT vazio bloqueado.

**Critério de Conclusão**: módulos exportam as interfaces de `logic/session-state.md`; testes adicionais da fundação passam, `npm run build` compila, e nenhuma chave ou mídia é persistida/logada. A UI ainda não precisa estar ligada.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

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

- [ ] T007 [US1] Em `src/recorder.js`, esperar `MediaRecorder.onstop` e último `dataavailable` para construir o `Blob` único, entregar a fonte à sessão e só então anunciar arquivo pronto; manter parada pelo botão e pelo seletor nativo idempotentes (FR-001, FR-006, FR-012, FR-013; SC-001; R-003) → contrato: `US1/AC1 FR-001 FR-006`.
- [ ] T008 [US1] Em `recorder.html` e `src/recorder.js`, adicionar escolha PT-BR/EN, aviso de envio de somente áudio à ElevenLabs, ação explícita, etapas de preparação/envio/aguardo, Cancelar/Tentar novamente e entrada/validação da chave ElevenLabs na tela final sem perder a mídia; manter download WebM/MP3 durante erro/cancelamento/processamento. Incluir host restrito ElevenLabs em `manifest.json`, mantendo Deepgram para ao vivo (FR-001, FR-003–FR-005, FR-007, FR-008, FR-012, FR-014; SC-001, SC-003) → contratos: `FR-004 Constitution II`, `FR-012`.
- [ ] T009 [US1] Em `recorder.html` e `src/recorder.js`, mostrar destino/tipo de dado antes do toggle ao vivo, conectar cliente e sessão ao resultado existente, preservar texto durante retranscrição e bloquear resposta tardia após cancelamento; mapear falha/sem fala sem segredo ou arquivo vazio (FR-006–FR-009, FR-011, FR-013; SC-003, SC-004; Constitution II) → contrato: `US1/AC4 FR-008 FR-009`.
- [ ] T010 [US1] Em `src/recorder.js` e `recorder.html`, mostrar texto completo posterior, baixar TXT/SRT do resultado correto e tratar SRT ao vivo de gravação pausada conforme DI-005; reutilizar `src/subtitles.js` (FR-009, FR-010; SC-005) → contrato: `FR-010 SC-005`.

### Testes da Fase

- [ ] T011 [US1] Em `src/post-transcription-session.test.js`, cobrir fonte gravada, resultado anterior, cancelamento antes/depois da resposta e ausência de fala com metadados de vídeo/áudio (complemento aos contratos).
- [ ] T012 [US1] Executar manualmente a parte P1 de `sdd/specs/001-transcricao-pos-gravacao/quickstart.md` no Chrome, incluindo gravação pausada e SRT contra reprodução; registrar separadamente o que depender de chave/cota/serviço real.

**Critério de Conclusão**: `npm test -- --runInBand src/post-transcription.contract.test.js` → 5/5 verdes e `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` íntegro; P1 demonstrável nos dois modos sem importação, com TXT/SRT sincronizado, cancelamento e mídia disponíveis. Validação Chrome/serviço registrada com limites explícitos.

**Checkpoint**: P1 pode ser entregue isoladamente, sem P2.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 3: User Story 2 - Arquivo salvo (Priority: P2)

**Objetivo**: selecionar arquivo local e obter transcrição sem nova captura.

**Independent Test**: abrir a janela sem gravar, selecionar um arquivo de cada formato aceito, transcrever e baixar TXT/SRT; testar arquivo inválido/sem áudio.

### Implementation

- [ ] T013 [US2] Em `recorder.html` e `src/recorder.js`, adicionar seleção de arquivo na tela inicial com validação de vídeo WebM/MP4 e áudio WebM/MP3, nome/tipo visíveis, idioma e aviso de extração local e envio de somente áudio à ElevenLabs (FR-002–FR-004, FR-011, FR-014; SC-002, SC-004, SC-006).
- [ ] T014 [US2] Em `src/recorder.js`, encaminhar o `File` selecionado à sessão e ao cliente da fundação, apresentar resultado/erro/cancelamento mesmo se P1 não tiver sido implementada, e ocultar download de gravação inexistente; permitir selecionar outro arquivo após tentativa encerrada, sem histórico (FR-002, FR-005–FR-008, FR-010–FR-013; SC-002, SC-003).

### Testes da Fase

- [ ] T015 [US2] Em testes de cliente/preparador/sessão, cobrir fonte `selected`, MIME/extensão discrepantes, arquivo não suportado, vídeo sem áudio e falha sem troca da fonte; executar cenários P2 no Chrome com WebM longo e MP4/AAC, verificar payload sem vídeo e consumo de memória (SC-002, SC-004, SC-006).

**Critério de Conclusão**: P2 funciona com os quatro formatos sem iniciar captura, reutiliza as proteções da P1, apresenta estados de erro honestos e permite TXT/SRT não vazios. `npm test -- --runInBand` e `npm run build` passam; validação Chrome/serviço registrada.

**Checkpoint**: P2 testável independentemente de P1 após a fundação comum.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 4: Polish & Cross-Cutting Concerns

**Objetivo**: fechar documentação, segurança de permissões e evidências de aceitação dos dois fluxos.

### Implementation

- [ ] T016 [Shared] Atualizar `README.md` para transcrição posterior, formatos/limites/privacidade e fluxo real de captura; conferir hosts Deepgram (ao vivo) e ElevenLabs (posterior), sem permissões excedentes (Constitution II–IV; R-005).
- [ ] T017 [Shared] Conferir `recorder.html` e `src/recorder.js` para estados sem texto vazio, aviso legível, botões corretos após falha/cancelamento e ausência de chave/dados sensíveis em log (FR-004, FR-007, FR-011; SC-004).

### Testes da Fase

- [ ] T018 [Shared] Executar `npm test -- --runInBand`, `npm run build` e `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao`; registrar contagens e falhas.
- [ ] T019 [Shared] Executar `sdd/specs/001-transcricao-pos-gravacao/quickstart.md` no Chrome com serviço real quando disponível, separar prova local/Chrome/serviço e registrar pendências aceitas sem chamar de validação concluída.

**Critério de Conclusão**: testes e build verdes, trava íntegra, cobertura das tasks ligada a FR/SC, README coerente com código e cada cenário do quickstart marcado como validado ou pendente com motivo.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

### Checklist de Release

- [ ] Phase 1 Foundational concluída.
- [ ] Phase 2 P1 concluída.
- [ ] Phase 3 P2 concluída.
- [ ] Cinco contratos verdes na suíte completa e `check-contract-tests.ps1` íntegro.
- [ ] Testes aplicáveis executados com `npm test -- --runInBand`.
- [ ] Build gerado com `npm run build`, sem editar `dist/` manualmente.
- [ ] Extensão recarregada no Chrome e fluxos de captura/áudio/transcrição e arquivos importados verificados conforme `quickstart.md`, ou pendências declaradas.
- [ ] Serviço real, permissões, aviso de envio e proteção de credenciais verificados separadamente.
- [ ] README e status SDD sincronizados ao comportamento entregue.

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
