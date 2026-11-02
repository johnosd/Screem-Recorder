# Constitution do Screen & Audio Recorder

## Princípios Fundamentais

### I. Contrato verificável por mudança

Toda feature DEVE definir o comportamento visível, os critérios de aceite e o que fica fora de escopo antes de ser planejada. Quando envolver mídia ou transcrições, a spec DEVE definir por quanto tempo os dados ficam disponíveis, como são descartados e o que ocorre em cancelamento e falha. Quando houver troca entre qualidade, desempenho e tamanho de arquivo, o plano DEVE registrar metas verificáveis e justificar a escolha; não existe uma prioridade global fixa entre esses fatores. O plano e a implementação NÃO DEVEM ampliar silenciosamente o escopo aprovado.

### II. Envio transparente e proteção de credenciais

Toda função que envia áudio, vídeo, transcrição ou outro dado pessoal a um serviço externo DEVE informar na interface, antes de ser ativada, quais dados serão enviados e para qual serviço. Depois da ativação, o envio pode ocorrer automaticamente enquanto a função estiver ativa, conforme seu fluxo especificado. Credenciais DEVEM permanecer fora do código-fonte, dos arquivos gerados, dos testes, dos logs e dos relatórios; mudanças de permissões ou destinos de rede DEVEM ter necessidade descrita no plano e no manifesto. A spec de cada feature define suas próprias regras de preservação e descarte de mídia.

### III. Plataforma e responsabilidades explícitas

O Chrome com Manifest V3 é o alvo principal. Planos para outros navegadores ou plataformas DEVEM registrar a decisão específica antes de prometer compatibilidade. Cada mudança DEVE indicar onde ficam a interface, o controle da gravação, o processamento e as integrações externas; responsabilidades NÃO DEVEM ser duplicadas entre a janela do gravador, o popup e o service worker sem justificativa. O código-fonte em `src/` e as páginas da extensão são a referência para manutenção; `dist/` é resultado do build e NÃO DEVE ser editado manualmente.

### IV. Evidência proporcional ao comportamento

Mudanças de código DEVEM passar por `npm test` e `npm run build` antes de serem declaradas prontas, ou registrar a falha e seu impacto. Mudanças em captura, áudio, permissões, ciclo de vida da gravação ou transcrição DEVEM ser verificadas também no Chrome com o fluxo afetado. Se essa verificação não ocorrer, o resultado DEVE ser descrito como pendente de validação no Chrome, com o limite explícito; teste e build não comprovam comportamento real de captura ou de serviço externo. Critérios de aceite e documentação de uso DEVEM acompanhar o comportamento efetivamente entregue.

## Restrições do Projeto

- O produto atual é uma extensão Chrome Manifest V3, com janela própria para gravar tela e áudio, microfone opcional, pausa/retomada e download manual dos arquivos.
- A transcrição atual é opcional e usa um serviço externo configurado pelo usuário. O nome do serviço, o empacotador e a organização interna atual não são escolhas imutáveis; uma troca estrutural exige ADR antes da implementação.
- A chave de acesso ao serviço de transcrição é dado sensível. O projeto pode guardá-la no armazenamento local da extensão para uso em tempo de execução, mas não pode publicá-la ou registrá-la em texto claro nos artefatos de desenvolvimento.
- Cada feature decide se haverá persistência, histórico, descarte e comportamento automático. A constitution não impõe armazenamento permanente nem preservação irrestrita de resultados temporários.

## Fluxo de Desenvolvimento e Conclusão

1. Mudanças de produto seguem o fluxo SDD aplicável: spec para definir o quê, plano e tasks para decidir como, execução com evidências, e convergência para conferir código e documentação. Ajustes pequenos e bugs usam seus fluxos próprios.
2. Antes de implementar, o plano DEVE confrontar cada princípio desta constitution e registrar decisões técnicas que afetem escopo, dados, permissões, qualidade ou desempenho.
3. Para mudanças de código, o registro de conclusão DEVE trazer o resultado de `npm test` e `npm run build`. Para fluxos dependentes do Chrome ou de serviço externo, DEVE separar evidência automatizada de validação real e indicar o que continua pendente.
4. Uma feature só pode ser descrita como plenamente validada quando seus critérios de aceite aplicáveis tiverem evidência correspondente. Limites aceitos pelo proprietário podem ser registrados sem serem apresentados como testes realizados.
5. Mudanças estruturais de plataforma, serviço de transcrição ou empacotamento DEVEM ser registradas em ADR com motivo, alternativas e consequências antes da mudança.

## Governança

O proprietário do projeto aprova adições, remoções ou redefinições dos princípios desta constitution. Correções de texto sem alteração semântica podem ser registradas sem aprovação. Emendas DEVEM indicar a versão, a data e o efeito sobre specs e planos em andamento; um conflito entre uma feature e esta constitution exige decisão explícita antes da implementação.

A constitution usa versionamento semântico. Uma versão MAJOR denota remoção ou redefinição incompatível de um princípio. Uma versão MINOR denota um novo princípio ou expansão material da governança. Uma versão PATCH denota esclarecimentos, correções ou mudanças de texto não semânticas.

**Versão**: 1.0.0 | **Ratificada**: 2026-10-31 | **Última Emenda**: 2026-10-31
