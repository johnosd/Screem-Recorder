# Lógica: adaptador por provedor, registro e sessão

Delimita o "como" onde um executor poderia decidir mal. Os testes de contrato travados (`tests/unit/post-provider-choice.contract.test.js`) definem o comportamento; este arquivo explica o porquê e fixa as assinaturas.

## Registro de provedores (`src/post-transcription-providers/index.js`, novo)

```js
export const DEFAULT_PROVIDER = 'elevenlabs';

export const PROVIDERS = {
  elevenlabs: { id: 'elevenlabs', label: 'ElevenLabs', keyStorage: 'elevenLabsKey',
    maxBytes: 5_000_000_000, transcribe: transcribeWithElevenLabs },
  deepgram:   { id: 'deepgram',   label: 'Deepgram',   keyStorage: 'deepgramKey',
    maxBytes: 2_000_000_000, transcribe: transcribeWithDeepgram }
};

export function isProvider(id) { return Object.hasOwn(PROVIDERS, id); }   // Object.hasOwn: 'toString' não é provedor
```

- `maxBytes` é a fonte única do limite. A constante `MAX_AUDIO_BYTES` de `post-transcription-client.js` passa a vir daqui. A comparação continua sendo `audio.size >= maxBytes` (igual ao código atual).
- `keyStorage` é só a chave de `chrome.storage.local`. O cliente nunca lê storage: quem chama (`recorder.js`) resolve a chave do provedor e a passa em `key`.

## Cliente (`transcribePreRecorded`)

Assinatura nova, retrocompatível: `{ media, language, key, provider = DEFAULT_PROVIDER, signal, onStage, fetchImpl }`.

```
se language não é 'pt-BR'|'en'  -> INVALID_LANGUAGE
se !isProvider(provider)        -> INVALID_PROVIDER
se !key?.trim()                 -> KEY_REQUIRED          (antes de preparar ou enviar qualquer coisa)
audio = prepareAudio(...)       (igual hoje)
se audio.size >= PROVIDERS[provider].maxBytes -> AUDIO_TOO_LARGE   (antes de qualquer fetch)
se signal.aborted -> CANCELLED
onStage('sending'); pending = PROVIDERS[provider].transcribe({ audio, language, key, signal, fetchImpl }); onStage('waiting'); return pending
```

Invariante: a chave e o áudio só chegam ao adaptador do provedor escolhido. `fetchImpl` é repassado, para os contratos e testes simularem a rede.

## Adaptador Deepgram (`transcribeWithDeepgram`)

Mesma forma de `transcribeWithElevenLabs` (timeout, abort encadeado, mapeamento de erros). Diferenças:

```
url = 'https://api.deepgram.com/v1/listen?' + new URLSearchParams({
  model: 'nova-3', language: language /* 'pt-BR' | 'en' */, punctuate: 'true', smart_format: 'true' })
fetchImpl(url, { method: 'POST',
  headers: { Authorization: 'Token ' + key.trim(), 'Content-Type': audio.mimeType },
  body: audio.blob, signal })
```

- O `body` é o próprio `Blob` (o contrato compara por identidade), nunca `FormData`.
- Cabeçalhos em objeto simples (o contrato lê `options.headers.Authorization` e `['Content-Type']`).
- Resposta: `alternative = data?.results?.channels?.[0]?.alternatives?.[0]`; `text = alternative.transcript.trim()`; `words = alternative.words` (array, senão `[]`).
- Segmento: `{ start: w.start, end: w.end, text: w.punctuated_word ?? w.word }`.
- `timingInfo`: mesma contagem do adaptador atual. Extrair para `src/post-transcription-providers/timed-words.js` (`summarizeTiming(words)` com `{ start, end, text }`) e reusar nos dois, sem alterar os testes existentes da ElevenLabs.
- Retorno: `{ text, segments, srt: null, timingInfo, language, origin: 'post' }`.
- Erros: ver tabela na `research.md` (§5). `PAYMENT_REQUIRED` é código novo. Nunca incluir chave, cabeçalhos nem corpo bruto em mensagem, `cause` ou propriedades do erro (o contrato 5 serializa o erro inteiro).

## Sessão (`createPostTranscriptionSession`)

- `start({ language, provider = DEFAULT_PROVIDER, confirmedExternalSend })`: valida `isProvider(provider)` (`INVALID_PROVIDER`) **antes** de publicar `processing`, junto das demais validações de entrada, de modo que um provedor inválido não altera o estado.
- Chama `transcribe({ media, language, provider, signal, onStage })`.
- Em sucesso, `transcript.provider = provider`. Em falha ou cancelamento, `transcript` anterior fica intacto, inclusive o `provider` dele.
- `setExistingTranscript` (transcrição ao vivo) define `provider: 'deepgram'` e `origin: 'live'`.
- Sem `provider`, o comportamento é idêntico ao da feature 001 (contrato da 001 continua válido sem alteração).

## Interface (`recorder.js` / `recorder.html`)

- `#post-provider` (select) com `elevenlabs` e `deepgram`; `renderPostState` o desabilita enquanto `status === 'processing'`.
- O aviso (`#post-notice`) é montado com `PROVIDERS[selecionado].label`: "…somente o áudio será enviado à {label}…". Mensagens de erro e dicas viram funções de `label` (hoje há "ElevenLabs" fixo em `postMessages`, no aviso e em `#post-key-status`).
- `AUDIO_TOO_LARGE` cita o limite do provedor escolhido (5 GB ou 2 GB).
- Resultado concluído mostra "Transcrito por {label} ({idioma})" a partir de `transcript.provider`; para `origin: 'live'`, "Transcrição ao vivo (Deepgram)".
- Chave ausente: `getProviderKey(provider)` vazio → `KEY_REQUIRED` → "Informe e salve a chave {label} em ⚙ Configurações". Nunca oferecer o outro provedor.
- Preferência: `chrome.storage.local` chave `postProvider` (`'elevenlabs' | 'deepgram'`); valor desconhecido cai em `DEFAULT_PROVIDER`.
