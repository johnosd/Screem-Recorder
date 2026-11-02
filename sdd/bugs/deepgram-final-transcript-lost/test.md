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

## Addendum (2026-11-02): reprodução automatizada no Chromium

Teste e2e ("Deepgram: CloseStream entrega o trecho final..."): WebSocket simulado com `routeWebSocket`; o servidor só responde o trecho final ao receber `CloseStream`. **Falha com o bug reintroduzido** (`socket.close()` direto) e **passa com a correção**. Também confirma que a pausa interrompe os frames de áudio e envia `KeepAlive`.

O resultado continua **partial**: a captura foi simulada (`--auto-select-desktop-capture-source`, dispositivos falsos) e o Deepgram foi simulado; o seletor nativo e o serviço real seguem sem verificação.

## Addendum (2026-11-02): risco aceito

O item 12 do roteiro único (última frase com o Deepgram real) **não foi executado**. O proprietário aceitou o risco em 2026-11-02: se o problema reaparecer, abrir um novo bugfix. O resultado permanece **partial**, e não é apresentado como verificado. O `CloseStream` está provado por e2e com WebSocket simulado e a chave real do Deepgram abriu o WebSocket ao vivo (handshake), sem fala em tempo real.

