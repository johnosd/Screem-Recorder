# Implementation Plan: Transcrição pós-gravação de vídeos e áudios

**Slug**: `001-transcricao-pos-gravacao` | **Date**: 2026-10-31 | **Spec**: `sdd/specs/001-transcricao-pos-gravacao/spec.md`

**Decisão de 2026-10-31**: o usuário escolheu ElevenLabs Scribe v2 para arquivos e pediu arquitetura aberta a novos provedores. O fluxo ao vivo continua Deepgram. O vídeo permanece WebM/Opus; antes do envio, o app extrai localmente só o áudio. A prova de remux foi local em Node, ainda pendente no Chrome. Ver [avaliação](provider-evaluation.md), [pesquisa](research.md) e [ADR-001](../../adr/ADR-001-provedores-transcricao-por-modalidade-adaptador.md).

## Summary

Adicionar transcrição sob demanda da gravação recém-finalizada (P1) e de arquivos locais WebM/MP4/MP3 (P2) na janela existente da extensão. `MediaRecorder.onstop` entrega o `Blob` final à sessão em memória. Após a ação explícita, o preparador extrai só o áudio de vídeos por remux local, sem alterar a gravação; áudio WebM/MP3 segue direto. Um adaptador ElevenLabs Scribe v2 envia o áudio e normaliza texto/tempos. A sessão coordena cancelamento, preservação do resultado anterior e downloads TXT/SRT.

## Technical Context

**Language/Version**: JavaScript em extensão Chrome Manifest V3; Node.js 22.16.0 no ambiente de desenvolvimento verificado.

**Primary Dependencies**: APIs Web `MediaRecorder`, `Blob`/`File`, `fetch`/`AbortController`; `chrome.storage.local`; Mediabunny para remux; ElevenLabs `POST /v1/speech-to-text` para arquivos; Deepgram WebSocket atual para ao vivo; Webpack 5.106.2; Jest 30.3.0.

**Storage**: chaves separadas ElevenLabs e Deepgram em `chrome.storage.local`; mídia, áudio preparado, tentativas e transcrições apenas na memória da janela. Downloads explícitos para persistência pelo usuário.

**Testing**: Jest com `*.test.js`; três testes existentes do timer; cinco contratos novos travados; build Webpack; verificação manual da extensão no Chrome com serviço real quando disponível.

**Target Platform**: Chrome Manifest V3, janela `recorder.html`; sem suporte novo a outros navegadores.

**Performance Goals**: preparação local mais rápida que a reprodução da mídia; evitar decodificar ou recodificar áudio compatível e carregar todo o vídeo em `ArrayBuffer`; mostrar progresso real de extração e preservar responsividade/cancelamento. Medir tempo e memória no Chrome com WebM longo e MP4/AAC; validar tamanho do áudio preparado contra limite do serviço.

**Constraints**: sem servidor novo, histórico, tradução, diarização ou legenda embutida. Adicionar host `https://api.elevenlabs.io/*`; manter Deepgram para ao vivo. Seleção PT-BR/EN. Não enviar faixa de vídeo nem fazer fallback silencioso para vídeo quando o áudio não puder ser separado. Sem porcentagem de rede fictícia. A janela fechada perde o estado não baixado.

**Scale/Scope**: uma mídia e no máximo uma tentativa ativa por janela; validar o áudio preparado contra o limite documentado de 5 GB, com limites práticos de memória do Chrome medidos; texto/SRT gerados somente após resultado completo.

## Decisões Invariantes

- **DI-001**: A preparação e transcrição posterior só começam após botão explícito e aviso que nomeia ElevenLabs e o envio apenas de áudio; o toggle ao vivo informa Deepgram e envio de áudio antes da ativação.
- **DI-002**: A fonte recém-gravada só fica pronta no `MediaRecorder.onstop`, depois do último `dataavailable`; o mesmo `Blob` final serve para download e transcrição.
- **DI-003**: Um preparador lê a fonte da janela, separa só áudio de vídeo WebM/MP4 por remux sem recodificação quando compatível e encaminha áudio WebM/MP3 diretamente. O adaptador ElevenLabs recebe apenas áudio preparado; a sessão/UI dependem de contrato normalizado. Não adicionar backend nem mudar o formato de captura.
- **DI-004**: Uma sessão em memória controla tentativa única, `AbortController` e identificador de geração. Cancelamento/falha/sem fala mantêm mídia e transcrição anterior; resposta tardia não pode substituir o estado.
- **DI-005**: SRT posterior usa tempos obtidos do arquivo final. Para gravação pausada com somente resultado ao vivo, mostrar o TXT existente e solicitar retranscrição antes de oferecer SRT como sincronizado.
- **DI-006**: Arquivos aceitos: vídeo WebM/MP4 com áudio utilizável e áudio WebM/MP3; idiomas PT-BR/EN. Validar o áudio preparado contra limite ElevenLabs de 5 GB e recursos do Chrome. Codec incompatível, limite ou timeout vira erro recuperável, sem enviar vídeo como fallback.
- **DI-007**: A preparação deve ser cancelável e observar progresso real. A saída temporária não é persistida; uma tentativa cancelada não substitui texto anterior. Abort de `fetch` não garante cancelamento de trabalho/cobrança no servidor.

## Constitution Check

*GATE: avaliado antes do design e novamente após pesquisa, modelo, lógica, testes e quickstart.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Contrato verificável por mudança | PASS | PASS | Spec cobre escopo, retenção e falha; DI-006 e Research registram tradeoff de tamanho/desempenho, tasks rastreiam FR/SC. |
| II. Envio transparente e proteção de credenciais | PASS | PASS | Aviso ElevenLabs antes da preparação; somente áudio sai da extensão, chave própria em storage e runtime, host restrito. Deepgram ao vivo informado separadamente. |
| III. Plataforma e responsabilidades explícitas | PASS | PASS | Chrome MV3; `recorder.js` liga UI/gravação, sessão coordena estado, cliente isola rede, popup/service worker sem lógica duplicada; `dist/` apenas build. |
| IV. Evidência proporcional ao comportamento | PASS | PASS | Jest/build, cinco contratos travados e `quickstart.md` distinguem prova de remux em Node, Chrome e serviço real. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/001-transcricao-pos-gravacao/
├── spec.md
├── research.md
├── provider-evaluation.md
├── evaluation/
│   ├── compare-providers.mjs
│   └── run-comparison.ps1
├── data-model.md
├── logic/
│   └── session-state.md
├── quickstart.md
├── plan.md
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

Não há `contracts/` externo: a feature consome uma API existente e adiciona módulos internos, sem expor API pública do produto.

### Source Code (repository root)

```text
src/
├── recorder.js                         # captura, UI, transcrição ao vivo e downloads atuais
├── post-transcription-session.js       # stub novo, sessão em memória
├── post-transcription-client.js        # stub novo, orquestra preparo e provedor
├── post-transcription-audio.js         # separa áudio de vídeos sem recodificar
├── post-transcription-providers/
│   └── elevenlabs.js                   # primeiro adaptador de arquivo
├── post-transcription.contract.test.js # contrato travado desta feature
├── subtitles.js                        # stub novo, SRT compartilhado
├── popup.js
├── background.js
├── audio-processor.js
└── utils/
    ├── timer.js
    └── timer.test.js
recorder.html                            # UI idle/rec/done
popup.html
manifest.json                            # manter host Deepgram e incluir ElevenLabs
webpack.config.js                        # gera dist/ a partir de src/
package.json                             # npm test, npm run build
README.md
.planning/memory/constitution.md
.planning/backlog.md
```

**Structure Decision**: manter a janela atual como dona da mídia e da UI; separar sessão, preparador de áudio, adaptador HTTP e SRT em módulos testáveis. `post-transcription-client.js` preserva a interface `transcribePreRecorded` já prevista e faz a ponte entre a fonte, o preparador e o adaptador. `src/recorder.js` liga telas, `MediaRecorder.onstop`, chave ElevenLabs e downloads. `popup.js`/`background.js` não recebem lógica nova. `dist/` é gerado por Webpack, nunca editado manualmente.

## Complexity Tracking

Nenhuma violação da constitution identificada; não há exceção de complexidade a justificar.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E na extensão → verificação manual no Chrome com ElevenLabs real. Os contratos cobrem o núcleo P1; testes adicionais cobrem remux WebM/Opus e MP4/AAC sem vídeo, cliente HTTP multipart, importação, cancelamento da preparação e rede, classificação de falhas e finalização do recorder. Medir arquivo longo no Chrome; Node local não é prova desse ambiente.

Comandos-base:

```powershell
npm test -- --runInBand
npm run build
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao
```

Baseline antes dos stubs: `npm test -- --runInBand` → 3/3 verdes; `npm run build` → Webpack compilou. Após stubs, `npm test -- --runInBand src/utils/timer.test.js` → 3/3 verdes. A suíte completa fica intencionalmente vermelha até a execução.

### Testes de Contrato

Arquivo travado: `src/post-transcription.contract.test.js` (5/5 do orçamento). Stubs de partida, não travados: `src/post-transcription-session.js`, `src/post-transcription-client.js`, `src/subtitles.js`.

Comando de execução isolada:

```powershell
npm test -- --runInBand src/post-transcription.contract.test.js
```

| Teste | Origem | Fase | Vermelho confirmado antes do execute |
| --- | --- | --- | --- |
| Transcreve mídia recém-finalizada sem download prévio | US1/AC1, FR-001, FR-006 | P1 | `not implemented` em `start` |
| Não envia mídia sem confirmação explícita | FR-004, Constitution II | P1 | rejeição sem `CONSENT_REQUIRED` |
| Cancelar preserva texto ao vivo e ignora resposta tardia | US1/AC4, FR-008, FR-009 | P1 | `not implemented` em `cancel` |
| Segunda tentativa simultânea rejeitada | FR-012 | P1 | rejeição sem `ALREADY_RUNNING` |
| SRT preserva lacuna de pausa | FR-010, SC-005 | P1 | `not implemented` em `buildSrt` |

Execução vermelha confirmada: 1 suíte, 5 testes falharam apenas pelos stubs/asserções esperadas, sem erro de import ou sintaxe. A trava é verificada com o terceiro comando-base acima.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |

## Riscos e Decisões

<!-- IDs estáveis; sdd-execute atualiza mitigação e não remove linhas. -->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Arquivos grandes, limite e erro da ElevenLabs | Uma mídia pode não produzir transcrição apesar de formato aceito | Validar tamanho do áudio preparado (limite documentado 5 GB), classificar timeout/erro, preservar mídia e permitir nova tentativa; registrar limite real em QA. |
| R-002 | Segmentos ao vivo podem incluir tempo/fala da pausa | SRT ao vivo pode divergir do vídeo final | DI-005: para gravação pausada, exigir transcrição do arquivo final antes de liberar SRT sincronizado; testar reprodução. |
| R-003 | `doStop()` atual mostra “pronto” antes do `onstop` | Último chunk pode faltar no arquivo enviado | DI-002: construir `Blob` e habilitar ações só no `onstop`; contrato e teste de integração do recorder. |
| R-004 | Erros HTTP e mensagens de serviço podem carregar dados sensíveis | Vazamento da chave ou conteúdo em logs/erros | Mapear apenas códigos e categorias para a UI; não logar headers, corpo de requisição ou resposta bruta. |
| R-005 | Diagrama de captura no README diverge do código atual | Executor pode escolher camada/API erradas | Usar `src/recorder.js` como fonte; atualizar README no Polish com comportamento efetivo. |
| R-006 | Escolha da API com evidência parcial | Inglês, acurácia contra referência humana e arquivos longos ainda podem revelar limitação | ElevenLabs escolhida pelo usuário após quatro amostras PT-BR; validar inglês e Chrome antes de aceitar a feature, manter adaptador extensível conforme ADR-001. |
| R-007 | Remux rápido no Node pode falhar ou consumir memória demais no Chrome | Vídeos longos ou MP4 com outros codecs podem não ser transcritos | Testar WebM longo, MP4/AAC e pausa no Chrome; usar leitura sob demanda e saída em chunks quando possível; verificar faixa copiada; erro recuperável sem fallback de envio de vídeo. |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- (nenhum ainda)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
