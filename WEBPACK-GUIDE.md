# Como configurar Webpack em uma Chrome Extension

## Pré-requisitos

- Node.js instalado (`node --version` para verificar)

---

## Passo 1 — Inicializar o projeto Node

```bash
npm init -y
```

Gera o `package.json` na raiz do projeto.

---

## Passo 2 — Instalar o Webpack

```bash
npm install --save-dev webpack webpack-cli
```

---

## Passo 3 — Criar a estrutura de pastas

```bash
mkdir src
mv background.js popup.js recorder.js src/
```

Mova todos os arquivos JS principais para `src/`. A pasta `dist/` será criada automaticamente pelo webpack.

```
minha-extensao/
├── src/           ← você escreve aqui
│   ├── background.js
│   ├── popup.js
│   └── recorder.js
├── dist/          ← webpack gera isso (não editar manualmente)
├── manifest.json
├── popup.html
├── webpack.config.js
└── package.json
```

---

## Passo 4 — Criar o webpack.config.js

Crie na raiz do projeto:

```js
const path = require('path')

module.exports = {
  mode: 'development',
  devtool: 'cheap-source-map',  // obrigatório para Chrome Extensions (evita uso de eval())

  entry: {
    background: './src/background.js',
    popup: './src/popup.js',
    recorder: './src/recorder.js',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
  },
}
```

> **Atenção:** o `devtool: 'cheap-source-map'` é obrigatório. O modo `development` padrão usa `eval()`,
> que é bloqueado pela Content Security Policy das extensões Chrome.

---

## Passo 5 — Adicionar scripts no package.json

```json
"scripts": {
  "build": "webpack",
  "dev": "webpack --watch"
}
```

- `npm run build` → compila uma vez
- `npm run dev` → recompila automaticamente ao salvar

---

## Passo 6 — Atualizar o manifest.json

Aponte o service worker para o bundle gerado:

```json
"background": {
  "service_worker": "dist/background.bundle.js"
}
```

---

## Passo 7 — Atualizar os HTMLs

Em `popup.html` e `recorder.html`, atualize as tags `<script>`:

```html
<!-- antes -->
<script src="popup.js"></script>

<!-- depois -->
<script src="dist/popup.bundle.js"></script>
```

---

## Passo 8 — Arquivos estáticos (ex: AudioWorklet)

Arquivos carregados em runtime (como AudioWorkletProcessor) não são entry points — precisam ser copiados para `dist/` via plugin.

```bash
npm install --save-dev copy-webpack-plugin
```

No `webpack.config.js`:

```js
const CopyPlugin = require('copy-webpack-plugin')

// dentro de module.exports:
plugins: [
  new CopyPlugin({
    patterns: [
      { from: './src/audio-processor.js', to: 'audio-processor.js' },
    ],
  }),
],
```

No código, atualize o caminho:

```js
// antes
audioContext.audioWorklet.addModule(chrome.runtime.getURL('audio-processor.js'))

// depois
audioContext.audioWorklet.addModule(chrome.runtime.getURL('dist/audio-processor.js'))
```

---

## Passo 9 — Criar o .gitignore

```
node_modules/
dist/
```

`dist/` é gerado pelo build — não precisa ir para o git.
`node_modules/` tem centenas de MB — quem clonar o repo roda `npm install` para recriar.

---

## Passo 10 — Rodar o build

```bash
npm run build
```

Verifique que `dist/` foi criado com os bundles. Depois carregue a extensão no Chrome apontando para a **raiz do projeto** (não para `dist/`).

---

## Usar import/export entre arquivos

Com webpack configurado, você pode modularizar o código:

```js
// src/utils/timer.js
export function fmt(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
```

```js
// src/recorder.js
import { fmt } from './utils/timer.js'
```

O webpack segue os `import` automaticamente — não precisa declarar cada módulo no `entry`.

---

## Fluxo de desenvolvimento diário

```
Terminal: npm run dev          ← deixa rodando, recompila ao salvar
Editor:   edita src/           ← trabalha aqui
Chrome:   recarrega a extensão ← F5 em chrome://extensions/ após cada mudança
```
