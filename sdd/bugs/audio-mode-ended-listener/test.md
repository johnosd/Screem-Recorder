# Bug Verification: Parar o compartilhamento não encerra a gravação em modo só áudio

- **Slug**: audio-mode-ended-listener
- **Testado**: 2026-11-02
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Mudança aplicada e suite verde, mas o sintoma original não foi reproduzido no Chrome antes/depois.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | manual no Chrome | not-run | Exige seletor nativo do Chrome e clique em "Parar compartilhamento"; não automatizável aqui. |
| Testes novos/atualizados | `npm test` | n/a | Sem teste novo para este bug. |
| Suite de regressão | `npm test`; `npm run test:e2e` | pass | 59 testes Jest; 13/13 e2e |
| Lint / type-check | — | skipped | o projeto não tem |

## Output Excerpts

Jest: `Tests: 59 passed, 59 total`. E2E: `13 passed`.

## Residual Risks

- Fluxos de captura, permissões e áudio só são confirmáveis no Chrome (CLAUDE.md).

## Recommendation

Segurar — validar manualmente: gravar em modo Só Áudio, clicar em "Parar compartilhamento" e conferir que a tela "Gravação Concluída" aparece.

## Addendum (2026-11-02): reprodução automatizada no Chromium

Teste e2e `e2e/capture.spec.cjs` ("modo só áudio encerra ao parar o compartilhamento pelo Chrome"): grava em Chromium com tela e áudio falsos, dispara `ended` na faixa de vídeo capturada e espera a tela final. **Falha com o bug reintroduzido** (listener em `finalStream`) e **passa com a correção**.

O resultado continua **partial**: a captura foi simulada (`--auto-select-desktop-capture-source`, dispositivos falsos) e o Deepgram foi simulado; o seletor nativo e o serviço real seguem sem verificação.

