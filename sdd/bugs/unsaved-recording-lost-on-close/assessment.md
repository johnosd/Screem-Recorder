# Bug Assessment: Fechar a janela perde a gravação sem aviso

- **Slug**: unsaved-recording-lost-on-close
- **Criado**: 2026-11-02
- **Origem**: texto colado (análise de melhorias da conversa)
- **Veredito**: valid
- **Severidade**: high

## Report

Item 4 da análise: não há `beforeunload`; os chunks vivem só em memória. Fechar a janela do gravador durante a gravação, ou depois dela sem baixar, perde tudo sem aviso.

## Symptom

Um clique acidental em fechar a janela descarta a gravação (e o arquivo pronto, se ainda não baixado). Esperado: o Chrome pede confirmação.

## Reproduction

1. Iniciar uma gravação (ou terminar uma e não baixar).
2. Fechar a janela do gravador. Sem aviso, tudo se perde.

## Suspected Code Paths

- `src/recorder.js` — nenhum `beforeunload`; `chunks`/`recordedBlob` só em RAM; não há marca de "baixado".

## Root Cause Hypothesis

Ausência de guarda de saída. Confiança: high.

## Proposed Remediation

**Preferida**: módulo `src/unload-guard.js` que registra `beforeunload` (com `preventDefault` e `returnValue`) enquanto `isDirty()` for verdadeiro. Em `recorder.js`, "sujo" = gravando/pausado, ou gravação pronta ainda não baixada (flag `unsavedRecording`, limpa ao baixar WebM/MP3 ou descartar).

**Alternativas**:
- Persistir chunks em IndexedDB/OPFS e recuperar na reabertura: protege também de crash, mas é maior; registrado como follow-up.

**Files likely to change**:
- `src/unload-guard.js` (novo), `src/unload-guard.test.js` (novo), `src/recorder.js`

**Tests to add or update**:
- Jest: handler só bloqueia quando `isDirty()`; `dispose` remove o listener.

## Risks & Considerations

- O Chrome só mostra o diálogo se houve interação do usuário na página (há: clique em Iniciar).
- Não protege de crash/queda de energia.

## Open Questions

- [NEEDS CLARIFICATION: confirmar o diálogo no Chrome (janela type popup).]
