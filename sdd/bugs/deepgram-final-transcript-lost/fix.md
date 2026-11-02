# Bug Fix: Transcrição ao vivo perde o trecho final da fala

- **Slug**: deepgram-final-transcript-lost
- **Corrigido**: 2026-11-02
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Novo `closeDeepgramSocket` envia `CloseStream`, aguarda o fechamento pelo servidor (timeout 3 s) e só então fecha. `onstop` espera essa promessa antes de gravar o texto ao vivo na sessão.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/deepgram-live.js` | added | `closeDeepgramSocket(socket, timeoutMs)` |
| `src/deepgram-live.test.js` | added | 5 testes com socket falso |
| `src/recorder.js` | modified | `stopTranscription` devolve a promessa; `doStop` guarda em `transcriptClosing`; `onstop` aguarda antes de `setExistingTranscript` (com guarda de identidade do recorder e try/catch) |

## Tests Added or Updated

- `src/deepgram-live.test.js` — envia CloseStream, resolve no close, timeout, socket nulo/fechado/conectando, falha no envio.

## Local Verification

- Comandos rodados: `npm test`, `npm run build`, `npm run test:e2e` → `npm test` 59 passam (7 novos nos 2 módulos); `npm run build` ok; e2e 13/13.
- Checagens manuais: nenhuma (sem verificação no Chrome).

## Deviations from Assessment

Nenhum.

## Follow-ups

- Validação manual no Chrome (ver test.md).
