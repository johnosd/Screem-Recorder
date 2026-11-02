# Lógica: sessão de transcrição posterior

Interface pública a criar em `src/post-transcription-session.js`:

```js
createPostTranscriptionSession({ transcribe })
  .setSource({ blob, name, origin, kind })
  .setExistingTranscript({ text, segments, language, origin: 'live' })
  .start({ language, confirmedExternalSend }) // Promise<snapshot>
  .cancel()
  .getSnapshot()
  .subscribe(listener) // retorna unsubscribe
```

`transcribe({ media, language, signal, onStage })` é colaborador injetado; a janela o conecta a `src/post-transcription-client.js` com a chave ElevenLabs. O cliente prepara somente áudio e chama o adaptador de provedor; a sessão não conhece o formato da API. O resultado padronizado é `{ text, segments, language, origin: 'post' }`. A UI não acessa estado privado da sessão.

## Transições

1. `setSource` recebe um `Blob`/`File` pronto e válido, marca `ready`. No fluxo de gravação, só chamar em `MediaRecorder.onstop`; antes disso, a UI mostra “finalizando gravação”. No fluxo de arquivo, chamar após seleção e validação inicial de tipo. O limite de tamanho é verificado no áudio preparado.
2. `start` exige fonte pronta, idioma aceito, `confirmedExternalSend === true` e nenhuma tentativa ativa. Se faltar algo, rejeita com código estável (`MEDIA_NOT_READY`, `CONSENT_REQUIRED`, `ALREADY_RUNNING` etc.) sem fazer rede.
3. Ao iniciar, criar `AbortController` e `attemptId` novos; publicar `processing` e etapas `preparando áudio`, `enviando` e `aguardando resposta`. Progresso percentual só na preparação, quando medido. A preparação não inicia antes da ação explícita. O resultado anterior continua no snapshot e nos botões de download durante a tentativa.
4. Ao concluir, conferir se `attemptId` ainda é o ativo. Normalizar texto e segmentos. Texto vazio leva a `no-speech`. Texto não vazio substitui o anterior e habilita TXT; SRT requer exportação nativa válida ou ao menos um intervalo válido no resultado. Palavras sem tempo próprio são agrupadas às vizinhas com tempos válidos.
5. `cancel` aborta a preparação ou requisição e invalida imediatamente o `attemptId`; publica `cancelled` e conserva fonte e resultado anterior. Uma resposta tardia nunca altera o snapshot. Cancelar o cliente após o envio não garante interromper trabalho ou cobrança no serviço.
6. Falha de rede/serviço publica `error` sem incluir chave, payload ou mensagem bruta sensível. `start` posterior reutiliza a mesma fonte sem regravação.
7. `setSource` durante `processing` é rejeitado. Após conclusão, cancelamento ou falha, selecionar outro arquivo substitui a fonte da sessão e limpa o resultado associado à fonte antiga; não cria histórico.

## Formatação SRT

`src/subtitles.js` exporta `buildSrt(segments)`, `recoverTimedSegments(segments)` e `groupCaptionSegments(segments)`. A transcrição posterior pede tempos por palavra à ElevenLabs e os agrupa localmente em legendas de até 5 s, 12 palavras, 84 caracteres e duas linhas de 42 caracteres, separando pausas superiores a 0,75 s e frases encerradas por pontuação. Cada trecho usa tempos `start/end` da mídia final, em `HH:MM:SS,mmm`, na ordem original, sem comprimir lacunas de silêncio ou pausa. Quando parte das palavras não tem intervalo válido, seu texto é agrupado ao trecho válido vizinho; os valores numéricos continuam os retornados pelo serviço. A UI informa que esses trechos têm sincronização aproximada. Sem nenhum intervalo válido, o SRT fica indisponível. Se uma gravação pausada tem apenas texto ao vivo, a UI preserva TXT e oferece retranscrição para obter SRT sincronizado. O adaptador ainda aceita um SRT nativo válido caso a resposta o contenha, mas não o solicita porque `additional_formats` coincidiu com HTTP 400 em testes reais.

## Estados visíveis

`ready`: arquivo identificado, idioma e aviso de extração local/envio de somente áudio à ElevenLabs visíveis; `processing`: etapa e Cancelar; `completed`: texto completo e downloads; `cancelled`/`error`: motivo e Tentar novamente sem perder fonte; `no-speech`: aviso, sem downloads vazios. Uma segunda tentativa ativa é bloqueada.
