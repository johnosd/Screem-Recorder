# Screen & Audio Recorder

Extensão Chrome (Manifest V3) para gravar tela e áudio com transcrição em tempo real.

---

## Funcionalidades

- Grava **tela + áudio do sistema** (Meet, YouTube, etc.) ou **só áudio**
- **Microfone opcional** — mixado automaticamente com o áudio do sistema
- **Pausa / retomada** durante a gravação
- **Auto-minimiza** ao iniciar e **auto-restaura** ao parar — a janela nunca aparece no que você compartilha
- Download em **.webm** (vídeo) ou **.mp3** (áudio, via conversão local)
- **Transcrição em tempo real** via Deepgram (~300ms de latência)
- Download da transcrição em **.txt** (texto corrido) ou **.srt** (legendas sincronizadas com o vídeo)

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

1. Clique no ícone da extensão — uma janela separada abre (não uma aba)
2. Escolha o modo: **Vídeo + Áudio** ou **Só Áudio**
3. Clique em **Iniciar Gravação**
4. O Chrome abre o seletor nativo — escolha a tela, janela ou aba
5. A janela minimiza automaticamente; a gravação corre em background
6. Para pausar ou parar, clique no ícone da extensão para restaurar a janela

### Transcrição (opcional)

A transcrição usa a [API do Deepgram](https://deepgram.com) — plano gratuito inclui 200 horas/mês.

**Configuração inicial (uma vez):**

1. Crie conta em deepgram.com → Console → API Keys → Create Key
2. Na extensão, marque o toggle **Transcrição em tempo real**
3. Cole a API key e clique em **Salvar** — a key é validada e armazenada localmente

**Durante a gravação:** o texto aparece ao vivo no painel da extensão.

**Após parar:** dois botões de download ficam disponíveis:
- **Baixar .txt** — transcrição corrida em texto plano
- **Baixar .srt** — legendas com timecodes, salvas com o mesmo nome do vídeo para carregamento automático em players como VLC e MPV

---

## Estrutura

```
screen-recorder/
├── src/
│   ├── recorder.js          # lógica principal: captura, áudio, transcrição, download
│   ├── background.js        # service worker — único contexto que pode chamar desktopCapture
│   ├── popup.js             # abre a janela do gravador (ou restaura se já aberta)
│   ├── audio-processor.js   # AudioWorkletProcessor — coleta PCM para o Deepgram
│   └── utils/
│       └── timer.js         # formata mm:ss
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
  "request-desktop-capture" → background.js
      ↓
  chrome.desktopCapture.chooseDesktopMedia() → streamId
      ↓
  getUserMedia (chromeMediaSource: desktop)
      ↓
  Web Audio API — mix de sistema + microfone
      ↓
  ┌─────────────────────┬──────────────────────────┐
  │   MediaRecorder     │   AudioWorklet (PCM)      │
  │   → chunks[]        │   → WebSocket Deepgram    │
  │   → .webm / .mp3    │   → .txt / .srt           │
  └─────────────────────┴──────────────────────────┘
```

---

## Detalhes técnicos

| Item | Detalhe |
|------|---------|
| Manifest | V3 |
| Formato de vídeo | WebM (VP9 + Opus) |
| Bitrate vídeo | 5 Mbps |
| Bitrate áudio | 128 kbps |
| Resolução máxima | 1920 × 1080 @ 30fps |
| Transcrição | Deepgram nova-2, ~300ms latência |
| Áudio enviado | PCM linear16, mono, 16kHz |
| Armazenamento | `chrome.storage.local` (API key) |

### Permissões

| Permissão | Uso |
|-----------|-----|
| `desktopCapture` | seletor nativo para capturar tela/aba/janela |
| `tabs` | detectar se a janela do gravador já está aberta |
| `activeTab` | contexto da aba ativa |
| `windows` | abrir como popup e controlar minimizar/restaurar |
| `storage` | salvar a API key do Deepgram localmente |

---

## Limitações

- **Só Chrome** — `desktopCapture` não está disponível em outros navegadores
- **Transcrição requer internet** durante a gravação (áudio é enviado ao Deepgram)
- **Um único fluxo de texto** — o Deepgram não separa vozes; o SRT reflete os segmentos finais sem diarização
- Para converter o WebM para MP4:
  ```bash
  ffmpeg -i gravacao.webm -c:v libx264 -c:a aac gravacao.mp4
  ```
