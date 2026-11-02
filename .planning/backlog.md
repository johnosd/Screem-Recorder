# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

[feat] como usuario quero que o app grave arquivos de audio e video no formato mais eficiente possivel focando em qualidade e performance

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 001-transcricao-pos-gravacao | Transcrição pós-gravação de vídeos e áudios | Convergência Pendente | 29/38 tasks | 2026-11-02 |
| 002-escolha-provedor-transcricao | Escolha do provedor da transcrição pós-gravação | Convergência Pendente | 41/42 tasks | 2026-11-02 |
| 003-dividir-gravacoes-longas | Divisão automática de gravações longas em partes | Em Execução | 16/33 tasks | 2026-11-02 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
| 2026-11-02 | Interface (recorder.html, src/recorder.js, e2e) | Ícone de engrenagem no canto do card abre um painel "Configurações" (substitui as telas enquanto aberto, botão "Voltar") com as chaves Deepgram e ElevenLabs, movidas da tela inicial e do painel pós-gravação; os IDs dos campos foram mantidos, então a lógica de salvar/validar não mudou. Mensagens de chave ausente agora apontam para ⚙ Configurações. Descartado: modal/aba nova e uma view extra em `view()`, por mexerem no estado da gravação sem necessidade. Validado: `npm test` (52 ok), `npm run build` ok, e2e Playwright 13/13 (helper `saveElevenLabsKey` abre as configurações; teste novo cobre abrir/voltar). Sem lint/type-check no projeto. Verificação visual no Chrome não feita. |
| 2026-11-02 | Gravação (src/webm-finalize.js, src/recorder.js) | Ao parar, o WebM do MediaRecorder é regravado com `mediabunny` em modo cópia (sem recodificar) para ganhar duração e índice de seek; acima de 1,5 GB ou em qualquer falha mantém o arquivo original. Validado: Jest (fixture append-only sem duração → duração nos metadados, faixas preservadas), build e e2e. Não verificado no Chrome com gravação real nem o tempo de remux em gravações longas. |
| 2026-11-02 | Gravação / Configurações (src/recording-profile.js, recorder.html, e2e) | Perfis de qualidade Alta / Equilibrada (padrão, igual ao comportamento anterior) / Econômica em ⚙ Configurações, persistidos em `chrome.storage.local`; controlam resolução, fps e bitrates. Mantido WebM VP9+Opus: AV1 em software pesa na gravação em tempo real e MP4 exigiria mexer no pipeline de transcrição. Validado: Jest, build, e2e 14/14 (teste novo de persistência). A ideia de formato "mais eficiente" segue no backlog só para MP4/AV1. |
| 2026-11-02 | Manutenção geral (recorder.js, webpack, manifest, docs, fonts/) | MP3 codificado em Worker (`src/mp3-worker.js`) com progresso no botão; fontes DM Sans/JetBrains Mono locais em `fonts/` (sem Google Fonts); `downloadBlob`/`timestamp` únicos (`src/utils/download.js`) no lugar de 4 blocos duplicados; pausa interrompe o envio de áudio ao Deepgram e mantém a conexão com `KeepAlive`; Deepgram `nova-2` → `nova-3` (pt-BR suportado conforme changelog); log limitado a 300 linhas e timer do `showErr` sem empilhar; `npm run build:prod` (recorder.bundle.js 2,4 MB → 0,6 MB); `package.json` (versão, descrição, `main`) e `.gitignore` limpos; permissão `activeTab` removida (não usada); CLAUDE.md/README atualizados. Validado: Jest 72, build, e2e 15/15 (worker de MP3 e ausência de requisições a fontes externas). Não verificado no Chrome com captura real: nova-3 com chave Deepgram, KeepAlive na pausa, conversão MP3 de gravação longa. O SRT ao vivo continua bloqueado após pausa até confirmar que os tempos batem com o arquivo. |
| 2026-11-02 | Gravação (src/recovery-store.js, src/recorder.js, recorder.html, e2e) | Cópia de segurança da gravação em IndexedDB a cada chunk (1 s); na abertura, se houver gravação interrompida, a tela inicial oferece Recuperar (remux e vai para a tela final, pronta para baixar ou transcrever) ou Descartar. A cópia só é apagada ao baixar WebM/MP3 ou descartar; iniciar nova gravação a substitui. Os chunks continuam também em RAM (não reduz o uso de memória). Validado: Jest 76 (fake-indexeddb), build, e2e 16/16 (semeia o banco, recupera e descarta). Não verificado no Chrome com crash real, nem o custo de disco em gravações longas. |
| 2026-11-02 | Testes e2e de captura (e2e/capture.spec.cjs, e2e/helpers.cjs) | Gravação real no Chromium com tela/áudio e microfone falsos (`--auto-select-desktop-capture-source`, `--use-fake-device-for-media-stream`). Cobre pausa/retomada, WebM final com duração, "parar compartilhamento" em modo só áudio, aviso de saída, recuperação após queda, transcrição da gravação remuxada e Deepgram simulado (`CloseStream`, pausa com `KeepAlive`). Os testes dos bugs 1 e 2 falham com o bug reintroduzido. `withExtension` movido para `helpers.cjs`. e2e 22/22. Não substitui o seletor nativo nem os serviços reais. |
| 2026-11-02 | Testes e2e de erros (e2e/errors.spec.cjs) | 8 testes dos estados de erro da transcrição posterior: sem chave, sem rede, HTTP 429/503/504, arquivo corrompido, vídeo sem áudio e tipo discrepante/vazio, sempre verificando que nenhuma requisição indevida é feita. Passaram de primeira, sem mudança de código. |
| 2026-11-02 | Configurações / chaves (recorder.html, src/recorder.js, e2e) | As duas chaves de API agora voltam preenchidas (ocultas) ao abrir as Configurações, com ícone de olho para mostrar/ocultar (oculta de novo ao voltar). O status ao lado do campo diz se a chave está salva, se há alterações não salvas, se o campo foi esvaziado (a chave salva continua em uso) ou se não há chave. A ElevenLabs deixou de ser limpa após salvar. Validado: build, e2e (teste novo) e conferência visual por captura de tela. |

## Bugs

| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
| audio-mode-ended-listener | Parar o compartilhamento não encerra a gravação em modo só áudio | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-11-02 |
| deepgram-final-transcript-lost | Transcrição ao vivo perde o trecho final da fala | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-11-02 |
| unsaved-recording-lost-on-close | Fechar a janela perde a gravação sem aviso | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-11-02 |
