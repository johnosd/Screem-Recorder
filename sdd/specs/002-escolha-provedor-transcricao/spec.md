# Feature Specification: Escolha do provedor da transcrição pós-gravação

**Slug**: `002-escolha-provedor-transcricao`

**Created**: 2026-11-02

**Status**: Especificada

**Input**: "gostaria também de poder escolher entre Deepgram e ElevenLabs para transcrição pós[-gravação]"

## Escopo

### Incluído

- Um seletor de provedor (ElevenLabs ou Deepgram) na tela final, junto do idioma e da ação de transcrever, válido para a gravação recém-finalizada e para um arquivo selecionado.
- Transcrição posterior pelo Deepgram com os mesmos resultados da atual: texto, TXT e SRT, nos mesmos formatos de mídia, idiomas, estados de andamento, cancelamento e nova tentativa.
- Aviso de envio e mensagens de erro que citam o serviço realmente escolhido.
- Orientação para ⚙ Configurações quando falta a chave do provedor escolhido.
- Indicação, junto ao resultado, de qual provedor o gerou.
- Retranscrição com outro provedor, preservando o resultado anterior até a nova tentativa concluir com texto.
- Memória da última escolha entre aberturas do app.

### Fora de Escopo

- Alterar a transcrição ao vivo, que continua usando o Deepgram.
- Escolher o provedor automaticamente, usar um provedor como reserva do outro ou enviar a mesma mídia a dois serviços de uma vez.
- Sugerir o outro provedor quando uma transcrição falha.
- Incluir outros provedores além de ElevenLabs e Deepgram.
- Comparar dois resultados lado a lado, medir qualidade ou custo, ou manter histórico de transcrições.
- Alterar formatos aceitos, idiomas (pt-BR e inglês), a preparação local do áudio ou as regras de SRT já definidas pela feature 001.
- Mostrar o provedor nos nomes dos arquivos TXT e SRT baixados.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transcrever com o provedor escolhido (Priority: P1)

Como usuário com chave de um ou dos dois serviços, quero escolher na tela final qual provedor transcreverá minha gravação ou arquivo, para usar o serviço que prefiro ou tenho disponível.

**Why this priority**: É o pedido central. Sem ele, o usuário só pode transcrever pela ElevenLabs.

**Independent Test**: Com as duas chaves salvas, gravar ou selecionar uma mídia com fala, escolher o Deepgram, transcrever e baixar TXT e SRT; repetir com a ElevenLabs. Cada execução entrega valor mesmo sem as histórias seguintes.

**Acceptance Scenarios**:

1. **Given** uma gravação recém-finalizada ou um arquivo selecionado e a chave Deepgram salva, **When** o usuário escolhe Deepgram, o idioma e aciona a transcrição, **Then** o app informa que somente o áudio será enviado ao Deepgram, mostra o andamento e entrega texto, TXT e SRT.
2. **Given** a mesma mídia e a chave ElevenLabs salva, **When** o usuário escolhe ElevenLabs e aciona a transcrição, **Then** o comportamento é idêntico ao atual.
3. **Given** o provedor escolhido sem chave salva, **When** o usuário aciona a transcrição, **Then** o app orienta a configurar a chave em ⚙ Configurações, não envia nada e mantém a mídia e qualquer texto anterior.
4. **Given** uma escolha de provedor, **When** a transcrição ocorre, **Then** nenhum dado é enviado ao serviço que não foi escolhido.
5. **Given** uma transcrição em andamento, **When** o usuário tenta trocar o provedor, **Then** o seletor fica indisponível até concluir ou cancelar.

---

### User Story 2 - Retranscrever com outro provedor (Priority: P2)

Como usuário que não gostou do resultado, quero transcrever de novo a mesma mídia com o outro provedor e saber qual gerou o texto exibido, para escolher o melhor resultado.

**Why this priority**: Agrega valor sobre a história 1, mas depende dela.

**Independent Test**: Transcrever com um provedor, trocar o seletor, transcrever de novo e conferir que o texto antigo permaneceu até o novo concluir, e que a tela diz qual provedor gerou o texto atual.

**Acceptance Scenarios**:

1. **Given** um resultado do ElevenLabs, **When** o usuário escolhe Deepgram e transcreve de novo, **Then** o texto anterior continua disponível durante o processamento e só é substituído quando o novo termina com texto.
2. **Given** a nova transcrição cancelada ou com falha, **When** o processamento termina, **Then** o resultado anterior, a mídia e os downloads continuam disponíveis.
3. **Given** um resultado concluído, **When** a tela é exibida, **Then** mostra o provedor e o idioma que o geraram, sem alterar o conteúdo dos arquivos TXT e SRT baixados.
4. **Given** uma falha do provedor escolhido, **When** o erro é exibido, **Then** a mensagem cita o serviço correto e não sugere nem inicia o uso do outro provedor.

---

### User Story 3 - Lembrar a última escolha (Priority: P3)

Como usuário recorrente, quero que o app comece com o provedor que usei por último, para não escolher de novo a cada abertura.

**Why this priority**: Conveniência; não bloqueia o uso das histórias anteriores.

**Independent Test**: Escolher Deepgram, fechar e reabrir o app e conferir que o seletor mostra Deepgram.

**Acceptance Scenarios**:

1. **Given** uma primeira abertura sem escolha anterior, **When** a tela final é exibida, **Then** o seletor mostra ElevenLabs.
2. **Given** uma escolha anterior, **When** o app é reaberto, **Then** o seletor mostra o último provedor usado.

### Edge Cases

- Provedor escolhido sem chave: orientação para ⚙ Configurações e nenhum envio (história 1).
- Chave recusada, limite de uso, falta de conexão, indisponibilidade do serviço ou mídia acima do limite do provedor: mensagem própria, com o nome do serviço correto.
- Mídia que cabe em um provedor e excede o limite do outro: o app informa o limite antes de enviar, e o usuário pode trocar o provedor e tentar.
- Troca de provedor com mídia sem fala ou sem faixa de áudio: o resultado é o mesmo estado explícito da feature 001, sem TXT ou SRT vazios.
- Resposta do provedor com tempos ausentes ou inválidos: aplica-se o tratamento já definido para SRT na feature 001, para ambos os provedores.
- Fechar a janela perde a transcrição ainda não baixada, como antes; a escolha de provedor persiste.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O app DEVE oferecer, na tela final de uma gravação recém-finalizada e de um arquivo selecionado, um seletor com ElevenLabs e Deepgram, junto do idioma e da ação de transcrever.
- **FR-002**: O app DEVE transcrever usando exclusivamente o provedor escolhido e NÃO DEVE enviar a mídia, o áudio ou o texto ao outro serviço.
- **FR-003**: Antes de iniciar, o app DEVE informar que somente o áudio será enviado ao serviço escolhido, atualizando o aviso quando o seletor mudar, e DEVE iniciar o envio apenas após ação explícita do usuário.
- **FR-004**: Se a chave do provedor escolhido não estiver configurada, o app DEVE orientar a configurá-la em ⚙ Configurações, NÃO DEVE enviar nada e DEVE preservar a mídia e qualquer transcrição anterior. A chave do Deepgram é a mesma já usada na transcrição ao vivo.
- **FR-005**: Para ambos os provedores, o app DEVE manter os formatos aceitos, os idiomas pt-BR e inglês, a preparação local de somente áudio, a indicação de andamento, o cancelamento e a nova tentativa definidos na feature 001.
- **FR-006**: Com o Deepgram, o app DEVE entregar texto completo, TXT e SRT com as mesmas regras de tempos relativos ao arquivo, de tratamento de tempos ausentes e de bloqueio de arquivos vazios aplicadas à ElevenLabs.
- **FR-007**: O app DEVE indicar na tela, junto ao resultado, o provedor e o idioma que o geraram, sem alterar o conteúdo nem o nome dos arquivos TXT e SRT baixados.
- **FR-008**: Ao retranscrever com outro provedor, o app DEVE manter o resultado anterior até a nova transcrição terminar com texto; cancelamento ou falha NÃO DEVEM descartá-lo nem a mídia.
- **FR-009**: O app DEVE exibir erros específicos de cada provedor (chave recusada, limite de uso, rede, indisponibilidade, mídia acima do limite) citando o serviço correto e NÃO DEVE sugerir nem iniciar o uso do outro provedor.
- **FR-010**: O app DEVE lembrar o último provedor escolhido entre aberturas, começando por ElevenLabs na primeira vez, e DEVE desabilitar o seletor enquanto houver uma transcrição em andamento.
- **FR-011**: O app DEVE respeitar o limite de tamanho de cada provedor e DEVE informar antes do envio quando a mídia preparada o exceder.
- **FR-012**: O app NÃO DEVE alterar a transcrição ao vivo, que continua usando o Deepgram, nem o comportamento atual da transcrição pela ElevenLabs.
- **FR-013**: As chaves DEVEM permanecer fora de logs, relatórios, testes e arquivos gerados, como já exigido pela constitution.

### Key Entities

- **Provedor de transcrição**: serviço que recebe o áudio preparado (ElevenLabs ou Deepgram), com chave própria, limite de mídia e mensagens de erro próprias.
- **Resultado de transcrição**: texto, tempos, idioma e provedor que o gerou, mantido só durante a sessão.
- **Preferência de provedor**: último provedor escolhido, guardado localmente entre aberturas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em testes com fala audível, cada um dos dois provedores produz texto, TXT e SRT para os quatro formatos aceitos (vídeo WebM e MP4, áudio WebM e MP3).
- **SC-002**: Em 100% das transcrições dos testes, o aviso cita o serviço escolhido e nenhuma requisição é feita ao serviço não escolhido.
- **SC-003**: Em 100% dos cenários de chave ausente, cancelamento e falha dos testes, a mídia e o resultado anterior continuam disponíveis.
- **SC-004**: Com as duas chaves salvas, trocar de provedor e transcrever de novo exige apenas escolher no seletor e acionar a transcrição, sem abrir as Configurações.
- **SC-005**: Depois de fechar e reabrir o app, o seletor mostra o último provedor usado em 100% dos testes.

## Assumptions

- O usuário usa as próprias chaves e arca com custo e cota de cada serviço.
- O Deepgram aceita os formatos de áudio já preparados localmente, e pt-BR e inglês estão disponíveis na transcrição de arquivos gravados; a confirmação técnica e os limites exatos ficam para o `sdd-plan`.
- O Deepgram devolve tempos por palavra suficientes para o SRT; se não devolver, aplica-se o tratamento de tempos ausentes da feature 001.
- A feature estende a 001: onde a spec dela cita somente a ElevenLabs para a transcrição posterior, passa a valer a escolha do provedor, sem outras mudanças.
- Dados e resultados ficam apenas na sessão, como na feature 001.
- Mudanças de destino de rede e de permissões, se necessárias, serão descritas no plano e no manifesto, conforme a constitution.

## Clarifications

### Sessão 2026-11-02

- Q: Onde escolher o provedor? → A: Na tela final, a cada transcrição.
- Q: O que fazer sem chave do provedor escolhido? → A: Só orientar para ⚙ Configurações.
- Q: Qual provedor aparece ao abrir o app? → A: O último usado; ElevenLabs na primeira vez.
- Q: O resultado indica o provedor? → A: Sim, na tela; nomes dos arquivos baixados não mudam.
- Q: Sugerir o outro provedor quando falha? → A: Não, só mostrar o erro.
