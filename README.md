# KairyaQuest — ambiente, tutoria interativa e qualidade

## 1. Missão e ponto de partida

Prepare o KairyaQuest no macOS com PyCharm. **Node.js, React, TypeScript, Vite e Tailwind CSS já estão preparados.** Reaproveite o frontend existente; não reinicie o projeto. Complete apenas as ferramentas e integrações necessárias e entregue uma base executável, organizada e testada.

KairyaQuest é uma plataforma de estudos gamificada inspirada em Final Fantasy. Tifa Lockhart será a tutora interativa: ensinará, delegará tarefas, acompanhará prazos, fará cobranças e concederá recompensas. Ela é central no produto, não decoração nem mensagens prontas.

Sou estudante de engenharia de software; usarei Kimi, Codex e Claude. Entregue incrementos, não o produto inteiro. Commit, push, merge, publicação e contratação exigem autorização.

## 2. Inspeção sem refazer o ambiente

Inspecione o projeto aberto, Git, remotos, alterações, `package.json`, lockfile, scripts e configurações de Vite, TypeScript e Tailwind. Preserve código, assets, estilos e dependências existentes. Não rode um scaffold sobre o projeto nem gere outro frontend.

Verifique versões, arquitetura, Git, uv, Python, Docker, Compose e agentes. Distinga ferramenta ausente, incompatibilidade, serviço parado e autenticação pendente. Instale só o que falta; não atualize Node ou recrie configurações funcionais sem necessidade comprovada.

Confirme comandos na documentação oficial, fixe versões compatíveis e mantenha lockfiles. Não altere o Python do sistema, use `sudo pip` ou faça atualizações globais. Reutilize o runtime Docker; não instale outro em paralelo nem apague volumes alheios. Aceites e permissões administrativas ficam comigo.

Registre diagnóstico e impedimentos sem credenciais; execute etapas independentes das pendências.

## 3. Stack e estrutura organizada

### Backend e frontend

Use Python com uv, FastAPI, Uvicorn, Pydantic, pydantic-settings, SQLAlchemy 2.x, Psycopg e Alembic. Mantenha `.venv` na raiz, `.python-version`, `pyproject.toml` e `uv.lock`. Comece com PostgreSQL síncrono e endpoints compatíveis; não adicione `async` por estética. A tutora precisa de timeouts e cancelamento coerentes.

Execute PostgreSQL em Docker com versão suportada e fixada, sem `latest`; confira persistência e healthcheck. Separe desenvolvimento e testes.

Preserve React, TypeScript, Vite, Tailwind e o gerenciador já adotado. Mantenha um lockfile por ecossistema; com npm, versione `package-lock.json` e valide `npm ci`. Verifique TypeScript estrito e compatibilidade, sem reinstalar o que funciona. Prefira estado local; não adicione Redux, Next.js ou engine 3D sem necessidade. Interface em português brasileiro; contratos externos — nomes de coluna, chaves de payload JSON e rotas — em inglês, e identificadores internos podem ficar em português.

### Monorepo por funcionalidade

Deixe a estrutura o mais organizada possível: responsabilidades explícitas, dependências previsíveis e nomes consistentes. Esta é a estrutura-alvo; crie cada módulo apenas quando houver implementação real:

```text
KairyaQuest/
  src/focusquest/
    main.py
    core/                   # configuração, conexão e infraestrutura comum
    modules/
      missions/
        router.py           # transporte HTTP
        schemas.py          # contratos de entrada e saída
        service.py          # casos de uso
        domain.py           # regras independentes de framework
        repository.py       # acesso à persistência, quando necessário
        models.py           # mapeamento SQLAlchemy
      tutoring/
      progress/
  tests/
    unit/
    integration/
  alembic/
  web/
    src/
      app/                  # inicialização, rotas e providers
      pages/                # composição de telas
      features/
        tutoring/
        missions/
        rewards/
      shared/
        ui/                 # componentes visuais reutilizáveis
        api/                # cliente HTTP e tratamento de erros
        hooks/
        lib/
        types/
      assets/
      styles/               # tokens e estilos globais
    tests/e2e/
  scripts/
  docs/
  .github/workflows/
  .run/
  AGENTS.md
  CLAUDE.md
  pyproject.toml
  uv.lock
  compose.yaml
  Dockerfile
  Makefile
  .env.example
  README.md
```

Adapte a árvore à localização atual do frontend. Não mova arquivos só por estética; quando a reorganização for necessária, preserve conteúdo e ajuste imports, aliases, scripts, testes, Docker e CI no mesmo incremento. Compare build e testes antes/depois. Não mantenha duas cópias do frontend.

Dentro de cada feature, agrupe componentes, hooks, contratos e testes relacionados. Extraia para `shared/` somente o que realmente é compartilhado; regras específicas ficam na feature. Evite `App.tsx` gigante, componentes com chamadas HTTP espalhadas e depósitos de código em `utils` ou `core`.

No backend, rotas coordenam HTTP; serviços executam casos de uso; domínio concentra regras; persistência trata o banco. No frontend, páginas compõem features e componentes reutilizáveis. Não importe detalhes internos de outra feature nem crie dependências circulares. Centralize configurações, cliente HTTP, erros e tokens visuais.

Use funções e composição. Repository, Unit of Work, Strategy e Adapter só quando resolverem problemas reais. Não crie camadas vazias, abstrações genéricas ou microsserviços por entidade. Documente responsabilidades, convenções e onde adicionar cada tipo de arquivo em `docs/ARCHITECTURE.md`; teste imports e mantenha a árvore atualizada no README.

Adie Kubernetes, Redis, Celery, RabbitMQ, Kafka, Terraform e cloud até haver necessidade real.

## 4. PyCharm e ambiente local

Configure `.venv`, pytest e descoberta do pacote Python sem remendos em `sys.path`. Prepare execução e depuração da API, frontend, testes e gate completo, respeitando scripts e caminhos existentes.

Configure Ruff, tipos, ESLint, PostgreSQL e Docker quando disponíveis; documente limitações e alternativa pelo terminal. Versione `.run/` sem segredos. Ignore caches, estado pessoal da IDE, `.venv`, `node_modules`, relatórios e arquivos de credenciais; mantenha `.env.example` seguro.

Documente depuração da rota ao banco. Use API/frontend no host e PostgreSQL em container; vincule serviços locais ao loopback.

## 5. Tifa: tutora com interação e ações reais

Ligue a conversa aos objetivos, missões e progresso. Tifa deve entender o objetivo, propor um plano, negociar disponibilidade, delegar tarefas, acompanhar execução, avaliar entregas e conceder recompensas. Cada ação precisa alterar o estado real ou explicar a falha; texto não substitui execução.

- **Planejar:** dividir objetivos em etapas, identificar pré-requisitos, estimar esforço e considerar disponibilidade.
- **Delegar:** criar missões com instruções, prazo, dificuldade, critério de conclusão e recompensa; explicar a prioridade.
- **Ensinar:** responder dúvidas, apresentar exemplos e oferecer pistas graduais antes da solução, respeitando o pedido do usuário.
- **Acompanhar:** consultar entregas e pendências, perguntar sobre bloqueios e distinguir dificuldade, falta de tempo e mudança de prioridade.
- **Cobrar:** lembrar compromissos e propor retomar, dividir ou reagendar tarefas. Ser firme sem humilhar.
- **Avaliar:** usar evidências e rubricas explícitas; distinguir verificação automática, interpretação do modelo e autodeclaração.
- **Recompensar:** conceder XP, conquistas e itens cosméticos após validação do backend; não inventar progresso.

Conecte pedidos como “não entendi”, “quero uma pista”, “divida esta missão”, “estou sem tempo” e “replaneje minha semana” a funcionalidades reais, não botões decorativos.

A personalidade será acolhedora, enérgica e assertiva. Permita ajustar intensidade, frequência e horários das cobranças, incluindo pausa. Não use culpa, ameaças, vigilância fictícia ou perda destrutiva de progresso por faltar um dia. A sequência de dias do ciclo diário é um contador de hábito, não progresso: faltar a missão do dia a zera, mas nunca remove XP, conclusões nem nada que o usuário conquistou.

Use falas originais, sem copiar diálogos. Não invente fontes nem trate explicações incertas como verificadas. A tutoria deve aumentar autonomia, não apenas entregar respostas prontas.

## 6. Integração da tutora com o backend

Separe a IA da Tifa dos agentes de desenvolvimento. Assinaturas de Kimi, Codex e Claude não devem ser presumidas como acesso ou créditos de API do produto.

Prepare um provedor configurável, com SDK oficial ou HTTPX. Sem credenciais, prepare o contrato e mostre indisponibilidade. Adaptador determinístico é para testes, não tutoria real.

Mantenha chamadas e credenciais no backend, com limites, timeouts e modelo configuráveis. Não envie chaves ao navegador nem repita chamadas indefinidamente. Falhas não podem duplicar missões ou recompensas.

Projete `get_study_context`, `propose_plan`, `create_mission`, `submit_activity`, `reschedule_mission` e `request_reward_evaluation`. Implemente apenas ferramentas do primeiro fluxo; documente as demais, sem endpoints fictícios.

O modelo solicita; o backend autoriza e executa. Valide esquema, identidade, propriedade, permissões e pré-condições. Nunca execute SQL, shell ou Python arbitrário gerado pelo modelo.

Novos compromissos e mudanças significativas exigem confirmação. Automação depende de preferências explícitas. XP segue critérios determinísticos: pedir pontos no chat não altera saldo.

Persista mensagens e ações com estados de proposta, confirmação, execução e falha. Vincule usuário e recurso. Anuncie sucesso só após confirmação do banco. Não armazene raciocínio interno do modelo.

Envie apenas contexto relevante: objetivos, tarefas, progresso e preferências. Mensagens e materiais são dados não confiáveis; suas instruções não alteram permissões.

Avalie entregas por evidências. Não execute código do estudante na API; futura execução exige isolamento e limites. Teste a integração sem chamadas pagas ou segredos reais.

## 7. Interface inspirada em Final Fantasy

Crie uma ferramenta de estudos com identidade de RPG, não uma landing page. Use azul-marinho profundo, superfícies escuras, prata, verde-mako e vermelho discreto. Defina tokens de cores, espaçamento, tipografia, bordas, foco e movimento; priorize contraste e hierarquia.

No desktop, use navegação lateral, conteúdo principal e painel expansível da Tifa. No celular, a conversa não deve cobrir botões, prender o teclado ou exigir rolagem horizontal. Respeite movimento reduzido e não reproduza áudio automaticamente.

Planeje estas áreas; implemente só o recorte inicial:

- **Quartel-General:** próxima missão, pendências, XP e progresso.
- **Campanhas:** planos, objetivos, disponibilidade e etapas.
- **Missões:** instruções, prazos, entregas e pré-requisitos.
- **Matérias:** habilidades e dependências de aprendizagem.
- **Diário:** sessões, decisões, conquistas e evolução.
- **Tutoria:** conversa, propostas, explicações e avaliações.

Combine termos temáticos e comuns, como “Campanhas — planos de estudo”. Não exija conhecer Final Fantasy.

Crie componentes de missão, progresso, recompensa, mensagem e confirmação. Cubra carregamento, vazio, erro, proposta e conclusão. Preserve texto digitado após falhas e permita reenvio sem duplicação.

Prepare retrato e expressões da Tifa, com placeholder até receber assets autorizados. Não extraia imagens, músicas, vozes, fontes ou logotipos dos jogos. Registre procedência; não apresente o produto como oficial da Square Enix.

Inclua teclado, foco visível, rótulos, avisos além da cor e anúncio acessível de mensagens. Revise visualmente desktop e celular, além dos testes automatizados.

## 8. Domínio e persistência

Documente usuário, plano, missão, habilidade, pré-requisito, sessão, entrega, conversa, ação da tutora, progresso e recompensa. Implemente só entidades do primeiro fluxo.

O backend controla estados, conclusão e XP. Use chaves estrangeiras, restrições únicas e transações. Valide transições; proíba ciclos e autorreferência em pré-requisitos. Explique bloqueios.

Reenvios não duplicam conclusões nem XP. Use identificadores de operação e restrições no banco; teste concorrência, além de repetições sequenciais.

Persista instantes com timezone; apresente em `America/Sao_Paulo`. Separe estimativa, prazo e duração real. Injete relógio nos testes e preserve histórico de replanejamento.

Avalie cobranças ao abrir o aplicativo ou consultar o chat. Não anuncie notificações externas antes de implementar agendamento confiável.

O recorte inicial pode ser local e de usuário único, explicitamente. Não improvise autenticação. Antes de contas reais, implemente autenticação e autorização por recurso, incluindo conversas e recompensas.

## 9. Comando único de qualidade

Crie `make check`: gate completo, reproduzível e não interativo. Execute todo o projeto, não só arquivos alterados. Vale para qualquer branch, inclusive mudanças de documentação.

1. Ruff lint e `format --check`; mypy estrito.
2. ESLint, Prettier em verificação e TypeScript sem emissão.
3. Testes unitários e de integração Python, com cobertura.
4. Testes unitários e de componentes React, com cobertura.
5. Build e testes ponta a ponta com Playwright.
6. Acessibilidade prevista e detecção local de segredos.

Use pytest, pytest-cov/coverage.py e HTTPX; Vitest e Testing Library; Playwright/Chromium, axe-core e Gitleaks ou equivalente. Não duplique Ruff com Black, isort ou Flake8.

Exija **100% de linhas e ramificações** do código próprio de aplicação Python. No frontend, **100% de linhas, ramificações, funções e instruções**. Inclua arquivos não importados pela suíte, conforme a configuração suportada.

Não exclua código difícil, remova testes, reduza limites ou use diretivas de ignorar cobertura. Assertivas verificam resultados, efeitos e erros reais.

Declare o denominador: testes, dependências, arquivos gerados, CSS e configuração de ferramentas não são código de aplicação coberto por essas métricas. Migrações, scripts e configurações exigem validação apropriada; não esconda código próprio como “gerado”.

Gere relatórios de terminal, HTML e CI. Cobertura total não prova ausência de bugs nem testa todas as combinações de estados.

Separe `make format`, que modifica, de `make check`, que verifica. Não reescreva código no gate, use watch ou chame hooks recursivamente. Falhas retornam erro; proíba `|| true`, sucesso com suíte vazia e falhas ignoradas.

## 10. Testes isolados e confiáveis

Use PostgreSQL real, não SQLite. Isole banco, credenciais e recursos Docker; recuse alvos de desenvolvimento ou produção. Teste migrações em banco vazio e persistência real. Use healthchecks, não sleeps; limpe só recursos da execução, mesmo após falhas.

E2E inicia API e frontend próprios com dados determinísticos. Não reutilize servidores pessoais. Separe portas e bancos por worktree. Simule o provedor externo, mantendo regras e persistência reais.

Teste sucesso, timeout, resposta inválida, falta de permissão, proposta recusada, reenvio, missão confirmada, pré-requisito pendente, entrega inválida, XP único e cobrança desativada.

Valide um E2E da conversa à ação persistida e atualização visual. Cenários não implementados ficam no roadmap, não nos testes aprovados. Docker parado ou browser ausente causam erro útil, nunca teste ignorado.

## 11. Commits, branches e merges

Instale `pre-commit`, `pre-merge-commit` e `pre-push` pelo pre-commit. Execute o gate sem filtros de arquivos ou branches, com `always_run: true` e `pass_filenames: false` quando apropriado.

Antes de cada commit, valide o conteúdo do índice. Alterações não staged não podem mascarar defeitos. Trate arquivos parcialmente staged e não rastreados; sem validação fiel, bloqueie preservando o trabalho.

No pre-push, valide as revisões enviadas, não só a branch aberta. Rejeite operações não verificáveis. Resultado de outra revisão não aprova o conteúdo atual.

Integre por pull request. Para merge local autorizado, valide o resultado combinado antes de finalizar. `post-merge` não previne falhas; `pre-merge-commit` não cobre fast-forward nem todos os fluxos.

Proíba `--no-verify`, hooks desativados, `SKIP`, testes ignorados e cobertura reduzida. Commits pela interface web não são atalho para contornar verificações locais.

Hooks são contornáveis e não vêm instalados no clone. Instale e verifique em cada clone/worktree, inclusive no PyCharm. Não prometa proteção inviolável contra quem controla o Git.

## 12. CI e proteção remota

Configure GitHub Actions em pushes e pull requests de qualquer branch, sem filtros de caminhos. Inclua execução manual e `merge_group` se usar merge queue.

Use lockfiles, scripts compartilhados e PostgreSQL isolado. Não cancele verificações anteriores. Proíba `continue-on-error` e segredos de produção.

Crie o status `quality-gate`. O agregador exige sucesso explícito de todos os jobs; pulados, cancelados ou ausentes não aprovam. Upload de evidências não converte falha em sucesso.

Exija gate aprovado e base atualizada antes do merge. Proteja todos os destinos de integração, não só `main`, contra push direto e force-push. Proteja novos destinos antes de integrá-los.

Diferencie branches de trabalho e destinos protegidos: não exija PR para cada atualização de uma feature branch. Testes continuam obrigatórios em todas elas.

Verifique plano e permissões. Sem autorização remota, entregue arquivos e passos de ativação como pendência. Documente o primeiro push e confirme nomes dos checks antes de exigi-los.

Use permissões mínimas; não exponha segredos a código não confiável via `pull_request_target`. Revisão de IA não é aprovação humana independente. Actions roda após o push, não impede commits locais.

## 13. Kimi, Codex e Claude

Crie `AGENTS.md` com regras comuns e `CLAUDE.md` referenciando-as pelo mecanismo oficial. Confirme a descoberta de instruções por cada agente; não invente capacidades.

Reaproveite integrações da IDE ou use o terminal. Omita caminhos pessoais. Não exponha MCP/ACP à rede nem desative permissões.

Todos devem ler arquitetura e handoff, preservar alterações, trabalhar em incrementos, escrever testes e executar `make check` antes de propor commit ou merge. Nunca afirmar “testado” sem executar.

Instruções aninhadas não enfraquecem qualidade. Justifique dependências, contratos e infraestrutura; não altere testes para acomodar comportamento errado.

Use um implementador por worktree. Separe branches, diretórios, portas e bancos; revisão não autoriza editar a árvore de outro agente.

Mantenha `docs/HANDOFF.md` com objetivo, revisão-base, decisões, alterações, comandos, resultados e pendências, sem segredos.

## 14. Entrega verificável

Entregue uma fatia pequena: API com liveness e readiness real do banco, migração útil, persistência testada, dashboard e chat ligados a um caso de uso. Com credenciais, Tifa propõe uma missão e a cria após confirmação. Sem elas, teste o contrato e mostre indisponibilidade; não simule tutoria real com dados fixos.

Entregue Dockerfile, Compose e comandos de setup, diagnóstico, execução, migração, formatação, testes e cobertura. Documente arquitetura, sistema visual e PyCharm. Mostre a estrutura final, o que foi reaproveitado no frontend e a justificativa das reorganizações. Confirme que não criou configurações ou dependências duplicadas.

Informe versões, evidências e estados: aprovado, falhou, não executado ou pendente. Demonstre bloqueios por lint, testes e cobertura sem alterar o histórico principal. Confirme hooks e proteções remotas.

Próximo incremento: missão completa, da delegação à recompensa. Não declare a base pronta para produção.

## Builds Docker e arquitetura

Use `make image` para construir e verificar imagens **nativas do daemon Docker ativo**.
O comando ignora uma seleção antiga em `DOCKER_DEFAULT_PLATFORM`; não fixa o projeto em AMD64 ou ARM64.

`make image-release` exporta arquivos em `.docker-artifacts/` com **linux/amd64 e linux/arm64**,
sem carregar uma imagem estrangeira sobre a tag local. `IMAGE_TAG=...` escolhe a tag dos artefatos.

Para builds personalizados, use `scripts/docker-build.sh local -f CAMINHO -t IMAGEM CONTEXTO`.
Para publicar quando autorizado, use `scripts/docker-build.sh publish -f CAMINHO -t REGISTRY/IMAGEM CONTEXTO`;
o comando verifica as duas plataformas no registry. Não substitua estes comandos por um build
AMD64 com `--load` no Mac: para uma entrega offline, use o modo `oci ARQUIVO.tar`.
A verificação isolada é `scripts/docker-build.sh check IMAGEM` (local) ou `published REGISTRY/IMAGEM` (release).
Os Dockerfiles versionados ficam em `docker/`; a configuração privada do Nginx continua lendo `/run/secrets/access.htpasswd` no ambiente de publicação. `make db-up` usa a mesma seleção nativa.

### Publicação automática no GHCR

Cada push na `main` só publica depois dos quatro checks e do `quality-gate` aprovados.
As imagens são `ghcr.io/bipoxdxd/kairyaquest-api` e `ghcr.io/bipoxdxd/kairyaquest-web`,
com `linux/amd64` e `linux/arm64`. A tag `sha-<SHA completo>` identifica o commit;
a referência `@sha256:...` identifica o conteúdo exato. `main` e `latest` só são
promovidas depois de ambas as imagens terem índice e configs nativos conferidos.
O resumo do job registra as referências por digest. Builds de PR não publicam.
Reexecuções de commits antigos não alteram `main`/`latest`: a promoção consulta a
`main` atual antes e depois de verificar as imagens.

A publicação usa o `GITHUB_TOKEN` temporário do Actions, com `packages: write`
restrito aos jobs de publicação. Não é necessário adicionar PAT ou segredo de produção.
A visibilidade padrão dos novos packages é mantida. A conferência pode ser repetida
com `IMAGE_REFERENCE=ghcr.io/bipoxdxd/kairyaquest-api@sha256:... make check-image-platforms`;
para conferir uma tag móvel, informe também `IMAGE_DIGEST=sha256:...` aprovado.
