# QA: 003-dividir-gravacoes-longas

Data da execução: 2026-11-02. Separa o que foi provado **localmente** (Jest), no **Chromium com captura simulada e limite reduzido pela URL** e o que depende de **Chrome real e partes de verdade** (pendente). Nenhuma chave foi usada nem registrada.

## 1. Gates automatizados

| Comando | Resultado |
| --- | --- |
| `npm test` | 21 suítes, **129/129** (baseline 106 + 5 contratos + 18 testes novos) |
| `npm run build` | compilado sem erro |
| `npm run test:e2e` | **61/61** (baseline 45 + 16 novos em `tests/e2e/parts.spec.cjs`); os 45 anteriores passaram **sem alteração** (SC-003) |
| `check-contract-tests.ps1 -Slug 003-dividir-gravacoes-longas` | íntegra, 5 testes |
| `check-contract-tests.ps1 -Slug 002-escolha-provedor-transcricao` | íntegra, 5 testes |
| `check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao` | íntegra, 5 testes |
| Busca por `mediaRecorder`/`chunks` residuais em `recorder.js`; `partLimitBytes` fora de `recording-parts.js`; chave em `log()` | vazias |

## 2. Lacuna entre partes (SC-001, FR-002)

Medição no e2e (captura simulada, `?partLimitBytes=100000`): **6 partes, 5 trocas**; tempo corrido entre o início da gravação e o instante de parar: 12,02 s; soma das durações dos seis arquivos baixados: 11,88 s; diferença total **0,15 s**, cerca de **0,03 s por troca** (meta da spec: no máximo 1 s). Durações por parte: 2,06; 2,01; 1,98; 1,98; 2,02; 1,83 s. A diferença inclui a latência de início do cronômetro, então a lacuna real é menor ou igual a isso. O experimento de pesquisa (`research.md` §1) deu cerca de 0,09 s por troca em outra execução; os dois ficam uma ordem de grandeza abaixo da meta.

## 3. Critérios de aceite

| Item | Evidência | Situação |
| --- | --- | --- |
| FR-001 divisão ao atingir o limite, nos dois modos | contrato 1; e2e de divisão em vídeo e e2e em Só Áudio (cada parte só áudio, sem MP3, `gravacao-audio_…_parte-NN.webm`) | Provado (simulado) |
| FR-002 sem interromper, cronômetro corrido, lacuna ≤ 1 s | contratos 1 e 2; e2e de cronômetro e de tempo total; seção 2 | Provado (simulado) |
| FR-003 parte é `.webm` completo com duração e avanço | e2e baixa cada parte e lê duração, vídeo e áudio com `mediabunny`; remux em fila | Provado |
| FR-004 nomes distintos; uma parte mantém o nome de hoje | contrato 4; e2e "gravação curta mantém a tela e o nome de hoje" | Provado |
| FR-005 lista com nome, duração, tamanho, Baixar, Transcrever e Baixar todas | e2e de divisão, "Baixar todas" e transcrição por parte | Provado |
| FR-006 transcrição por parte com as regras da 002 | e2e: parte 1 com ElevenLabs e parte 2 com Deepgram, resultados separados | Provado com rede simulada |
| FR-007 sem transcrições simultâneas; resultados separados | e2e: com uma em andamento a outra parte fica desabilitada e ainda baixa | Provado |
| FR-008 guarda das partes e recuperação | contrato 5; e2e de queda, parte baixada, descarte e parte restante | Provado (queda simulada) |
| FR-009 partes baixadas não voltam; cópia apagada | contrato 5; e2e | Provado |
| FR-010 indicador discreto da parte | e2e (`#part-indicator`: oculto com uma parte, "Parte N" com divisão) | Provado |
| FR-011 falha ao abrir a próxima parte preserva as fechadas | contrato 3; testes unitários de falha e de callbacks | Provado em unidade; **não** exercitado em captura real |
| FR-012 pausa, transcrição ao vivo e aviso de saída inalterados | e2e de pausa atravessando divisão; e2e de bloco ao vivo; e2e anteriores de pausa, Deepgram e saída seguem verdes | Provado |
| FR-013 sem download automático nem recodificação | "Baixar todas" só por clique e entrega o `Blob` remuxado de cada parte | Provado |
| SC-002 partes abrem, nenhuma acima do limite com folga | e2e lê duração e tracks; o limite de 1,4 GB está abaixo do teto do remux (contrato 4) | Provado (limite reduzido); tamanho real **pendente** |
| SC-003 uma parte sem regressão | os 45 e2e anteriores passaram sem alteração | Provado |
| SC-004 recuperação | e2e de queda com 3 partes | Provado (queda simulada) |
| SC-005 cada parte transcrita com cada provedor | e2e com os dois provedores (rede simulada) | Provado (simulado) |
| SC-006 nenhuma gravação perdida ao falhar a próxima parte | contrato 3 | Provado em unidade |

## 4. Pendente (não validado — Princípio IV)

Estes itens exigem Chrome real, captura real ou partes de tamanho real e **não** foram verificados; a feature não deve ser chamada de plenamente validada até serem cobertos (R-001 a R-005 do plano):

- A lacuna com captura real de tela e áudio do sistema (a medição foi com fontes simuladas).
- Memória e disco com partes de **1,4 GB** de verdade, e o remux de uma parte enquanto a gravação continua.
- O limite real: o e2e usa limite reduzido; nenhum teste gerou 1,4 GB.
- Tela estática: a parte nova pode ficar sem frames por um tempo (R-002); a parte vazia é descartada, mas o comportamento real depende do Chrome.
- "Baixar todas" com o aviso do Chrome para vários downloads (R-005).
- Queda real do Chrome ou do processo (o e2e fecha a página sem parar a gravação).

Roteiro manual: `quickstart.md` §3 a §5.

## 5. Desvios e descobertas

- **`onstop` sempre aguardado** (descoberta na Fase 3): o recorder encerrado pelo próprio navegador, por exemplo ao "Parar compartilhamento", entrega o último pedaço depois de já estar `inactive`. O `closePart` passou a registrar o `onstop` na criação e a sempre esperá-lo, com prazo de segurança de 5 s (`stopTimeoutMs`); 2 testes unitários cobrem isso. O contrato não foi alterado.
- **`doStop` assíncrono**: as faixas só param depois de o último pedaço ser entregue (antes `cleanup()` rodava logo após `stop()`).
- **Transcrever por parte** seleciona a parte e abre o painel; a transcrição começa em **Transcrever áudio** (A-04 do plano).
- **Parte final curta**: uma parte criada logo antes de parar pode ter poucos KB (`0,0 MB`) e ainda assim é um arquivo válido; só 0 bytes é descartado.
- **MP3** do modo áudio só em gravações de uma parte (DI-009, R-006).
