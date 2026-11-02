# Evidências de execução — 2026-11-01

## Automação local

- `npm.cmd test -- --runInBand`: 6 suítes, 36 testes verdes. Inclui cinco contratos travados, sessão, SRT, cliente HTTP e remux real de amostras sintéticas.
- `npm.cmd run build`: Webpack compilou sem erro (`recorder.bundle.js` 2,31 MiB em modo development).
- `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` com PowerShell de processo em ExecutionPolicy Bypass: trava íntegra, 5 testes.
- `git diff --check`: sem erro de whitespace.
- Conferência estática: referências de IDs em `src/recorder.js` presentes em `recorder.html`, sem IDs duplicados.

## Mídia sintética em Node

- `src/fixtures/video-audio.webm` (15.723 B, VP9/Opus) e `video-audio.mp4` (17.267 B, H.264/AAC): remux gerou arquivo com uma faixa de áudio, nenhuma de vídeo, duração preservada dentro de 0,1 s e saída menor que a origem.
- `video-silent.webm` (1.042 B): erro `NO_AUDIO` antes da rede.
- `video-ac3.mp4` (15.231 B): erro `UNSUPPORTED_CODEC`; não há transcodificação ou fallback para envio do vídeo.
- Áudio WebM/MP3 passa sem cópia; testes também cobrem cancelamento de preparação e rede, status HTTP, limite de 5 GB do áudio e resposta tardia.

## Browser E2E com Playwright

- `npm.cmd run test:e2e:install`: Chromium de testes instalado em perfil isolado do repositório.
- `npm.cmd run test:e2e`: build e 2/2 testes passaram no Chromium com a extensão Manifest V3 carregada.
- Fluxo P2 WebM/Opus: nenhuma requisição antes do clique; multipart com `audio/webm` e sem `video/webm`; resposta ElevenLabs simulada; prévia e downloads TXT/SRT conferidos. O teste revelou `srt.txt` na importação; `recordingFilename` foi corrigido e o teste passou.
- Diagnóstico do coletor: logs de página, popup e service worker, além de exceção da página, requisição e falha de rede provocadas. Cada teste salva JSONL; falhas salvam trace e screenshot. No fluxo funcional, zero erros de console, exceções ou falhas de rede.
- Somente mídia sintética e resposta simulada; nenhuma chave real ou chamada ao serviço comercial.

## Quickstart no Chrome

| Cenário | Estado | Motivo |
| --- | --- | --- |
| 1. Gravação P1, sem envio antes do clique | Parcial no Chrome real | Usuário confirmou gravação pausada, transcrição e SRT por reprodução; ausência de envio antes do clique e aviso da UI não foram inspecionados. |
| 2. Payload só áudio, TXT/SRT | Parcial no Chrome real | Payload só áudio verificado no Chromium com resposta simulada; usuário confirmou transcrição e SRT local agrupado no Chrome com ElevenLabs real. Payload dessa tentativa não foi inspecionado. |
| 3. Só Áudio e gravação pausada | Parcial no Chrome real | Usuário confirmou gravação pausada com SRT contra reprodução e, em tentativa posterior, gravação no modo Só Áudio. O agente não inspecionou os arquivos ou requisições dessas tentativas. |
| 4. Deepgram ao vivo e cancelamento | Parcial no Chromium | Cancelar uma nova transcrição preservou texto e botões TXT/SRT anteriores no E2E com resposta simulada e arquivo importado. Deepgram ao vivo, captura e serviço real permanecem pendentes. |
| 5. Quatro formatos P2, WebM longo e MP4/AAC | Parcial no Chrome real | Quatro formatos curtos automatizados com resposta simulada; usuário confirmou MP4/AAC importado com transcrição e downloads TXT/SRT no Chrome real. WebM/MP3 de áudio, WebM de vídeo longo e memória seguem pendentes no serviço real. Payload da tentativa real não foi inspecionado. |
| 6. Falta de chave, rede e mídia inválida na UI | Parcial | Coletor de erro e falha de rede validado; estados de erro da interface ainda pendentes. |
| 7. WebM longo, tempo/memória e cancelamento | Pendente | Requer amostra longa no Chrome e inspeção do payload. |

A ponte de automação de interface desta sessão permaneceu indisponível, mas o Chromium próprio do Playwright executou o E2E. Nenhuma chave local ou arquivo privado foi lido. Não houve chamada real à ElevenLabs ou à Deepgram. A validação do seletor nativo, serviço real, dos outros codecs no navegador, do consumo de memória e da sincronização por reprodução permanece aberta.

## Retorno do teste real e correção de tempos — 2026-11-01

- Usuário instalou a extensão no Chrome e relatou "A resposta não trouxe tempos válidos para as legendas." após aguardar a ElevenLabs. Pelo caminho do código, houve texto não vazio, mas validSegments rejeitou tempos ausentes ou inválidos; a resposta bruta não foi inspecionada.
- A sessão descartava o texto inteiro. T020 preserva texto para TXT e desabilita SRT com aviso se não houver tempos confiáveis. Não fabrica nem corrige tempos por aproximação.
- Regressão: o novo Jest falhou antes da correção com INCOMPLETE_RESULT; o novo Playwright falhou antes com o aviso antigo. Após a correção: npm.cmd test -- --runInBand (37/37), npm.cmd run test:e2e (3/3 e build PASS). Serviço real e conteúdo da resposta ainda não revalidados.
- A ponte Playwright para o Chrome aberto não conectou nesta sessão. Nenhuma nova chamada à ElevenLabs foi feita pelo agente.

## Exportação SRT nativa — 2026-11-01

- A documentação atual da ElevenLabs expõe `additional_formats` na mesma requisição Scribe v2 e um item de resposta com `requested_format`, `content` e `is_base64_encoded`. O app agora solicita SRT e valida seus intervalos antes de habilitar o download; tempos por palavra continuam como alternativa.
- Regressão antes do patch: três falhas esperadas em Jest (pedido sem `additional_formats`, SRT não propagado pelo adaptador e pela sessão). Depois: `npm.cmd test -- --runInBand` (41/41), `npm.cmd run test:e2e` (4/4, build PASS) e trava de 5 contratos íntegra. O E2E faz download e verifica o conteúdo do SRT nativo quando `words` vem vazio.
- A resposta real que produziu o TXT anterior não foi armazenada pelo app. A ponte Playwright localizou a aba do gravador no Chrome, mas o Chrome bloqueou acesso da extensão de automação à página de outra extensão. Nenhuma nova chamada paga foi executada. O SRT real ainda requer uma nova transcrição iniciada pelo usuário depois de salvar a mídia e recarregar a extensão.

## Rejeição após solicitar SRT — 2026-11-01

- O usuário relatou “Arquivo inválido ou corrompido” após aguardar retorno da ElevenLabs, sem consumo de créditos. O código mapeava HTTP 400 e 422 para `INVALID_MEDIA` sem inspecionar o campo da validação; por isso a mensagem não demonstrava corrupção do arquivo.
- O SDK oficial da ElevenLabs serializa `additional_formats` como JSON no multipart, equivalente ao formato enviado pelo app. A resposta HTTP real não está disponível, então a origem da rejeição (campo SRT, mídia ou outro parâmetro) permanece indeterminada.
- T022 preserva somente status 400/422 e campo de requisição reconhecido em `detail[].loc`, sem mensagem ou corpo bruto. O usuário verá, por exemplo, “HTTP 422; campo additional_formats” se o serviço indicar esse campo. Antes do patch, 3 Jest falharam como esperado; depois, `npm.cmd test -- --runInBand` (43/43), `npm.cmd run test:e2e` (5/5, build PASS), e a trava de 5 contratos passou.
- DevTools MCP desta sessão listou apenas `about:blank` de outra instância. O MCP Playwright não retornou abas da sessão do usuário. Não foi feita outra chamada à ElevenLabs nem acesso a credenciais.

## HTTP 400 repetido e retirada da exportação nativa — 2026-11-01

- Na tentativa seguinte, o usuário informou HTTP 400 sem campo de validação. A resposta bruta não foi capturada; não há prova de qual parâmetro falhou. A única diferença relevante em relação ao pedido que antes entregou TXT era `additional_formats`, agora retirado como mitigação da regressão. T021 foi reaberta.
- A documentação oficial define `words[].start/end` como opcionais e anuláveis. O adaptador agora conta palavras, intervalos válidos, ausentes e inválidos sem texto ou chave; a tela mostra esses números quando o SRT não pode ser gerado.
- TDD: três Jest falharam antes da mudança pelo motivo esperado. Depois, `npm.cmd test -- --runInBand` (45/45), `npm.cmd run test:e2e` (5/5, build PASS) e trava de 5 contratos íntegra. O E2E com resposta simulada confirma a contagem exibida. Nenhuma chamada comercial foi feita pelo agente; resta confirmar no Chrome do usuário.

## Chamada real autorizada à ElevenLabs — 2026-11-01

- O usuário autorizou ler apenas `ELEVENLABS_API_KEY` do `.env` e transcrever uma amostra com fala. `integration/elevenlabs-live.test.mjs` usa o cliente real do app, o arquivo temporário `sample01.webm`, valida texto, tempos e SRT, e só imprime status e contagens; não grava chave, mídia nem texto da resposta.
- `npm.cmd run test:elevenlabs:auth`: `GET /v1/user` retornou HTTP 200 e plano `free`. A chave foi aceita para esse endpoint; não prova permissão de STT.
- `npm.cmd run test:elevenlabs:live`: o POST STT retornou HTTP 401 com código `detected_unusual_activity` e `AUTH_FAILED` antes da correção; nenhum texto/tempo/SRT foi retornado. Uma segunda execução para confirmar autenticação repetiu 401. Não há prova de consumo de créditos; o código 401 indica rejeição, mas a cobrança deve ser conferida na conta se relevante.
- Descoberta de isolamento: o teste real estava inicialmente sob `e2e/` e o Playwright o descobriu, fazendo uma terceira chamada STT que também retornou 401 enquanto a suíte Playwright reportou verde. O arquivo foi movido para `integration/` e `playwright.config.cjs` agora só descobre `*.spec.cjs`. `node e2e/run.mjs test --list` mostrou apenas seis testes; a execução posterior de `npm.cmd run test:e2e` passou 6/6 sem chamadas reais. Não repetir o teste real até a restrição da ElevenLabs ser resolvida.
- A UI agora mapeia exatamente `detail.status === detected_unusual_activity` para bloqueio de atividade incomum; não chama a chave de inválida. Regressão: Jest falhou antes do patch como esperado; depois `npm.cmd test -- --runInBand` passou 46/46, E2E 6/6, build e trava de cinco contratos passaram. O fluxo real permanece bloqueado pelo serviço.

## Resposta com tempos parcialmente válidos — 2026-11-01

- O usuário transcreveu no Chrome com outra chave e enviou captura da UI: TXT disponível, SRT desabilitado, 6.034 palavras, 5.934 tempos válidos e 100 inválidos. Não houve tempos ausentes na contagem. A chave alternativa e a resposta bruta não foram acessadas pelo agente.
- Causa no código: `post-transcription-session.js` apagava todos os segmentos quando qualquer um era inválido. T025 preserva os segmentos válidos e associa texto sem tempo próprio ao trecho válido anterior, ou ao próximo quando a sequência começa sem tempo. Não inventa valores numéricos de início/fim. O SRT desses trechos é aproximadamente sincronizado e a UI avisa isso. Quando nenhum intervalo é válido, o botão permanece desabilitado.
- Testes vermelhos antes da correção: 3/16 falharam em Jest por ausência da recuperação; o novo cenário Playwright reproduz a resposta mista e confirma que o botão SRT baixa um arquivo com texto e intervalos. Após a correção: `npm.cmd test -- --runInBand` 49/49, `npm.cmd run test:e2e` 7/7 e build PASS, trava de cinco contratos íntegra.
- O gate Jest revelou que `integration/elevenlabs-live.test.mjs` era descoberto por engano e não podia ser analisado como suíte Jest. `package.json` agora exclui `integration/` da descoberta padrão. Nenhum teste real foi acionado por esse gate. A correção precisa de nova transcrição no Chrome para confirmar SRT com a resposta real; o texto/segmentos da tentativa anterior não foram persistidos.

## Legendas por frase e exportação nativa reativada — 2026-11-01

- O usuário confirmou que o SRT real funcionou com a nova chave, mas a alternativa local exibia uma palavra por vez. A função `groupCaptionSegments` agrupa palavras em trechos de até 5 s, 12 palavras e 84 caracteres, com duas linhas de até 42, quebrando em pausas e fim de frase. Os tempos de início/fim vêm das palavras extremas, sem deslocar lacunas.
- A pedido do usuário, o multipart voltou a incluir `additional_formats` com `[{"format":"srt"}]`, serializado como JSON como no SDK oficial. Se a resposta trouxer SRT nativo válido, ele tem prioridade; caso não traga, o app usa o agrupamento local. A causa do HTTP 400 anterior não foi provada. A chave funcional está no Chrome do usuário e não foi lida pelo agente; não houve nova chamada comercial nesta correção.
- TDD: 2 testes Jest falharam antes da implementação do agrupamento, 1 falhou antes da reativação de `additional_formats` e outro revelou que palavras longas criavam terceira linha. Após os ajustes, `npm.cmd test -- --runInBand` passou 52/52 e a trava de cinco contratos permaneceu íntegra. O primeiro E2E completo revelou uma asserção antiga de intervalo de uma palavra, que foi ajustada para o novo trecho agrupado; a execução final confirmou 8/8 Playwright e build. Validação com resposta nativa real segue pendente.

## HTTP 400 com a chave funcional — 2026-11-01

- Depois de reativar `additional_formats`, o usuário informou HTTP 400 com a chave que antes transcreveu sem esse campo. Isso reforça a associação entre o pedido nativo e a rejeição, mas a resposta estruturada não foi capturada e não se afirma a causa interna do provedor.
- O [GET transcript](https://elevenlabs.io/docs/api-reference/speech-to-text/get) recupera texto e palavras com tempos em JSON por `transcription_id`; não oferece parâmetro de conversão para SRT. A extensão não depende desse GET para gerar SRT.
- T027 retirou `additional_formats` novamente. O pedido volta a usar o formato que produziu transcrição real; `groupCaptionSegments` mantém legendas locais legíveis. T021 é classificada como descartada no fluxo atual. TDD: o teste do multipart falhou antes da retirada do campo. Depois, `npm.cmd test -- --runInBand` passou 52/52, `npm.cmd run test:e2e` passou 8/8 com build e a trava de cinco contratos permaneceu íntegra. A chave do Chrome não foi lida pelo agente e nenhuma nova chamada comercial foi feita nesta correção.

## Confirmação do usuário no Chrome — 2026-11-01

- Após recarregar a versão sem `additional_formats`, o usuário informou: “agora assim esta runcionando corretamente”. Pelo contexto imediato, a confirmação cobre o fluxo de transcrição com a chave funcional e o SRT local agrupado que havia motivado a correção. O agente não observou a requisição nem inspecionou o arquivo gerado nessa tentativa.
- Evidência classificada como validação manual relatada pelo usuário no Chrome com serviço real. A automação local anterior segue em 52/52 Jest e 8/8 Playwright. Captura nativa, reprodução para conferir sincronismo, quatro formatos, WebM longo e consumo de memória continuam sem validação completa; T019 permanece parcial.

## Gravação pausada e quatro formatos curtos — 2026-11-01

- Após executar o cenário sugerido de gravação com pausa/retomada e comparar o SRT com a reprodução, o usuário respondeu “feito com sucesso”. É evidência manual relatada para esse cenário no Chrome com serviço real; o agente não inspecionou a gravação, a requisição nem o SRT dessa tentativa. O modo Só Áudio e as demais checagens de T012 continuam abertos.
- A suíte Playwright agora importa quatro amostras sintéticas curtas na extensão carregada: vídeo WebM/Opus, vídeo MP4/AAC, áudio WebM/Opus e áudio MP3. Confere ausência de pedido antes do clique, multipart só de áudio, nome/MIME de saída e botão SRT habilitado com resposta ElevenLabs simulada. `npm.cmd run test:e2e` passou 11/11 com build. O teste MP4/AAC confirmou saída M4A `audio/mp4`; os dois arquivos de áudio seguiram com seus nomes e MIME originais.
- Esses testes não comprovam captura nativa, chamada comercial para cada formato nem consumo de memória de WebM longo. T015/T019 permanecem parciais.

## MP4/AAC importado no Chrome — 2026-11-01

- Depois da orientação para importar um MP4/AAC com fala e conferir a transcrição e os downloads TXT/SRT, o usuário respondeu “testado certo”. Registro como validação manual relatada no Chrome com a chave funcional. O agente não inspecionou o arquivo, o payload de rede nem os downloads dessa tentativa; o teste Playwright separado confirmou remux M4A e MIME só de áudio com resposta simulada.
- T015/T019 seguem parciais: outros formatos com serviço real, WebM longo e medição de memória ainda não foram verificados. O próximo cenário P1 é gravação em modo Só Áudio.

## Gravação Só Áudio no Chrome — 2026-11-01

- O usuário informou “funcionou com arquivo de audio tbm” e esclareceu que gravou no modo Só Áudio. Registro como validação manual relatada do fluxo P1 no Chrome, em resposta à orientação para gravar fala, transcrever e conferir TXT/SRT. O agente não inspecionou a mídia, os downloads ou a requisição dessa tentativa; a confirmação não cobre importação de MP3 ou WebM de áudio (T015).
- Novo E2E no Chromium: após uma primeira transcrição simulada, inicia outra, cancela enquanto a resposta está pendente e confirma que texto anterior e botões TXT/SRT continuam disponíveis. `npm.cmd run test:e2e` compilou a extensão e passou 12/12. O cenário usa arquivo importado e resposta simulada; não comprova Deepgram ao vivo, captura real ou cancelamento da chamada comercial.

## Evidência complementar (2026-11-02): captura simulada no Chromium (T028, parcial)

`e2e/capture.spec.cjs` grava no Chromium com tela/áudio e microfone falsos. Cobertura: gravar com pausa e retomada, WebM final com duração, vídeo e áudio; transcrever a gravação **já remuxada** com ElevenLabs simulado (payload `audio/webm`, sem `video/webm`); texto ao vivo do Deepgram simulado entregue após `CloseStream`; recuperação da gravação interrompida. `npm run test:e2e` → 22/22. T028 segue aberta: falta seletor nativo, Deepgram e ElevenLabs reais.

