# Bug Fix: Parar o compartilhamento não encerra a gravação em modo só áudio

- **Slug**: audio-mode-ended-listener
- **Corrigido**: 2026-11-02
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

O listener `ended` passou a ser registrado nas faixas de vídeo do `captureStream` (presentes nos dois modos), não do `finalStream`.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/recorder.js` | modified | listener `ended` em `captureStream.getVideoTracks()` |

## Tests Added or Updated

- Nenhum teste automatizado: depende de `getDisplayMedia` real; sem unit test viável.

## Local Verification

- Comandos rodados: `npm test`, `npm run build`, `npm run test:e2e` → 59 testes passam; `npm run build` ok; e2e 13/13.
- Checagens manuais: nenhuma (sem verificação no Chrome).

## Deviations from Assessment

Nenhum.

## Follow-ups

- Validação manual no Chrome (ver test.md).
