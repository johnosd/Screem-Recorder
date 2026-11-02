# Bug Verification: Transcrição ao vivo perde o trecho final da fala

- **Slug**: deepgram-final-transcript-lost
- **Testado**: 2026-11-02
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

O fechamento ordenado está coberto por teste unitário, mas não foi confirmado com o Deepgram real que o `CloseStream` devolve os últimos `is_final`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | manual no Chrome | not-run | Exige chave Deepgram real e fala ao vivo; não rodado (rede/credencial). |
| Testes novos/atualizados | `npm test` | pass | 5 testes do `closeDeepgramSocket`. |
| Suite de regressão | `npm test`; `npm run test:e2e` | pass | 59 testes Jest; 13/13 e2e |
| Lint / type-check | — | skipped | o projeto não tem |

## Output Excerpts

Jest: `Tests: 59 passed, 59 total`. E2E: `13 passed`.

## Residual Risks

- Fluxos de captura, permissões e áudio só são confirmáveis no Chrome (CLAUDE.md).

## Recommendation

Segurar — gravar com chave Deepgram real, falar e parar logo em seguida, e conferir que a última frase aparece no TXT.
