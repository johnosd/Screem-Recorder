# Estratégia de teste no navegador

Antes de solicitar validação manual de uma alteração da extensão, executar o teste Playwright no Chromium com a extensão carregada em perfil isolado. O comando `npm run test:e2e` faz o build e executa os cenários de `e2e/extension.spec.cjs`. Na primeira instalação, rodar `npm run test:e2e:install`.

O fluxo automatizado importa um WebM sintético, confere que não há requisição antes do clique, simula a resposta da ElevenLabs, verifica que o multipart contém somente áudio e valida o texto e os downloads TXT/SRT. A rede externa é bloqueada nesse cenário. Nenhuma chave real é necessária.

`playwright.config.cjs` limita a descoberta a `e2e/**/*.spec.cjs`. O teste com serviço comercial fica em `integration/elevenlabs-live.test.mjs` e só roda com `npm run test:elevenlabs:live`; `node e2e/run.mjs test --list` deve mostrar apenas os cenários simulados antes de alterar o executor.

O coletor grava `browser-events.jsonl` por teste, com horário, teste, origem, nível e detalhe. Ele cobre a página da extensão, popup, service worker e requisições/respostas/falhas de rede. Um teste separado provoca logs, exceção e falha de rede para garantir que o coletor continue funcionando. Em falhas, o Playwright preserva trace e screenshot em `test-results/`; o relatório HTML fica em `playwright-report/`. Esses diretórios são ignorados pelo Git.

Chrome DevTools MCP é apoio opcional para exploração interativa de falhas, usando `--categoryExtensions`. Fluxos importantes descobertos nessa exploração devem virar testes Playwright repetíveis.

A automação com mídia sintética não comprova o seletor nativo de tela, áudio físico, suspensão/retomada natural do service worker, desempenho de arquivo longo nem a resposta do serviço comercial real. Registrar essas evidências separadamente em `qa-evidence.md` antes de fechar os itens correspondentes da SDD.

Referências: [Playwright para extensões](https://playwright.dev/docs/chrome-extensions), [Playwright trace](https://playwright.dev/docs/trace-viewer), [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp).
