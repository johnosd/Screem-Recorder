# Modelo de dados em memória

Não há banco de dados nem histórico. Chaves separadas para Deepgram ao vivo e ElevenLabs posterior ficam no `chrome.storage.local`; mídia, áudio preparado, tentativas e resultados ficam na janela atual até o usuário baixar arquivos ou encerrar a sessão.

## Mídia de origem

| Campo | Significado |
| --- | --- |
| `blob` | `Blob` final da gravação ou `File` selecionado; permanece inalterado durante a preparação |
| `name` | Nome base para downloads e identificação na interface |
| `origin` | `recorded` ou `selected` |
| `kind` | `video` ou `audio` |
| `mimeType` | Tipo efetivo WebM, MP4 ou MP3; conteúdo inválido ainda pode falhar no serviço |
| `ready` | Verdadeiro só após `onstop` ou seleção válida de arquivo |

Uma fonte recém-gravada não é trocada por um novo arquivo enquanto houver tentativa ativa. Descartar ou sair da janela segue o ciclo de vida da sessão definido na spec.

## Áudio preparado (transitório)

| Campo | Significado |
| --- | --- |
| `blob` | Áudio WebM/MP3 original ou faixa copiada de vídeo para WebM/Opus ou M4A/AAC |
| `mimeType` | Tipo real do arquivo de áudio enviado à ElevenLabs |
| `name` | Nome com extensão correspondente ao áudio preparado |
| `size` | Bytes usados para validar o limite do serviço |

O preparador confirma que o resultado contém áudio e nenhuma faixa de vídeo antes do envio. Não grava esse objeto no disco nem o mantém após a tentativa. Codec incompatível ou falha de recursos gera erro recuperável.

## Transcrição

| Campo | Significado |
| --- | --- |
| `text` | Texto completo, nunca uma prévia truncada |
| `segments` | Trechos com `start` e `end` em segundos da mídia final e texto correspondente |
| `language` | `pt-BR` ou `en` |
| `origin` | `live` ou `post` |

O resultado ao vivo existente é mantido até uma nova transcrição posterior terminar com texto e segmentos válidos. Falha, cancelamento ou ausência de fala não o substitui. TXT usa `text`; SRT usa `segments` e nunca é disponibilizado vazio.

## Tentativa de transcrição

| Campo | Significado |
| --- | --- |
| `attemptId` | Identificador crescente para ignorar respostas tardias de tentativa cancelada/substituída |
| `status` | `ready`, `processing`, `completed`, `cancelled`, `error` ou `no-speech` |
| `stage` | Etapa informativa de processamento, sem porcentagem inventada |
| `abortController` | Cancela a requisição da tentativa ativa |
| `error` | Categoria para mensagem na UI; nunca inclui chave ou corpo sensível do serviço |

Somente uma tentativa pode estar ativa por janela. O `attemptId` e o controlador são detalhes transitórios, não dados persistidos.
