# Bug Verification: Fechar a janela perde a gravação sem aviso

- **Slug**: unsaved-recording-lost-on-close
- **Testado**: 2026-11-02
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Lógica do guard testada em unidade; o diálogo real do Chrome não foi observado.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | manual no Chrome | not-run | Diálogo `beforeunload` na janela popup do Chrome não verificado manualmente. |
| Testes novos/atualizados | `npm test` | pass | 2 testes do `createUnloadGuard`. |
| Suite de regressão | `npm test`; `npm run test:e2e` | pass | 59 testes Jest; 13/13 e2e |
| Lint / type-check | — | skipped | o projeto não tem |

## Output Excerpts

Jest: `Tests: 59 passed, 59 total`. E2E: `13 passed`.

## Residual Risks

- Fluxos de captura, permissões e áudio só são confirmáveis no Chrome (CLAUDE.md).

## Recommendation

Segurar — fechar a janela durante a gravação e depois de parar sem baixar; conferir o diálogo. Follow-up: persistir chunks em IndexedDB para sobreviver a crash.

## Addendum (2026-11-02): reprodução automatizada no Chromium

Teste e2e ("fechar a janela gravando pede confirmação..."): o diálogo `beforeunload` do Chromium aparece com a gravação em andamento e depois de parar sem baixar, e deixa de aparecer após baixar o WebM. Também há o teste de recuperação ("gravação interrompida pela queda da janela é recuperada...").

O resultado continua **partial**: a captura foi simulada (`--auto-select-desktop-capture-source`, dispositivos falsos) e o Deepgram foi simulado; o seletor nativo e o serviço real seguem sem verificação.

