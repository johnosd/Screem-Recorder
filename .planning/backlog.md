# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

[feat] como usuario quero que o app grave arquivos de audio e video no formato mais eficiente possivel focando em qualidade e performance

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 001-transcricao-pos-gravacao | Transcrição pós-gravação de vídeos e áudios | Em Execução | 29/37 tasks | 2026-11-01 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
| 2026-11-02 | Interface (recorder.html, src/recorder.js, e2e) | Ícone de engrenagem no canto do card abre um painel "Configurações" (substitui as telas enquanto aberto, botão "Voltar") com as chaves Deepgram e ElevenLabs, movidas da tela inicial e do painel pós-gravação; os IDs dos campos foram mantidos, então a lógica de salvar/validar não mudou. Mensagens de chave ausente agora apontam para ⚙ Configurações. Descartado: modal/aba nova e uma view extra em `view()`, por mexerem no estado da gravação sem necessidade. Validado: `npm test` (52 ok), `npm run build` ok, e2e Playwright 13/13 (helper `saveElevenLabsKey` abre as configurações; teste novo cobre abrir/voltar). Sem lint/type-check no projeto. Verificação visual no Chrome não feita. |

## Bugs

| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
