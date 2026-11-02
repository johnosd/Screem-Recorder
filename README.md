# Screen & Audio Recorder

Extensão Chrome (Manifest V3) para gravar tela e áudio, transcrever ao vivo e transcrever gravações ou arquivos salvos sob demanda.

---

## Funcionalidades

- Grava **tela + áudio do sistema** (Meet, YouTube, etc.) ou **só áudio**
- **Microfone opcional** — mixado automaticamente com o áudio do sistema
- **Pausa / retomada** durante a gravação
- **Auto-minimiza** ao iniciar e **auto-restaura** ao parar — a janela nunca aparece no que você compartilha
- Download em **.webm** (vídeo) ou **.mp3** (áudio, via conversão local)
- **Transcrição em tempo real** via Deepgram (~300ms de latência)
- **Transcrição após gravação** por **ElevenLabs Scribe v2 ou Deepgram Nova-3**, à sua escolha, mesmo sem transcrição ao vivo
- Importação de vídeo WebM/MP4 e áudio WebM/MP3 para transcrever sem nova captura
- Download do texto completo em **.txt** e de legendas em **.srt** após resultado com tempos válidos

---

## Build

O projeto usa Webpack para empacotar os fontes de `src/` para `dist/`.

```bash
npm install        # instala dependências (só na primeira vez)
npm run build      # compila uma vez
npm run dev        # recompila automaticamente ao salvar
```

> **Não edite `dist/` manualmente** — tudo que está lá é gerado pelo build.

---

## Testes automatizados no navegador

Todos os testes ficam em `tests/`: `tests/unit` (Jest, espelhando `src/`), `tests/e2e` (Playwright), `tests/integration` (teste real da ElevenLabs) e `tests/fixtures` (mídias de teste).

```bash
npm test                  # Jest (tests/unit)
npm run test:e2e:install  # uma vez: baixa o Chromium de testes
npm run test:e2e          # build + Playwright com a extensão carregada
```

O teste usa mídia sintética e resposta simulada da ElevenLabs. Os eventos de console, service worker e rede ficam em `test-results/`; em falhas, também há trace e screenshot. Consulte [a estratégia de teste no navegador](sdd/specs/001-transcricao-pos-gravacao/browser-testing.md) e [as evidências da feature](sdd/specs/001-transcricao-pos-gravacao/qa-evidence.md).

Há também testes reais do Deepgram para arquivo gravado: `npm run test:deepgram:auth` valida a chave `DEEPGRAM_API_KEY` do `.env` sem áudio e `npm run test:deepgram:live` transcreve a mesma amostra e confere os formatos aceitos (podem consumir créditos; a saída não traz chave nem texto). Para incluir os casos com fala em PT-BR e inglês, em MP3, MP4 e WebM, e um arquivo longo, gere as amostras antes com `tests/integration/generate-speech-samples.ps1` (precisa de `ffmpeg`; saem em `%TEMP%`, fora do repositório).

O teste real da ElevenLabs é separado: `npm run test:elevenlabs:auth` valida a chave do `.env` sem áudio; `npm run test:elevenlabs:live` transcreve a amostra com fala em `%TEMP%\screen-recorder-stt-eval-20261031\sample01.webm` pelo mesmo cliente do app e pode consumir créditos. Nenhum dos dois integra o Playwright ou o Jest padrão. A saída mostra somente status e contagens, sem chave nem texto transcrito.

---

## Instalação

1. Rode `npm run build` para gerar a pasta `dist/`
2. Abra `chrome://extensions/`
3. Ative o **Modo de desenvolvedor** (toggle no canto superior direito)
4. Clique em **Carregar sem compactação** e selecione a raiz deste repositório
5. O ícone aparece na barra de extensões

Após qualquer alteração no código, rode `npm run build` e clique em **recarregar** na página de extensões.

---

## Como usar

### Gravar

1. Clique no ícone da extensão — uma janela separada abre
2. Escolha o modo: **Vídeo + Áudio** ou **Só Áudio**
3. Clique em **Iniciar Gravação**
4. O Chrome abre o seletor nativo — escolha a tela, janela ou aba
5. A janela minimiza automaticamente; a gravação corre em background
6. Para pausar ou parar, clique no ícone da extensão para restaurar a janela
7. Após parar, espere a mensagem **Arquivo .webm pronto** (aparece "Finalizando arquivo..." enquanto o contêiner é ajustado). Fechar a janela durante a gravação, ou antes de baixar o arquivo, pede confirmação. O mesmo arquivo final pode ser baixado ou transcrito.

### Transcrição ao vivo (opcional)

A transcrição ao vivo envia áudio da captura à [Deepgram](https://deepgram.com) enquanto o toggle estiver ativo.

**Configuração inicial (uma vez):**

1. Crie conta em deepgram.com → Console → API Keys → Create Key
2. Na extensão, abra ⚙ **Configurações**, cole a API key e clique em **Salvar** — a key é validada e armazenada localmente
3. O campo volta preenchido (oculto) nas próximas aberturas; use o ícone de olho para ver a chave. O texto ao lado diz se ela está salva, se há alterações não salvas ou se não há chave
4. Marque o toggle **Transcrição em tempo real** na tela inicial

**Durante a gravação:** o texto aparece ao vivo no painel da extensão.

**Após parar:** o texto reconhecido aparece completo e pode ser baixado em TXT. Se a gravação foi pausada, transcreva o arquivo final para gerar SRT sincronizado com a reprodução.

### Transcrição após a gravação

1. Grave em **Vídeo + Áudio** ou **Só Áudio** e espere o arquivo ficar pronto. Também é possível selecionar um arquivo salvo na tela inicial: vídeo WebM/MP4 ou áudio WebM/MP3.
2. Escolha o **serviço de transcrição** (ElevenLabs ou Deepgram) e **Português (Brasil)** ou **Inglês**. Cada serviço usa a própria chave, salva em ⚙ Configurações; o Deepgram usa a mesma chave da transcrição ao vivo. O último serviço escolhido é lembrado. Sem a chave do serviço escolhido o app só orienta a configurá-la, sem enviar nada.
3. Leia o aviso e clique em **Transcrever áudio**. Para vídeos, a extensão separa localmente a faixa de áudio sem alterar o original e envia somente o áudio ao serviço escolhido ([ElevenLabs](https://elevenlabs.io) ou [Deepgram](https://deepgram.com)); o aviso na tela cita o serviço. Nada vai ao outro serviço, e nenhuma preparação ou envio ocorre antes do clique.
4. Acompanhe a preparação e o aguardo da resposta. É possível cancelar ou tentar novamente. Uma falha preserva a mídia e o texto anterior da janela.
5. Após uma transcrição com texto, a tela indica quem a gerou ("Transcrito por …") e permite baixar TXT e SRT. É possível transcrever de novo com o outro serviço: o resultado anterior só é substituído quando o novo conclui. O app gera legendas locais agrupadas em frases curtas usando os tempos por palavra retornados pelo serviço. Palavras sem tempo próprio são associadas às vizinhas; esses trechos têm sincronização aproximada, informada na tela. Se não houver intervalos confiáveis, só o TXT fica disponível. Mídia sem fala não gera arquivos vazios.

O áudio preparado deve ter menos de 5 GB conforme o limite da API. Um codec que não possa ser copiado para WebM/Opus ou M4A/AAC é recusado sem enviar vídeo. O cancelamento local impede que uma resposta tardia altere a tela, mas não garante a interrupção de processamento ou cobrança já iniciados no serviço. As transcrições não baixadas ficam apenas na janela atual; ao fechá-la, esse estado se perde. A gravação feita no app é copiada em IndexedDB enquanto grava e só é apagada ao baixar o arquivo ou descartar; se a janela ou o Chrome fechar antes, a tela inicial oferece **Recuperar** ou **Descartar** na próxima abertura (iniciar nova gravação descarta a cópia).

---

## Estrutura

```
screen-recorder/
├── src/
│   ├── recorder.js          # captura e interface da janela
│   ├── post-transcription-session.js  # tentativa, cancelamento e resultado em memória
│   ├── post-transcription-audio.js    # cópia da faixa de áudio
│   ├── post-transcription-client.js   # preparação e chamada do provedor
│   ├── post-transcription-providers/elevenlabs.js
│   ├── subtitles.js         # SRT
│   ├── background.js        # service worker
│   ├── popup.js             # abre a janela do gravador (ou restaura se já aberta)
│   ├── audio-processor.js   # AudioWorkletProcessor — coleta PCM para o Deepgram
│   ├── mp3-worker.js        # codifica MP3 em Worker (lamejs)
│   ├── webm-finalize.js     # regrava o WebM com duração/seek
│   ├── recording-profile.js # perfis de qualidade da gravação
│   ├── deepgram-live.js     # CloseStream e KeepAlive do Deepgram
│   ├── unload-guard.js      # confirmação ao fechar com gravação não salva
│   ├── recovery-store.js    # cópia de segurança da gravação em IndexedDB
│   └── utils/
│       └── timer.js         # formata mm:ss
├── tests/
│   ├── unit/                # Jest; espelha src/ (inclui os testes de contrato)
│   ├── e2e/                 # Playwright com a extensão no Chromium
│   ├── integration/         # teste real da ElevenLabs (fora do npm test)
│   └── fixtures/            # mídias de teste
├── fonts/                   # DM Sans e JetBrains Mono locais (OFL)
├── dist/                    # gerado pelo webpack — não editar
├── lib/
│   └── lame.min.js          # encoder MP3 (roda no browser)
├── recorder.html            # UI principal — todos os estados (idle / rec / done)
├── popup.html               # HTML mínimo do popup do ícone
├── manifest.json
├── webpack.config.js
└── package.json
```

---

## Arquitetura

```
Clique no ícone
      ↓
  popup.js → chrome.windows.create (janela popup separada)
      ↓
  recorder.html carrega
      ↓
  navigator.mediaDevices.getDisplayMedia() → seletor do Chrome
      ↓
  getUserMedia() opcional para microfone
      ↓
  Web Audio API — mix de sistema + microfone
      ↓
  ┌─────────────────────┬──────────────────────────┐
  │   MediaRecorder     │   AudioWorklet (PCM)      │
  │   → onstop/Blob     │   → WebSocket Deepgram    │
  │   → .webm / .mp3    │   → texto ao vivo         │
  └─────────────────────┴──────────────────────────┘
      ↓ após clique explícito
  Mediabunny copia somente áudio → ElevenLabs Scribe v2 → TXT/SRT
```

---

## Detalhes técnicos

| Item | Detalhe |
|------|---------|
| Manifest | V3 |
| Formato de vídeo | WebM (VP9 + Opus) |
| Qualidade | Escolhida em ⚙ Configurações: Alta (1080p30, 8 Mbps vídeo, 160 kbps áudio), Equilibrada (padrão: 1080p30, 5 Mbps, 128 kbps) ou Econômica (720p24, 2,5 Mbps, 96 kbps) |
| Arquivo final | Contêiner WebM regravado ao parar, sem recodificar, para ter duração e permitir avançar o vídeo (acima de 1,5 GB mantém o original) |
| Transcrição ao vivo | Deepgram nova-3 |
| Transcrição posterior | ElevenLabs Scribe v2 (limite 5 GB) ou Deepgram Nova-3 (limite 2 GB), à escolha; áudio WebM/MP3 ou M4A extraído localmente |
| Armazenamento | `chrome.storage.local` (chaves separadas Deepgram e ElevenLabs); resultados só na memória da janela; cópia de segurança da gravação em IndexedDB (`recorder-recovery`) até baixar ou descartar |

### Permissões

| Permissão | Uso |
|-----------|-----|
| `tabs` | detectar se a janela do gravador já está aberta |
| `windows` | abrir como popup e controlar minimizar/restaurar |
| `storage` | salvar as chaves Deepgram e ElevenLabs localmente |
| Hosts Deepgram e ElevenLabs | áudio ao vivo e áudio posterior, respectivamente |

---

## Limitações

- **Só Chrome** — a extensão usa Manifest V3 e APIs de captura do navegador
- **Transcrição requer internet** — Deepgram no fluxo ao vivo; ElevenLabs ou Deepgram no posterior, conforme sua escolha
- A extensão não identifica falantes nem mantém histórico; salve os arquivos que deseja conservar.
- Para converter o WebM para MP4:
  ```bash
  ffmpeg -i gravacao.webm -c:v libx264 -c:a aac gravacao.mp4
  ```
