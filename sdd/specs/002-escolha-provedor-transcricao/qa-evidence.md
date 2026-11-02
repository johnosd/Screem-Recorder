# QA: 002-escolha-provedor-transcricao

Data da execução: 2026-11-02. Separa o que foi provado **localmente**, no **Chromium com rede simulada** e o que depende de **chave, serviço ou Chrome reais** (pendente). Nada abaixo usa nem registra chaves reais.

## 1. Gates automatizados

| Comando | Resultado |
| --- | --- |
| `npm test` | 17 suítes, **106/106** (baseline 76 + 5 contratos + 25 testes novos) |
| `npm run build` | compilado sem erro |
| `npm run test:e2e` | **45/45** (baseline 31 + 14 novos) |
| `check-contract-tests.ps1 -Slug 002-escolha-provedor-transcricao` | íntegra, 5 testes |
| `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` | íntegra, 5 testes, no novo caminho `tests/unit/` |
| `git ls-files -co --exclude-standard \| grep -E "\.(test\|spec)\.\|fixtures/" \| grep -v "^tests/"` | vazio (0 arquivos fora de `tests/`) |

Contagens da reorganização (SC-006): antes 76 Jest e 31 e2e; depois da Fase 2, idênticas (76 verdes + 5 contratos novos ainda vermelhos; 31 e2e). Só depois entraram testes novos.

## 2. Critérios de aceite

| Item | Evidência | Situação |
| --- | --- | --- |
| FR-001 seletor | `providers.spec.cjs` (todos usam `#post-provider`) | Provado no Chromium simulado |
| FR-002 só o provedor escolhido | contrato 2; e2e confere zero requisição ao outro serviço, nos dois sentidos | Provado |
| FR-003 aviso por serviço, envio só após clique | e2e do aviso (`#post-notice`) e do envio | Provado |
| FR-004 chave ausente só orienta | e2e "sem a chave do provedor escolhido…" nos dois sentidos; zero requisições | Provado |
| FR-005 mesmos formatos, idiomas, cancelar e repetir | e2e (WebM importado, gravação remuxada), cancelamento e falha | Provado com resposta simulada |
| FR-006 texto, TXT e SRT com Deepgram | e2e baixa TXT e SRT; unit do adaptador | Provado com resposta simulada |
| FR-007 "Transcrito por …" | e2e de retranscrição e de captura | Provado |
| FR-008 resultado anterior preservado | e2e de retranscrição, cancelamento e falha; unit de sessão | Provado |
| FR-009 erros por serviço, sem sugerir o outro | e2e 401/402/413/429/503 do Deepgram; unit por código | Provado |
| FR-010 lembrar a escolha, desabilitar durante o processamento | e2e "última escolha…" e "seletor desabilitado…" | Provado |
| FR-011 limite por provedor antes do envio | contrato 4; e2e 413 mostra "2 GB de Deepgram" | Provado (limite real do serviço pendente) |
| FR-012 ao vivo inalterado | e2e de captura com Deepgram ao vivo simulado segue verde | Provado |
| FR-013 chaves fora de logs/erros | contrato 5; unit de erros HTTP; busca textual sem chaves em código, logs e testes | Provado |
| FR-014 a FR-017 testes em `tests/` | seção 1 | Provado |
| SC-001 quatro formatos por provedor | Deepgram: WebM de vídeo (importado) e gravação remuxada; ElevenLabs: os quatro (testes da 001). MP4, MP3 e áudio WebM com Deepgram **não** foram exercitados | **Parcial** |
| SC-002 100% dos envios com aviso e sem tráfego ao outro | e2e | Provado nos cenários simulados |
| SC-003 chave ausente, cancelamento e falha preservam | e2e | Provado |
| SC-004 trocar de provedor sem abrir Configurações | e2e de retranscrição | Provado |
| SC-005 seletor lembra o último | e2e | Provado |
| SC-006, SC-007 contagens e trava da 001 | seção 1 | Provado |

## 3. Pendente (não validado — Princípio IV)

Depois da verificação real das seções 5 e 6, continuam **sem** validação; a feature não deve ser chamada de plenamente validada até serem cobertos:

- O limite real de **2 GB** por arquivo do Deepgram: consta só na documentação (inviável de testar). **Limite aceito pelo proprietário em 2026-11-02** como documentado, sem verificação própria. A documentação traz também uma página de erros com limite de "2 MB" para outro contexto; o arquivo de 2,58 MB foi aceito, então esse limite não vale para o arquivo gravado.
- Chave valendo no ao vivo mas não no arquivo gravado (ou o inverso): coberto no cenário feliz; não há como provocar o caso contrário.
- Seletor nativo de captura e a gravação real de tela/áudio no Chrome (o e2e usa captura simulada).
- Verificação visual no Chrome da lista "Serviço de transcrição" e do texto "Transcrito por …".

Roteiro manual: `quickstart.md` §3.

## 4. Desvios e descobertas

- **T020 antecipada**: a sessão (US2) foi implementada na Fase 3, porque a interface precisa repassar o provedor e gravá-lo no resultado. O contrato da sessão passou nesse momento.
- **Mensagens**: as mensagens de erro passaram a citar `{rótulo}` sem artigo ("Sem conexão com ElevenLabs", "Limite temporário de ElevenLabs"), o que mudou duas asserções de `errors.spec.cjs`.
- **R-011/R-001**: emenda do contrato da 001 aplicada; `git diff` do arquivo mostrou só duas linhas de `import`; trava regravada e conferida.

## 5. Verificação com serviços reais (2026-11-02)

Executada com as chaves do `.env` (ignorado pelo Git), por `tests/integration/deepgram-live.test.mjs` e `tests/integration/elevenlabs-live.test.mjs`, que passam pelo mesmo cliente do app (`transcribePreRecorded`). A saída traz só status e contagens, sem chave nem texto. Amostra de fala: trecho WebM de cerca de 45 s em PT-BR da avaliação de provedores, já usado antes com os dois serviços.

| Verificação | Resultado |
| --- | --- |
| Deepgram: autenticação (`npm run test:deepgram:auth`) | HTTP 200 |
| Deepgram `nova-3`, `pt-BR`, WebM com fala (`npm run test:deepgram:live`) | HTTP 200; 564 caracteres; 102 palavras, **102 com tempo válido**, 0 ausentes e 0 inválidos; SRT gerado (102 cues por palavra, antes do agrupamento do app) |
| Deepgram aceita o áudio preparado de `video-audio.webm` (Opus) e `audio-only.webm` | HTTP 200 nos dois |
| Deepgram aceita o M4A extraído de `video-audio.mp4` (AAC) | HTTP 200 |
| Deepgram aceita `audio-only.mp3` | HTTP 200 |
| Deepgram com `language=en` | HTTP 200 (mídia sintética, texto vazio esperado) |
| ElevenLabs: autenticação | HTTP 200, plano free |
| ElevenLabs Scribe v2, mesma amostra, após a refatoração para `timed-words` | HTTP 200; 571 caracteres; 100 palavras, 100 com tempo válido; SRT gerado |

Conclusões: o formato de pedido e de resposta do Deepgram documentado confere com o comportamento real (R-002 confirmado para `pt-BR` e para os formatos de áudio preparados); a refatoração do adaptador da ElevenLabs não alterou o comportamento real. As fixtures sintéticas voltam sem texto por não terem fala, o que prova a aceitação do formato, não a qualidade.

## 6. Fala audível em todos os formatos e idiomas, arquivo longo e WebSocket (2026-11-02)

As amostras foram geradas por `tests/integration/generate-speech-samples.ps1` (fora do repositório, em `%TEMP%`): PT-BR derivado da amostra de fala da avaliação (46,7 s), inglês sintetizado com a voz Microsoft David (13,6 s) e um arquivo longo com a amostra PT-BR repetida 6 vezes. Cada arquivo passa por `transcribePreRecorded` com `provider: 'deepgram'`, exatamente como no app (remux local do áudio, extração de M4A etc.).

| Arquivo | Formato enviado ao serviço | HTTP | Palavras (válidas) | Observação |
| --- | --- | --- | --- | --- |
| `fala-pt.webm` | WebM/Opus | 200 | 102 (102) | SRT com 102 cues |
| `fala-pt.mp3` | MP3 | 200 | 103 (103) | |
| `fala-pt.mp4` | M4A (AAC extraído do MP4) | 200 | 103 (103) | |
| `fala-en.webm` | WebM/Opus | 200 | 35 (35) | texto contém "fox" |
| `fala-en.mp3` | MP3 | 200 | 35 (35) | texto contém "fox" |
| `fala-en.mp4` | M4A (AAC extraído do MP4) | 200 | 35 (35) | texto contém "fox" |
| `fala-pt-longa.mp3` (2,58 MB, 4,7 min) | MP3 | 200 | 614 (614) | **1,3 s** de resposta; sem erro de tamanho |
| WebSocket ao vivo com a mesma chave | handshake | `open` | n/a | nenhum áudio enviado |

Conclusões: SC-001 fica provado com fala real nos três formatos de áudio preparados e nos dois idiomas (Deepgram, `nova-3`); o código 402 da documentação (`ASR_PAYMENT_REQUIRED`) coincide com o `PAYMENT_REQUIRED` do adaptador. Os testes ficam em `tests/integration/deepgram-live.test.mjs` e pulam os casos cujas amostras não existirem.
