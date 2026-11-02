# Quickstart: verificação da feature 002

Separe sempre o que foi provado **localmente** (Jest, Playwright com rede simulada), no **Chromium simulado** (captura falsa) e com **serviço ou Chrome reais**. Só o terceiro grupo comprova o comportamento com os provedores.

## 1. Pré-requisitos

- `npm install`, `npm run build`.
- Chaves próprias do usuário em ⚙ Configurações: Deepgram e ElevenLabs. **Nunca** colar chaves em arquivos do repositório, relatórios ou testes.
- Extensão carregada em `chrome://extensions/` (raiz do repositório, sem compactação) e recarregada após o build.

## 2. Checagens automatizadas

```powershell
npm test
npm run build
npm run test:e2e
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 002-escolha-provedor-transcricao
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao
git ls-files | grep -E "\.(test|spec)\.|fixtures/" | grep -v "^tests/"    # deve ficar vazio
```

Esperado ao final: contratos 002 5/5 verdes, trava 001 íntegra no novo caminho, contagens Jest e e2e iguais às anotadas na T001 mais os testes novos, nenhum arquivo de teste fora de `tests/`.

## 3. Cenário ponta a ponta (Chrome real, chaves reais)

1. Em ⚙ Configurações, salvar as duas chaves; conferir "✓ salva" nas duas.
2. Gravar uns 20 s de fala em Só Áudio e parar.
3. Na tela final, escolher **Deepgram**, idioma **Português (Brasil)**, ler o aviso (cita Deepgram) e clicar em transcrever.
4. Conferir texto, "Transcrito por Deepgram (pt-BR)", download de TXT e SRT e a sincronia do SRT com a reprodução.
5. Trocar para **ElevenLabs**, transcrever de novo: o texto antigo fica visível durante o processamento e é substituído só ao concluir; o rótulo muda.
6. Repetir com um vídeo (Vídeo + Áudio) e com os quatro formatos importados (WebM e MP4 de vídeo, WebM e MP3 de áudio) para o Deepgram.
7. Recarregar a janela: o seletor volta com o último provedor.

## 4. Itens a confirmar com o serviço real (R-002, R-007)

- O Deepgram aceita o áudio **M4A** e o **WebM/Opus** preparados localmente.
- `nova-3` com `pt-BR` e com `en` em arquivo gravado devolve texto e tempos por palavra.
- O código HTTP para créditos esgotados (esperado 402) e o limite de arquivo (2 GB).
- Chave que funciona no ao vivo e é recusada (ou não) no arquivo gravado.
- Arquivo longo (WebM de vários minutos): tempo de resposta e `TIMEOUT`.

## 5. Estados de erro (podem ser simulados no e2e; confirmar uma vez no real)

- Provedor sem chave: orientação para ⚙ Configurações e nenhuma requisição.
- Chave inválida de cada provedor: mensagem cita o serviço correto.
- Sem rede: erro com "Tentar novamente"; o outro provedor **não** é sugerido.

## 6. Pre-acceptance (constitution)

- Aviso de envio visível e correto antes do clique, para cada provedor (Princípio II).
- Chaves ausentes de logs, relatórios e testes (busca por trechos de chave).
- `npm test` e `npm run build` registrados; fluxos de captura/áudio/transcrição verificados no Chrome ou declarados pendentes (Princípio IV).
