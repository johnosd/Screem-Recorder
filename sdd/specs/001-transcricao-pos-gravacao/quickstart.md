# Verificação da transcrição pós-gravação

## Pré-requisitos

- Chrome com extensão carregada sem compactação após `npm run build` e recarga em `chrome://extensions/`.
- Conta e chave ElevenLabs configurada pelo próprio usuário na UI para transcrição posterior, conectividade e cota disponível. A chave Deepgram continua para ao vivo. Não registrar chaves em captura de tela, log ou relatório.
- Amostras com fala em português e inglês: WebM de vídeo do app, MP4 com AAC, WebM de áudio e MP3; também WebM longo, vídeo sem áudio, arquivo inválido e gravação com pausa.

## Checagens automatizadas

```powershell
npm test -- --runInBand
npm run build
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao
```

## Cenários no Chrome

1. Desative transcrição ao vivo, grave fala em Vídeo + Áudio, pare e espere “arquivo pronto”. Confira que nenhuma preparação ou envio começa antes do clique, que o aviso nomeia ElevenLabs e envio de somente áudio, e que o download de WebM continua disponível.
2. Escolha PT-BR, inicie a transcrição, observe progresso real de extração e etapas de rede sem porcentagem fictícia. Na aba Network, confira que o multipart contém arquivo só de áudio, sem vídeo, e o host é ElevenLabs. Confira texto completo, TXT e SRT; reproduza o WebM com SRT e compare as falas.
3. Repita no modo Só Áudio. Grave com pausa/retomada e compare os tempos do SRT posterior com a mídia final.
4. Antes de ativar a transcrição ao vivo, confirme que a interface informa envio de áudio ao Deepgram. Depois, confirme que o texto anterior permanece visível ao iniciar retranscrição. Cancele durante processamento e confirme que texto e mídia continuam disponíveis; tente novamente. Para gravação pausada, use o processamento posterior para obter SRT sincronizado.
5. Reabra a extensão, selecione na tela inicial cada formato salvo (WebM/MP4 de vídeo; WebM/MP3 de áudio), transcreva e baixe TXT/SRT. Confira que MP4/AAC envia M4A só de áudio, e que não aparece histórico após fechar a janela.
6. Teste falta de chave, internet indisponível, arquivo inválido/sem áudio/sem fala e tentativa duplicada. Confira mensagens sem segredos e sem TXT/SRT vazios.
7. Em WebM longo, meça tempo e memória da preparação no Chrome; confirme que termina antes da duração de reprodução, que não carrega o vídeo inteiro em memória e que o áudio de saída não contém vídeo. Cancele durante a preparação e confirme fonte/texto anterior preservados. O limite documentado de 5 GB deve ser aplicado ao áudio preparado, não ao vídeo de origem. Se o serviço retornar timeout, confirme mensagem recuperável sem descartar fonte.

## Registro de evidência

Anote separadamente: `npm test`, `npm run build`, integridade dos contratos, prova de remux Node, Chrome local e ElevenLabs real. Registre tamanho de vídeo/áudio, tempo de extração, pico aproximado de memória e presença apenas de áudio no payload. Se não houver Chrome, chave, cota ou amostras, registre cada cenário como pendente; não o marque como validado.
