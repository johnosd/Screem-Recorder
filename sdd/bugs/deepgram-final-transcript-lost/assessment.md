# Bug Assessment: Transcrição ao vivo perde o trecho final da fala

- **Slug**: deepgram-final-transcript-lost
- **Criado**: 2026-11-02
- **Origem**: texto colado (análise de melhorias da conversa)
- **Veredito**: valid
- **Severidade**: medium

## Report

Item 2 da análise: `stopTranscription` fecha o WebSocket do Deepgram imediatamente, sem enviar `{"type":"CloseStream"}` e sem esperar os últimos resultados finais.

## Symptom

Ao parar a gravação, a última frase (ainda em `interim` ou em processamento no servidor) não entra em `transcriptFull`. Esperado: o texto final inclui tudo que foi falado até o fim.

## Reproduction

1. Ativar transcrição ao vivo com chave Deepgram válida e gravar.
2. Falar uma frase e parar logo em seguida.
3. A frase final falta no texto/TXT. [NEEDS CLARIFICATION: não reproduzido com a API real.]

## Suspected Code Paths

- `src/recorder.js:580-587` — `stopTranscription()` chama `deepgramSocket.close()` direto.
- `src/recorder.js:272-290` — `onstop` copia `transcriptFull` para a sessão no momento do stop, antes de qualquer resultado tardio.
- `src/recorder.js:563-574` — `onmessage` só acumula `is_final`.

## Root Cause Hypothesis

Fechar o socket sem `CloseStream` descarta o buffer do servidor (a documentação do Deepgram prevê `CloseStream` para flush dos resultados pendentes). Além disso, o texto é copiado para a sessão antes de chegarem resultados tardios. Confiança: medium-high.

## Proposed Remediation

**Preferida**: novo módulo `src/deepgram-live.js` com `closeDeepgramSocket(socket, timeoutMs)`: envia `CloseStream`, aguarda `close` (ou timeout de 3 s) e então fecha. `doStop()` guarda a promessa; `onstop` envia `setExistingTranscript` somente depois dela.

**Alternativas**:
- Atraso fixo antes do `close()`: rejeitada, arbitrária e sem garantia.

**Files likely to change**:
- `src/deepgram-live.js` (novo), `src/deepgram-live.test.js` (novo), `src/recorder.js`

**Tests to add or update**:
- Jest: socket falso — envia `CloseStream` quando aberto, resolve no `close`, resolve por timeout, não faz nada com socket nulo/fechado.

## Risks & Considerations

- Atrasa a transcrição disponível em até 3 s (a mídia fica disponível antes).
- Descartar a gravação durante a espera: usar guarda de identidade do `mediaRecorder`.

## Open Questions

- [NEEDS CLARIFICATION: comportamento real do Deepgram no `CloseStream` só confirmável com a API.]
