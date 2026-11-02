# Research: transcrição pós-gravação

## 1. Formato de gravação e preparação de áudio

**Decisão**: manter `MediaRecorder` em WebM com VP9/VP8 e Opus para vídeo e WebM/Opus para Só Áudio. Para transcrever vídeo, separar localmente apenas a faixa de áudio por remux, gerando WebM/Opus ou M4A/AAC sem decodificar nem recodificar quando possível. Áudio WebM e MP3 pode ser enviado diretamente. Não usar `encodeMp3()` para transcrição: ele decodifica o arquivo inteiro.

**Evidência local**: prova temporária com Mediabunny 1.63.0 (`BlobSource`, `Conversion`, `video.discard`, `copy.mode = 'forced'`). Um vídeo WebM do app de 7 s passou de 2.090.080 B para áudio WebM de 114.449 B em 0,1 s. Um WebM do app de ~78 min passou de 1.061.485.414 B para áudio de 75.311.033 B em 3,6 s. Um MP4 H.264/AAC representativo de 7 s passou a M4A de 88.660 B em menos de 1 s. `ffprobe` confirmou somente áudio e durações compatíveis. Os originais permaneceram intactos. Essa prova foi em Node local, **não** no Chrome da extensão nem em todos os codecs MP4. Os arquivos temporários e a dependência não foram adicionados ao projeto.

**Justificativa e tradeoff**: `BlobSource` lê sob demanda sem carregar o vídeo inteiro em um `ArrayBuffer`. Copiar pacotes codificados evita esperar a duração de reprodução e reduz os bytes enviados. `Conversion.init()` permite verificar se há faixa de áudio utilizável; `Conversion` permite progresso e cancelamento. O bundle ganha uma dependência; a saída de áudio ainda ocupa recursos. Testar memória com vídeo longo no Chrome e usar saída em chunks quando possível. MP4 com codec incompatível deve falhar claramente, sem enviar vídeo como fallback. [Mediabunny: conversão](https://mediabunny.dev/guide/conversion), [Mediabunny: leitura](https://mediabunny.dev/guide/reading).

## 2. Envio e limites

**Decisão**: usar ElevenLabs Scribe v2 em `POST https://api.elevenlabs.io/v1/speech-to-text`, com `FormData` contendo somente áudio, `model_id=scribe_v2`, `language_code=pt|en`, tempos por palavra e diarização/eventos desligados. Chave `xi-api-key` lida em runtime de `chrome.storage.local`, separada da Deepgram ao vivo. A resposta é normalizada no adaptador. Adicionar host ElevenLabs ao manifesto e manter o host Deepgram. [ElevenLabs: Speech to Text](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [Chrome: requisições](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

Validar o tamanho do **áudio preparado** contra o limite documentado de 5 GB para arquivo e os recursos reais do navegador; não bloquear vídeo só porque ele ultrapassa esse tamanho. Mostrar progresso local real na extração e etapa de envio/aguardo sem percentual inventado. `AbortController` interrompe o cliente e a tentativa é invalidada; isso não garante cancelamento de processamento ou cobrança já iniciados no servidor. [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).

**Alternativas**: enviar o vídeo completo (mais bytes e dados de imagem); gravar áudio auxiliar em paralelo (duplica captura e não resolve vídeos importados); reproduzir o vídeo para capturar áudio (tempo real); converter tudo para MP3 (CPU, memória e possível perda de qualidade); backend (infraestrutura e retenção adicionais).

**PCM bruto como alternativa de latência**: a [API de Speech-to-Text da ElevenLabs](https://elevenlabs.io/docs/api-reference/speech-to-text/convert) aceita `file_format=pcm_s16le_16` para áudio PCM de 16 bits, 16 kHz, mono e little-endian, e declara latência menor que a de uma entrada codificada. Isso não demonstra menor tempo **total** para esta extensão. PCM nesse perfil ocupa 32.000 bytes/s: ~149 MB para o vídeo de ~78 min da prova, contra ~75 MB do áudio Opus separado localmente em 3,6 s; ainda seria necessário decodificar, reamostrar e converter o áudio no Chrome. A documentação não declara ganho de precisão. Manter WebM/Opus e M4A/AAC no primeiro caminho, com `file_format` omitido (padrão `other`); considerar PCM somente se medições no Chrome e no serviço, com as mesmas amostras, demonstrarem ganho de tempo ponta a ponta sem perda relevante de qualidade ou uso excessivo de memória. PCM bruto não é um arquivo WAV com cabeçalho.

## 3. Finalização e tempos de legendas

Criar o `Blob` e habilitar transcrição apenas em `MediaRecorder.onstop`, após o último `dataavailable`. Usar tempos que a API devolve para o áudio do arquivo final. Validar duração e alinhamento do remux em gravação com pausa no Chrome; a prova local cobriu vídeos sem pausa. Preservar o texto ao vivo anterior até um novo resultado completo. [MDN: evento stop](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop_event).

## 4. Escolha do serviço e extensibilidade

O usuário escolheu ElevenLabs Scribe v2 para arquivos após a comparação de quatro trechos PT-BR com Deepgram Nova-3. Termos técnicos favoreceram preliminarmente ElevenLabs; sem referência humana não há WER. Inglês, arquivo longo e Chrome permanecem por validar. Soniox não tinha saldo e AssemblyAI não tinha chave. [Avaliação](provider-evaluation.md) e [ADR-001](../../adr/ADR-001-provedores-transcricao-por-modalidade-adaptador.md) registram evidência e contrato de adaptador. Novo provedor posterior entra por outro adaptador, sem reescrever sessão ou captura.
