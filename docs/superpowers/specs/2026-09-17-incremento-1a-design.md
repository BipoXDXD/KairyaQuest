# Incremento 1a — fatia vertical: missões persistidas

Data: 2026-09-17
Especificação de origem: `README.md`, seções 3, 4, 7, 8, 9, 10 e 14
Incremento anterior: 2 (fundação de qualidade)

## Objetivo

Entregar a primeira fatia vertical do FocusQuest: API FastAPI com liveness e
readiness real do banco, PostgreSQL em container, migração Alembic, a entidade
missão persistida e testada, e o Quartel-General listando o que está no banco.

Este incremento traz consigo, por contrato registrado em `docs/QUALITY.md`, os
dois alvos de gate que ainda não existiam: `check-api` e `check-e2e`.

## Contexto

Estado no início:

- 38 commits em `main`, protegida, exigindo o status `quality-gate`.
- Gate completo sobre o frontend: ESLint (com `--max-warnings 0`), Prettier,
  TypeScript estrito, Vitest com cobertura de 100%, Gitleaks.
- Raiz Python gerenciada por uv com `ruff`, `mypy` e `pre-commit` fixados no
  `uv.lock`, **sem uma única linha de código Python de aplicação**.
- Frontend React 19 / Vite 8 / TypeScript estrito em `frontend/`, com `App.tsx`
  e `main.tsx` apenas.
- Uma instalação local de PostgreSQL ocupa a porta 5432 da máquina de
  desenvolvimento. Não é do projeto e não será tocada.

## Decisão de decomposição

O Incremento 1 original — fatia vertical **mais** a tutora Tifa — foi dividido
em dois, por decisão do usuário após a apresentação do custo real:

| | Entrega | Gate que nasce |
|---|---|---|
| **1a** (este) | API, PostgreSQL, Alembic, missão persistida, Quartel-General | `check-api` e `check-e2e`, contra a menor superfície possível |
| **1b** | Tifa, o fluxo de propor e confirmar uma missão, o chat | nenhum novo; estende os existentes |

Motivo: o arnês de teste ponta a ponta — subir API e frontend em portas
próprias, popular banco determinístico, derrubar tudo de forma confiável — é a
parte difícil, e é idêntico independente do que se testa. Construí-lo contra uma
tela que lista missões é depurável. Construí-lo ao mesmo tempo que um chat com
proposta e confirmação seria depurar duas coisas novas sem saber qual quebrou.

Decisões já tomadas e **registradas para 1b**, não usadas aqui: o provedor de IA
será a Anthropic, com `claude-opus-5` como padrão configurável.

## Decisões deste incremento

| # | Decisão | Motivo |
|---|---|---|
| A1 | O projeto é um **pacote**, com backend de build e instalação editável (emendada — ver [Emendas](#emendas)) | **Corrige a decisão D2 do Incremento 2**, que fixou `package = false` justificando que "o backend será executado a partir da árvore". Com layout `src/`, isso torna `import focusquest` impossível sem manipular `sys.path` — e o README §4 proíbe por nome ("sem remendos em `sys.path`"). Instalação editável não é "instalar para distribuir": é como o Python torna o próprio projeto importável em pytest, uvicorn e Alembic ao mesmo tempo. |
| A2 | Usuário único local, **declarado** | README §8 permite explicitamente ("o recorte inicial pode ser local e de usuário único, explicitamente"). Sem login, sem sessão, sem token. Uma linha de usuário criada pela migração. Fica escrito na spec, no código e no `docs/HANDOFF.md` — é recorte, não omissão. Autenticação e autorização por recurso entram antes de existirem contas reais. |
| A3 | Dificuldade é inteiro; prazo é instante com timezone | Decisão do usuário. README §8 exige persistir instantes com timezone e apresentar em `America/Sao_Paulo`. |
| A4 | XP é **derivado** da dificuldade, não persistido | Decisão do usuário. Elimina o estado onde dificuldade e XP discordam. Consequência aceita: mudar a fórmula altera retroativamente o XP de missões antigas — aceitável porque XP de estudo é uma opinião atual sobre o dado, não o registro de um fato financeiro. |
| A5 | O estado `concluida` é **terminal** | README §8 exige "Reenvios não duplicam conclusões nem XP". Com o estado terminal, a garantia vem da estrutura: a segunda tentativa não é uma transição legal. Não depende de código defensivo lembrar de checar. |
| A6 | Estado como `VARCHAR` + `CHECK`, não `ENUM` nativo do PostgreSQL | Os dois rejeitam valor inválido; a garantia é idêntica. O que difere é o custo de evoluir: acrescentar valor a um `ENUM` nativo exige `ALTER TYPE ADD VALUE`, que historicamente não roda dentro de transação e produz migrações Alembic chatas; remover exige recriar o tipo. Este projeto vai ganhar estados (`cancelada`, `atrasada`, `bloqueada` são candidatas do §5 e §8), então o caminho barato de evoluir vence. No Python o tipo continua sendo um `StrEnum`. |
| A7 | O container do PostgreSQL expõe uma porta do host **diferente de 5432** | Já existe um PostgreSQL local nessa porta, que não pertence ao projeto. O README §10 manda isolar recursos e recusar alvos de desenvolvimento alheios. |
| A8 | 1a inclui um endpoint que **muda estado** | Um incremento que só lê não exercita nada do que o §8 mais cobra: validar transições, idempotência, concorrência, XP único. Com concluir missão, há uma transição real para testar. |

## Escopo

**Dentro:** raiz do pacote Python; configuração; conexão e sessão de banco;
módulo `missions` completo (router, schemas, service, domain, models);
liveness e readiness; PostgreSQL em container; migração Alembic; o
Quartel-General listando missões; os alvos `check-api` e `check-e2e` e seus jobs
no CI.

**Fora, explicitamente:** Tifa, provedor de IA, chat, conversas, ações da
tutora, concessão de XP, autenticação, streaming, e as demais entidades do §8
(plano, habilidade, pré-requisito, sessão, entrega, progresso, recompensa), que
ficam documentadas sem tabela. O módulo `tutoring` **não nasce** neste
incremento.

## Estrutura

```text
src/focusquest/
  main.py                 # app FastAPI, wiring e handlers HTTP
  core/
    config.py             # pydantic-settings
    database.py           # engine e sessão
    errors.py             # erros de domínio comuns
  modules/missions/
    router.py             # transporte HTTP
    schemas.py            # contratos de entrada e saída
    service.py            # casos de uso
    domain.py             # regras independentes de framework
    models.py             # mapeamento SQLAlchemy
alembic/
tests/
  unit/                   # domínio, sem banco
  integration/            # com PostgreSQL real
compose.yaml
```

Responsabilidades, conforme o §3: rotas coordenam HTTP, serviços executam casos
de uso, domínio concentra regras, persistência trata o banco. `domain.py` não
importa FastAPI nem SQLAlchemy.

## Modelo de dados

Duas tabelas. Nenhuma outra entidade do §8 é implementada.

**`users`** — linha única criada pela migração. Existe porque missão pertence a
alguém e a chave estrangeira precisa de destino; não porque haja login.

**`missions`**

| Campo | Tipo | Origem |
|---|---|---|
| `id` | chave primária | — |
| `user_id` | FK para `users`, obrigatória | §8 "use chaves estrangeiras" |
| `instructions` | texto | §5 "criar missões com instruções" |
| `completion_criterion` | texto | §5 "critério de conclusão" |
| `difficulty` | inteiro | decisão A3 |
| `estimated_minutes` | inteiro | §8 "separe estimativa, prazo e duração real" |
| `deadline` | instante com timezone | decisão A3 + §8 |
| `state` | texto com `CHECK` | decisão A6 |
| `started_at` | instante com timezone, nulo | a duração real deriva daqui |
| `completed_at` | instante com timezone, nulo | idem |
| `created_at` | instante com timezone | — |

A **duração real** é derivada de `started_at` e `completed_at`, não armazenada —
mesma razão do XP: evita dois campos que podem discordar.

### Estados e transições

```
pendente ──► em_andamento ──► concluida
    └──────────────────────────────┘
```

`concluida` é terminal. Toda transição não desenhada acima é ilegal e produz
erro que **explica o bloqueio** (§8), não um 500 genérico.

### XP

Função pura no `domain.py`, derivando XP da dificuldade:
`20 + 10 · d · (d − 1)`, com as constantes `XP_BASE = 20` e
`XP_INCREMENTO = 10`. A dificuldade 1 vale 20 XP e a 5 vale 220.

O piso impede que a missão fácil — a que destrava o hábito — valha quase nada.
O termo quadrático faz encarar o difícil compensar sem explodir. Uma curva
linear faria das missões fáceis a forma mais eficiente de ganhar XP por hora,
que é o incentivo errado num app de estudos.

A fórmula foi decidida pelo agente, durante uma ausência em que o dono
autorizou todas as decisões, e não pelo dono como esta seção previa (emendada —
ver [Emendas](#emendas)).

## Endpoints

| Método e rota | Papel |
|---|---|
| `GET /health` | Liveness. **Não toca no banco.** Responde enquanto o processo vive. |
| `GET /ready` | Readiness. **Abre conexão e executa uma consulta.** Banco fora do ar produz erro, nunca `ok`. É a "readiness real do banco" do §14. |
| `POST /api/missions` | Cria missão. |
| `GET /api/missions` | Lista as missões do usuário. |
| `POST /api/missions/{id}/complete` | Transiciona para `concluida`. Idempotente por identificador de operação fornecido pelo cliente. |

A distinção entre `/health` e `/ready` é o ponto: um liveness que consulta o
banco derruba o processo quando o banco pisca; um readiness que não consulta
mente sobre estar pronto.

### Idempotência da conclusão

O cliente envia um identificador de operação. O backend o persiste com uma
restrição única. Daí saem dois comportamentos **distintos**, e confundi-los é o
erro comum:

- **Mesmo identificador, reenviado** (a rede caiu, o usuário clicou duas vezes):
  a operação já foi registrada, e a resposta é a **mesma de antes**, com sucesso.
  Reenviar não é erro.
- **Identificador diferente, sobre missão já concluída**: é uma tentativa nova de
  uma transição ilegal, e recebe erro **explicando o bloqueio** (§8).

Sem essa distinção, ou reenviar quebra o cliente, ou concluir duas vezes passa
despercebido. A restrição única no banco é o que torna a primeira metade
verdadeira mesmo sob concorrência.

## Erros

Erros de domínio são tipos próprios. Os comuns moram em `core/errors.py`. O
`TransicaoIlegalError` mora em `modules/missions/domain.py`, junto da máquina de
estados que o produz. Os handlers que os traduzem para HTTP moram em `main.py`,
num lugar só, e não em `core/`. Motivo: o `docs/ARCHITECTURE.md` define o
`core/` como infraestrutura comum a todos os módulos. Um dos handlers traduz o
erro de transição, que pertence ao módulo de missões. Com esse handler dentro do
`core/`, o núcleo passaria a importar um módulo de funcionalidade e deixaria de
ser comum.

Os três erros são **tipos distintos**, mas só dois produzem **respostas**
distintas:

- **Transição ilegal** → 409, com o motivo do bloqueio.
- **Missão inexistente** e **missão de outro usuário** → o **mesmo** 404, com o
  **mesmo** corpo. Uma resposta distinta, seja um 403 ou um 404 com o motivo
  verdadeiro, revelaria a quem está do outro lado da rede que o recurso existe.
  O motivo verdadeiro vai para o log: `INFO` para inexistente, `WARNING` para
  acesso negado.

Nenhum caminho de erro da API de missões retorna 500 por omissão. A exceção
declarada é o `/ready` sem configuração de banco, registrado como pendência no
`docs/HANDOFF.md`. (Esta seção foi emendada — ver [Emendas](#emendas).)

## Testes

**Unitários** — domínio puro, sem banco: transições legais e ilegais, cálculo de
XP, derivação de duração.

**Integração** — PostgreSQL **real**, nunca SQLite (§10). Cobrem: persistência,
restrições, a migração aplicada em **banco vazio**, readiness com banco fora do
ar, e idempotência da conclusão **sob concorrência** — dois pedidos simultâneos não
podem produzir duas conclusões (§8 exige testar concorrência, não só repetição
sequencial). Note que **não há concessão de XP em 1a**: não existe saldo, e o XP
de uma missão é derivado para exibição. A garantia de "XP único" do §8 só ganha
sentido quando existir saldo, no incremento que trouxer recompensa.

**Ponta a ponta** — Playwright com Chromium e axe-core. Sobe API e frontend
próprios, em portas separadas, com dados determinísticos; não reutiliza
servidores pessoais (§10). Um cenário: abrir o Quartel-General e ver as missões
que estão no banco.

**Cobertura:** 100% de linhas e ramificações do código de aplicação Python, nos
mesmos termos que o frontend já cumpre. Os caminhos de erro são a maior parte do
trabalho e não podem ser excluídos do denominador.

## Docker e portas

`compose.yaml` com PostgreSQL de **versão fixada** (nunca `latest`), healthcheck
e volume persistente. O healthcheck é do Compose, não `sleep` (§10). Porta do
host diferente de 5432. Bancos de desenvolvimento e de teste separados.

## Alvos novos do gate

O contrato de `docs/QUALITY.md` obriga este incremento a trazer os dois:

- **`check-api`**: Ruff lint, Ruff `format --check`, mypy estrito, pytest com
  cobertura. Entra no `Makefile` primeiro e só depois ganha job no CI, conforme
  a paridade 1:1 da decisão D5 do incremento anterior.
- **`check-e2e`**: build, Playwright/Chromium, axe-core.

Com `check-api` existindo, a fonte de verdade do contrato deixa de ser
`docs/QUALITY.md` §4 e passa a ser o `Makefile`, como aquele documento já
prevê. A pendência sobre validação do `uv.lock` também vence aqui: `uv sync
--locked` (não `--frozen`, que não valida) entra junto.

## Riscos

| Risco | Mitigação |
|---|---|
| Cobertura de 100% no Python é o maior custo do incremento, concentrado nos caminhos de erro | O plano trata cada caminho de erro como tarefa própria, com o teste antes da implementação |
| O arnês de E2E é infraestrutura nova e falha de formas confusas | É construído contra o menor cenário possível — uma lista — antes de existir chat |
| A porta do PostgreSQL local pode mudar, ou outro serviço ocupar a porta escolhida | A porta do host vem de configuração, com o valor padrão registrado no `.env.example` |
| Testar concorrência é propenso a teste instável | O teste usa barreira explícita em vez de tempo; se não for possível torná-lo determinístico, vira limitação registrada, não teste removido |
| Tornar o projeto um pacote muda o `pyproject.toml` do incremento anterior | A mudança é deliberada e justificada em A1; o `uv.lock` é regenerado e `uv sync --locked` passa a validá-lo |

## Emendas

Esta spec foi escrita antes da implementação. Em quatro pontos, o código se
afastou do texto por um motivo que as revisões aprovaram. Em 2026-09-18 o dono
do projeto delegou a resolução dessas divergências, e elas foram resolvidas
emendando a spec. Nos quatro casos o código ficou como estava, porque a
implementação era a escolha melhor ou a única correta.

| Ponto | O que o texto original dizia | O que vale | Por quê |
|---|---|---|---|
| **A1** | `[tool.uv] package = true` | O projeto é pacote por declarar `[build-system]` com hatchling. O `pyproject.toml` não tem seção `[tool.uv]`: a linha `package = false` da D2 foi **removida**, não trocada. | Com um backend de build declarado, o uv já trata o projeto como pacote. Escrever `package = true` seria redundante. A instalação editável está no `.venv` (`_editable_impl_focusquest.pth`, apontando para `src`). |
| **XP** | A fórmula seria escrita pelo dono | `20 + 10 · d · (d − 1)`, decidida pelo agente | O dono estava ausente e tinha autorizado todas as decisões. As duas constantes têm nome e mudam em uma linha. Como o XP é derivado (A4), mudar a curva recalcula as missões antigas. |
| **Erros: respostas** | Missão inexistente e missão de outro usuário teriam respostas distintas | O **mesmo** 404, com o mesmo corpo; a distinção vai para o log | Uma resposta distinta revelaria que um recurso alheio existe. |
| **Erros: lugar dos handlers** | Handlers HTTP em `core/errors.py` | Handlers em `main.py`; tipos comuns em `core/errors.py`; `TransicaoIlegalError` em `domain.py` | O `core/` é infraestrutura comum a todos os módulos. Um dos handlers traduz um erro do módulo de missões, e colocá-lo no `core/` faria o núcleo importar esse módulo. |
