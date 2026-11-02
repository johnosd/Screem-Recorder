# Bug Fix: Fechar a janela perde a gravação sem aviso

- **Slug**: unsaved-recording-lost-on-close
- **Corrigido**: 2026-11-02
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Novo `createUnloadGuard` registra `beforeunload` e pede confirmação enquanto há gravação ativa/pausada ou gravação pronta ainda não baixada (`unsavedRecording`).

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/unload-guard.js` | added | `createUnloadGuard(target, isDirty)` |
| `src/unload-guard.test.js` | added | 2 testes |
| `src/recorder.js` | modified | flag `unsavedRecording` (ligada em `doStop`, limpa ao baixar WebM/MP3, descartar ou gravação vazia); guard registrado |

## Tests Added or Updated

- `src/unload-guard.test.js` — bloqueia só quando sujo; `dispose` remove o listener.

## Local Verification

- Comandos rodados: `npm test`, `npm run build`, `npm run test:e2e` → `npm test` 59 passam; `npm run build` ok; e2e 13/13 (o guard não bloqueou o fechamento do contexto).
- Checagens manuais: nenhuma (sem verificação no Chrome).

## Deviations from Assessment

Nenhum.

## Follow-ups

- Validação manual no Chrome (ver test.md).
