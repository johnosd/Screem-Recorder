# Roteiro único de validação no Chrome real

Reúne, em uma só sessão e em ordem, tudo o que as features 001, 002 e 003 e os bugs corrigidos ainda **não** provaram fora do Chromium simulado. Os testes automatizados (Jest 129, e2e 64) já passam; aqui o que vale é o **Chrome de verdade**, a **captura nativa**, as **chaves reais** e o **tamanho real**.

**Tempo estimado**: 1h30 a 2h, mais ~30 min de gravação contínua no Bloco G (opcional). Os blocos são independentes; faça na ordem para reaproveitar gravações.

**Regras**: nunca cole chaves em capturas de tela, logs ou relatórios; confira o payload na aba **Network** do DevTools da página `recorder.html` (clique com o botão direito na janela, Inspecionar). Anote cada resultado em "Resultado". Quando terminar, **me diga o que passou e o que falhou**: eu registro nos `qa-evidence.md`, fecho as tasks e corrijo o que falhar.

| Task / item que isto fecha | Bloco |
| --- | --- |
| 001 T012, T015, T019; 001 T028 (remux → transcrição) | D, E |
| 002 T032 | B, D |
| 003 T028 | G, H |
| Bugs 1, 2 e 4 (relatórios em `sdd/bugs/`, resultado `partial`) | B, C |
| Itens de análise sem Chrome: permissão do microfone (9), `nova-3` e KeepAlive reais, MP3 longo (6), seek do WebM (5) | B, C, F |

**Progresso (2026-11-02)**: **Blocos A e B validados** pelo proprietário no Chrome real (itens 1 a 10). **Blocos C a H não executados: risco aceito pelo proprietário em 2026-11-02**; se algum problema aparecer, abrir um bugfix (`sdd-bugfix`). Os itens ficam desmarcados de propósito: não foram testados.

---

## Preparação (5 min)

- [x] `npm run build`; em `chrome://extensions/` carregar a raiz do repositório (sem compactação) ou clicar em **Recarregar**. Sem erros na página da extensão.
- [x] Abrir a extensão. Em ⚙ **Configurações**, salvar a chave **Deepgram** e a **ElevenLabs** (as mesmas do `.env`).
- [ ] Ter à mão: um vídeo qualquer para reproduzir durante a captura (YouTube, por exemplo), um trecho seu falando em **português** e outro em **inglês**, e (opcional) um arquivo de vídeo sem áudio e um arquivo qualquer que não seja mídia.
- [ ] Abrir o Gerenciador de tarefas do Chrome (`Shift+Esc`) para acompanhar memória durante os blocos F e G.

---

## Bloco A: Configurações e interface (10 min)

1. [x] **Chaves**: ao abrir ⚙ Configurações, os dois campos voltam **preenchidos e ocultos**; o ícone de olho mostra e oculta; o texto ao lado diz "✓ … salva". Apagar um campo mostra "Campo vazio — a chave salva continua em uso"; digitar outra mostra "Alterações não salvas".
   Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item
2. [x] **Qualidade**: escolher Alta, Equilibrada e Econômica; o texto descreve resolução, fps e bitrates; ao recarregar a janela a escolha permanece.
   Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item
3. [x] **Fontes locais**: com a internet **desligada**, abrir a janela; a tipografia (DM Sans e JetBrains Mono) aparece normal, sem requisições ao Google Fonts na aba Network.
   Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item

---

## Bloco B: Gravação com captura nativa (20 min)

Deixe a qualidade em **Equilibrada** e a transcrição ao vivo **desligada**.

4. [x] **Permissão do microfone com a janela minimizada** (item 9): com o microfone **ainda não autorizado** para a extensão (`chrome://settings/content/microphone`, remover a permissão se existir), clicar em Iniciar Gravação. O aviso de permissão do microfone **aparece e dá para aceitar** mesmo com a janela minimizada? Se ficar escondido, anote exatamente o que aconteceu.
   Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item
5. [x] **Seletor nativo** abre; escolher uma **aba com áudio** (vídeo tocando). A janela minimiza e não aparece na captura.
   Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item
6. [x] **Pausa e retomada**: pausar 5 s e retomar; o cronômetro não conta a pausa.
   Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item
7. [x] **Parar** e esperar "Arquivo .webm pronto". Baixar o `.webm` e abrir num player (VLC ou o próprio Chrome): aparece **duração** e dá para **avançar/voltar** o vídeo (item 5). Áudio do sistema e do microfone presentes.
   Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item
8. [x] **Aviso de saída** (bug 4): gravar de novo e tentar **fechar a janela** com a gravação em andamento: o Chrome pede confirmação. Cancelar. Parar, **sem baixar**, e tentar fechar: pede de novo. Baixar o arquivo e fechar: não pede.
   Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item
9. [x] **Parar compartilhamento em modo Só Áudio** (bug 1): escolher **Só Áudio**, iniciar, e clicar em **"Parar compartilhamento"** na barra do Chrome. A gravação **encerra sozinha** e a tela final aparece com o arquivo.
   Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item
10. [x] **Qualidade**: gravar 15 s em **Econômica** e em **Alta** e conferir (pelo tamanho do arquivo) que Econômica é bem menor.
    Resultado: validado pelo proprietário (2026-11-02), sem detalhes por item

---

## Bloco C: Transcrição ao vivo, Deepgram (15 min)

11. [ ] Ativar **Transcrição em tempo real**, escolher PT-BR, gravar uma fala curta e ver o texto aparecer com ~300 ms de atraso (modelo `nova-3`).
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
12. [ ] **Última frase** (bug 2): falar uma frase e **parar logo em seguida**. A frase final **está** no texto da tela final (e no TXT).
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
13. [ ] **Pausa longa**: durante a gravação com transcrição ligada, **pausar por ~60 s** e retomar; a conexão com o Deepgram continua (o texto volta a aparecer ao falar, sem erro de conexão no log ▸ log).
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
14. [ ] **SRT depois de pausa**: numa gravação com pausa, o botão de SRT do texto **ao vivo** fica desabilitado, com a dica para transcrever o arquivo final.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix

---

## Bloco D: Transcrição posterior com os dois serviços (30 min)

Use a gravação do Bloco B (com fala). Para cada serviço, repita:

15. [ ] Na tela final, escolher o **serviço** (comece pela ElevenLabs), idioma PT-BR. O aviso cita **somente áudio** e o **nome do serviço escolhido**; nada é enviado antes do clique.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
16. [ ] Clicar em **Transcrever áudio**. Na aba **Network**, a requisição para `api.elevenlabs.io` (ou `api.deepgram.com/v1/listen`) contém **só áudio** (sem vídeo) e o host é o do serviço escolhido; **nenhuma** requisição vai ao outro serviço. A preparação mostra progresso real, sem porcentagem inventada.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
17. [ ] Conferir **texto completo**, **TXT** e **SRT**; reproduzir o `.webm` com o SRT e comparar as falas (sincronia). Anotar tamanho do vídeo/áudio e tempo de extração.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
18. [ ] **Gravação com pausa**: o SRT da transcrição posterior acompanha o arquivo final reproduzido.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
19. [ ] Trocar para o **outro serviço** e **retranscrever**: o texto anterior permanece visível durante o processamento e só é substituído ao concluir; o rótulo "Transcrito por …" muda. **Cancelar** durante o processamento mantém o texto anterior e a mídia.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
20. [ ] **Inglês**: gravar ou importar uma fala curta em inglês e transcrever nos dois serviços.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
21. [ ] **Estados de erro**: (a) apagar a chave do serviço escolhido: orienta para ⚙ Configurações e **não envia**; (b) desligar a internet: mensagem "Sem conexão com …" e dá para tentar de novo; (c) iniciar duas vezes seguidas: não duplica. Nenhuma mensagem mostra chave e nenhum TXT/SRT vazio é oferecido.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
22. [ ] **Gravação remuxada** (001 T028): a gravação feita no próprio app (passou pelo remux) transcreve normalmente nos dois serviços e o payload continua só áudio.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix

---

## Bloco E: Importar arquivos (15 min)

23. [ ] Na **tela inicial**, selecionar cada formato com fala e transcrever + baixar TXT/SRT: **WebM de vídeo**, **MP4 (AAC)**, **WebM de áudio**, **MP3**. Para o MP4 confirmar na aba Network que o envio é **M4A só de áudio**.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
24. [ ] **Vídeo sem áudio**, **arquivo inválido** e **extensão trocada** são recusados com mensagem clara, sem enviar nada e sem TXT/SRT vazio.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
25. [ ] **WebM longo** (≥ 10 min; pode ser uma gravação do Bloco G): medir **tempo** e **memória** da preparação no Gerenciador de tarefas; termina **muito antes** da duração do vídeo, não carrega o vídeo inteiro na memória, e o áudio enviado não contém vídeo. **Cancelar** na preparação preserva a fonte e o texto anterior.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
26. [ ] Fechar e reabrir a janela: **não** há histórico de transcrições (só o que você baixou).
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix

---

## Bloco F: MP3 (10 min)

27. [ ] Gravar **Só Áudio por 10 minutos**, parar e clicar em **Baixar .mp3**: a janela **não trava** durante a conversão (o botão mostra "Convertendo… N%"), o arquivo toca e tem a duração certa.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix

---

## Bloco G: Divisão em partes, feature 003 (45 min; inclui ~25 min de gravação)

### G1. Com limite reduzido (10 min)

Abrir a janela com o parâmetro de teste: no console da extensão ou pela barra de endereço, `chrome-extension://<ID>/recorder.html?partLimitBytes=5000000` (5 MB; o ID está em `chrome://extensions/`).

28. [ ] Gravar uns 90 s com **movimento na tela** (vídeo tocando). Aparecem "Parte 2", "Parte 3"… e o **cronômetro não reinicia**.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
29. [ ] **Lacuna real**: anotar o tempo corrido do cronômetro e **somar as durações** das partes baixadas. A diferença deve ser **menor que 1 s por troca** (no simulado deu ~0,03 s).
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
30. [ ] A lista mostra nome (`…_parte-01.webm`), duração e tamanho; cada parte **abre com duração e avanço** no player, com áudio e vídeo.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
31. [ ] **Baixar todas**: o Chrome pede permissão para vários downloads? Depois de permitir, as partes chegam **na ordem**.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
32. [ ] **Transcrever** a parte 1 com um serviço e a 2 com o outro; cada parte guarda o **seu** texto; durante uma transcrição, outra parte não inicia; o bloco **ao vivo** (se ativado) aparece só com TXT.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
33. [ ] **Tela estática**: abrir a janela com o mesmo limite, compartilhar uma **tela sem mudança** (editor parado) por ~40 s. O app não fica preso: as partes saem, mesmo que alguma tenha poucos dados; nenhuma parte vazia aparece na lista.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
34. [ ] **Só Áudio** com limite reduzido: as partes são só áudio e **não há botão de MP3**.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix

### G2. Tamanho real (opcional, ~25 min de gravação)

35. [ ] Sem o parâmetro de teste, qualidade **Alta**, gravar **~30 min** com a tela mudando (vídeo em tela cheia) e acompanhar no Gerenciador de tarefas. Esperado: uma divisão perto de **1,4 GB** (cerca de 23 min no pior caso), a gravação **não para**, a memória **não explode**, e as duas partes abrem com duração. Anotar o pico de memória e o espaço em disco usado enquanto não baixa.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix

---

## Bloco H: Recuperação após queda real (10 min)

36. [ ] Com o limite reduzido (G1) e **duas partes fechadas** (indicador em "Parte 3"), **matar a aba** da extensão: Gerenciador de tarefas do Chrome (`Shift+Esc`) → selecionar a janela do gravador → **Finalizar processo**. Reabrir a extensão: aparece "Encontradas N partes de uma gravação interrompida"; **Recuperar** lista as partes; baixar uma e recarregar: **ela não volta**.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
37. [ ] Repetir com uma gravação **de uma só parte**: a recuperação continua funcionando como antes.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix
38. [ ] **Descartar** a recuperação apaga tudo; **iniciar nova gravação** com cópia pendente avisa que ela será descartada.
    Resultado: não executado; risco aceito pelo proprietário (2026-11-02); se der problema, abrir bugfix

---

## Encerramento

- [ ] Anotar problemas fora do roteiro (comportamentos estranhos, travamentos, mensagens confusas): ______
- [ ] Me enviar o resumo: números dos itens que **passaram**, que **falharam** (com o que viu) e que **não deu para fazer**.

O que eu faço com o resumo:
- marco T012, T015, T019 e T028 (001), T032 (002) e T028 (003) conforme os resultados, com a evidência separada em Chrome real e serviço real;
- atualizo os `test.md` dos três bugs (de `partial` para `verified` onde os itens 8, 9 e 12 passarem);
- corrijo o que falhar (cada falha vira bug ou task) e rodo o `sdd-converge` das três features de novo para fechá-las.
