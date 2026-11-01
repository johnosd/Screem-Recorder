# Handoff: 001-transcricao-pos-gravacao

## Contexto

Repositório `C:\Users\johns\Documents\Projetos\screen recorder`, branch `feature/indetect`; extensão Chrome MV3 em JavaScript/Webpack/Jest. Backlog: `Planejada`, 0/29 itens. Próximo comando: `/sdd-execute 001-transcricao-pos-gravacao`. A pasta de amostras e o `.env` são locais; não ler ou publicar segredos. A dependência Mediabunny da prova ficou em `%TEMP%`, ainda fora do `package.json`.

## O que a feature entrega

- **P1**: transcrever gravação de vídeo ou Só Áudio após `MediaRecorder.onstop`, com botão explícito, texto, TXT/SRT, cancelamento e preservação do resultado ao vivo anterior.
- **P2**: selecionar vídeo WebM/MP4 ou áudio WebM/MP3 salvo, transcrever sem nova captura e sem histórico após fechar a janela.
- O usuário escolheu ElevenLabs Scribe v2 para arquivos e pediu adaptador extensível. Deepgram continua ao vivo. O usuário quer envio rápido **somente do áudio**: manter WebM/Opus da captura e extrair localmente a faixa dos vídeos após o clique, sem enviar imagem ou criar gravação paralela. Ver ADR-001.

## Leitura obrigatória, em ordem

1. `spec.md`: FR-001–014, SC-001–006, escopo e retenção.
2. `plan.md`: DI-001–007, arquitetura, riscos e ordem.
3. `tasks.md`: T001–T019, incluindo T002a, e gates por fase.
4. `logic/session-state.md` e `data-model.md`: contrato da sessão, áudio temporário e substituição atômica.
5. `research.md` e `provider-evaluation.md`: prova de remux e comparação de serviços, com limites.
6. `quickstart.md`: evidência Chrome e ElevenLabs real.
7. `.planning/memory/constitution.md` e `sdd/adr/ADR-001-provedores-transcricao-por-modalidade-adaptador.md`: princípios e separação dos provedores.

## Testes de contrato

`src/post-transcription.contract.test.js` contém 5 testes travados para P1: transcrição sem download, confirmação antes da rede, cancelamento e resposta tardia, tentativa duplicada e SRT com pausa. Rodar `npm test -- --runInBand src/post-transcription.contract.test.js` e verificar trava com `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 001-transcricao-pos-gravacao`. Os cinco testes estão vermelhos pelos stubs, como esperado no planejamento; não editar o teste ou `contract-tests.lock`. Não há outras travas conhecidas nesta feature.

## Stubs criados

- `src/post-transcription-session.js`: exporta `createPostTranscriptionSession`; métodos vazios/`not implemented`.
- `src/post-transcription-client.js`: exporta `transcribePreRecorded({ media, language, key, signal, onStage, fetchImpl })`; lança `not implemented`. Manter a assinatura e orquestrar preparação + adaptador ElevenLabs.
- `src/subtitles.js`: exporta `buildSrt`; lança `not implemented`.

## Armadilhas já mapeadas

- `MediaRecorder.stop()` é assíncrono; construir fonte somente em `onstop`, após o último chunk. `doStop()` atual anuncia conclusão antes disso (R-003).
- Remux Mediabunny 1.63.0 foi provado **em Node local**, não no Chrome: WebM do app de ~78 min/1,06 GB gerou áudio ~75 MB em 3,6 s; MP4 H.264/AAC curto também gerou M4A só de áudio. Testar bundle, memória, cancelamento, codec e pausa no Chrome (R-007). Não usar `encodeMp3()`, que decodifica tudo. Não enviar vídeo como fallback.
- O limite documentado ElevenLabs de 5 GB vale para **áudio preparado**, não para o vídeo original. `AbortController` não garante cancelamento de processamento/cobrança já iniciado no servidor.
- Chaves Deepgram e ElevenLabs são distintas em `chrome.storage.local`. Adicionar apenas host HTTPS ElevenLabs em `manifest.json`; manter Deepgram para ao vivo. Avisos da interface devem nomear cada destino antes de ativar.
- Quatro amostras PT-BR favoreceram preliminarmente ElevenLabs em termos técnicos; sem WER, inglês ou arquivo longo no serviço. Soniox sem saldo e AssemblyAI sem chave. Não chamar isso de validação completa (R-006).

## Pendências do Analyze

Nenhum achado crítico ou alto conhecido após sincronização; conferir cobertura FR/SC e terminologia antes de executar.

## Gate de pronto

Cinco contratos verdes e trava íntegra; `npm test -- --runInBand`; `npm run build`; `quickstart.md` executado no Chrome com WebM longo, MP4/AAC, cancelamento e verificação do payload sem vídeo. Separar evidência Node, Chrome e ElevenLabs real. Atualizar README, backlog e estado SDD. Ausência de teste Chrome ou serviço real deve ser registrada como pendência, nunca como aceite comprovado.
