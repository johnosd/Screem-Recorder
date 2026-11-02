# Bug Assessment: Parar o compartilhamento não encerra a gravação em modo só áudio

- **Slug**: audio-mode-ended-listener
- **Criado**: 2026-11-02
- **Origem**: texto colado (análise de melhorias da conversa)
- **Veredito**: valid
- **Severidade**: medium

## Report

Item 1 da análise: o listener `ended` é registrado em `finalStream.getVideoTracks()`. Em modo áudio o `finalStream` não contém faixas de vídeo, então o botão nativo "Parar compartilhamento" do Chrome não dispara `doStop()`.

## Symptom

Em modo "só áudio", ao clicar em "Parar compartilhamento" no Chrome, a gravação continua (timer e MediaRecorder ativos) apesar de a captura de tela ter acabado. O esperado é encerrar como no modo vídeo.

## Reproduction

1. Escolher modo "Só Áudio" e iniciar a gravação.
2. Clicar em "Parar compartilhamento" na barra nativa do Chrome.
3. Observado: a gravação segue. Esperado: `doStop()` é chamado.

[NEEDS CLARIFICATION: não reproduzido no Chrome; conclusão baseada na leitura do código.]

## Suspected Code Paths

- `src/recorder.js:298` — `finalStream.getVideoTracks().forEach(... 'ended' ...)`; em modo áudio `finalStream` só tem faixas de áudio (linhas 219-227).

## Root Cause Hypothesis

As faixas de vídeo do `captureStream` só entram no `finalStream` quando `mode === 'video'`. O listener está ligado ao stream errado. A faixa de vídeo do `captureStream` continua existindo em modo áudio e dispara `ended` quando o usuário para o compartilhamento. Confiança: high.

## Proposed Remediation

**Preferida**: registrar o listener em `captureStream.getVideoTracks()` (que existe em ambos os modos).

**Alternativas**:
- Também escutar as faixas de áudio do sistema: rejeitada, o `ended` do vídeo já cobre o "parar compartilhamento".

**Files likely to change**:
- `src/recorder.js`

**Tests to add or update**:
- Sem unit test viável (depende de `getDisplayMedia`); verificação manual no Chrome.

## Risks & Considerations

- Em modo vídeo as mesmas faixas estão no `finalStream`, então o comportamento não muda. `doStop()` já é idempotente (`stopping`).

## Open Questions

- Nenhuma além da reprodução no Chrome.
