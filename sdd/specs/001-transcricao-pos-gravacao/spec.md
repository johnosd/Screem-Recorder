# Feature Specification: Transcrição pós-gravação de vídeos e áudios

**Slug**: `001-transcricao-pos-gravacao`

**Created**: 2026-10-31

**Status**: Em Execução

**Input**: "eu como suaurio do app screen recorder quero pode transcrever as gravações de videos apos a gravação"

## Escopo

### Incluído

- Transcrever sob demanda uma gravação recém-finalizada no app, nos modos Vídeo + Áudio e Só Áudio, mesmo quando a transcrição ao vivo não foi ativada.
- Selecionar na tela inicial um arquivo salvo no computador para transcrição: vídeo WebM ou MP4 com áudio, ou áudio WebM ou MP3.
- Escolher português do Brasil ou inglês, acompanhar o andamento, cancelar e tentar novamente.
- Visualizar o texto resultante e baixar transcrição em TXT e legendas sincronizadas em SRT.
- Reaproveitar a transcrição ao vivo já disponível e oferecer retranscrição sob demanda, preservando o resultado anterior se a nova tentativa não for concluída.
- Extrair localmente apenas a faixa de áudio dos vídeos, sem recodificá-la quando o formato permitir, e enviar somente o áudio à ElevenLabs após aviso e ação explícita.

### Fora de Escopo

- Iniciar automaticamente a transcrição ao encerrar uma gravação.
- Manter histórico interno de gravações ou transcrições após fechar a janela; o usuário conserva os arquivos que baixar e pode selecionar novamente uma mídia salva.
- Editar transcrições, traduzir, identificar ou separar falantes, detectar o idioma automaticamente.
- Inserir legendas no vídeo ou alterar o arquivo de mídia original.
- Aceitar formatos além de WebM e MP4 para vídeo, ou WebM e MP3 para áudio, nesta entrega.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transcrever a gravação recém-finalizada (Priority: P1)

Como usuário que acabou de gravar vídeo ou áudio, quero solicitar a transcrição na tela final sem precisar iniciar outra gravação nem baixar e selecionar o arquivo, para obter texto e legendas do material que acabei de produzir.

**Why this priority**: Resolve o pedido central e funciona mesmo que o usuário não tenha ativado a transcrição ao vivo.

**Independent Test**: Com a transcrição ao vivo desligada, gravar uma fala curta em cada modo, parar, solicitar a transcrição e baixar TXT e SRT correspondentes. Essa jornada entrega valor sem a seleção de arquivos salvos.

**Acceptance Scenarios**:

1. **Given** uma gravação Vídeo + Áudio recém-finalizada com fala audível e sem transcrição ao vivo, **When** o usuário escolhe o idioma e solicita a transcrição na tela final, **Then** o app informa o envio do áudio, processa a gravação sem exigir download prévio e apresenta texto com opções de baixar TXT e SRT.
2. **Given** uma gravação Só Áudio recém-finalizada com fala audível, **When** o usuário solicita a transcrição, **Then** recebe texto, TXT e SRT relativos a essa gravação.
3. **Given** uma gravação com transcrição ao vivo existente, **When** a tela final é exibida, **Then** o texto existente continua disponível e o usuário pode solicitar nova transcrição.
4. **Given** uma retranscrição em andamento e um texto anterior disponível, **When** o usuário cancela ou ocorre uma falha, **Then** o texto anterior e a gravação continuam disponíveis na sessão.

---

### User Story 2 - Transcrever mídia salva no computador (Priority: P2)

Como usuário com um vídeo ou áudio já salvo, quero selecioná-lo na tela inicial do app e transcrevê-lo, para gerar texto e legendas sem precisar reproduzi-lo e gravá-lo novamente.

**Why this priority**: Permite recuperar gravações antigas e transcrever arquivos mesmo após fechar a janela original.

**Independent Test**: Abrir o app sem gravar, selecionar separadamente arquivos WebM e MP4 de vídeo e WebM e MP3 de áudio com fala, solicitar a transcrição e baixar TXT e SRT. Essa jornada entrega valor sem uma gravação ativa ou recém-finalizada.

**Acceptance Scenarios**:

1. **Given** o app na tela inicial e um vídeo WebM ou MP4 salvo com áudio e fala, **When** o usuário seleciona o arquivo, escolhe o idioma e solicita a transcrição, **Then** vê o andamento, o texto e os downloads TXT e SRT.
2. **Given** o app na tela inicial e um áudio WebM ou MP3 salvo com fala, **When** o usuário seleciona o arquivo e solicita a transcrição, **Then** recebe texto, TXT e SRT.
3. **Given** um arquivo inválido, sem faixa de áudio ou sem fala reconhecível, **When** o usuário tenta transcrevê-lo, **Then** o app apresenta o motivo ou a ausência de texto e não oferece arquivos de transcrição vazios como se houvesse sucesso.

### Edge Cases

- Antes de começar, a gravação recém-parada precisa estar pronta para leitura; até lá, a ação de transcrever informa que está aguardando a finalização.
- Um vídeo sem áudio, mídia corrompida ou tipo não aceito recebe mensagem clara, sem substituir um resultado anterior.
- Se não houver chave configurada ou conexão, o app orienta a configurar a chave ou tentar novamente; a mídia permanece disponível na sessão.
- Durante um processamento longo, o usuário vê que ele continua em andamento e pode cancelar; cancelar não descarta a mídia nem o texto anterior.
- Uma segunda solicitação enquanto a primeira ainda está ativa não inicia processamento duplicado; o usuário precisa concluir ou cancelar a tentativa atual.
- Uma mídia sem fala reconhecível termina com estado explícito de ausência de transcrição, sem disponibilizar TXT ou SRT vazios.
- Em gravações com pausas, os tempos do SRT devem acompanhar a linha do tempo do arquivo final reproduzido.
- Fechar a janela interrompe o acesso à gravação e à transcrição ainda não baixadas; o app não promete recuperar conteúdo não salvo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O app DEVE oferecer uma ação explícita de transcrever na tela final de gravações Vídeo + Áudio e Só Áudio, independentemente de a transcrição ao vivo ter sido ativada.
- **FR-002**: O app DEVE oferecer na tela inicial a seleção de um arquivo de vídeo WebM ou MP4 ou áudio WebM ou MP3 salvo no computador, sem exigir uma nova gravação.
- **FR-003**: O app DEVE permitir escolher português do Brasil ou inglês antes de cada transcrição posterior e DEVE associar o resultado ao idioma escolhido.
- **FR-004**: O app DEVE informar, antes de iniciar, que somente o áudio será enviado pela internet à ElevenLabs para transcrição e DEVE iniciar a preparação e o envio somente após a ação explícita do usuário. Para vídeos, DEVE separar localmente a faixa de áudio e não enviar a faixa de vídeo.
- **FR-005**: O app DEVE reutilizar o mecanismo local de configuração de credenciais, mantendo uma chave ElevenLabs própria para a transcrição posterior, separada da chave Deepgram do fluxo ao vivo. Se a chave necessária estiver ausente, DEVE orientar a configurá-la sem perder a mídia da sessão.
- **FR-006**: O app DEVE transcrever o áudio da mídia selecionada ou recém-finalizada e DEVE apresentar o texto completo disponível ao usuário, sem inserir conteúdo inferido de outras fontes.
- **FR-007**: O app DEVE mostrar o estado do processamento, permitir cancelá-lo e indicar claramente conclusão, falha ou ausência de fala reconhecível.
- **FR-008**: O app DEVE permitir nova tentativa após falha ou cancelamento, preservando a mídia e qualquer transcrição anterior disponível na sessão.
- **FR-009**: O app DEVE mostrar a transcrição ao vivo existente na tela final e DEVE oferecer retranscrição sob demanda; o resultado anterior só pode ser substituído após a nova transcrição ser concluída com texto.
- **FR-010**: Após transcrição com texto, o app DEVE permitir baixar o conteúdo completo em TXT e as legendas em SRT com tempos relativos ao arquivo reproduzido, inclusive quando a gravação tiver pausas.
- **FR-011**: O app DEVE recusar ou informar de forma explícita mídia sem áudio, inválida, não suportada ou sem fala reconhecível e DEVE impedir o download de TXT ou SRT vazios como resultado bem-sucedido.
- **FR-012**: O app DEVE impedir transcrições simultâneas ou duplicadas na mesma janela e DEVE manter disponível a opção de baixar a gravação recém-finalizada enquanto a transcrição está em andamento ou após cancelamento/falha.
- **FR-013**: O app DEVE deixar o arquivo de mídia original inalterado e DEVE manter transcrição e mídia apenas durante a sessão, salvo os arquivos que o usuário baixar.
- **FR-014**: O app DEVE preparar o áudio para envio sem reproduzir o vídeo em tempo real e sem recodificar a faixa de áudio quando ela puder ser copiada para um formato aceito. DEVE mostrar a etapa de preparação, permitir cancelá-la e informar incompatibilidade ou falta de recursos sem perder a mídia ou o texto anterior.

### Key Entities

- **Mídia de origem**: gravação recém-finalizada ou arquivo selecionado; inclui nome, tipo, duração quando disponível e presença de áudio.
- **Solicitação de transcrição**: mídia de origem, idioma escolhido e estado (aguardando, em andamento, concluída, cancelada ou com falha).
- **Transcrição**: texto reconhecido e segmentos temporais usados para gerar TXT e SRT; pode ser resultado ao vivo existente ou resultado posterior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em testes com fala audível, o usuário consegue iniciar a transcrição da gravação recém-finalizada em ambos os modos sem baixar e selecionar o arquivo antes.
- **SC-002**: Em testes com fala audível, cada um dos quatro formatos aceitos (vídeo WebM, vídeo MP4, áudio WebM e áudio MP3) pode ser selecionado na tela inicial e produzir texto, TXT e SRT.
- **SC-003**: Em 100% dos cenários de cancelamento e falha dos testes de aceite, a mídia da sessão e uma eventual transcrição anterior permanecem disponíveis, com possibilidade de nova tentativa.
- **SC-004**: Em 100% dos testes com mídia inválida, sem áudio ou sem fala reconhecível, o app informa o estado ao usuário e não apresenta arquivos de transcrição vazios como sucesso.
- **SC-005**: Em testes com gravação pausada e retomada, as legendas SRT acompanham a reprodução do arquivo final nos trechos de fala.
- **SC-006**: No Chrome, em um vídeo WebM longo gerado pelo app e em um MP4 com AAC, a preparação termina sem aguardar a duração de reprodução, envia um arquivo que contém somente áudio e preserva a mídia original; falha ou cancelamento mantém a fonte disponível.

## Assumptions

- O público é o usuário da extensão Chrome existente; o fluxo fica na janela atual do gravador.
- A transcrição posterior usa ElevenLabs Scribe v2, escolhida pelo usuário após comparar quatro trechos PT-BR com Deepgram Nova-3; requer internet e uma chave ElevenLabs configurada no app. O fluxo ao vivo continua na Deepgram.
- A arquitetura do cliente posterior mantém um contrato de adaptador para permitir incluir novos provedores em outra entrega; esta versão não oferece seletor de provedores na interface.
- A gravação atual em vídeo WebM com áudio Opus permanece como formato padrão; mudar a captura ou gerar um arquivo auxiliar de áudio não mostrou benefício necessário para esta entrega.
- O reconhecimento de fala pode conter erros; os critérios exigem fluxo funcional e alinhamento temporal, não precisão perfeita de cada palavra.
- Não há histórico interno nem sincronização entre dispositivos. A recuperação de sessões antigas ocorre pela seleção de um arquivo salvo pelo usuário.
- Não foi definido um limite de duração ou tamanho como regra de produto; eventuais limitações reais de processamento devem ser identificadas no planejamento e comunicadas ao usuário no fluxo.

## Clarifications

### Sessão 2026-10-31

- Q: Quais vídeos poderão ser transcritos depois? → A: A gravação recém-finalizada e arquivos já salvos no computador.
- Q: Quais arquivos de vídeo salvos devem ser aceitos? → A: WebM do app e MP4 comum, desde que tenham áudio.
- Q: Qual resultado é necessário? → A: Visualizar o texto e baixar TXT e SRT.
- Q: Como iniciar após finalizar a gravação? → A: Por botão explícito na tela final; arquivos salvos entram por seleção na tela inicial.
- Q: Quais idiomas oferecer? → A: Português do Brasil e inglês, como no fluxo atual.
- Q: A transcrição posterior pode usar a chave existente e enviar áudio pela internet? → A: Sim, com aviso antes de iniciar e orientação para configurar a chave quando faltar.
- Q: O que deve continuar disponível depois de fechar a janela? → A: Apenas os arquivos baixados; o usuário pode selecionar a mídia novamente para retranscrever.
- Q: O modo Só Áudio também deve entrar? → A: Sim, incluir vídeo e gravações Só Áudio do app.
- Q: O que fazer quando já existe transcrição ao vivo? → A: Mostrar a existente e oferecer retranscrição sob demanda.
- Q: Quais recursos adicionais entram nesta entrega? → A: Nenhum; ficam fora edição, tradução e separação de falantes.
- Q: A seleção na tela inicial também aceita áudios salvos? → A: Sim, WebM de áudio e MP3 gerados pelo app, além dos vídeos WebM e MP4.
- Q: Qual controle oferecer durante transcrição longa? → A: Mostrar andamento e permitir cancelar sem perder a gravação ou o texto anterior.
- Q: Qual serviço usar após comparar qualidade e custo? → A: ElevenLabs Scribe v2 para transcrição posterior; validar inglês e Chrome depois. O fluxo ao vivo permanece Deepgram.
- Q: A arquitetura deve permitir novos provedores? → A: Sim, deixar um contrato de adaptador para inclusão futura, sem seleção de API na interface desta entrega.
- Q: Como enviar rapidamente apenas o áudio sem mudar a gravação? → A: Separar localmente a faixa codificada de WebM/Opus e MP4/AAC, sem reprodução em tempo real; manter o formato atual da gravação e validar extração, envio e consumo de memória no Chrome.
