# Research: Escolha do provedor da transcrição pós-gravação

Fase 0 do `sdd-plan`. Fontes: documentação do Deepgram consultada em 2026-11-02 (Context7, `developers.deepgram.com`), código do repositório e a ADR-001. Nada aqui foi confirmado com chave real: itens marcados **(a confirmar)** entram no `quickstart.md`.

## 1. API de arquivo gravado do Deepgram

**Decisão**: `POST https://api.deepgram.com/v1/listen?model=nova-3&language=<pt-BR|en>&punctuate=true&smart_format=true`, com `Authorization: Token <chave>`, `Content-Type` igual ao MIME do áudio preparado e **corpo binário bruto** (o próprio `Blob`).

**Justificativa**: é o formato documentado para enviar um arquivo local (`--data-binary @arquivo`). O host `https://api.deepgram.com/*` já está em `host_permissions` do `manifest.json`, então não há permissão nova. O áudio preparado hoje (WebM/Opus, M4A, MP3) é aceito pelo Deepgram, que detecta o contêiner. **(a confirmar com M4A e WebM/Opus)**

**Alternativas**: enviar `{ "url": ... }` (exigiria hospedar o arquivo, contra a regra de enviar só o áudio direto); usar o WebSocket (é o fluxo ao vivo, que não cabe em arquivos longos).

## 2. Resposta e tempos

**Decisão**: ler `results.channels[0].alternatives[0]`: `transcript` (texto) e `words[]` com `word`, `punctuated_word`, `start`, `end` (segundos). Segmentos = `{ start, end, text: punctuated_word || word }`. `timingInfo` usa a mesma contagem válido/ausente/inválido do adaptador da ElevenLabs. `srt` fica `null`: o SRT é gerado localmente por `groupCaptionSegments` + `buildSrt`, como já ocorre.

**Justificativa**: o Deepgram sempre devolve tempos por palavra, sem os itens `spacing` que a ElevenLabs inclui. Reaproveitar a normalização evita regras de SRT duplicadas (FR-006).

**Alternativas**: usar `utterances=true` para frases prontas (descartado: o agrupamento local já tem testes e comportamento validado no Chrome real).

## 3. Idiomas

**Decisão**: `pt-BR` → `language=pt-BR`; `en` → `language=en`, ambos com `model=nova-3`.

**Justificativa**: o changelog do Deepgram lista `pt`, `pt-BR` e `pt-PT` no Nova-3 em lote e em streaming. O fluxo ao vivo do app já usa `nova-3`. **(a confirmar em arquivo gravado)**

## 4. Limites e tempo

**Decisão**: limite de **2 GB** por arquivo para o Deepgram (documentação) contra os 5 GB já usados para a ElevenLabs; a checagem acontece antes do envio, sobre o áudio preparado. Tempo máximo do cliente: o mesmo `timeoutMs` de 30 minutos do adaptador atual.

**Justificativa**: a documentação cita processamento de até 10 minutos por arquivo; o timeout do cliente é só o teto de espera e erros 408/504 viram `TIMEOUT`. **(a confirmar o limite real e o comportamento com arquivos longos)**

## 5. Erros HTTP

**Decisão**: 401 e 403 → `AUTH_FAILED`; 402 → `PAYMENT_REQUIRED` (créditos esgotados, código novo); 413 → `AUDIO_TOO_LARGE`; 400 e 422 → `REQUEST_REJECTED` (só `httpStatus`); 429 → `RATE_LIMITED`; 408 e 504 → `TIMEOUT`; 5xx → `SERVICE_UNAVAILABLE`; falha de `fetch` → `NETWORK_ERROR`. O corpo da resposta e a chave nunca entram na mensagem. **(402 a confirmar)**

**Justificativa**: espelha `statusCode()` do adaptador da ElevenLabs, para a interface tratar os dois do mesmo jeito, trocando só o nome do serviço.

## 6. Reorganização de testes

**Decisão**: mover para `tests/unit`, `tests/e2e`, `tests/integration` e `tests/fixtures`, ajustando: caminhos relativos nos testes, `root` e fixtures nos helpers e2e, `testDir` do `playwright.config.cjs`, caminho do `e2e/run.mjs`, scripts do `package.json` e a configuração do Jest.

**Justificativa**: o Jest já ignora `/e2e/` e `/integration/` por `testPathIgnorePatterns`; o webpack tem entradas explícitas, então testes e fixtures não entram em `dist/`. O teste de contrato da 001 muda apenas as linhas de `import` (hash muda), por isso exige a emenda aprovada pelo proprietário e a trava regravada.

**Alternativas**: deixar `src/fixtures` onde está (descartado: FR-014 exige `src/` sem fixtures); `__tests__` junto de cada módulo (descartado pelo pedido de uma pasta `tests/`).

## 7. ADR-001

A ADR-001 prevê exatamente este caso: "se seleção de provedores virar requisito de produto, especificar a interface e a política de chaves em uma feature própria", usando o contrato de adaptador e "adicionar somente a permissão de host necessária". Nenhuma ADR nova é necessária: o provedor padrão não muda (ElevenLabs na primeira abertura) e o fluxo ao vivo permanece Deepgram. Recomenda-se, no Polish, registrar no `## Status` da ADR-001 que a feature 002 concretizou a seleção, via `sdd-adr` se o proprietário quiser a emenda formal.
