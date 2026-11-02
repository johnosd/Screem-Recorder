# Feature Specification: Divisão automática de gravações longas em partes

**Slug**: `003-dividir-gravacoes-longas`

**Created**: 2026-11-02

**Status**: Convergência Pendente

**Input**: "precisamos salvar pensando nesse limite os arquivos de gravação" (limite de 2 GB do Deepgram para arquivos), com a escolha de dividir automaticamente em partes.

## Escopo

### Incluído

- Fechar automaticamente a parte atual da gravação ao se aproximar de **1,5 GB** e continuar em uma nova parte, sem parar a gravação nem perder tempo gravado.
- Cada parte é um arquivo `.webm` completo e independente, com duração, avanço no player e a mesma qualidade escolhida, pronto para baixar e transcrever.
- Uma lista de partes na tela final, com nome, duração e tamanho, e com **Baixar** e **Transcrever** por parte, além de **Baixar todas**.
- Transcrição por parte, com tempos do SRT relativos a cada parte, usando o provedor escolhido na feature 002.
- Guarda das partes já fechadas até o usuário baixá-las ou descartá-las, incluindo a recuperação depois de uma queda da janela.
- Aviso discreto durante a gravação de que ela está sendo dividida e em qual parte está.
- Aplicação nos modos Vídeo + Áudio e Só Áudio.

### Fora de Escopo

- Tornar o tamanho da parte configurável: o valor é fixo.
- Dividir por duração fixa; a divisão é só por tamanho.
- Unir as partes em um arquivo, ou unificar as transcrições das partes em um texto com tempos corridos.
- Alterar a transcrição ao vivo: ela continua contínua durante toda a gravação, sem SRT por parte.
- Dividir arquivos importados ou já gravados; a divisão ocorre apenas durante uma gravação feita no app.
- Alterar formatos, perfis de qualidade, provedores de transcrição ou o fluxo de captura além do necessário para trocar de parte.
- Baixar partes automaticamente sem ação do usuário.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gravar sem se preocupar com o tamanho (Priority: P1)

Como usuário que faz gravações longas, quero que o app feche sozinho a parte que chegou perto do limite e continue gravando em outra, para nunca perder a gravação nem gerar um arquivo grande demais para remuxar ou transcrever.

**Why this priority**: É o motivo da feature. Sem a divisão, uma gravação longa vira um arquivo acima do teto do remux, sem duração nem avanço no player, e que pode ser difícil de transcrever.

**Independent Test**: Gravar até a primeira divisão (com o limite reduzido em teste), parar e conferir que há duas partes, que o tempo gravado soma a duração total sem lacuna perceptível e que cada parte abre no player com duração e avanço funcionando.

**Acceptance Scenarios**:

1. **Given** uma gravação em andamento cuja parte atual se aproxima de 1,5 GB, **When** o limite é atingido, **Then** o app fecha essa parte, inicia a próxima sem interromper a gravação e mostra que está na parte seguinte.
2. **Given** uma gravação dividida, **When** o usuário para a gravação, **Then** a última parte também é fechada e a tela final lista todas as partes na ordem.
3. **Given** uma gravação em pausa ao chegar no limite, **When** ela é retomada, **Then** a divisão ocorre sem perder nem duplicar tempo, e o tempo pausado não conta como gravado.
4. **Given** uma gravação que nunca chegou ao limite, **When** é parada, **Then** a tela final e o nome do arquivo são os de hoje, sem lista de partes nem sufixo.
5. **Given** o usuário usa "Parar compartilhamento" do Chrome em uma gravação dividida, **When** a captura termina, **Then** a parte atual é fechada e todas as partes ficam disponíveis.

---

### User Story 2 - Baixar e transcrever cada parte (Priority: P1)

Como usuário, quero baixar e transcrever cada parte, ou baixar todas de uma vez, para obter os arquivos e as legendas de uma gravação longa sem juntá-los.

**Why this priority**: Sem entregar as partes, a divisão não serve ao usuário; a transcrição por parte é a razão de respeitar os limites.

**Independent Test**: Com uma gravação de duas partes, baixar cada uma, baixar todas, e transcrever uma parte com cada provedor conferindo TXT e SRT relativos àquela parte.

**Acceptance Scenarios**:

1. **Given** uma gravação com várias partes, **When** a tela final é exibida, **Then** cada parte mostra nome, duração e tamanho, com Baixar e Transcrever próprios, e há uma ação Baixar todas.
2. **Given** uma parte escolhida e o provedor escolhido, **When** o usuário transcreve, **Then** o fluxo é o da feature 002 aplicado só àquela parte, e o SRT acompanha o arquivo daquela parte.
3. **Given** uma transcrição em andamento em uma parte, **When** o usuário vê as outras partes, **Then** pode baixá-las, mas não iniciar uma segunda transcrição simultânea.
4. **Given** uma parte transcrita, **When** o usuário transcreve outra, **Then** o resultado de cada parte permanece associado a ela e não se mistura com o das outras.
5. **Given** uma parte baixada, **When** o usuário baixa todas, **Then** o app baixa as partes na ordem, sem renomear nem recodificar.

---

### User Story 3 - Não perder partes se a janela cair (Priority: P2)

Como usuário, quero recuperar as partes de uma gravação interrompida, para não perder horas de gravação por uma queda ou fechamento acidental.

**Why this priority**: Gravações longas são justamente as mais caras de perder; mas depende das histórias anteriores.

**Independent Test**: Gravar até haver uma parte fechada e outra em andamento, fechar a janela sem baixar e reabrir; conferir que todas as partes aparecem para recuperar ou descartar.

**Acceptance Scenarios**:

1. **Given** partes já fechadas e uma parte em andamento, **When** a janela cai ou é fechada, **Then** na próxima abertura o app oferece recuperar as partes e descartá-las.
2. **Given** partes recuperadas, **When** o usuário baixa todas ou descarta, **Then** a cópia guardada é apagada.
3. **Given** uma parte já baixada, **When** a janela cai depois disso, **Then** ela não é oferecida de novo.
4. **Given** o usuário inicia uma nova gravação, **When** havia partes recuperáveis, **Then** o app avisa que elas serão descartadas, como já faz a recuperação atual.

### Edge Cases

- A última parte pode ser curta; mesmo muito curta (alguns segundos), é um arquivo válido.
- Uma gravação muito longa pode ter dezenas de partes; a lista continua utilizável e a ordem é preservada.
- Se não for possível abrir a nova parte (falha da captura ou do gravador), o app para a gravação, preserva todas as partes já fechadas e informa o erro.
- Falta de espaço para guardar as partes: o app informa e preserva o que já foi guardado.
- Descartar a gravação descarta todas as partes e a cópia guardada, com a mesma confirmação de hoje.
- A transcrição ao vivo não é interrompida na troca de parte e não gera uma transcrição por parte.
- O tempo total da gravação mostrado no cronômetro continua corrido, sem reiniciar a cada parte.
- Fechar a janela com partes não baixadas pede confirmação, como já ocorre com uma gravação não salva.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O app DEVE fechar a parte atual da gravação ao se aproximar de **1,5 GB** e continuar a gravação em uma nova parte, nos modos Vídeo + Áudio e Só Áudio.
- **FR-002**: A troca de parte NÃO DEVE interromper a gravação percebida pelo usuário: o cronômetro continua corrido e a lacuna de áudio e vídeo entre duas partes DEVE ser de no máximo 1 segundo, sem sobreposição que duplique conteúdo.
- **FR-003**: Cada parte DEVE ser um arquivo `.webm` independente e completo, com duração e permissão de avançar no player, e DEVE manter a qualidade, o áudio mixado e as faixas escolhidos na gravação.
- **FR-004**: Quando houver mais de uma parte, o app DEVE nomear os arquivos de forma ordenável e distinta (por exemplo, com um sufixo de parte numerado); uma gravação de uma única parte DEVE manter o nome e a tela finais de hoje.
- **FR-005**: A tela final de uma gravação dividida DEVE listar as partes na ordem, com nome, duração e tamanho, e oferecer **Baixar** e **Transcrever** por parte e **Baixar todas**.
- **FR-006**: A transcrição de uma parte DEVE seguir as regras da feature 002 (provedor escolhido, aviso de envio, chave, preservação do resultado anterior), aplicadas só à mídia daquela parte, com tempos do SRT relativos a ela.
- **FR-007**: O app DEVE impedir transcrições simultâneas e DEVE manter o resultado de cada parte associado a ela.
- **FR-008**: O app DEVE guardar as partes já fechadas, e a parte em andamento, até o usuário baixá-las ou descartá-las, e DEVE oferecer recuperar ou descartar partes de uma gravação interrompida na próxima abertura.
- **FR-009**: O app NÃO DEVE oferecer de novo partes já baixadas, e DEVE apagar a cópia guardada quando as partes forem baixadas ou descartadas.
- **FR-010**: Durante a gravação, o app DEVE indicar discretamente em qual parte está quando houver divisão, sem exigir ação do usuário.
- **FR-011**: Se não conseguir abrir uma nova parte ou guardar as partes, o app DEVE encerrar a gravação com uma mensagem clara e DEVE preservar todas as partes já fechadas.
- **FR-012**: A divisão NÃO DEVE alterar a transcrição ao vivo, que continua contínua, nem a pausa e a retomada, o aviso de saída, ou a perda de nada já tratada pelo app para gravações de uma parte.
- **FR-013**: O app NÃO DEVE baixar partes automaticamente nem alterar, juntar ou recodificar os arquivos das partes.

### Key Entities

- **Gravação**: conjunto ordenado de uma ou mais partes feitas em uma mesma captura, com modo (vídeo ou áudio), qualidade e início.
- **Parte**: arquivo `.webm` completo com número de ordem, duração, tamanho e estado (em andamento, fechada, baixada).
- **Resultado de transcrição de uma parte**: texto, tempos, idioma e provedor, ligado à parte que o gerou.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em testes com o limite reduzido, uma gravação que cruza o limite uma ou mais vezes termina com o número esperado de partes, e a soma das durações das partes difere do tempo gravado em no máximo 1 segundo por troca.
- **SC-002**: 100% das partes geradas nos testes abrem em um player com duração correta e permitem avançar, e nenhuma ultrapassa o limite configurado com folga acima de uma tolerância de 5%.
- **SC-003**: Em gravações de uma única parte, a tela final, os nomes de arquivo e os testes existentes se comportam exatamente como antes (nenhuma regressão).
- **SC-004**: Em 100% dos testes de queda com partes não baixadas, todas as partes fechadas e a parte em andamento aparecem para recuperar na reabertura.
- **SC-005**: Cada parte pode ser transcrita com cada provedor, e o SRT de uma parte acompanha o arquivo dela, em 100% dos testes de aceite.
- **SC-006**: Nenhuma gravação é perdida nos testes de falha ao abrir uma nova parte: todas as partes fechadas ficam disponíveis.

## Assumptions

- O limite de 1,5 GB é uma meta de planejamento: acompanha o teto atual do remux e deixa margem sob os limites de 2 GB do Deepgram e de 5 GB da ElevenLabs (o áudio extraído é muito menor que o vídeo). O valor é fixo e ajustável só por mudança de código.
- A troca de parte pode causar uma lacuna de até 1 segundo, aceita como custo de não perder a gravação; a lacuna exata e como minimizá-la ficam para o plano.
- Para testar sem gravar horas, os testes precisam de uma forma de reduzir o limite (por exemplo, valor injetável), sem expor isso ao usuário.
- A recuperação atual de gravação interrompida (feature de recuperação já entregue) é estendida para várias partes, mantendo seu comportamento para uma parte.
- O provedor e a chave seguem a feature 002; a divisão não muda provedores, limites de serviço nem permissões da extensão.
- Dados continuam na sessão e na cópia local guardada até o usuário baixar ou descartar.
- A feature depende de a feature 002 estar implementada (seletor de provedor e transcrição por provedor).

## Clarifications

### Sessão 2026-11-02

- Q: Qual critério fecha uma parte? → A: Por tamanho, cerca de 1,5 GB.
- Q: Como as partes aparecem e são entregues? → A: Lista na tela final, com Baixar e Transcrever por parte, mais Baixar todas; partes guardadas até baixar ou descartar.
- Q: O tamanho é configurável? → A: Não; fixo.
- Q: Como fica a transcrição? → A: Por parte, com tempos relativos a cada parte; sem texto unificado; a transcrição ao vivo continua contínua e sem SRT por parte.
- Q: Gravações de uma parte mudam? → A: Não; tela e nome de arquivo ficam como hoje (decisão de planejamento da spec, assumida como padrão).
