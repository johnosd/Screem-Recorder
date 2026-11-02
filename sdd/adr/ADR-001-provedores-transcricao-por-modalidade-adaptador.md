# ADR-001: Provedores de transcrição por modalidade com adaptador extensível

## Status

Aceita em 2026-10-31 para a feature 001. O fluxo ao vivo existente continua com Deepgram Nova-2; a transcrição posterior usará ElevenLabs Scribe v2.

Nota de 2026-11-02: a feature `002-escolha-provedor-transcricao` concretizou a seleção de provedores prevista no caminho de evolução desta ADR, usando o mesmo contrato de adaptador e acrescentando o Deepgram Nova-3 para arquivos gravados; o padrão continua ElevenLabs e a decisão acima não foi alterada.

## Data

2026-10-31

## Contexto

A extensão Chrome Manifest V3 transcreve ao vivo pelo WebSocket da Deepgram, com chave do usuário em `chrome.storage.local`. A nova transcrição de arquivos exige texto e tempos para TXT/SRT em PT-BR e inglês. O proprietário pediu boa qualidade e baixo custo, com preferência por ElevenLabs e Deepgram, e quer poder incluir novos provedores depois.

Quatro trechos reais de aproximadamente 45 segundos em PT-BR foram transcritos por Deepgram Nova-3 e ElevenLabs Scribe v2. Ambos entregaram tempos por palavra; a leitura preliminar favoreceu ElevenLabs em termos técnicos como `dataset` e `overfitting`. Não há referência humana, amostra em inglês nem prova de arquivo longo no Chrome. Soniox v5 não pôde ser avaliada por saldo esgotado e AssemblyAI não tinha chave disponível. A decisão de produto por ElevenLabs foi confirmada pelo proprietário, com validação em inglês e no Chrome posteriormente.

## Decisão

1. Manter a transcrição ao vivo Deepgram isolada. Usar ElevenLabs Scribe v2 para transcrição posterior nesta feature, com uma chave própria armazenada no mecanismo local já usado pelo app, em campo distinto da chave Deepgram.
2. Definir um contrato único de adaptador para transcrição posterior: entrada `{ audio, language, key, signal, onStage }`, em que `audio` já é um arquivo só de áudio; saída normalizada `{ text, words: [{ text, start, end }] }`; erro classificado sem credencial ou conteúdo sensível. Um preparador comum separa o áudio de vídeos antes do adaptador. Sessão, interface e gerador de SRT não dependem do formato bruto da ElevenLabs.
3. Registrar apenas o adaptador ElevenLabs na primeira entrega. A interface não oferece seleção de provedores nesta fase. Um novo provedor requer adaptador, configuração própria, host/permissão justificados, aviso do destino, testes e atualização da decisão de produto; não requer reescrever sessão, downloads ou fluxo de captura.
4. O aviso antes do envio nomeia o serviço e informa que somente áudio será transmitido. Manter a gravação WebM/Opus atual; não criar arquivo auxiliar de áudio na captura. Separar localmente a faixa de áudio sob demanda e recusar codec incompatível, sem envio do vídeo como fallback. Não manter chaves em código, build, log ou relatório.

## Alternativas Consideradas

### Deepgram Nova-3 para arquivos

Reutilizaria chave, host e parte da experiência atual. Nos trechos avaliados, produziu `data 7` e `overfeeding` onde ElevenLabs produziu termos técnicos plausíveis. A tarifa pré-gravada usada como referência era US$ 0,258/h e precisa ser reconfirmada na conta. Foi mantida como comparador e opção futura, sem substituir o fluxo ao vivo.

### Soniox v5 para arquivos

O fornecedor informa custo aproximado de US$ 0,10/h com cobrança por tokens. O primeiro job real falhou por saldo esgotado; não existe evidência de qualidade nas gravações deste usuário. Pode ser acrescentada após saldo e avaliação.

### AssemblyAI Universal-2/3.5 Pro

Oferece modelos em dois níveis de preço e tempos por palavra, mas não havia chave de teste disponível. Não há evidência comparativa nas amostras.

### Acoplar ElevenLabs diretamente à sessão/UI

Exigiria menos arquivos no início, mas espalharia formato de resposta, autenticação e tratamento de erro. Contrariaria o pedido de inclusão futura de provedores e aumentaria o retrabalho de cada nova integração.

## Consequências

### Positivas

- A transcrição posterior pode evoluir por adaptadores sem alterar as regras de sessão, preservação e SRT.
- A escolha inicial usa um provedor que concluiu as quatro amostras e entregou tempos por palavra.
- As chaves e os avisos distinguem claramente o fluxo ao vivo do fluxo posterior.
- A captura e os downloads atuais permanecem em WebM; a extração comum atende gravações novas e vídeos importados.

### Negativas

- O app passa a depender de duas contas e duas chaves para oferecer ambos os modos de transcrição.
- A extensão precisa de permissão HTTPS para ElevenLabs e de aviso correto sobre a mídia enviada.
- O remux local acrescenta dependência e custo de memória; a prova rápida em Node ainda requer validação no Chrome com arquivos longos e MP4/AAC.
- A evidência atual não mede acurácia em inglês, arquivos longos ou sincronização no Chrome. A adoção é uma decisão com essas validações pendentes.

### Caminho de Migração / Evolução Futura

Ao incluir outro serviço, comparar custo e acurácia em amostras representativas, implementar o mesmo contrato de adaptador, testar autorização/limites/cancelamento, adicionar somente a permissão de host necessária e rever o aviso de envio. Se seleção de provedores virar requisito de produto, especificar a interface e a política de chaves em uma feature própria. Uma troca de provedor padrão exige emenda por nova ADR.
