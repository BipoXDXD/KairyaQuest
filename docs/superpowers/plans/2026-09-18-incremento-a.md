# Incremento A — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir missão pela tela, com segurança: relógio injetável lido depois da trava da linha (fecha a pendência 7), `code` legível por máquina nos erros de domínio (fecha a pendência 1) e o botão **Concluir** no Quartel-General, com o `operation_id` mantido entre as tentativas.

**Architecture:** O backend ganha `core/clock.py`, uma dependência do FastAPI que entrega o **relógio** (uma função), e não o instante. A rota o repassa inteiro ao serviço, que o lê depois do `SELECT ... FOR UPDATE`. O `code` mora na tradução para HTTP (`main.py`, enum `CodigoDeErro`), e não nas exceções do domínio. No frontend, o cliente HTTP passa a devolver `status` e `code` e deixa de ler o `detail`. Um mapa exaustivo sobre o tipo `MissionErrorCode` traduz cada `code` em mensagem e ação. Um hook por cartão (`useCompleteMission`) guarda o `operation_id` num `useRef`.

**Tech Stack:** Python 3.14, FastAPI 0.141.1, Pydantic 2.13.5, SQLAlchemy 2.0.54, psycopg 3.3.5, pytest 9.1.1, PostgreSQL 18.6-alpine; React 19.3.0, TypeScript 6.0.3, Vitest 5.0.1, Testing Library 16.3.3, jsdom 30.1.0, Playwright 1.63.0, @axe-core/playwright 4.13.0.

**Spec:** `docs/superpowers/specs/2026-09-18-ciclo-diario-design.md`. O escopo é **só o Incremento A**: seção B2 (item "A — conclusão na tela"), decisões C12 e C13, seção "Erros" e o que ela diz das missões avulsas. Nada de plano semanal, de diária nem de especial.

## Global Constraints

- A `main` é protegida: todo trabalho vai por branch e pull request, com o `quality-gate` verde. **Push, PR e merge exigem autorização do dono, um passo por vez.** Este plano termina no último commit local.
- Cobertura de **100%**: Python (instruções e ramos, `fail_under = 100`) e frontend nos quatro eixos (linhas, ramificações, funções e instruções, `frontend/vite.config.ts`). Cobertura não se alcança excluindo código: nada de `pragma: no cover`, `v8 ignore`, teste ignorado ou limiar reduzido.
- Proibidos: `--no-verify`, `SKIP`, `|| true`, `continue-on-error`, desinstalar ou editar hooks.
- **Toda guarda precisa de um teste que a faça dizer NÃO.** Cada tarefa que cria uma recusa, ou um teste novo, tem um passo de **mutação** que remove a guarda e mostra o teste caindo. Um teste que nunca foi visto falhar não prova nada.
- **Protocolo de mutação** (vale para todo passo "Mutação"): antes de mutar, `cp <arquivo> /tmp/fq-mutacao.bak`; aplique a troca exata indicada; rode o comando indicado e confira que reprova **pelo motivo indicado**; restaure com `cp /tmp/fq-mutacao.bak <arquivo> && rm /tmp/fq-mutacao.bak`; confira com `git diff --stat` que só restaram as mudanças da tarefa. **Nunca restaure com `git checkout -- <arquivo>` antes do commit:** ele volta à versão da HEAD e apaga a implementação da tarefa. Isso aconteceu na validação deste plano.
- Idioma: identificadores do **frontend** em inglês; texto visível em **pt-BR com acentuação**; contratos externos (chaves JSON, colunas, rotas) em **inglês**. Identificadores internos do **Python** seguem o padrão vizinho, que é português (`concluir_missao`, `CodigoDeErro`). Os **valores** de `code` estão em português porque a spec os fixou assim (C12).
- Os códigos de erro do A são **só três**: `missao_nao_encontrada`, `transicao_ilegal` e `operacao_reutilizada`. **Não crie** `missao_expirada`, `plano_existente`, `semana_encerrada` nem `semana_distante`: são do Incremento B, e código sem chamador é o defeito que esta base já puniu (`session_factory` no 1a).
- O 404 de missão inexistente e o de missão de outro usuário continuam **idênticos, byte a byte**, agora com o mesmo `code`. O 422 do Pydantic mantém o formato padrão do FastAPI, **sem `code`**.
- A tela **nunca** mostra o `detail`. Ela decide pelo `code`.
- O PostgreSQL do projeto está na porta **55432**; a **5432** é de outra instalação e não pertence ao projeto.
- `check-api` e `check-e2e` **não podem rodar ao mesmo tempo** na mesma máquina: os dois usam o `focusquest_test`, e o pytest faz `DROP SCHEMA`.
- **Ao fim de cada tarefa, `make check`**, com EXIT 0. Na Task 5, **duas vezes seguidas**: a idempotência do gate já foi provada e não pode regredir.
- Cada commit termina com a linha `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. As mensagens seguem o costume da base: prefixo convencional e texto em português sem acento.
- Lições do 1a que este plano **não** pode reintroduzir: a trava vem antes da consulta na conclusão; teste de concorrência com largada real (`sessao.connection()` antes da barreira); não anotar retorno de rota como união de tipos (o FastAPI recusa a rota na importação); dependência substituída em todo teste precisa de teste direto (`get_engine` no 1a, `get_clock` aqui); `configDefaults` do Vitest 5 é plano; o jsdom calcula role implícita, então quem guarda atributo de acessibilidade é a asserção do atributo.

## Base e pré-requisitos

- **Base:** a `main` com o PR #6 (esta spec e este plano) mesclado. Branch nova: `feat/incremento-a`.
- **O PR #5 (`fix/sessao-em-utc`) é independente.** Os passos deste plano foram validados sobre a `main` sem ele (`make check` EXIT 0, duas vezes) e, de novo, com ele aplicado por cima (`make check` EXIT 0). Nenhuma âncora de edição deste plano cai num trecho que o #5 muda. O que muda com ele são as contagens do backend: 115 testes sem o #5 e 122 com ele, ao fim da Task 2. O E2E da Task 5 compara o `completed_at` do 200 com o do reenvio **como texto**: isso vale porque a sessão do PostgreSQL está em UTC. Hoje isso vem do padrão do servidor, e o #5 fixa a sessão em UTC na própria conexão.
- **Preparação** (uma vez, antes da Task 1):

```bash
git switch main && git pull --ff-only
git switch -c feat/incremento-a
make db-up
make migrate-test
make check
```

Esperado: `make check` com EXIT 0. Sem o `.env` na raiz e sem os hooks instalados (`uv run pre-commit install --install-hooks`), pare e siga o `AGENTS.md` §1.

## Decisões que a spec não fixava

Cada uma foi validada executando o plano num worktree descartável. O motivo vai também no código.

| Decisão | Motivo |
|---|---|
| A dependência `get_clock` devolve o **relógio** (`Clock = Callable[[], datetime]`), e não o instante | Um instante resolvido pelo FastAPI seria lido antes de a rota começar, portanto antes da trava. Com o relógio na mão, o serviço lê a hora depois do `FOR UPDATE` (C13). Uma função, e não uma classe com `now()`: é a menor coisa que resolve, e o teste a troca com `lambda: INSTANTE`. |
| `concluir_missao(..., *, clock: Clock)`, **obrigatório e somente-nomeado** | Sem valor padrão, nenhum chamador esquece o relógio em silêncio: o mypy e o `TypeError` recusam. A leitura fica logo depois do `_buscar(..., travar=True)`, na posição que a spec fixa para o B (passo 2 da "Ordem da conclusão"), embora no A só o `completed_at` a use. |
| O `created_at` das tabelas continua vindo do `now()` do banco (`server_default`) | É registro de auditoria, e não regra. A C13 fala do serviço, que não chama mais `datetime.now`. |
| O `code` mora em `main.py` (`CodigoDeErro`), e não nas exceções do domínio | É tradução para HTTP, e a tradução inteira mora ali (`docs/ARCHITECTURE.md` §4). Posto na exceção, obrigaria `NaoPertenceAoUsuarioError` a carregar `missao_nao_encontrada`, que é falso no domínio e só é verdade na resposta. `_erro` recebe o código como argumento **obrigatório**: um handler novo sem `code` reprova no mypy. |
| O `ApiError.code` é `string \| null`, e não a união dos códigos | O cliente não sabe quais códigos cada tela entende, e afirmar a união seria uma conversão de tipo sem verificação. Quem consome estreita o valor (`Object.hasOwn`). |
| O cliente **não lê** o `detail`. A `message` do `ApiError` é escrita por ele (`O servidor respondeu 409.`) | É a garantia estrutural de que o `detail` não chega à tela por um caminho esquecido. A lista (GET) continua mostrando a `message` do `ApiError` no estado de erro: ali não há erro de domínio, só rede fora ou servidor falhando. |
| `MissionErrorCode` fica na feature `missions` (`types.ts`), e não em `shared/` | Um consumidor só (`docs/ARCHITECTURE.md` §5.3). Os códigos do B sobem para `shared/` quando uma segunda feature os usar. |
| Um mapa só, `code → { message, recovery }`, exaustivo por `Record<MissionErrorCode, …>` | A mensagem e a ação da tela mudam juntas; dois mapas poderiam divergir. Um código novo reprova o `tsc` até ganhar os dois. |
| O `operation_id` nasce no **primeiro clique**, num `useRef`, e só é trocado depois de `operacao_reutilizada` | Uma chave nova por clique transformaria o reenvio numa conclusão nova, que receberia `transicao_ilegal`. Gerar na montagem daria vinte chaves a um quadro de vinte missões. A troca depois de `operacao_reutilizada` é segura: a missão não foi concluída por aquela chave. |
| Depois do sucesso, o cartão mostra a missão que o 200 **devolveu**, e não recarrega a lista | `concluida` é terminal (A5), então essa missão não fica velha. A próxima leitura do quadro monta cartões novos. |

**O que a tela mostra**, cartão a cartão:

| Momento | Botão | Região viva `role="status"` | Aviso `role="alert"` |
|---|---|---|---|
| Missão `pendente` ou `em_andamento`, parada | **Concluir** (nome acessível: "Concluir a missão: …") | vazia | — |
| Enviando | **Concluindo…**, desabilitado (o clique duplo não sai) | "Concluindo a missão…" | — |
| Sucesso | some, e o rótulo do cartão vira "Concluída" | "Missão concluída." | — |
| Falha de rede, 5xx, 422 ou `code` desconhecido | **Tentar de novo**, com a **mesma** chave | vazia | "Não foi possível confirmar a conclusão. Tentar de novo é seguro: a missão não será concluída duas vezes." |
| `operacao_reutilizada` | **Tentar de novo**, com uma chave **nova** | vazia | "Não foi possível registrar esta tentativa. Tente de novo." |
| `transicao_ilegal` | some; aparece **Atualizar o quadro** (recarrega a lista) | vazia | "Esta missão já estava concluída. Atualize o quadro para ver o estado atual." |
| `missao_nao_encontrada` | some; aparece **Atualizar o quadro** | vazia | "Esta missão não está mais no quadro. Atualize o quadro para ver as missões atuais." |
| Missão que já veio `concluida` na lista | nenhum | nenhuma | — |

A região `role="status"` existe desde o primeiro render, ainda vazia, porque um leitor de tela só anuncia mudanças numa região viva que já estava no documento.

## Mapa de arquivos

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `src/focusquest/core/clock.py` (novo) | 1 | `Clock`, `system_now` e a dependência `get_clock` |
| `tests/unit/test_clock.py` (novo) | 1 | teste direto do relógio real e da dependência |
| `src/focusquest/modules/missions/service.py` | 1 | `concluir_missao` recebe `clock` e o lê depois da trava |
| `src/focusquest/modules/missions/router.py` | 1 | a rota injeta `get_clock` e repassa o relógio |
| `tests/integration/test_missions_service.py` | 1 | relógio fixo; `completed_at` por igualdade |
| `tests/integration/test_missions_concorrencia.py` | 1 | `clock=system_now` e a sonda de trava |
| `tests/integration/test_missions_api.py` | 1, 2 | relógio injetado pela API; `code` em cada erro; 422 sem `code` |
| `src/focusquest/main.py` | 2 | `CodigoDeErro` e `_erro` com `code` obrigatório |
| `frontend/src/shared/api/client.ts` | 3 | `ApiError.code`, `postJson`; o `detail` deixa de ser lido |
| `frontend/src/shared/api/client.test.ts` | 3 | reescrito |
| `frontend/src/features/missions/types.ts` | 3 | `MissionErrorCode` |
| `frontend/src/features/missions/completionFailure.ts` (novo) | 3 | o mapa exaustivo `code → { message, recovery }` |
| `frontend/src/features/missions/completionFailure.test.ts` (novo) | 3 | o mapa, o código desconhecido e as chaves herdadas do protótipo |
| `frontend/src/features/missions/useMissions.ts` e `.test.tsx` | 3 | comentário e asserção: a lista não mostra o `detail` |
| `frontend/src/features/missions/MissionList.test.tsx` | 3, 4 | o erro da lista sem `detail`; o bloco "concluir" |
| `frontend/src/features/missions/useCompleteMission.ts` (novo) | 4 | o hook, com o `operation_id` num `useRef` |
| `frontend/src/features/missions/useCompleteMission.test.tsx` (novo) | 4 | chave mantida, chave trocada, estados |
| `frontend/src/features/missions/MissionList.tsx` | 4 | `CompletionControls` no cartão |
| `frontend/tests/e2e/headquarters.spec.ts` | 5 | dois cenários de conclusão, com axe |
| `docs/HANDOFF.md` | 1, 2, 3, 5 | pendências 7 e 1 riscadas nas tarefas que as fecham; o registro do incremento |
| `docs/ARCHITECTURE.md` | 1, 2, 3, 4 | árvore, contrato de erro, feature `missions`, §5.7 |
| `docs/QUALITY.md` | 5 | §4: estados auditados pelo axe e linhas deixadas pelo E2E |

**Por que cinco tarefas.** Cada uma tem o próprio ciclo de teste, e um revisor pode reprovar qualquer uma aprovando a vizinha. A Task 3 entrega `postJson` e `ApiError.code` antes de o botão existir: os dois são testados diretamente ali, e o consumidor chega na Task 4, no mesmo branch. A divisão separa **o que dizer em cada falha** (Task 3) de **quando e como pedir** (Task 4).

---

### Task 1: Relógio injetável

Fecha a **pendência 7** do `docs/HANDOFF.md`.

**Files:**
- Create: `src/focusquest/core/clock.py`
- Create: `tests/unit/test_clock.py`
- Modify: `src/focusquest/modules/missions/service.py` (imports; assinatura e corpo de `concluir_missao`)
- Modify: `src/focusquest/modules/missions/router.py` (import; rota `concluir`)
- Modify: `tests/integration/test_missions_service.py`
- Modify: `tests/integration/test_missions_concorrencia.py`
- Modify: `tests/integration/test_missions_api.py`
- Modify: `docs/HANDOFF.md` (pendência 7), `docs/ARCHITECTURE.md` (árvore e contrato HTTP)

**Interfaces:**
- Consumes: `_buscar(session, user_id, mission_id, *, travar: bool = False) -> Mission` e a fixture `missao_commitada` (`tests/integration/test_missions_concorrencia.py`), as fixtures `client`, `banco_migrado` e o helper `_criar(client, **ajustes) -> dict[str, Any]` (`tests/integration/test_missions_api.py`).
- Produces:
  - `focusquest.core.clock.Clock = Callable[[], datetime]`
  - `focusquest.core.clock.system_now() -> datetime` (UTC)
  - `focusquest.core.clock.get_clock() -> Clock` (dependência do FastAPI)
  - `concluir_missao(session: Session, user_id: int, mission_id: int, operation_id: str, *, clock: Clock) -> Mission`
  - fixture `relogio_fixo() -> Iterator[datetime]` e constante `AGORA = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)` em `tests/integration/test_missions_api.py`

- [ ] **Step 1: Escrever o teste de unidade do relógio**

Crie `tests/unit/test_clock.py`:

```python
"""O relogio da aplicacao: a dependencia que o FastAPI injeta e o relogio real.

Os dois testes existem porque TODO outro teste substitui a dependencia: o
servico recebe um relogio fixo, e a API recebe o relogio fixo por
`dependency_overrides`. Substituir uma dependencia nao a testa -- e a licao do
`get_engine` no Incremento 1a, cujo corpo so foi exercitado quando alguem o
chamou direto.
"""

from datetime import UTC, datetime

from focusquest.core.clock import get_clock, system_now


def test_system_now_devolve_o_instante_atual_em_utc() -> None:
    """Instante com fuso, e o fuso e UTC -- nao so "tem tzinfo".

    `tzinfo is not None` sozinho aprovaria um relogio em `America/Sao_Paulo`,
    e a coluna `timestamptz` gravaria o mesmo instante; o que se exige aqui e
    que a aplicacao trabalhe em UTC e so a TELA converta (README s8).
    """
    antes = datetime.now(UTC)

    agora = system_now()

    assert agora.utcoffset() is not None
    assert agora.tzinfo is UTC
    assert antes <= agora <= datetime.now(UTC)


def test_get_clock_entrega_o_relogio_real() -> None:
    """A dependencia devolve o RELOGIO, nao um instante.

    E o que permite ao servico ler a hora depois de travar a linha: um
    instante resolvido pela dependencia seria lido antes de a rota comecar,
    e portanto antes da trava.
    """
    assert get_clock() is system_now
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `uv run pytest tests/unit/test_clock.py -q`
Expected: erro de coleta, `ModuleNotFoundError: No module named 'focusquest.core.clock'`.

- [ ] **Step 3: Criar `src/focusquest/core/clock.py`**

```python
"""O relogio da aplicacao: a unica fonte do instante atual.

Nenhum modulo da aplicacao chama `datetime.now` direto: quem precisa da hora
recebe um `Clock` -- o servico, como argumento; a rota, pela dependencia
`get_clock`. (O `created_at` das tabelas vem do `now()` do banco, por
`server_default`: e registro de auditoria, e nao regra.) Os testes substituem
a dependencia por um relogio fixo (README s8: relogio injetado nos testes), e
nao existe gancho de teste neste arquivo: nenhuma variavel de ambiente, nenhum
"modo de teste", nenhuma global para trocar.

A dependencia devolve o RELOGIO, e nao o instante, por uma razao de ordem. Um
instante resolvido pelo FastAPI seria lido ANTES de a rota comecar -- portanto
antes de o servico travar a linha da missao. Duas conclusoes simultaneas
leriam a hora, e a segunda esperaria a trava com um instante ja velho. Com o
relogio na mao, o servico le a hora DEPOIS da trava, e a leitura fica dentro
da secao serializada (spec do ciclo diario, decisao C13).
"""

from collections.abc import Callable
from datetime import UTC, datetime

# Um relogio e uma funcao sem argumentos que devolve o instante atual, COM
# fuso. Uma funcao, e nao uma classe com metodo `now()`: e a menor coisa que
# resolve, e um teste o substitui com `lambda: INSTANTE`.
Clock = Callable[[], datetime]


def system_now() -> datetime:
    """O instante atual, em UTC. E o relogio de producao."""
    return datetime.now(UTC)


def get_clock() -> Clock:
    """Dependencia do FastAPI: entrega o relogio real.

    Os testes a substituem por `app.dependency_overrides[get_clock]`. Ela
    precisa ser uma funcao, e nao o proprio `system_now` passado ao `Depends`:
    com `Depends(system_now)` o FastAPI chamaria o relogio e injetaria o
    INSTANTE, que e exatamente o que o paragrafo de cima recusa.
    """
    return system_now
```

- [ ] **Step 4: Rodar e ver passar**

Run: `uv run pytest tests/unit/test_clock.py -q`
Expected: `2 passed`.

- [ ] **Step 5: Passar o relógio em todas as chamadas de teste do serviço**

`concluir_missao` vai ganhar `clock` obrigatório, então as catorze chamadas dos testes mudam antes. Nos testes do serviço entra um relógio fixo; nos de concorrência, o real.

```bash
perl -pi -e 's/concluir_missao\((session, ESTUDANTE, \w+, "op-\w+")\)/concluir_missao(\1, clock=_relogio)/' tests/integration/test_missions_service.py
grep -c 'clock=_relogio' tests/integration/test_missions_service.py
perl -pi -e 's/concluir_missao\((sessao, ESTUDANTE, \w+, (?:"op-[\w-]+"|operation_id))\)/concluir_missao(\1, clock=system_now)/' tests/integration/test_missions_concorrencia.py
grep -c 'clock=system_now' tests/integration/test_missions_concorrencia.py
```

Expected: `11` e `3`. Outra contagem significa que alguma chamada não casou com o padrão: confira com `grep -n "concluir_missao(" tests/integration/*.py` antes de seguir.

Em `tests/integration/test_missions_concorrencia.py`, acrescente o import, logo acima de `from focusquest.core.errors import OperacaoReutilizadaError`:

```python
from focusquest.core.clock import system_now
```

Em `tests/integration/test_missions_service.py`, logo depois de `OUTRO = 2`, acrescente:

```python

# O instante que o relogio destes testes devolve. Fixo e com fuso: e ele que
# permite afirmar o `completed_at` por IGUALDADE, e nao por uma janela entre
# dois `datetime.now()` -- a compensacao que a pendencia 7 registrava.
AGORA = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)


def _relogio() -> datetime:
    """O relogio fixo destes testes: toda leitura devolve `AGORA`."""
    return AGORA
```

- [ ] **Step 6: Endurecer os dois testes do serviço que falam do instante**

Em `tests/integration/test_missions_service.py`, substitua `test_concluir_marca_o_estado_e_o_instante` inteiro por:

```python
def test_concluir_marca_o_estado_e_o_instante(session: Session) -> None:
    """O `completed_at` e o instante que o RELOGIO RECEBIDO devolveu.

    Igualdade exata, e nao janela de tempo: com o relogio injetado, o teste
    sabe qual instante esperar. E e isso que da dente a assercao -- um servico
    que voltasse a chamar `datetime.now(UTC)` direto gravaria a hora real, e a
    hora real nao e 18/09/2026 as 15:00.
    """
    mission_id = _criar(session)

    missao = concluir_missao(session, ESTUDANTE, mission_id, "op-abc", clock=_relogio)

    assert missao.state is MissionState.CONCLUIDA
    assert missao.completed_at == AGORA
    assert _operacoes(session, mission_id) == 1
```

Em `test_reenviar_a_mesma_operacao_devolve_o_mesmo_sucesso`, troque a docstring e as linhas até o `assert segunda.completed_at` pelo trecho abaixo. As duas últimas linhas do teste (`# E a prova de que reenvio nao duplica...` e `assert _operacoes(...) == 1`) ficam como estão.

```python
    """Reenviar nao e erro -- e e o MESMO sucesso, nao um novo.

    O reenvio chega uma hora depois, por um relogio que ANDOU: com um relogio
    fixo nas duas chamadas, uma implementacao que concluisse de novo gravaria
    o mesmo instante, e a assercao sobre `completed_at` passaria sem provar
    nada.
    """
    mission_id = _criar(session)
    depois = AGORA + timedelta(hours=1)

    primeira = concluir_missao(session, ESTUDANTE, mission_id, "op-abc", clock=_relogio)
    segunda = concluir_missao(
        session, ESTUDANTE, mission_id, "op-abc", clock=lambda: depois
    )

    assert primeira.id == segunda.id
    assert segunda.state is MissionState.CONCLUIDA
    # O instante nao se move. Sem esta assercao, uma implementacao que
    # simplesmente concluisse de novo -- sobrescrevendo `completed_at` --
    # passaria no teste: o estado final seria o mesmo. O que "devolver o
    # mesmo sucesso" promete e que nada aconteceu da segunda vez.
    assert segunda.completed_at == AGORA
```

- [ ] **Step 7: Escrever o teste que prova "o relógio é lido depois da trava"**

Em `tests/integration/test_missions_concorrencia.py`, logo antes de `def test_mesma_chave_em_missoes_diferentes_e_recusada_tambem_em_paralelo(`, acrescente:

```python
def test_relogio_e_lido_com_a_linha_ja_travada(
    banco_migrado: Engine, missao_commitada: int
) -> None:
    """A hora da conclusao e lida DEPOIS da trava da linha (decisao C13).

    O relogio injetado aqui e uma sonda: no momento em que o servico o le, ele
    pergunta ao PostgreSQL, por OUTRA conexao, se a linha da missao ja esta
    travada. `FOR KEY SHARE NOWAIT` conflita com o `FOR UPDATE` do servico e,
    com `NOWAIT`, responde na hora com `LockNotAvailable` em vez de esperar --
    entao a sonda nunca bloqueia o servico, e o teste nao depende de tempo.

    Lido antes da trava, o relogio encontraria a linha livre. E a ordem que
    o Incremento B precisa: a regra do dia compara a hora com a data da
    missao, e uma hora lida antes de esperar a trava seria uma hora velha.

    A lista `observado` afirma tambem que o relogio e lido UMA vez: nenhuma
    leitura (`[]`) ou duas (`["travada", "travada"]`) reprovam.
    """
    observado: list[str] = []

    def relogio_que_sonda_a_trava() -> datetime:
        with banco_migrado.connect() as sonda:
            try:
                sonda.execute(
                    text("SELECT id FROM missions WHERE id = :id FOR KEY SHARE NOWAIT"),
                    {"id": missao_commitada},
                )
            except OperationalError as erro:
                # Qualquer outra falha (conexao caida, SQL errado) nao pode
                # passar por "travada": so a recusa de trava conta.
                assert isinstance(erro.orig, psycopg.errors.LockNotAvailable)
                observado.append("travada")
            else:
                observado.append("livre")
        return datetime.now(UTC)

    with Session(bind=banco_migrado) as sessao:
        concluir_missao(
            sessao,
            ESTUDANTE,
            missao_commitada,
            "op-sonda",
            clock=relogio_que_sonda_a_trava,
        )
        sessao.commit()

    assert observado == ["travada"]
```

- [ ] **Step 8: Escrever o teste de que a rota usa o relógio da dependência**

Em `tests/integration/test_missions_api.py`:

1. Acima de `from focusquest.core.database import get_engine, get_session`, acrescente:

```python
from focusquest.core.clock import get_clock
```

2. Logo depois de `OUTRO = 2`, acrescente:

```python
# O instante que o relogio injetado devolve nos testes que o substituem.
AGORA = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)
```

3. Logo antes de `def _prazo(dias: int) -> str:`, acrescente a fixture:

```python
@pytest.fixture
def relogio_fixo() -> Iterator[datetime]:
    """Substitui o relogio da API por um que devolve sempre `AGORA`.

    O override devolve uma FUNCAO que devolve o instante -- `get_clock`
    entrega um relogio, nao uma hora (ver `core/clock.py`). Remove a propria
    chave no teardown, pelo motivo escrito em `client`.
    """
    app.dependency_overrides[get_clock] = lambda: lambda: AGORA
    yield AGORA
    app.dependency_overrides.pop(get_clock, None)


```

4. Logo antes de `def test_duracao_real_no_corpo_vem_dos_instantes(`, acrescente:

```python
def test_concluir_grava_o_instante_do_relogio_injetado(
    client: TestClient, relogio_fixo: datetime
) -> None:
    """A rota entrega ao servico o relogio da DEPENDENCIA, e nao outro.

    E o teste que prova a ligacao entre `get_clock` e `concluir_missao`: se a
    rota passasse `system_now` direto, ou o servico voltasse a chamar
    `datetime.now(UTC)`, o `completed_at` seria a hora real, e nao o instante
    fixo que o override instalou. Comparado como instante, nao como texto.
    """
    criada = _criar(client)

    resposta = client.post(
        f"/api/missions/{criada['id']}/complete", json={"operation_id": "op-abc"}
    )

    assert resposta.status_code == 200, resposta.text
    assert datetime.fromisoformat(resposta.json()["completed_at"]) == relogio_fixo


```

- [ ] **Step 9: Rodar e ver falhar**

Run: `uv run ruff format tests && uv run pytest tests/integration/test_missions_service.py tests/integration/test_missions_concorrencia.py tests/integration/test_missions_api.py -q`
Expected: FAIL. Os testes do serviço e da concorrência com `TypeError: concluir_missao() got an unexpected keyword argument 'clock'`, e `test_concluir_grava_o_instante_do_relogio_injetado` com `AssertionError` comparando a hora real com `datetime(2026, 9, 18, 15, 0, tzinfo=datetime.timezone.utc)`. O `ruff format` quebra as chamadas que o `perl` deixou com mais de 88 colunas.

- [ ] **Step 10: Implementar no serviço**

Em `src/focusquest/modules/missions/service.py`:

1. Troque `from datetime import UTC, datetime` por `from datetime import datetime`. O `datetime` continua em uso na assinatura de `criar_missao`, e o `UTC` deixa de ser.
2. Acima de `from focusquest.core.errors import (`, acrescente `from focusquest.core.clock import Clock`.
3. Troque a assinatura atual,

```python
def concluir_missao(
    session: Session, user_id: int, mission_id: int, operation_id: str
) -> Mission:
```

por:

```python
def concluir_missao(
    session: Session,
    user_id: int,
    mission_id: int,
    operation_id: str,
    *,
    clock: Clock,
) -> Mission:
```

4. Logo depois de `missao = _buscar(session, user_id, mission_id, travar=True)`, acrescente:

```python
    # A hora e lida AQUI, com a linha ja travada, e nao antes do `_buscar`
    # (decisao C13 da spec do ciclo diario). Lida antes, uma conclusao que
    # esperasse a trava de outra carregaria um instante anterior a espera. No
    # Incremento A so o `completed_at` usa a hora; no B, a regra do dia a le
    # entre o reenvio e a transicao, e por isso a leitura ja fica neste ponto.
    # Provado por `test_relogio_e_lido_com_a_linha_ja_travada`.
    agora = clock()
```

5. Troque `missao.completed_at = datetime.now(UTC)` por `missao.completed_at = agora`.

- [ ] **Step 11: Implementar na rota**

Em `src/focusquest/modules/missions/router.py`:

1. Acima de `from focusquest.core.database import get_session`, acrescente `from focusquest.core.clock import Clock, get_clock`.
2. Troque a rota `concluir` inteira por:

```python
@router.post("/{mission_id}/complete")
def concluir(
    mission_id: IdDaMissao,
    dados: MissionComplete,
    session: SessaoDaRequisicao,
    clock: Annotated[Clock, Depends(get_clock)],
) -> MissionRead:
    """Conclui a missao, de forma idempotente pelo identificador de operacao.

    200 e nao 201: nao nasce recurso novo, muda o estado de um que ja existia.
    E o reenvio do MESMO identificador devolve 200 de novo, com o mesmo corpo
    -- o servico e quem sustenta essa promessa; a rota so nao a estraga
    devolvendo um status diferente na segunda vez.

    O relogio vem da dependencia e segue INTEIRO para o servico, que o le
    depois de travar a linha. A rota nao le a hora: ler aqui seria ler antes
    da trava (ver `core/clock.py`).
    """
    missao = concluir_missao(
        session, USUARIO_UNICO, mission_id, dados.operation_id, clock=clock
    )
    session.commit()
    return MissionRead.model_validate(missao)
```

O retorno continua `MissionRead`, e não uma união: o FastAPI recusa a rota na importação com retorno anotado como união (lição do 1a).

- [ ] **Step 12: Rodar e ver passar**

Run: `uv run ruff format src tests && uv run ruff check . && uv run mypy src tests alembic && uv run pytest -q --cov`
Expected: Ruff sem achados; mypy `Success: no issues found in 32 source files` (33 com o PR #5); `114 passed` (110 antes da tarefa, mais 2 de unidade, 1 de API e 1 de concorrência; com o PR #5 já na `main`, `121 passed`); cobertura total de 100%.

Confira também que o serviço não lê mais a hora sozinho:

Run: `grep -rn "datetime.now" src`
Expected: só `src/focusquest/core/clock.py` (a docstring e o `return datetime.now(UTC)`).

- [ ] **Step 13: Mutação — relógio lido antes da trava**

Em `src/focusquest/modules/missions/service.py`, troque:

```python
    missao = _buscar(session, user_id, mission_id, travar=True)
```

por:

```python
    agora_antes = clock()
    missao = _buscar(session, user_id, mission_id, travar=True)
```

e troque `    agora = clock()` por `    agora = agora_antes`.

Run: `uv run pytest tests/integration -q`
Expected: só `FAILED tests/integration/test_missions_concorrencia.py::test_relogio_e_lido_com_a_linha_ja_travada` (`assert ['livre'] == ['travada']`). Restaure.

- [ ] **Step 14: Mutação — o serviço ignora o relógio**

Em `src/focusquest/modules/missions/service.py`, troque `from datetime import datetime` por `from datetime import UTC, datetime` e `missao.completed_at = agora` por `missao.completed_at = datetime.now(UTC)`.

Run: `uv run pytest tests/integration -q`
Expected: três FAILED: `test_concluir_grava_o_instante_do_relogio_injetado`, `test_concluir_marca_o_estado_e_o_instante` e `test_reenviar_a_mesma_operacao_devolve_o_mesmo_sucesso`. Restaure.

- [ ] **Step 15: Mutação — a rota ignora a dependência**

Em `src/focusquest/modules/missions/router.py`, troque `from focusquest.core.clock import Clock, get_clock` por `from focusquest.core.clock import Clock, get_clock, system_now` e `dados.operation_id, clock=clock` por `dados.operation_id, clock=system_now`.

Run: `uv run pytest tests/integration -q`
Expected: só `FAILED tests/integration/test_missions_api.py::test_concluir_grava_o_instante_do_relogio_injetado`. Restaure.

- [ ] **Step 16: Mutações — o relógio real e a dependência**

Mutação A, em `src/focusquest/core/clock.py`: troque `from datetime import UTC, datetime` por:

```python
from datetime import UTC, datetime
from zoneinfo import ZoneInfo
```

e `return datetime.now(UTC)` por `return datetime.now(ZoneInfo("America/Sao_Paulo"))`.

Run: `uv run pytest tests/unit/test_clock.py -q`
Expected: `FAILED ... test_system_now_devolve_o_instante_atual_em_utc`. Restaure.

Mutação B, no mesmo arquivo: troque `    return system_now` por `    return lambda: system_now()`.

Run: `uv run pytest tests/unit/test_clock.py -q`
Expected: `FAILED ... test_get_clock_entrega_o_relogio_real`. Restaure.

- [ ] **Step 17: Riscar a pendência 7 no HANDOFF**

Em `docs/HANDOFF.md`, troque:

```markdown
7. **O relógio não é injetável.** `concluir_missao` usa `datetime.now(UTC)`
   direto, e o README §8 pede relógio injetado nos testes. Os testes
   compensam com asserção de janela de tempo.
```

por:

```markdown
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
```

- [ ] **Step 18: Atualizar o `docs/ARCHITECTURE.md`**

Na árvore do §1, troque:

```text
│       │   ├── base.py            # base declarativa do SQLAlchemy
│       │   ├── config.py          # Settings (pydantic-settings), prefixo FOCUSQUEST_
```

por:

```text
│       │   ├── base.py            # base declarativa do SQLAlchemy
│       │   ├── clock.py           # o relógio injetável: Clock, system_now e a dependência get_clock
│       │   ├── config.py          # Settings (pydantic-settings), prefixo FOCUSQUEST_
```

e troque:

```text
│   └── unit/                      # sem banco
│       ├── __init__.py
│       ├── test_config.py
```

por:

```text
│   └── unit/                      # sem banco
│       ├── __init__.py
│       ├── test_clock.py
│       ├── test_config.py
```

No §3, "O contrato HTTP que existe", logo depois do item que começa com `- **Usuário único, declarado** (decisão A2)`, acrescente:

```markdown
- **O instante da conclusão vem do relógio injetado.** A rota de concluir
  recebe o relógio pela dependência `get_clock` (`core/clock.py`) e o repassa
  ao serviço, que o lê **depois** de travar a linha (decisão C13 da spec do
  ciclo diário). A dependência entrega o relógio, e não o instante: um
  instante resolvido pelo FastAPI seria lido antes da trava. Os testes o
  substituem por `dependency_overrides`.
```

- [ ] **Step 19: Gate**

Run: `make check`
Expected: EXIT 0. Backend: `114 passed` (121 com o PR #5) e cobertura de 100%. Frontend: `36 passed`, sem mudança. E2E: `4 passed`. Gitleaks: `no leaks found`.

- [ ] **Step 20: Commit**

```bash
git add src/focusquest/core/clock.py tests/unit/test_clock.py \
  src/focusquest/modules/missions/service.py src/focusquest/modules/missions/router.py \
  tests/integration/test_missions_service.py tests/integration/test_missions_concorrencia.py \
  tests/integration/test_missions_api.py docs/HANDOFF.md docs/ARCHITECTURE.md
git commit -F - <<'EOF'
feat: relogio injetavel lido depois da trava da linha

core/clock.py expoe get_clock, que entrega o relogio e nao o instante.
concluir_missao recebe o relogio como argumento obrigatorio e o le
depois do SELECT ... FOR UPDATE; uma sonda FOR KEY SHARE NOWAIT prova a
ordem. Os testes afirmam completed_at por igualdade. Fecha a pendencia 7.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: `code` legível por máquina nos erros do backend

Fecha a **primeira metade da pendência 1** (os 409 sem `code`). A segunda metade, sobre a prosa do `detail` na tela, fecha na Task 3, porque só o frontend pode deixar de mostrá-la.

**Files:**
- Modify: `src/focusquest/main.py` (import; `CodigoDeErro`; `_erro`; os quatro handlers)
- Modify: `tests/integration/test_missions_api.py`
- Modify: `docs/HANDOFF.md` (pendência 1), `docs/ARCHITECTURE.md` (§3 contrato de erro, §4 tabela do backend)

**Interfaces:**
- Consumes: os handlers `_nao_encontrada`, `_nao_pertence`, `_transicao_ilegal` e `_operacao_reutilizada` e a constante `NAO_ENCONTRADA` de `src/focusquest/main.py`; os helpers `_corpo(**ajustes)` e `_criar(client, **ajustes)` de `tests/integration/test_missions_api.py`.
- Produces:
  - `focusquest.main.CodigoDeErro(StrEnum)` com `MISSAO_NAO_ENCONTRADA = "missao_nao_encontrada"`, `TRANSICAO_ILEGAL = "transicao_ilegal"` e `OPERACAO_REUTILIZADA = "operacao_reutilizada"`
  - `_erro(status_code: int, detalhe: str, codigo: CodigoDeErro) -> JSONResponse`
  - o contrato publicado: todo erro de domínio responde `{"detail": <prosa>, "code": <código>}`

- [ ] **Step 1: Escrever os testes do `code`**

Em `tests/integration/test_missions_api.py`:

1. Em `test_operacao_nova_sobre_missao_concluida_devolve_409`, logo depois de `    assert resposta.status_code == 409`, acrescente:

```python
    # O `code` e o que o cliente le para decidir; a prosa e para quem depura.
    # Os dois 409 desta API so se distinguem por ele, e a acao do cliente e
    # oposta nos dois (aqui, nao ha o que repetir).
    assert resposta.json()["code"] == "transicao_ilegal"
```

2. Em `test_chave_de_operacao_gasta_em_outra_missao_devolve_409`, logo depois de `    assert resposta.status_code == 409`, acrescente:

```python
    # O outro 409, com o outro `code`: aqui o cliente gera um `operation_id`
    # novo e repete o MESMO corpo.
    assert resposta.json()["code"] == "operacao_reutilizada"
```

3. Em `test_missao_inexistente_devolve_404`, troque `    assert resposta.json() == {"detail": "missao nao encontrada"}` por:

```python
    # O corpo INTEIRO, e nao so o `code`: uma chave a mais (o id pedido, o
    # motivo) seria informacao que o 404 de missao alheia nao pode dar.
    assert resposta.json() == {
        "detail": "missao nao encontrada",
        "code": "missao_nao_encontrada",
    }
```

4. Em `test_missao_de_outro_usuario_responde_o_mesmo_que_missao_inexistente`, troque `    assert negada.json() == inexistente.json()` por:

```python
    # Byte a byte, e nao so o JSON interpretado: a ordem das chaves e o
    # espacamento tambem sao observaveis por quem esta do outro lado.
    assert negada.content == inexistente.content
    assert negada.json()["code"] == "missao_nao_encontrada"
```

5. Logo antes de `def test_operacao_nova_sobre_missao_concluida_devolve_409(`, acrescente:

```python
def test_erro_de_validacao_mantem_o_formato_do_fastapi(client: TestClient) -> None:
    """O 422 de validacao NAO ganha `code` (spec do ciclo diario, secao Erros).

    O `code` e dos erros de DOMINIO. O 422 continua no formato nativo do
    FastAPI -- `detail` como LISTA de erros, com `loc` e `type` --, que e o que
    diz ao cliente qual campo corrigir. Um handler de `RequestValidationError`
    que acrescentasse `code` mudaria esse contrato para todos os endpoints de
    uma vez; este teste e o que recusa essa mudanca.
    """
    resposta = client.post("/api/missions", json=_corpo(difficulty=0))

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert set(corpo) == {"detail"}
    assert isinstance(corpo["detail"], list)


```

- [ ] **Step 2: Rodar e ver falhar**

Run: `uv run pytest tests/integration/test_missions_api.py -q`
Expected: quatro FAILED, com `KeyError: 'code'` ou a comparação de corpo: `test_operacao_nova_sobre_missao_concluida_devolve_409`, `test_chave_de_operacao_gasta_em_outra_missao_devolve_409`, `test_missao_inexistente_devolve_404` e `test_missao_de_outro_usuario_responde_o_mesmo_que_missao_inexistente`. O `test_erro_de_validacao_mantem_o_formato_do_fastapi` **passa**, porque protege um comportamento que já existe. Ele é visto reprovar no Step 7.

- [ ] **Step 3: Implementar em `src/focusquest/main.py`**

1. Troque o bloco de imports da biblioteca padrão:

```python
import logging
from typing import Annotated
```

por:

```python
import logging
from enum import StrEnum
from typing import Annotated
```

2. Troque a função `_erro` inteira (docstring incluída) por:

```python
class CodigoDeErro(StrEnum):
    """O `code` legivel por maquina de cada erro de dominio (decisao C12).

    O cliente DECIDE pelo `code`, e nunca pela prosa do `detail`: a prosa e
    para quem depura, nao tem acento e pode mudar de redacao sem aviso. Os dois
    409 desta API pedem acoes OPOSTAS do cliente -- nada a repetir na transicao
    ilegal, identificador novo no reuso --, e so o `code` os separa.

    Os VALORES sao contrato e estao em portugues porque a spec os fixou assim,
    como os valores do estado da missao; o frontend os repete num tipo proprio.
    Mora aqui, e nao nas classes de erro do dominio, porque e traducao para
    HTTP -- e a traducao inteira mora neste arquivo. Posto na excecao, o codigo
    obrigaria `NaoPertenceAoUsuarioError` a carregar `missao_nao_encontrada`,
    que e mentira no dominio e so e verdade na resposta.

    Tem so os codigos que algum handler devolve. Os do ciclo diario
    (`missao_expirada`, `plano_existente`, ...) entram com o erro que os usa:
    um membro sem handler seria contrato publicado que nenhum caminho alcanca.
    """

    MISSAO_NAO_ENCONTRADA = "missao_nao_encontrada"
    TRANSICAO_ILEGAL = "transicao_ilegal"
    OPERACAO_REUTILIZADA = "operacao_reutilizada"


def _erro(status_code: int, detalhe: str, codigo: CodigoDeErro) -> JSONResponse:
    """A forma de todo corpo de erro de dominio: `{"detail": ..., "code": ...}`.

    As chaves sao em ingles porque payload e contrato, como em `/ready`; e a
    prosa e `detail` -- e nao um nome proprio -- porque e a chave que o proprio
    FastAPI usa no 422 de validacao. O 422 continua no formato nativo, sem
    `code`: ele diz QUAL campo corrigir, e o `loc` ja e legivel por maquina.

    `codigo` e obrigatorio, sem valor padrao: um handler novo que esquecesse o
    `code` reprovaria no mypy, e nao na tela.
    """
    return JSONResponse(
        status_code=status_code, content={"detail": detalhe, "code": codigo}
    )
```

3. Em `_nao_encontrada`, troque `    return _erro(status.HTTP_404_NOT_FOUND, NAO_ENCONTRADA)` por:

```python
    return _erro(
        status.HTTP_404_NOT_FOUND, NAO_ENCONTRADA, CodigoDeErro.MISSAO_NAO_ENCONTRADA
    )
```

4. Em `_nao_pertence`, troque `    return _erro(status.HTTP_404_NOT_FOUND, NAO_ENCONTRADA)` por:

```python
    # O MESMO `code` do 404 de inexistente, e nao um `nao_pertence` proprio:
    # um codigo distinto seria o 403 escrito de outro jeito.
    return _erro(
        status.HTTP_404_NOT_FOUND, NAO_ENCONTRADA, CodigoDeErro.MISSAO_NAO_ENCONTRADA
    )
```

5. Em `_transicao_ilegal`, troque `    return _erro(status.HTTP_409_CONFLICT, str(exc))` por:

```python
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.TRANSICAO_ILEGAL)
```

6. Em `_operacao_reutilizada`, troque `       servidor e que bloqueia" --, e os corpos os separam.` por `       servidor e que bloqueia" --, e o `code` os separa.` e troque `    return _erro(status.HTTP_409_CONFLICT, str(exc))` por:

```python
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.OPERACAO_REUTILIZADA)
```

A prosa do `detail` **não muda**: ela continua sem acento, e a tela deixa de mostrá-la na Task 3.

- [ ] **Step 4: Rodar e ver passar**

Run: `uv run ruff format --check . && uv run ruff check . && uv run mypy src tests alembic && uv run pytest -q --cov`
Expected: tudo limpo; `115 passed` (122 com o PR #5); cobertura de 100%.

- [ ] **Step 5: Mutação — os dois 409 com os códigos trocados**

Em `src/focusquest/main.py`, troque o `CodigoDeErro.TRANSICAO_ILEGAL` do `_transicao_ilegal` por `CodigoDeErro.OPERACAO_REUTILIZADA`, e o `CodigoDeErro.OPERACAO_REUTILIZADA` do `_operacao_reutilizada` por `CodigoDeErro.TRANSICAO_ILEGAL`.

Run: `uv run pytest tests/integration/test_missions_api.py -q`
Expected: dois FAILED, `test_operacao_nova_sobre_missao_concluida_devolve_409` e `test_chave_de_operacao_gasta_em_outra_missao_devolve_409`. Restaure.

- [ ] **Step 6: Mutação — o 404 de missão alheia com outro código**

Em `src/focusquest/main.py`, só dentro de `_nao_pertence`, troque `CodigoDeErro.MISSAO_NAO_ENCONTRADA` por `CodigoDeErro.TRANSICAO_ILEGAL`.

Run: `uv run pytest tests/integration/test_missions_api.py -q`
Expected: só `FAILED ... test_missao_de_outro_usuario_responde_o_mesmo_que_missao_inexistente`. Restaure.

- [ ] **Step 7: Mutação — um handler que põe `code` no 422**

No fim de `src/focusquest/main.py`, acrescente:

```python


from fastapi.encoders import jsonable_encoder  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402


@app.exception_handler(RequestValidationError)
def _validacao(request: Request, exc: RequestValidationError) -> JSONResponse:
    corpo = {"detail": jsonable_encoder(exc.errors()), "code": "validacao"}
    return JSONResponse(status_code=422, content=corpo)
```

Run: `uv run pytest tests/integration/test_missions_api.py -q`
Expected: só `FAILED ... test_erro_de_validacao_mantem_o_formato_do_fastapi`, na asserção `set(corpo) == {"detail"}`: o corpo passou a trazer `code`. Os outros testes de 422 continuam verdes, porque o `detail` segue sendo a lista de erros. Restaure.

- [ ] **Step 8: Riscar a primeira metade da pendência 1 no HANDOFF**

Em `docs/HANDOFF.md`, troque:

```markdown
1. **Os dois 409 não têm `code` legível por máquina.** Transição ilegal e
   `operation_id` gasto só se distinguem pela mensagem em português, e a
   ação correta do cliente é oposta nos dois (não há o que repetir, contra
   gerar um identificador novo e repetir o mesmo corpo). Não entrou agora
   porque a tela do 1a só lista missões e nenhum dos dois 409 é alcançável
   por ela. **Quem construir o fluxo de concluir missão no frontend precisa
   resolver isto antes**, ou vai ramificar em texto de interface.
   **E a prosa do `detail` também não está pronta para a tela**, ao contrário
```

por:

```markdown
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
   **E a prosa do `detail` também não está pronta para a tela**, ao contrário
```

O resto do item (a segunda metade, sobre a prosa do `detail`) fica como está até a Task 3.

- [ ] **Step 9: Atualizar o `docs/ARCHITECTURE.md`**

No §3, troque o bloco inteiro abaixo (item, tabela e parágrafo final):

```markdown
- **Corpo de erro**: `{"detail": ...}`, com a **chave em inglês** (a mesma
  que o FastAPI usa no 422 de validação) e a **prosa em pt-BR**. O 422 de
  validação mantém o formato nativo do FastAPI, em que `detail` é uma
  **lista** de erros, não um texto.

| Situação | Status | `detail` |
|---|---|---|
| Missão inexistente | `404` | `"missao nao encontrada"` |
| Missão de outro usuário | `404`, não 403 | o **mesmo** corpo do 404 acima — responder diferente revelaria que o recurso existe |
| Transição ilegal (ex.: operação nova sobre missão já concluída) | `409` | a mensagem do domínio, dizendo de onde para onde não se pode ir |
| `operation_id` já gasto em outra operação | `409` | a mensagem do serviço, sem revelar a missão nem o tipo da outra operação |
| Corpo inválido, ou `mission_id` fora de `1..2**31 - 1` | `422` | lista de erros do FastAPI |

Os dois 409 **não têm um `code` legível por máquina**: só a mensagem em
português os distingue, e a ação correta do cliente é oposta nos dois
(transição ilegal: não há o que repetir; identificador gasto: gerar um
`operation_id` novo e repetir o mesmo corpo). Registrado como pendência em
`docs/HANDOFF.md`.
```

por:

```markdown
- **Corpo de erro de domínio**: `{"detail": ..., "code": ...}`, com as
  **chaves em inglês**. O `code` é o que o cliente lê para decidir; o
  `detail` é prosa em pt-BR **sem acento**, para quem depura, e a tela nunca
  o mostra. Os códigos estão no enum `CodigoDeErro` de `main.py` e são só os
  que algum handler devolve. O 422 de validação mantém o formato nativo do
  FastAPI, em que `detail` é uma **lista** de erros e não há `code`.

| Situação | Status | `code` | `detail` |
|---|---|---|---|
| Missão inexistente | `404` | `missao_nao_encontrada` | `"missao nao encontrada"` |
| Missão de outro usuário | `404`, não 403 | `missao_nao_encontrada` | o **mesmo** corpo do 404 acima, byte a byte: responder diferente revelaria que o recurso existe |
| Transição ilegal (ex.: operação nova sobre missão já concluída) | `409` | `transicao_ilegal` | a mensagem do domínio, dizendo de onde para onde não se pode ir |
| `operation_id` já gasto em outra operação | `409` | `operacao_reutilizada` | a mensagem do serviço, sem revelar a missão nem o tipo da outra operação |
| Corpo inválido, ou `mission_id` fora de `1..2**31 - 1` | `422` | — | lista de erros do FastAPI |

Os dois 409 pedem ações **opostas** do cliente, e é o `code` que os separa:
na transição ilegal não há o que repetir; no identificador gasto, gera-se um
`operation_id` novo e repete-se o mesmo corpo.
```

No §4, tabela "Backend", logo depois da linha `| Tradução de erro de domínio em status HTTP | ...`, acrescente:

```markdown
| Código de erro (`code`) do contrato HTTP | `src/focusquest/main.py`, enum `CodigoDeErro`, junto dos handlers — nunca nas exceções do domínio | existe |
```

- [ ] **Step 10: Gate**

Run: `make check`
Expected: EXIT 0. Backend `115 passed` (122 com o PR #5), 100%. Frontend `36 passed`. E2E `4 passed`: a tela ainda não lê o `code`, e o `detail` continua no corpo.

- [ ] **Step 11: Commit**

```bash
git add src/focusquest/main.py tests/integration/test_missions_api.py docs/HANDOFF.md docs/ARCHITECTURE.md
git commit -F - <<'EOF'
feat: code legivel por maquina nos erros de dominio

Todo erro de dominio responde {"detail": ..., "code": ...}, com
missao_nao_encontrada nos dois 404 (identicos byte a byte),
transicao_ilegal e operacao_reutilizada. O 422 de validacao continua no
formato do FastAPI, sem code. Fecha a primeira metade da pendencia 1.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Cliente HTTP devolvendo o `code`, e o mapa de falhas da conclusão

Fecha a **segunda metade da pendência 1**: a tela deixa de mostrar o `detail`, e o comentário de `client.ts` que dizia o contrário é corrigido.

**Files:**
- Modify: `frontend/src/shared/api/client.ts` (de `/** Falha de uma chamada a API` até o fim)
- Modify: `frontend/src/shared/api/client.test.ts` (reescrito)
- Modify: `frontend/src/features/missions/types.ts` (acrescenta `MissionErrorCode`)
- Create: `frontend/src/features/missions/completionFailure.ts`
- Create: `frontend/src/features/missions/completionFailure.test.ts`
- Modify: `frontend/src/features/missions/useMissions.ts` (comentário de `messageFor`)
- Modify: `frontend/src/features/missions/useMissions.test.tsx`, `frontend/src/features/missions/MissionList.test.tsx` (o erro da lista sem `detail`)
- Modify: `docs/HANDOFF.md` (pendência 1, segunda metade), `docs/ARCHITECTURE.md` (árvore, §3 `shared/api`, §5.7)

**Interfaces:**
- Consumes: o contrato da Task 2, `{"detail": ..., "code": ...}`, com os três códigos.
- Produces:
  - `class ApiError extends Error { readonly status: number | null; readonly code: string | null; constructor(message: string, status: number | null, code: string | null, options?: ErrorOptions) }`
  - `requestJson<T>(path: string, signal?: AbortSignal): Promise<T>` (inalterado por fora)
  - `postJson<T>(path: string, body: unknown): Promise<T>`
  - `type MissionErrorCode = 'missao_nao_encontrada' | 'transicao_ilegal' | 'operacao_reutilizada'` (em `types.ts`)
  - `type CompletionRecovery = 'retry' | 'retry-with-new-operation' | 'refresh'`
  - `interface CompletionFailure { message: string; recovery: CompletionRecovery }`
  - `describeCompletionFailure(error: unknown): CompletionFailure`

- [ ] **Step 1: Reescrever `frontend/src/shared/api/client.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// O cliente resolve a URL base no CARREGAMENTO do modulo e lanca quando a
// variavel falta -- ver a justificativa em client.ts. E por isso que todo
// teste daqui usa import() dinamico depois de vi.resetModules(): um import
// estatico no topo resolveria a URL uma unica vez, com o valor de
// test.env do vite.config.ts, e nao haveria como exercitar a ausencia.
async function loadClient() {
  return import('./client')
}

/** O erro que a promessa rejeitou, para as assercoes sobre ele. */
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('a chamada deveria ter falhado')
    },
    (error: unknown) => error,
  )
}

describe('client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_API_URL', '/api')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('resolucao da URL base', () => {
    it('recusa o carregamento quando VITE_API_URL esta ausente', async () => {
      vi.stubEnv('VITE_API_URL', undefined)

      await expect(loadClient()).rejects.toThrow(/VITE_API_URL/)
    })

    it('recusa o carregamento quando VITE_API_URL esta vazia', async () => {
      vi.stubEnv('VITE_API_URL', '')

      await expect(loadClient()).rejects.toThrow(/VITE_API_URL/)
    })

    it('monta a URL a partir da variavel, sem barra final no recurso', async () => {
      vi.stubEnv('VITE_API_URL', '/api')
      const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
      vi.stubGlobal('fetch', fetchMock)
      const { requestJson } = await loadClient()

      await requestJson('/missions')

      // A barra final importa: /api/missions/ responde 307 e gasta um
      // round-trip silencioso a cada chamada.
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/missions')
    })
  })

  describe('requestJson', () => {
    it('devolve o corpo desserializado quando a resposta e 200', async () => {
      const payload = [{ id: 1 }]
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)))
      const { requestJson } = await loadClient()

      await expect(requestJson<{ id: number }[]>('/missions')).resolves.toEqual(payload)
    })

    it('pede JSON explicitamente no cabecalho Accept', async () => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
      vi.stubGlobal('fetch', fetchMock)
      const { requestJson } = await loadClient()

      await requestJson('/missions')

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(new Headers(init.headers).get('Accept')).toBe('application/json')
    })

    it('repassa o AbortSignal recebido', async () => {
      const controller = new AbortController()
      const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
      vi.stubGlobal('fetch', fetchMock)
      const { requestJson } = await loadClient()

      await requestJson('/missions', controller.signal)

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(init.signal).toBe(controller.signal)
    })
  })

  describe('postJson', () => {
    it('envia POST com o corpo em JSON e devolve a resposta desserializada', async () => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 7 }))
      vi.stubGlobal('fetch', fetchMock)
      const { postJson } = await loadClient()

      const resposta = await postJson<{ id: number }>('/missions/7/complete', {
        operation_id: 'op-1',
      })

      expect(resposta).toEqual({ id: 7 })
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/missions/7/complete')
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(init.method).toBe('POST')
      expect(init.body).toBe('{"operation_id":"op-1"}')
      // Sem o Content-Type, o FastAPI nao le o corpo como JSON e responde 422.
      const headers = new Headers(init.headers)
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get('Accept')).toBe('application/json')
    })
  })

  describe('traducao de falha em ApiError', () => {
    it('transforma falha de rede em ApiError sem status nem code, preservando a causa', async () => {
      const causa = new TypeError('Failed to fetch')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(causa))
      const { ApiError, postJson } = await loadClient()

      const erro = await failureOf(postJson('/missions/7/complete', { operation_id: 'op-1' }))

      expect(erro).toBeInstanceOf(ApiError)
      // status nulo e o que distingue "nao houve resposta" de "o servidor
      // respondeu mal": a tela nao deve dizer 500 quando nada chegou.
      expect((erro as InstanceType<typeof ApiError>).status).toBeNull()
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
      expect((erro as InstanceType<typeof ApiError>).cause).toBe(causa)
      expect((erro as Error).message).toMatch(/servidor/i)
    })

    it('expoe o code do corpo de erro, junto com o status', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              { detail: 'missao nao encontrada', code: 'missao_nao_encontrada' },
              { status: 404 },
            ),
          ),
      )
      const { ApiError, postJson } = await loadClient()

      const erro = await failureOf(postJson('/missions/9/complete', { operation_id: 'op-1' }))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as InstanceType<typeof ApiError>).status).toBe(404)
      expect((erro as InstanceType<typeof ApiError>).code).toBe('missao_nao_encontrada')
    })

    it('nunca usa o detail como mensagem, mesmo quando ele e texto', async () => {
      // A prosa do `detail` e do backend: sem acento, e a da transicao expoe o
      // valor cru do enum. A mensagem do erro e escrita AQUI, e o `detail` nao
      // e lido. Antes do Incremento A, este era o caminho que o levava a tela.
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              { detail: 'PROSA-CRUA-DO-BACKEND', code: 'transicao_ilegal' },
              { status: 409 },
            ),
          ),
      )
      const { requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect((erro as Error).message).toBe('O servidor respondeu 409.')
    })

    it('devolve code nulo quando o code do corpo nao e texto', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: 'x', code: 42 }, { status: 409 })),
      )
      const { ApiError, requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
    })

    it('devolve code nulo no 422 do FastAPI, que nao tem code', async () => {
      // 422 do FastAPI: detail e uma LISTA de erros de validacao, e nao ha code.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: [{ loc: ['body'] }] }, { status: 422 })),
      )
      const { ApiError, requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as Error).message).toBe('O servidor respondeu 422.')
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
    })

    it('devolve code nulo quando o corpo de erro nao e JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })),
      )
      const { ApiError, requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as Error).message).toBe('O servidor respondeu 502.')
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
    })

    it('devolve code nulo quando o corpo de erro e JSON nulo', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(null, { status: 503 })))
      const { ApiError, requestJson } = await loadClient()

      const erro = await failureOf(requestJson('/missions'))

      expect(erro).toBeInstanceOf(ApiError)
      expect((erro as Error).message).toBe('O servidor respondeu 503.')
      expect((erro as InstanceType<typeof ApiError>).code).toBeNull()
    })
  })
})
```

Todo teste que desestrutura `ApiError` o usa como **valor** (`toBeInstanceOf`). Usado só em `InstanceType<typeof ApiError>`, o ESLint reprova com `'ApiError' is assigned a value but only used as a type` (medido na validação).

- [ ] **Step 2: Escrever o teste do mapa de falhas**

Crie `frontend/src/features/missions/completionFailure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { describeCompletionFailure } from './completionFailure'

// Escrita por extenso, e nao importada do modulo: se a mensagem generica
// mudasse por engano, um teste que a importasse concordaria com ela.
const UNCONFIRMED = {
  message:
    'Não foi possível confirmar a conclusão. Tentar de novo é seguro: a missão não será concluída duas vezes.',
  recovery: 'retry',
}

describe('describeCompletionFailure', () => {
  it.each([
    [
      'missao_nao_encontrada',
      {
        message:
          'Esta missão não está mais no quadro. Atualize o quadro para ver as missões atuais.',
        recovery: 'refresh',
      },
    ],
    [
      'transicao_ilegal',
      {
        message: 'Esta missão já estava concluída. Atualize o quadro para ver o estado atual.',
        recovery: 'refresh',
      },
    ],
    [
      'operacao_reutilizada',
      {
        message: 'Não foi possível registrar esta tentativa. Tente de novo.',
        recovery: 'retry-with-new-operation',
      },
    ],
  ])('traduz o code %s para a mensagem e a acao da tela', (code, esperado) => {
    const erro = new ApiError('O servidor respondeu 409.', 409, code)

    expect(describeCompletionFailure(erro)).toEqual(esperado)
  })

  it('nunca repete o detail nem a mensagem tecnica do erro', () => {
    // O cliente ja descarta o `detail`; esta e a segunda barreira. A mensagem
    // da tela sai do mapa, e nao de `error.message`.
    const erro = new ApiError('PROSA-QUE-NAO-PODE-APARECER', 409, 'transicao_ilegal')

    expect(describeCompletionFailure(erro).message).not.toContain('PROSA-QUE-NAO-PODE-APARECER')
  })

  it('cai na mensagem generica quando o code e desconhecido', () => {
    // Um code que a tela ainda nao conhece -- de um backend mais novo, por
    // exemplo -- nao pode virar texto cru nem tela quebrada.
    const erro = new ApiError('O servidor respondeu 409.', 409, 'missao_expirada')

    expect(describeCompletionFailure(erro)).toEqual(UNCONFIRMED)
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'nao confunde o code %s com uma chave herdada do prototipo',
    (code) => {
      // `code in mapa` diria sim para os quatro, porque o operador `in`
      // percorre o prototipo: a tela leria `Object.prototype.toString` como se
      // fosse a traducao. E a guarda que `Object.hasOwn` existe para fazer.
      const erro = new ApiError('O servidor respondeu 409.', 409, code)

      expect(describeCompletionFailure(erro)).toEqual(UNCONFIRMED)
    },
  )

  it('cai na mensagem generica quando nao ha code (rede, 5xx, 422)', () => {
    const erro = new ApiError('Não foi possível falar com o servidor.', null, null)

    expect(describeCompletionFailure(erro)).toEqual(UNCONFIRMED)
  })

  it('cai na mensagem generica quando a falha nao e um ApiError', () => {
    // Um 200 com corpo corrompido: o `response.json()` do cliente lanca
    // SyntaxError, que nao passa pela traducao em ApiError.
    expect(describeCompletionFailure(new SyntaxError('Unexpected token'))).toEqual(UNCONFIRMED)
  })
})
```

O `missao_expirada` aparece **só no teste**, como exemplo de código que a tela não conhece. Ele não entra em nenhum tipo nem mapa de produção.

- [ ] **Step 3: Ajustar os dois testes da lista que esperavam o `detail`**

Em `frontend/src/features/missions/useMissions.test.tsx`, troque o teste `it('chega em error com a mensagem do ApiError quando a API falha', ...)` inteiro por:

```tsx
  it('chega em error com a mensagem do ApiError -- e nunca com o detail do backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ detail: 'Banco indisponivel.' }, { status: 503 })),
    )

    const { result } = renderHook(() => useMissions())

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'O servidor respondeu 503.',
      })
    })
  })
```

Em `frontend/src/features/missions/MissionList.test.tsx`, no teste `mostra o estado de erro quando a API falha -- e nao o vazio`, troque:

```tsx
    expect(erro).toHaveTextContent('Banco indisponível.')
    expect(erro).toHaveTextContent(/falha ao carregar/i)
```

por:

```tsx
    expect(erro).toHaveTextContent('O servidor respondeu 503.')
    expect(erro).toHaveTextContent(/falha ao carregar/i)
    // A prosa do backend nao chega a tela (spec do ciclo diario, secao Erros).
    expect(erro).not.toHaveTextContent('Banco indisponível.')
```

A mudança dessas duas asserções é a mudança principal da tarefa, e não um ajuste para acomodar comportamento errado (`AGENTS.md` §3): a spec manda a tela nunca mostrar o `detail`.

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd frontend && npx vitest run`
Expected: FAIL. Em `client.test.ts`, 8 dos 14 testes reprovam (`postJson is not a function`, e `code` indefinido onde se espera `null`). Os dois testes da lista reprovam recebendo `'Banco indisponivel.'`. `completionFailure.test.ts` reprova ao coletar, com `Failed to resolve import "./completionFailure"`.

- [ ] **Step 5: Implementar o cliente**

Em `frontend/src/shared/api/client.ts`, mantenha tudo até `const BASE_URL = configured` (inclusive) e substitua o que vem depois, do comentário `/** Falha de uma chamada a API, com o status quando houve resposta. */` até o fim do arquivo, por:

```ts
/**
 * Falha de uma chamada a API, com o status e o `code` quando houve resposta.
 *
 * A `message` e escrita por ESTE cliente, em pt-BR, e nunca vem do `detail` do
 * backend. O `detail` e prosa para quem depura: nao tem acento, e o da transicao
 * ilegal expoe o valor cru do estado. Quem precisa decidir -- que mensagem
 * mostrar, se da para tentar de novo -- decide pelo `code` (spec do ciclo
 * diario, secao Erros). O `detail` nem e lido, e e isso que garante que ele nao
 * chega a tela por um caminho que alguem esqueceu.
 */
export class ApiError extends Error {
  /**
   * O status HTTP, ou `null` quando nao houve resposta nenhuma.
   *
   * A distincao e o que permite a tela nao dizer "o servidor respondeu 500"
   * quando, na verdade, o pedido nem chegou.
   */
  readonly status: number | null

  /**
   * O `code` legivel por maquina do corpo de erro, ou `null` quando ele nao
   * veio: falha de rede, 422 do FastAPI (que nao tem `code`), corpo que nao e
   * JSON, `code` que nao e texto.
   *
   * E `string`, e nao a uniao dos codigos conhecidos: o cliente nao sabe quais
   * codigos cada tela entende, e afirmar a uniao aqui seria uma conversao de
   * tipo sem verificacao. Quem consome estreita o valor.
   */
  readonly code: string | null

  constructor(message: string, status: number | null, code: string | null, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Le o `code` do corpo de erro da API, ou `null` quando ele nao existe.
 *
 * Nem todo corpo de erro tem `code`: o 422 do FastAPI manda so a lista de erros
 * de validacao em `detail`, e um proxy no caminho pode devolver HTML.
 */
async function readCode(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null)
  const code = (body as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}

/**
 * Faz o pedido e traduz qualquer falha em `ApiError`. E o unico `fetch` da
 * aplicacao.
 *
 * O tipo `T` e uma afirmacao de quem chama, nao uma validacao: o cliente nao
 * valida o formato do corpo. Validar aqui exigiria um schema por endpoint, e o
 * contrato ja e verificado do outro lado, pelos testes do backend.
 */
async function send<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, init)
  } catch (cause) {
    throw new ApiError('Não foi possível falar com o servidor.', null, null, { cause })
  }

  if (!response.ok) {
    const code = await readCode(response)
    throw new ApiError(`O servidor respondeu ${String(response.status)}.`, response.status, code)
  }

  return (await response.json()) as T
}

/**
 * Faz um GET em `path` e devolve o JSON desserializado.
 *
 * `path` comeca com barra e NAO termina com barra: `/api/missions/` responde
 * 307 e gasta um round-trip a cada chamada, em silencio.
 */
export async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return send<T>(path, { headers: { Accept: 'application/json' }, signal })
}

/**
 * Faz um POST em `path` com `body` serializado em JSON, e devolve a resposta.
 *
 * Nao recebe `AbortSignal`, de proposito: o unico POST da tela e a conclusao
 * de missao, e cancelar um pedido que muda estado no servidor nao desfaz a
 * mudanca -- so esconde da tela se ela aconteceu. Quem precisa saber repete o
 * pedido com o mesmo `operation_id`, que e idempotente.
 */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return send<T>(path, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
```

O comentário antigo de `readDetail`, que dizia que a prosa do `detail` "pode ir direto para a tela", sai junto com a função. Era ele que a spec mandava corrigir.

- [ ] **Step 6: Acrescentar `MissionErrorCode` ao `types.ts`**

No fim de `frontend/src/features/missions/types.ts`, acrescente:

```ts

/**
 * Os `code` de erro que as rotas de missao devolvem (spec do ciclo diario,
 * decisao C12). Espelha `CodigoDeErro`, em src/focusquest/main.py, e nada amarra
 * os dois automaticamente: um code novo no backend entra aqui a mao, e entao o
 * `tsc` exige a traducao dele em `completionFailure.ts`.
 *
 * Sao DADOS, nao texto de interface: a tela nunca mostra o code, e nunca mostra
 * o `detail` que vem junto.
 */
export type MissionErrorCode = 'missao_nao_encontrada' | 'transicao_ilegal' | 'operacao_reutilizada'
```

- [ ] **Step 7: Criar `frontend/src/features/missions/completionFailure.ts`**

```ts
import { ApiError } from '../../shared/api/client'
import type { MissionErrorCode } from './types'

/**
 * O que a tela oferece depois de uma conclusao que falhou.
 *
 * - `retry`: tentar de novo com o MESMO `operation_id`. E o caso da falha de
 *   rede e do erro sem `code`: nao se sabe se o servidor concluiu, e o reenvio
 *   com a mesma chave e idempotente -- devolve a conclusao que ja existe, ou
 *   conclui agora, mas nunca conclui duas vezes (README §7).
 * - `retry-with-new-operation`: tentar de novo com um `operation_id` NOVO. So
 *   o `operacao_reutilizada` pede isso: a chave pertence a outra operacao, e a
 *   mesma chave seria recusada para sempre.
 * - `refresh`: nao ha o que repetir. A missao ja estava concluida ou nao existe
 *   mais, e a acao util e recarregar o quadro para ver o estado de verdade.
 */
export type CompletionRecovery = 'retry' | 'retry-with-new-operation' | 'refresh'

export interface CompletionFailure {
  /** Texto para a pessoa, em pt-BR. Nunca e o `detail` do backend. */
  message: string
  recovery: CompletionRecovery
}

/**
 * A traducao de cada `code` conhecido, EXAUSTIVA sobre o tipo.
 *
 * `Record<MissionErrorCode, ...>` e o que faz um code novo em
 * `MissionErrorCode` reprovar o `tsc` ate ganhar mensagem e acao aqui. A
 * alternativa -- `Partial` com fallback -- deixaria o code novo cair na
 * mensagem generica sem que ninguem decidisse se era isso mesmo.
 */
const FAILURE_BY_CODE: Record<MissionErrorCode, CompletionFailure> = {
  missao_nao_encontrada: {
    message: 'Esta missão não está mais no quadro. Atualize o quadro para ver as missões atuais.',
    recovery: 'refresh',
  },
  transicao_ilegal: {
    message: 'Esta missão já estava concluída. Atualize o quadro para ver o estado atual.',
    recovery: 'refresh',
  },
  operacao_reutilizada: {
    message: 'Não foi possível registrar esta tentativa. Tente de novo.',
    recovery: 'retry-with-new-operation',
  },
}

/**
 * A falha sem `code` conhecido: rede fora, 5xx, 422, code de um backend mais
 * novo. Nao se sabe se a conclusao aconteceu, e a mensagem diz a unica coisa
 * certa -- que repetir nao duplica.
 */
const UNCONFIRMED: CompletionFailure = {
  message:
    'Não foi possível confirmar a conclusão. Tentar de novo é seguro: a missão não será concluída duas vezes.',
  recovery: 'retry',
}

/**
 * Se `code` e um dos codes que este mapa traduz.
 *
 * `Object.hasOwn`, e nao `code in FAILURE_BY_CODE`: o operador `in` percorre o
 * prototipo, e diria sim para `toString` ou `constructor` -- a tela leria uma
 * funcao herdada como se fosse a traducao.
 */
function isMissionErrorCode(code: string): code is MissionErrorCode {
  return Object.hasOwn(FAILURE_BY_CODE, code)
}

/**
 * A mensagem e a acao da tela para uma conclusao que falhou.
 *
 * Decide pelo `code`, e so por ele. A `message` do `ApiError` e tecnica ("O
 * servidor respondeu 409.") e nao entra aqui; o `detail` do backend nem chega
 * ao `ApiError`.
 */
export function describeCompletionFailure(error: unknown): CompletionFailure {
  if (error instanceof ApiError && error.code !== null && isMissionErrorCode(error.code)) {
    return FAILURE_BY_CODE[error.code]
  }
  return UNCONFIRMED
}
```

- [ ] **Step 8: Corrigir o comentário de `useMissions.ts`**

Em `frontend/src/features/missions/useMissions.ts`, no comentário de `messageFor`, troque:

```ts
 * O `ApiError` ja carrega prosa em pt-BR -- vinda do `detail` do backend ou
 * montada pelo cliente --, entao ela vai direto. Qualquer outra coisa e um
```

por:

```ts
 * O `ApiError` ja carrega prosa em pt-BR, escrita pelo cliente HTTP -- nunca o
 * `detail` do backend, que o cliente nem le --, entao ela vai direto. A leitura
 * da lista nao tem erro de dominio com `code`: o que chega aqui e rede fora ou
 * servidor falhando, e o status basta. Qualquer outra coisa e um
```

O código de `messageFor` não muda.

- [ ] **Step 9: Rodar e ver passar**

Run: `cd frontend && npx prettier --check . && npm run lint && npm run typecheck && npm run test:coverage`
Expected: Prettier, ESLint e `tsc -b` limpos; `Tests  49 passed (49)` (36 antes, mais 2 no cliente e 11 no mapa); resumo de cobertura com `Statements 100% (59/59)`, `Branches 100% (25/25)`, `Functions 100% (22/22)` e `Lines 100% (57/57)`. Dentro de uma sessão de agente, a tabela por arquivo sai vazia (`docs/QUALITY.md` §3): leia o resumo.

- [ ] **Step 10: Mutação — o `detail` volta a ser a mensagem**

Em `frontend/src/shared/api/client.ts`, troque:

```ts
    const code = await readCode(response)
    throw new ApiError(`O servidor respondeu ${String(response.status)}.`, response.status, code)
```

por:

```ts
    const body: unknown = await response.clone().json().catch(() => null)
    const detail = (body as { detail?: unknown } | null)?.detail
    const code = await readCode(response)
    throw new ApiError(
      typeof detail === 'string' ? detail : `O servidor respondeu ${String(response.status)}.`,
      response.status,
      code,
    )
```

Run: `cd frontend && npx vitest run`
Expected: três FAILED: `nunca usa o detail como mensagem, mesmo quando ele e texto`, `mostra o estado de erro quando a API falha -- e nao o vazio` e `chega em error com a mensagem do ApiError -- e nunca com o detail do backend`. Restaure.

- [ ] **Step 11: Mutação — `in` no lugar de `Object.hasOwn`**

Em `frontend/src/features/missions/completionFailure.ts`, troque `  return Object.hasOwn(FAILURE_BY_CODE, code)` por `  return code in FAILURE_BY_CODE`.

Run: `cd frontend && npx vitest run src/features/missions/completionFailure.test.ts`
Expected: `4 failed | 7 passed`, os quatro de `nao confunde o code ... com uma chave herdada do prototipo`. Restaure.

- [ ] **Step 12: Mutação — o mapa deixa de ser exaustivo**

Em `frontend/src/features/missions/completionFailure.ts`, apague a entrada inteira:

```ts
  operacao_reutilizada: {
    message: 'Não foi possível registrar esta tentativa. Tente de novo.',
    recovery: 'retry-with-new-operation',
  },
```

Run: `cd frontend && npx tsc -b`
Expected: `error TS2741: Property 'operacao_reutilizada' is missing in type ... but required in type 'Record<MissionErrorCode, CompletionFailure>'`. O tipo é a prova. Restaure e confira que `npx tsc -b` volta limpo.

- [ ] **Step 13: Riscar a segunda metade da pendência 1 no HANDOFF**

Em `docs/HANDOFF.md`, na pendência 1, troque:

```markdown
   **E a prosa do `detail` também não está pronta para a tela**, ao contrário
   do que o comentário de `frontend/src/shared/api/client.ts` afirma ("pode ir
   direto para a tela"): as mensagens do backend não têm acento
   (`"missao nao encontrada"`), e a de transição ilegal expõe o valor cru do
   enum (`'em_andamento'`), o que contraria a regra do próprio frontend de
   nunca mostrar estado cru. Hoje é inalcançável — a tela só faz GET —, mas
   precisa ser resolvido junto com o `code`, antes de ligar o fluxo de
   conclusão.
```

por:

```markdown
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
```

- [ ] **Step 14: Atualizar o `docs/ARCHITECTURE.md`**

Na árvore do §1, troque:

```text
│   │   │       ├── MissionList.test.tsx
│   │   │       ├── MissionList.tsx
│   │   │       ├── types.ts
```

por:

```text
│   │   │       ├── MissionList.test.tsx
│   │   │       ├── MissionList.tsx
│   │   │       ├── completionFailure.test.ts
│   │   │       ├── completionFailure.ts # code de erro → mensagem e ação da tela
│   │   │       ├── types.ts
```

No §3, troque:

```markdown
- **`src/shared/api/`** *(existe)* — o cliente HTTP único (`client.ts`), com
  a tradução de falha em `ApiError`. Os demais `shared/` (`ui/`, `hooks/`,
  `lib/`, `types/`) continuam contrato.
```

por:

```markdown
- **`src/shared/api/`** *(existe)* — o cliente HTTP único (`client.ts`), com
  `requestJson` (GET) e `postJson` (POST) e a tradução de falha em
  `ApiError`, que carrega `status` e `code`. O cliente **não lê o `detail`**:
  a `message` do `ApiError` é escrita por ele, e quem decide o que mostrar
  decide pelo `code`. Os demais `shared/` (`ui/`, `hooks/`, `lib/`, `types/`)
  continuam contrato.
```

No §5, item 7, troque:

```markdown
   o que atravessa o sistema. O texto que a pessoa lê é pt-BR, inclusive a
   prosa dentro do `detail` de um erro. Nomes internos do código Python
```

por:

```markdown
   o que atravessa o sistema. O texto que a pessoa lê é pt-BR com acento, e
   é escrito pelo frontend: a prosa do `detail` de um erro é pt-BR **sem
   acento**, para quem depura, e a tela nunca a mostra — ela decide pelo
   `code`. Os valores de `code` estão em português pela mesma razão dos
   valores de estado: são dado, não chave. Nomes internos do código Python
```

- [ ] **Step 15: Gate**

Run: `make check`
Expected: EXIT 0. Frontend `49 passed` e 100% nos quatro eixos. Backend `115 passed` (122 com o PR #5). E2E `4 passed`: o cenário do estado de erro confere `Falha ao carregar as missões.`, que continua na tela.

- [ ] **Step 16: Commit**

```bash
git add frontend/src/shared/api/client.ts frontend/src/shared/api/client.test.ts \
  frontend/src/features/missions/types.ts \
  frontend/src/features/missions/completionFailure.ts \
  frontend/src/features/missions/completionFailure.test.ts \
  frontend/src/features/missions/useMissions.ts frontend/src/features/missions/useMissions.test.tsx \
  frontend/src/features/missions/MissionList.test.tsx docs/HANDOFF.md docs/ARCHITECTURE.md
git commit -F - <<'EOF'
feat: cliente http devolve o code e nunca o detail

ApiError carrega status e code, e a message e escrita pelo cliente; o
detail deixa de ser lido. postJson para a conclusao. O mapa exaustivo
code -> mensagem e acao da tela mora em completionFailure.ts, com
Object.hasOwn contra chave herdada. Fecha a pendencia 1.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Botão Concluir no Quartel-General

**Files:**
- Create: `frontend/src/features/missions/useCompleteMission.ts`
- Create: `frontend/src/features/missions/useCompleteMission.test.tsx`
- Modify: `frontend/src/features/missions/MissionList.tsx`
- Modify: `frontend/src/features/missions/MissionList.test.tsx` (imports; novo bloco `describe`)
- Modify: `docs/ARCHITECTURE.md` (árvore e §3 da feature `missions`)

**Interfaces:**
- Consumes: `postJson<T>(path, body)` e `describeCompletionFailure(error): CompletionFailure` (Task 3); `Mission` e `MISSION_STATE_LABELS` (`types.ts`); `useMissions(): { state, reload }`.
- Produces:
  - `type CompletionState = { status: 'idle' } | { status: 'submitting' } | { status: 'completed'; mission: Mission } | { status: 'failed'; failure: CompletionFailure }`
  - `useCompleteMission(missionId: number): { state: CompletionState; complete: () => void }`
  - `data-testid` novos, que o E2E consome: `mission-complete` (botão Concluir / Tentar de novo), `mission-reload` (Atualizar o quadro), `mission-completion-status` (`role="status"`), `mission-completion-error` (`role="alert"`)
  - nome acessível do botão: `Concluir a missão: <instructions>`, `Tentar de novo a missão: <instructions>`

- [ ] **Step 1: Escrever o teste do hook**

Crie `frontend/src/features/missions/useCompleteMission.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Mission } from './types'
import { useCompleteMission } from './useCompleteMission'

const concluida: Mission = {
  id: 7,
  instructions: 'Ler o capitulo 3 de algoritmos',
  completion_criterion: 'Resumo de uma pagina entregue',
  difficulty: 3,
  estimated_minutes: 45,
  deadline: '2026-09-20T13:00:00Z',
  state: 'concluida',
  started_at: null,
  completed_at: '2026-09-18T15:00:00Z',
  xp: 100,
  actual_duration_minutes: null,
}

// Dois identificadores fixos, na ordem em que `crypto.randomUUID` os devolve.
// Fixos para que o teste diga QUAL chave foi enviada em cada tentativa, e nao
// so "uma chave qualquer".
const PRIMEIRA_CHAVE = '00000000-0000-4000-8000-000000000001'
const SEGUNDA_CHAVE = '00000000-0000-4000-8000-000000000002'

/** O `operation_id` de cada POST que o hook fez, na ordem. */
function sentOperationIds(fetchMock: Mock): string[] {
  return fetchMock.mock.calls.map(([, init]) => {
    const body = JSON.parse((init as RequestInit).body as string) as { operation_id: string }
    return body.operation_id
  })
}

function pendingForever() {
  return new Promise<Response>(() => {
    // Nunca resolve: e assim que o estado de envio fica observavel.
  })
}

describe('useCompleteMission', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(PRIMEIRA_CHAVE)
      .mockReturnValueOnce(SEGUNDA_CHAVE)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('comeca parado, sem ir a rede e sem gerar chave', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useCompleteMission(7))

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(fetchMock).not.toHaveBeenCalled()
    // A chave nasce no primeiro clique, e nao na montagem: um quadro com vinte
    // missoes nao precisa de vinte chaves que ninguem vai usar.
    expect(crypto.randomUUID).not.toHaveBeenCalled()
  })

  it('fica em submitting enquanto a resposta nao chega', () => {
    vi.stubGlobal('fetch', vi.fn(pendingForever))
    const { result } = renderHook(() => useCompleteMission(7))

    act(() => {
      result.current.complete()
    })

    expect(result.current.state).toEqual({ status: 'submitting' })
  })

  it('conclui pelo POST da missao e chega em completed com a missao que a API devolveu', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(concluida))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCompleteMission(7))

    act(() => {
      result.current.complete()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'completed', mission: concluida })
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/missions/7/complete')
    expect(sentOperationIds(fetchMock)).toEqual([PRIMEIRA_CHAVE])
  })

  it('depois de uma falha de rede, a nova tentativa reenvia a MESMA chave', async () => {
    // E o README §7: uma falha de rede nao diz se o servidor concluiu. Com a
    // mesma chave, o reenvio devolve a conclusao que ja existe ou conclui
    // agora -- nunca duas vezes.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(concluida))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCompleteMission(7))

    act(() => {
      result.current.complete()
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })
    act(() => {
      result.current.complete()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'completed', mission: concluida })
    })
    expect(sentOperationIds(fetchMock)).toEqual([PRIMEIRA_CHAVE, PRIMEIRA_CHAVE])
  })

  it('depois de operacao_reutilizada, a nova tentativa usa uma chave NOVA', async () => {
    // A chave pertence a outra operacao: com ela, toda tentativa seria
    // recusada. Trocar e seguro -- a missao nao foi concluida por ela.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ detail: 'x', code: 'operacao_reutilizada' }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json(concluida))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCompleteMission(7))

    act(() => {
      result.current.complete()
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'failed',
        failure: {
          message: 'Não foi possível registrar esta tentativa. Tente de novo.',
          recovery: 'retry-with-new-operation',
        },
      })
    })
    act(() => {
      result.current.complete()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'completed', mission: concluida })
    })
    expect(sentOperationIds(fetchMock)).toEqual([PRIMEIRA_CHAVE, SEGUNDA_CHAVE])
  })

  it('transicao_ilegal chega em failed pedindo para atualizar o quadro', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: 'x', code: 'transicao_ilegal' }, { status: 409 }),
        ),
    )
    const { result } = renderHook(() => useCompleteMission(7))

    act(() => {
      result.current.complete()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'failed',
        failure: {
          message: 'Esta missão já estava concluída. Atualize o quadro para ver o estado atual.',
          recovery: 'refresh',
        },
      })
    })
  })
})
```

O `crypto.randomUUID` existe no jsdom deste projeto e aceita `vi.spyOn` (medido). O `vi.restoreAllMocks()` do `afterEach` é obrigatório: o `vite.config.ts` não liga `restoreMocks`.

- [ ] **Step 2: Escrever os testes da tela**

Em `frontend/src/features/missions/MissionList.test.tsx`, troque os dois imports do topo:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
```

por:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
```

e acrescente no **fim** do arquivo:

```tsx

describe('MissionList -- concluir', () => {
  // A missao pendente depois de concluida, como a API a devolve no 200.
  const pendenteConcluida: Mission = {
    ...pendente,
    state: 'concluida',
    completed_at: '2026-09-18T15:00:00Z',
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** O corpo de cada POST de conclusao, na ordem em que saiu. */
  function completionBodies(fetchMock: Mock): unknown[] {
    return fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as unknown)
  }

  it('oferece Concluir so para a missao que ainda nao foi concluida', async () => {
    stubFetchResolving([pendente, emAndamento, concluida])

    render(<MissionList />)

    await screen.findByTestId('missions-list')
    const [itemPendente, itemEmAndamento, itemConcluida] = screen.getAllByTestId('mission-item')
    expect(within(itemPendente).getByTestId('mission-complete')).toBeInTheDocument()
    expect(within(itemEmAndamento).getByTestId('mission-complete')).toBeInTheDocument()
    // `concluida` e terminal (decisao A5): nao ha o que oferecer.
    expect(within(itemConcluida).queryByTestId('mission-complete')).not.toBeInTheDocument()
  })

  it('da ao botao um nome acessivel que diz QUAL missao ele conclui', async () => {
    // Com varias missoes no quadro, "Concluir" sozinho seria o mesmo nome em
    // todos os botoes, e o leitor de tela nao teria como distingui-los.
    stubFetchResolving([pendente])

    render(<MissionList />)

    expect(
      await screen.findByRole('button', {
        name: 'Concluir a missão: Ler o capitulo 3 de algoritmos',
      }),
    ).toBeVisible()
  })

  it('durante o envio, desabilita o botao e anuncia; um segundo clique nao reenvia', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([pendente]))
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    render(<MissionList />)
    const botao = await screen.findByTestId('mission-complete')

    fireEvent.click(botao)
    fireEvent.click(botao)

    expect(botao).toBeDisabled()
    expect(botao).toHaveTextContent('Concluindo…')
    expect(screen.getByTestId('mission-completion-status')).toHaveTextContent(
      'Concluindo a missão…',
    )
    // Um GET da lista e UM POST: o segundo clique caiu no botao desabilitado.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('depois do sucesso, mostra a missao concluida, anuncia e tira o botao', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([pendente]))
        .mockResolvedValueOnce(Response.json(pendenteConcluida)),
    )
    render(<MissionList />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    // O rotulo sai da missao que a API DEVOLVEU, e nao de um palpite da tela.
    expect(await screen.findByText('Missão concluída.')).toHaveAttribute('role', 'status')
    expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    expect(screen.queryByTestId('mission-complete')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mission-completion-error')).not.toBeInTheDocument()
  })

  it('numa falha de rede, avisa e deixa tentar de novo com a MESMA chave', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([pendente]))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(pendenteConcluida))
    vi.stubGlobal('fetch', fetchMock)
    render(<MissionList />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    const aviso = await screen.findByTestId('mission-completion-error')
    expect(aviso).toHaveAttribute('role', 'alert')
    expect(aviso).toHaveTextContent(
      'Não foi possível confirmar a conclusão. Tentar de novo é seguro: a missão não será concluída duas vezes.',
    )
    const tentarDeNovo = screen.getByRole('button', {
      name: 'Tentar de novo a missão: Ler o capitulo 3 de algoritmos',
    })

    fireEvent.click(tentarDeNovo)

    expect(await screen.findByText('Missão concluída.')).toBeInTheDocument()
    const [primeiro, segundo] = completionBodies(fetchMock)
    expect(segundo).toEqual(primeiro)
  })

  it('na transicao ilegal, tira o Concluir e oferece Atualizar o quadro, que recarrega', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([pendente]))
      .mockResolvedValueOnce(
        Response.json(
          { detail: 'PROSA-CRUA-DO-BACKEND', code: 'transicao_ilegal' },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(Response.json([pendenteConcluida]))
    vi.stubGlobal('fetch', fetchMock)
    render(<MissionList />)

    fireEvent.click(await screen.findByTestId('mission-complete'))

    expect(await screen.findByTestId('mission-completion-error')).toHaveTextContent(
      'Esta missão já estava concluída. Atualize o quadro para ver o estado atual.',
    )
    expect(screen.queryByTestId('mission-complete')).not.toBeInTheDocument()
    // Nem a prosa do backend nem o code cru chegam a tela.
    expect(screen.getByTestId('missions')).not.toHaveTextContent('PROSA-CRUA-DO-BACKEND')
    expect(screen.getByTestId('missions')).not.toHaveTextContent('transicao_ilegal')

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar o quadro' }))

    await waitFor(() => {
      expect(screen.getByTestId('mission-state')).toHaveTextContent('Concluída')
    })
    expect(screen.queryByTestId('mission-completion-error')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
```

`pendente`, `emAndamento`, `concluida` e `stubFetchResolving` já existem no topo do arquivo.

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/features/missions`
Expected: FAIL. `useCompleteMission.test.tsx` não coleta (`Failed to resolve import "./useCompleteMission"`), e os 6 testes do bloco `MissionList -- concluir` reprovam, sem `mission-complete` na tela.

- [ ] **Step 4: Criar `frontend/src/features/missions/useCompleteMission.ts`**

```ts
import { useCallback, useRef, useState } from 'react'
import { postJson } from '../../shared/api/client'
import { describeCompletionFailure, type CompletionFailure } from './completionFailure'
import type { Mission } from './types'

/**
 * Os estados da conclusao de UMA missao, como uniao discriminada.
 *
 * `completed` carrega a missao que a API devolveu, e nao so um "deu certo": e
 * ela que a tela passa a mostrar, com o estado e o `completed_at` do servidor.
 * `failed` carrega a traducao da falha -- mensagem e acao --, e nao o erro cru.
 */
export type CompletionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'completed'; mission: Mission }
  | { status: 'failed'; failure: CompletionFailure }

export interface UseCompleteMissionResult {
  state: CompletionState
  /** Envia a conclusao. Depois de uma falha, e tambem o "tentar de novo". */
  complete: () => void
}

/**
 * Conclui a missao `missionId` pela API, de forma idempotente.
 *
 * O `operation_id` nasce no PRIMEIRO envio e e mantido entre as tentativas: e
 * o que torna seguro repetir depois de uma falha de rede (README §7). Uma
 * chave nova a cada clique transformaria o reenvio numa conclusao nova -- a
 * segunda receberia `transicao_ilegal`, e a tela diria "ja estava concluida"
 * sobre uma conclusao que ela mesma acabou de fazer.
 *
 * A chave so e trocada quando a API diz que ela pertence a outra operacao
 * (`operacao_reutilizada`): com ela, toda tentativa seria recusada, e trocar e
 * seguro porque a missao nao foi concluida por ela.
 *
 * Fica num `useRef`, e nao num `useState`: a chave nao aparece na tela, e
 * troca-la nao deve renderizar nada.
 */
export function useCompleteMission(missionId: number): UseCompleteMissionResult {
  const [state, setState] = useState<CompletionState>({ status: 'idle' })
  const operationId = useRef<string | null>(null)

  const complete = useCallback(() => {
    operationId.current ??= crypto.randomUUID()
    setState({ status: 'submitting' })

    postJson<Mission>(`/missions/${String(missionId)}/complete`, {
      operation_id: operationId.current,
    })
      .then((mission) => {
        setState({ status: 'completed', mission })
      })
      .catch((error: unknown) => {
        const failure = describeCompletionFailure(error)
        if (failure.recovery === 'retry-with-new-operation') {
          operationId.current = null
        }
        setState({ status: 'failed', failure })
      })
  }, [missionId])

  return { state, complete }
}
```

- [ ] **Step 5: Ligar o hook no cartão, em `MissionList.tsx`**

Em `frontend/src/features/missions/MissionList.tsx`:

1. Troque:

```tsx
import { MISSION_STATE_LABELS, type Mission } from './types'
import { useMissions, type MissionsState } from './useMissions'
```

por:

```tsx
import { MISSION_STATE_LABELS, type Mission } from './types'
import { useCompleteMission, type CompletionState } from './useCompleteMission'
import { useMissions, type MissionsState } from './useMissions'
```

2. Troque:

```tsx
function MissionCard({ mission }: { mission: Mission }) {
  return (
```

por:

```tsx
const COMPLETE_BUTTON_CLASS =
  'rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const RELOAD_BUTTON_CLASS =
  'rounded border border-slate-400/60 px-3 py-1 text-sm font-medium text-slate-100 ' +
  'hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none'

/** O texto do botao de concluir em cada estado em que ele aparece. */
function completeLabel(completion: CompletionState): string {
  if (completion.status === 'submitting') {
    return 'Concluindo…'
  }
  return completion.status === 'failed' ? 'Tentar de novo' : 'Concluir'
}

/** O que a regiao viva anuncia. Vazio quando nao ha nada acontecendo. */
function statusText(completion: CompletionState): string {
  if (completion.status === 'submitting') {
    return 'Concluindo a missão…'
  }
  return completion.status === 'completed' ? 'Missão concluída.' : ''
}

/**
 * O botao Concluir e o que a tela diz durante e depois da conclusao.
 *
 * Cada estado, decidido de proposito:
 *
 * - **parado**: "Concluir", com o nome acessivel completando QUAL missao.
 * - **enviando**: o botao fica desabilitado e diz "Concluindo…", e a regiao
 *   viva anuncia. Desabilitar nao e so estetica: e o que impede o clique
 *   duplo de mandar dois pedidos.
 * - **concluida**: o botao some, porque `concluida` e terminal (A5), e a
 *   regiao viva anuncia "Missão concluída.". O rotulo de estado do cartao ja
 *   mostra a missao que a API devolveu.
 * - **falha que se repete** (rede, erro sem code, chave gasta): o aviso e o
 *   botao vira "Tentar de novo" -- com a mesma chave, ou com uma nova, quem
 *   decide e o hook.
 * - **falha que nao se repete** (ja concluida, nao existe mais): o aviso, e
 *   "Atualizar o quadro" no lugar do Concluir. Repetir so daria o mesmo erro;
 *   recarregar mostra o estado de verdade.
 *
 * A regiao `role="status"` existe desde o primeiro render, vazia: um leitor de
 * tela so anuncia mudancas numa regiao viva que ja estava no documento.
 *
 * O nome acessivel do botao completa QUAL missao ele conclui, num `sr-only`:
 * com varias missoes no quadro, "Concluir" sozinho seria o mesmo nome em todos
 * os botoes. O espaco entre o rotulo e o `span` fica FORA dele, no `{' '}`:
 * escrito dentro do `span`, o calculo do nome acessivel do jsdom o descartava
 * e o nome saia "Concluira missão" (medido).
 */
function CompletionControls({
  mission,
  completion,
  onComplete,
  onReload,
}: {
  mission: Mission
  completion: CompletionState
  onComplete: () => void
  onReload: () => void
}) {
  // Missao que ja veio concluida do quadro: nada a oferecer nem a anunciar. O
  // rotulo de estado ja diz "Concluída".
  if (mission.state === 'concluida' && completion.status === 'idle') {
    return null
  }

  const failure = completion.status === 'failed' ? completion.failure : null
  const canComplete = mission.state !== 'concluida' && failure?.recovery !== 'refresh'

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {canComplete && (
        <button
          type="button"
          data-testid="mission-complete"
          disabled={completion.status === 'submitting'}
          onClick={onComplete}
          className={COMPLETE_BUTTON_CLASS}
        >
          {completeLabel(completion)}{' '}
          <span className="sr-only">a missão: {mission.instructions}</span>
        </button>
      )}
      {failure?.recovery === 'refresh' && (
        <button
          type="button"
          data-testid="mission-reload"
          onClick={onReload}
          className={RELOAD_BUTTON_CLASS}
        >
          Atualizar o quadro
        </button>
      )}
      <p role="status" data-testid="mission-completion-status" className="text-sm text-emerald-300">
        {statusText(completion)}
      </p>
      {failure !== null && (
        <p
          role="alert"
          data-testid="mission-completion-error"
          className="w-full text-sm text-red-300"
        >
          {failure.message}
        </p>
      )}
    </div>
  )
}

function MissionCard({ mission: listed, onReload }: { mission: Mission; onReload: () => void }) {
  const { state: completion, complete } = useCompleteMission(listed.id)
  // Depois do sucesso, o cartao mostra a missao que a API DEVOLVEU. Ela nao
  // fica velha: `concluida` e terminal (A5), e a proxima leitura do quadro --
  // o "Atualizar", ou o "Tentar novamente" da lista -- monta cartoes novos.
  const mission = completion.status === 'completed' ? completion.mission : listed

  return (
```

3. No fim de `MissionCard`, troque:

```tsx
        )}
      </dl>
    </li>
  )
}
```

por:

```tsx
        )}
      </dl>

      <CompletionControls
        mission={mission}
        completion={completion}
        onComplete={complete}
        onReload={onReload}
      />
    </li>
  )
}
```

4. Em `MissionsContent`, renomeie a prop `onRetry` para `onReload`, porque ela passa a servir também ao "Atualizar o quadro". Troque:

```tsx
function MissionsContent({
  state,
  onRetry,
}: {
  state: MissionsState
  onRetry: () => void
}): ReactElement {
```

por:

```tsx
function MissionsContent({
  state,
  onReload,
}: {
  state: MissionsState
  onReload: () => void
}): ReactElement {
```

troque `            onClick={onRetry}` por `            onClick={onReload}`, troque `            <MissionCard key={mission.id} mission={mission} />` por `            <MissionCard key={mission.id} mission={mission} onReload={onReload} />`, e em `MissionList` troque `      <MissionsContent state={state} onRetry={reload} />` por `      <MissionsContent state={state} onReload={reload} />`.

- [ ] **Step 6: Rodar e ver passar**

Run: `cd frontend && npx prettier --check . && npm run lint && npm run typecheck && npm run test:coverage`
Expected: tudo limpo; `Tests  61 passed (61)`; resumo `Statements 100% (86/86)`, `Branches 100% (51/51)`, `Functions 100% (29/29)`, `Lines 100% (84/84)`.

- [ ] **Step 7: Mutação — uma chave nova a cada clique**

Em `frontend/src/features/missions/useCompleteMission.ts`, troque `    operationId.current ??= crypto.randomUUID()` por `    operationId.current = crypto.randomUUID()`.

Run: `cd frontend && npx vitest run src/features/missions/useCompleteMission.test.tsx`
Expected: `1 failed | 5 passed`, o `depois de uma falha de rede, a nova tentativa reenvia a MESMA chave`. Restaure.

- [ ] **Step 8: Mutação — a chave gasta nunca é trocada**

Em `frontend/src/features/missions/useCompleteMission.ts`, apague:

```ts
        if (failure.recovery === 'retry-with-new-operation') {
          operationId.current = null
        }
```

Run: `cd frontend && npx vitest run src/features/missions/useCompleteMission.test.tsx`
Expected: `1 failed | 5 passed`, o `depois de operacao_reutilizada, a nova tentativa usa uma chave NOVA`. Restaure.

- [ ] **Step 9: Mutação — o botão não se desabilita durante o envio**

Em `frontend/src/features/missions/MissionList.tsx`, apague a linha `          disabled={completion.status === 'submitting'}`.

Run: `cd frontend && npx vitest run src/features/missions/MissionList.test.tsx`
Expected: `1 failed | 18 passed`, o `durante o envio, desabilita o botao e anuncia; um segundo clique nao reenvia`. Restaure.

- [ ] **Step 10: Mutação — "Concluir" continua depois de uma falha que não se repete**

Em `frontend/src/features/missions/MissionList.tsx`, troque `  const canComplete = mission.state !== 'concluida' && failure?.recovery !== 'refresh'` por `  const canComplete = mission.state !== 'concluida'`.

Run: `cd frontend && npx vitest run src/features/missions/MissionList.test.tsx`
Expected: `1 failed | 18 passed`, o `na transicao ilegal, tira o Concluir e oferece Atualizar o quadro, que recarrega`. Restaure.

- [ ] **Step 11: Mutação — o cartão ignora a missão devolvida**

Em `frontend/src/features/missions/MissionList.tsx`, troque `  const mission = completion.status === 'completed' ? completion.mission : listed` por `  const mission = listed`.

Run: `cd frontend && npx vitest run src/features/missions/MissionList.test.tsx`
Expected: `1 failed | 18 passed`, o `depois do sucesso, mostra a missao concluida, anuncia e tira o botao`. Restaure.

- [ ] **Step 12: Atualizar o `docs/ARCHITECTURE.md`**

Na árvore do §1, troque:

```text
│   │   │   └── missions/          # a feature de missões: tipos, hook de dados e componente
```

por:

```text
│   │   │   └── missions/          # a feature de missões: tipos, hooks de leitura e de conclusão, componente
```

e troque:

```text
│   │   │       ├── types.ts
│   │   │       ├── useMissions.test.tsx
```

por:

```text
│   │   │       ├── types.ts
│   │   │       ├── useCompleteMission.test.tsx
│   │   │       ├── useCompleteMission.ts # conclui uma missão; o operation_id vive num useRef
│   │   │       ├── useMissions.test.tsx
```

No §3, troque:

```markdown
  tela como união discriminada (carregando, vazio, erro, carregado), e
  `MissionList.tsx` os desenha.
```

por:

```markdown
  tela como união discriminada (carregando, vazio, erro, carregado), e
  `MissionList.tsx` os desenha. Cada cartão ainda não concluído tem o botão
  **Concluir**: `useCompleteMission.ts` envia `POST /complete` com um
  `operation_id` gerado no primeiro clique e **mantido entre as tentativas**
  (README §7), e `completionFailure.ts` traduz o `code` de cada falha em
  mensagem e ação (tentar de novo com a mesma chave, com uma chave nova, ou
  atualizar o quadro).
```

- [ ] **Step 13: Gate**

Run: `make check`
Expected: EXIT 0. Frontend `61 passed`, 100% nos quatro eixos. Backend `115 passed` (122 com o PR #5). E2E `4 passed`: os cenários antigos continuam verdes com o botão novo nos cartões, inclusive o axe da lista carregada.

- [ ] **Step 14: Commit**

```bash
git add frontend/src/features/missions/useCompleteMission.ts \
  frontend/src/features/missions/useCompleteMission.test.tsx \
  frontend/src/features/missions/MissionList.tsx \
  frontend/src/features/missions/MissionList.test.tsx docs/ARCHITECTURE.md
git commit -F - <<'EOF'
feat: botao concluir no quartel-general

Cada cartao nao concluido ganha Concluir. O operation_id nasce no
primeiro clique e e mantido entre as tentativas; so operacao_reutilizada
o troca. Durante o envio o botao fica desabilitado e a regiao viva
anuncia; transicao_ilegal e missao_nao_encontrada oferecem Atualizar o
quadro no lugar de repetir.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: E2E da conclusão e fechamento do incremento

O A é o primeiro fluxo de **escrita** da tela, então o E2E o cobre de ponta a ponta. São dois cenários: concluir e ver o estado persistir, com o axe no estado concluído; e a resposta perdida no caminho, com o axe no aviso de falha.

**Files:**
- Modify: `frontend/tests/e2e/headquarters.spec.ts`
- Modify: `docs/QUALITY.md` (§4, `check-e2e`)
- Modify: `docs/HANDOFF.md` (revisão-base, decisões, alterações, resultados, pendências 20 e 21, pendências novas, próximo incremento)

**Interfaces:**
- Consumes: os `data-testid` e os nomes acessíveis da Task 4; `API_URL` de `frontend/tests/e2e/servers.ts`; `abrirQuadro(page)`, `EXECUCAO`, `PedidoDeMissao`, `MissaoCriada` e `semear` do próprio spec.
- Produces: os helpers `criarMissao(api, pedido)` e `missaoDoCenario(playwright, rotulo)` no spec; seis cenários no `check-e2e`.

- [ ] **Step 1: Preparar os helpers no spec**

Em `frontend/tests/e2e/headquarters.spec.ts`:

1. Troque `import { expect, test, type APIRequestContext, type Page } from '@playwright/test'` por:

```ts
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type PlaywrightWorkerArgs,
} from '@playwright/test'
```

2. Em `interface MissaoCriada extends PedidoDeMissao`, acrescente depois de `  xp: number` a linha `  completed_at: string | null`.

3. Troque a função `semear` inteira por:

```ts
/** Cria uma missao pela API dedicada e devolve o corpo do 201. */
async function criarMissao(api: APIRequestContext, pedido: PedidoDeMissao): Promise<MissaoCriada> {
  const resposta = await api.post('/api/missions', { data: pedido })
  // O corpo entra na mensagem de falha: um 422 sem corpo diria apenas "nao
  // foi 201", e o que interessa e QUAL campo a API recusou.
  expect(resposta.status(), await resposta.text()).toBe(201)
  return (await resposta.json()) as MissaoCriada
}

async function semear(api: APIRequestContext): Promise<void> {
  for (const pedido of PEDIDOS) {
    criadas.push(await criarMissao(api, pedido))
  }
}

/**
 * Uma missao PROPRIA do cenario que a cria, semeada pela API dedicada.
 *
 * Os cenarios de conclusao nao usam as missoes do `beforeAll`: concluir uma
 * delas mudaria o que o primeiro cenario confere ('Pendente'), e o resultado
 * passaria a depender da ordem em que os cenarios rodam.
 */
async function missaoDoCenario(
  playwright: PlaywrightWorkerArgs['playwright'],
  rotulo: string,
): Promise<MissaoCriada> {
  const api = await playwright.request.newContext({ baseURL: API_URL })
  try {
    return await criarMissao(api, {
      instructions: `${rotulo} (e2e ${EXECUCAO})`,
      completion_criterion: `Entrega conferida (e2e ${EXECUCAO})`,
      difficulty: 2,
      estimated_minutes: 30,
      deadline: '2027-03-01T12:00:00Z',
    })
  } finally {
    await api.dispose()
  }
}
```

- [ ] **Step 2: Escrever os dois cenários novos**

No **fim** de `frontend/tests/e2e/headquarters.spec.ts`, acrescente:

```ts

/**
 * O primeiro fluxo de ESCRITA da tela: concluir uma missao pelo botao.
 *
 * Tres coisas que nenhum teste de unidade prova juntas: o clique sai do
 * navegador, passa pelo proxy do build de producao e muda o estado no banco
 * (a recarga le de novo e continua 'Concluída'); o `crypto.randomUUID` existe
 * no navegador de verdade (ele so existe em contexto seguro, e
 * `http://127.0.0.1` e um); e o estado concluido passa no axe.
 */
test('concluir pela tela muda o estado no servidor, e a tela concluida e acessivel', async ({
  page,
  playwright,
}) => {
  const alvo = await missaoDoCenario(playwright, 'Revisar o capitulo 4')
  const lista = await abrirQuadro(page)
  const item = lista.locator(`[data-mission-id="${String(alvo.id)}"]`)

  // Pelo NOME ACESSIVEL, que diz qual missao o botao conclui.
  await item.getByRole('button', { name: `Concluir a missão: ${alvo.instructions}` }).click()

  await expect(item.getByRole('status')).toHaveText('Missão concluída.')
  await expect(item.getByTestId('mission-state')).toHaveText('Concluída')
  await expect(item.getByTestId('mission-complete')).toHaveCount(0)

  // Conjunto de regras PADRAO, sem `withTags` nem `disableRules`.
  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])

  // Persistiu: a recarga le do banco de novo, e nao do estado da tela.
  await page.reload()
  await expect(
    page
      .getByTestId('missions-list')
      .locator(`[data-mission-id="${String(alvo.id)}"]`)
      .getByTestId('mission-state'),
  ).toHaveText('Concluída')
})

/**
 * A resposta perdida no caminho -- o caso que a idempotencia existe para
 * atender (README §7).
 *
 * O primeiro POST CHEGA ao servidor, que conclui; so a resposta e descartada
 * antes de o navegador a ver (`route.fetch()` e depois `route.abort()`). Para
 * a tela, isso e indistinguivel de uma falha de rede: ela nao sabe se
 * concluiu. O reenvio com a MESMA chave tem de receber 200 com a MESMA
 * conclusao, e nao 409 de "ja concluida" -- que e o que uma chave nova a cada
 * clique produziria.
 *
 * Abortar antes de o pedido sair nao provaria nada disso: o servidor nunca
 * teria concluido, e qualquer chave serviria no reenvio.
 */
test('com a resposta perdida, o reenvio usa a mesma chave e recebe a mesma conclusao', async ({
  page,
  playwright,
}) => {
  const alvo = await missaoDoCenario(playwright, 'Refazer a lista 2')
  const rota = `**/api/missions/${String(alvo.id)}/complete`
  // O que o interceptador viu: a chave de cada pedido e o corpo de cada
  // resposta que o servidor deu e o navegador nunca recebeu.
  const chaves: string[] = []
  const descartadas: MissaoCriada[] = []

  await page.route(rota, async (route) => {
    chaves.push((route.request().postDataJSON() as { operation_id: string }).operation_id)
    const resposta = await route.fetch()
    descartadas.push((await resposta.json()) as MissaoCriada)
    await route.abort()
  })

  const lista = await abrirQuadro(page)
  const item = lista.locator(`[data-mission-id="${String(alvo.id)}"]`)
  await item.getByRole('button', { name: `Concluir a missão: ${alvo.instructions}` }).click()

  // A tela nao sabe se concluiu, e diz isso -- num alerta que o axe audita.
  await expect(item.getByRole('alert')).toContainText('Tentar de novo é seguro')
  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])

  // O servidor, sim, concluiu: a resposta descartada trazia a missao concluida.
  expect(descartadas).toHaveLength(1)
  expect(descartadas[0]?.state).toBe('concluida')

  await page.unroute(rota)
  const reenvio = page.waitForResponse((resposta) =>
    resposta.url().endsWith(`/api/missions/${String(alvo.id)}/complete`),
  )
  await item.getByRole('button', { name: `Tentar de novo a missão: ${alvo.instructions}` }).click()
  const segunda = await reenvio

  expect(segunda.status()).toBe(200)
  const segundaConclusao = (await segunda.json()) as MissaoCriada
  // A MESMA conclusao: o `completed_at` e o do primeiro pedido, e nao um novo.
  expect(segundaConclusao.completed_at).toBe(descartadas[0]?.completed_at)
  expect(JSON.parse(segunda.request().postData() ?? '{}')).toEqual({ operation_id: chaves[0] })
  await expect(item.getByRole('status')).toHaveText('Missão concluída.')
})
```

Os dados capturados no interceptador ficam em **listas**, e não numa variável `let` reatribuída dentro do callback. Com a variável, o TypeScript a estreita para `null` fora do callback e exige uma conversão de tipo para ler (medido na validação).

- [ ] **Step 3: Rodar o E2E**

Run: `cd frontend && npx prettier --check . && npm run lint && npm run typecheck && cd .. && make check-e2e`
Expected: `6 passed`. Os dois cenários novos existem para cobrir um fluxo que já funciona desde a Task 4, então passam de primeira. Os Steps 4 a 6 os mostram reprovando.

- [ ] **Step 4: Mutação — uma chave nova a cada clique, de ponta a ponta**

Em `frontend/src/features/missions/useCompleteMission.ts`, troque `    operationId.current ??= crypto.randomUUID()` por `    operationId.current = crypto.randomUUID()`.

Run: `make check-e2e`
Expected: `1 failed | 5 passed`. O cenário `com a resposta perdida, o reenvio usa a mesma chave e recebe a mesma conclusao` reprova com `Expected: 200` e `Received: 409`: a chave nova vira uma conclusão nova, e o servidor responde `transicao_ilegal`. Restaure.

- [ ] **Step 5: Mutação — o POST sem `Content-Type`**

Em `frontend/src/shared/api/client.ts`, em `postJson`, troque `    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },` por `    headers: { Accept: 'application/json' },`.

Run: `make check-e2e`
Expected: os dois cenários novos reprovam. O log do `[WebServer]` mostra `POST /api/missions/<id>/complete HTTP/1.1" 422`: sem o cabeçalho, o FastAPI não lê o corpo como JSON. O teste de unidade do cliente já cobre o cabeçalho, e o E2E prova que o servidor de verdade depende dele. Restaure.

- [ ] **Step 6: Mutação — um `<img>` sem `alt` no aviso de falha**

Em `frontend/src/features/missions/MissionList.tsx`, troque:

```tsx
          {failure.message}
        </p>
```

por:

```tsx
          {failure.message}
          <img src="/alerta.png" />
        </p>
```

Run: `make check-e2e`
Expected: `1 failed | 5 passed`. O cenário da resposta perdida reprova com `"id": "image-alt"`, e o axe dos outros estados continua verde. Sem esse cenário, um defeito de acessibilidade no aviso de falha seria invisível ao gate. Restaure.

- [ ] **Step 7: Atualizar o `docs/QUALITY.md` §4**

Troque:

```markdown
- **axe-core** com o conjunto de regras padrão (sem `withTags` nem
  `disableRules`), exigindo zero violações, em dois estados da tela: a lista
  carregada e o estado de erro (forçado com `page.route(...).abort()`). O
  estado de carregando **não** é auditado.
```

por:

```markdown
- **axe-core** com o conjunto de regras padrão (sem `withTags` nem
  `disableRules`), exigindo zero violações, em quatro estados da tela: a
  lista carregada; o erro de carregamento (forçado com
  `page.route(...).abort()`); a missão recém-concluída pelo botão; e o aviso
  de falha da conclusão (a resposta do POST descartada com `route.fetch()` e
  `route.abort()`, depois de o servidor concluir). O estado de carregando e
  o de envio **não** são auditados.
```

e troque:

```markdown
  no próximo `DROP SCHEMA` da suíte pytest. Depois de um `make check`
  completo sobram as duas missões da última execução do E2E (medido: 2
  linhas); `make check-e2e` rodado repetidamente, sem o `check-api` no
  meio, acumula.
```

por:

```markdown
  no próximo `DROP SCHEMA` da suíte pytest. Cada execução cria quatro
  missões: as duas que o `beforeAll` semeia e uma por cenário de conclusão.
  Depois de um `make check` completo sobram as quatro da última execução do
  E2E (medido no Incremento A: 4 linhas); `make check-e2e` rodado
  repetidamente, sem o `check-api` no meio, acumula quatro por execução.
```

- [ ] **Step 8: Registrar o incremento no `docs/HANDOFF.md`**

Descubra a revisão-base e os commits antes de escrever:

```bash
git merge-base HEAD main
git log --oneline "$(git merge-base HEAD main)"..HEAD
```

1. Logo depois do título `## Revisão-base`, acrescente, substituindo `<base>` pelo SHA curto que o primeiro comando imprimiu:

```markdown
**Incremento A — conclusão na tela.** Branch `feat/incremento-a`, aberta a
partir de `<base>` (a `main` naquele momento). Spec em
`docs/superpowers/specs/2026-09-18-ciclo-diario-design.md` (seção B2,
decisões C12 e C13); plano em
`docs/superpowers/plans/2026-09-18-incremento-a.md`. Relógio injetável,
`code` nos erros de domínio e o botão Concluir para as missões avulsas.
Fecha as pendências 1 e 7. O texto abaixo, até "Incrementos anteriores",
continua sendo o registro do Incremento 1a.

```

2. Logo antes de `### Incrementos anteriores`, acrescente:

```markdown
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
| O `operation_id` nasce no primeiro clique, num `useRef`, e só troca depois de `operacao_reutilizada` | Uma chave nova por clique transformaria o reenvio numa conclusão nova (409). |
| O erro de carregamento da lista mostra a `message` do `ApiError` (`O servidor respondeu 503.`) | A leitura da lista não tem erro de domínio com `code`; o texto é do cliente, e não do backend. |

```

3. Logo antes de `## Alterações do Incremento 1a`, acrescente, substituindo `<commits>` pela lista que o segundo comando imprimiu:

```markdown
## Alterações do Incremento A

Commits `<commits>`:

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
- **Documentação:** este arquivo, o `docs/ARCHITECTURE.md` (árvore,
  contrato de erro, feature `missions`, §5.7) e o `docs/QUALITY.md` §4.

```

4. Na tabela de `## Resultados`, acrescente as linhas abaixo **com os números que o seu `make check` imprimiu no Step 12**. Os valores escritos aqui são os medidos na validação deste plano, sobre a `main` sem o PR #5; o documento afirma o que **você** mediu, e o que divergir se corrige:

```markdown
| `make check` duas vezes seguidas, sobre o topo de `feat/incremento-a` | Aprovado, EXIT 0 nas duas. Frontend: 61 testes, cobertura de 100% nos quatro eixos (86/86 instruções, 51/51 ramificações, 29/29 funções, 84/84 linhas). Backend: 115 testes, cobertura total de 100%. E2E: 6 cenários em Chromium. Gitleaks sem achados. |
| Contagem de linhas do E2E no `focusquest_test` depois de um `make check` (Incremento A) | 4 — as missões da última execução do E2E. |
```

5. Troque a pendência 20:

```markdown
20. **Cada execução do E2E deixa linhas no `focusquest_test`**, que só somem
    no próximo `DROP SCHEMA` da suíte pytest. `make check-e2e` rodado
    repetidamente, sem o `check-api` no meio, acumula.
```

por:

```markdown
20. **Cada execução do E2E deixa quatro missões no `focusquest_test`** (duas
    desde o Incremento A são concluídas), que só somem no próximo
    `DROP SCHEMA` da suíte pytest. `make check-e2e` rodado repetidamente,
    sem o `check-api` no meio, acumula.
```

6. Troque a pendência 21:

```markdown
21. **O axe audita os estados carregado e de erro, não o de carregando.**
```

por:

```markdown
21. **O axe audita quatro estados** — a lista carregada, o erro de
    carregamento, a missão recém-concluída e o aviso de falha da conclusão
    —, **mas não o de carregando nem o de envio** ("Concluindo…").
```

7. Logo depois da pendência 31, acrescente:

```markdown

**Criadas pelo Incremento A**

32. **O tipo `MissionErrorCode` do frontend espelha o `CodigoDeErro` do
    backend à mão.** Nada amarra os dois. Um `code` novo no backend, sem a
    linha no frontend, cai na mensagem genérica ("Não foi possível confirmar
    a conclusão…"), que é segura mas imprecisa. Os handlers também não
    declaram `responses`, então o `/openapi.json` não publica o corpo de
    erro. Amarrar de verdade pediria gerar os tipos a partir do OpenAPI.
33. **`crypto.randomUUID` só existe em contexto seguro** (HTTPS, `localhost`,
    `127.0.0.1`). O servidor de desenvolvimento (`localhost`) e o do E2E
    (`127.0.0.1`) são contextos seguros; o E2E prova o segundo, e o
    `isSecureContext` do Chromium em `http://127.0.0.1` foi medido `true`.
    Um frontend aberto por HTTP num IP de rede —
    testar pelo celular em `http://192.168.x.x:5173`, por exemplo — não tem
    a função, e o clique em Concluir lançaria `TypeError` antes de o pedido
    sair. **Não medido**; é o que a especificação da Web Crypto diz. Se
    ninguém mexer, o botão parece não fazer nada nesse cenário.
```

8. Em `## Próximo incremento`, troque:

```markdown
- **A — conclusão na tela:** relógio injetável (pendência 7), `code` legível
  por máquina nos erros (pendência 1) e o botão Concluir, com o `operation_id`
  preservado entre tentativas. É o próximo.
- **1b — a Tifa**, descrito abaixo.
```

por:

```markdown
- **A — conclusão na tela:** relógio injetável (pendência 7), `code` legível
  por máquina nos erros (pendência 1) e o botão Concluir, com o `operation_id`
  preservado entre tentativas. **Entregue** (ver "Alterações do Incremento
  A").
- **1b — a Tifa**, descrito abaixo. **É o próximo.**
```

e troque:

```markdown
- Propor e confirmar uma missão toca a criação e, provavelmente, a
  conclusão — e a conclusão tem os dois 409 sem `code` (pendência 1).
```

por:

```markdown
- Propor e confirmar uma missão toca a criação e, provavelmente, a
  conclusão. A conclusão já responde `code` e a tela já conclui: o fluxo da
  Tifa deve reusar `postJson`, o `CodigoDeErro` e o mapa exaustivo de
  `completionFailure.ts`, em vez de criar um caminho paralelo.
```

- [ ] **Step 9: Conferir que nenhum documento ainda afirma o que o A tornou falso**

Run: `grep -rnE "pode ir direto para a tela|não têm (um )?.code. legível|dois estados da tela|sobram as duas|datetime\.now\(UTC\). direto|readDetail" docs/ARCHITECTURE.md docs/QUALITY.md docs/HANDOFF.md AGENTS.md frontend/src src`
Expected: só linhas dos parágrafos **riscados** (`~~...~~`) das pendências 1 e 7 do `docs/HANDOFF.md`. Um parágrafo riscado ocupa várias linhas, então confira no arquivo se a linha encontrada está dentro dele. Qualquer outra ocorrência é afirmação falsa que sobrou: corrija antes de seguir.

- [ ] **Step 10: Gate, duas vezes seguidas**

Run: `make check; echo "EXIT=$?"; make check; echo "EXIT=$?"`
Expected: `EXIT=0` nas duas. A segunda execução prova que o gate continua idempotente com os cenários novos (a primeira grava `test-results/.last-run.json`, já coberto pelo `.prettierignore` desde o 1a). Confira também que `git status --short` só lista os arquivos desta tarefa.

- [ ] **Step 11: Medir as linhas deixadas pelo E2E**

Run: `docker compose exec -T postgres psql -U focusquest -d focusquest_test -tAc "select count(*) from missions"`
Expected: `4`. Se divergir, corrija o `docs/QUALITY.md` §4 e a linha de resultados do HANDOFF com o valor medido.

- [ ] **Step 12: Conferir os números do HANDOFF**

Compare cada número da linha de resultados do Step 8 com a saída do Step 10: testes e cobertura do frontend, testes do backend, cenários do E2E. Corrija o que divergir.

- [ ] **Step 13: Commit**

```bash
git add frontend/tests/e2e/headquarters.spec.ts docs/QUALITY.md docs/HANDOFF.md
git commit -F - <<'EOF'
test: e2e da conclusao pela tela e registro do incremento a

Dois cenarios: concluir pelo botao, com o estado persistindo na recarga,
e a resposta perdida, em que o reenvio com a mesma chave recebe a mesma
conclusao. O axe audita o estado concluido e o aviso de falha. HANDOFF e
QUALITY registram o incremento.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

Push e pull request **não** fazem parte deste plano: cada um exige o "pode" do dono.

---

## Autochecagem

**Cobertura da spec (Incremento A):**

| Requisito | Onde |
|---|---|
| C13 — relógio por dependência do FastAPI, em `core/clock.py` | Task 1, Steps 1–4 |
| O serviço deixa de chamar `datetime.now(UTC)` | Task 1, Step 10, conferido com `grep` no Step 12 |
| O relógio é lido depois da trava da linha | Task 1, Steps 7, 10 e 13 |
| Os testes substituem a dependência; nenhum gancho de teste em produção | Task 1, Steps 8 e 15; `core/clock.py` sem variável de ambiente nem global |
| Pendência 7 riscada com a resolução | Task 1, Step 17 |
| C12 — `{"detail", "code"}` em todo erro de domínio | Task 2, Steps 1–4 |
| Só os três códigos; nenhum código do B | Task 2, Step 3 (`CodigoDeErro` com três membros); `missao_expirada` só aparece como exemplo de código desconhecido num teste do frontend |
| 404 inexistente e 404 alheio idênticos byte a byte, com o mesmo `code` | Task 2, Steps 1 e 6 |
| O 422 do Pydantic no formato padrão | Task 2, Steps 1 e 7 |
| O cliente HTTP devolve o `code` | Task 3, Steps 1 e 5 |
| A tela nunca mostra o `detail` | Task 3, Steps 1, 3, 5 e 10; Task 4, Step 2 (`PROSA-CRUA-DO-BACKEND`) |
| Mapa `code → mensagem` exaustivo sobre o tipo; código desconhecido cai em mensagem genérica | Task 3, Steps 2, 7, 11 e 12 |
| O comentário de `client.ts` sobre o `detail` é corrigido | Task 3, Step 5 |
| Pendência 1 riscada com a resolução | Task 2, Step 8 (a metade do `code`) e Task 3, Step 13 (a metade do `detail`) |
| Botão Concluir para as avulsas | Task 4 |
| `operation_id` gerado uma vez (`crypto.randomUUID`) e mantido entre tentativas | Task 4, Steps 1, 4 e 7; Task 5, Steps 2 e 4 |
| O que a tela mostra durante, depois e em cada erro | "Decisões que a spec não fixava" e Task 4, Step 5 |
| E2E concluindo pela tela, com o axe no estado novo | Task 5, Steps 2–6 |
| "Sem 500 por omissão" | Nenhum caminho novo de erro; o `code` só entra nos handlers que já existiam |

**Varredura de placeholders.** Não há TBD, "similar à Task N" nem "adicione tratamento de erro". Três trechos pedem um valor medido na hora, e cada um traz o comando que o mede: `<base>` e `<commits>` no HANDOFF (Task 5, Step 8), e os números da linha de resultados, conferidos contra a execução (Task 5, Step 12).

**Consistência de nomes e tipos entre as tarefas:** `Clock`, `system_now`, `get_clock` (Task 1) → a rota e os testes da Task 1; `concluir_missao(..., *, clock: Clock)` → as 14 chamadas de teste e a rota; `CodigoDeErro` e os três valores (Task 2) → `MissionErrorCode` (Task 3), com os mesmos três literais; `ApiError(message, status, code, options?)` (Task 3) → `completionFailure.test.ts` constrói com três argumentos; `postJson`, `describeCompletionFailure`, `CompletionFailure` e `CompletionRecovery` (Task 3) → `useCompleteMission` (Task 4); `CompletionState` (Task 4) → `MissionList.tsx`; `mission-complete`, `mission-reload`, `mission-completion-status`, `mission-completion-error` e os nomes acessíveis `Concluir a missão: …` e `Tentar de novo a missão: …` (Task 4) → o E2E (Task 5).

**Conferido no disco** (na `main` em `e3ef7bf` e na branch `docs/spec-ciclo-diario`): `_buscar(..., travar=True)`, `CONCLUSAO`, `UNICIDADE_DA_OPERACAO`, `NAO_ENCONTRADA`, `_erro`, os quatro handlers de `main.py`, `USUARIO_UNICO`, `IdDaMissao`, `SessaoDaRequisicao`, `MAIOR_INTEIRO_DA_COLUNA`; as fixtures `settings`, `engine`, `banco_migrado`, `session` (`conftest.py`), `client`, `cliente_real` (`test_missions_api.py`), `missao_commitada`, `outra_missao_commitada` (`test_missions_concorrencia.py`); os helpers `_criar`, `_corpo`, `_operacoes` e `_logado`; as constantes `ESTUDANTE`, `OUTRO`, `LIMITE_DE_TRAVA`; no frontend, `requestJson`, `ApiError`, `useMissions`, `MissionsState`, `MISSION_STATE_LABELS`, `stubFetchResolving`, `pendente`, `emAndamento`, `concluida`, `abrirQuadro`, `semear`, `criadas`, `EXECUCAO`, `API_URL`, `PedidoDeMissao` e `MissaoCriada`. Todo o código deste plano foi **executado** num worktree descartável: `make check` EXIT 0 duas vezes seguidas, e de novo com o PR #5 aplicado por cima. Cada mutação listada foi aplicada e reprovou exatamente os testes indicados.
