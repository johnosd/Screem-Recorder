# 🔴 Screen & Audio Recorder — Extensão Chrome

Extensão Chrome (Manifest V3) para gravar a tela e áudio da aba atual, com timer visível e opção de pausar/retomar.

---

## 📦 Instalação

1. **Descompacte** o arquivo `screen-recorder-extension.zip` em uma pasta no seu computador
2. Abra o Chrome e vá para `chrome://extensions/`
3. Ative o **Modo de desenvolvedor** (toggle no canto superior direito)
4. Clique em **"Carregar sem compactação"** (Load unpacked)
5. Selecione a pasta `screen-recorder-extension`
6. Pronto! O ícone 🔴 aparecerá na barra de extensões

---

## 🎬 Como Usar

### Gravar
1. Navegue até a aba que deseja gravar
2. Clique no ícone da extensão
3. Escolha o modo: **Vídeo + Áudio** ou **Só Áudio**
4. Clique em **"Iniciar Gravação"**
5. O Chrome pedirá permissão — confirme

### Durante a Gravação
- O **timer** mostra o tempo decorrido em tempo real
- Use **Pausar** para interromper temporariamente (o timer pisca em amarelo)
- Use **Retomar** para continuar a gravação
- Clique em **Parar** quando terminar

### Baixar
- Após parar, clique em **"Baixar .webm"** para salvar o arquivo
- Ou clique em **"Descartar"** para apagar a gravação

---

## 🔧 Detalhes Técnicos

| Item | Detalhe |
|------|---------|
| Manifest | V3 |
| Formato | WebM (VP9 + Opus) |
| Captura | `chrome.tabCapture` API |
| Áudio | Tab audio + Microfone (mixados) |
| Gravação | `MediaRecorder` API via Offscreen Document |
| Bitrate vídeo | 5 Mbps |
| Bitrate áudio | 128 kbps |

### Permissões Utilizadas
- `tabCapture` — capturar áudio/vídeo da aba
- `offscreen` — contexto DOM para MediaRecorder
- `storage` — salvar preferências (futuro)

---

## 📁 Estrutura de Arquivos

```
screen-recorder-extension/
├── manifest.json        # Configuração da extensão
├── background.js        # Service worker (gerencia estado)
├── offscreen.html       # Documento offscreen (shell)
├── offscreen.js         # MediaRecorder (gravação real)
├── popup.html           # Interface do usuário
├── popup.js             # Lógica da interface
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## ⚠️ Limitações

- **Somente grava a aba atual** (não grava tela inteira/desktop)
- O arquivo é **WebM** (reproduzível no Chrome, VLC, Firefox). Para MP4, converta com ffmpeg:
  ```bash
  ffmpeg -i gravacao.webm -c:v libx264 -c:a aac gravacao.mp4
  ```
- O microfone é opcional: se não houver permissão, grava apenas o áudio da aba
- O popup precisa estar aberto para ver o timer (a gravação continua em background mesmo fechando)

---

## 🎨 Personalização

A interface usa CSS variables facilmente editáveis em `popup.html`:

```css
--accent: #f24c5e;      /* Cor principal (vermelho) */
--green: #34d399;        /* Cor do botão download */
--bg-primary: #0a0a0f;  /* Fundo escuro */
```
