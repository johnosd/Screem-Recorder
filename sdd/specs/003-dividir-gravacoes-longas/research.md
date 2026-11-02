# Research: Divisão automática de gravações longas

Fase 0 do `sdd-plan`. Fontes: código do repositório (`src/recorder.js`, `src/webm-finalize.js`, `src/recovery-store.js`), medição no Chromium com captura simulada e as ADRs existentes (nenhuma trata de gravação).

## 1. Como trocar de parte sem perder a gravação

**Decisão**: parar o `MediaRecorder` da parte atual, esperar o seu `onstop` (que traz o último pedaço) e, em seguida, criar e iniciar **outro `MediaRecorder` sobre o mesmo `MediaStream`**. As faixas e o `AudioContext` de mixagem não são tocados, então o cronômetro, a transcrição ao vivo e a mixagem continuam.

**Justificativa**: um `MediaRecorder` só produz um WebM válido e autônomo (cabeçalho, keyframe inicial) para o trecho que gravou; é o único jeito de cada parte ser um arquivo completo (FR-003). Medição de 2026-11-02 no Chromium com captura falsa (3 gravações seguidas de 2,5 s na mesma captura, parando e reiniciando em sequência):

| Medida | Resultado |
| --- | --- |
| Tempo corrido total | 7,53 s |
| Soma das durações dos três arquivos | 7,35 s |
| Perda total em duas trocas | **0,175 s** (cerca de 0,09 s por troca) |
| Intervalo entre o `onstop` de uma parte e o `start` da próxima | menor que 1 ms |

A meta da spec é no máximo 1 s por troca; a medição fica uma ordem de grandeza abaixo. **(A confirmar no Chrome real com captura de tela de verdade e áudio do sistema.)**

**Alternativas**: (a) dois `MediaRecorder` ao mesmo tempo, o novo iniciado antes de parar o antigo, para zerar a lacuna: descartada, porque cria sobreposição de conteúdo (contra FR-002) e dobra o custo de codificação por um instante; (b) fatiar o WebM já gravado no meio: descartada, porque um corte exige reescrever cabeçalhos e keyframes e não é seguro com VP9.

## 2. Limite de uma parte

**Decisão**: `PART_LIMIT_BYTES = 1_400_000_000`. A parte fecha quando os bytes já recebidos nela alcançam esse valor. Como o `MediaRecorder` entrega fatias de cerca de 1 s (até ~1 MB no perfil Alta), a parte termina poucos MB acima do limite, sempre abaixo de `MAX_FINALIZE_BYTES` (1,5 GB).

**Justificativa**: a spec diz "cerca de 1,5 GB". O remux só roda até `MAX_FINALIZE_BYTES`; um limite de exatamente 1,5 GB deixaria partes poucos MB acima do teto sem duração nem avanço no player. 1,4 GB deixa 100 MB de folga, ainda dentro da tolerância de 5% de SC-002. O áudio extraído de uma parte (algumas dezenas de MB) fica muito abaixo dos 2 GB do Deepgram e dos 5 GB da ElevenLabs.

**Alternativas**: 1,5 GB exatos (descartado pela folga do remux); 1 GB (descartado: mais partes que o necessário).

## 3. Como testar sem gravar horas

**Decisão**: o limite pode ser reduzido por **parâmetro de URL** `recorder.html?partLimitBytes=N`, lido por `resolvePartLimit`. Valores ausentes, inválidos ou fora de `[50_000, PART_LIMIT_BYTES]` voltam ao padrão. Nada aparece na interface.

**Justificativa**: a captura simulada do Chromium gera cerca de 60 a 150 KB por segundo; com `N` em centenas de KB, o e2e cruza o limite em segundos. Um parâmetro de URL não persiste (nem em `chrome.storage`) e não pode ser ativado por engano pelo usuário final.

**Alternativas**: chave em `chrome.storage.local` (persiste e pode ficar esquecida); constante alterada no build (exige rebuild por teste).

## 4. Guardar as partes e recuperar

**Decisão**: manter o IndexedDB atual (`recorder-recovery`, versão 1, mesmos object stores) e mudar apenas a **forma dos valores** em `chunks`: de um `Blob` solto para `{ part, blob }`, lendo os dois formatos (um `Blob` solto vale como parte 1). `appendChunk(blob, part = 1)`, `markPartDownloaded(part)` apaga os pedaços daquela parte e, se não sobrar nenhum, também os metadados. `loadSession()` devolve `{ meta, blob, parts }`, com `blob` com tudo (como hoje, para os testes e o uso de uma parte) e `parts` agrupado por índice.

**Justificativa**: sem migração de versão do banco, sem perder gravações salvas pela versão anterior, e os testes de `recovery-store` existentes continuam valendo.

**Alternativas**: um object store novo por parte (exige migração de versão do banco); manter só a parte atual (viola FR-008).

## 5. Duração de cada parte

**Decisão**: ler a duração de cada parte do próprio arquivo, com `mediabunny` (`getDurationFromMetadata`, com `computeDuration` como reserva), depois do remux; não usar o relógio.

**Justificativa**: a duração exibida e a soma de SC-001 passam a refletir o arquivo que o usuário baixa, inclusive em partes recuperadas, onde o relógio não existe.

## 6. Itens a confirmar no Chrome real (Princípio IV)

- A lacuna real entre partes com captura de tela e áudio do sistema reais (a medição foi com fontes simuladas).
- Uso de memória e de disco com partes de 1,4 GB (inviável de reproduzir aqui; ver R-003 e R-004 do plano).
- "Baixar todas" com o Chrome pedindo permissão para vários downloads.
- Uma tela estática (sem mudança de imagem): o `MediaRecorder` só grava vídeo quando há frames; uma parte nova de tela estática pode demorar a ter dados (R-002).
