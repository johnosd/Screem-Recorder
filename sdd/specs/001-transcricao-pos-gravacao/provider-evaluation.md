# Avaliação de provedores para transcrição pós-gravação

**Estado**: ElevenLabs Scribe v2 escolhida pelo usuário em 2026-10-31 após testes reais em quatro trechos PT-BR. Os preços em USD são referências, sujeitos a plano, uso, impostos e alterações. A qualidade foi comparada por leitura, sem referência humana/WER; inglês e arquivo longo no Chrome permanecem sem prova.

## Candidatos avaliados

O usuário prefere ElevenLabs ou Deepgram, desde que a qualidade seja boa e o custo baixo. Soniox v5 e AssemblyAI entraram na análise, mas não concluíram testes. A prioridade declarada de Soniox como “campeão geral” era hipótese, não resultado. A escolha vale apenas para a transcrição **posterior**; o fluxo ao vivo atual usa Deepgram Nova-2. Identificação de falantes, tradução e troca do fluxo ao vivo estão fora desta primeira feature.

| Provedor e modelo de arquivo | Preço público aproximado por hora | Tempos para SRT | Integração e situação |
| --- | ---: | --- | --- |
| Soniox `stt-async-v5` | ~US$ 0,10, estimativa variável por tokens | Tokens com início/fim | Primeiro job real falhou por saldo esgotado. |
| ElevenLabs `scribe_v2` | US$ 0,22 | Palavras com início/fim | Envio multipart direto; quatro trechos reais concluídos. Escolhida para a feature. |
| AssemblyAI `universal-2` | US$ 0,15 | Palavras com início/fim | Envio e job assíncrono. O usuário tem conta. |
| AssemblyAI `universal-3-5-pro` | US$ 0,21 | Palavras com início/fim | Mesmo fluxo; avaliar se a qualidade compensa o custo frente ao Universal-2. |
| Deepgram `nova-3` monolíngue | US$ 0,258, referência anterior para arquivos; confirmar na conta | Palavras com início/fim | Reutiliza integração e chave do app. O usuário tem conta. |

Fontes oficiais: [Soniox: preços](https://soniox.com/pricing), [API assíncrona](https://docs.soniox.com/stt/async/async-transcription); [ElevenLabs: preços](https://elevenlabs.io/pricing/api?price.section=speech_to_text), [API Scribe v2](https://elevenlabs.io/docs/api-reference/speech-to-text/convert); [AssemblyAI: preços](https://www.assemblyai.com/pricing), [seleção do modelo](https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model); [Deepgram: preços](https://deepgram.com/pricing), [transcrição de arquivos](https://developers.deepgram.com/docs/pre-recorded-audio).

Os valores de transcrição ao vivo citados pelo usuário (~US$ 0,12 Soniox, US$ 0,39 ElevenLabs e US$ 0,15/0,45 AssemblyAI) são contexto de mercado e não entram na decisão desta feature. O preço da Soniox depende do volume de tokens, portanto ~US$ 0,10/h não é tarifa fixa. O preço da ElevenLabs deve ser confirmado no plano efetivo da conta. A página atual da Deepgram mostra streaming por padrão; confirmar a tarifa pré-gravada antes do comparativo financeiro final. Não presumir política de retenção zero para nenhuma conta; verificar os termos antes da integração definitiva.

## Amostras e execução

O usuário autorizou comparar cópias de trechos reais. Foram encontrados três vídeos WebM gerados pelo app: cerca de 7 segundos, 78 minutos e 45 minutos. Os originais permanecem intactos. Quatro trechos de 45–47 segundos, entre 710 e 733 KiB, estão em `%TEMP%\screen-recorder-stt-eval-20261031\sample01.webm` a `sample04.webm`, com áudio detectável. A fala é principalmente em português brasileiro, conforme o usuário. Ainda faltam uma amostra em inglês e uma transcrição humana corrigida; sem referência, não é possível calcular taxa de erro de palavras.

O comparador [evaluation/compare-providers.mjs](evaluation/compare-providers.mjs) envia os mesmos trechos aos modelos selecionados e grava texto, tempos, duração da chamada e erros em `results.json` **somente na pasta temporária**, fora do Git. O wrapper [evaluation/run-comparison.ps1](evaluation/run-comparison.ps1) carrega apenas as chaves necessárias do `.env` local ou solicita em entrada oculta se faltarem, removendo as variáveis que criou ao terminar. Por padrão executa Deepgram e ElevenLabs; `-IncludeSoniox` e `-IncludeAssemblyAI` acrescentam os demais. O comparador evita repetir resultados concluídos. `-RetryErrors` repete falhas e `-Samples sample01.webm` limita o teste. Não enviar chaves pelo chat nem registrar chaves no repositório.

Executar no PowerShell, a partir da raiz do projeto:

```powershell
& .\sdd\specs\001-transcricao-pos-gravacao\evaluation\run-comparison.ps1
```

## Rodada real de 2026-10-31

O usuário adicionou chaves no `.env` e confirmou créditos na ElevenLabs, OpenAI e Deepgram; não há chave AssemblyAI no arquivo. O `.env` foi incluído no `.gitignore`. OpenAI não foi chamada porque não integra a lista de candidatos acordada para esta feature.

Os quatro trechos foram enviados à Deepgram Nova-3, que retornou texto e timestamps para todas as palavras detectadas: 102, 98, 118 e 87 palavras; duração de chamada entre 0,3 e 1,9 s. Isso prova execução da API e presença de dados para SRT, mas não acurácia sem referência humana. A Soniox recebeu a primeira amostra, mas o job falhou com `organization_balance_exhausted`; as demais amostras não foram tentadas. A ElevenLabs rejeitou os quatro pedidos com HTTP 400: o valor em `ELEVENLABS_API_KEY` é um **ID de chave**, não o segredo de API. Uma segunda chamada de diagnóstico na primeira amostra confirmou o motivo. Não há transcrição ElevenLabs nem cobrança de transcrição verificável nessa rodada.

O usuário substituiu a chave ElevenLabs e a segunda rodada com `-RetryErrors` concluiu os quatro trechos no Scribe v2. Os resultados contêm 100, 99, 94 e 85 palavras com início/fim válidos e em ordem, até 44–47 segundos. As respostas levaram 1,6–2,3 s; as quatro respostas Deepgram existentes levaram 0,3–1,9 s. Esses tempos medem somente o processamento dos trechos curtos neste ambiente, não a duração de arquivos longos nem o Chrome.

Na leitura lado a lado, a ElevenLabs reconheceu `overfitting`, `dataset`, `ax+b` e `em C` em trechos nos quais a Deepgram retornou, respectivamente, `overfeeding`, `data 7`, `0AX` e `em si`. Isso é um **indício favorável** à ElevenLabs para vocabulário técnico nesta aula, sujeito a conferência com o áudio. A ElevenLabs também normalizou algumas hesitações/repetições; isso pode melhorar leitura e ocultar fala literal, conforme o objetivo do usuário. Não foi calculada taxa de erro de palavras.

A tarifa publicada da ElevenLabs Scribe v2 é US$ 0,22/h. A referência anterior para Deepgram Nova-3 pré-gravado é US$ 0,258/h, mas a tarifa atual de arquivos precisa ser confirmada na conta, pois a página pública mostra streaming por padrão. O usuário **escolheu ElevenLabs Scribe v2** para a transcrição posterior após essa rodada, mantendo a arquitetura aberta para novos provedores; Deepgram continua no fluxo ao vivo. Ver [ADR-001](../../adr/ADR-001-provedores-transcricao-por-modalidade-adaptador.md).

Ainda são necessários um trecho em inglês e uma transcrição de referência corrigida para medir acurácia. A comparação Soniox depende de saldo; a AssemblyAI depende de chave. Essas lacunas permanecem registradas, mas a decisão explícita do usuário fechou a escolha para esta entrega.

## Critérios de comparação

1. Conferir o texto lado a lado, marcando omissões, acréscimos e nomes próprios. Quando houver transcrição de referência, calcular taxa de erro de palavras por trecho.
2. Conferir pelo menos três pontos do SRT em cada resultado, incluindo pausa, e registrar respostas sem tempos úteis.
3. Registrar falhas, latência, restrições de tamanho e custo estimado por hora com a tarifa vigente. Para arquivos longos, medir também preparação/divisão de mídia necessária no Chrome.
4. Escolha encerrada para esta entrega: ElevenLabs Scribe v2. Validar inglês, arquivo longo, remux e envio de somente áudio no Chrome durante a implementação.
5. Reavaliar Soniox/AssemblyAI em uma futura decisão de inclusão de provedor, se houver saldo/chave e amostras autorizadas.

Benchmarks públicos e alegações dos fornecedores ajudam a selecionar candidatos, mas não comprovam qualidade nas gravações deste app.
