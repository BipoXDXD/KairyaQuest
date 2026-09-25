# HANDOFF

Estado corrente para qualquer agente (Kimi, Codex, Claude) que assumir o trabalho.
Sem credenciais, sem caminhos pessoais.

## Objetivo

FocusQuest: plataforma de estudos gamificada com Tifa Lockhart como tutora
interativa. Especificação completa em `README.md`. Entrega por incrementos.

## Revisão-base

**Incremento C — a campanha.** Branch de integração `feat/incremento-c`,
com dois worktrees de trabalho em paralelo, sem banco: `feat/incremento-c-nav`
(Tasks 0 e 1) e `feat/incremento-c-trilha` (Tasks 2 e 3). Base: `9c2bd1e`
(a ponta de `feat/incremento-b`, PR #13 aprovado pelo `quality-gate` e ainda
não mesclado — Ruling R1 do controlador, 2026-09-25: o merge do PR #13 ficou
para o dono, e o C parte da ponta do B em vez de esperar `origin/main`).
Spec em `docs/superpowers/specs/2026-09-18-ciclo-diario-design.md`; plano em
`docs/superpowers/plans/2026-09-25-incremento-c.md`. A branch soma, até
este registro (fechamento da Task 7, antes deste commit), **9 commits**
(Tasks 0–6 e o fix round 1 da Task 5, contados com
`git log --oneline 9c2bd1e..HEAD | wc -l`, medido nesta sessão) — mais este
commit de documentação, **10** no total. A base `9c2bd1e` já é a ponta do
Incremento B, também ainda não publicada (ver o parágrafo abaixo); os
commits do B **não** entram nesta contagem porque ainda não são ancestrais
da `main`. **Estado de publicação: não publicado.** Push, PR e merge
exigem autorização do dono, e o merge do C só pode acontecer **depois** do
merge do B (Ruling R1).

**Incremento B — o ciclo diário.** Branch `feat/incremento-b`, aberta a
partir de `12288a2` (a `main`: o merge do PR #12, a camada 3 do 1b-2). Spec
em `docs/superpowers/specs/2026-09-18-ciclo-diario-design.md`; plano em
`docs/superpowers/plans/2026-09-25-incremento-b.md`. **Primeira sessão no
Linux** (x86_64): o repositório chegou como arquivo ZIP, sem `.git`; o
histórico foi religado por um clone sem checkout do remoto, e a árvore
conferiu idêntica a `12288a2` (`git status` limpo). Hooks instalados por
`uv run pre-commit install --install-hooks`; `make check` na base, sem
mudança nenhuma: aprovado, EXIT 0 (ver "Resultados"). A branch soma, até
este registro (fechamento final, depois da revisão da branch), **16
commits** (Tasks 0–9, a documentação da Task 10 e o conserto final em dois
commits — backend/E2E e frontend —, contados com
`git log --oneline 12288a2..HEAD | wc -l`, medido nesta sessão) — mais este
commit de documentação, **17** no total. **Estado de publicação: não
publicado.** Push, PR e merge autorizados pelo dono em 2026-09-25 para este
incremento.

**Incremento 1b-2 — a tela da Tifa, o E2E e a chamada real.** Branch
`feat/incremento-1b-2`, aberta a partir de `a795ee7` (a `main`: o merge do
PR #10, o 1b-1). Spec em
`docs/superpowers/specs/2026-09-18-incremento-1b-design.md` (seções "A tela
(1b-2)", "E2E", "A chamada real" e a camada 3 do servidor falso); plano em
`docs/superpowers/plans/2026-09-22-incremento-1b-2.md`. A branch soma, até
este registro (Task 9), **10 commits** contados com
`git log --oneline a795ee7..HEAD | wc -l`, medido nesta sessão — mais este
commit de documentação. **Estado de publicação: não publicado.** Push, PR e
merge exigem autorização do dono, um passo de cada vez; quando mesclado,
esta linha passa ao padrão "publicado pelo PR #N, mesclado por `<forma>`;
estado atual em `gh pr view N`".

**Incremento A — conclusão na tela.** Branch `feat/incremento-a`, aberta a
partir de `49c17ac`, **empilhada sobre `docs/spec-ciclo-diario`** — o PR #6
(spec e plano) ainda não estava mesclado à `main` quando esta branch foi
aberta; quando ele for mesclado, a base passa a ser a `main`. Spec em
`docs/superpowers/specs/2026-09-18-ciclo-diario-design.md` (seção B2,
decisões C12 e C13); plano em
`docs/superpowers/plans/2026-09-18-incremento-a.md`. Relógio injetável,
`code` nos erros de domínio e o botão Concluir para as missões avulsas.
Fecha as pendências 1 e 7. **Estado de publicação: publicado pelo PR #8**,
mesclado por **merge commit** com autorização do dono, para preservar os SHAs
citados abaixo; estado atual em `gh pr view 8`.
**Integração da `main`:** o PR #6 foi mesclado à `main` em `4a9a2a4` (merge
commit, `gh pr view 6`), e o PR #5 (`fix/sessao-em-utc`, sessão do
PostgreSQL em UTC) entrou na `main` por rebase, em `2440515` e `c08c2a1`.
A `origin/main` (`4a9a2a4`) foi integrada nesta branch por **merge**
(`b6f8c9d`), e não por rebase, para que os SHAs dos commits do Incremento A
citados abaixo continuem válidos; desde então a base desta branch é a
`main`. O merge não teve conflito de texto. O texto abaixo, até
"Incrementos anteriores", é o registro histórico do Incremento 1a — vale
como aconteceu, mas seu estado de publicação, descrito logo a seguir, foi
superado pelo merge do PR #4.
**Segunda integração da `main`:** o PR #7 (cache do Gitleaks no CI) entrou
na `main` por rebase, de `eeae001` a `c2d0bf2`, e a `origin/main`
(`c2d0bf2`) foi integrada nesta branch de novo por **merge**. Desta vez houve
conflito de texto, só no `docs/HANDOFF.md`: as duas branches acrescentaram
uma seção no mesmo ponto e pendências no fim da lista. As duas versões foram
mantidas, a 39 depois da 38.

**Incremento 1a — fatia vertical: missões persistidas.** Branch
`feat/incremento-1a`, aberta a partir de `a869292` (a `main` naquele
momento). A implementação vai de `1ff982d` a `96eaeba` — 23 commits,
contados com `git log a869292..96eaeba` —, e este documento é atualizado no
commit que a registra, logo depois deles. Spec em
`docs/superpowers/specs/2026-09-17-incremento-1a-design.md`; plano em
`docs/superpowers/plans/2026-09-17-incremento-1a.md`.

**Estado de publicação: mesclada pelo PR #4.** A branch `feat/incremento-1a`
foi empurrada, o PR #4 foi aberto e mesclado à `main` por merge commit
(`e3ef7bf`, `git log main -1`), e os quatro jobs do CI — `check-api`,
`check-e2e`, `check-secrets` e `check-web`, mais o `quality-gate` — rodaram e
passaram nesse PR (`gh pr checks 4`). Publicar exigiu autorização do
responsável pelo projeto (README §1, `AGENTS.md` §2), já dada para este
incremento.

O Incremento 1 original (fatia vertical **mais** a tutora) foi dividido em
dois, por decisão do usuário: **1a** (este) entrega API, PostgreSQL, Alembic,
missão persistida e o Quartel-General, e traz os alvos `check-api` e
`check-e2e`; **1b** traz a Tifa, o fluxo de propor e confirmar uma missão e o
chat (ver "Próximo incremento").

**Incremento 1b-1 — o backend da Tifa.** Branch `feat/incremento-1b-1`,
aberta a partir de `c7a91a5` (a `main` naquele momento, com a spec do 1b já
mesclada). A branch vai de `023d251` a `9fb9a8e` — **15 commits**, contados
com `git log c7a91a5..9fb9a8e`: o plano (`023d251`), sete commits de
feature/teste das Tasks 1 a 7, cinco commits de correção de revisão
(`1542a78`, `acfbb46`, `e208a7b`, `696a51d`, `880dd60`), a documentação da
Task 8 (`130958c`) e a onda final de correção da revisão da branch
(`9fb9a8e`). Spec em
`docs/superpowers/specs/2026-09-18-incremento-1b-design.md`, com a seção
"Emendas (2026-09-19, execução do 1b-1)"; plano em
`docs/superpowers/plans/2026-09-19-incremento-1b-1.md`.

**Estado de publicação: publicado pelo PR #10, mesclado por merge commit em
`a795ee7`; estado atual em `gh pr view 10`.** (Registro anterior, corrigido
no 1b-2: este parágrafo dizia "não publicado" e contava 13 commits até
`880dd60`; os dois últimos commits da branch não tinham entrado na conta.)

O 1b-1 é só o backend: a tela, o E2E, a camada 3 do servidor falso (a
referência de uma chamada real) e a chamada real em si são do **1b-2**, que
começou em `a795ee7` (ver abaixo).

## Decisões tomadas

### Incremento 1a — decisões A1 a A8 (da spec)

Transcritas da tabela "Decisões deste incremento" da spec; o texto completo,
com o motivo por extenso, está lá.

| # | Decisão | Motivo |
|---|---|---|
| A1 | `[tool.uv] package = true`, com backend de build e instalação editável | **Corrige a decisão D2 do Incremento 2**, que fixou `package = false`. Com layout `src/`, aquilo tornava `import focusquest` impossível sem manipular `sys.path`, que o README §4 proíbe por nome. Instalação editável é como o Python torna o próprio projeto importável em pytest, uvicorn e Alembic ao mesmo tempo. |
| A2 | Usuário único local, **declarado** | O README §8 permite explicitamente o recorte local e de usuário único. Sem login, sem sessão, sem token; uma linha de usuário criada pela migração. É recorte, não omissão: autenticação e autorização por recurso entram antes de existirem contas reais. |
| A3 | Dificuldade é inteiro; prazo é instante com timezone | Decisão do usuário. O README §8 exige persistir instantes com timezone e apresentar em `America/Sao_Paulo`. |
| A4 | XP é **derivado** da dificuldade, não persistido | Decisão do usuário. Elimina o estado em que dificuldade e XP discordam. Consequência aceita: mudar a fórmula altera retroativamente o XP de missões antigas. |
| A5 | O estado `concluida` é **terminal** | "Reenvios não duplicam conclusões nem XP" (README §8) passa a vir da estrutura: a segunda tentativa não é uma transição legal. |
| A6 | Estado como `VARCHAR` + `CHECK`, não `ENUM` nativo do PostgreSQL | A garantia é idêntica; o custo de evoluir, não. Acrescentar valor a um `ENUM` nativo exige `ALTER TYPE ADD VALUE`, e o projeto vai ganhar estados. No Python o tipo continua `StrEnum`. |
| A7 | O PostgreSQL do container expõe uma porta do host **diferente de 5432** | Já existe na máquina de desenvolvimento um PostgreSQL local nessa porta, que não pertence ao projeto (README §10). A porta escolhida é 55432, configurável por `FOCUSQUEST_DB_PORT`. |
| A8 | 1a inclui um endpoint que **muda estado** (concluir missão) | Um incremento só de leitura não exercitaria nada do que o README §8 mais cobra: transições, idempotência, concorrência. |

> **Nota de implementação da A1 — como foi cumprida.** O texto acima é
> transcrição fiel da spec e não foi reescrito. No código, **não existe seção
> `[tool.uv]`** no `pyproject.toml`, e quem procurar a chave `package = true`
> não a encontrará: o pacote é importável porque o `pyproject.toml` declara
> `[build-system]` com `hatchling`, e nesse caso o uv trata o projeto como
> pacote por padrão e o instala em modo editável. A linha `package = false`
> da D2 foi **removida**, não trocada por `package = true` (commit `1ff982d`).
> O efeito é o que a A1 pede; a forma é outra.

### Incremento 1a — decisões tomadas durante a execução

Cada uma está no código, com o motivo no comentário do arquivo citado.

| Decisão | Motivo |
|---|---|
| Fórmula de XP: `20 + 10 * d * (d - 1)` (`XP_BASE` e `XP_INCREMENTO` em `domain.py`) | O piso impede que a missão fácil valha quase nada; o termo quadrático faz o difícil compensar sem explodir (dificuldade 1 vale 20, dificuldade 5 vale 220). Uma curva linear faria das missões fáceis a forma mais eficiente de ganhar XP por hora. Quem decidiu foi o agente, numa ausência em que o dono autorizou todas as decisões. A spec reservava essa decisão ao dono; em 2026-09-18 ele delegou a resolução da divergência, e a spec foi emendada (seção "Emendas"). |
| Teto de dificuldade `DIFICULDADE_MAXIMA = 5`, no schema e não no domínio | A curva de XP foi calibrada nessa faixa, e cinco é a granularidade que uma pessoa consegue julgar. O domínio responde quanto vale uma dificuldade; a borda responde qual aceita receber. |
| `deadline` exige fuso na entrada (422 para datetime sem fuso) | Aceitar datetime sem fuso fazia o mesmo prazo sair em duas serializações diferentes (sem `Z` no 201, com `Z` no GET), que o JavaScript lê como dois instantes. Normalizar em silêncio seria adivinhar o fuso do cliente. |
| Missão inexistente e missão de outro usuário respondem o **mesmo** 404, com o mesmo corpo | A spec previa respostas distintas e foi emendada em 2026-09-18 (seção "Emendas"): responder 403, ou um 404 com o motivo verdadeiro, revelaria que o recurso existe. A distinção vai para o log (`INFO` para inexistente, `WARNING` para acesso negado). |
| Um `operation_id` fica vinculado à primeira operação em que foi usado; reusá-lo em outra missão ou outro tipo de operação é 409 (`OperacaoReutilizadaError`), e não sucesso | Aceitar qualquer reuso como "já feito" faria concluir a missão B com a chave da missão A devolver a missão A como sucesso, com a B ainda pendente. |
| O `commit` é feito pela rota, não pela dependência de sessão | Um commit depois do `yield` rodaria com a resposta já montada, e uma falha nele não teria como mudar o status. |
| Corpo de erro `{"detail": ...}` com chave em inglês e prosa em pt-BR | A chave é contrato de payload e é a mesma que o FastAPI usa no 422; o texto é interface. |
| Valores do estado da missão em português (`pendente`, `em_andamento`, `concluida`) | A regra de idioma do README §3 enumera nomes de coluna, chaves de payload JSON e rotas; valor de enum não é nenhum dos três. |
| `Settings` sem `extra="ignore"` (o padrão do pydantic-settings, que recusa chave desconhecida) | Engolir configuração desconhecida faria um erro de digitação no `.env` aparecer como "variável obrigatória ausente", no lugar errado. |
| Frontend fala com a API por **proxy do Vite** (`/api`), sem `CORSMiddleware` | CORS introduziria superfície de segurança para um problema que só existe em desenvolvimento. O alvo do proxy vem de `API_PROXY_TARGET`, com a 8000 só como padrão, para o E2E apontar para a sua API dedicada. |
| O cliente HTTP do frontend lança no carregamento se `VITE_API_URL` faltar | Um padrão silencioso faria "esqueci de configurar" aparecer como "o servidor está fora" — dois problemas com ações opostas. |
| O E2E divide o banco `focusquest_test` com a suíte pytest, em vez de ter banco próprio | Um terceiro banco exigiria campo novo em `Settings`, um terceiro modo no `alembic/env.py` (o arquivo que carrega a guarda do comando destrutivo) e uma variável a mais no CI. Duas exigências estruturais tornam o compartilhamento seguro: o cenário semeia pela API, por HTTP, e afirma só sobre as linhas que ele mesmo criou. |
| E2E contra o `vite preview` do build de produção, não contra o servidor de desenvolvimento | O cenário visita o mesmo artefato que iria para o ar, e o build deixa de ser decoração. |
| Coleta do Vitest por **negação** (`exclude`), não por permissão (`include`) | Medido: com `include` estreito, um teste que reprovava fora de `src/` não era coletado e o gate aprovava. `docs/QUALITY.md` §3. |
| `uv lock --check` como primeira receita do `check-api`; **nenhum** equivalente npm no `check-web` | Cumpre a validação do lockfile Python que o `docs/QUALITY.md` prometia. Do lado npm não existe comando barato e confiável que compare sem instalar; a assimetria está declarada no `docs/QUALITY.md` §4. |
| O `pre-push` passa ao worktree as variáveis `FOCUSQUEST_*` do `.env`, por lista de permissão, nunca `source`, e recusa o push se faltarem | Sem isso, todo push seria recusado com `ValidationError`; degradar para "pular o `check-api`" seria gate cego. `docs/QUALITY.md` §6. |
| Tetos **técnicos** na entrada: `estimated_minutes` e `mission_id` até `MAIOR_INTEIRO_DA_COLUNA = 2**31 - 1` (int4), `mission_id` a partir de 1, e `deadline` recusado se, convertido para UTC, sair da faixa do `datetime` do Python | Sem eles, entrada fora da faixa do armazenamento respondia 500 — e um prazo extremo deixava o `GET /api/missions` em 500 para sempre. São tetos do armazenamento, **não** de negócio: estes ficam para o dono (pendência 26). |
| A sessão do PostgreSQL é fixada em UTC por um `SET TIME ZONE 'UTC'` em toda conexão nova, registrado em `create_engine_from_url` — a fábrica por onde nascem as engines da aplicação, da suíte e do Alembic (correção pós-merge, branch `fix/sessao-em-utc`) | O `timestamptz` volta no fuso da sessão, e fora de UTC a leitura de um prazo aceito perto das bordas quebrava a listagem (pendência 27). É `SET`, e não `options=-c timezone=UTC`: a variável `PGTZ` do ambiente vence as `options` (medido), e o `SET` roda depois de tudo. O `autocommit` fica ligado durante o `SET` porque, dentro da transação implícita, o rollback do pool o desfazia (medido). |
| O prazo é **apresentado** em `America/Sao_Paulo` (`timeZone` fixo no `Intl.DateTimeFormat`), e os testes rodam com o fuso do processo fixado em `Asia/Tokyo` (`test.env.TZ` no `vite.config.ts`, `timezoneId` no Playwright) | O README §8 e a A3 mandam apresentar em São Paulo. O fuso dos testes é fixado **fora** de São Paulo porque a máquina do dono está em São Paulo: lá, um teste sem essa fixação passaria com o defeito (medido). |
| A guarda de `.env` do `pre-push` mora em `scripts/push-env.sh`, carregada pelo `check-push.sh` | Extraída para ser testada (`tests/integration/test_push_env.py`) sem disparar push nem criar worktree; o `check-push.sh` chama a mesma função, e um teste roda uma cópia dele para provar que chama. |
| `timeout-minutes` em todos os jobs do CI | O padrão do runner é seis horas; um job travado deixaria o pull request sem veredito nesse tempo. |

### Incremento A — decisões que a spec não fixava

O motivo de cada uma está também no código citado.

| Decisão | Motivo |
|---|---|
| `get_clock` (`core/clock.py`) entrega o **relógio** (`Clock = Callable[[], datetime]`), e não o instante | Um instante resolvido pelo FastAPI seria lido antes da trava; o serviço lê o relógio depois do `FOR UPDATE` (C13). |
| `concluir_missao(..., *, clock: Clock)` obrigatório e somente-nomeado | Nenhum chamador esquece o relógio em silêncio: o mypy e o `TypeError` recusam. |
| O `created_at` das tabelas continua vindo do `now()` do banco | É auditoria, e não regra; a C13 fala do serviço. |
| O `code` mora em `main.py` (`CodigoDeErro`), com `codigo` obrigatório em `_erro` | É tradução para HTTP. Posto na exceção, `NaoPertenceAoUsuarioError` carregaria `missao_nao_encontrada`, falso no domínio. |
| O cliente HTTP não lê o `detail`; `ApiError.code` é `string \| null` | Garantia estrutural de que o `detail` não chega à tela; quem consome estreita o `code` com `Object.hasOwn`. |
| Um mapa exaustivo `code → { message, recovery }` (`completionFailure.ts`) | Mensagem e ação mudam juntas; um `code` novo reprova o `tsc` até ganhar as duas. |
| O `operation_id` nasce no primeiro clique e só troca depois de `operacao_reutilizada` | Uma chave nova por clique transformaria o reenvio numa conclusão nova (409). |
| As chaves moram num registro **por missão** no `MissionList` (`useCompletionRegistry`), e não num `useRef` do cartão (Task 6) | O reload remonta os cartões; a chave de uma tentativa com resultado desconhecido morria ali (pendência 35). A chave sai do registro no sucesso, em `transicao_ilegal` e em `missao_nao_encontrada`, para o registro não crescer sem limite. |
| "Atualizar o quadro" com conclusão em voo **espera**, e recarrega uma vez quando a última termina (Task 6) | Pedido do dono. Sem a espera, o reload remontaria o cartão no meio do POST. A espera sozinha não bastaria: depois de uma falha de rede nada está em voo, e o reload remontaria o cartão do mesmo jeito — por isso as duas peças. |
| O erro de carregamento da lista mostra a `message` do `ApiError` (`O servidor respondeu 503.`) | A leitura da lista não tem erro de domínio com `code`; o texto é do cliente, e não do backend. |

### Incremento 1b-1 — decisões que a spec não fixava

Transcritas da tabela "Decisões que a spec não fixava" do plano
(`docs/superpowers/plans/2026-09-19-incremento-1b-1.md`); o motivo de cada
uma está também no comentário do arquivo citado.

| Decisão | Motivo |
|---|---|
| `env_ignore_empty=True` no `Settings` | O `.env.example` traz `FOCUSQUEST_ANTHROPIC_API_KEY=` vazio. Sem a opção, a chave vazia viraria `SecretStr("")` — "configurada" —, e a tela diria que a Tifa está disponível para, na primeira mensagem, receber 401. De quebra, uma URL de banco vazia passa a falhar como ausente, que é a verdade. |
| **Exceção deliberada à docstring do `Settings`**: a chave da Anthropic é opcional, ao contrário de toda outra credencial | O README §6 manda mostrar indisponibilidade sem credencial: a ausência da chave é um **estado do produto**, não uma configuração esquecida. As URLs de banco continuam obrigatórias, sem exceção. A docstring do `Settings` registra a exceção e o motivo, em vez de o código divergir do texto em silêncio. |
| `created_at` das mensagens da tutoria vem do **relógio injetável**, e não do `now()` do banco | Aqui ele não é só auditoria: é entrada da regra do órfão. Misturar o `now()` do banco com o relógio dos testes faria a regra comparar dois relógios. |
| Pergunta limitada a `TAMANHO_MAXIMO_DA_PERGUNTA = 4000` caracteres | Teto **técnico** de custo (cada caractere vai ao modelo, e volta nos 20 turnos seguintes). O número é provisório e fica como pendência do dono, como a 26. |
| `tutor_actions.mission_id` **sem** `ondelete` (o padrão, `NO ACTION`) | `SET NULL` violaria o `CHECK` de `executada`, e `CASCADE` apagaria o histórico da conversa junto com a missão. Não existe exclusão de missão no produto; se vier, decide o que fazer com a ação. |
| `TransicaoIlegalError` do `missions.domain` é reusado pelas ações | O `code` e o sentido são os mesmos do A (spec, tabela "Confirmar e recusar"), e `tutoring` já depende de `missions`. A dependência nunca vai no sentido contrário (`docs/ARCHITECTURE.md` §3). |
| O prazo expirado é **gravado** e só depois vira 422 | O serviço devolve o resultado, a rota commita e só então levanta `PrazoExpiradoError`. Levantar dentro do serviço desfaria a gravação do `falhou` junto com a transação. |
| Uma dependência só para a tutoria, `get_tutoria() -> Tutoria \| None` | Agrupa o provedor e os dois números que o serviço usa (histórico e limite). Os testes trocam uma coisa só, e `None` é "sem chave". |
| O histórico funde mensagens seguidas do mesmo papel | Uma pergunta cuja resposta falhou deixa duas perguntas seguidas. A fusão mantém a alternância usuário/assistente sem depender de a API tolerar papéis repetidos. |
| Os códigos do stream (`provedor_indisponivel`, `tempo_esgotado`, `proposta_invalida`) moram em `tutoring/domain.py`, e não no `CodigoDeErro` | O `CodigoDeErro` tem só os códigos que algum handler HTTP devolve. Os do stream não passam por handler: viajam no evento `error` e na coluna `error_code`, dentro de um 200 já aberto. |
| O servidor falso mora em `tests/integration/provedor_falso.py`, com as fixtures no `conftest.py` | Nenhum módulo de teste importa outro (dependência de ordem entre arquivos); o `conftest` é o ponto de encontro que o pytest já oferece. Detalhe em `docs/QUALITY.md` §9. |

### Incremento 1b-1 — decisões tomadas durante a execução

Três divergências entre o pseudocódigo do plano/spec e o que a execução
exigiu; o texto completo, com a evidência de teste e de mutação, está na
seção "Emendas" da spec (`docs/superpowers/specs/2026-09-18-incremento-1b-design.md`).

| Decisão | Motivo |
|---|---|
| Em `confirmar_acao`, `state`, `mission_id`/`error_code`, `operation_id` e `decided_at` são gravados **juntos**, um flush por ramo — nunca `operation_id`/`decided_at` antes do `try` | O pseudocódigo original do plano (Task 6) violava `ck_tutor_actions_decisao_datada` no flush interno de `criar_missao`, descoberto por 9 dos 18 testes reprovando na primeira rodada. |
| `ck_tutor_messages_forma` é um `CASE role WHEN 'user' THEN ... WHEN 'tutor' THEN ... ELSE true END`, não o `OR` que a spec descrevia | Com o `OR`, um `role` inválido violava `forma` e `role` ao mesmo tempo, e o Postgres relata só uma (ordem alfabética do nome da restrição): `ck_tutor_messages_role` ficava impossível de isolar num `INSERT` de teste. Semanticamente equivalente para `role` válido, porque `ck_tutor_messages_role` já bloqueia qualquer outro valor. |
| A trava `with_for_update=True` de `_buscar_acao` é provada por `test_confirmar_e_recusar_em_paralelo_uma_decisao_vence` (caminho recusar) e por `test_dois_confirmar_com_chaves_diferentes_um_vence` (caminho confirmar), não pelo teste "mecanismo" isolado | Em `confirmar_acao`, o próprio `UPDATE` final grava `operation_id` (índice único) e o Postgres escala esse `UPDATE` para uma trava `FOR UPDATE` sozinho, com ou sem a trava do `SELECT` — o que mascara a mutação no teste `test_confirmar_trava_a_linha_da_acao`. Em `rejeitar_acao` isso não acontece, e a trava de `_buscar_acao` é a única coisa que serializa a decisão. |

**Trailer `Co-Authored-By` dos commits deste branch.** Os commits do 1b-1
terminam em `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, não em
`Claude Opus 5 (1M context)` como `constraints.md` especificava. A divergência
foi mantida de propósito na revisão final de branch: o controlador decidiu
que a atribuição verdadeira — o modelo que de fato escreveu o commit — vale
mais que a uniformidade com o texto planejado, e o histórico não foi
reescrito. Registrado aqui porque `AGENTS.md` §4 exige que fatos do
incremento fiquem no HANDOFF, mesmo quando a decisão é não mudar nada.

### Dependências e infraestrutura que entraram no 1b-1

O `AGENTS.md` §4 exige motivo escrito para cada biblioteca, endpoint e
serviço.

- **`anthropic==1.7.0`** — o SDK oficial da Anthropic (README §6: "SDK
  oficial ou HTTPX"). O adaptador (`tutoring/anthropic_provider.py`) é a
  única peça que o importa; os tipos do stream dele (`RawMessageStartEvent`
  e os demais) são a base sobre a qual o servidor falso é construído
  (`docs/QUALITY.md` §9, camada 1).
- **`httpx2==2.13.0`** — o transporte HTTP do próprio SDK `anthropic`, não
  escolhido pelo projeto. Entrou como dependência **direta** (não só
  transitiva) porque uma demora no meio do stream (medição M4 da spec)
  surge como `httpx2.ReadTimeout` **cru** — uma exceção que não herda de
  `TimeoutError` nem é reexportada pelo SDK —, e o adaptador precisa
  importar o tipo para capturá-la.
- **`anyio==4.15.1`** — a biblioteca de concorrência estruturada que o
  Starlette já usa por baixo. Entrou como dependência direta porque o
  invólucro `fechando_ao_cancelar` (`tutoring/sse.py`) usa
  `anyio.to_thread.run_sync` e um `CancelScope(shield=True)` para fechar o
  gerador síncrono de forma imediata e protegida do cancelamento em curso —
  a peça central da correção da medição M1 (ver "Emendas" da spec).
- **Endpoints:** as cinco rotas de `/api/tutoring` — ver "O modelo de dados
  e o contrato HTTP da tutoria que existem" em `docs/ARCHITECTURE.md` §3.
- **Nenhum serviço de infraestrutura novo.** A tutoria usa o mesmo
  PostgreSQL do `missions` (migração `0002`, mesmo banco); não há Redis,
  fila nem serviço externo além da própria API da Anthropic (chamada real
  só no 1b-2).

### Incremento 1b-2 — decisões que a spec não fixava

Transcritas da tabela "Decisões que a spec não fixava" do plano
(`docs/superpowers/plans/2026-09-22-incremento-1b-2.md`), à medida que as
tarefas as põem em código.

| Decisão | Motivo |
|---|---|
| `postStream` aceita `AbortSignal`, ao contrário do `postJson` (Task 1) | Abortar o stream é o que acontece quando o painel desmonta (troca de tela no futuro, fechamento da aba); para o servidor, é a desconexão que o 1b-1 grava como `interrompida`, e o reenvio é seguro. O argumento do `postJson` ("cancelar não desfaz a mudança") não se aplica: aqui o cancelamento é parte do contrato. |
| Um quadro SSE malformado (sem `event:`/`data:` ou `data` que não é JSON) **reprova** o stream; um evento de nome desconhecido é **ignorado** pelo hook (Task 1) | O quadro malformado é defeito de protocolo, e continuar lendo depois dele seria adivinhar. O nome desconhecido é compatibilidade para frente (um backend mais novo pode acrescentar evento), e o final continua decidido só por `done`/`error`, então ignorar não esconde resultado: sem final, é `unknown`. Linhas que não são `event` nem `data` (comentário, `id:`) **dentro** de um quadro que tem as duas são ignoradas; um quadro só de comentário reprova. |
| Porta **8150** para o servidor falso do E2E (Task 6) | Fica na faixa 81xx, a mesma da API do E2E (8100), o que a identifica como porta de teste ponta a ponta à primeira vista; não colide com 8000/5173 (desenvolvimento), 8100/5273 (E2E) nem 55432 (PostgreSQL); e não é 8101, que seria o "próximo número" que alguém escolheria por reflexo para outro servidor e confundiria com a API. Não é porta de nenhuma ferramenta comum da máquina de desenvolvimento (8080, 8081, 8443, 8888). Fonte única: `frontend/tests/e2e/servers.ts` (`FALSO_URL`). |
| A guarda do E2E é uma **lista de permissão** (host do `anthropic_base_url` em `127.0.0.1`, `localhost` ou `::1`), e não uma recusa de `api.anthropic.com` (Task 6) | Recusar só o host da Anthropic falha **aberto**: um `https://api.anthropic.com.` com ponto final, um IP da Anthropic ou um proxy qualquer passariam. Exigir loopback falha **fechado**: o que não é a máquina local não sobe. O host é lido por `urlsplit(...).hostname`, o que desarma `http://127.0.0.1@api.anthropic.com` (o host é o que vem depois do `@`). A mensagem de recusa mostra só o host, nunca o endereço inteiro (uma URL com credencial iria para o log). |
| O `scripts/e2e-env.sh` **impõe** a chave fictícia (`FOCUSQUEST_ANTHROPIC_API_KEY=e2e-chave-ficticia`), e o URL do falso vem do Playwright (`env` do `webServer` da API) (Task 6) | A chave real mora no Keychain do macOS, nunca no `.env` (D-a, emenda E1). A guarda existe contra o erro: uma chave posta por engano no ambiente do shell ou no `.env` chegaria ao E2E, também pelo `pre-push`, que exporta toda `FOCUSQUEST_*` do `.env` para o worktree (`docs/QUALITY.md` §6) — e impor no script que já é o único caminho de subida da API do E2E fecha os três caminhos. O valor não começa com `sk-ant-`: não imita uma chave real. O URL, ao contrário, **não** é escrito no script: a porta mora em `servers.ts`, que o cenário também lê; o script só **valida** o que recebeu. |
| O controle do falso usa rotas sob `/_control/` e chaves JSON em inglês (Task 6) | É um contrato HTTP entre o cenário TypeScript e o falso Python, e contrato de payload é em inglês (README §3). O prefixo não colide com `/v1/messages`, a única rota que o SDK usa; qualquer outra rota em `GET`, `PUT` ou `POST` responde 404, para um SDK mal apontado reprovar alto. Outro método (`DELETE`, `PATCH`…) recebe o 501 do `http.server` ("método não implementado"), que também é alto — responder 404 a **todo** método exigiria interceptar o despacho do `BaseHTTPRequestHandler`, código a mais sem ganho para o cenário (correção da revisão da Task 6, provado por `test_metodo_sem_tratador_responde_501`). O roteiro é validado estritamente (chave desconhecida é `400`), para um erro de digitação no cenário não virar um roteiro que passa pelo motivo errado. |
| O falso do E2E ganha **segurar e liberar** pelo controle (`hold_after_events` + `POST /_control/release`) (Task 6) | É o único jeito determinístico de o axe auditar o estado "escrevendo" com a resposta comprovadamente no meio. O `Roteiro.segurar_apos_eventos` e o `liberar` já existiam no falso (1b-1, desconexão); o controle só os expõe. O `POST /_control/reset` solta uma resposta presa antes de trocar o `Event`, para um cenário que reprovou no meio não prender o seguinte. |
| O limite de 4000 caracteres é contado em **pontos de código do texto sem espaços nas pontas** (`Array.from(text.trim()).length`), e não em `text.length` (Task 3) | O backend conta com `len()` do Python depois do `strip_whitespace` (`MessageCreate.content`): pontos de código, não unidades UTF-16. Com `text.length`, um emoji contaria 2 no navegador e 1 no servidor, e a tela recusaria perguntas que o servidor aceita. `MAX_QUESTION_LENGTH` (`features/tutoring/questionLimit.ts`) espelha `TAMANHO_MAXIMO_DA_PERGUNTA` à mão (pendências 32 e 41). |
| O contador de restantes aparece a partir de **3600** caracteres, 90% do limite (Task 3) | "Perto do limite" precisava de um número. 90% dá 400 caracteres de aviso — umas cinco linhas — sem poluir a tela na pergunta comum. `COUNTER_VISIBLE_FROM` é derivada do limite, não escrita por extenso. |
| O `client_message_id` de um reenvio é o da pergunta pendente **se o texto não mudou**; texto editado vira pergunta nova (Task 3) | Quem, depois de uma falha, clica em **Enviar** com o mesmo texto está fazendo a mesma pergunta — com um id novo, uma pergunta já gravada (resultado desconhecido) seria duplicada. Texto diferente é outra pergunta, e ganha outro id. A exceção é `operacao_reutilizada`, que pede id novo por definição, também no **Enviar** (e não só no "Tentar de novo"). |
| O campo só é limpo se, ao chegar o `user_message`, ele ainda contém a pergunta enviada (Task 3) | A regra do dono é limpar no `user_message`. Se a pessoa começou a digitar a próxima pergunta enquanto a anterior estava "Enviando…", limpar apagaria esse texto novo — o README §7 proíbe perder texto digitado. |
| "Tentar de novo" também é derivado do **histórico**: se a última pergunta não tem resposta `completa` nem `gerando` depois dela (Task 3) | A spec diz que recarregar no meio de uma resposta a deixa `interrompida` "e a tela oferece Tentar de novo". Sem derivar do histórico, depois de recarregar a página não haveria botão nenhum. |
| O estado de envio "desconhecido" é um membro próprio da união (`unknown`), separado de `failed` (Task 3) | Pedem textos diferentes: `failed` sabe o que houve (o `code`), `unknown` não sabe se a resposta chegou inteira. Os dois oferecem "Tentar de novo" com o mesmo id. |
| Um evento SSE de nome desconhecido é **ignorado** pelo hook (Task 3) | O mesmo motivo da linha da Task 1: compatibilidade para frente, e o final continua decidido só por `done`/`error` — sem final, o resultado é `unknown`, então ignorar não esconde nada. |
| O histórico tem um **contador de geração** interno (`useTutorConversation`), acrescentado na revisão da Task 3 | Sem ele, a atualização silenciosa (depois de uma falha) e a recarga sobrescreviam a lista sem saber qual resposta era mais nova: um GET lento que chegasse depois do `done` voltava a lista para a versão sem a resposta, ou com a linha `gerando` vazia. Cada recarga pega um número novo e só grava se ainda for o mais recente; a atualização silenciosa usa o número corrente (uma recarga em voo continua sendo a fonte); o `done` pega um número novo, invalidando o que saiu antes dele, e, se a lista não está carregada (recarga em voo ou em erro), pede outra recarga — a que estava em voo saiu antes do `done`. Não cobre duas atualizações silenciosas fora de ordem nem o `updateAction` (pendência 49). |
| O retrato da Tifa é `bg-emerald-700` com as iniciais "TL", `aria-hidden` (Task 4) | É decoração: o nome dela já está no texto acessível ao redor: marcá-lo lido duas vezes seria ruído para leitor de tela. |
| O layout (lateral × folha) é decidido por `matchMedia` (`useIsDesktop`), e não só por CSS/Tailwind responsivo (Task 4) | A semântica muda junto com o breakpoint, não só a posição: no celular a conversa é um diálogo modal (foco preso, `Esc` fecha); no desktop é uma região da página. Atributo ARIA não tem media query — só JavaScript decide o `role` e o comportamento de foco corretos. |
| A folha modal do celular prende o `Tab` dentro de si, e `Esc`/"Fechar a conversa" saem (Task 4) | É o contrato de um diálogo modal (padrão WAI-ARIA): o foco não pode escapar para o conteúdo atrás, e há sempre uma saída pelo teclado. |
| O `main` ganhou `pb-24` de folga (Task 4) | O botão fixo do painel (celular) não podia cobrir os botões "Confirmar"/"Recusar" do quadro de missões quando a página rola até o fim. |
| Com o campo de pergunta desabilitado, o foco de reserva ao abrir a folha vai para "Fechar a conversa" (Task 4) | O alvo natural do foco (o campo) não aceita foco enquanto desabilitado; sem reserva, o foco cairia fora do diálogo modal, quebrando o contrato de foco preso. |
| A recarga do quadro pedida pela página usa um `ref` (`MissionListHandle` + `useImperativeHandle`), e não uma prop observada por efeito (Task 5) | Um efeito que chama `setState` ao ver a prop mudar é o que o lint `react-hooks/set-state-in-effect` reprova, e a recarga é um EVENTO (a confirmação deu certo), não um estado que a página mantém. |
| `formatDeadline` mora em `shared/lib/deadline.ts`, e não em `features/missions/` nem duplicado em `features/tutoring/` (Task 5) | Tem dois usuários reais — o cartão da missão e o cartão da proposta da Tifa —, e a regra do fuso (`America/Sao_Paulo`, README §8, decisão A3) é uma só; uma cópia por feature seria a segunda regra para divergir (`docs/ARCHITECTURE.md` §5, regra 3). |
| O "de 5" de `ProposalCard.tsx` é declarado como a terceira cópia à mão de `DIFICULDADE_MAXIMA` (Task 5) | Resolve a forma, não o conteúdo, da pendência 32: `tutoring/` não importa de `missions/` (regra 1 do §5), e um literal isolado não é regra que justifique subir a constante para `shared/`. A pendência permanece aberta para as três cópias. |
| `prazo_expirado` é espelhado como `state: 'falhou'` direto no `changed`, sem nova ida à rede (Task 5) | O backend já grava a ação como `falhou` **antes** de responder 422 (spec, "Confirmar e recusar"): a tela só precisa repetir o que já é verdade, e uma recarga para confirmar seria uma chamada a mais sem informação nova. |
| O `boardHref` é passado pela página ao `TutorPanel`, e não conhecido pela feature `tutoring` (Task 5) | A página é quem conhece as duas features (`missions` e `tutoring`) e o `id` do título do quadro; `tutoring` continua sem saber que `missions` existe, o mesmo contrato que já valia para `onMissionCreated`. |

As seis emendas à spec (E1–E6, decisão do dono sobre a chave no Keychain,
o thinking no falso e mais quatro pontos que a execução mudou) **não** entram nesta tabela: vivem
na seção "Emendas (2026-09-22, 1b-2)" da spec
(`docs/superpowers/specs/2026-09-18-incremento-1b-design.md`), no mesmo
formato da emenda do 1b-1, com o motivo medido e o teste que prova cada uma.

### Incremento 1b-2 — decisões tomadas durante a execução

Quatro divergências entre o pseudocódigo/texto do plano e o que a execução
exigiu, descobertas nas correções de revisão da Task 6 e nas mutações da
Task 7, e duas decisões da Task 8 que nasceram do achado da camada 3.

| Decisão | Motivo |
|---|---|
| Em `TratadorDoFalso.do_POST`, `liberar` e `roteiro` são capturados **juntos** no início do tratamento (`liberar` primeiro), e o `/_control/reset` troca o roteiro **antes** de trocar o `Event` (Task 6, commit `d8461e7`) | O plano previa ler `roteiro` no início e `liberar` só na hora de esperar. Entre as duas leituras, um `POST /_control/reset` trocava o `Event`: o tratador esperava no `Event` novo com o roteiro **velho** mandando segurar, preso até o teto de 30 s. Reproduzido de forma determinística por `test_reset_entre_o_registro_e_a_espera_solta_o_tratador` (com o `time` do falso trocado por monkeypatch); a ordem "roteiro antes do `Event`" no reset não tem teste próprio — a janela fica entre duas atribuições consecutivas, sem gancho possível no código, e o motivo está no comentário do reset. |
| `PUT /_control/script` sem `content-length` responde `400` com `{"error": ...}`, e a conexão fecha depois de qualquer `400` (Task 6, commit `d8461e7`) | O plano não previa o caso: sem a checagem, faltar o cabeçalho levantava `TypeError` fora do `try` e a conexão caía sem resposta nenhuma (`RemoteDisconnected` do lado do cliente), em vez de um erro alto e legível. |
| Os textos que o falso devolve no cenário (c) do E2E carregam o sufixo `EXECUCAO` (Task 7) | A conversa da tutoria é uma só no `focusquest_test`, e a tela mostra até 50 mensagens: sem o sufixo, a segunda execução seguida de `make check-e2e` reprova com `strict mode violation` (o localizador por texto resolve para a linha desta execução **e** da anterior) — medido com o texto original do plano. Pior, a execução seguinte do dia poderia **aprovar** por acidente, casando com as linhas velhas antes do reenvio desta execução. |
| **O servidor falso emite, por padrão, o bloco de thinking que a API real manda** (Task 8; decisão do **dono** no ponto de parada 3; emenda E6 da spec) | A camada 3 reprovou na primeira execução: a referência gravada pela chamada real (`claude-opus-5`) tem `content_block_start:thinking`, `thinking_delta`, `signature_delta` e `content_block_stop` entre o `message_start` e o texto, sem a requisição pedir thinking, e o falso não os emitia. O plano mandava parar e não mudar nem o falso nem a referência; o dono decidiu "o falso emite thinking", para o falso se parecer com a API real. `Roteiro(pensar=False)` desliga. O adaptador de produção não mudou: ele já descartava o bloco, e um teste novo prova isso. |
| As contagens de eventos dos testes existentes passam a `APOS_O_PRIMEIRO_PEDACO` (7), e a expectativa de 3 testes da camada 2 passa a incluir o bloco `thinking` (Task 8; decisão do coordenador, opção (A)) | Consequência direta da linha acima, não acomodação de defeito: as contagens contam todos os eventos, e o 3 que queria dizer "depois do primeiro pedaço de texto" cairia dentro do thinking; e a `Message` que o SDK monta do falso padrão agora tem o bloco `thinking` na frente. A alternativa (B), `pensar=False` nesses testes, deixaria a camada 2 sem exercitar o falso padrão. Lista em "Alterações", Task 8. |
| Duas mutações do plano (Task 7) precisaram de forma ajustada para reprovar pelo motivo certo | (1) desligar a recarga do quadro com `onMissionCreated={() => undefined}` não compila (`TS6133`, `noUnusedLocals`); a mutação aplicada foi o corpo do `reloadBoard` sem `board.current!.reload()`, mesma semântica, reprovando o cenário (a) em `toHaveCount(1)`. (2) um filho `<div style={{ width: 600 }} />` no `<main>` **passou** por engano (EXIT 0): a div tinha 600 px de largura, mas altura zero não entra no `scrollWidth`/overflow rolável do Chromium; com `{ width: 600, height: 10 }` o cenário (e) reprova em `semRolagemHorizontal()`. O defeito era da mutação, não do cenário. |

**Registro da decisão D-a: a chave real mora no Keychain do macOS, nunca no
`.env`.** Duas exposições medidas (registradas na emenda E1 da spec,
`docs/superpowers/specs/2026-09-18-incremento-1b-design.md`): (1) o
`check-secrets` roda `gitleaks dir .`, que varre também arquivos ignorados
pelo git — medido em 2026-09-22 num repositório descartável, com `.env` no
`.gitignore` e uma chave fictícia `sk-ant-api03-...` dentro dele, o Gitleaks
8.30.1 com o `.gitleaks.toml` deste projeto deu `leaks found: 1`, EXIT 1: com
a chave no `.env`, todo commit reprovaria; (2) o `pre-push` exporta toda
`FOCUSQUEST_*` do `.env` para o worktree do gate (`scripts/push-env.sh`,
`docs/QUALITY.md` §6) — a chave iria para o ambiente do gate inteiro a cada
push. **Resíduo:** uma variável já exportada no shell de quem empurra também
passa ao worktree ("uma variável já exportada vence" — `push-env.sh` só
exporta o que está no `.env`, mas não apaga o que já está no ambiente); é
por isso que a recomendação é nunca exportar a chave no perfil do shell, só
no comando, e as duas guardas
(`test_a_guarda_vale_com_a_chave_exportada_no_ambiente`, Task 8 Step 1, e
`test_impoe_a_chave_ficticia_mesmo_com_uma_chave_no_ambiente`, Task 6) provam
que esse resíduo não alcança nem a suíte nem o E2E. Ver também "Setup"
abaixo.

### Dependências e infraestrutura que entraram no 1b-2

O `AGENTS.md` §4 exige motivo escrito para cada biblioteca, endpoint e
serviço. **Nenhuma dependência npm ou Python nova** — conferido:
`git diff a795ee7 -- frontend/package.json pyproject.toml` vazio (medido
nesta sessão).

- **Infraestrutura:** o servidor falso do E2E como processo próprio, na
  porta 8150, é o terceiro `webServer` do Playwright
  (`frontend/tests/e2e/servers.ts`, `frontend/playwright.config.ts`); o
  controle HTTP dele (`/_control/*`) mora inteiramente em `tests/`, nunca em
  `src/focusquest/`. A chave real da Anthropic mora no Keychain do macOS
  (item `focusquest-anthropic`, decisão D-a, emenda E1), **fora** do
  repositório; o `.gitleaks.toml` não mudou.
- **Endpoints:** nenhum novo na aplicação. O `/_control/*` do falso não é
  endpoint de produto — é infraestrutura de teste, exposta só pelo processo
  `tests/integration/falso_do_e2e.py`.

### Incremento B — decisões que a spec não fixava

Transcritas da tabela "Decisões que a spec não fixava" do plano
(`docs/superpowers/plans/2026-09-25-incremento-b.md`), à medida que as
tarefas as põem em código.

| # | Decisão | Motivo |
|---|---|---|
| P1 | O ciclo mora no módulo `missions`, em arquivos `cycle_*.py`, e não num módulo próprio | A diária e a especial **são** missões, e a conclusão é a mesma rota. Um módulo `cycle` separado fecharia um ciclo de import: `missions.service` precisa das regras do ciclo na conclusão, e o ciclo precisa de `Mission` e de `User` (que mora em `missions/models.py`, pendência 8). `docs/ARCHITECTURE.md` §5 regra 2 proíbe o ciclo. |
| P2 | `GET /api/plans/current` entra no B, e não no C | O 201 do `POST /api/plans` devolve o plano "na mesma forma do `GET /api/plans/current`" (spec, Endpoints), então o serializador existe no B de qualquer jeito; e a spec manda o cliente que recebe `409 plano_existente` confirmar com esse GET. O C fica com a tela da trilha, a navegação lateral e o axe em Campanhas. |
| P3 | A `availability` da avulsa é `concluida` se o estado é `concluida`, e `disponivel` nos outros | A spec põe `availability` no `MissionRead` e só tabela a diária e a especial. A avulsa não tem regra de dia (o prazo dela nunca bloqueou a conclusão, desde o 1a). |
| P4 | `weekly_plans.created_at` vem do **relógio injetável**, e não do `now()` do banco | É entrada de regra (`fora_do_plano`), como o `created_at` das mensagens da tutoria (1b-1). Misturar o `now()` do banco com o relógio dos testes faria a regra comparar dois relógios. |
| P5 | O `bonus` do `POST /api/plans` recusa campo desconhecido (`extra="forbid"`) | A spec diz "1 missão, sem `difficulty`". Um cliente que mandasse `difficulty` acharia que foi respeitado; o 422 diz que não. |
| P6 | Ocultação implementada por **leitura**: `ler_missao` levanta `MissaoNaoEncontradaError` para o que não foi revelado, e a conclusão chama `ler_missao` logo depois do relógio | Uma função só decide "revelado" para a leitura e para a conclusão; duas acabariam discordando. A ordem da spec (trava, relógio, ocultação, reenvio, regra do dia, transição) continua literal. |
| P7 | A guarda do banco de teste e o recomeço do esquema moram em `tests/integration/banco_de_teste.py`, e rodam como `PYTHONPATH=tests uv run python -m integration.banco_de_teste` | É infraestrutura destrutiva de teste: em `src/` ela poderia ser chamada pela aplicação. O arranjo `PYTHONPATH=tests` já é o do servidor falso do E2E. Task 6 (commit `50e2150`). |
| P8 | O quadro de avulsas passa a se chamar "Outras missões — tarefas com prazo" | A spec, seção Frontend: "'Outras missões', com as avulsas". |
| P9 | Depois de concluir a diária ou a especial, a seção do ciclo **atualiza em silêncio** (`refresh`), sem passar por "carregando" | Recarregar com "carregando" desmontaria o cartão e apagaria o anúncio "Missão concluída.". Se a atualização silenciosa falha, a tela mantém o que tinha e avisa que a sequência pode estar desatualizada, com "Atualizar". |
| P10 | `DAYS_PER_MILESTONE = 7` no frontend espelha `DIAS_POR_MARCO` à mão | Mesmo desenho dos outros espelhos (pendência 32): a tela precisa do número para "N de 7". |

### Incremento B — decisões tomadas durante a execução

Divergências entre o pseudocódigo/texto do plano e o que a execução exigiu,
descobertas nas Tasks 1 a 5 e 7 a 8, e dois achados de teste vacuamente verde
corrigidos nas rodadas de correção da revisão.

| Decisão | Motivo |
|---|---|
| `MissaoLida`, `dia_da_diaria` e `leitura_da_avulsa` (Ruling R1 do ledger) entram na **Task 2**, e não na Task 3/5 como o plano previa | Com `Mission.deadline: Mapped[datetime \| None]` (mudança da própria Task 2), `tutoring/context.py` fazia `missao.deadline.isoformat()` direto e reprovava o mypy estrito; `leitura_da_avulsa` é a forma tipada de ler o prazo da avulsa, e o `make check` da Task 2 precisava passar. O código é o mesmo que a Task 3 já previa (copiado dela, sem adaptação); só a Task que o introduz mudou. |
| `dias_para_o_marco` recebe o parâmetro **`sequencia_atual`**, não `sequencia` (Task 1, achado de revisão) | O nome `sequencia` sombrearia a função homônima do módulo; toda chamada do plano já é posicional, então nada quebrou, mas uma chamada futura por keyword exigia o nome sem colisão. |
| `test_tipo_invalido_e_recusado` (`test_cycle_models.py`) passou a criar um plano e inserir com `plan_id`/`deadline`/`day` compatíveis com os outros CHECK (Task 2, fix round 1) | O INSERT original violava **três** `CHECK` ao mesmo tempo (`ck_missions_mission_type`, `ck_missions_plano_do_tipo` e `ck_missions_prazo_do_tipo`) e só passava porque o PostgreSQL relata um só, por acidente de ordem — não provava o CHECK que o nome do teste afirma. |
| `test_a_ocultacao_vem_antes_do_reuso` foi parametrizado em três cenários (diária de dia futuro, especial bloqueada, diária de semana seguinte) (Task 4, fix round 1) | O teste original só cobria um cenário; o revisor pediu prova de que a ocultação vale nos três casos que a spec lista para "o que não foi revelado". |
| `BonusCreate`, `DailyCreate` e `PlanCreate` recusam campo desconhecido (`extra="forbid"`) (Task 5, ruling do controlador) | Mesmo motivo da decisão P5, generalizado: um `deadline` ou `day` mandado numa diária seria ignorado em silêncio pelo Pydantic sem a diretiva. Custo: um cliente que mande campo a mais recebe 422 — comportamento desejado, não regressão. |
| O ponto do revisor da Task 4 sobre checar `NaoPertenceAoUsuario` antes da ocultação foi recusado (ruling do controlador) | `main.py` já responde o **mesmo** corpo/`code` 404 para missão inexistente e para missão alheia (decisão herdada do Incremento A); com usuário único isso é observacionalmente idêntico a checar a posse primeiro. |
| Commit `b233a84` da Task 2 ficou com **dois** `Co-Authored-By` (o Opus do plano e o Sonnet do implementador), sem `amend` | Mesma decisão do 1b-1: atribuição verdadeira vale mais que uniformidade, e reescrever histórico não valia o risco. Sem efeito funcional. |

**Achado: o teste de concorrência da Task 4 era vacuamente verde em relação
à trava.** `test_conclusao_concorrente_na_virada_do_dia_conclui_uma_vez`
(`tests/integration/test_cycle_concorrencia.py`) usa dois relógios dos dois
lados da meia-noite (23:59:59 e 00:00:01 em São Paulo); cada thread decide
seu próprio resultado pela **regra do dia**, sem nunca disputar de verdade a
transição de estado — por isso passava com **0 de 5** execuções mesmo com o
`with_for_update` removido do `_buscar`. A mutação foi vista reprovando pelo
motivo certo (a regra do dia), mas a trava (`FOR UPDATE`) ficou sem prova
neste teste. Corrigido com um segundo teste,
`test_duas_conclusoes_do_mesmo_lado_da_meia_noite_produzem_uma_so`, com os
dois relógios do **mesmo** lado da meia-noite: as duas threads leem a mesma
disponibilidade, e só a trava decide quem conclui primeiro — **5 de 5**
execuções reprovaram sem o `with_for_update`. A docstring do módulo foi
corrigida para não afirmar que o teste original prova o mecanismo da trava;
quem prova o mecanismo por construção continua sendo
`test_concluir_trava_a_linha_da_missao`
(`tests/integration/test_missions_concorrencia.py`, do Incremento 1a).

**Achado: um teste do `useCycle` do frontend era vacuamente verde.** O caso
"um pedido cancelado na desmontagem não vira erro" (Task 7) checava
`result.current` **depois** de `unmount()` — e o `renderHook` do Testing
Library para de re-renderizar depois da desmontagem, então o valor fica
congelado e o teste não tinha como observar se a guarda
`if (controller.signal.aborted) { return }` rodou ou não. Passava com a
guarda removida (mutação aplicada de propósito), confirmando a suspeita.
Reescrito como `'um pedido cancelado que so rejeita DEPOIS do bom ja ter
assentado nao vira erro'`: monta em `StrictMode` (duplo efeito), espera o
`loaded` do segundo pedido e só então rejeita manualmente o primeiro, com o
componente **vivo** — esse teste reprova (`error` em vez de `loaded`) sem a
guarda, e passa com ela.

**Revisão final da branch (commits `5cd4474` e `5d250b3`).** Achados
"Important": **I1** — o E2E do ciclo (`cycle.spec.ts`) rodava com o
navegador no fuso global do `playwright.config.ts` (`Asia/Tokyo`), e a
armadilha da data civil só aparece a **oeste** de UTC; corrigido com
`test.use({ timezoneId: 'America/Sao_Paulo' })` escopado a esse arquivo —
medido sem o `timeZone` do formatador: a tela mostrou "24/09" em vez de
"25/09". **I2** — os dois testes da guarda de `recriar_esquema`/
`exigir_banco_de_teste` (`test_banco_de_teste.py`) apontavam para
`settings.database_url`, o banco de **desenvolvimento** real; trocados por
uma URL fixa com porta 9 fechada, para que a guarda seja testada sem nunca
tocar um banco de verdade. **T3** — o prazo (`deadline`) da especial
revelada não tinha asserção em `test_a_semana_inteira_revela_a_especial_de_660_xp`;
acrescentada a comparação com o fim da janela dos dois dias em UTC. Achados
"minor" corrigidos no mesmo lote: `key` que faltava nos dois `MissionCard`
do ciclo (um `refresh` que trocava de missão mantinha a instância antiga,
presa em "concluída"); hierarquia de títulos (`h3` dentro de `h3` — o
cartão da especial agora usa `h4` via `titleLevel`); a sequência
(`cycle-streak`) sem `role="status"`, portanto nunca anunciada por leitor
de tela; e os textos "Atualizar o quadro" (virou "Atualizar a missão de
hoje" nos cartões do ciclo) e a mensagem de `missao_expirada` ("o dia desta
missão" virou "o prazo desta missão", porque a janela da especial é de dois
dias). Detalhe de cada mutação vista reprovando em
`.superpowers/sdd/2026-09-25-incremento-b/fix-final-front-report.md` e
`fix-final-back-report.md`.

**Achado: `test_limites_da_tutoria_recusam_zero` era vacuamente verde sob o
`pre-push`, defeito pré-existente descoberto pelo `pre-push` real de um
clone.** O `git push` desta branch foi recusado pelo gate com as três
reprovações do parametrizado
(`FOCUSQUEST_TUTOR_MAX_TOKENS=0`/`FOCUSQUEST_TUTOR_TIMEOUT_SECONDS=0`/
`FOCUSQUEST_TUTOR_HISTORY_MESSAGES=0`), enquanto `make check` local passava.
Causa: `scripts/check-push.sh` + `scripts/push-env.sh` exportam para o
ambiente do worktree do gate toda `FOCUSQUEST_*` do `.env` do clone
(`docs/QUALITY.md` §6); o `.env` deste clone, copiado do `.env.example`, traz
`FOCUSQUEST_TUTOR_MAX_TOKENS=1024` etc. — valores não-zero. O helper
`_settings_do_arquivo` (`tests/unit/test_config.py`) escrevia um `.env`
temporário com `=0` e esperava `ValueError`, mas no pydantic-settings a
variável de **ambiente** vence o arquivo: o `Settings()` lia o valor
exportado pelo `pre-push`, não o `0` do arquivo, e não recusava. Medido antes
de mexer: `FOCUSQUEST_TUTOR_MAX_TOKENS=1024
FOCUSQUEST_TUTOR_TIMEOUT_SECONDS=60 FOCUSQUEST_TUTOR_HISTORY_MESSAGES=20 uv
run pytest tests/unit/test_config.py -q --no-cov` reproduziu as mesmas três
reprovações fora do `pre-push`; os demais testes do arquivo (inclusive os
que também usam o helper) passaram com todo o `.env` exportado, então o
vazamento era só destas três. Conserto: `_settings_do_arquivo` agora tira do
ambiente, com `monkeypatch.delenv`, toda variável `FOCUSQUEST_*` que estiver
presente no processo no momento da chamada — não só as de banco e a chave da
Anthropic — antes de escrever o `.env` do teste; docstring no próprio helper
explica o motivo. `pre-push`, `push-env.sh` e o gate não foram tocados. A
guarda de sessão de `tests/conftest.py`
(`FOCUSQUEST_ANTHROPIC_BASE_URL`) não foi enfraquecida: o `monkeypatch` do
teste restaura o ambiente no teardown, e `test_a_suite_nunca_aponta_para_a_anthropic`
não usa o helper. Verificado: o mesmo comando de reprodução passa com as
variáveis exportadas e sem elas, e com todo o `.env` exportado num
subshell (`set -a; . ./.env; set +a`); mutação (reverter o `delenv`
generalizado para o antigo, específico de banco/chave) reproduziu as mesmas
três reprovações, restaurada em seguida.

### Dependências e infraestrutura que entraram no B

O `AGENTS.md` §4 exige motivo escrito para cada biblioteca, endpoint e
serviço.

- **Dependência nova: `tzdata==2026.4`.** A spec do ciclo diário (C1) exige a
  base de fusos IANA para calcular o dia civil em `America/Sao_Paulo` com
  `zoneinfo`. O pacote **garante** a base em qualquer máquina — inclusive uma
  sem base do sistema instalada —, e não substitui a base do sistema quando
  ela existe: `zoneinfo.ZoneInfo` procura primeiro a base do sistema
  operacional e só recorre ao pacote `tzdata` quando ela falta (a estratégia
  documentada do próprio `zoneinfo`). Nenhuma outra dependência nova, nem em
  `pyproject.toml` nem em `frontend/package.json`.
- **Endpoints novos:** `POST /api/plans` (cria o plano semanal, 201),
  `GET /api/plans/current` (200, `{"plan": PlanRead | null}`) e `GET
  /api/cycle` (200, o ciclo derivado do relógio). Nenhum serviço novo: os
  três rodam no mesmo processo FastAPI, sobre o mesmo PostgreSQL.
- **Infraestrutura de teste:** o alvo `make reset-test-db` (Task 6, guarda
  compartilhada em `tests/integration/banco_de_teste.py`) recria o esquema
  do banco de teste do zero antes do `check-e2e` — necessário porque o plano
  semanal é único por semana (C3/`uq_weekly_plans_user_id_week_start`), e sem
  esquema limpo um segundo `check-e2e` seguido reprovaria com `409
  plano_existente`. Task 6, commit `50e2150` — ver "Alterações do
  Incremento B" e `docs/QUALITY.md` §4.

### Incremento C — decisões que a spec não fixava

Transcritas da tabela "Decisões que a spec não fixava" do plano
(`docs/superpowers/plans/2026-09-25-incremento-c.md`); o motivo de cada uma
está também no comentário do arquivo citado.

| # | Decisão | Motivo |
|---|---|---|
| K1 | A área ativa mora num `useState<Area>` do **`App.tsx`**, que vira o roteador; a barra lateral é `src/app/SideNav.tsx` e a lista das áreas, `src/app/areas.ts` | C15 manda estado local e sem biblioteca de rotas; `docs/ARCHITECTURE.md` §5 regra 6: "o que entra no `App.tsx` é um roteador, não o conteúdo da segunda tela". `src/app/` é o lugar de "inicialização, rotas e providers" (§3). A URL não muda: a rota por URL entra quando houver a terceira área (C15). Custo: recarregar a página volta ao Quartel-General. |
| K2 | O **Quartel-General fica montado e oculto** (`hidden`) enquanto Campanhas está aberta; Campanhas **desmonta** ao sair | Desmontar o Quartel-General desmontaria o painel da Tifa: o rascunho não enviado se perderia, e um stream em andamento seria abortado — o `useTutorConversation` aborta na desmontagem, e o backend grava a resposta como `interrompida`. Campanhas, ao contrário, **deve** remontar: cada abertura busca a trilha de novo, e uma conclusão feita no Quartel-General aparece na trilha sem recarregar. Custo: o ciclo do Quartel-General oculto não se atualiza sozinho por troca de área (ver K7 e a pendência 60). |
| K3 | O painel da Tifa continua **dentro do Quartel-General**; Campanhas não tem painel no C | Tirar o painel da página exigiria um canal do shell até o quadro de avulsas (`onMissionCreated`, `boardHref`) com o quadro às vezes desmontado — mudança na feature `tutoring` sem pedido de produto. Fica como pendência para o incremento que ligar a Tifa ao plano (`propose_plan`, pendência 59). |
| K4 | Os itens da navegação são **`<button>`** com `aria-current="page"` no ativo, dentro de `<nav aria-label="Áreas">` | Sem URL (K1) não há `href` para um link de verdade, e `<a>` sem `href` não recebe foco. `aria-current` é atributo global de ARIA. O ativo também se distingue **sem cor**: marcador `▸` visível (com `aria-hidden`, porque o leitor de tela já ouve o `aria-current`), barra lateral e peso da fonte (README §7, avisos além da cor). |
| K5 | Depois de navegar, o **foco vai ao título de nível 1** da área aberta (`tabIndex={-1}`, `id` em `src/pages/headings.ts`) | Sem troca de URL nem de documento, o leitor de tela não percebe que o conteúdo mudou; o foco no título anuncia a área nova e põe o teclado no começo dela. Os `id` moram em `pages/headings.ts` (e não no `App.tsx`) porque são das páginas, e o `App` os importa na direção certa (app → pages). |
| K6 | No **celular** (< `lg`), a navegação é uma **barra no topo, no fluxo** (`flex-wrap`, sem `position: fixed`); no desktop, coluna lateral `sticky`. Decidido **só por CSS** | README §7: no celular nada pode cobrir botões nem exigir rolagem horizontal. Uma barra fixa embaixo disputaria o canto com o botão fixo "Falar com a Tifa"; uma gaveta exigiria diálogo modal, foco preso e Esc para duas opções. Ao contrário do painel da Tifa (`useIsDesktop`, onde a semântica ARIA muda com o layout), aqui a semântica é a mesma nas duas larguras — o mesmo `nav` com os mesmos botões —, então media query basta. |
| K7 | O ciclo (`useCycle`) e a trilha (`useCurrentPlan`) **atualizam em silêncio** quando a aba volta a ficar visível (`visibilitychange`) ou a janela recebe foco (`focus`) — Task 5 | Fecha a pendência 57 (achado m2 da revisão final do B: "aba aberta na virada do dia mostra o dia anterior até recarregar"). Silencioso pelo mesmo motivo da P9: passar por "carregando" desmontaria os cartões. O gancho mora em `shared/hooks/useRefreshOnReturn.ts` porque tem dois usuários reais, um em cada feature (§5 regra 3). Custo declarado: trocar de área **dentro** do app depois da meia-noite não dispara nenhum dos dois eventos — o Quartel-General oculto (K2) continua no dia anterior até a aba sair e voltar, ou até um recarregamento (pendência 60). |
| K8 | A trilha **só mostra**: não tem botão Concluir. O dia de hoje disponível diz "Disponível — conclua no Quartel-general" | O Quartel-General já conclui a diária e a especial, com registro de chaves próprio. Um segundo lugar de conclusão criaria um segundo registro para a mesma missão, com outra chave (`operation_id`) — a API não duplicaria (a segunda operação recebe `transicao_ilegal`), mas a tela mostraria erro para uma conclusão que deu certo. C14 diz que a tela "lê, conclui e mostra a campanha": a conclusão fica onde já está. |
| K9 | O marcador **"Hoje"** da trilha é o **último dia não `bloqueada`** da semana | `PlanRead` não tem `today`. Todo dia depois de hoje é `bloqueada`, e todo dia até hoje é revelado (`fora_do_plano`, `disponivel`, `concluida` ou `perdida`) — então o último revelado é hoje, e nenhuma segunda requisição (`GET /api/cycle`) é necessária. `GET /api/plans/current` é sempre a semana de hoje. |
| K10 | O contrato da trilha mora em `features/campaigns/types.ts`; o tipo `Mission` (e `MissionState`, `MissionType`, `Availability`, `MISSION_STATE_LABELS`) **sobe para `shared/types/mission.ts`**, e `formatCivilDate` sobe para **`shared/lib/civilDate.ts`**, que ganha `civilWeekday` | A trilha mostra o conteúdo de uma `MissionRead` e formata `day`: dois usos reais, um em `missions` e outro em `campaigns` (§5 regras 1 e 3). Mover, e não reexportar: um lugar só para o contrato. `DAYS_PER_MILESTONE` sobe junto (o "N de 7" é das duas features). |
| K11 | A página `Campaigns.tsx` e o componente `CampaignTrail` têm fronteira fixa: a página tem o `<main>`, o `h1` "Campanhas — planos de estudo" (`id` de `pages/headings.ts`) e compõe **`<CampaignTrail />`** de `features/campaigns/CampaignTrail.tsx`, sem props; o componente começa no `h2` e não renderiza `<main>` | Os dois agentes trabalham em paralelo: a página nasce na Task 1 com um espaço reservado honesto, e a Task 4 troca o espaço reservado pelo componente — uma linha de import e uma de JSX. Fixar o nome, a ausência de props e o nível de título aqui evita a divergência na integração. **Relaxada pela Ruling R5** (abaixo): a Task 4 acrescentou a prop opcional `onOpenHeadquarters` para o botão "Ir ao Quartel-General" — `Campaigns` deixou de ser estritamente sem props, mas continua sem props **obrigatórias**, e sem ela o componente funciona do mesmo jeito (texto no lugar do botão). |

### Incremento C — decisões tomadas durante a execução

Quinze rulings do controlador, registradas no ledger da sessão
(`.superpowers/sdd/2026-09-25-incremento-c/progress.md`) à medida que a
varredura prévia e a execução das Tasks encontravam divergência entre o
plano e o que já existia (os worktrees `feat/incremento-c-nav` e
`feat/incremento-c-trilha`, escritos sem commit antes da integração) ou
entre o pedido de correção e o desenho necessário.

| # | Decisão | Motivo e custo |
|---|---|---|
| R1 | A base do C é `9c2bd1e` (a ponta verde do B), **não** `origin/main` | O merge do PR #13 (B) foi bloqueado pelo classificador de permissões em 2026-09-25 e ficou para o dono; o C parte da ponta do B em vez de esperar. Quando o dono mesclar o B, os commits dele viram ancestrais da `main` e o PR do C passa a mostrar só o C. **O C precisa ser mesclado depois do B.** Custo se errado: rebase do C sobre a `main`, se o B mudar antes do merge. |
| R2 | As Tasks 0+1 e 2+3 são "aterrissagem" do trabalho **sem commit** dos worktrees `feat/incremento-c-nav` e `feat/incremento-c-trilha` (um despacho por par), com o gate completo no hook a cada commit e revisão de tarefa normal | O trabalho já tinha sido feito e provado por mutação nos dois worktrees de trabalho (README §1: "aterrissagem" traz o resultado para a branch de integração); faltava só commit, gate e revisão. Custo: se o transporte perder alguma coisa do trabalho original, a revisão da Task pega. |
| R3 | Seguir a K10 do plano ao pé da letra: **mover** (sem reexportar) `Mission`, `MissionState`, `MissionType`, `Availability`, `MISSION_STATE_LABELS` e `DAYS_PER_MILESTONE` para `shared/types/mission.ts`, e atualizar todos os imports | "Um lugar só para o contrato" — a alternativa (reexportar de `features/missions/types.ts`) manteria dois caminhos válidos para o mesmo tipo. É mecânico. Custo: *churn* de imports em 10 arquivos. |
| R4 | `useCurrentPlan` ganha `refresh()` silencioso e `refreshFailed` já na Task 2 (a interface que o plano só desenhava para lá), e a trilha ganha o aviso `trail-stale` já na Task 3 | A Task 5 (atualizar na volta à aba) depende dessa interface existir; adiantá-la evita reabrir `useCurrentPlan` na Task 5. Custo: um pouco de código a mais na aterrissagem das Tasks 2+3, sem consumidor ainda (fechado só na Task 5). |
| R5 | Manter a prop **opcional** `onOpenHeadquarters` da trilha (vira o botão "Ir ao Quartel-General"), e ligá-la na Task 4 (`Campaigns` recebe o retorno de chamada do `App`, que usa `navigate('headquarters')` com foco no `h1` do QG) | Melhor experiência que um texto solto sem ação, sem criar um segundo registro de conclusão (K8 continua preservado — o botão só navega, não conclui). Sem a prop, o componente continua funcionando (mostra o texto). Custo: `Campaigns` deixa de ser estritamente sem props (K11 relaxado, ver a nota na tabela acima). |
| R6 | Os `data-testid` da trilha ficam como o worktree de trabalho já tinha implementado (`trail-availability`, não `trail-day-availability` do plano), mais `trail-stale` (novo); o E2E da Task 6 usa os nomes reais | O plano é só o contrato **entre** tarefas — quando a tarefa que produz o nome já está feita e provada, o nome dela vence sobre o nome hipotético do plano. Custo: nenhum, é só nomenclatura. |
| R7 | A prova de `civilWeekday` por mutação usa um caso que o teste mata de fato: `new Date(civil)` com `getDay` local sob um fuso a **oeste** de UTC (mesmo padrão do teste "data civil a oeste de utc" de `5d250b3`) — não só remover `timeZone: 'UTC'` do formatador. Nome final: `civilWeekday` (o nome do plano) | A mutação que a spec teme de verdade (`new Date(civil)` cru) é a que precisa estar provada morta. **Corrigido na onda final (achado m1):** a justificativa original dizia que só tirar `timeZone: 'UTC'` mantendo `civilNoon` "não muda o resultado em nenhum fuso IANA real"; é falso — o deslocamento máximo é +14h, e o meio-dia UTC em `Pacific/Kiritimati` já é o dia seguinte. Tokyo (+9h) e São Paulo (-3h) deixavam esse mutante vivo; o teste com `TZ=Pacific/Kiritimati` o mata (ver "Alterações do Incremento C", onda final de correções). Custo: nenhum — é a forma certa da prova, não uma mudança de escopo. |
| R8 | Ícones SVG inline com `aria-hidden` aceitos no lugar de glifos Unicode que o plano pedia | O objetivo da restrição original (nenhuma dependência nova; ícone sempre acompanhado de texto) é cumprido do mesmo jeito — SVG inline não é biblioteca. Custo: nenhum funcional. |
| R9 | O texto "Sem plano nesta semana." fica como o worktree de trabalho já tinha, **não** "Nenhum plano nesta semana" que o plano pedia (achado Important da revisão das Tasks 2+3) | A spec do ciclo diário (linha 419) diz "sem plano nesta semana", e o próprio plano pede o mesmo texto de garantia do Quartel-General, cujo `CycleSection` diz "Sem plano nesta semana: …" — a spec é a autoridade sobre o plano quando os dois divergem. Custo se errado: trocar uma palavra e um teste. |
| R10 | Na correção de corrida do `refresh` (Task 5, fix round 1, commit `e195128`): "só o pedido mais recente decide" vale **também** para falha — se o pedido mais antigo teve sucesso e o mais recente falha depois, o resultado é `refreshFailed: true` (o aviso reflete a última tentativa; o dado mostrado continua o do sucesso mais antigo) | Regra única e simétrica para sucesso e falha, sem caso especial — a alternativa ("sucesso é sempre a última palavra sobre o aviso") exigiria tratar as duas respostas de jeitos diferentes na mesma guarda. Custo se errado: um aviso de desatualizado pessimista num caso raro (sucesso seguido de falha tardia); a correção seria trocar por uma guarda assimétrica e um teste novo para ela. |
| R11 | A correção pedida pela revisão da Task 7 (os *minors* adiados do ledger não tinham virado pendências neste documento) entra no despacho único de correção da revisão final, e não num despacho próprio: só os *minors* que a triagem final mantivesse abertos viram pendências | Evita documentar como pendente o que a onda final ia consertar (ex.: o aviso `act()` de `Campaigns.test.tsx`, a grafia, o `caixasSeSobrepoem`). Custo: a Task 7 ficou aberta até a onda final. |
| R12 | Achado Important I1 da revisão final: o `refresh()` que falha com a tela ainda em "carregando" leva ao estado de **erro** (com "Tentar novamente"), nos dois hooks (`useCycle`, `useCurrentPlan`), como o revisor propôs; os testes passam a deixar a carga inicial **assentar** depois da falha | O `refresh` incrementa a sequência e a resposta da carga inicial passa a ser descartada; o `catch` só marcava `refreshFailed` em `loaded` e devolvia `loading` intacto — o QG e a trilha ficavam em "Consultando…" para sempre, sem saída. Estado sem saída é defeito de usuário. Os dois testes antigos passavam vacuamente (a carga inicial nunca assentava). Custo: nenhum. |
| R13 | Grafia única **"Quartel-General"** (a da spec do ciclo diário) no rótulo da navegação, no `h1` do QG, na trilha e nos testes (Vitest e E2E) | A interface tinha as duas grafias ("Quartel-general" no rótulo e no `h1`, "Quartel-General" na trilha). Nos documentos, só onde citam o texto da tela. O README §7 (linha "**Quartel-general:** …") não cita texto de tela e não foi mexido. Custo: *churn* de texto nos testes. |
| R14 | `caixasSeSobrepoem` (E2E do celular) passa a **afirmar** que as duas caixas de `boundingBox()` não são nulas | Antes, uma caixa nula (elemento oculto, sem caixa) contava como "sem sobreposição", e um botão escondido passaria. Uma linha, do revisor final. Custo: nenhum. |
| R15 | O *minor* m5 (`MAX_DIFFICULTY` × o "de 5" literal) e os *minors* "pode ficar" da triagem final viram pendências neste documento (R11); a pendência da Task 3 sobre `TrailContent` exportada fica **fechada** (resolvida na Task 5) | Registro honesto do que ficou, separado entre dívida pequena aberta, aceito sem ação e verificado. Custo: nenhum. |

**Achado fora do escopo de qualquer Task, registrado pela Task 6 e resolvido
pela Task 5 (fix round 1):** durante a Task 6, `git status --short` mostrou
`frontend/src/features/missions/useCycle.ts` modificado e não comitado,
cerca de dois minutos e meio depois do commit da Task 6 — uma edição
concorrente de outra sessão/processo na mesma árvore, contrariando a
instrução dada à Task 6 ("um revisor está lendo a Task 5, só leitura") e o
`AGENTS.md` §2 ("revisar o trabalho de outro agente não autoriza editar a
árvore dele"). A Task 6 não tocou o arquivo e registrou o achado para o
controlador; a mudança era, de fato, a correção da Task 5 (fix round 1,
`e195128`, ver R10 acima) — nenhum trabalho foi perdido, mas o processo que
a escreveu **não deveria** ter tocado a árvore compartilhada enquanto a
Task 6 trabalhava nela.

### Dependências e infraestrutura que entraram no C

O `AGENTS.md` §4 exige motivo escrito para cada biblioteca, endpoint e
serviço. **Nenhuma dependência nova, nem endpoint novo, nem infraestrutura
nova** — conferido: `git diff 9c2bd1e..HEAD -- pyproject.toml
frontend/package.json frontend/package-lock.json uv.lock` vazio (medido
nesta sessão). O C é puramente frontend, sobre um endpoint que o B já
publicou (`GET /api/plans/current`, decisão P2); nenhuma rota nova, nenhum
serviço de infraestrutura novo, e as duas dependências de teste
(`@playwright/test`, `@axe-core/playwright`) já estavam no projeto desde o
1a.

### Incrementos anteriores

| Decisão | Motivo |
|---|---|
| Pasta do frontend permanece `frontend/`, não `web/` | README §3 manda adaptar a árvore à localização atual e não mover arquivos por estética. Divergência deliberada da árvore de exemplo. |
| Dois commits no saneamento | O primeiro congela o estado encontrado; o segundo isola as correções como diff auditável (README §3: comparar build antes/depois). |
| Tailwind como `devDependency` | O plugin roda no build do Vite; nada dele chega ao bundle do navegador. Na raiz estava como `dependency`. |
| `.run/` fora do `.gitignore` | README §4 manda versionar configuração de execução compartilhada. `.idea/` continua ignorado por ser estado pessoal. |
| D1 — O gate cobre apenas categorias com código real por trás; cada incremento futuro traz a sua | Rodar Ruff, mypy, pytest ou Playwright sobre conjunto vazio é o "sucesso com suíte vazia" proibido pelo §9. **Cumprida no 1a:** `check-api` e `check-e2e` entraram junto com o primeiro código Python e o primeiro fluxo ponta a ponta. |
| D2 — `pyproject.toml` + `uv.lock` criados no Incremento 2, só com dev-dependencies | Fonte única de verdade para versões das ferramentas Python. **Corrigida pela A1** (o `package = false` impedia importar o pacote) e pela validação do lock: quem valida é `--locked`/`--check`, não o `--frozen` que a D2 citava. |
| D3 — Hooks do pre-commit usam `language: system` e invocam `make check` | Impede a divergência clássica entre a versão que o hook instala e a que o lockfile fixa. |
| D4 — Gitleaks instalado por `scripts/install-gitleaks.sh` em `.tools/`, versão e checksums SHA-256 fixados | Binário Go, ausente do `uv.lock`. O hook gerenciado pelo pre-commit criaria recursão (pre-commit chamaria `make check`, que chamaria `pre-commit run`), proibida pelo §9. |
| D5 — Alvos granulares no Makefile, espelhados 1:1 nos jobs do CI | O §12 exige jobs distintos sob um agregador; um alvo por job mantém local e CI no mesmo caminho de execução. |
| D6 — Lógica com mais de duas linhas mora em `scripts/`, não no Makefile | GNU Make 3.81 (o disponível no macOS) executa cada linha de receita em sua própria shell; o §12 pede scripts compartilhados entre local e CI. |
| D7 — `main.tsx` é testado, não excluído da cobertura | O §9 proíbe excluir código difícil e proíbe diretivas de ignorar cobertura; testá-lo custa poucas linhas. |
| D8 — Prettier sem `eslint-config-prettier` | No flat config do ESLint 9+, os presets `recommended` não trazem regras de formatação; não há conflito a desarmar. |

### Dependências e infraestrutura que entraram no 1a

O `AGENTS.md` §4 exige motivo escrito para cada biblioteca, endpoint e
serviço.

- **Backend** (`pyproject.toml`): `fastapi`, `uvicorn`, `pydantic`,
  `pydantic-settings`, `sqlalchemy`, `psycopg[binary]` e `alembic` — a
  stack que o README §3 nomeia, uma a uma. `httpx` (dev) é o transporte do
  `TestClient` do FastAPI; `pytest` e `pytest-cov` são as ferramentas de
  teste e cobertura que o README §9 nomeia.
- **Frontend** (`frontend/package.json`, dev): `@playwright/test` e
  `@axe-core/playwright` — o Playwright/Chromium e o axe-core que o
  README §9 exige no E2E.
- **Serviço:** PostgreSQL `18.6-alpine` em container (`compose.yaml`),
  versão fixada e com healthcheck, conforme o README §3 e §10.
- **Endpoints:** os três de `/api/missions`, `/health` e `/ready` — ver
  "O contrato HTTP que existe" em `docs/ARCHITECTURE.md` §3. O de concluir
  existe pela decisão A8.

### Infraestrutura de CI: cache do Gitleaks (PR #7, mesclado por rebase)

O `AGENTS.md` §4 exige motivo escrito para infraestrutura nova.

- **O que entrou:** um passo `actions/cache@v6` no job `check-secrets`,
  sobre o `.tools/`, com chave derivada de
  `hashFiles('scripts/install-gitleaks.sh')`; e nova tentativa no `curl` do
  `scripts/install-gitleaks.sh` (`--retry 5 --retry-all-errors`, com
  intervalo e tetos de tempo).
- **Motivo, medido:** no PR #5 uma das duas execuções do workflow sobre o
  mesmo commit reprovou no `check-secrets` com
  `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL` contra
  `release-assets.githubusercontent.com`; o `quality-gate` reprovou junto e
  a reexecução passou. O gate baixava o Gitleaks a cada execução, sem cache
  e sem nova tentativa, então uma queda de rede do GitHub reprovava o gate
  com o código intacto.
- **Por que é seguro:** o script só aceita um binário já presente se o
  SHA-256 dele conferir com o `BIN_SHA256`; senão, não o usa e baixa de novo,
  substituindo-o só quando o download verificado termina — se o download
  falhar, o binário que não confere continua no disco e o script reprova do
  mesmo jeito. A guarda passou a ter teste que a faz dizer não
  (`tests/integration/test_install_gitleaks.py`), e o mesmo arquivo prova
  que, esgotadas as tentativas, o script continua reprovando.
- **O que ficou sem cache, e por quê:** o Chromium do Playwright no
  `check-e2e`. O `--with-deps` instala pacotes por `apt`, que cache de
  diretório não cobre; o cache restauraria ~300 MB de outro serviço de rede;
  e o baixador do Playwright já faz 5 tentativas. Ver pendência 39.
- **Paridade 1:1 preservada:** cache e nova tentativa são preparo de
  ambiente; cada job continua executando um alvo só. `docs/QUALITY.md` §5
  descreve a mudança.

## Alterações do Incremento A

Commits `92f92d0`, `c31aa06`, `b38a74a`, `34c7014`, `bdfb49b`:

- **Relógio injetável:** `core/clock.py` (`Clock`, `system_now`,
  `get_clock`); `concluir_missao` recebe o relógio e o lê depois da trava;
  a rota o injeta. Testes com relógio fixo, `completed_at` por igualdade, e
  uma sonda `FOR KEY SHARE NOWAIT` provando a ordem.
- **`code` nos erros:** `{"detail": ..., "code": ...}` em todo erro de
  domínio, com três códigos; os dois 404 idênticos byte a byte; o 422 sem
  `code`, com teste que recusa um handler que o acrescente.
- **Cliente HTTP:** `ApiError` com `status` e `code`, `postJson`, e o
  `detail` deixou de ser lido.
- **Botão Concluir:** `useCompleteMission` e `CompletionControls`, com os
  estados da tabela do plano e o `operation_id` mantido entre as tentativas.
- **E2E:** dois cenários novos, concluir e a resposta perdida, com o axe no
  estado concluído e no aviso de falha.
- **Task 6, pedida pelo dono:** "Atualizar o quadro" espera a conclusão em
  andamento, e a chave sobrevive à remontagem. `useCompletionRegistry` guarda
  as chaves por missão no `MissionList` e conta as conclusões em voo;
  `useCompleteMission` recebe o registro. Região viva do quadro
  (`missions-reload-status`) desde o primeiro render. Fecha a pendência 35.
- **Documentação:** este arquivo, o `docs/ARCHITECTURE.md` (árvore,
  contrato de erro, feature `missions`, §5.7) e o `docs/QUALITY.md` §4.

## Alterações do Incremento 1a

Commits `1ff982d`..`96eaeba`:

- **Pacote e configuração:** `pyproject.toml` com o pacote `focusquest`
  instalável (A1) e as dependências da aplicação;
  `src/focusquest/core/config.py` (`Settings`, prefixo `FOCUSQUEST_`, sem
  valor padrão para as URLs de banco); `.env.example` na raiz.
- **PostgreSQL local:** `compose.yaml` com `postgres:18.6-alpine` na porta
  `127.0.0.1:55432` do host, volume persistente, healthcheck com
  `pg_isready -h 127.0.0.1`, e `scripts/init-test-db.sql` criando o
  `focusquest_test` separado do banco de desenvolvimento.
- **Conexão e saúde:** `core/database.py` (engine e sessão por requisição),
  `/health` sem banco e `/ready` com consulta real.
- **Migração:** `alembic/versions/0001_esquema_inicial.py` cria `users`,
  `missions` e `mission_operations` (com `UNIQUE` em `operation_id`), semeia
  o usuário único e ajusta a sequence de `users`. Os testes aplicam a
  migração em banco vazio, fazem o downgrade e a aplicam de novo, atrás de
  uma guarda que recusa rodar o `DROP SCHEMA` fora do banco de teste.
- **Módulo `missions`:** domínio (estados, transições, XP, duração real),
  modelos, casos de uso (criar, listar, concluir com idempotência sob
  concorrência, via `SELECT ... FOR UPDATE` e a restrição única), schemas e
  as três rotas, com os erros traduzidos em `main.py`.
- **Frontend:** o Quartel-General (`pages/Headquarters.tsx`) listando as
  missões da API pela feature `missions` e pelo cliente único de
  `shared/api/`, com os quatro estados de tela (carregando, vazio, erro,
  carregado) e o "Tentar novamente" no estado de erro.
- **Gate:** alvos `check-api`, `check-e2e`, `db-up`, `db-down`, `migrate` e
  `migrate-test` no `Makefile`; `bootstrap` passou a instalar o Chromium do
  Playwright e a usar `uv sync --locked`; jobs `check-api` e `check-e2e` no
  CI, cada um com o próprio serviço PostgreSQL, os quatro jobs no `needs` e
  no laço do `quality-gate`; `timeout-minutes` em todos os jobs;
  `scripts/e2e-env.sh`; a passagem das variáveis `FOCUSQUEST_*` para o
  worktree do `pre-push`.
- **Documentação:** `docs/QUALITY.md`, `docs/ARCHITECTURE.md`, este arquivo
  e o `AGENTS.md` passaram a descrever o sistema como ele ficou.

**Onda de correção final** (depois de `b531981`, a partir da revisão da
branch inteira):

- **Entrada fora da faixa não gera mais 500:** `mission_id` do caminho com
  `Path(ge=1, le=2**31 - 1)`, `estimated_minutes` com `le=2**31 - 1` e
  `deadline` recusado com 422 quando, em UTC, sai da faixa do `datetime`. Cada
  guarda com teste de recusa e de borda aceita, e o teste de regressão que
  importa: depois de um prazo extremo recusado, `GET /api/missions` continua
  200. Cada guarda foi removida uma vez e o teste correspondente reprovou.
- **Prazo em `America/Sao_Paulo`** na tela, com teste de unidade num instante
  em que São Paulo e UTC caem em dias diferentes, o fuso dos testes fixado em
  `Asia/Tokyo`, e asserção do **texto** do prazo no E2E.
- **Guarda de `.env` do `pre-push` com teste automatizado:**
  `scripts/push-env.sh` (extraído do `check-push.sh`) e
  `tests/integration/test_push_env.py`.
- **Comentários corrigidos:** o offset do instante devolvido depende do
  `TimeZone` da sessão do PostgreSQL, não de uma regra da API (verdade na
  época; deixou de ser quando a pendência 27 fixou a sessão em UTC); o motivo de o
  `scripts/e2e-env.sh` não repetir a URL é fonte única, não sigilo; o "de 5"
  do frontend nomeia a constante do backend que ele espelha.
- **Documentação:** `docs/ARCHITECTURE.md` (os três casos do `/ready`, o 307
  da barra final, as faixas novas), `docs/QUALITY.md` §6 (onde mora e como é
  testada a guarda de `.env` do `pre-push`) e este arquivo.

## Alterações do Incremento 1b-1

Commits `023d251`..`9fb9a8e` (15), backend só (a tela e o E2E são do 1b-2):

- **Configuração e guarda (Task 1):** seis campos novos em `Settings`
  (`anthropic_api_key`, `anthropic_base_url`, `tutor_model`,
  `tutor_max_tokens`, `tutor_timeout_seconds`, `tutor_history_messages`),
  `env_ignore_empty=True`, seis linhas novas no `.env.example`; a fixture de
  sessão `tests/conftest.py` que aponta o provedor para uma porta fechada
  durante a suíte inteira.
- **Domínio, migração e modelos (Task 2):** `tutoring/domain.py` (quatro
  enums, `validar_transicao_da_acao`); a migração `0002` com
  `tutor_messages` e `tutor_actions`, sete `CHECK`, dois índices únicos
  parciais e duas `UniqueConstraint`; `tutoring/models.py` espelhando a
  migração byte a byte (`test_o_modelo_descreve_os_mesmos_checks_que_a_migracao`).
- **O servidor falso (Task 3):** `tests/integration/provedor_falso.py`,
  construído com os tipos do SDK `anthropic`; o teste de contrato que roda o
  SDK real contra ele; a fixture `falso`. Camadas 1 e 2 de `docs/QUALITY.md`
  §9.
- **O provedor e o adaptador (Task 4):** `tutoring/provider.py` (o
  `Protocol`), `tutoring/anthropic_provider.py` (o adaptador, timeouts
  duplos de M4, `input_schema` sem a docstring de M8), `tutoring/persona.py`
  (o prompt da Tifa, testado contra as seis exigências do README §5/§6, não
  só por cobertura), `tutoring/context.py` (monta o turno, funde histórico).
- **O serviço da conversa (Task 5):** `tutoring/service.py` —
  `preparar_turno`, `transmitir`, `listar_mensagens`, o recolhimento do
  órfão, o limite total pelo relógio (M5), a trava do usuário antes de
  gerar (`uq_tutor_messages_uma_gerando_por_usuario`, mutação 5/5).
- **Confirmar e recusar (Task 6):** `confirmar_acao` e `rejeitar_acao`, com
  `SELECT ... FOR UPDATE` na ação, o prazo expirado gravado antes do 422, e
  a corrida confirmar-x-recusar provada por teste real (5/5 de detecção).
- **As rotas e o SSE (Task 7):** as cinco rotas de `/api/tutoring`;
  `tutoring/sse.py` (`evento_sse`, `fechando_ao_cancelar`); a desconexão
  provada com uvicorn real (M9); os quatro `CodigoDeErro` e handlers novos
  em `main.py`; `anyio` como dependência direta.
- **Documentação (Task 8):** a seção "Emendas" da spec; `docs/ARCHITECTURE.md`
  (o módulo `tutoring` de contrato para existente); `docs/QUALITY.md` §9 (o
  servidor falso); este arquivo. As docstrings de produção de `sse.py` e
  `router.py` perderam o histórico forense (números de rodada de correção,
  datas de medição); o que elas mediam está registrado aqui, nas seções
  acima e na emenda M1 da spec. Commit `130958c`.
- **Onda final de correção da revisão da branch (`9fb9a8e`):**
  `context._mensagens` descarta a mensagem sem texto antes de fundir papéis
  (uma `completa` vazia quebraria toda resposta seguinte: a API recusa
  mensagem sem conteúdo); `service.transmitir` move o `yield PerguntaGravada`
  para dentro do bloco guardado, e fechar o gerador nesse `yield` passa a
  gravar `interrompida`; comentário de `FOLGA_DO_ORFAO` corrigido;
  `Conversa.mission_ids` removido do `conftest` (morto); a frase do
  `docs/ARCHITECTURE.md` §3 sobre os valores de `role`/`status`/`state`
  corrigida; a contagem de commits de correção (cinco), o trailer
  `Co-Authored-By` e as pendências 45 a 48 registrados aqui.

## Alterações do Incremento 1b-2

Criada na Task 1 e completada na Task 9 (plano
`docs/superpowers/plans/2026-09-22-incremento-1b-2.md`):

- **Task 0** — correção do registro do 1b-1 e abertura da revisão-base do
  1b-2 (commit `3cc176a`): o parágrafo do 1b-1 em "Revisão-base" passou a
  contar os **15** commits reais (`023d251`..`9fb9a8e`, medidos com
  `git log --oneline c7a91a5..9fb9a8e`) e o estado "publicado pelo PR #10,
  mesclado por merge commit em `a795ee7`" (registro anterior dizia "não
  publicado" e contava 13, até `880dd60`); a revisão-base do 1b-2 foi aberta
  a partir de `a795ee7`; e o plano deste incremento entrou no repositório.
- **Task 1** — `postStream` (commit `44e7ab2`): as três formas de terminar
  (erro antes do stream como `ApiError` idêntico ao do `postJson`, eventos
  entregues um a um, e falha de leitura no meio como `ApiError` com o
  `status` da resposta e `code` `null`); `open` passou a ser o único `fetch`
  do cliente (`frontend/src/shared/api/client.ts`);
  `frontend/src/test/sse.ts` (helpers de quadro e de corpo SSE para os
  testes). Um teste além dos que o plano listava — "ignora linhas que nao
  sao event nem data, como comentario e id do SSE" — foi acrescentado para
  fechar a ramificação do `parseFrame` que descarta essas linhas.
- **Task 2** — tipos da tutoria e os dois mapas exaustivos de falha (commit
  `3cee94d`, o que traz os cinco arquivos de
  `frontend/src/features/tutoring/`): `types.ts` com o contrato da API e os
  três tipos de `code` — `PreStreamErrorCode` (falha antes de o stream
  abrir), `StreamErrorCode` (evento `error` do stream) e `ActionErrorCode`
  (confirmar/recusar); `messageFailure.ts` com os mapas `PRE_STREAM` e
  `IN_STREAM` (`describePreStreamFailure`, `describeStreamFailure`, o
  genérico `UNKNOWN_RESULT` e o 422 sem `code` que pede edição);
  `actionFailure.ts` com o mapa `BY_CODE` (`describeActionFailure`). `Record`
  sobre a união (um `code` novo reprova o `tsc`) e `Object.hasOwn`, no
  padrão de `features/missions/completionFailure.ts`. Na mesma leva, só
  comentários: `describeStreamFailure` passou a dizer que a falha já foi
  encerrada pelo backend como `falhou`, **ou** `interrompida` quando a
  resposta é recolhida como órfã (que emite `tempo_esgotado`,
  `tutoring/service.py`) — o plano foi corrigido junto; o comentário do
  teste extra da Task 1 deixou de sugerir que um `: keepalive` isolado é
  aceito; e os comentários de `client.ts` e `src/test/sse.ts` citam o
  caminho completo `src/focusquest/modules/tutoring/sse.py`.
- **Task 3** — hooks da tutoria (commit `1f41dde`). Em
  `frontend/src/features/tutoring/`: `useTutorStatus.ts` (disponibilidade da
  Tifa, com `error` separado de `unavailable`); `useTutorConversation.ts`
  (histórico, rascunho, envio pelo `postStream`, reenvio idempotente e a
  união `SendState` com `idle`/`sending`/`writing`/`failed`/`unknown`);
  `conversationHistory.ts` (`appendTurn`, `settleInterrupted`,
  `pendingFromHistory`, `replaceAction`); `questionLimit.ts`
  (`MAX_QUESTION_LENGTH`, `COUNTER_VISIBLE_FROM`, `describeQuestionLength`);
  e os testes de cada um. **`frontend/src/test/fetchRoutes.ts`** (`routeFetch`,
  `requestsTo`, `jsonBody`): um `fetch` falso roteado por método e URL que
  constrói um `Response` **novo** a cada chamada — existe porque um
  `Response` não serve duas chamadas (o corpo é consumido na primeira
  leitura, e a segunda explode com "Body is unusable"), e com o painel a
  página busca três recursos na montagem; uma chamada sem rota rejeita com
  a chave na mensagem. **Ajustes feitos no worktree, relatados como
  necessários para chegar a 100% sem exclusão** (descritos aqui pela
  diferença entre a tabela de casos do plano e o teste final): o S2 parte de
  um histórico não vazio (`[q1, a1]`) e confere `messages` igual a
  `[q1, a1, q10]` com o `history` intacto; o S17 confere também que o
  histórico não é pedido de novo depois do abort; e o caso novo **S27**
  (`o error que chega com a conversa recarregando nao inventa lista`)
  cobre a falha no meio do stream com uma recarga em curso — nem a resposta
  provisória nem a atualização silenciosa escrevem por cima dela.
  **Correções da revisão:** (1) caso novo para o `&& !needsNewId` do
  `submit` (depois de um 409 `operacao_reutilizada`, o **Enviar** com o
  mesmo texto manda id novo); (2) caso novo para o `history.status ===
  'loaded'` do `canSubmit` (histórico em erro não envia); (3) as guardas
  `!controller.signal.aborted` dos dois hooks ganharam um caso sob
  `StrictMode` (padrão de `useMissions.test.tsx`), com o segundo pedido
  segurado para o `error` aparecer se fosse escrito — as asserções de
  `result.current` depois do `unmount()` (H3, S17 e o caso de desmontagem
  do `useTutorStatus`) foram retiradas, porque o React descarta o setState
  de um componente desmontado e elas não podiam dizer NÃO; (4) o contador
  de geração do histórico (Decisões), com dois casos novos — a atualização
  silenciosa lenta que chega depois do `done`, e o `done` com uma recarga
  em voo — e o comentário do `done`, que afirmava que a recarga em voo "já
  traz esta pergunta e esta resposta" (ela saiu antes do `done`), corrigido;
  (5) o `code` desconhecido no evento `error` **não** foi mudado: o
  `describeStreamFailure` devolve o próprio `UNKNOWN_RESULT` para ele, e o
  `messageFailure.ts` não tem texto genérico de falha — ficou como
  pendência 49; (6) um caso sob `StrictMode` prova que o envio sai com o
  sinal **não** abortado (o controlador é um por montagem). **Mutações
  vistas reprovando nesta revisão:** sem `&& !needsNewId` (reprova o caso
  do `operacao_reutilizada` no Enviar); sem o termo `history.status ===
  'loaded'` (reprova "com o historico em erro, nao envia"); sem a guarda
  `aborted`, em cada hook (reprova o caso do StrictMode com `error` no lugar
  de `loading`); controlador criado uma vez com `??=` (reprova "no
  StrictMode, o envio sai com o sinal vivo"); sem o incremento da geração
  no `done` e sem a conferência da geração na atualização silenciosa
  (reprova o GET lento, `[10, 11]` no lugar de `[10, -1, 12]`); sem a
  recarga pedida pelo `done` (reprova o S21 e o caso da recarga em voo);
  sem a conferência da geração na recarga (reprova o caso da recarga em
  voo); sem o espelho do status (reprova seis casos); e sem o retorno
  `aborted` do `runTurn` (reprova o S17 pela contagem do histórico).
- **Task 4** — o painel da Tifa (commit `6d7b15a`). Em
  `frontend/src/features/tutoring/`: `TutorPanel.tsx` e
  `TutorConversation.tsx`, com dois contêineres — lateral expansível no
  desktop e folha modal no celular — e a região viva **fora** dos dois
  contêineres, existindo desde o primeiro render (padrão do A e do 1a: uma
  região viva que só nasce quando algo teria que anunciar chegaria tarde
  demais para o primeiro anúncio). `useIsDesktop.ts`
  (`useSyncExternalStore` sobre `(min-width: 1024px)`, o breakpoint `lg` do
  Tailwind — e não `useState`/`useEffect`, que piscaria o layout errado no
  primeiro render antes de corrigir) e `panelPreference.ts`
  (`PANEL_OPEN_KEY = 'focusquest.tutor-panel.open'`, `readPanelOpen` e
  `writePanelOpen` tolerantes a um `localStorage` que lança — navegação
  privada, armazenamento bloqueado, cota estourada — degradando para painel
  sempre aberto sem quebrar a página). `frontend/src/test/viewport.ts`,
  infraestrutura de teste para simular desktop/celular via `matchMedia`.
  `frontend/index.html` ganhou `lang="pt-BR"` e
  `interactive-widget=resizes-content` na viewport (o campo não fica atrás
  do teclado virtual no celular). O teste da página (`Headquarters.test.tsx`)
  mudou de "1 chamada" para "uma chamada por recurso, 3 no total" —
  justificado porque o painel busca o próprio recurso (disponibilidade da
  Tifa) na montagem, além dos dois que a página já buscava. `App.test.tsx` e
  `main.test.tsx` passaram a usar `routeFetch` (de
  `frontend/src/test/fetchRoutes.ts`, criado na Task 3) e `stubViewport`,
  porque a página com o painel monta mais de um recurso e mais de um layout.
  **Comportamento:** o filtro `visibleMessages` descarta a linha `gerando`
  da resposta em voo quando o histórico recarrega (evita bolha duplicada
  depois da recarga, teste P31); com o campo desabilitado ao abrir a folha,
  o foco de reserva vai para "Fechar a conversa" (P22b); e o P30b prova a
  guarda `|| !canRetry` montando `TutorConversation` sozinho, direto, porque
  esse estado não é alcançável pelo painel — o dono pode decidir remover a
  guarda por redundante. **Mutações vistas reprovando no worktree:** região
  viva dentro do corpo do painel (P21); `liveText` só com o texto final, sem
  o parcial em voo (P10/P11); `readPanelOpen` sem o `try/catch` (o teste que
  simula `localStorage` lançando); sem tratador de `Escape` na folha (P23);
  textarea sempre habilitado, nunca desabilitado (P6-P8, P22b); a marca do
  resultado `unknown` (P14); `|| !canRetry` (P30b); `&& canRetry` (P30); o
  filtro da linha `gerando` (P31); e o foco de reserva em "Fechar a
  conversa" (P22b).
- **Task 5** — o cartão de proposta, Confirmar e Recusar, e a recarga do
  quadro (commit deste registro). Em `frontend/src/features/tutoring/`:
  `ProposalCard.tsx`, um ramo por estado da acao (`proposta`, `executada`,
  `recusada`, `falhou`) com o tipo de retorno declarado no `Outcome`, para o
  `tsc` reprovar se um estado novo ficar sem ramo (a mesma tecnica de
  `MissionList.tsx`); `useActionKeys.ts`, as chaves de confirmacao **por
  acao**, criadas no **topo do `TutorPanel`** — e nao no cartao — porque a
  recarga da conversa remonta os cartoes, e uma chave viva ali morreria
  (pendencia 35); o `operation_id` nasce no primeiro clique e so sai do mapa
  em `release`. `useDecideAction.ts`: o clique vai direto ao backend, sem
  passar pelo modelo (decisao D2 da spec); a chave **fica** numa falha que se
  repete (`recovery: 'retry'` — rede, 5xx, erro sem `code`), **troca** só no
  `operacao_reutilizada` (`retry-with-new-operation`) e **sai** no sucesso e
  em toda falha que nao se repete com ela; `prazo_expirado` espelha
  `state: 'falhou'` e `error_code` direto no `changed`, sem nova ida a rede,
  porque o backend ja gravou a acao como `falhou` antes do 422. Em
  `frontend/src/features/missions/MissionList.tsx`: a interface
  `MissionListHandle` (`{ reload: () => void }`) e
  `useImperativeHandle(ref, () => ({ reload: requestReload }), ...)` — o
  `requestReload` do `useCompletionRegistry`, e nao o `reload` cru do
  `useMissions`, para a recarga pedida **de fora** (pela pagina) tambem
  esperar uma conclusao em voo, como o "Atualizar o quadro" do Incremento A.
  `frontend/src/pages/Headquarters.tsx` passa o `ref` e chama
  `board.current!.reload()` em `onMissionCreated`, e passa `boardHref`
  (`"#missions-heading"`) ao `TutorPanel` — a pagina e quem conhece as duas
  features, nenhuma das duas conhece a outra. `frontend/src/shared/lib/deadline.ts`
  ganhou `deadline.test.ts` proprio: o teste de unidade do fuso (o instante em
  que SP e UTC caem em dias diferentes, processo fixado em `Asia/Tokyo`) saiu
  de `MissionList.test.tsx` para lá, e em `MissionList.test.tsx` ficou só o
  caso "o cartao mostra o prazo pelo formatador de America/Sao_Paulo", que
  prova que o CARTAO usa aquele formatador (nao um formatador local). **O "5"
  de "de 5"** em `ProposalCard.tsx` é a terceira cópia declarada de
  `DIFICULDADE_MAXIMA` (pendência 32), a mão — as outras duas em
  `missions/types.ts` e `missions/MissionList.tsx`; `tutoring/` não importa
  de `missions/` (`docs/ARCHITECTURE.md` §5, regra 1). **Mutações vistas
  reprovando no worktree:** a chave gerada com `crypto.randomUUID()` direto,
  sem passar por `keys` (D2); `keys.release(action.id)` incondicional no
  `.catch` (D2, reprova o caso em que a chave deveria ficar num `retry`); sem
  o `keys.release(action.id)` do `.then` (D9, a chave de sucesso vazaria para
  a proxima confirmacao); `useImperativeHandle` com `({ reload })` — o
  `reload` cru do `useMissions` — no lugar de `requestReload` (reprova o
  teste do `ref` em `MissionList.test.tsx` e Q2, a recarga pedida de fora nao
  esperando a conclusao em voo); sem o `changed({ ...action, state: 'falhou',
  ... })` no ramo `expired` de `useDecideAction` (D4); `onMissionCreated={()
  => undefined}` em `Headquarters.tsx` no lugar de `reloadBoard` (Q1, Q2).
- **Task 6** — infraestrutura do E2E da tutoria (commit `342a6e3`). **O falso
  configurável:** em `tests/integration/provedor_falso.py`, `_Tratador`
  virou `TratadorDoFalso` (público, porque outro módulo o estende), a
  função `falso_do_tratador` substituiu o `assert` inline do `do_POST`, e o
  `ServidorAnthropicFalso` ganhou `porta` (padrão 0) e `tratador` (padrão
  `TratadorDoFalso`) — com os padrões, o pytest não muda, o que os testes do
  1b-1 em `test_provedor_falso.py` confirmam. **O processo e o controle:**
  `tests/integration/falso_do_e2e.py` (`python -m integration.falso_do_e2e
  --porta N`, com `PYTHONPATH=tests`) sobe o **mesmo** falso com as rotas
  `PUT /_control/script`, `POST /_control/release`, `POST /_control/reset` e
  `GET /_control/requests`, e 404 em qualquer outra rota de `GET`, `PUT`
  ou `POST` que não seja `/v1/messages` (outro método: 501, ver a correção
  abaixo); `roteiro_do_json` traduz o roteiro JSON do cenário e
  recusa, com o motivo, chave desconhecida e tipo errado. O contrato é
  provado do lado Python por `tests/integration/test_falso_do_e2e.py` (18
  testes, dois deles subindo o processo de verdade). **A guarda e a
  chave:** `scripts/e2e-env.sh` recusa subir a API do E2E se o host do
  `anthropic_base_url` não for loopback, e exporta
  `FOCUSQUEST_ANTHROPIC_API_KEY=e2e-chave-ficticia` por cima de qualquer
  chave do ambiente ou do `.env`; `tests/integration/test_e2e_env.py` ganhou
  10 testes (cinco endereços recusados, o padrão sem variável recusado, três
  loopbacks aceitos, a chave imposta). **O terceiro `webServer`:**
  `frontend/playwright.config.ts` sobe o falso na 8150 antes da API e passa
  `FOCUSQUEST_ANTHROPIC_BASE_URL: FALSO_URL` ao `webServer` da API;
  `FALSO_URL` mora em `frontend/tests/e2e/servers.ts`; o cliente do
  controle, `frontend/tests/e2e/falso.ts` (`definirRoteiro`, `liberar`,
  `reiniciar`, `requisicoes`), ainda não tem consumidor — os cenários são a
  Task 7. **Mutações vistas reprovando**, as seis do plano: (1) guarda por
  nome (`host == "api.anthropic.com"`) reprova em `https://api.anthropic.com.`,
  `http://127.0.0.1.nip.io:8150` e `http://192.168.0.10:8150`; (2) a API do
  E2E apontada para `'https://api.anthropic.com'` no `playwright.config.ts`
  faz o `make check-e2e` sair com erro antes de qualquer cenário, com o texto
  exato `[WebServer] recusando subir a API do E2E com o provedor em
  'api.anthropic.com'; o E2E so fala com o servidor falso em loopback --
  confira FOCUSQUEST_ANTHROPIC_BASE_URL (o playwright.config.ts a define)`
  seguido de `Error: Process from config.webServer was not able to start.
  Exit code: 1`; (3) sem o `export` da chave, reprova
  `test_impoe_a_chave_ficticia_mesmo_com_uma_chave_no_ambiente`; (4) sem a
  checagem de chaves desconhecidas, reprova o caso `chave desconhecida:
  fantasia` (`DID NOT RAISE`); (5) com `super().do_POST()` no lugar do 404,
  reprova `test_rota_desconhecida_responde_404` (`200 == 404`); (6) sem o
  `liberar.set()` do reset, reprova `test_reset_solta_uma_resposta_presa`
  (`terminou.wait` devolve `False`).
- **Correções da revisão da Task 6** (commit `d8461e7`). **A corrida do reset:**
  o tratador do falso lia o `falso.liberar` só na hora de esperar, e o
  roteiro no início; um `POST /_control/reset` entre as duas leituras o
  deixava esperando no `Event` novo, com o roteiro velho mandando segurar —
  preso até o teto de 30 s. Agora `TratadorDoFalso.do_POST` captura
  `liberar` e `roteiro` juntos (`liberar` primeiro) e espera no capturado, e
  o reset troca o roteiro **antes** do `Event` (quem capturar o `Event` novo
  captura também o roteiro vazio); no pytest do 1b-1 o `Event` nunca é
  trocado. Reproduzida de forma determinística por
  `test_reset_entre_o_registro_e_a_espera_solta_o_tratador`: o roteiro pede
  `atrasar_cabecalhos` e o `time` do falso é trocado (monkeypatch) por um que
  segura o tratador na janela até o teste fazer o reset — vermelho no código
  anterior, verde com a correção. `test_reset_solta_uma_resposta_presa`
  passou a esperar o **primeiro pedaço de texto** no cliente, e não
  `recebidas` (registrada antes do ponto de espera).
  `test_segurar_e_liberar_pelo_controle` agora **prova** que o stream estava
  preso: o pedaço seguinte não chega em 0,5 s antes do `release`. **O
  controle:** `PUT` sem `content-length` responde 400 com `{"error": ...}`
  (antes, `TypeError` fora do `try` e a conexão caindo sem resposta), e a
  conexão fecha depois de qualquer 400; `PUT` em rota errada tem teste do
  404; `cut_after_events`/`hold_after_events` fora de 0–1000 e `http_status`
  fora de 100–599 são recusados com 400 (bordas aceitas também testadas).
  **Texto:** o motivo das guardas no `scripts/e2e-env.sh`, nas docstrings de
  `test_e2e_env.py` e na decisão acima diz agora que a chave real mora no
  Keychain (D-a) e que a guarda protege contra uma chave no ambiente ou no
  `.env` por engano e contra o `pre-push`. **Mutações vistas reprovando**
  (backup em `/tmp`, restauradas por `cp`): esperar no `falso.liberar` do
  momento reprova o teste da corrida (`terminou.wait` devolve `False`);
  trocar o `liberar.wait` por `pass` reprova
  `test_segurar_e_liberar_pelo_controle` (`DID NOT RAISE Empty`); tirar o
  `liberar.set()` do reset reprova `test_reset_solta_uma_resposta_presa`;
  tirar a conferência do `content-length` reprova o teste do 400
  (`RemoteDisconnected`); tirar a conferência de rota do `PUT` reprova o do
  404 (`204 == 404`); tirar a faixa de `_inteiro` reprova os cinco casos
  fora da faixa (`DID NOT RAISE`); teto exclusivo (`<` no lugar de `<=`)
  reprova as duas bordas; um `do_DELETE` com 404 reprova o teste do 501.
  **Não coberto por teste:** a ordem "roteiro antes do `Event`" no reset —
  a janela fica entre duas atribuições consecutivas e não há como segurá-la
  sem gancho no código; o motivo está no comentário do reset.
- **Task 7** — cenários E2E da tutoria (commit `73b6e17`):
  `frontend/tests/e2e/tutoring.spec.ts`, cinco cenários contra o navegador
  real, a API real, o banco real e o servidor falso como processo, com o
  falso reiniciado antes de cada um. **(a)** perguntar, ver o texto chegar,
  confirmar e ver a missão no quadro: o falso segura a resposta depois do
  primeiro pedaço (`hold_after_events: 3`), e com ela presa o cenário vê o
  parcial, a região viva em "Tifa está escrevendo…", o campo limpo pelo
  `user_message` e o axe sem violação; depois do `liberar()`, o cartão da
  proposta, "Tifa terminou de responder." e o axe de novo; confere que a API
  fez **uma** requisição ao falso, com a chave **fictícia**; o Confirmar
  mostra "Missão criada" e o quadro recarrega sozinho, pela página, com a
  missão nova. **(b)** recusar: o cartão fica "Proposta recusada", sem
  botões, o servidor grava `recusada` e nenhuma missão nasce. **(c)** o corte
  vindo do falso (`cut_after_events: 3`, sem `message_stop`): a resposta
  cortada fica na tela marcada "Resposta com falha", o `alert` avisa, e o
  "Tentar de novo" produz a resposta inteira sem duplicar a pergunta — na
  tela (uma pergunta) e no servidor (uma pergunta, respostas `falhou` e
  `completa`, duas requisições ao falso). **(d)** indisponível (emenda E4,
  por `page.route` sobre `GET /api/tutoring/status`): o texto literal da
  spec, campo e Enviar desabilitados, o quadro mostrando uma missão semeada
  por HTTP, o axe sem violação e zero requisições ao falso. **(e)** celular
  (emenda E5, acréscimo aos quatro da spec, porque o README §7 exige o
  layout no celular e o jsdom não tem layout): 390×844 com toque, a folha
  abre pelo botão fixo, sem rolagem horizontal antes e depois, com o Enviar
  dentro da viewport, o axe sem violação com a folha aberta, e o Esc fecha
  a folha e devolve o foco ao botão. O axe roda com o conjunto **padrão** de
  regras. **Desvio do plano no cenário (c):** os textos que o falso devolve
  (`Começo…` e a resposta inteira) passaram a carregar o sufixo `EXECUCAO`,
  como a regra 2 do próprio plano manda. **Medido:** com o texto do plano,
  a segunda execução seguida de `make check-e2e` reprovou em (c) com
  `strict mode violation` — o localizador `hasText: 'Começo'` resolveu para
  duas linhas, a cortada desta execução e a da anterior (a conversa é uma só
  e a tela mostra até 50 mensagens). Pior que a reprovação era a aprovação
  da primeira execução do dia seguinte: a asserção da marca e o
  `toHaveCount(1)` da resposta inteira casariam com as linhas **velhas**
  antes de o corte e o reenvio desta execução acontecerem. **Nenhum defeito
  de produção** apareceu: os 11 cenários passaram na primeira execução, e a
  hipótese do plano sobre buffer no proxy do `vite preview` não se
  confirmou — (a) viu o parcial antes do `liberar()`. **Mutações vistas
  reprovando** (backup em `/tmp/fq-mutacao-t7.bak`, restauradas por `cp`,
  cada uma pelo `make check-e2e`, que refaz o build): (1) a chave imposta
  pelo `scripts/e2e-env.sh` trocada por `e2e-outra-chave` reprova (a) em
  `toBe('e2e-chave-ficticia')` (`Received: "e2e-outra-chave"`); (2) a
  recarga do quadro desligada reprova (a) no `toHaveCount(1)` do quadro
  (`Received: 0`) — **forma ajustada:** a troca do plano,
  `onMissionCreated={() => undefined}`, não compila (`TS6133: 'reloadBoard'
  is declared but its value is never read`, `noUnusedLocals`), e a mutação
  aplicada foi o corpo do `reloadBoard` sem o `board.current!.reload()`,
  mesma semântica; (3) o `retry` sempre com `clientMessageId` novo reprova
  (c) com duas perguntas na tela (`toHaveCount(1)` recebe 2); (4) o
  `textarea` com `disabled={false}` reprova (d) em `toBeDisabled()`; (5) um
  filho largo no `<main>` reprova (e) em `semRolagemHorizontal()`
  (`Received: false`) — **forma ajustada:** a troca do plano, `<div
  style={{ width: 600 }} />`, **passou** (EXIT 0, 11 aprovados); medido na
  página construída, a div tinha 600 px de largura e o `scrollWidth`
  continuava 390, porque uma caixa de altura zero não entra no overflow
  rolável do Chromium. Com `{ width: 600, height: 10 }` o cenário reprova.
  O defeito era da mutação, não do cenário.
- **Task 8, Step 1** — regressão: as guardas contra a Anthropic valem mesmo
  com a chave exportada no ambiente do shell (commit deste registro). Em
  `tests/unit/test_config.py`,
  `test_a_guarda_vale_com_a_chave_exportada_no_ambiente` põe
  `FOCUSQUEST_ANTHROPIC_API_KEY` no ambiente (via `monkeypatch.setenv`) e
  confere que `Settings().anthropic_base_url` continua
  `http://127.0.0.1:9` — a guarda de sessão de `tests/conftest.py` não
  depende de a chave estar ausente, só do `base_url`. Aproveitado para
  corrigir a documentação que ainda dizia que a chave real mora no `.env`
  do dono, contradizendo a decisão D-a (Keychain do macOS, emenda E1): os
  docstrings de `tests/conftest.py` e de
  `test_a_suite_nunca_aponta_para_a_anthropic` em
  `tests/unit/test_config.py`, e a pendência 42 abaixo. **Mutação vista
  reprovando** (backup em `/tmp/fq-mutacao-t8a.bak`, restaurado por `cp`):
  trocar o `ambiente.setenv(...)` da guarda de sessão por `pass` (mantendo
  o `yield`) reprova `test_a_guarda_vale_com_a_chave_exportada_no_ambiente`
  (e também `test_a_suite_nunca_aponta_para_a_anthropic`) em
  `AssertionError: assert 'https://api.anthropic.com' ==
  'http://127.0.0.1:9'` — o endereço real volta a vazar do `.env` assim
  que a guarda para de sobrescrevê-lo.
- **Task 8, Steps 2–8** — a chave no Keychain, a chamada real e a camada 3
  do servidor falso:
  - **`tests/integration/camada3.py`** (novo): `sequencia_de_tipos`,
    `comparavel`, `DESCARTADOS_PELO_SDK` (`ping`), `capturar` e `main`, que
    recusa gravar se o `anthropic_base_url` não for `api.anthropic.com` ou
    se não houver chave. **Desvio do plano:** o sistema da requisição é o
    de `montar_turno(persona=PERSONA, agora=..., pendentes=[],
    historico=[]).sistema` — persona e contexto, com o quadro vazio —, e
    não o `f"{PERSONA}\n\nAgora (UTC): ..."` do pseudocódigo: é o texto que
    a produção de fato manda, e a captura quer se parecer com ela.
  - **`tests/integration/test_camada3.py`** (novo): os seis testes do
    plano, sem mudança de expectativa.
  - **`tests/integration/referencia_da_api_real.json`** (novo): gravado
    pelo script, uma vez, pela chamada real; nunca editado à mão.
  - **`tests/integration/provedor_falso.py`**: `Roteiro.pensar: bool = True`
    e o bloco de thinking antes dos blocos do roteiro, no índice 0, com os
    tipos do SDK fixado (`ThinkingBlock(thinking="", signature="")`,
    `ThinkingDelta`, `SignatureDelta`, `content_block_stop`); os blocos do
    roteiro passam a começar no índice 1. Constantes novas: `PENSAMENTO`
    (o texto do thinking, para o teste de vazamento),
    `EVENTOS_DO_PENSAMENTO` (calculado, 4) e `APOS_O_PRIMEIRO_PEDACO`
    (`EVENTOS_DO_PENSAMENTO + 3`, isto é, 7). O controle do E2E
    (`roteiro_do_json`) **não** expõe a opção: nenhum cenário precisa dela.
  - **Teste novo** `test_o_thinking_da_api_nao_chega_ao_dominio`
    (`tests/integration/test_anthropic_provider.py`, parametrizado com só
    texto e com texto e proposta): o adaptador de produção entrega
    exatamente os mesmos `Delta`/`Proposta`/`Fim` com e sem o thinking, e o
    `PENSAMENTO` não aparece no que ele entrega; uma checagem prova que o
    falso padrão emitiu mesmo o thinking, para o teste não passar vazio.
  - **Guarda nova** `test_o_e2e_segura_e_corta_no_mesmo_ponto_que_o_pytest`
    (`tests/integration/test_falso_do_e2e.py`): o spec TypeScript escreve o
    7 literal (não importa Python), e a guarda confere que ele é igual a
    `APOS_O_PRIMEIRO_PEDACO`.
  - **Índices ajustados** (de 3 para `APOS_O_PRIMEIRO_PEDACO`, 7, cada um
    com comentário). O 3 queria dizer "depois do primeiro pedaço de
    texto" (`message_start`, `content_block_start`, primeiro delta); com os
    4 eventos do thinking na frente, cairia dentro do thinking. Consequência
    direta de o falso ficar mais fiel, não acomodação de defeito:
    `test_anthropic_provider.py::test_stream_cortado_termina_sem_fim_e_sem_erro`
    (corte) e `::test_demora_no_meio_vira_tempo_esgotado` (atraso);
    `test_tutoring_service.py::test_stream_cortado_sem_fim_vira_provedor_indisponivel`
    (corte) e `::test_demora_no_meio_vira_tempo_esgotado_com_o_texto_parcial`
    (atraso);
    `test_tutoring_desconexao.py::test_desconectar_no_meio_grava_interrompida`
    (segurar); `test_falso_do_e2e.py::test_reset_solta_uma_resposta_presa`
    e `::test_segurar_e_liberar_pelo_controle` (`hold_after_events`);
    `::test_reset_entre_o_registro_e_a_espera_solta_o_tratador` — este não
    reprovava (o 3 ainda segurava, só que dentro do thinking), ajustado
    para o mesmo ponto dos outros; e `frontend/tests/e2e/tutoring.spec.ts`,
    `hold_after_events: 7` no cenário (a) e `cut_after_events: 7` no (c).
    Os números de `test_roteiro_do_json_*` e `test_as_bordas_*` não mudam:
    ali eles só testam a validação, não uma posição no stream.
  - **Expectativa da camada 2 atualizada** em 3 testes, porque a `Message`
    que o SDK monta do falso padrão agora tem o bloco `thinking` na frente
    (decisão do coordenador, opção (A); ver "Decisões"):
    `test_provedor_falso.py::test_o_sdk_monta_texto_e_tool_use_do_stream_do_falso`
    e `test_falso_do_e2e.py::test_o_roteiro_definido_pelo_controle_chega_ao_sdk`
    (`pensamento, texto, ferramenta = final.content`, com
    `pensamento.type == "thinking"`), e
    `test_provedor_falso.py::test_sem_ferramenta_a_resposta_termina_em_end_turn`
    (`["thinking", "text"]`). Sem essa mudança, os três reprovavam com
    `too many values to unpack (expected 2, got 3)` e
    `['thinking', 'text'] != ['text']`.
  - **`src/focusquest/` não mudou.**
  - Documentação: a spec (E2/E3 feitas, emenda nova E6), `docs/QUALITY.md`
    §9 ("Camada 3" existente), a árvore de testes do `docs/ARCHITECTURE.md`,
    e duas correções no plano (a contagem do `-k` do Step 5 e o motivo real
    da mutação 2 do Step 7).

## Alterações do Incremento B

Plano em `docs/superpowers/plans/2026-09-25-incremento-b.md`. Todas as
Tasks 0–9 estão comitadas em `feat/incremento-b`
(`git log --oneline 12288a2..HEAD`): backend nas Tasks 0–5 (`3544344` até
`6b42962`, o fix round da Task 5), `check-e2e` de esquema limpo na Task 6
(`50e2150`), frontend do ciclo nas Tasks 7–8 (`242d677`, `08b3dcc`) e o E2E
do ciclo na Task 9 (`0b9197b`). Depois da Task 9: a documentação da Task 10
(`5cd4474`) e o conserto final da revisão da branch, em dois commits —
backend/E2E (`5d250b3`) e frontend (`71a2001`, HEAD) — descritos abaixo.

- **Task 0** — revisão-base no Linux e o plano deste incremento
  (commits `12288a2`..`3544344`): primeira sessão nesta máquina Linux, o
  repositório religado por clone sem checkout, `make check` na base sem
  mudança aprovado; as nove "Interpretações a confirmar" da spec marcadas
  como confirmadas pelo dono em 2026-09-25.
- **Task 1** — o domínio puro do ciclo (commit `b9bc937`):
  `tzdata==2026.4` acrescentado (`uv add`); `domain.py` ganhou `MissionType`
  (`avulsa`/`diaria`/`especial`), `DIFICULDADE_DA_ESPECIAL = 5`,
  `MULTIPLICADOR_DA_ESPECIAL = 3` e `xp_da_missao`; criado
  `cycle_domain.py` — `FUSO_DO_CICLO`, `DIAS_DA_SEMANA`, `DIAS_POR_MARCO`,
  `MINUTOS_DO_DIA`, `Availability`, `NAO_CONCLUIVEIS`, `DiaDoPlano`,
  `Historico` e as funções puras de dia, semana, disponibilidade da diária,
  sequência, marco e disponibilidade/janela da especial. `tests/unit/test_cycle_domain.py`
  criado, 47 casos; as 7 mutações do brief aplicadas, vistas reprovando e
  restauradas.
- **Task 2** — migração `0003_ciclo_diario` e modelos (commits
  `b9bc937`..`b233a84` + fix `dabc674`): tabela `weekly_plans`
  (`id`, `user_id`, `week_start`, `created_at`, com
  `uq_weekly_plans_user_id_week_start`, `uq_weekly_plans_id_user_id` e
  `ck_weekly_plans_week_start_segunda`); `missions` ganhou `mission_type`,
  `plan_id`, `day`, e `deadline` virou nulável, com seis `CHECK` novos
  (`ck_missions_mission_type`, `ck_missions_plano_do_tipo`,
  `ck_missions_dia_do_tipo`, `ck_missions_prazo_do_tipo`,
  `ck_missions_dificuldade_da_especial`, `ck_missions_estimativa_do_ciclo`),
  a FK composta `fk_missions_plano_do_usuario` (MATCH SIMPLE, deixa a
  avulsa sem plano passar) e `uq_missions_plan_id_day` +
  `uq_missions_especial_por_plano` (índice único parcial). `models.py`
  ganhou `MissionTypeText` e `WeeklyPlan`, com as mesmas restrições
  nomeadas no `__table_args__`. `criar_missao` passou a gravar
  `mission_type=AVULSA`. Criado `cycle_service.py` (**só** `MissaoLida`,
  `dia_da_diaria`, `leitura_da_avulsa` — o resto é da Task 3, ruling R1 do
  ledger) e `tests/unit/test_cycle_invariantes.py`; `tutoring/context.py`
  passou a ler o prazo por `leitura_da_avulsa`. Testes de restrição em
  `tests/integration/test_cycle_models.py` (16 casos, cada um afirmando o
  **nome** da restrição violada); `test_missions_models.py` ganhou o
  espelho de `weekly_plans` e o teste de divergência modelo×migração;
  `test_migrations.py` ganhou os três testes da migração 0003, inclusive o
  downgrade que falha alto com diária/especial em pé. Quatro `Mission(...)`
  de teste existentes (`test_missions_models.py`, `test_missions_api.py`,
  `test_tutoring_models.py`) ganharam `mission_type=MissionType.AVULSA` —
  mudança aditiva do contrato, não acomodação de defeito. Fix round 1:
  `test_o_downgrade_da_0003_leva_so_o_ciclo` passou a afirmar o `NOT NULL`
  de `deadline` de volta (não provava isso antes); `test_tipo_invalido_e_recusado`
  reescrito para violar um `CHECK` só (ver "Decisões da execução").
- **Task 3** — serviço do ciclo: criar o plano e ler o ciclo derivado do
  relógio (commit `9e65e71`): quatro erros novos em `core/errors.py`
  (`MissaoExpiradaError`, `PlanoExistenteError`, `SemanaEncerradaError`,
  `SemanaDistanteError`); `cycle_service.py` completo — `NovaDiaria`,
  `NovaEspecial`, `DiaLido`, `EspecialLida`, `PlanoLido`, `CicloLido`,
  `carregar_historico`, `ler_missao` (a ocultação: 404 idêntico para o que
  não foi revelado), `criar_plano` (recusa `plano_existente`,
  `semana_encerrada` — semana no passado — e `semana_distante` — mais de
  uma semana à frente, nesta ordem, para a checagem de estouro do
  `datetime` no ano 9999 nunca ser alcançada antes da recusa por distância),
  `ler_plano_atual`, `ler_ciclo`. `tests/integration/test_cycle_service.py`
  criado, com dois testes a mais que o brief para fechar os ramos de
  `ler_missao` da avulsa e da especial já revelada (cobertura 100%).
- **Task 4** — as regras do ciclo na conclusão (commits `dabc674`..`710044d`
  + fix `53ddc3f`): `service.py` — `listar_missoes` filtra só `AVULSA`;
  `concluir_missao` ganhou, entre a trava e o reenvio, a ocultação
  (`ler_missao` logo depois do relógio) e, entre o reenvio e a transição, a
  regra do dia (`if lida.availability in NAO_CONCLUIVEIS: raise
  MissaoExpiradaError`) — a ordem final é trava → relógio → ocultação →
  reenvio → regra do dia → transição, literal à spec.
  `tests/integration/test_cycle_completion.py` (ocultação, expiração,
  reenvio depois da meia-noite, listagem só de avulsas) e
  `tests/integration/test_cycle_concorrencia.py` criados. Fix round 1:
  segundo teste de concorrência e docstring corrigida (ver "Decisões da
  execução"); `test_a_ocultacao_vem_antes_do_reuso` parametrizado em três
  cenários; `test_conclui_a_especial_dentro_da_janela` acrescentado
  (caminho positivo da especial, que só tinha teste do lado negativo).
- **Task 5** — a API do ciclo (commit `4f2ec40` + fix round `6b42962`): `MissionRead`
  (`schemas.py`) reescrita — ganhou `mission_type`, `day`, `availability`;
  deixou de usar `from_attributes`; construída por `MissionRead.da_leitura(lida)`;
  `xp` passou a chamar `xp_da_missao`. Criados `cycle_schemas.py`
  (`DailyCreate`, `BonusCreate` com `extra="forbid"`, `PlanCreate`,
  `DayRead`, `SpecialRead`, `PlanRead`, `CurrentPlanRead`, `CycleRead`) e
  `cycle_router.py` (`POST /api/plans`, `GET /api/plans/current`,
  `GET /api/cycle`). `router.py` das missões e `tutoring/router.py`
  passaram a publicar via `MissionRead.da_leitura(leitura_da_avulsa(...))`;
  a rota de concluir relê a missão com `ler_missao(session, missao,
  clock())` **depois do commit** (ver pendência nova, abaixo). `main.py`
  ganhou o router do ciclo e os quatro `code` novos (`missao_expirada`,
  `plano_existente`, `semana_encerrada`, `semana_distante`), cada um com
  handler próprio, 409. `tests/integration/test_cycle_api.py` criado (**29**
  casos, contados com `pytest --collect-only`: a trilha sem revelar o
  futuro, o baú fechado, os 422 de validação, os 409 dos quatro códigos —
  inclusive o ano 9999 sem 500 —, o reenvio idempotente, a especial de 660
  XP e a listagem só de avulsas — mais os casos de fechamento de revisão do
  fix round da Task 5, `6b42962`: `extra="forbid"` em `DailyCreate` e
  `PlanCreate`, o `progress` da especial, a especial revelada na trilha, e
  os 422 que faltavam — dificuldade 0, diária/bônus de 0 minutos, critério
  vazio). Nenhum teste existente de missão ou de tutoria precisou de
  alteração — a mudança de contrato foi puramente aditiva.
- **Task 6** — `check-e2e` de esquema limpo (commit `50e2150`):
  `tests/integration/banco_de_teste.py` (novo) recebe, **sem mudar corpo
  nem docstring**, a função `exigir_banco_de_teste` que morava em
  `conftest.py`, e ganha `recriar_esquema(engine)` (a guarda **antes** do
  `DROP SCHEMA public CASCADE` — verificação depois do comando destrutivo
  seria autópsia, não guarda) e `main()`, invocável como `PYTHONPATH=tests
  uv run python -m integration.banco_de_teste`. `conftest.py` passa a
  montar `banco_migrado` por `recriar_esquema` + `upgrade`;
  `test_migrations.py` importa a guarda de lá. `scripts/e2e-env.sh` troca a
  cópia da guarda por essa versão compartilhada. `Makefile` ganha o alvo
  `reset-test-db` (DESTRUTIVO: recria o banco de teste do zero e aplica as
  migrações) como **pré-requisito** do `check-e2e`, no lugar de
  `migrate-test` — motivo em `docs/QUALITY.md` §4. Testes novos em
  `tests/integration/test_banco_de_teste.py` (3 casos: a guarda recusa o
  banco de desenvolvimento; `recriar_esquema` apaga tudo do banco de teste;
  o comando como módulo recusa o banco errado). As duas mutações do brief
  foram aplicadas e vistas reprovando (Step 7 do brief; sem tocar o banco
  de desenvolvimento — a primeira usou uma porta fechada de propósito).
  `make check-e2e` rodado duas vezes seguidas sobre esta Task: **11
  passed** nas duas (ainda sem `cycle.spec.ts`, que é da Task 9) —
  confirma o critério de aceite da C17: o segundo `check-e2e` seguido não
  reprova com `409 plano_existente`. `task-6-report.md`.
- **Task 7** — frontend: contrato, data civil e hook do ciclo (commit
  `242d677`): `types.ts` ganhou `MissionType`,
  `Availability`, `DAYS_PER_MILESTONE = 7` (decisão P10), a interface
  `Cycle`, e em `Mission`: `mission_type`, `day`, `availability`;
  `MissionErrorCode` ganhou `'missao_expirada'`.
  `completionFailure.ts`/`.test.ts` ganharam a entrada `missao_expirada`
  (mensagem + `recovery: 'refresh'`) — o teste existente de "code
  desconhecido", que usava `missao_expirada` como exemplo, trocou o exemplo
  para `'codigo_futuro'` (agora que o código é conhecido, o teste antigo
  passaria pela mensagem específica, não a genérica: falso positivo).
  Criados `civilDate.ts`/`.test.ts` (formata uma data civil `"YYYY-MM-DD"`
  sem conversão de fuso — a armadilha do Risco 3 do plano) e
  `useCycle.ts`/`.test.tsx` (busca `GET /api/cycle`, com `refresh` que
  atualiza sem passar por "carregando", decisão P9). Literais `Mission` de
  teste existentes (`MissionList.test.tsx`, `useMissions.test.tsx`,
  `useCompleteMission.test.tsx`, `Headquarters.test.tsx`) ganharam os três
  campos novos. 100% de cobertura nos quatro eixos; achado de teste
  vacuamente verde descrito em "Decisões da execução".
- **Task 8** — "Missão de hoje" no Quartel-General (commit `08b3dcc`):
  `useCompleteMission` ganhou o parâmetro opcional
  `onCompleted`, chamado só no sucesso. `MissionCard.tsx` extraído de
  `MissionList.tsx` (mesmo conteúdo, com a prop `onCompleted?` repassada);
  `MissionList.tsx` teve o título do quadro trocado para "Outras missões —
  tarefas com prazo" (decisão P8). Criados `CycleSection.tsx`/`.test.tsx` —
  a "Missão de hoje", a sequência ("Sequência: N dia(s) seguido(s)"), o
  progresso até o marco ("N de 7") ou o cartão da especial vigente no lugar
  dele, e a atualização silenciosa via `onCompleted={refresh}`.
  `Headquarters.tsx` passou a renderizar `<CycleSection />` **entre** o
  cabeçalho e o quadro de avulsas; `Headquarters.test.tsx` ganhou a rota
  `GET /api/cycle` e o teste de ordem no DOM. 100% de cobertura nos quatro
  eixos; as duas provas de mutação que faltavam (`onCompleted` e a
  contagem/ordem em `Headquarters.test.tsx`) foram fechadas no fix round 1.
- **Task 9** — E2E do ciclo (commit `0b9197b`, HEAD):
  `frontend/tests/e2e/cycle.spec.ts` (novo, **2 cenários**) semeia o plano
  da semana a partir do `today` que a própria API devolve (nunca do relógio
  do navegador, que roda em `Asia/Tokyo` no `playwright.config.ts` — o
  Risco 3 do plano), abre o Quartel-General, confere a missão de hoje e a
  data civil, conclui pelo botão, confere a sequência (`1 dia seguido`,
  `1 de 7`) e que ela sobrevive a um `page.reload()` (lida do servidor), e
  passa o axe nos dois estados. Limitação conhecida, documentada no próprio
  cenário: se a semeadura e a conclusão caírem em lados diferentes da
  meia-noite de São Paulo, o cenário reprova — sem nova tentativa
  automática. `make check-e2e` rodado duas vezes seguidas com o cenário
  novo: **13 passed** nas duas (os 11 antigos mais os 2 novos), exit 0. As
  duas mutações do Step 3 do brief foram aplicadas e vistas reprovando
  (tirar o `refresh` do `onCompleted`; `civilDate.ts` com `timeZone: 'UTC'`
  e `new Date(civil)` direto) e restauradas. `make check` completo passou
  antes do commit. `task-9-report.md`.
- **Conserto final — backend e E2E** (commit `5d250b3`): fecha os achados
  I1, I2, T3-prazo e m6 da revisão final da branch (ver "Decisões tomadas
  durante a execução"), arquivo a arquivo:
  - `tests/integration/test_banco_de_teste.py` — os dois testes da guarda
    (`test_recriar_esquema_recusa_o_banco_de_desenvolvimento`,
    `test_o_modulo_como_comando_recusa_o_banco_errado`) trocaram
    `settings.database_url` (o banco de **desenvolvimento** real) por uma
    URL fixa com porta 9 fechada nesta máquina; import `Settings` removido
    (I2).
  - `tests/integration/test_cycle_api.py` —
    `test_a_semana_inteira_revela_a_especial_de_660_xp` ganhou a asserção
    do `deadline` da especial contra o fim da janela dos dois dias em UTC
    (T3).
  - `frontend/tests/e2e/cycle.spec.ts` — `test.use({ timezoneId:
    'America/Sao_Paulo' })` escopado ao arquivo, porque a armadilha da data
    civil só aparece a oeste de UTC e o `playwright.config.ts` global roda
    em `Asia/Tokyo` (I1).
  - `tests/integration/test_migrations.py` — acento corrigido em
    "assercao" (m6).
  - Verificado com banco e portas livres: `pytest` sobre os três arquivos
    de teste tocados (**48 passed**), `make check-e2e` (**13 passed**), e
    quatro mutações vistas reprovando e restauradas (guarda sem a checagem
    de porta fechada, guarda sem a condição `_test`, `_ler_especial` com
    `fim_do_dia`, formatador de `civilDate.ts` sem `timeZone`). `make check`
    completo passou antes do commit. `fix-final-back-report.md`.
- **Conserto final — frontend** (commit `71a2001`, HEAD): fecha os achados
  m1, m3, m4, m5(a), m5(b) e m7 da revisão final da branch, arquivo a
  arquivo:
  - `frontend/src/features/missions/CycleSection.tsx` — `key` no
    `MissionCard` da missão de hoje e no da especial (m1: sem ela, um
    `refresh` que trocava de missão reaproveitava a instância presa em
    "concluída"); `titleLevel={4}` no cartão de dentro da especial (m3: h4
    em vez de h3 aninhado); `role="status"` no parágrafo da sequência
    (`cycle-streak`, m4); `reloadLabel: 'Atualizar a missão de hoje'` no
    objeto `card` compartilhado (m5a).
  - `frontend/src/features/missions/MissionCard.tsx` — prop opcional
    `titleLevel?: 3 | 4` (padrão 3, `<HeadingTag>` calculada, m3); prop
    opcional `reloadLabel?: string` (padrão "Atualizar o quadro",
    repassada a `CompletionControls`, m5a).
  - `frontend/src/features/missions/completionFailure.ts` — mensagem de
    `missao_expirada` trocou "o dia desta missão" por "o prazo desta
    missão" (m5b: a janela da especial é de dois dias, não um).
  - `frontend/src/features/missions/CycleSection.test.tsx` e
    `completionFailure.test.ts` — testes novos/ajustados para m1, m3 (nível
    3 padrão e nível 4 dentro da especial), m4 (role estável), m5a, m5b e
    m7 (especial concluída dentro da janela, sem oferecer Concluir).
  - Verificado no worktree (sem tocar banco): `vitest` sobre os três
    arquivos tocados (**59 passed**), `typecheck`, `lint`,
    `format:check`, e `test:coverage` (**305 testes em 25 arquivos, 100%
    nos quatro eixos**); cada mutação (uma por achado) vista reprovando e
    restaurada. `make check` completo (hook do commit) e mais um `make
    check` rodado depois, com o banco e as portas do E2E — ambos EXIT 0,
    números em "Resultados". `fix-final-front-report.md`.

## Alterações do Incremento C

Plano em `docs/superpowers/plans/2026-09-25-incremento-c.md`. Nove commits em
`feat/incremento-c` (`git log --oneline 9c2bd1e..HEAD`, base já descrita em
"Revisão-base"): a base do incremento e o plano na Task 0 (`bb6497c`), a
navegação lateral na Task 1 (`c51149c`), o contrato/data civil e o hook do
plano na Task 2 (`f26b47d`, `0d9b5f3`), a trilha na Task 3 (`a8e899e`), a
integração na Task 4 (`c6153af`), atualizar na volta à aba na Task 5
(`69b5dc4`), o E2E na Task 6 (`9c8cd65`) e a correção de corrida da Task 5
por cima do commit da Task 6 (`e195128`, fix round 1 — ver Ruling R10).
Depois deles, a documentação da Task 7 (`c15318a`) e a onda final de
correções da revisão final da branch, em dois commits: o conserto do I1
(`f1c2276`) e o das demais correções mais esta documentação (ver "Onda
final de correções", ao fim desta seção).

- **Task 0** — revisão-base e o plano (commit `bb6497c`): `docs/HANDOFF.md`
  ganhou o parágrafo "Incremento C — a campanha" (ver "Revisão-base");
  `docs/superpowers/plans/2026-09-25-incremento-c.md` entrou no `git add`
  (já estava copiado, não rastreado, na árvore). `task-1-report.md` (Tasks
  0 e 1 juntas).
- **Task 1** — a navegação lateral (commit `c51149c`, transportada do
  worktree `feat/incremento-c-nav`, Ruling R2): criados
  `frontend/src/app/areas.ts` (`Area`, `AREAS`), `frontend/src/app/SideNav.tsx`
  e `SideNav.test.tsx` (`<nav aria-label="Áreas">`, `aria-current`, marcador
  `▸`, decisão K4), `frontend/src/pages/headings.ts`
  (`HEADQUARTERS_HEADING_ID`, `CAMPAIGNS_HEADING_ID`),
  `frontend/src/pages/Campaigns.tsx` e `Campaigns.test.tsx` (o `main` com o
  `h1` "Campanhas — planos de estudo" e, por ora, o parágrafo reservado
  `campaigns-placeholder`, decisão K11). Modificados: `frontend/src/App.tsx`
  e `App.test.tsx` (o roteador de duas áreas por estado local, decisão K1;
  foco no título depois de navegar, decisão K5; o rascunho da Tifa sobrevive
  à ida e volta por Campanhas, decisão K2),
  `frontend/src/pages/Headquarters.tsx` e `Headquarters.test.tsx` (`hidden`
  na raiz **e** no `<main>` — um só `main` visível, Review Focus 2). Sete
  mutações do brief aplicadas e restauradas — `task-1-report.md` (§1 e §2
  do relatório, que também cobre a Task 0).
- **Task 2** — o contrato da trilha, a data civil compartilhada e o hook do
  plano (commits `f26b47d`, `0d9b5f3`, transportados do worktree
  `feat/incremento-c-trilha`, Ruling R2): o movimento puro primeiro
  (`f26b47d`) — `git mv` de `features/missions/civilDate.ts`/`.test.ts` para
  `frontend/src/shared/lib/`; criado `frontend/src/shared/types/mission.ts`
  (`Mission`, `MissionState`, `MissionType`, `Availability`,
  `MISSION_STATE_LABELS`, `DAYS_PER_MILESTONE`, sem `MAX_DIFFICULTY` ainda);
  `frontend/src/features/missions/types.ts` perdeu os símbolos movidos, sem
  reexportar (Ruling R3); imports ajustados em 10 arquivos de
  `features/missions/*`. Nenhuma asserção de teste mudou nesse commit.
  Depois, o comportamento (`0d9b5f3`): `civilWeekday` em
  `shared/lib/civilDate.ts` (o dia da semana a partir da data civil, sem
  fuso — a prova de mutação da Ruling R7);
  `frontend/src/features/campaigns/types.ts` (`Plan`, `PlanDay`,
  `PlanSpecial`, `CurrentPlan`); `useCurrentPlan.ts` e `.test.tsx` — busca
  `GET /api/plans/current`, com `reload`/`refresh`/`refreshFailed` e o
  estado `no-plan` (Ruling R4, adiantada da Task 5). `task-3-report.md`
  (§1–§4, que cobre as Tasks 2 e 3 juntas).
- **Task 3** — a trilha (commit `a8e899e`, mesmo transporte): criados
  `frontend/src/features/campaigns/availability.ts` e `.test.ts`
  (`AVAILABILITY_DISPLAY: Record<Availability, {label, icon}>`, exaustivo,
  sem o campo `tone` que o worktree original tinha — separado num
  `AVAILABILITY_TONE` local, não exportado) e `CampaignTrail.tsx` e
  `.test.tsx` — os 7 dias (`<ol>`, `trail-day`), o baú fechado por
  `mission === null` (nunca desenha conteúdo, C11), o marcador "Hoje" no
  último dia não `bloqueada` (decisão K9, testado também com o domingo), a
  especial com "N de 7" (`trail-special-progress`) e os estados
  `expirada`/`perdida` com conteúdo e texto de estado (fecha a pendência
  T3-EXPIRADA/PERDIDA do B **no frontend**; ver pendência 58); o aviso
  `trail-stale` quando `refreshFailed` (testado via `TrailContent` exportada
  temporariamente — fechado de verdade na Task 5); o texto "Sem plano nesta
  semana." com a garantia "um dia sem plano não quebra a sequência" (Ruling
  R9); `MAX_DIFFICULTY` entrou em `shared/types/mission.ts` neste commit (é
  quem o usa). Ícones SVG inline com `aria-hidden` (Ruling R8). Sete
  mutações do brief mais as de `civilWeekday`/`useCurrentPlan`, todas
  aplicadas e restauradas. `task-3-report.md` (§5–§10).
- **Task 4** — Campanhas compõe a trilha (commit `c6153af`): "juntar as
  branches" (Step 1 do brief) já tinha sido feito antes da Task pelo
  controlador; a Task cobriu os Steps 2–5.
  `frontend/src/pages/Campaigns.tsx` trocou `campaigns-placeholder` por
  `<CampaignTrail onOpenHeadquarters={onOpenHeadquarters} />`, com a prop
  opcional nova (Ruling R5, relaxa K11); `Campaigns.test.tsx` — o teste do
  placeholder virou "compõe a trilha da semana" (`GET /api/plans/current`
  → `{"plan": null}`, `trail-no-plan` na tela). `frontend/src/App.tsx`
  passou a chamar `<Campaigns onOpenHeadquarters={() => navigate('headquarters')} />`
  (a mesma função que já focava o `h1` do QG); `App.test.tsx` ganhou a rota
  `GET /api/plans/current` no `stubPage` e dois testes: "cada abertura de
  Campanhas busca a trilha de novo" (K2: ida, volta, ida → 2 pedidos) e o
  botão "Ir ao Quartel-General" da trilha (Ruling R5) voltando ao QG com
  foco no título. Nenhum arquivo de `features/campaigns/*` tocado (só
  leitura pelo revisor das Tasks 2+3 no mesmo worktree). Duas mutações
  aplicadas e restauradas (Campanhas oculta em vez de desmontada; `App` sem
  passar `onOpenHeadquarters`). `task-4-report.md`.
- **Task 5** — atualizar na volta à aba (commit `69b5dc4`, decisão K7):
  criado `frontend/src/shared/hooks/useRefreshOnReturn.ts` e
  `.test.tsx` — ouve `visibilitychange` (só quando visível) e `focus`,
  chama sempre o `refresh` mais recente (guardado numa `ref`, não como
  dependência do efeito), remove os ouvintes na desmontagem. Ligado a
  `frontend/src/features/missions/useCycle.ts` e
  `frontend/src/features/campaigns/useCurrentPlan.ts` (+ testes) — fecha a
  pendência 57 do B, para os dois hooks de uma vez (a trilha tinha o mesmo
  problema em escala maior). De brinde, fechou a pendência que a Task 3
  tinha deixado: `CampaignTrail.test.tsx` passou a provar `trail-stale`
  pelo caminho real (a aba volta a ficar visível, o `GET` falha), e o
  export `TrailContent` (que só existia para o teste antigo) voltou a ser
  interno. Quatro mutações do brief aplicadas e restauradas.
  `task-5-report.md` (parte 1).

  **Fix round 1** (commit `e195128`, por cima do commit da Task 6 — Ruling
  R10): achado Important da revisão — `useCycle.ts` e `useCurrentPlan.ts`
  não tinham nenhum sequenciamento no `refresh()`; duas respostas em voo
  (uma de `visibilitychange`, outra de `focus`) podiam assentar fora de
  ordem, e a mais velha, chegando por último, sobrescrevia o dado (e o
  `refreshFailed`) da mais nova. Corrigido com um contador de sequência por
  hook (`useRef(0)`, compartilhado entre a carga do efeito e o `refresh`):
  cada pedido captura um `id` antes do `await`, e todo `.then`/`.catch`
  descarta a resposta se `requestId.current !== id`. Doze testes novos (seis
  por hook), todos com promessas controladas — nunca timer real. Regra
  única para sucesso e falha (Ruling R10): só o pedido mais recente por
  início decide, mesmo se ele falhar depois de outro ter tido sucesso.
  `task-5-report.md` (§"Rodada de correção 1/5").
- **Task 6** — E2E: Campanhas, axe nas duas áreas e o celular (commit
  `9c8cd65`): três cenários novos em `frontend/tests/e2e/cycle.spec.ts`, em
  série depois dos dois do B (o plano é único por semana, semeado uma vez
  no `beforeAll`) — abrir Campanhas pela navegação com a trilha do plano
  semeado (7 dias, hoje concluído, dias futuros como baú, especial
  bloqueada com "1 de 7"), axe sem violações nas duas áreas (Campanhas
  carregada e o Quartel-General depois da volta); abrir Campanhas pelo
  teclado (Tab, Tab, Enter, foco no título); e um `describe('celular')` a
  390×844 (navegação visível, sem rolagem horizontal nas duas áreas, sem
  sobreposição entre "Falar com a Tifa" e a navegação — sem axe dentro
  deste `describe`, ver pendência 21/61). Testids reais da trilha usados
  (Ruling R6). Três mutações do brief (`SideNav.tsx`) aplicadas e
  restauradas. Achado fora do escopo, registrado nesta Task: edição
  concorrente na árvore (ver "Incremento C — decisões tomadas durante a
  execução", acima — era o fix round 1 da Task 5). `task-6-report.md`.
- **Task 7** — documentação (commit `c15318a`): este documento
  (revisão-base, decisões, alterações, resultados, pendências 59–61),
  `docs/ARCHITECTURE.md` (a árvore e as seções de `app/`, `pages/`,
  `features/campaigns/`, `shared/lib/`, `shared/hooks/`, `shared/types/`) e
  `docs/QUALITY.md`. `task-7-report.md`.
- **Onda final de correções** (revisão final da branch e revisão da Task 7;
  Rulings R11–R15). Relatório: `final-fix-report.md` no diretório da sessão.
  - **I1 (Important), commit `f1c2276`** — `useCycle.ts` e
    `useCurrentPlan.ts`: no `catch` do `refresh`, um estado `loading` vira
    `{ status: 'error', message }` (Ruling R12); antes ficava `loading` para
    sempre, sem "Tentar novamente", quando um `focus`/`visibilitychange`
    durante a carga inicial disparava um `GET` que falhava. Os dois testes
    vácuos (a carga inicial nunca assentava) foram reescritos para a carga
    inicial **assentar** depois da falha, com sucesso e com falha
    (`it.each`, nos dois hooks), mais um teste do terceiro ramo (erro
    continua erro) em cada hook e um teste de componente no `CycleSection`
    (`focus`) e na trilha (`visibilitychange`) com o "Tentar novamente".
    RED medido (os quatro testes de hook e os dois de componente reprovando
    com `{ status: 'loading' }`/sem `cycle-error`/`trail-error`), GREEN, e
    a mutação que reverte o conserto reprova três testes por hook.
  - **m1** — `shared/lib/civilDate.test.ts`: casos com
    `TZ=Pacific/Kiritimati` (UTC+14) para `civilWeekday` e para
    `formatCivilDate`; tirar o `timeZone: 'UTC'` de qualquer um dos dois
    formatadores agora reprova (`'terça-feira'` no lugar de
    `'segunda-feira'`), e antes passava a suíte inteira. O comentário do
    teste a oeste deixou de dizer que ele prova o `timeZone`, e o comentário
    de `civilDate.ts` (o meio-dia não dá margem a leste de +12h) foi
    corrigido, assim como a justificativa da Ruling R7 e o parágrafo de
    `shared/lib/` do `docs/ARCHITECTURE.md`, que diziam o contrário.
  - **m2** — os avisos `act()` de arquivos do C: `Campaigns.test.tsx`
    ("anuncia Campanhas…") e `App.test.tsx` (os dois testes que clicam em
    Campanhas) agora aguardam `trail-no-plan`. Na suíte inteira, de 4 avisos
    para 1 — o que sobra é o do B, em `MissionList.test.tsx`.
  - **m3** — `tests/e2e/cycle.spec.ts`, cenário do celular: espera os 7
    `trail-day` antes de medir a rolagem horizontal de Campanhas.
  - **m4 / R13** — "Quartel-General" em todo o frontend (rótulo da
    navegação em `app/areas.ts`, `h1` do QG, comentários e testes, inclusive
    o E2E); os testes do `h1` trocaram `/quartel-general/i` pela grafia
    exata, para travá-la. No `docs/ARCHITECTURE.md`, os dois lugares que
    citam o rótulo.
  - **R14** — `caixasSeSobrepoem` afirma que as duas caixas não são nulas.
  - **Documentação** — as Rulings R11–R15 (acima), as pendências 62–71, o
    `civilDate.ts` em `shared/lib/` indicado no parágrafo de `missions` do
    `docs/ARCHITECTURE.md`, e a linha desta onda em "Resultados".

## Comandos

Os alvos do Makefile estão descritos em `docs/QUALITY.md` §1. Os novos neste
incremento:

| Comando | O que faz |
|---|---|
| `make db-up` | Sobe o PostgreSQL e espera o healthcheck. |
| `make db-down` | Derruba o PostgreSQL, preservando o volume. |
| `make migrate` | Aplica as migrações no banco de desenvolvimento. |
| `make migrate-test` | Aplica as migrações no banco de teste. |
| `make check-api` | `uv lock --check`, Ruff, mypy estrito e pytest com cobertura de 100%. |
| `make check-e2e` | Desde o Incremento B: `reset-test-db` (não mais `migrate-test`), build do frontend e Playwright com axe-core. |
| `PYTHONPATH=tests uv run python -m integration.falso_do_e2e --porta 8150` | Sobe o servidor falso do E2E à mão, fora do Playwright (que o sobe sozinho no `make check-e2e`). Não precisa de chave nenhuma. |
| `make reset-test-db` | **Novo no Incremento B.** DESTRUTIVO: recria o esquema `public` do banco de teste do zero e aplica as migrações — pré-requisito do `check-e2e`, porque o plano semanal é único por semana (C3) e um segundo `check-e2e` seguido, sem esquema limpo, reprovaria com `409 plano_existente`. |

Para rodar a aplicação em desenvolvimento (não faz parte do gate):

```bash
make db-up
make migrate
uv run uvicorn focusquest.main:app --host 127.0.0.1 --port 8000
cd frontend && npm run dev            # com frontend/.env copiado do frontend/.env.example
```

Para subir a API local **com a Tifa** (a chave real mora no item
`focusquest-anthropic` do Keychain do macOS), troque a linha do `uvicorn`
acima por:

```bash
FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password -s focusquest-anthropic -w)" \
  uv run uvicorn focusquest.main:app --host 127.0.0.1 --port 8000
```

A chave vem do Keychain só para este processo; não a exporte no shell nem a
escreva no `.env` (o Gitleaks do gate a acusaria, e o `pre-push` a levaria ao
gate — ver as emendas do 1b-2 na spec). Sem alvo no Makefile, de propósito:
seria um comando só de macOS no arquivo que o CI usa, sem ser verificação, e
a paridade 1:1 (`AGENTS.md` §4) não tem job para ele.

Para gravar a referência da camada 3 (`tests/integration/referencia_da_api_real.json`),
uma vez, com a chave do mesmo jeito e o `anthropic_base_url` sem override — o
script recusa gravar se o endereço não for `api.anthropic.com`:

```bash
FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password -s focusquest-anthropic -w)" \
  PYTHONPATH=tests uv run python -m integration.camada3
```

Ele imprime só a lista de tipos de evento e grava o mesmo no arquivo, sem
texto, sem ids e sem a chave. Nunca crie esse arquivo à mão.

O frontend de desenvolvimento encaminha `/api` para a porta 8000. Para outro
alvo, exporte `API_PROXY_TARGET` no ambiente do processo do Vite — escrita
no `.env`, ela é ignorada (`docs/ARCHITECTURE.md` §3).

## Resultados

Cada linha registra a revisão em que foi medida; as medições são de sessões
e de revisões diferentes, e a mais recente fica por último:

| Comando | Resultado |
|---|---|
| `make check` | Aprovado, EXIT 0, cerca de 12 s de relógio com o PostgreSQL de pé. Frontend: 35 testes, cobertura de 100% nos quatro eixos (50/50 instruções, 22/22 ramificações, 18/18 funções, 48/48 linhas). `uv lock --check` aprovado. Ruff sem achados, 33 arquivos já formatados. mypy sem problemas em 29 arquivos. pytest: 91 testes, 2 avisos (as duas `DeprecationWarning` das pendências), cobertura total de 100%. E2E: 4 cenários aprovados em Chromium. Gitleaks sem achados. |
| `make check` sobre a árvore da onda de correção final (a mesma que virou `8b75d69`) | Aprovado, EXIT 0. Frontend: 36 testes, cobertura de 100% nos quatro eixos (50/50 instruções, 22/22 ramificações, 18/18 funções, 48/48 linhas). `uv lock --check` aprovado. Ruff sem achados, 34 arquivos já formatados. mypy sem problemas em 30 arquivos. pytest: 110 testes, 2 avisos, cobertura total de 100%. E2E: 4 cenários aprovados em Chromium, com o navegador em `Asia/Tokyo`. Gitleaks sem achados. |
| `scripts/check-push.sh`, executado à mão pela entrada padrão, sem push | Aprovado, EXIT 0, cerca de 25 s: `make bootstrap` e `make check` inteiros no worktree temporário, sem `.env` nele, com as variáveis `FOCUSQUEST_*` vindas do repositório principal. O worktree foi removido ao fim. |
| Contagem de linhas do E2E no `focusquest_test` depois de um `make check` | 2 — as missões da última execução do E2E; as anteriores foram apagadas pelo `DROP SCHEMA` da suíte pytest. |
| Jobs `check-api` e `check-e2e` no GitHub Actions | **Executados e verdes**, no PR #4 (mesclado por `e3ef7bf`), junto com `check-secrets`, `check-web` e `quality-gate` (`gh pr checks 4`). |
| `make check` duas vezes seguidas, sobre o topo de `feat/incremento-a` **antes** da integração da `main` | Aprovado, EXIT 0 nas duas. Frontend: 68 testes, cobertura de 100% nos quatro eixos (86/86 instruções, 51/51 ramificações, 29/29 funções, 84/84 linhas). Backend: 115 testes, cobertura total de 100%. E2E: 6 cenários em Chromium. Gitleaks sem achados. |
| `make check` duas vezes seguidas, sobre o merge da `main` (`b6f8c9d`) | Aprovado, EXIT 0 nas duas. Frontend: 68 testes em 8 arquivos, cobertura de 100% nos quatro eixos (86/86 instruções, 51/51 ramificações, 29/29 funções, 84/84 linhas). `uv lock --check` aprovado. Ruff sem achados, 37 arquivos já formatados. mypy sem problemas em 33 arquivos. Backend: 122 testes (os 115 do Incremento A, mais os 6 de `test_sessao_em_utc.py` e 1 de `test_migrations.py`, vindos do PR #5), 2 avisos, cobertura total de 100%. E2E: 6 cenários aprovados em Chromium — inclusive o da resposta perdida, que compara o `completed_at` do reenvio com o do primeiro 200 **como texto**, garantido agora pela sessão em UTC. Gitleaks sem achados. |
| Contagem de linhas do E2E no `focusquest_test` depois de um `make check` (Incremento A, remedida depois do merge) | 4, duas delas concluídas — as missões da última execução do E2E. |
| `make check` duas vezes seguidas, sobre a Task 6 (`66160bd`) | Aprovado, EXIT 0 nas duas, cerca de 13 s de relógio cada. Frontend: 91 testes em 9 arquivos, cobertura de 100% nos quatro eixos (115/115 instruções, 63/63 ramificações, 37/37 funções, 113/113 linhas). `uv lock --check` aprovado. Ruff sem achados, 37 arquivos já formatados. mypy sem problemas em 33 arquivos. Backend: 122 testes, 2 avisos, cobertura total de 100%. E2E: 6 cenários aprovados em Chromium. Gitleaks sem achados. |
| `make check` duas vezes seguidas, ao fim do Incremento 1b-1 (`880dd60`, documentação da Task 8 por cima) | Aprovado, EXIT 0 nas duas, cerca de 40 s de relógio cada (pytest). Frontend: 92 testes em 9 arquivos, cobertura de 100% nos quatro eixos (116/116 instruções, 63/63 ramificações, 37/37 funções, 114/114 linhas) — inalterado pelo 1b-1, que é só backend. `uv lock --check` aprovado (`anthropic`, `httpx2`, `anyio` inclusos). Ruff sem achados, 65 arquivos já formatados. mypy sem problemas em 61 arquivos. Backend: **269 testes** (122 do fim do Incremento A/1a mais 147 da tutoria), 1 aviso, cobertura total de **100%** (739 instruções, 102 ramificações, todas cobertas). E2E: 6 cenários aprovados em Chromium (inalterado). Gitleaks sem achados. |
| `gh pr checks 10` (PR do 1b-1, topo `9fb9a8e`), lido em 2026-09-22 | PR `MERGED` em 2026-09-22T02:51:09Z, merge commit `a795ee7`, `headRefOid` `9fb9a8e` (`gh pr view 10`). Duas execuções do workflow `quality`, ambas sobre `9fb9a8e` e com conclusão `success` (`gh run view`): a do evento `push` (run 35478605980) e a do `pull_request` (run 35478623302). Em cada uma, `check-api`, `check-e2e`, `check-secrets`, `check-web` e `quality-gate` com `pass`. É a evidência de que `9fb9a8e` passou no CI; não há `make check` local registrado sobre ele. |
| `make check` sobre a base do 1b-2 (`a795ee7`, com este registro por cima) | Aprovado, EXIT 0, cerca de 51 s de relógio. Frontend: 92 testes em 9 arquivos, cobertura de 100% nos quatro eixos (116/116 instruções, 63/63 ramificações, 37/37 funções, 114/114 linhas). `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 65 arquivos já formatados. mypy sem problemas em 61 arquivos. Backend: 271 testes, 1 aviso, cobertura total de 100% (742 instruções, 104 ramificações). E2E: 6 cenários aprovados em Chromium. Gitleaks sem achados. |
| `make check` sobre a Task 6 do 1b-2 (árvore do `342a6e3`, antes do commit) | Aprovado, EXIT 0. Frontend: 137 testes em 11 arquivos, cobertura de 100% nos quatro eixos (172/172 instruções, 92/92 ramificações, 47/47 funções, 169/169 linhas). `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 67 arquivos já formatados. mypy sem problemas em 63 arquivos. Backend: 299 testes (271 da base mais 18 de `test_falso_do_e2e.py` e 10 novos de `test_e2e_env.py`), 1 aviso, cobertura total de 100% (742 instruções, 104 ramificações — `src/focusquest/` não mudou). E2E: 6 cenários aprovados em Chromium, agora com três `webServer` (o falso na 8150, a API apontada para ele, o frontend). Gitleaks sem achados. |
| `make check` sobre as correções da revisão da Task 6 do 1b-2 (árvore do `d8461e7`) | Aprovado, EXIT 0. Frontend: 204 testes em 15 arquivos, cobertura de 100% nos quatro eixos (338/338 instruções, 207/207 ramificações, 98/98 funções, 325/325 linhas). `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 67 arquivos já formatados. mypy sem problemas em 63 arquivos. Backend: 312 testes (os 299 da Task 6 mais 13 novos em `test_falso_do_e2e.py`), 1 aviso, cobertura total de 100% (742 instruções, 104 ramificações — `src/focusquest/` não mudou). E2E: 6 cenários aprovados em Chromium. Gitleaks sem achados. |
| `make check` sobre a Task 7 do 1b-2 (árvore do commit `73b6e17`) | Aprovado, EXIT 0. Frontend: 279 testes em 22 arquivos, cobertura de 100% nos quatro eixos (497/497 instruções, 332/332 ramificações, 147/147 funções, 481/481 linhas) — inalterado pela Task 7, que só acrescenta o cenário E2E. `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 67 arquivos já formatados. mypy sem problemas em 63 arquivos. Backend: 312 testes, 1 aviso, cobertura total de 100% (742 instruções, 104 ramificações — `src/focusquest/` não mudou). E2E: **11 cenários** aprovados em Chromium (os 6 do quadro e os 5 da tutoria). Gitleaks sem achados. |
| Contagem de linhas do E2E no `focusquest_test` depois de um `make check` (Task 7 do 1b-2) | 6 missões, 7 mensagens da tutoria, 2 ações — o esperado pelo desenho. Depois de mais um `make check-e2e` sem o pytest no meio: 12, 14 e 4. |
| `make check` sobre a Task 8 Step 1 do 1b-2 (árvore do commit `605b24e`), rodado duas vezes seguidas | Aprovado, EXIT 0 nas duas. Frontend: 279 testes em 22 arquivos, cobertura de 100% nos quatro eixos (497/497 instruções, 332/332 ramificações, 147/147 funções, 481/481 linhas) — inalterado, a Task 8 Step 1 só toca `tests/`. `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 67 arquivos já formatados. mypy sem problemas em 63 arquivos. Backend: **313 testes** (312 da Task 7 mais o novo `test_a_guarda_vale_com_a_chave_exportada_no_ambiente`), 1 aviso, cobertura total de 100% (742 instruções, 104 ramificações — `src/focusquest/` não mudou). E2E: 11 cenários aprovados em Chromium (inalterado). Gitleaks sem achados. |
| `grep -rn "features/missions" frontend/src/features/tutoring/` e `grep -rn "features/tutoring" frontend/src/features/missions/` (Task 9, §5 regra 1 do `docs/ARCHITECTURE.md`) | Nenhum dos dois saiu vazio, mas nenhum é **import**: o primeiro casa duas linhas de comentário em `tutoring/types.ts` ("Esta feature nao importa nada de `features/missions/`..."); o segundo casa uma linha de comentário em `missions/MissionList.tsx` que cita `features/tutoring/ProposalCard.tsx` num JSX comment. Conferido à parte, sem achado: `grep -rn "^import.*features/missions\|from ['\"].*features/missions" frontend/src/features/tutoring/` e o equivalente para `tutoring` dentro de `missions/` — os dois EXIT 1 (nenhum `import`). A regra 1 vale: nenhuma feature importa a outra. |
| `make check`, duas vezes seguidas, sobre a Task 9 do 1b-2 (documentação: `docs/HANDOFF.md`, `docs/QUALITY.md`, `docs/ARCHITECTURE.md`, a spec) | Aprovado, EXIT 0 nas duas, sem divergência entre elas. Frontend: 279 testes em 22 arquivos, cobertura de 100% nos quatro eixos (497/497 instruções, 332/332 ramificações, 147/147 funções, 481/481 linhas) — inalterado, a Task 9 só toca `docs/`. `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 67 arquivos já formatados. mypy sem problemas em 63 arquivos. Backend: 313 testes, 1 aviso, cobertura total de 100% (742 instruções, 104 ramificações) nas duas execuções. E2E: 11 cenários aprovados em Chromium nas duas. Gitleaks sem achados nas duas. |
| Sequência gravada pela chamada real da Task 8 (`tests/integration/referencia_da_api_real.json`, `claude-opus-5`, `anthropic==1.7.0`, 2026-09-22) — lista de tipos, não é conteúdo | `message_start`, `content_block_start:thinking`, `ping`, `content_block_delta:thinking_delta`, `content_block_delta:signature_delta`, `content_block_stop`, `content_block_start:text`, `content_block_delta:text_delta`, `content_block_stop`, `content_block_start:tool_use`, `content_block_delta:input_json_delta`, `content_block_stop`, `message_delta`, `message_stop`. Arquivo lido inteiro (21 linhas): só as chaves `capturada_em`, `sdk`, `modelo`, `eventos`; `grep` por `msg_`, `toolu_`, `sk-ant` e `"text":` deu 0; `make check-secrets` EXIT 0, `no leaks found`. |
| `uv run pytest tests/integration/test_camada3.py` (Task 8) | Com o falso do 1b-1: **reprovou** em `test_o_falso_emite_a_sequencia_da_api_real` — o bloco de thinking da API real (ponto de parada 3; decisão do dono, emenda E6). Com o thinking no falso: os seis testes verdes. O `-k "sequencia or comparavel or ping or recusa"` do Step 5 seleciona **5**, não 4 (`--collect-only`: `test_camada3.py: 5`), porque `sequencia` casa também `test_o_falso_emite_a_sequencia_da_api_real`. |
| Efeito cascata do thinking no falso, antes dos ajustes (suíte pytest, `--no-cov`) | 10 reprovações: 7 de índice (as contagens de 3 caíam dentro do thinking) e 3 da camada 2 (a `Message` do SDK com o bloco `thinking` na frente). Depois dos ajustes de índice e da expectativa da camada 2 (opção (A)), nenhuma. Lista em "Alterações", Task 8. |
| Mutações da Task 8 (backup em `/tmp/fq-mutacao-t8c.bak`, restaurado por `cp`) | **Mutação 1 do plano:** `message_delta` → `message_deltaX` na referência reprova `test_o_falso_emite_a_sequencia_da_api_real` (diferença no índice 11) e `test_a_referencia_gravada_nao_tem_conteudo` (o regex recusa o `X`). **Mutação 2 do plano:** sem a checagem de `_API_REAL`, `test_a_captura_recusa_gravar_o_que_nao_e_a_api_real` reprova, mas **não** pelo motivo que o plano previa: sem a chave no ambiente (o caso do gate), o `main()` para antes, na checagem da chave (`sem FOCUSQUEST_ANTHROPIC_API_KEY no ambiente; nada foi gravado`); só com a chave exportada no shell ele chegaria ao `APIConnectionError` de `127.0.0.1:9`. Nos dois casos a mensagem não casa com `so grava a API real`. **Adaptador tratando thinking como texto** (mutação temporária em `src/`, restaurada): `test_o_thinking_da_api_nao_chega_ao_dominio` reprova nos dois casos, `Delta('raciocinio interno do falso…') != Delta('Bora, ')`. **Falso emitindo o thinking como `text_delta`:** reprova só a camada 3 (`'content_block_delta:text_delta' != 'content_block_delta:thinking_delta'`); o teste do adaptador passa, porque o próprio SDK ignora um `text_delta` dentro de um bloco `thinking`. **`pensar` desligado por padrão:** reprovam a checagem de não vacuidade do teste novo e a camada 3. **E2E com `cut_after_events: 3`:** reprova `test_o_e2e_segura_e_corta_no_mesmo_ponto_que_o_pytest`. |
| `make check`, duas vezes seguidas, sobre a Task 8 Steps 2–8 do 1b-2 (árvore antes do commit; esta linha escrita entre as duas) | Aprovado, EXIT 0 nas duas. Frontend: 279 testes em 22 arquivos, cobertura de 100% nos quatro eixos (497/497 instruções, 332/332 ramificações, 147/147 funções, 481/481 linhas) — inalterado, a Task 8 não toca `frontend/src/`. `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 69 arquivos já formatados. mypy sem problemas em 65 arquivos. Backend: **322 testes** (313 da Task 8 Step 1, mais os 6 de `test_camada3.py`, os 2 casos de `test_o_thinking_da_api_nao_chega_ao_dominio` e `test_o_e2e_segura_e_corta_no_mesmo_ponto_que_o_pytest`), 1 aviso, cobertura total de 100% (742 instruções, 104 ramificações — `src/focusquest/` não mudou). E2E: 11 cenários aprovados em Chromium, com os índices 7. Gitleaks sem achados. |
| `make check` sobre a base `12288a2`, no Linux, antes de qualquer mudança do Incremento B (ruling da Task 0 no ledger) | Aprovado, EXIT 0, 1m47s. Frontend: 279 testes em 22 arquivos, cobertura de 100% nos quatro eixos (497/497 instruções, 332/332 ramificações, 147/147 funções, 481/481 linhas). Backend: 322 testes, cobertura total de 100%. E2E: 11 cenários. Gitleaks sem achados. |
| `make check` duas vezes seguidas, sobre a árvore final do Incremento B (Tasks 0–9 integradas, HEAD `0b9197b`) | Aprovado, EXIT 0 nas duas, ~1m31s de relógio cada. Frontend: 301 testes em 25 arquivos, cobertura de 100% nos quatro eixos (537/537 instruções, 351/351 ramificações, 165/165 funções, 519/519 linhas) — idêntico nas duas rodadas. `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 83 arquivos já formatados. mypy sem problemas em 79 arquivos. Backend: **465 testes**, 1 aviso, cobertura total de 100% (1076 instruções, 180 ramificações) — idêntico nas duas rodadas. E2E: **13 cenários** aprovados em Chromium (12,8 s e 13,1 s). Gitleaks sem achados nas duas. |
| `make check-e2e` duas vezes seguidas, sobre a árvore final (prova do C17: o segundo `check-e2e` também aprova, de esquema limpo) | Aprovado, EXIT 0 nas duas (~19,4 s e ~18,6 s de relógio, incluindo `reset-test-db` + build + Playwright). **13 passed** nas duas (14,6 s e 13,6 s de Playwright) — os 11 cenários antigos mais os 2 do `cycle.spec.ts`; o segundo `check-e2e`, rodado imediatamente depois do primeiro sem `check-api` no meio, não reprovou com `409 plano_existente`, confirmando que `reset-test-db` recria o esquema do zero a cada execução. |
| `make check` do hook `pre-commit` no commit `71a2001` (conserto final do frontend, passo 1 do fechamento) — número visto rodando `pre-commit run gate --verbose` logo depois, sobre a mesma árvore (o hook, sem `--verbose`, só imprime "Passed") | Aprovado, EXIT 0, 100,17 s de relógio. Frontend: **305 testes em 25 arquivos**, cobertura de 100% nos quatro eixos (538/538 instruções, 355/355 ramificações, 165/165 funções, 520/520 linhas). `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 83 arquivos já formatados. mypy sem problemas em 79 arquivos. Backend: **465 testes**, 1 aviso, cobertura total de 100% (1076 instruções, 180 ramificações). E2E: **13 cenários** aprovados em Chromium (15,9 s de Playwright). Gitleaks sem achados. |
| `make check` rodado por mim direto (sem o hook), logo depois do anterior, sobre a mesma árvore (ainda commit `71a2001`) | Aprovado, EXIT 0, 94,2 s de relógio. Frontend: 305 testes em 25 arquivos, cobertura de 100% nos quatro eixos (538/538 instruções, 355/355 ramificações, 165/165 funções, 520/520 linhas) — idêntico ao anterior. `uv lock --check` aprovado. Ruff sem achados, 83 arquivos já formatados. mypy sem problemas em 79 arquivos. Backend: 465 testes, 1 aviso, cobertura total de 100% (1076 instruções, 180 ramificações) — idêntico. E2E: 13 cenários aprovados em Chromium (13,6 s de Playwright). Gitleaks sem achados. |
| `make check`, duas vezes seguidas, sobre a árvore final do Incremento C (Tasks 0–6 integradas mais o fix round 1 da Task 5, HEAD `e195128`, antes deste commit de documentação) | Aprovado, EXIT 0 nas duas, ~1m37s e ~1m33s de relógio. Frontend: **376 testes em 31 arquivos**, cobertura de 100% nos quatro eixos (641/641 instruções, 412/412 ramificações, 204/204 funções, 620/620 linhas) — idêntico nas duas rodadas. `uv lock --check` aprovado. Ruff sem achados, 83 arquivos já formatados. mypy sem problemas em 79 arquivos. Backend: 465 testes, 1 aviso, cobertura total de 100% (1076 instruções, 180 ramificações) — inalterado pelo C, que não toca `src/focusquest/`. E2E: **16 cenários** aprovados em Chromium (17,1 s e 14,5 s de Playwright) — os 13 do B mais os 3 novos da Task 6 do C. Gitleaks sem achados nas duas. |
| `make check-e2e`, duas vezes seguidas, sobre a mesma árvore (prova de que a trilha, semeada uma vez por semana, não reprova com `409 plano_existente` na segunda rodada) | Aprovado, EXIT 0 nas duas (~21,8 s e ~19,2 s de relógio, incluindo `reset-test-db` + build + Playwright). **16 passed** nas duas (17,0 s e 14,6 s de Playwright) — idêntico à contagem das duas rodadas de `make check` acima. |
| `make check`, rodado por mim direto, sobre a árvore da onda final de correções do C (HEAD `f1c2276` com as correções m1–m4, R14 e esta documentação por cima, antes do commit) | Aprovado, EXIT 0, 99,5 s de relógio. Frontend: **384 testes em 31 arquivos** (os 376 da Task 7 mais os da onda final), cobertura de 100% nos quatro eixos (641/641 instruções, 416/416 ramificações, 204/204 funções, 622/622 linhas). ESLint e Prettier sem achados. `uv lock --check` aprovado (59 pacotes). Ruff sem achados, 83 arquivos já formatados. mypy sem problemas em 79 arquivos. Backend: 465 testes, 1 aviso, cobertura total de 100% (1076 instruções, 180 ramificações) — inalterado. E2E: **16 cenários** aprovados em Chromium (15,9 s de Playwright). Gitleaks sem achados. |
| `make check-e2e` sozinho, logo depois, sobre a mesma árvore (depois das mudanças no E2E: m3, R13, R14) | Aprovado, EXIT 0, 19,8 s de relógio (`reset-test-db` + build + Playwright). **16 passed** (15,2 s de Playwright). |
| `npx vitest run --reporter=verbose 2>&1 \| grep -c "not wrapped in act"` no frontend, antes e depois da onda final | **4 antes** (HEAD `c15318a`): 2 de `App.test.tsx`, 1 de `Campaigns.test.tsx` e 1 de `MissionList.test.tsx`. **1 depois**: só o de `MissionList.test.tsx` ("T7: se operationIdFor lancar antes do POST…"), que já existia na base do B. Nenhum aviso vem de arquivo do C. |

## Ambiente verificado

Node 24.21.0 / npm 11.19.0; Python 3.14.7 (o do `.venv`); uv 0.12.13;
Docker 29.7.2 com daemon rodando; Compose v5.5.1; git 2.55.0; gh 2.100.0.

**Máquina Linux (x86_64, kernel 7.0), desde o Incremento B** — a máquina em
que o B foi medido, e não substitui a linha acima (macOS), que registra onde
os incrementos anteriores foram medidos: Node v24.21.0, npm 11.19.0,
Python 3.14.7, uv 0.12.15, Docker 29.8.1, Compose v5.5.1, git 2.43.0,
gh 2.101.0, GNU Make 4.3.

**Versões fixadas do gate:** Gitleaks 8.30.1 (checksums do tarball e do
binário extraído em `scripts/install-gitleaks.sh` — os dois valores ficam
só ali, não duplicados aqui; procedimento de atualização em
`docs/QUALITY.md` §7); Ruff, mypy, pytest e as dependências da aplicação
conforme `uv.lock`; Prettier 3.9.7, Vitest 5.0.1, `@playwright/test` 1.63.0
e `@axe-core/playwright` 4.13.0 conforme `frontend/package-lock.json`;
PostgreSQL `postgres:18.6-alpine` no `compose.yaml` e no workflow.

## Setup (clone ou worktree novo)

`make bootstrap` **não** instala hooks de git — só dependências. Em
qualquer clone ou worktree novo, rode os comandos abaixo, nesta ordem
(detalhado, com o porquê de cada passo, em `docs/QUALITY.md`, seção
"Primeiro uso após clonar"):

```bash
make bootstrap
uv run pre-commit install --install-hooks
cp .env.example .env
make db-up
make migrate-test
make check
```

Sem o comando dos hooks, commits e pushes não passam por nenhuma validação
local, sem aviso. Sem o `.env` e o `make db-up`, o `check-api` e o
`check-e2e` reprovam.

**A chave real da Anthropic não entra neste roteiro.** O `.env` deste passo
fica com `FOCUSQUEST_ANTHROPIC_API_KEY=` vazio (decisão D-a, 1b-2): a chave
mora só no Keychain do macOS, e só quem for fazer a chamada real (Task 8 do
1b-2, `docs/HANDOFF.md` "Comandos") precisa dela, no ambiente do processo da
API, nunca no `.env` nem exportada no perfil do shell.

## Pendências

### Resolvidas pelo Incremento 1a

1. ~~**Backend sem código de aplicação.**~~ Resolvida: o pacote
   `focusquest`, com o módulo `missions`, a migração e as duas suítes de
   teste, existe desde este incremento.
2. ~~**`check-api` e `check-e2e` ainda não existem.**~~ Resolvida: os dois
   alvos estão no `Makefile` e no `make check`, e os dois jobs estão no
   workflow e no `quality-gate`. A fonte de verdade deles passou do
   `docs/QUALITY.md` §4 para o `Makefile`.
3. ~~**Divergência conhecida da spec: o `uv.lock` não é validado em lugar
   nenhum.**~~ Resolvida: `uv lock --check` é a primeira receita do
   `check-api`, local e no CI, e `uv sync --locked` roda no `make bootstrap`
   e no preparo dos jobs. Do lado npm fica uma assimetria **declarada**, não
   uma pendência esquecida: ver `docs/QUALITY.md` §4.

As outras três entradas da lista anterior (integração remota, `AGENTS.md` e
`CLAUDE.md`, `docs/ARCHITECTURE.md`) eram registros de conclusão do
Incremento 2, não pendências abertas; estão resumidas em "Incrementos
anteriores", abaixo.

**O Incremento A resolveu, por sua vez, as pendências 1 e 7 da lista
"Abertas"** logo a seguir — os dois 409 sem `code` legível por máquina, e o
relógio não injetável. Estão riscadas nos itens 1 (seção "Contrato e API")
e 7 (seção "Domínio e persistência"), com o texto de como cada uma foi
fechada.

### Abertas

Cada item foi conferido no código ou medido nesta sessão. Nenhum é bug
esquecido: são recortes e limitações conhecidas, com a consequência de
ninguém mexer.

**Contrato e API**

1. ~~**Os dois 409 não têm `code` legível por máquina.** Transição ilegal e
   `operation_id` gasto só se distinguem pela mensagem em português, e a
   ação correta do cliente é oposta nos dois (não há o que repetir, contra
   gerar um identificador novo e repetir o mesmo corpo). Não entrou agora
   porque a tela do 1a só lista missões e nenhum dos dois 409 é alcançável
   por ela. **Quem construir o fluxo de concluir missão no frontend precisa
   resolver isto antes**, ou vai ramificar em texto de interface.~~
   **Resolvida no Incremento A:** todo erro de domínio responde
   `{"detail": ..., "code": ...}`. Os códigos são `missao_nao_encontrada`
   (os dois 404, idênticos byte a byte), `transicao_ilegal` e
   `operacao_reutilizada`, no enum `CodigoDeErro` de `main.py`. O 422 de
   validação continua no formato do FastAPI, sem `code`.
   ~~**E a prosa do `detail` também não está pronta para a tela**, ao contrário
   do que o comentário de `frontend/src/shared/api/client.ts` afirma ("pode ir
   direto para a tela"): as mensagens do backend não têm acento
   (`"missao nao encontrada"`), e a de transição ilegal expõe o valor cru do
   enum (`'em_andamento'`), o que contraria a regra do próprio frontend de
   nunca mostrar estado cru. Hoje é inalcançável — a tela só faz GET —, mas
   precisa ser resolvido junto com o `code`, antes de ligar o fluxo de
   conclusão.~~ **Resolvida no Incremento A:** o cliente HTTP não lê mais o
   `detail`. O `ApiError` carrega `status` e `code`, e a `message` dele é
   escrita pelo cliente (`O servidor respondeu 409.`). A conclusão traduz o
   `code` por um mapa exaustivo sobre o tipo (`completionFailure.ts`), e um
   `code` desconhecido cai numa mensagem genérica. O comentário de
   `client.ts` foi corrigido.
2. **O `/openapi.json` não expressa a exigência de fuso em `deadline`.** O
   schema diz só `date-time`; a recusa do datetime sem fuso é verificada em
   runtime. Um cliente gerado do schema só a descobre ao receber o 422.
   Anotar `pattern` foi recusado porque boa parte dos geradores de cliente
   não o honra sobre `date-time`.
3. **Não existe endpoint de iniciar missão.** `em_andamento` e `started_at`
   existem no modelo e no domínio, mas as rotas não os alcançam, e
   `actual_duration_minutes` sai sempre `null` pela API.
4. **A trava da linha é adquirida antes da checagem de dono.**
   `concluir_missao` faz `SELECT ... FOR UPDATE` e só depois compara o
   `user_id`. Com usuário único é inofensivo; com autenticação, um pedido
   com o usuário errado seguraria a linha até o rollback. Resolver junto com
   a autenticação.
5. **Autenticação e autorização por recurso não existem** (decisão A2). Entram
   antes de existirem contas reais (README §8).

**Domínio e persistência**

6. ~~**O prazo é exibido no fuso de quem lê, não em `America/Sao_Paulo`.** O
   `Intl.DateTimeFormat` de `MissionList.tsx` não fixa `timeZone`, e o
   README §8 manda apresentar em `America/Sao_Paulo`. O instante está certo
   (o atributo `dateTime` do `<time>` carrega a string ISO com fuso); o
   texto visível muda com o fuso da máquina.~~ **Resolvida na onda de
   correção final:** `timeZone: 'America/Sao_Paulo'` no formatador; teste de
   unidade com `2026-09-20T02:30:00Z` (19/09 às 23:30 em São Paulo, 20/09 em
   UTC) rodando com o fuso do processo fixado em `Asia/Tokyo`; e o E2E, com o
   navegador em `Asia/Tokyo`, confere o texto do prazo. Provado nas duas
   direções: sem o `timeZone`, o teste de unidade e o E2E reprovam.
7. ~~**O relógio não é injetável.** `concluir_missao` usa `datetime.now(UTC)`
   direto, e o README §8 pede relógio injetado nos testes. Os testes
   compensam com asserção de janela de tempo.~~ **Resolvida no Incremento
   A:** `core/clock.py` expõe a dependência `get_clock`, que entrega o
   **relógio** (`Clock = Callable[[], datetime]`), e não o instante;
   `concluir_missao` recebe o relógio como argumento obrigatório e o lê
   **depois** do `SELECT ... FOR UPDATE` (decisão C13 da spec do ciclo
   diário). `test_relogio_e_lido_com_a_linha_ja_travada` prova a ordem com
   uma sonda `FOR KEY SHARE NOWAIT`, e os testes afirmam o `completed_at` por
   igualdade com um instante fixo. A API troca o relógio por
   `dependency_overrides`; não há gancho de teste no código de produção.
8. **O modelo `User` mora em `modules/missions/models.py`**, como dívida
   consciente: criar um módulo `users` para uma tabela de uma linha seria a
   camada vazia que o README §3 proíbe. O módulo `users`, quando nascer,
   precisa remover a classe daqui, ou o SQLAlchemy recusará a tabela
   duplicada.
9. **Modelo e migração descrevem as mesmas restrições em dois lugares, e só
   os `CHECK` de `missions` têm teste de divergência** (compara o que o
   PostgreSQL descreve para a tabela real e para uma cópia criada a partir
   do modelo). Não existe teste de comparação geral entre modelo e migração
   (`compare_metadata` do Alembic, que de todo modo não compara `CHECK`); um
   `CHECK` novo em `mission_operations`, ou outra divergência fora dos
   `CHECK` de `missions`, não é detectado por teste dedicado.
   **Cresceu no Incremento B:** os `UNIQUE` (`uq_weekly_plans_id_user_id`,
   `uq_missions_plan_id_day`), o índice único parcial
   (`uq_missions_especial_por_plano`) e a FK composta
   (`fk_missions_plano_do_usuario`, MATCH SIMPLE) **não** entram no teste de
   divergência — só os `CHECK`. São provados por **recusa nomeada** (cada
   teste de `test_cycle_models.py` insere o que a restrição deveria barrar e
   afirma o nome dela no erro do PostgreSQL), não pelo teste que compara
   modelo e migração. Medido na Task 2: remover
   `op.alter_column("missions", "mission_type", server_default=None)` da
   migração (um `server_default`, não um `CHECK`) não reprova o teste de
   divergência — só o teste de INSERT cru dedicado o pega.
10. **`run_migrations_offline()` do `alembic/env.py` não é exercitado** por
    nenhum teste. `alembic/` está fora do denominador de cobertura e o
    projeto não usa o modo offline.
11. **O valor 55432 está repetido** no padrão de `FOCUSQUEST_DB_PORT` do
    `Settings` (onde o campo existe só para o `.env` ser aceito), no
    `compose.yaml`, no `.env.example` e no workflow. Nada detecta se eles
    divergirem.

**Configuração e operação**

12. **O `Settings` só é estrito no `.env`.** Medido: qualquer chave do
    `.env` da raiz que não seja campo do `Settings` — com ou sem o prefixo
    `FOCUSQUEST_` — reprova com `extra_forbidden`; já uma variável
    `FOCUSQUEST_*` desconhecida vinda do ambiente do processo é descartada em
    silêncio. Um erro de digitação numa variável opcional exportada no shell
    ou no CI passaria despercebido (hoje só há um campo opcional,
    `db_port`).
13. **Não há configuração de logging.** Nenhum `basicConfig` ou `dictConfig`
    no código. Medido fora do uvicorn: sem handler na raiz, só o `WARNING`
    ou acima chega ao stderr, pelo `lastResort` do Python — o `INFO` de
    "missão não encontrada" não aparece; o `WARNING` de acesso negado,
    sim. Sob o uvicorn não foi medido.
14. **A engine é uma global de módulo em `core/database.py`**, não um recurso
    do `lifespan` do app: há uma corrida teórica na criação e nenhum
    `dispose()` no desligamento. Movê-la para o `lifespan` é mudança de
    contrato, não refatoração: a engine passaria a nascer na partida, e o
    `/health` deixaria de responder sem configuração de banco — que é o que
    um teste exige hoje.
15. **Duas `DeprecationWarning` de dependência** aparecem em toda execução do
    pytest: o `TestClient` do Starlette pedindo outro pacote no lugar do
    `httpx`, e o alias `anyio.abc.BlockingPortal`. Não são deste código;
    pedem uma decisão de `filterwarnings` em tarefa própria.
16. **O interpretador do projeto no PyCharm aponta para o Python do
    Homebrew, não para o `.venv`.** `.idea/` é ignorado pelo git e não foi
    alterado às cegas. Efeito: avisos de import não resolvido no editor; o
    gate e os testes não são afetados.
17. **Não existe `.run/`** com as configurações de execução compartilhadas
    que o README §4 pede (API, frontend, testes, gate).

**Gate e E2E**

18. ~~**Os jobs `check-api` e `check-e2e` nunca rodaram no GitHub Actions**, e
    o caminho do `pre-push` pelas variáveis do framework `pre-commit`, com o
    `check-api` no gate, nunca foi exercitado por um `git push` real.~~
    **Resolvida em 2026-09-18.** Os dois jobs rodaram e passaram no PR #4, junto
    com `check-web`, `check-secrets` e o `quality-gate`. O `pre-push` validou,
    com o `check-api` no gate, cada ref empurrada em worktree limpo: a do 1a e
    as das branches dos PRs #5 e #6.
19. **`check-api` e `check-e2e` não podem rodar ao mesmo tempo na mesma
    máquina** — nem dois `make check`, nem um `make check` e um push. A
    fixture do pytest faz `DROP SCHEMA` no banco que a API do E2E usa, e o
    E2E usa **três** portas fixas: 8100 (API), 5273 (frontend) e 8150
    (servidor falso, desde a Task 6 do 1b-2). No CI não há corrida: cada job
    tem o seu PostgreSQL. **Continua aberta no Incremento B** — o
    `reset-test-db` novo (pendência 20) não muda esta restrição: ele
    recria o esquema, mas ainda é o mesmo banco `focusquest_test`
    compartilhado, e ainda reprova alto se rodar junto com um `check-api`.
20. ~~**Cada execução do E2E deixa linhas no `focusquest_test`**, que só somem
    no próximo `DROP SCHEMA` da suíte pytest. Medido depois de um `make
    check` completo, na Task 7 do 1b-2: **6 missões** (as 4 do
    `headquarters.spec.ts`, duas delas concluídas, a confirmada em (a) e a
    semeada em (d)), **7 mensagens** da tutoria ((a) 2, (b) 2, (c) 3) e **2
    ações** ((a) e (b)). `make check-e2e` rodado repetidamente, sem o
    `check-api` no meio, acumula por execução — medido: +6 missões, +7
    mensagens e +2 ações (12/14/4 depois da segunda). A conversa da tutoria
    é uma só, e a tela mostra as últimas 50 mensagens: por isso todo texto
    que um cenário localiza, inclusive o que o falso devolve, carrega o
    sufixo `EXECUCAO`.~~ **Resolvida no Incremento B (Task 6):** o
    `check-e2e` passou a ter `reset-test-db` como pré-requisito — recria o
    esquema `public` do banco de teste do zero e reaplica as migrações antes
    de cada execução, no lugar de `migrate-test` (que só migrava, sem
    apagar). Um `make check-e2e` seguido de outro, sem `check-api` no meio,
    volta a partir de esquema limpo em vez de acumular linhas — necessário
    porque o plano semanal do ciclo diário é único por semana
    (`uq_weekly_plans_user_id_week_start`), e sem isso o segundo
    `check-e2e` reprovaria com `409 plano_existente` ao semear o mesmo
    plano de novo (spec do ciclo diário, C17). **Confirmado**, commit
    `50e2150`: `make check-e2e` rodado duas vezes seguidas (antes do
    `cycle.spec.ts` da Task 9) — **11 passed** nas duas, o critério de
    aceite do brief da Task 6.
21. **O axe audita quatro estados** — a lista carregada, o erro de
    carregamento, a missão recém-concluída e o aviso de falha da conclusão
    —, **mas não o de carregando, nem o de envio** ("Concluindo…"), **nem o
    de espera do quadro** ("Aguardando a conclusão em andamento…", Task 6),
    que só os testes de unidade cobrem. **Achado na rodada de correção 1 da
    Task 6:** um botão com foco perde o foco no Chromium quando fica
    `disabled` — o `activeElement` vira `body`. É o caso do "Atualizar o
    quadro" durante a espera: quem o ativou pelo teclado e o mantinha
    focado perde o foco assim que ele desabilita. Nem o E2E nem o axe
    auditam isso. **Desde a Task 7 do 1b-2**, o axe audita também a tutoria
    nos estados escrevendo (resposta presa no meio pelo falso), proposta,
    indisponível e a folha aberta do celular. **Desde a Task 6 do
    Incremento C**, o axe audita também Campanhas — a trilha da semana
    carregada, com o plano semeado (7 dias, hoje concluído, dias futuros
    como baú, especial bloqueada) — e o Quartel-General de novo, **depois
    de voltar** a ele pela navegação (não só o primeiro carregamento), os
    dois no viewport padrão (desktop). **O celular de Campanhas (390×844)
    não é auditado pelo axe**: o cenário mede só navegação visível, ausência
    de rolagem horizontal e ausência de sobreposição de botões (README §7)
    — ao contrário do `describe('(e) celular')` da tutoria (1b-2), que já
    chama o axe dentro do viewport móvel; ver pendência 61. **Continuam
    fora**, cobertos só no Vitest: o carregando do painel (esqueleto), o
    "Enviando…" antes do `user_message`, os estados do cartão depois da
    decisão (executada, recusada, falhou) e o aviso de falha do envio
    (herdados do 1b-2); e, novos do C, o carregando (`trail-loading`), o
    erro (`trail-error`) e o "sem plano" (`trail-no-plan`) da trilha, o
    aviso `trail-stale` de atualização falha, e o botão "Ir ao
    Quartel-General" da trilha (`trail-go-headquarters`) — nenhum é
    alcançado pelo cenário semeado do E2E, que sempre tem um plano
    carregado com sucesso.
22. **Um `package-lock.json` defasado passa no `make check` local e reprova no
    CI** — assimetria declarada em `docs/QUALITY.md` §4.
23. **Na sessão de um agente, a tabela de cobertura por arquivo do Vitest sai
    vazia** (`docs/QUALITY.md` §3). Não é evidência de 100%; a evidência é o
    limiar e o resumo.
24. **Arquivos órfãos no frontend:** `frontend/src/App.css` e
    `frontend/src/assets/` (`hero.png`, `react.svg`, `vite.svg`) não são
    importados por nenhum módulo — restos do scaffold do Vite. Remover é
    mudança de código, fora do escopo da documentação.
25. **Dependência do proxy do Vite.** No dia em que o frontend for servido por
    outra coisa que não o Vite, falta CORS ou um proxy reverso.

**Registradas pela revisão final da branch** (diferidas durante a execução e
que não tinham chegado aqui)

26. **Decisões de produto em aberto: teto de negócio para `estimated_minutes`
    e janela de negócio para `deadline`.** Hoje a API só recusa o que o
    armazenamento não representa (int4 e a faixa do `datetime` em UTC). Uma
    missão de um milhão de minutos, ou com prazo no passado, é aceita.
    Ficou em aberto de propósito: quanto tempo cabe numa missão e que prazo
    faz sentido são decisões de produto do dono, não correção. Se ninguém
    decidir, o sistema aceita dado absurdo — não quebra. Pesa mais no 1b,
    em que quem propõe a missão é um LLM.
    **Decidido pelo dono em 2026-09-18, ainda não implementado:** as missões
    são **diárias (24 h)** e **reveladas semanalmente**, e uma sequência de 7
    dias leva a uma **missão especial com bônus de XP**. Não entrou no 1a por
    dois motivos. Primeiro, um teto global de 1440 minutos em
    `estimated_minutes` pode contradizer a missão especial, cuja duração o
    design ainda não fixou. Segundo, a janela do prazo depende de como a
    revelação semanal distribui as missões. Os limites de negócio entram no
    incremento que introduzir o ciclo diário, e esse incremento começa por
    design próprio.
    **Parte implementada pelo Incremento B:** as missões **diárias** e a
    **especial** têm agora teto de negócio e prazo derivado — teto de 1440
    minutos (`MINUTOS_DO_DIA`/`ck_missions_estimativa_do_ciclo`) e prazo
    igual ao fim do dia civil em São Paulo para a diária
    (`fim_do_dia`/`dia_da_diaria`), ou ao fim do dia seguinte ao marco para a
    especial (`fim_da_janela_da_especial`, C8). **A avulsa continua em
    aberto:** ela não ganhou teto nem janela novos — `estimated_minutes`
    dela segue limitado só pelo int4, e `deadline` só pelo que cabe no
    `datetime` em UTC, exatamente como antes do B.
27. ~~**A guarda da faixa do prazo supõe a sessão do PostgreSQL em UTC.** O
    banco devolve o `timestamptz` no `TimeZone` da **sessão**, e o psycopg
    não lê um instante que, nesse fuso, cai fora dos anos 1 a 9999. Medido:
    `9999-12-31T23:59:59Z` é lido com a sessão em UTC e em
    `America/Sao_Paulo`, mas estoura (`DataError`) com a sessão em
    `Asia/Tokyo`; `0001-01-01T00:00:00Z` estoura com a sessão em São Paulo.
    O servidor deste projeto usa UTC, e a guarda basta. Diferido porque
    fixar o fuso da sessão (por exemplo `options=-c timezone=UTC` na engine)
    muda também o offset que a API devolve, e ficou fora do escopo da onda.
    Se ninguém mexer: num banco com outro fuso, um prazo a poucas horas das
    bordas volta a deixar a listagem em 500 — o teste
    `test_prazo_no_ultimo_instante_representavel_e_aceito_e_lido` reprova se
    o fuso da sessão mudar para leste de UTC.
    **Conserto aceito pelo dono em 2026-09-18:** fixar `timezone=UTC` na
    conexão da engine, num commit logo depois do merge deste incremento. O
    mesmo commit corrige a docstring daquele teste, que diz avisar qualquer
    mudança de fuso e só avisa a leste.~~
    **Resolvida na branch `fix/sessao-em-utc` (2026-09-18), mesclada à
    `main` pelo PR #5 e integrada ao Incremento A por merge:**
    `create_engine_from_url` registra um `SET TIME ZONE 'UTC'` em toda
    conexão nova, e o `alembic/env.py` passou a criar a engine por ela — as
    engines da aplicação, da suíte e do Alembic nascem no mesmo lugar. O
    mecanismo **não** é o `options=-c timezone=UTC` previsto acima: o
    servidor processa primeiro as `options` do pacote de partida e só depois
    os demais parâmetros, onde a `libpq` põe o `PGTZ` — o último aplicado
    vence, e com `PGTZ` definido o servidor fica com o fuso dele (medido com
    PostgreSQL 18 e libpq 18).
    Teste novo, `tests/integration/test_sessao_em_utc.py`, com `PGTZ` em
    `Asia/Tokyo` e em `America/Sao_Paulo`: `SHOW TimeZone` responde `UTC` em
    dois usos da mesma conexão; `9999-12-31T23:59:59Z` (pedindo leste) e
    `0001-01-01T00:00:00Z` (pedindo oeste) são aceitos e lidos pelo GET com
    200; e o reenvio de `/complete` devolve o mesmo corpo da primeira
    conclusão. Sem o `SET`, os seis casos reprovam; com o `options` no lugar
    dele, também. A suíte inteira passa com `PGTZ` em cada um dos dois
    fusos. Efeito no contrato: todo instante lido do banco sai com `Z`; o 201
    da criação continua ecoando o prazo com o offset que o cliente mandou
    (`docs/ARCHITECTURE.md`).
28. **`/ready` responde 500 — e não 503 — sem configuração de banco.** Sem
    `FOCUSQUEST_DATABASE_URL` no ambiente e no `.env`, a dependência
    `get_engine` estoura `ValidationError` antes do `try` que traduz a falha
    do banco em 503 (medido). Diferido desde a Task 4, com decisão
    registrada: 500 também reprova a probe, e a distinção
    liveness/readiness foi a parte mais delicada da execução. Se ninguém
    mexer: um orquestrador vê "não pronto" do mesmo jeito; quem ler só o
    status não distingue "banco fora" de "implantação sem configuração". O
    `docs/ARCHITECTURE.md` descreve os três casos.
29. **Os comandos dependem de rodar da raiz do repositório.** O `Settings` lê
    o `.env` do diretório **corrente**, e o `alembic.ini` também é achado
    pelo diretório corrente. Medido fora da raiz: a aplicação estoura
    `ValidationError` (campo obrigatório ausente) e o `alembic` reprova com
    `No 'script_location' key found in configuration`. Falha alta, não
    silenciosa. Diferido porque o `Makefile`, o CI e o `scripts/e2e-env.sh`
    (que faz `cd` para a raiz) já rodam da raiz. Se ninguém mexer: quem
    rodar `uv run uvicorn` ou `alembic` de outro diretório recebe o erro e
    precisa voltar para a raiz.
30. **`/api/missions/` com barra final responde `307`** para
    `/api/missions` (redirecionamento automático do Starlette; medido). O
    cliente do frontend chama sem a barra, então nada quebra hoje. Diferido
    por ser informação de contrato, não defeito; está no
    `docs/ARCHITECTURE.md`. Se ninguém mexer: um cliente que não siga
    redirecionamento recebe 307, e um que siga faz um ida e volta a mais.
31. **Dívida cosmética de teste e de editor.** (a) Um `monkeypatch`
    redundante em `tests/integration/test_health.py`, apontado na revisão
    da Task 4 — o registro da execução não diz qual linha; o candidato é um
    dos dois `delenv` de `test_health_responde_sem_configuracao_de_banco`
    (o `Settings` exige as duas URLs, e apagar uma já basta), e **não** o
    `setattr(database, "_engine", None)`, que é o que dá dente ao teste. (b)
    O Pyright do editor avisa sobre `@contextmanager` anotado com
    `-> Iterator[int]` em vez de `-> Generator[...]` em
    `tests/integration/test_missions_concorrencia.py`; o mypy e o gate não
    acusam. Se ninguém mexer: nada muda no comportamento.

**Criadas pelo Incremento A**

32. **O tipo `MissionErrorCode` do frontend espelha o `CodigoDeErro` do
    backend à mão.** Nada amarra os dois. Um `code` novo no backend, sem a
    linha no frontend, cai na mensagem genérica ("Não foi possível confirmar
    a conclusão…"), que é segura mas imprecisa. Os handlers também não
    declaram `responses`, então o `/openapi.json` não publica o corpo de
    erro. Amarrar de verdade pediria gerar os tipos a partir do OpenAPI.
    **Atualizada no 1b-2 (continua aberta):** desde o 1b-2, são **dois**
    espelhos à mão no frontend: `MissionErrorCode`
    (`features/missions/types.ts`) e, na tutoria, `PreStreamErrorCode`,
    `StreamErrorCode` e `ActionErrorCode` (`features/tutoring/types.ts`),
    que espelham o `CodigoDeErro` de `main.py` **e** o `CodigoDoStream` de
    `tutoring/domain.py`. O desenho de segurança é o mesmo do A: um `code`
    que o backend acrescente sem a linha no frontend cai no texto genérico
    (`UNKNOWN_RESULT` ou o genérico do cartão), que é seguro — oferece
    repetir com a mesma chave — mas impreciso. Amarrar continua pedindo
    gerar os tipos do OpenAPI, e os códigos do stream nem estão no OpenAPI
    (viajam dentro de um 200).
    **Cresceu no Incremento B:** `DAYS_PER_MILESTONE = 7`
    (`frontend/src/features/missions/types.ts`) espelha `DIAS_POR_MARCO` de
    `cycle_domain.py` à mão, mesmo desenho — a tela precisa do número para
    "N de 7" (decisão P10). E `MissionErrorCode` ganhou a entrada
    `'missao_expirada'`, espelhando o quarto `code` novo do ciclo
    (`missao_expirada`, `plano_existente`, `semana_encerrada`,
    `semana_distante`) — só este chega à tela pela rota de concluir; os
    outros três só aparecem em `POST /api/plans`, que o B ainda não tem
    formulário nenhum (não há tela de criar plano no B; a spec não
    pede uma, e o C encontra pronto o `GET /api/plans/current`).
33. **`crypto.randomUUID` só existe em contexto seguro** (HTTPS, `localhost`,
    `127.0.0.1`). O servidor de desenvolvimento (`localhost`) e o do E2E
    (`127.0.0.1`) são contextos seguros; o E2E prova o segundo, e o
    `isSecureContext` do Chromium em `http://127.0.0.1` foi medido `true`.
    Um frontend aberto por HTTP num IP de rede —
    testar pelo celular em `http://192.168.x.x:5173`, por exemplo — não tem
    a função, e o clique em Concluir lançaria `TypeError` antes de o pedido
    sair. **Não medido**; é o que a especificação da Web Crypto diz. Se
    ninguém mexer, o botão parece não fazer nada nesse cenário.
    Desde o 1b-2, o `crypto.randomUUID` gera também o `client_message_id`
    da pergunta à Tifa (Task 3) e, na Task 5, o `operation_id` da
    confirmação da proposta: no mesmo cenário, o Enviar lançaria
    `TypeError` antes do pedido. Continua **não medido**.
34. **`useCompleteMission` não se protege sozinho contra envio duplo.** A
    única guarda é o `disabled` do botão, que é testada; o hook em si aceita
    dois `complete()` no mesmo tick. Medido pela revisão final: dois
    `complete()` no mesmo tick mandam **dois POSTs com a mesma chave**, e o
    servidor responde 200 aos dois **sem duplicar**, porque a chave é
    idempotente e a trava serializa. O risco que sobra é cosmético: a ordem
    dos `setState` pode deixar a tela em "falhou" com a missão de fato
    concluída, e o "Tentar de novo" recupera. Ficou assim porque há um único
    consumidor do hook. Um segundo consumidor herda o risco.
    **Atualizada na Task 5 do 1b-2:** `useDecideAction` herda a mesma forma:
    não se protege sozinho contra dois `confirm()` no mesmo tick; a guarda é
    o `disabled` dos botões, testada (C3). Com a chave idempotente, dois
    POSTs no mesmo tick não criam duas missões (o backend prova isso:
    `test_dois_confirmar_com_a_mesma_chave_criam_uma_missao`, em
    `tests/integration/test_tutoring_acoes.py`).
35. ~~**"Atualizar o quadro" descarta a chave de uma conclusão em voo em outro
    cartão.** `useCompleteMission(listed.id)` é instanciado por cartão, e o
    `reload` de `useMissions` remonta os cartões. Medido: com o POST da
    missão A pendente, clicar em "Atualizar o quadro" por causa da missão B
    e depois em Concluir na A faz a A sair com **chave nova**. Não duplica:
    o `FOR UPDATE` serializa e a segunda recebe `transicao_ilegal`. Mas a
    tela diria "Esta missão já estava concluída" sobre a conclusão que ela
    mesma fez. A janela é estreita. Saídas: guardar as chaves por
    `missionId` acima do cartão, ou não desmontar a lista durante o reload.~~
    **Resolvida pela Task 6 do Incremento A**, com as duas peças: o
    "Atualizar o quadro" pedido com conclusão em voo espera e recarrega uma
    vez quando a última termina; e as chaves moram num registro por missão
    no `MissionList` (`useCompletionRegistry`), que não desmonta no reload.
    O cenário medido é o teste T3 de `MissionList.test.tsx`: `/7`, `/8`,
    "Atualizar o quadro" e `/7` de novo com a **primeira** chave. Provado por
    mutação: sem a espera, com a chave de volta no cartão, ou sem tirar a
    entrada no sucesso, o teste correspondente reprova.
36. **Um erro sem `code` que não se resolve sozinho** (um 422, ou um 404 de
    rota errada) oferece "Tentar de novo é seguro" para sempre —
    `describeCompletionFailure` cai em `UNCONFIRMED` com `recovery: 'retry'`
    e não escala. Hoje a tela não alcança esse caso, porque a chave é UUID
    (não colide) e o id vem da lista (não erra a rota).
37. **Um POST de conclusão que nunca termina segura o "Atualizar o quadro"
    para sempre.** A espera da Task 6 só acaba quando não resta conclusão em
    voo, e o `fetch` não tem timeout próprio: enquanto o navegador mantiver
    a requisição aberta, o botão fica em "Aguardando a conclusão em
    andamento…" e o quadro não recarrega sozinho. **Não medido** por quanto
    tempo o navegador mantém a requisição. Recarregar a página sai da
    espera, e a chave dessa tentativa se perde com ela (a pendência 35 era
    sobre a remontagem dos cartões, não sobre recarregar a página). Saída,
    se virar problema: um `AbortSignal.timeout` no `postJson`, tratado como
    falha de rede — resultado desconhecido, chave mantida.
38. **O registro de chaves (`useCompletionRegistry`) pode reter uma entrada
    além do necessário**, nos dois casos em que a missão com falha de
    resultado desconhecido (`recovery: 'retry'`) deixa de oferecer um
    Concluir que a solte:
    - a missão **some da lista**, apagada em outro lugar. A chave fica no
      registro até a página recarregar;
    - a missão **volta como `concluida`** num "Atualizar o quadro"
      seguinte, porque o servidor tinha mesmo concluído a operação cujo
      resultado o cliente não confirmou. O cartão não oferece mais
      Concluir (`concluida` é terminal, A5), então nada solta a chave, que
      fica no registro até a página recarregar.
    O crescimento é limitado — só cresce com falhas de resultado
    desconhecido, uma por missão — e não foi resolvido: fica registrado
    como limitação, não como bug esquecido.

**Criada pela correção do cache do CI (PR #7)**

39. **O `check-e2e` ainda vai à rede a cada execução, sem cache.** O passo
    `npx playwright install --with-deps chromium` roda `apt-get update`,
    instala pacotes de fonte por `apt` e baixa ~300 MB de navegador. Ficou
    sem cache de propósito (ver "Infraestrutura de CI: cache do Gitleaks"):
    o `apt` não é cacheável como diretório, e o baixador do Playwright já
    repete 5 vezes. Se ninguém mexer: uma queda de rede nesse passo reprova
    o gate (falha fechada), e o conserto é reexecutar o job depois de ler o
    log. Se o passo passar a reprovar com frequência medida, a próxima
    opção é uma imagem de contêiner com o navegador e as dependências já
    instalados, não um cache parcial.

**Criadas pelo Incremento 1b-1**

40. ~~**A camada 3 do servidor falso não existe ainda.** Ela grava a sequência
    de tipos de evento de uma chamada real (sem conteúdo) e confere que o
    falso emite a mesma sequência — o que as camadas 1 e 2 (`docs/QUALITY.md`
    §9) não veem: o falso poderia ser válido para o SDK e ainda assim
    diferente do que a API manda. Só existe depois de o dono fazer a chamada
    real, uma vez, com a chave dele (roteiro na pendência 42). Até lá, o
    1b-1 não afirma mais do que as camadas 1 e 2 provam.~~
    **Resolvida na Task 8 do 1b-2:** a referência foi gravada pela chamada
    real (`claude-opus-5`, `anthropic==1.7.0`, 2026-09-22) em
    `tests/integration/referencia_da_api_real.json`, e
    `tests/integration/test_camada3.py` compara o falso contra ela. **O que
    foi medido:** a primeira comparação **reprovou** — a API real manda um
    bloco de thinking antes do texto, e o falso não. O dono decidiu que o
    falso o emite (emenda E6 da spec); com isso, `test_camada3.py` ficou
    inteiro verde, e a troca de `message_delta` por `message_deltaX` na
    referência o faz reprovar. Sequência e resultados em "Resultados".
41. **O teto de `TAMANHO_MAXIMO_DA_PERGUNTA = 4000` caracteres é provisório e
    é decisão do dono.** É um teto **técnico** de custo (cada caractere vai
    ao modelo e volta nos turnos seguintes como histórico), não uma decisão
    de produto sobre quanto texto uma pergunta deveria ter — no mesmo
    espírito da pendência 26 (tetos técnicos de `missions` que esperam um
    teto de negócio do dono).
    Desde o 1b-2 o teto é aplicado também na tela (`MAX_QUESTION_LENGTH`,
    `features/tutoring/questionLimit.ts`), espelhado à mão; mudar o número
    é mudar os dois lados.
42. ~~**Roteiro da chamada real (1b-2), para gravar a referência da camada 3
    (pendência 40):** com a chave de verdade vinda do Keychain do macOS **só**
    para o processo da API (decisão D-a, emenda E1; nunca no `.env`) e o
    `anthropic_base_url` **sem** override, (a) pedir à Tifa uma proposta de
    missão; (b) confirmar a proposta pelo cartão; (c) ver a missão nova no
    Quartel-General; (d) gravar, sem o conteúdo do texto, a sequência de
    tipos de evento do stream dessa resposta, no arquivo que a camada 3 vai
    comparar. **O CI nunca chama a Anthropic** e nunca recebe a chave — a
    chamada é sempre manual, local, do dono.~~
    **Resolvida na Task 8 do 1b-2 (2026-09-22).** (d): a referência foi
    gravada pelo script `tests/integration/camada3.py`, uma vez (pendência
    40). (a)–(c): feitos pela tela em `http://127.0.0.1:5173`, com a API
    local subida com a chave do Keychain só para o processo e o
    `anthropic_base_url` padrão, modelo `claude-opus-5` (padrão do
    `Settings`). **Quem executou:** o agente, pelo navegador automatizado
    (Playwright), a pedido do dono — duas tentativas do dono pela tela não
    chegaram à API (o log de acesso mostrou só GETs e o banco ficou com 0
    mensagens), e a causa não foi diagnosticada. Medido, sem conteúdo:
    (a) `POST /api/tutoring/messages` 200, a resposta chegou pelo stream e
    o cartão da proposta apareceu; no banco, 1 mensagem `user` e 1 `tutor`,
    ambas `completa`; (b) `POST /api/tutoring/actions/{id}/confirm` 200, a
    tela mostrou "Missão criada" e a ação ficou `executada`; (c) a missão
    apareceu no Quartel-General (1 linha em `missions`) sem recarregar a
    página. No total o 1b-2 fez **duas** chamadas reais, as duas da emenda
    E2: a captura da camada 3 e esta, pela tela; as tentativas anteriores
    pela tela não chegaram à API e não geraram chamada.
43. ~~**A porta do servidor falso para o E2E (1b-2) soma-se às pendências 19 e
    20.** O E2E da tutoria precisa de um servidor falso de pé durante o
    Playwright, numa porta própria, dedicada — as mesmas duas exigências
    estruturais que já valem para a API e o frontend do E2E atual (portas
    8100/5273, `check-api` e `check-e2e` não simultâneos na mesma máquina).~~
    **Resolvida na Task 6 do 1b-2:** o falso sobe como `webServer` do
    Playwright na 8150 (`frontend/tests/e2e/servers.ts`), sem reuso.
44. **Nenhuma taxa de detecção de concorrência medida abaixo de 100% nos
    passos de mutação do 1b-1.** Registrado porque o plano pedia o registro
    de qualquer taxa parcial: as duas sondas de corrida real —
    `test_duas_perguntas_simultaneas_uma_so_gera` (Task 5) e
    `test_confirmar_e_recusar_em_paralelo_uma_decisao_vence` (Task 6, fix
    round 1/5) — discriminaram a mutação em **5 de 5** execuções cada, sem
    nenhuma passagem por acidente. Não há taxa parcial a acompanhar.
45. **Um `message_stop` com `stop_reason: max_tokens` grava a resposta como
    `completa`, e não como cortada.** A guarda da medição M3 cobre o corte de
    **transporte** (a conexão cai e a iteração termina em silêncio, sem
    `Fim`); ela não distingue um `Fim` que chega porque o modelo terminou de
    um `Fim` que chega porque o SDK bateu em `tutor_max_tokens`. Nos dois
    casos o serviço recebe o mesmo evento e grava `completa` — uma resposta
    truncada por falta de tokens parece inteira para o cliente e para o
    histórico do turno seguinte. **Continua aberta.** Desde o 1b-2 a
    consequência é visível: uma resposta cortada por `max_tokens` chega à
    tela como `completa`, sem marca, e o cartão de proposta não aparece se o
    corte veio antes do `tool_use`. A tela não tem como distinguir: o
    `MessageRead` não carrega o `stop_reason`. Resolver pede mudar o backend
    (gravar o `stop_reason`, ou tratar `max_tokens` como `interrompida`) —
    fora do escopo do 1b-2, que não muda `src/focusquest/`.
46. **Quando o recolhimento de órfãos já marcou a linha como `interrompida`,
    o `RespostaFalhou` ainda sai, mas o `UPDATE` condicional de `_encerrar`
    não grava nada** (ele só atualiza uma linha ainda `gerando`). Nesse
    caminho específico, a garantia "erro só depois de a falha estar gravada"
    fica verdadeira com uma leitura diferente da usual: o que está gravado
    quando o erro sai é `interrompida`, não `falhou`.
47. **`confirmar_acao` revalida o `payload` já armazenado com `MissionCreate`
    no momento da confirmação, não só no momento em que a proposta foi
    criada.** Um endurecimento futuro desse schema (um campo novo
    obrigatório, uma validação mais estrita) transformaria uma proposta já
    gravada — válida quando nasceu — num 500 na hora de confirmar, em vez de
    continuar aceita com as regras de quando foi criada.
48. ~~**A árvore de testes em `docs/ARCHITECTURE.md` não lista
    `tests/integration/test_install_gitleaks.py` nem
    `tests/integration/test_push_env.py`.** Os dois arquivos existem e rodam;
    a lacuna é só na documentação, e é anterior ao 1b-1.~~ **Resolvida na
    Task 9 do 1b-2:** a árvore de `docs/ARCHITECTURE.md` §1 foi regerada com
    `git ls-files` e lista os dois arquivos, junto com todo o resto de
    `tests/integration/`.

**Criadas pelo Incremento 1b-2**

49. **Um evento `error` com `code` desconhecido mostra o texto do resultado
    desconhecido (1b-2, Task 3).** O `useTutorConversation` o trata como
    `failed` com o `UNKNOWN_RESULT` ("Não deu para saber se a resposta
    chegou inteira…"), que é o que o `describeStreamFailure` devolve para um
    `code` fora do mapa — mas o backend já gravou a resposta como `falhou`,
    então a frase diz menos do que se sabe. Não há texto genérico de falha
    no `messageFailure.ts`, e inventar um é decisão de texto de interface:
    fica para o dono. O "Tentar de novo" continua certo (mesmo id). Na mesma
    revisão, o contador de geração do histórico deixou dois casos de fora,
    raros e sem medição: duas atualizações silenciosas em voo que chegam
    fora de ordem (a de uma falha anterior pode gravar por último), e o
    `updateAction`, que não invalida um GET mais velho que a confirmação.
50. **O campo acima do teclado virtual no celular
    (`interactive-widget=resizes-content`, folha ancorada em `bottom-0` com
    `max-h-[85dvh]`) não é medido por teste nenhum** (1b-2, Task 4): o
    Playwright não abre teclado virtual. O E2E (Task 7, cenário (e)) mede só
    a ausência de rolagem horizontal e o Enviar visível na folha aberta.
    Conferir num aparelho de verdade antes de afirmar.
51. **Um `gerando` deixado por uma execução do E2E interrompida à força**
    (Ctrl-C no meio de um stream) trava a conversa do `focusquest_test` até
    o órfão ser recolhido — `tutor_timeout_seconds` (60) mais 30 s de
    folga. Um `make check-e2e` rodado nesse intervalo recebe `409
    mensagem_em_andamento` na primeira pergunta e reprova. O `make check`
    completo não sofre disso: o pytest faz `DROP SCHEMA` antes. Saída, se
    incomodar: `FOCUSQUEST_TUTOR_TIMEOUT_SECONDS` curto no `env` da API do
    E2E. (Registrada pelo desenho; não reproduzida na Task 7.)
52. **O estado indisponível do E2E é produzido por `page.route` sobre
    `/api/tutoring/status`** (emenda E4); o caminho real "API sem chave" é
    provado só no pytest (`test_status_indisponivel_sem_chave`,
    `test_sem_chave_responde_503_e_nao_grava`). O `503
    provedor_nao_configurado` do `POST`, na tela, só no Vitest (P7).

**Criadas pelo Incremento B**

53. **A chave real da Anthropic mora no Keychain do macOS (decisão D-a), e
    esta sessão roda em Linux.** Não há cofre documentado nesta máquina —
    `secret-tool` (a alternativa usual de chaveiro no Linux) não está
    instalado, e a decisão D-a nunca previu onde a chave mora fora do
    macOS. Consequência medida: a chamada real à Anthropic pela tela
    (a mesma peça que gravou a referência da camada 3 no 1b-2, roteiro na
    pendência 42) **não é reproduzível nesta máquina** até o dono decidir
    onde a chave do Linux mora. Continua valendo, sem exceção, que ela
    **nunca** vai no `.env` (decisão D-a) — o Gitleaks do gate a acusaria, e
    o `pre-push` a levaria ao worktree do gate inteiro (mesma exposição
    medida no 1b-2). O ciclo diário em si não depende da Tifa nem da chave;
    a pendência é só sobre reproduzir aquele roteiro manual nesta máquina.
54. **O E2E do ciclo (`cycle.spec.ts`, Task 9) tem uma janela de corrida
    conhecida perto da meia-noite de São Paulo** (spec, "Riscos"): o
    cenário semeia o plano a partir do `today` que a própria API devolve e
    conclui a missão de hoje logo em seguida, mas se a semeadura e a
    conclusão caírem em lados diferentes da virada do dia civil em São
    Paulo, o cenário reprova — a diária que era "de hoje" na semeadura
    passa a ser "de ontem" (`perdida`) na conclusão. Ler o `today` da API
    em vez do relógio do navegador (que roda em `Asia/Tokyo` no
    `playwright.config.ts`) estreita a janela a poucos segundos ao redor da
    meia-noite de SP, mas não a fecha: não há nova tentativa automática nem
    teste pulado. Ficou assim de propósito — a spec já registra o risco
    como conhecido e aceito, não como defeito a corrigir no B.
55. **A Tifa não vê as diárias e a especial no contexto da conversa.**
    `tutoring/context.py` monta o turno com `listar_missoes`, que agora só
    devolve avulsas (decisão da Task 4: a listagem do módulo `missions`
    passou a filtrar por `mission_type == AVULSA`, para não vazar a diária
    ainda não revelada nem a trilha da semana para quem só lista missões).
    A Tifa, portanto, propõe e conversa sabendo só das avulsas pendentes —
    ela não sabe se o usuário já tem um plano semanal, quantas diárias
    faltam hoje, nem se a especial está disponível. Ligar o ciclo à tutoria
    (por exemplo, incluir o resumo do `GET /api/cycle` no contexto do
    turno) é trabalho do incremento que implementar `propose_plan` — fora
    do escopo do B, que não muda `tutoring/`.
56. **A rota de concluir relê a missão com `clock()` chamado de novo depois
    do commit** (`cycle_router.py`, achado registrado no ledger da Task 5,
    minor deferido): `concluir_missao` grava a conclusão com um relógio,
    faz o commit, e a rota então relê a missão chamando `ler_missao(session,
    missao, clock())` com uma **segunda** leitura do relógio, para montar a
    disponibilidade da resposta. Hoje isso é inofensivo, porque a
    disponibilidade de uma missão já `concluida` é sempre `concluida`,
    qualquer que seja o instante — mas um relógio que andasse **para trás**
    entre as duas leituras (por exemplo, um ajuste de NTP bem no instante da
    virada da meia-noite) poderia, em teoria, fazer essa segunda leitura
    calcular uma disponibilidade diferente da que a conclusão gravou, para
    um tipo de missão cuja regra dependa do instante de outro jeito no
    futuro. Não medido; registrado porque o ledger pediu o registro
    explícito, não porque haja um caso reproduzido de resposta errada.
57. ~~**A seção do ciclo não se atualiza sozinha na virada do dia com a aba
    aberta** (achado m2 da revisão final da branch, diferido de propósito).
    `useCycle` só refaz o `GET /api/cycle` por `refresh()` explícito
    (chamado depois de concluir uma missão); não há refetch em
    `visibilitychange` nem em `focus`. Consequência: uma aba deixada aberta
    de um lado para o outro da meia-noite de São Paulo continua mostrando o
    dia anterior — missão de hoje, sequência e progresso — até um `refresh`
    manual (recarregar a página ou concluir algo). Fica para o Incremento
    C, junto com a trilha da semana, que tem o mesmo problema em escala
    maior (sete dias, não um).~~ **Resolvida no Incremento C** (Task 5,
    decisão K7): `shared/hooks/useRefreshOnReturn.ts` chama `refresh()` em
    silêncio no `visibilitychange` (só quando `document.visibilityState ===
    'visible'`) e no `focus` da janela, ligado a `useCycle` **e** a
    `useCurrentPlan` (a trilha tem o mesmo problema, agora fechado junto).
    **Resíduo que a resolução não cobre, registrado como pendência 60
    abaixo:** trocar de área **dentro** do app (sem sair da aba) depois da
    meia-noite não dispara nenhum dos dois eventos — o Quartel-General
    oculto (K2) continua mostrando o dia anterior até a aba sair e voltar,
    ou até um recarregamento.
58. **Faltam testes de serviço para a especial EXPIRADA na trilha/`ler_missao`
    e para a diária PERDIDA na trilha** (triagem da revisão final da branch;
    já estava listado como "minor" diferido da Task 3, promovido a pendência
    aqui). `tests/integration/test_cycle_service.py` cobre a especial
    revelada e a avulsa na trilha, mas não o caso de a especial aparecer
    **expirada** (janela dos dois dias fechada) nem o de uma diária aparecer
    **perdida** na trilha da semana devolvida por `ler_plano_atual`/
    `ler_ciclo`. Nenhum dos dois estados é inalcançável — `Availability` já
    os modela —, só não tem teste que force a trilha a exibi-los.
    **Parcialmente fechada no Incremento C, só do lado do frontend** (Task
    3): `CampaignTrail.test.tsx` prova as duas exibições — "a especial
    expirada mostra a missão e 'Expirada'" e um dia revelado `perdida` com
    conteúdo — a partir de um `Plan` construído à mão no teste, não de uma
    resposta real de `ler_missao`/`ler_plano_atual`. **O que faltava
    continua faltando:** o teste de **serviço**, contra o PostgreSQL real,
    que force `ler_missao`/`ler_plano_atual` a produzir os dois estados —
    isso é backend, e o Incremento C, por desenho, não muda
    `src/focusquest/` (Autorrevisão do plano do C, "Pendências do B
    absorvidas"). Continua aberta.

**Criadas pelo Incremento C**

59. **O painel da Tifa não existe em Campanhas** (decisão K3, plano do C). A
    trilha da semana **só mostra**: nenhuma conversa, nenhuma proposta. Tirar
    o painel de `Headquarters.tsx` e colocá-lo em algum lugar comum às duas
    áreas exigiria um canal do shell da aplicação até o quadro de avulsas
    (`onMissionCreated`, `boardHref`) com o quadro às vezes desmontado —
    mudança na feature `tutoring` sem pedido de produto (K3 registra que é
    dívida deliberada, não descuido). Fica para o incremento que ligar a
    Tifa ao plano semanal (`propose_plan`), o mesmo que fecha a pendência 55
    (a Tifa não vê o ciclo no contexto da conversa) — as duas pendências
    convergem para a mesma peça de trabalho futuro.
60. **A troca de área *dentro* do app depois da meia-noite não atualiza o
    Quartel-General oculto** (decisão K7, custo declarado do plano do C).
    `useRefreshOnReturn` (pendência 57, acima) fecha o caso de a **aba**
    voltar a ficar visível ou receber foco — mas trocar de Quartel-General
    para Campanhas e voltar, sem a aba nunca perder o foco do sistema
    operacional, não dispara `visibilitychange` nem `focus`: nenhum dos
    dois eventos existe para "trocar de área dentro da mesma aba". Se a
    meia-noite de São Paulo cair enquanto alguém navega só entre as duas
    áreas sem trocar de aba nem de janela, o Quartel-General oculto continua
    mostrando o dia anterior (missão de hoje, sequência, progresso) até a
    aba sair de foco e voltar, ou até um recarregamento. Consequência
    aceita pelo plano (K7); resolver pediria um terceiro gatilho — por
    exemplo, `useRefreshOnReturn` reagir também à própria navegação de
    `App.tsx` — não desenhado nem medido aqui.
61. **A revisão visual de desktop e celular do README §7 não foi feita num
    navegador de verdade, por uma pessoa, nesta sessão** — nem para a
    navegação lateral (Task 1) nem para a trilha da semana (Tasks 3/4). O
    README §7 pede essa revisão **além** dos testes automatizados
    ("Revise visualmente desktop e celular, além dos testes automatizados"),
    e o pedido continua em aberto. **O que o E2E mede de fato, e cobre parte
    do risco:** `cycle.spec.ts` (Task 6) confere, a 390×844, que a barra de
    navegação fica visível, que não há rolagem horizontal
    (`document.documentElement.scrollWidth <=
    document.documentElement.clientWidth`) nas duas áreas, e que a caixa de
    `boundingBox()` dos dois botões da navegação não se sobrepõe à do botão
    fixo "Falar com a Tifa". **O que isso não mede:** aparência — contraste
    de cor real (o axe confere contraste **programático**, não julga a
    paleta do RPG), alinhamento e espaçamento visual, se o texto quebra de
    um jeito legível, se o marcador `▸` e os ícones SVG da trilha
    renderizam do tamanho e na posição pretendidos, e qualquer coisa que só
    um olho humano nota num navegador de verdade (Chromium do Playwright
    roda headless nesta máquina). Mesma lacuna, mesmo motivo, das Tasks
    anteriores que tocaram layout (Task 1, `c-nav-report.md`: "o layout do
    celular/desktop segue sem inspeção visual manual").

**Criadas pelo Incremento C — *minors* das revisões (Rulings R11 e R15)**

Os *minors* que as revisões de Task e a revisão final deixaram registrados
no ledger da sessão, um por item. Estão separados em três grupos, sem
inflar nenhum: dívida pequena **aberta** (vale fazer um dia), **aceita sem
ação** (a decisão é deixar como está, com motivo) e **verificada** (não é
pendência; fica o registro). Os que a onda final consertou (os avisos
`act()`, a grafia, o `caixasSeSobrepoem`, a medida do E2E do celular e o
caso de `civilWeekday`) não estão aqui: estão em "Alterações do Incremento
C".

*Abertas — dívida pequena*

62. **A raiz de `Headquarters.tsx` repete `min-h-screen` e o fundo**
    (`frontend/src/pages/Headquarters.tsx`, a `div` raiz: `min-h-screen
    bg-slate-950 text-slate-100 lg:flex`). Desde a Task 1 o `App.tsx` já
    envolve as duas áreas numa `div` com as mesmas classes; dentro dele, as
    da raiz do QG são redundantes (inofensivas: mesma cor, mesma altura
    mínima). Ficou da aterrissagem da Task 1 para não mexer em layout sem
    inspeção visual (pendência 61).
63. **`CampaignTrail.tsx` tem cerca de 370 linhas** (371, medido), com dez
    subcomponentes num arquivo só
    (`frontend/src/features/campaigns/CampaignTrail.tsx`). Candidato a
    decomposição (por exemplo, o dia, o baú e a especial em arquivos
    próprios) quando a trilha crescer; hoje está coberto a 100% e não há
    segundo usuário de nenhum subcomponente.
64. **Três títulos de teste E2E com acento fora de citação literal**
    (`frontend/tests/e2e/cycle.spec.ts`, os três cenários da Task 6:
    "Campanhas abre pela navegação…", "…Tab ate a navegação, Enter, e o
    foco vai para o título" e "a navegação fica visível no topo, sem
    rolagem horizontal, e não cobre…"). A convenção do arquivo é título sem
    acento, com acento só dentro de citação literal do texto da tela.
    Cosmético; trocar muda o nome do teste no relatório do Playwright.
65. **Não há teste com três ou mais pedidos concorrentes** em `useCycle` e
    `useCurrentPlan` (`frontend/src/features/missions/useCycle.test.tsx`,
    `frontend/src/features/campaigns/useCurrentPlan.test.tsx`). Os testes
    de corrida usam dois pedidos em voo (os dois eventos de
    `useRefreshOnReturn`). O contador de sequência é monotônico e a guarda
    compara com o valor corrente, então o caso de N pedidos se reduz ao de
    dois por construção — mas isso é argumento, não teste.
66. **`MAX_DIFFICULTY` existe, mas o "de 5" continua literal em dois
    lugares** (achado m5 da revisão final):
    `frontend/src/shared/types/mission.ts` exporta `MAX_DIFFICULTY = 5`, que
    a trilha usa; `frontend/src/features/missions/MissionCard.tsx` ("de 5"
    no `mission-difficulty`) e `frontend/src/features/tutoring/ProposalCard.tsx`
    ("de 5" no `proposal-difficulty`) ainda escrevem o número à mão. Nada
    amarra nenhum dos três ao `DIFICULDADE_MAXIMA` do backend. Não foi
    trocado aqui porque o C não mexe nas features `missions`/`tutoring` por
    estética; o comentário de `Mission.difficulty` foi corrigido para
    apontar os dois arquivos certos (antes citava `MissionList.tsx`).

*Aceitas, sem ação*

67. **O subtítulo de Campanhas não estava na spec**
    (`frontend/src/pages/Campaigns.tsx`: "A semana inteira, dia a dia, e a
    missão especial."). Veio do worktree da Task 1; a revisão o registrou e
    ele foi **aceito** como está — descreve a área sem prometer nada que a
    tela não faça.
68. **A *fixture* da Task 3 difere da do plano**
    (`frontend/src/features/campaigns/CampaignTrail.test.tsx`: hoje na
    quinta, progresso 3; o plano pedia quarta, progresso 1). **Aceita:**
    exercita mais ramos — uma semana só cobre `fora_do_plano`, `perdida`,
    `concluida`, `disponivel` e `bloqueada`, com um dia revelado a mais que
    a do plano — e os casos que o plano pedia continuam provados.
69. **`reload()` gasta dois números de sequência** (`useCycle.ts` e
    `useCurrentPlan.ts`: um incremento no próprio `reload`, outro no
    efeito que ele dispara). **Necessário, não cosmético:** o incremento no
    `reload` invalida na hora um `refresh` em voo (antes de o efeito rodar),
    e o do efeito é o `id` da nova carga. Um só dos dois deixaria uma janela
    em que a resposta atrasada do `refresh` ainda casaria.
70. **`refresh()` não tem guarda de desmontagem** (`useCycle.ts`,
    `useCurrentPlan.ts`): uma resposta que chega depois de o componente
    desmontar chama `setState` num componente que não existe mais. No
    React 18+ isso é um *no-op* silencioso (o aviso foi removido), e o
    pedido não tem efeito colateral. Aceito; um `AbortController` no
    `refresh` seria a saída se um dia importar.

*Verificada — registro, não pendência*

71. **As mutações da navegação (Task 1).** A aterrissagem da Task 1 refez 4
    das 7 mutações do relatório original (M1, M4, M5, M6); M2, M3 e M8
    tinham sido feitas só no worktree antigo. A revisão final refez M2
    (marcador `▸` em todos os itens) e M3 (`onNavigate('headquarters')`
    fixo), e a onda final refez M8 (o `h1` de Campanhas sem `tabIndex`):
    dois testes reprovam ("anuncia Campanhas no titulo de nivel 1…" e
    "Campanhas abre pela navegacao: o titulo dela recebe o foco…").
    Nenhuma mutação da Task 1 fica sem prova na branch integrada.

## Próximo incremento

**Ordem decidida pelo dono em 2026-09-18**, seguindo o README §14: **A → 1b →
B → C**. O desenho de A, B e C está em
`docs/superpowers/specs/2026-09-18-ciclo-diario-design.md`:

- **A — conclusão na tela:** relógio injetável (pendência 7), `code` legível
  por máquina nos erros (pendência 1) e o botão Concluir, com o `operation_id`
  preservado entre tentativas. **Entregue** (ver "Alterações do Incremento
  A").
- **1b — a Tifa**, em duas partes. **1b-1 (backend) entregue e publicado
  pelo PR #10** (ver "Revisão-base"). **1b-2 (frontend, E2E e a chamada
  real) entregue**: Tasks 0–7, o Step 1 da Task 8 e a Task 9 publicados
  pelo PR #11 (merge `598f96b`); o resto da Task 8 na branch
  `feat/incremento-1b-2-camada3`, pelo
  plano `docs/superpowers/plans/2026-09-22-incremento-1b-2.md`. Desenho
  aprovado pelo dono em
  `docs/superpowers/specs/2026-09-18-incremento-1b-design.md`, com a seção
  "Emendas (2026-09-22, 1b-2)". A parte da Task 8 que usa a chave real
  (Keychain, roteiro manual pela tela, captura da camada 3) foi feita; a
  camada 3 existe (pendência 40 resolvida), e o registro do roteiro
  (a)–(c) está na pendência 42.
- **B — o ciclo diário**, depois do 1b. **Entregue e comitado por
  inteiro** em `feat/incremento-b` (`12288a2`..`0b9197b`, Tasks 0–9 — ver
  "Alterações do Incremento B"). Plano em
  `docs/superpowers/plans/2026-09-25-incremento-b.md`; decisões P1–P10 em
  "Decisões tomadas", acima.
- **C — a campanha** (trilha em Campanhas, navegação lateral, axe na
  trilha), o próximo depois do B. **B começa por design próprio**
  (pendência 26: teto de negócio para `estimated_minutes`, janela de negócio
  para `deadline`, missões diárias reveladas semanalmente e a missão especial
  com bônus de XP — parte implementada pelo B, avulsa continua aberta).
  **Entregue e comitado por inteiro** em `feat/incremento-c`
  (`9c2bd1e`..`e195128`, Tasks 0–6 mais o fix round 1 da Task 5, e este
  commit de documentação por cima — ver "Alterações do Incremento C").
  Plano em `docs/superpowers/plans/2026-09-25-incremento-c.md`; decisões
  K1–K11 e as Rulings R1–R10 em "Decisões tomadas", acima. **Estado de
  publicação: não publicado — aguardando, nesta ordem, o merge do PR do B
  (ainda bloqueado, Ruling R1) e, só depois, o push e o PR do C; os dois
  passos exigem autorização do dono** (`AGENTS.md` §2).

**O que o C encontrou pronto do B, no início:**

- **`GET /api/plans/current`** (decisão P2): o C não precisou serializar o
  plano semanal de novo — a rota já devolvia a trilha completa, com o baú
  fechado para o que não foi revelado.
- **O ciclo inteiro no backend**: `cycle_domain.py` (regras puras de dia,
  semana, sequência, marco e janela da especial), `cycle_service.py` (criar
  o plano, ler o plano/ciclo/missão) e as três rotas de `cycle_router.py`.
  Ver `docs/ARCHITECTURE.md` §3 ("O contrato HTTP do ciclo diário"). O C não
  mudou nada em `src/focusquest/`.
- **O cartão "Missão de hoje" no Quartel-General** (`CycleSection.tsx`,
  Task 8 do B), com a sequência e o progresso até o marco — o C reaproveitou
  o mesmo padrão de atualização silenciosa (`refresh`, decisão P9) para a
  trilha da semana, e foi além: `useRefreshOnReturn` (Task 5 do C, decisão
  K7) liga esse `refresh` a eventos de verdade (`visibilitychange`, `focus`)
  nos dois hooks.
- **`formatCivilDate`**, em `frontend/src/features/missions/civilDate.ts`
  no fim do B (Task 7 do B) — a única forma correta de formatar uma data
  civil `"YYYY-MM-DD"` sem conversão de fuso (o Risco 3 do plano do B). **O
  C moveu o arquivo** para `frontend/src/shared/lib/civilDate.ts` (`git mv`,
  Task 2 do C, decisão K10) e acrescentou `civilWeekday` — quem precisar
  dele hoje encontra em `shared/lib/`, não mais em `features/missions/`.

**O que o C mudou de estrutura, que qualquer incremento futuro precisa
saber:**

- **`Mission`, `MissionState`, `MissionType`, `Availability`,
  `MISSION_STATE_LABELS` e `DAYS_PER_MILESTONE`** moraram em
  `features/missions/types.ts` até o fim do B; desde o C moram em
  `frontend/src/shared/types/mission.ts`, **sem reexport** de
  `features/missions/`. Um import antigo (`from '../missions/types'` para
  esses seis nomes) não compila mais.
- **`App.tsx` deixou de devolver só `<Headquarters />`**: desde o C, é o
  roteador de duas áreas (decisão K1) — quem for adicionar uma terceira área
  (ou a rota por URL que C15 adia) mexe em `app/areas.ts` e em `App.tsx`,
  não cria uma segunda peça de navegação.

**O que o C (ou quem retomar depois dele) precisa saber, porque morde:**

- **A pendência 55** (a Tifa não vê o ciclo no contexto): continua aberta,
  de propósito — ligar o ciclo à tutoria é do incremento que implementar
  `propose_plan`. **Cresceu no C**: a pendência 59 (o painel da Tifa não
  existe em Campanhas, decisão K3) converge para o mesmo trabalho futuro.
- **A pendência 54** (janela de corrida do E2E perto da meia-noite de SP):
  vale para qualquer cenário futuro que semeie e conclua no mesmo teste
  perto da virada do dia — inclusive o `cycle.spec.ts` que o C estendeu.
- **A pendência 56** (a rota de concluir relê com `clock()` depois do
  commit): registrada, não medida como bug reproduzido.
- **A pendência 58** (faltam testes de **serviço**, backend, para a
  especial EXPIRADA e a diária PERDIDA na trilha): o C fechou a parte do
  **frontend** (Task 3, `CampaignTrail.test.tsx`), mas o teste de serviço
  contra o PostgreSQL real continua faltando — é backend, e o C não mudou
  `src/focusquest/`.
- **A pendência 60** (troca de área dentro do app depois da meia-noite não
  atualiza o Quartel-General oculto, custo declarado de K7): residual da
  correção da pendência 57, registrado para quem decidir se vale a pena
  fechar.
- **A pendência 61** (a revisão visual de desktop e celular do README §7
  não foi feita num navegador de verdade): vale tanto para a navegação
  lateral (Task 1) quanto para a trilha (Tasks 3/4) — o E2E prova estrutura
  e ausência de rolagem/sobreposição, não aparência.

**O que o B encontra pronto do 1b:**

- **O backend inteiro da tutoria** — modelo de dados, as cinco rotas, o SSE,
  o adaptador Anthropic e o servidor falso (camadas 1, 2 e 3). Ver `docs/ARCHITECTURE.md` §3 ("O modelo de dados e o
  contrato HTTP da tutoria que existem") e `docs/QUALITY.md` §9.
- **O painel da Tifa na tela**, lateral no desktop e folha no celular
  (`frontend/src/features/tutoring/`), com o cartão de proposta, a recarga
  do quadro pela página (`ref`) e as chaves de confirmação por ação.
- **`postStream`** (`frontend/src/shared/api/client.ts`) — `fetch` +
  `ReadableStream` + `TextDecoder`, com `AbortSignal`, pronto para qualquer
  fluxo futuro que precise de um stream SSE do backend.
- **`formatDeadline`** em `frontend/src/shared/lib/deadline.ts` — primeiro
  arquivo de `shared/lib/`, já com dois usuários (o cartão da missão e o da
  proposta).
- **O servidor falso como processo** (`tests/integration/falso_do_e2e.py`),
  com controle HTTP por `/_control/*` — qualquer E2E futuro que precise de
  uma segunda API falsa de pé tem o padrão pronto (porta própria, guarda de
  loopback em `scripts/e2e-env.sh`, `webServer` dedicado no
  `playwright.config.ts`).
- **Provedor de IA: Anthropic**, com **`claude-opus-5`** como modelo padrão
  **configurável**, já em `Settings`. O README §6 manda manter chamadas e
  credenciais no backend, com limites, timeouts e modelo configuráveis, e
  testar a integração sem chamadas pagas nem segredos reais — cumprido pelo
  servidor falso; a chave real mora no Keychain do macOS (decisão D-a),
  nunca no repositório.

**O que o B (ou quem retomar a Task 8) precisa saber, porque morde:**

- **O servidor falso emite um bloco de thinking por padrão** (emenda E6):
  as contagens `cortar_apos_eventos`/`segurar_apos_eventos`/`atrasar_evento`
  (e `cut_after_events`/`hold_after_events` do E2E) contam esses 4 eventos.
  "Depois do primeiro pedaço de texto" é `APOS_O_PRIMEIRO_PEDACO` (7), não
  3; o E2E escreve o 7 literal, amarrado por uma guarda do pytest.
- **A referência da camada 3 é uma fotografia datada**
  (`tests/integration/referencia_da_api_real.json`): se a API mudar o
  formato, só uma nova chamada real, manual, do dono, a regrava — nunca o
  gate, nunca à mão.
- **O teto de 4000 caracteres da pergunta** (pendência 41) é decisão do
  dono, provisória, espelhada à mão em `MAX_QUESTION_LENGTH` — mudar o
  número é mudar os dois lados.
- **A pendência 45** (`max_tokens` grava `completa`) agora tem consequência
  visível na tela: resolver pede mudar `src/focusquest/`, fora do escopo do
  1b.

## Incrementos anteriores

### Incremento 0 — saneamento

- `git init` na raiz, branch `main`; `.gitignore` cobrindo Python, Node,
  segredos e estado de IDE.
- Tailwind desduplicado: `@tailwindcss/vite` e `tailwindcss` movidos do
  `package.json` da raiz para `frontend/package.json` como devDependencies.
  `package.json`, `package-lock.json` e `node_modules/` da raiz removidos.
- `"strict": true` adicionado a `tsconfig.app.json` e `tsconfig.node.json`.
- Removidos restos do projeto `PythonProject`: `main.py` (sample do PyCharm),
  um `.venv/` de outro projeto e `.idea/PythonProject.iml`.
- Verificação da época: artefatos de build idênticos antes e depois do
  saneamento; sem as dependências declaradas em `frontend/`, o build falhava
  com `TS2307: Cannot find module '@tailwindcss/vite'`.

### Incremento 2 — fundação de qualidade

Spec em `docs/superpowers/specs/2026-09-17-fundacao-qualidade-design.md`.

- `Makefile` com `help`, `bootstrap`, `check`, `check-web`, `check-secrets` e
  `format`; Prettier, ESLint, `tsc -b` e Vitest com limiares de 100%; raiz
  Python gerenciada por `uv`; Gitleaks 8.30.1 fixado por dois checksums;
  `.pre-commit-config.yaml` com os três estágios de hook e
  `scripts/check-push.sh`; `docs/QUALITY.md`; o workflow
  `.github/workflows/quality.yml`, na época com os jobs `check-web`,
  `check-secrets` e o agregador `quality-gate`.
- **Primeiro commit validado pelo gate: `b237e47`** — os onze commits
  anteriores antecederam a instalação dos hooks.
- `AGENTS.md`, `CLAUDE.md` (que importa o `AGENTS.md`) e
  `docs/ARCHITECTURE.md`, entregues por pull request.
- **Integração remota:** remoto em `github.com/BipoXDXD/FocusQuest`
  (privado). A `main` é protegida: exige o status `quality-gate`, com base
  atualizada, `enforce_admins` ativo, sem force-push nem deleção —
  reconferido nesta sessão com `gh api` na proteção da branch. Um push
  direto na `main` foi recusado pelo servidor com
  `GH006: Required status check "quality-gate" is expected`, mesmo com o
  gate local aprovado. Pull requests mesclados até aqui: #1 (integração
  remota no HANDOFF), #2 (`AGENTS.md`, `CLAUDE.md` e
  `docs/ARCHITECTURE.md`) e #3 (spec do Incremento 1a) — conferido com
  `gh pr list --state all`.
- Os relatórios de execução daquelas tarefas ficam em `.superpowers/sdd/`,
  ignorado pelo git: não chegam a um clone.
