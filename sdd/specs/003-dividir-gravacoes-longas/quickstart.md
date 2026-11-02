# Quickstart: verificação da feature 003

Separe sempre o que foi provado **localmente** (Jest), no **Chromium simulado** (captura falsa, limite reduzido por URL) e com **Chrome real e partes de verdade** (pendente até ser feito).

## 1. Pré-requisitos

- `npm install`, `npm run build`.
- Extensão carregada em `chrome://extensions/` (raiz do repositório, sem compactação) e recarregada após o build.
- Para reduzir o limite em testes manuais, abra `recorder.html?partLimitBytes=2000000` (2 MB; valores fora de 50 mil a 1,4 bilhão voltam ao padrão). Isso **não** existe para o usuário final.

## 2. Checagens automatizadas

```powershell
npm test
npm run build
npm run test:e2e
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 003-dividir-gravacoes-longas
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 002-escolha-provedor-transcricao
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao
```

Esperado: contratos 003 5/5 verdes, as três travas íntegras, contagens Jest e e2e iguais às anotadas na T001 mais os testes novos.

## 3. Cenário ponta a ponta (Chrome real, limite reduzido)

1. Abrir `recorder.html?partLimitBytes=3000000`, escolher Vídeo + Áudio e gravar uns 40 s mexendo na tela (para haver frames) e falando.
2. Observar o indicador "Parte 2", "Parte 3"… na tela de gravação; o cronômetro **não** reinicia.
3. Parar. A tela final lista as partes na ordem com nome, duração e tamanho.
4. Baixar cada parte e abrir no player: duração correta, avanço funcionando, áudio e vídeo.
5. Somar as durações das partes e comparar com o cronômetro: a diferença deve ser menor que 1 s por troca.
6. **Baixar todas**: conferir que o Chrome pede permissão para vários downloads e que os arquivos chegam na ordem `..._parte-01.webm`, `_parte-02.webm`…
7. Transcrever a parte 1 com um provedor e a parte 2 com o outro; conferir que cada parte guarda o próprio texto e que o SRT de cada uma acompanha o arquivo dela.
8. Durante uma transcrição, tentar iniciar outra em outra parte: o botão fica indisponível.
9. Repetir em Só Áudio.
10. Gravar sem chegar ao limite: tela final, nome do arquivo e MP3 do modo áudio iguais aos de antes.

## 4. Recuperação

1. Com duas ou mais partes fechadas e uma em andamento, fechar a janela (ou matar a aba) e reabrir `recorder.html`.
2. Aparece o aviso com as partes encontradas; **Recuperar** abre a lista.
3. Baixar uma parte, recarregar: ela não volta. Baixar todas ou descartar: nada a recuperar.

## 5. Itens a confirmar no Chrome real (Princípio IV)

- A lacuna real entre partes com captura de tela e áudio do sistema reais (R-001; medido só com captura simulada).
- Memória e disco com partes de **1,4 GB** de verdade e o remux em paralelo com a gravação (R-003, R-004).
- Comportamento em tela estática: parte nova sem frames por um tempo (R-002).
- "Baixar todas" e o aviso de múltiplos downloads (R-005).

## 6. Pre-acceptance (constitution)

- Nenhum envio novo; a transcrição por parte mostra o aviso do provedor escolhido (feature 002).
- `npm test` e `npm run build` registrados; fluxos de captura e áudio no Chrome real verificados ou declarados pendentes.
