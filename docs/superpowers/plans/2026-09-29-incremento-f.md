# Incremento F — acompanhar a execução: iniciar e reagendar missões — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a pessoa inicia uma missão (fechando a pendência 3: `em_andamento`, `started_at` e a duração real passam a ser alcançáveis) e reagenda o prazo de uma avulsa com um motivo entre três; a Tifa propõe reagendar pela ferramenta `reschedule_mission`, e a pessoa confirma; todo reagendamento fica num histórico que não se reescreve.

**Architecture:** duas rotas novas em `missions` (`POST /api/missions/{id}/start` e `/reschedule`), com a mesma ordem e a mesma idempotência da conclusão (trava, relógio, ocultação, reenvio, regra, escrita; `operation_id` em `mission_operations`). O histórico é a tabela `mission_reschedules`, de `missions`. A tutoria ganha a segunda ferramenta de proposta, e a confirmação executa pelo mesmo `reagendar_missao`. Nenhum módulo novo; a direção das dependências não muda (`tutoring → missions`).

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2 síncrono, Alembic, PostgreSQL 18.6, SDK `anthropic` (já no lock), React 19 + TypeScript estrito + Vitest, Playwright + axe-core. **Nenhuma dependência nova.**

**Spec:** `docs/superpowers/specs/2026-09-29-incremento-f-acompanhamento-design.md` (decisões F1–F24). Quem executa lê a spec e este plano.

## Global Constraints

- `make check` verde em todo commit, pelo hook; proibidos `--no-verify`, `SKIP`, `|| true`, teste ignorado, limiar reduzido, diretiva de ignorar cobertura (AGENTS.md §3).
- Cobertura de 100%: backend (`fail_under = 100`) e frontend (linhas, ramificações, funções, instruções).
- Todo teste novo é visto **reprovando** antes do código (RED) e, depois, por **mutação** da guarda que ele prova; registrar a mutação no relatório da tarefa. Desfazer mutação com `cp` de backup, **nunca** `git checkout -- arquivo`.
- Comentários e docstrings do código em português **sem acento**; texto de interface em pt-BR **com acento**; contratos (colunas, chaves JSON, rotas) em inglês.
- Nenhuma dependência nova em `pyproject.toml` nem em `frontend/package.json`.
- Nomes de contrato: rotas `/start` e `/reschedule`; chaves `operation_id`, `new_deadline`, `reason`, `reschedules`, `previous_deadline`, `origin`, `rescheduled_at`; motivos `dificuldade` / `falta_de_tempo` / `mudanca_de_prioridade`; origens `usuario` / `tifa`; `kind` de operação `complete` / `start` / `reschedule`; ferramenta e `kind` de ação `reschedule_mission`; códigos novos `prazo_derivado`, `prazo_inalterado`, `reagendamento_invalido`.
- A ordem das travas é **ação → missão → avaliação → usuário** (F14). Nenhum código novo trava em outra ordem.
- Não alterar teste existente para acomodar comportamento errado. As duas mudanças de teste existente previstas (Task 6, Step 1) são a mudança principal daquele passo, com a justificativa escrita.
- Commits locais na branch do worktree; **nada de push, PR ou merge** sem o dono.

## Review Focus

1. **Duas abas reagendando ao mesmo tempo** — o histórico ganha dois elos encadeados (o `previous_deadline` do segundo é o `new_deadline` do primeiro), nunca uma atualização perdida (Task 5).
2. **A chave do Concluir usada no Iniciar** (ou o contrário, ou no Reagendar) — `409 operacao_reutilizada`, e as chaves da tela são separadas por tipo no registro (Tasks 3, 4 e 8).
3. **A Tifa propõe reagendar uma missão concluída, alheia, inexistente ou diária** — a resposta sai `falhou` com `proposta_invalida` e nenhuma ação nasce; e, se a missão muda **depois** da proposta, confirmar grava `falhou`/`reagendamento_invalido` antes do `409` (Task 7).
4. **Novo prazo em horário de Brasília com o navegador em outro fuso** — a conversão é do `Intl` com `America/Sao_Paulo`, nunca deslocamento fixo; a hora que não existe (início do horário de verão) e a data inválida são recusadas no cliente (Task 8).
5. **Recarregar o quadro com um Iniciar em voo** — o registro espera o pedido terminar, como a conclusão; a chave do Iniciar com resultado desconhecido sobrevive à remontagem (Tasks 8 e 10).

---

## Mapa de arquivos

**Backend — criados**
- `alembic/versions/0006_acompanhamento.py`.

**Backend — modificados**
- `src/focusquest/core/errors.py` (três erros), `src/focusquest/main.py` (três códigos, três handlers).
- `src/focusquest/modules/missions/domain.py`, `models.py`, `schemas.py`, `service.py`, `router.py`.
- `src/focusquest/modules/tutoring/domain.py`, `schemas.py`, `provider.py`, `anthropic_provider.py`, `service.py`, `router.py`, `context.py`, `persona.py`.

**Testes — criados**
- `tests/unit/test_acompanhamento_domain.py`.
- `tests/integration/test_acompanhamento_migration.py`, `test_iniciar_missao.py`, `test_reagendar_missao.py`, `test_acompanhamento_concorrencia.py`, `test_tutoring_reagendamento.py`.
- `frontend/src/features/missions/startFailure.ts` (+ `.test.ts`), `rescheduleFailure.ts` (+ `.test.ts`), `useStartMission.ts` (+ `.test.tsx`), `useRescheduleMission.ts` (+ `.test.tsx`), `RescheduleForm.tsx` (+ `.test.tsx`), `RescheduleHistory.tsx` (+ `.test.tsx`).
- `frontend/src/features/tutoring/DecisionControls.tsx`, `RescheduleProposalCard.tsx` (+ `.test.tsx`).
- `frontend/tests/e2e/tracking.spec.ts`.

**Testes — modificados**
- `tests/integration/test_anthropic_provider.py` (Task 6, Step 1: a requisição leva duas ferramentas; `Proposta` com o nome).
- `tests/unit/test_tutoring_context.py`, `test_tutoring_persona.py` (casos novos, nenhum existente muda).
- Docstrings (não asserções) de `test_missions_api.py::test_duracao_real_no_corpo_vem_dos_instantes` e `test_progression_api.py` que dizem "não existe iniciar" (Task 3).
- Todas as fixtures do frontend que montam um `Mission` à mão (Task 8, Step 1; o `tsc` lista).

## Ordem e paralelismo

```
Worktree A (dados):     T0+T1 ─> T2 ─> T3 ─> T4 ─> T5 (concorrencia)
Worktree B (tutoria):              T2 ─┬─> T6 (provedor) ───────────┐
                                       └── espera T4 (merge de A) ──┴─> T7 (tutoria)
Worktree C (front-missoes): T8 (contrato, lib, hooks) ─> T10 (tela)
Worktree D (front-tutoria): T9 (cartao de proposta)
Integracao (feat/incremento-f): T11 (E2E) ─> T12 (docs)
```

| Tarefa | Depende de | Pode rodar em paralelo com | Classe |
|---|---|---|---|
| T0 revisão-base | — | T8, T9 | simples |
| T1 domínio puro | — | T8, T9 | simples |
| T2 migração e modelos | T1 | T8, T9 | simples |
| T3 iniciar | T2 | T6, T8, T9, T10 | simples |
| T4 reagendar direto | T3 (mesmos arquivos) | T6, T8, T9, T10 | simples |
| T5 concorrência e relógio | T4 | T6, T7, T10 | **complexa** |
| T6 provedor e ferramenta | T2 (o `TipoDeAcao`) | T3, T4, T5, T8, T9, T10 | simples |
| T7 tutoria: proposta, confirmação, contexto | T4 **e** T6 | T5, T10 | **complexa** |
| T8 frontend: contrato, lib, hooks | a spec (contrato fixo) | T0–T7, T9 | simples |
| T9 frontend: cartão de proposta | a spec | T0–T8, T10 | **complexa** |
| T10 frontend: o cartão da missão | T8 | T3–T7, T9 | **complexa** |
| T11 E2E | T3, T4, T7, T9, T10 integrados | — | **complexa** |
| T12 documentação | todas | — | simples |

Quatro implementadores de uma vez: A, B, C e D. B começa quando A comitar a T2 (merge de `wt/f-dados` em `wt/f-tutoria`); a T7 começa quando A comitar a T4. C e D não precisam de backend (simulam o `fetch` com `routeFetch`). Worktrees com `scripts/novo-worktree.sh <nome>` (banco de teste e portas próprios). A T11 roda na branch de integração, com tudo mesclado. "Simples" = código completo neste plano, implementador sonnet; "complexa" = julgamento, concorrência ou E2E, implementador opus (a RE3 do E).

---

### Task 0: revisão-base

**Files:**
- Modify: `docs/HANDOFF.md` (seção "Revisão-base", no topo)

- [ ] **Step 1: Registrar a revisão-base do F:**

```markdown
**Incremento F — acompanhar a execução: iniciar e reagendar missões.** Branch
`feat/incremento-f`, aberta a partir de `<hash da main no início>`. Spec em
`docs/superpowers/specs/2026-09-29-incremento-f-acompanhamento-design.md`
(decisões F1–F24), aprovada por delegação do dono em 2026-09-29 ("tome todas
as decisões por mim"); plano em `docs/superpowers/plans/2026-09-29-incremento-f.md`.
**Estado de publicação: não publicado.**
```

- [ ] **Step 2: Commit** (junto com a Task 1, em commit próprio: `docs(plano): incremento f -- revisao-base`).

---

### Task 1: o domínio puro e o tipo do prazo (simples)

**Files:**
- Modify: `src/focusquest/modules/missions/domain.py`, `src/focusquest/modules/missions/schemas.py`
- Test: `tests/unit/test_acompanhamento_domain.py`

**Interfaces:**
- Produces (em `missions/domain.py`): `class TipoDeOperacao(StrEnum)` (`CONCLUSAO="complete"`, `INICIO="start"`, `REAGENDAMENTO="reschedule"`); `class MotivoDoReagendamento(StrEnum)` (`DIFICULDADE`, `FALTA_DE_TEMPO`, `MUDANCA_DE_PRIORIDADE`); `class OrigemDoReagendamento(StrEnum)` (`USUARIO="usuario"`, `TIFA="tifa"`); `class ProblemaDoNovoPrazo(StrEnum)` (`NO_PASSADO`, `INALTERADO`); `def problema_do_novo_prazo(novo: datetime, atual: datetime, agora: datetime) -> ProblemaDoNovoPrazo | None`; `def validar_reagendamento(estado: MissionState) -> None`.
- Produces (em `missions/schemas.py`): `PrazoComFuso = Annotated[AwareDatetime, AfterValidator(_instante_representavel)]`, e `MissionCreate.deadline: PrazoComFuso` (mesma regra de hoje, agora com nome, para a Task 4 e a Task 6 reusarem).

- [ ] **Step 1: Escrever os testes que falham** em `tests/unit/test_acompanhamento_domain.py`:

```python
"""O dominio do acompanhamento: sem banco, sem relogio (Incremento F)."""

from datetime import UTC, datetime, timedelta, timezone

import pytest
from pydantic import TypeAdapter, ValidationError

from focusquest.modules.missions.domain import (
    MissionState,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
    ProblemaDoNovoPrazo,
    TipoDeOperacao,
    TransicaoIlegalError,
    problema_do_novo_prazo,
    validar_reagendamento,
    validar_transicao,
)
from focusquest.modules.missions.schemas import PrazoComFuso

AGORA = datetime(2026, 9, 29, 15, 0, tzinfo=UTC)
ATUAL = AGORA + timedelta(days=2)
SAO_PAULO = timezone(timedelta(hours=-3))


def test_os_motivos_sao_os_tres_do_readme() -> None:
    """README s5: distinguir dificuldade, falta de tempo e mudanca de prioridade."""
    assert [m.value for m in MotivoDoReagendamento] == [
        "dificuldade",
        "falta_de_tempo",
        "mudanca_de_prioridade",
    ]


def test_as_origens_e_os_tipos_de_operacao() -> None:
    assert [o.value for o in OrigemDoReagendamento] == ["usuario", "tifa"]
    assert [t.value for t in TipoDeOperacao] == ["complete", "start", "reschedule"]


@pytest.mark.parametrize(
    ("novo", "esperado"),
    [
        (ATUAL + timedelta(days=1), None),
        # Antecipar e permitido (F9).
        (AGORA + timedelta(minutes=1), None),
        (AGORA, ProblemaDoNovoPrazo.NO_PASSADO),
        (AGORA - timedelta(seconds=1), ProblemaDoNovoPrazo.NO_PASSADO),
        (ATUAL, ProblemaDoNovoPrazo.INALTERADO),
        # O mesmo instante escrito em outro fuso e o mesmo prazo.
        (ATUAL.astimezone(SAO_PAULO), ProblemaDoNovoPrazo.INALTERADO),
    ],
)
def test_problema_do_novo_prazo(
    novo: datetime, esperado: ProblemaDoNovoPrazo | None
) -> None:
    assert problema_do_novo_prazo(novo, ATUAL, AGORA) is esperado


def test_prazo_passado_igual_ao_atual_e_antes_de_tudo_passado() -> None:
    vencido = AGORA - timedelta(days=1)
    assert (
        problema_do_novo_prazo(vencido, vencido, AGORA) is ProblemaDoNovoPrazo.NO_PASSADO
    )


@pytest.mark.parametrize("campo", ["novo", "atual", "agora"])
def test_instante_sem_fuso_e_recusado(campo: str) -> None:
    valores = {"novo": ATUAL + timedelta(days=1), "atual": ATUAL, "agora": AGORA}
    valores[campo] = valores[campo].replace(tzinfo=None)
    with pytest.raises(ValueError, match="sem fuso"):
        problema_do_novo_prazo(valores["novo"], valores["atual"], valores["agora"])


@pytest.mark.parametrize("estado", [MissionState.PENDENTE, MissionState.EM_ANDAMENTO])
def test_reagendar_vale_antes_de_concluir(estado: MissionState) -> None:
    validar_reagendamento(estado)


def test_reagendar_concluida_e_transicao_ilegal() -> None:
    with pytest.raises(TransicaoIlegalError, match="reagendar uma missao 'concluida'"):
        validar_reagendamento(MissionState.CONCLUIDA)


def test_iniciar_so_de_pendente() -> None:
    """A transicao ja existia (1a); o F e o primeiro a usa-la."""
    validar_transicao(MissionState.PENDENTE, MissionState.EM_ANDAMENTO)
    for estado in (MissionState.EM_ANDAMENTO, MissionState.CONCLUIDA):
        with pytest.raises(TransicaoIlegalError):
            validar_transicao(estado, MissionState.EM_ANDAMENTO)


@pytest.mark.parametrize(
    "valor", ["2026-10-01T10:00:00", "9999-12-31T23:59:59-03:00"]
)
def test_prazo_com_fuso_recusa_sem_fuso_e_irrepresentavel(valor: str) -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(PrazoComFuso).validate_python(valor)
```

- [ ] **Step 2: Rodar e ver reprovar**

Run: `uv run pytest tests/unit/test_acompanhamento_domain.py -q --no-cov`
Expected: FAIL (`ImportError: cannot import name 'MotivoDoReagendamento'`).

- [ ] **Step 3: Implementar** no fim de `missions/domain.py`:

```python
class TipoDeOperacao(StrEnum):
    """O `kind` de `mission_operations`: QUAL operacao a chave nomeou. A
    UNIQUE e sobre `operation_id` sozinho, entao uma chave gasta num tipo esta
    gasta nos outros (ver `CONCLUSAO` em service.py)."""

    CONCLUSAO = "complete"
    INICIO = "start"
    REAGENDAMENTO = "reschedule"


class MotivoDoReagendamento(StrEnum):
    """Por que o prazo mudou (README s5). Fechado de proposito (F10): a maquina
    distingue, e texto livre seria mais um dado nao confiavel no prompt."""

    DIFICULDADE = "dificuldade"
    FALTA_DE_TEMPO = "falta_de_tempo"
    MUDANCA_DE_PRIORIDADE = "mudanca_de_prioridade"


class OrigemDoReagendamento(StrEnum):
    """Quem pediu: a pessoa pela tela, ou a Tifa por proposta confirmada."""

    USUARIO = "usuario"
    TIFA = "tifa"


class ProblemaDoNovoPrazo(StrEnum):
    """Por que um novo prazo nao serve. O servico traduz cada um no erro dele."""

    NO_PASSADO = "no_passado"
    INALTERADO = "inalterado"


def problema_do_novo_prazo(
    novo: datetime, atual: datetime, agora: datetime
) -> ProblemaDoNovoPrazo | None:
    """O que impede `novo` de ser o prazo, ou `None` (F9).

    O passado vem primeiro: um prazo vencido igual ao atual e, antes de tudo,
    um prazo vencido -- e a mensagem que ajuda a pessoa. Antecipar e permitido.
    Instantes comparam como instantes: o mesmo momento em `Z` e em `-03:00` e
    o mesmo prazo.
    """
    if novo.tzinfo is None or atual.tzinfo is None or agora.tzinfo is None:
        raise ValueError("instante sem fuso: o prazo e um instante, nao uma hora")
    if novo <= agora:
        return ProblemaDoNovoPrazo.NO_PASSADO
    if novo == atual:
        return ProblemaDoNovoPrazo.INALTERADO
    return None


def validar_reagendamento(estado: MissionState) -> None:
    """Reagendar vale em `pendente` e `em_andamento` (F8); a concluida nao tem
    mais prazo a cumprir. Mesmo erro (e mesmo `code`) da transicao ilegal."""
    if estado is MissionState.CONCLUIDA:
        raise TransicaoIlegalError(
            "nao e possivel reagendar uma missao 'concluida'; "
            "so se reagenda o que ainda nao foi feito"
        )
```

E em `missions/schemas.py`, logo depois de `_instante_representavel`:

```python
# O instante com fuso e representavel em UTC: a regra do `deadline` da criacao,
# com nome, porque o reagendamento (F9) e a proposta da Tifa (F15) usam a MESMA.
PrazoComFuso = Annotated[AwareDatetime, AfterValidator(_instante_representavel)]
```

e `deadline: PrazoComFuso` em `MissionCreate` (no lugar do `Annotated` escrito ali).

- [ ] **Step 4: Rodar e ver passar** (o arquivo novo e `tests/integration/test_missions_api.py`, que prova que o `deadline` da criação não mudou de regra).

- [ ] **Step 5: Mutações:** `novo < agora` no lugar de `<=` (reprova o caso `AGORA`); a ordem dos dois `if` trocada (reprova o "antes de tudo passado"); `validar_reagendamento` sem o `if` (reprova a concluída).

- [ ] **Step 6: Commit**

```bash
git add src/focusquest/modules/missions/domain.py src/focusquest/modules/missions/schemas.py tests/unit/test_acompanhamento_domain.py
git commit -m "feat(acompanhamento): dominio do inicio e do reagendamento"
```

---

### Task 2: a migração 0006 e os modelos (simples)

**Files:**
- Create: `alembic/versions/0006_acompanhamento.py`
- Modify: `src/focusquest/modules/missions/models.py`, `src/focusquest/modules/tutoring/domain.py`
- Test: `tests/integration/test_acompanhamento_migration.py`

**Interfaces:**
- Consumes: os enums da Task 1.
- Produces: `class MissionReschedule(Base)` (`__tablename__ = "mission_reschedules"`); `Mission.reschedules: Mapped[list[MissionReschedule]]` (ordem por `id`); `TipoDeAcao.REAGENDAR_MISSAO = "reschedule_mission"`; os `CHECK`s novos em `Mission` e `MissionOperation`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/integration/test_acompanhamento_migration.py`:

```python
"""A migracao 0006: o historico de reagendamentos e as regras do inicio.

Mesmo padrao de `test_evaluation_migration.py`: o `finally` sempre devolve o
esquema para `head`, e cada restricao nova e vista dizendo nao por `INSERT`
cru, pelo nome.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, delete, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import (
    MotivoDoReagendamento,
    OrigemDoReagendamento,
)
from focusquest.modules.missions.models import Mission, MissionReschedule
from focusquest.modules.missions.service import criar_missao

from .conftest import alembic_config

ESTUDANTE = 1
REVISAO = "0006"
AGORA = datetime(2026, 9, 29, 15, tzinfo=UTC)


def _anterior_a_0006() -> str:
    script = ScriptDirectory.from_config(alembic_config())
    anterior = script.get_revision(REVISAO)
    assert anterior is not None
    assert isinstance(anterior.down_revision, str)
    return anterior.down_revision


def _missao(session: Session) -> int:
    missao = criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        difficulty=3,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
    )
    return missao.id


def _operacao(session: Session, mission_id: int, chave: str, kind: str) -> None:
    session.execute(
        text(
            "INSERT INTO mission_operations (operation_id, mission_id, kind) "
            "VALUES (:o, :m, :k)"
        ),
        {"o": chave, "m": mission_id, "k": kind},
    )


INSERIR_REAGENDAMENTO = text(
    "INSERT INTO mission_reschedules (mission_id, operation_id, previous_deadline, "
    "new_deadline, reason, origin, rescheduled_at) "
    "VALUES (:m, :o, :antes, :depois, :motivo, :origem, :em)"
)


def _reagendamento(mission_id: int, chave: str, **ajustes: object) -> dict[str, object]:
    campos: dict[str, object] = {
        "m": mission_id,
        "o": chave,
        "antes": AGORA + timedelta(days=1),
        "depois": AGORA + timedelta(days=3),
        "motivo": "falta_de_tempo",
        "origem": "usuario",
        "em": AGORA,
    }
    campos.update(ajustes)
    return campos


def test_a_0006_cria_a_tabela_e_o_downgrade_a_remove(banco_migrado: Engine) -> None:
    cfg = alembic_config()
    try:
        command.downgrade(cfg, _anterior_a_0006())
        assert "mission_reschedules" not in inspect(banco_migrado).get_table_names()
        command.upgrade(cfg, REVISAO)
        assert "mission_reschedules" in inspect(banco_migrado).get_table_names()
    finally:
        command.upgrade(cfg, "head")


def test_o_reagendamento_valido_entra_e_volta_como_enum(session: Session) -> None:
    mission_id = _missao(session)
    _operacao(session, mission_id, "op-r1", "reschedule")
    session.execute(INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-r1"))
    missao = session.get(Mission, mission_id)
    assert missao is not None
    session.refresh(missao)
    (linha,) = missao.reschedules
    assert linha.reason is MotivoDoReagendamento.FALTA_DE_TEMPO
    assert linha.origin is OrigemDoReagendamento.USUARIO


def test_o_historico_sai_em_ordem_de_gravacao(session: Session) -> None:
    mission_id = _missao(session)
    for i in range(3):
        _operacao(session, mission_id, f"op-o{i}", "reschedule")
        session.execute(
            INSERIR_REAGENDAMENTO,
            _reagendamento(
                mission_id,
                f"op-o{i}",
                antes=AGORA + timedelta(days=i + 1),
                depois=AGORA + timedelta(days=i + 2),
            ),
        )
    missao = session.get(Mission, mission_id)
    assert missao is not None
    session.refresh(missao)
    ids = [r.id for r in missao.reschedules]
    assert ids == sorted(ids)
    assert isinstance(missao.reschedules[0], MissionReschedule)


@pytest.mark.parametrize(
    ("ajustes", "restricao"),
    [
        ({"motivo": "preguica"}, "ck_mission_reschedules_reason"),
        ({"origem": "sistema"}, "ck_mission_reschedules_origin"),
        (
            {"antes": AGORA + timedelta(days=1), "depois": AGORA + timedelta(days=1)},
            "ck_mission_reschedules_prazo_mudou",
        ),
    ],
)
def test_o_historico_recusa_pelo_nome(
    session: Session, ajustes: dict[str, object], restricao: str
) -> None:
    mission_id = _missao(session)
    _operacao(session, mission_id, "op-x", "reschedule")
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-x", **ajustes))
    assert restricao in str(erro.value.orig)


def test_o_historico_exige_a_operacao_e_uma_linha_por_chave(session: Session) -> None:
    mission_id = _missao(session)
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-sem"))
    assert "mission_reschedules_operation_id_fkey" in str(erro.value.orig)

    _operacao(session, mission_id, "op-u", "reschedule")
    session.execute(INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-u"))
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(
            INSERIR_REAGENDAMENTO,
            _reagendamento(mission_id, "op-u", depois=AGORA + timedelta(days=9)),
        )
    assert "uq_mission_reschedules_operation_id" in str(erro.value.orig)


def test_o_kind_da_operacao_e_fechado(session: Session) -> None:
    mission_id = _missao(session)
    for i, kind in enumerate(("complete", "start", "reschedule")):
        _operacao(session, mission_id, f"op-k{i}", kind)
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        _operacao(session, mission_id, "op-k9", "pause")
    assert "ck_mission_operations_kind" in str(erro.value.orig)


@pytest.mark.parametrize(
    ("sql", "restricao"),
    [
        (
            "UPDATE missions SET state = 'em_andamento', started_at = NULL WHERE id = :m",
            "ck_missions_em_andamento_iniciada",
        ),
        (
            "UPDATE missions SET state = 'concluida', started_at = :t, "
            "completed_at = :t - interval '1 minute' WHERE id = :m",
            "ck_missions_inicio_antes_da_conclusao",
        ),
    ],
)
def test_as_regras_do_inicio_recusam_pelo_nome(
    session: Session, sql: str, restricao: str
) -> None:
    mission_id = _missao(session)
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(text(sql), {"m": mission_id, "t": AGORA})
    assert restricao in str(erro.value.orig)


def test_a_acao_de_reagendar_e_aceita_e_outra_nao(session: Session) -> None:
    """`ck_tutor_actions_kind` passa a aceitar `reschedule_mission`."""
    pergunta = session.execute(
        text(
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "client_message_id, created_at) VALUES (1, 'user', 'oi', 'completa', "
            "'m-f-1', now()) RETURNING id"
        )
    ).scalar_one()
    resposta = session.execute(
        text(
            "INSERT INTO tutor_messages (user_id, role, content, status, "
            "reply_to_id, created_at) VALUES (1, 'tutor', 'ok', 'completa', :p, now()) "
            "RETURNING id"
        ),
        {"p": pergunta},
    ).scalar_one()
    inserir = text(
        "INSERT INTO tutor_actions (message_id, kind, payload, state, created_at) "
        "VALUES (:r, :k, '{}'::jsonb, 'proposta', now())"
    )
    session.execute(inserir, {"r": resposta, "k": "reschedule_mission"})
    with pytest.raises(IntegrityError) as erro, session.begin_nested():
        session.execute(inserir, {"r": resposta, "k": "split_mission"})
    assert "ck_tutor_actions_kind" in str(erro.value.orig)


@pytest.fixture
def reagendamento_commitado(banco_migrado: Engine) -> Iterator[int]:
    with Session(bind=banco_migrado) as sessao:
        mission_id = _missao(sessao)
        _operacao(sessao, mission_id, "op-f-commit", "reschedule")
        sessao.execute(INSERIR_REAGENDAMENTO, _reagendamento(mission_id, "op-f-commit"))
        sessao.commit()
    try:
        yield mission_id
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(delete(Mission).where(Mission.id == mission_id))
            sessao.commit()


def test_o_downgrade_falha_alto_com_historico_gravado(
    banco_migrado: Engine, reagendamento_commitado: int
) -> None:
    """Voltar para a 0005 apagaria o historico de replanejamento (README s8)."""
    cfg = alembic_config()
    try:
        with pytest.raises(RuntimeError, match="mission_reschedules"):
            command.downgrade(cfg, _anterior_a_0006())
        with banco_migrado.connect() as conexao:
            versao = conexao.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
        assert versao == REVISAO
    finally:
        command.upgrade(cfg, "head")


def test_o_downgrade_sem_dados_restaura_o_kind_antigo_das_acoes(
    banco_migrado: Engine,
) -> None:
    cfg = alembic_config()
    try:
        command.downgrade(cfg, _anterior_a_0006())
        with banco_migrado.connect() as conexao:
            definicao = conexao.execute(
                text(
                    "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                    "WHERE conname = 'ck_tutor_actions_kind'"
                )
            ).scalar_one()
            restricoes = {
                c["name"] for c in inspect(conexao).get_check_constraints("missions")
            }
        assert "reschedule_mission" not in definicao
        assert "ck_missions_em_andamento_iniciada" not in restricoes
    finally:
        command.upgrade(cfg, "head")
```

A guarda do downgrade para a **ação** `reschedule_mission` gravada segue o mesmo desenho do teste do histórico (uma fixture que commita uma mensagem, uma resposta e a ação; `match="reschedule_mission"`); escrever o segundo teste por analogia.

- [ ] **Step 2: Rodar e ver reprovar**

Run: `uv run pytest tests/integration/test_acompanhamento_migration.py -q --no-cov`
Expected: FAIL (`ImportError: cannot import name 'MissionReschedule'`).

- [ ] **Step 3: A migração** `alembic/versions/0006_acompanhamento.py`:

```python
"""Acompanhamento: o historico de reagendamentos e as regras do inicio.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Copias CONGELADAS, NAO import (D8): migracao e historico.
MOTIVOS = ("dificuldade", "falta_de_tempo", "mudanca_de_prioridade")
ORIGENS = ("usuario", "tifa")
TIPOS_DE_OPERACAO = ("complete", "start", "reschedule")
TIPOS_DE_ACAO = ("create_mission", "reschedule_mission")
TIPOS_DE_ACAO_DA_0005 = ("create_mission",)


def _lista(valores: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


def upgrade() -> None:
    op.create_table(
        "mission_reschedules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "mission_id",
            sa.Integer,
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "operation_id",
            sa.Text,
            sa.ForeignKey("mission_operations.operation_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("previous_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("new_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("origin", sa.Text, nullable=False),
        sa.Column("rescheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("operation_id", name="uq_mission_reschedules_operation_id"),
        sa.CheckConstraint(
            f"reason IN ({_lista(MOTIVOS)})", name="ck_mission_reschedules_reason"
        ),
        sa.CheckConstraint(
            f"origin IN ({_lista(ORIGENS)})", name="ck_mission_reschedules_origin"
        ),
        sa.CheckConstraint(
            "new_deadline <> previous_deadline",
            name="ck_mission_reschedules_prazo_mudou",
        ),
    )
    op.create_index(
        "ix_mission_reschedules_mission_id", "mission_reschedules", ["mission_id"]
    )
    op.create_check_constraint(
        "ck_mission_operations_kind",
        "mission_operations",
        f"kind IN ({_lista(TIPOS_DE_OPERACAO)})",
    )
    op.create_check_constraint(
        "ck_missions_em_andamento_iniciada",
        "missions",
        "state <> 'em_andamento' OR started_at IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_missions_inicio_antes_da_conclusao",
        "missions",
        "started_at IS NULL OR completed_at IS NULL OR started_at <= completed_at",
    )
    op.drop_constraint("ck_tutor_actions_kind", "tutor_actions", type_="check")
    op.create_check_constraint(
        "ck_tutor_actions_kind", "tutor_actions", f"kind IN ({_lista(TIPOS_DE_ACAO)})"
    )


def downgrade() -> None:
    conexao = op.get_bind()
    linhas = conexao.execute(
        sa.text("SELECT count(*) FROM mission_reschedules")
    ).scalar_one()
    if linhas:
        raise RuntimeError(
            f"{linhas} linha(s) em mission_reschedules: voltar para 0005 apagaria o "
            "historico de replanejamento; apague-as de proposito antes"
        )
    acoes = conexao.execute(
        sa.text("SELECT count(*) FROM tutor_actions WHERE kind = 'reschedule_mission'")
    ).scalar_one()
    if acoes:
        raise RuntimeError(
            f"{acoes} acao(oes) reschedule_mission gravada(s): o CHECK da 0005 as "
            "recusaria; apague-as de proposito antes de voltar"
        )
    op.drop_constraint("ck_tutor_actions_kind", "tutor_actions", type_="check")
    op.create_check_constraint(
        "ck_tutor_actions_kind",
        "tutor_actions",
        f"kind IN ({_lista(TIPOS_DE_ACAO_DA_0005)})",
    )
    op.drop_constraint("ck_missions_inicio_antes_da_conclusao", "missions", type_="check")
    op.drop_constraint("ck_missions_em_andamento_iniciada", "missions", type_="check")
    # As operacoes `start` e `reschedule` ficam: a 0005 nao restringe `kind`.
    op.drop_constraint("ck_mission_operations_kind", "mission_operations", type_="check")
    op.drop_index("ix_mission_reschedules_mission_id", table_name="mission_reschedules")
    op.drop_table("mission_reschedules")
```

- [ ] **Step 4: Os modelos.** Em `tutoring/domain.py`, `TipoDeAcao` ganha `REAGENDAR_MISSAO = "reschedule_mission"` (o `CHECK` do modelo deriva sozinho, `_lista_sql(TipoDeAcao)`). Em `missions/models.py`:

```python
_MOTIVOS_SQL = ", ".join(f"'{m.value}'" for m in MotivoDoReagendamento)
_ORIGENS_SQL = ", ".join(f"'{o.value}'" for o in OrigemDoReagendamento)
_TIPOS_DE_OPERACAO_SQL = ", ".join(f"'{t.value}'" for t in TipoDeOperacao)


class MotivoDoReagendamentoText(TypeDecorator[MotivoDoReagendamento]):
    """TEXT no banco, MotivoDoReagendamento no Python (como MissionStateText)."""

    impl = Text
    cache_ok = True

    def process_result_value(
        self, value: Any, dialect: Dialect
    ) -> MotivoDoReagendamento:
        return MotivoDoReagendamento(value)


class OrigemDoReagendamentoText(TypeDecorator[OrigemDoReagendamento]):
    """TEXT no banco, OrigemDoReagendamento no Python (como MissionStateText)."""

    impl = Text
    cache_ok = True

    def process_result_value(
        self, value: Any, dialect: Dialect
    ) -> OrigemDoReagendamento:
        return OrigemDoReagendamento(value)


class MissionReschedule(Base):
    """Um reagendamento do prazo (F12). So de insercao: o servico nunca faz
    UPDATE nem DELETE aqui -- e o historico que nao se reescreve (README s8)."""

    __tablename__ = "mission_reschedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("missions.id", ondelete="CASCADE")
    )
    # A operacao que o gravou (F13): o reenvio acha a linha por aqui.
    operation_id: Mapped[str] = mapped_column(
        Text, ForeignKey("mission_operations.operation_id", ondelete="CASCADE")
    )
    previous_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    new_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reason: Mapped[MotivoDoReagendamento] = mapped_column(MotivoDoReagendamentoText)
    origin: Mapped[OrigemDoReagendamento] = mapped_column(OrigemDoReagendamentoText)
    rescheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("operation_id", name="uq_mission_reschedules_operation_id"),
        CheckConstraint(
            f"reason IN ({_MOTIVOS_SQL})", name="ck_mission_reschedules_reason"
        ),
        CheckConstraint(
            f"origin IN ({_ORIGENS_SQL})", name="ck_mission_reschedules_origin"
        ),
        CheckConstraint(
            "new_deadline <> previous_deadline",
            name="ck_mission_reschedules_prazo_mudou",
        ),
        Index("ix_mission_reschedules_mission_id", "mission_id"),
    )
```

`Mission` ganha, ao lado de `evidence` e `evaluation`:

```python
    # Em ordem de gravacao (F12). `lazy="select"`: mais uma consulta pequena por
    # missao lida (pendencia 96).
    reschedules: Mapped[list[MissionReschedule]] = relationship(
        order_by="MissionReschedule.id", cascade="all, delete-orphan", lazy="select"
    )
```

e, no `__table_args__`, os dois `CheckConstraint` com os textos e nomes da migração. `MissionOperation.__table_args__` ganha `CheckConstraint(f"kind IN ({_TIPOS_DE_OPERACAO_SQL})", name="ck_mission_operations_kind")`.

- [ ] **Step 5: Rodar e ver passar** — o arquivo novo **e** os de modelos e migrações que já existem: `uv run pytest tests/integration/test_acompanhamento_migration.py tests/integration/test_missions_models.py tests/integration/test_tutoring_models.py tests/integration/test_evaluation_migration.py tests/integration/test_progression_migration.py tests/integration/test_migrations.py -q --no-cov`. O espelho de `test_o_modelo_descreve_os_mesmos_checks_que_a_migracao_criou` tem de continuar verde **sem mudança** (o modelo e a migração ganharam os mesmos `CHECK`s); os downgrades da `0005` descem pela `0006` e também continuam verdes sem mudança (o Alembic roda a descida numa transação só, `alembic/env.py`). Se algum existente reprovar, **pare e relate** — não ajuste o teste.

- [ ] **Step 6: Mutações:** tirar `'start'` da lista congelada (reprova `test_o_kind_da_operacao_e_fechado`); tirar a guarda de `mission_reschedules` do downgrade (reprova o teste do histórico gravado); `order_by` removido do relacionamento (o teste de ordem reprova com a mutação combinada de inserir em ordem inversa de `id` — se não reprovar, registrar como equivalente).

- [ ] **Step 7: Commit**

```bash
git add alembic/versions/0006_acompanhamento.py src/focusquest/modules/missions/models.py src/focusquest/modules/tutoring/domain.py tests/integration/test_acompanhamento_migration.py
git commit -m "feat(acompanhamento): migracao 0006 e o historico de reagendamentos"
```

---

### Task 3: iniciar (simples)

**Files:**
- Modify: `src/focusquest/modules/missions/service.py`, `schemas.py`, `router.py`
- Modify (docstrings só): `tests/integration/test_missions_api.py`, `tests/integration/test_progression_api.py`
- Test: `tests/integration/test_iniciar_missao.py`

**Interfaces:**
- Consumes: `TipoDeOperacao` (Task 1), o `CHECK` de `kind` (Task 2).
- Produces: `CONCLUSAO`, `INICIO`, `REAGENDAMENTO` em `service.py` (valores de `TipoDeOperacao`); `def iniciar_missao(session: Session, user_id: int, mission_id: int, operation_id: str, *, clock: Clock) -> Mission`; `_exigir_mesma_operacao(ja_feita, mission_id, operation_id, kind: str)`; `_gravar_operacao(session, operation_id) -> None` (o `flush` com a tradução da UNIQUE, usado também por `concluir_missao`); `class MissionStart(BaseModel)` (`operation_id`); rota `POST /api/missions/{mission_id}/start -> MissionRead`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/integration/test_iniciar_missao.py`:

```python
"""Iniciar a missao (pendencia 3, decisoes F1-F4): servico e API."""

from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_session
from focusquest.core.errors import (
    MissaoExpiradaError,
    MissaoNaoEncontradaError,
    NaoPertenceAoUsuarioError,
    OperacaoReutilizadaError,
)
from focusquest.main import app
from focusquest.modules.missions.cycle_service import NovaDiaria, NovaEspecial, criar_plano
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    TransicaoIlegalError,
)
from focusquest.modules.missions.models import Mission, MissionOperation, User
from focusquest.modules.missions.service import (
    concluir_missao,
    criar_missao,
    iniciar_missao,
)

ESTUDANTE = 1
OUTRO = 2
SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)
AGORA = datetime(2026, 9, 23, 15, 0, tzinfo=UTC)  # quarta, meio-dia em SP


def relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


def _avulsa(session: Session, user_id: int = ESTUDANTE) -> Mission:
    return criar_missao(
        session,
        user_id=user_id,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo de uma pagina",
        difficulty=2,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=2),
    )


def _plano(session: Session) -> None:
    criar_plano(
        session,
        user_id=ESTUDANTE,
        semana=SEGUNDA,
        diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
        especial=NovaEspecial("E", "c", 60),
        clock=relogio(datetime(2026, 9, 21, 15, tzinfo=UTC)),
    )


def _diaria(session: Session, dia: date) -> Mission:
    return session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.DIARIA, Mission.day == dia)
    ).one()


def _operacoes(session: Session, mission_id: int, kind: str) -> int:
    return session.execute(
        select(func.count())
        .select_from(MissionOperation)
        .where(MissionOperation.mission_id == mission_id, MissionOperation.kind == kind)
    ).scalar_one()


def _iniciar(session: Session, missao: Mission, chave: str, agora: datetime = AGORA) -> Mission:
    return iniciar_missao(session, ESTUDANTE, missao.id, chave, clock=relogio(agora))


# --- servico -------------------------------------------------------------


def test_inicia_a_pendente_com_o_relogio_injetado(session: Session) -> None:
    missao = _iniciar(session, _avulsa(session), "op-i1")
    assert missao.state is MissionState.EM_ANDAMENTO
    assert missao.started_at == AGORA
    assert _operacoes(session, missao.id, "start") == 1


def test_reenvio_da_mesma_chave_devolve_o_mesmo_inicio(session: Session) -> None:
    missao = _avulsa(session)
    _iniciar(session, missao, "op-i2")
    de_novo = _iniciar(session, missao, "op-i2", AGORA + timedelta(hours=1))
    assert de_novo.started_at == AGORA
    assert _operacoes(session, missao.id, "start") == 1


@pytest.mark.parametrize("concluir_antes", [False, True])
def test_chave_nova_depois_de_iniciada_ou_concluida_e_transicao_ilegal(
    session: Session, concluir_antes: bool
) -> None:
    missao = _avulsa(session)
    if concluir_antes:
        concluir_missao(session, ESTUDANTE, missao.id, "op-c", clock=relogio(AGORA))
    else:
        _iniciar(session, missao, "op-i3")
    with pytest.raises(TransicaoIlegalError, match="em_andamento"):
        _iniciar(session, missao, "op-i4")


def test_a_chave_da_conclusao_nao_serve_para_iniciar_e_vice_versa(
    session: Session,
) -> None:
    """Review Focus 2: a UNIQUE e sobre a chave sozinha, e o tipo e conferido."""
    concluida = _avulsa(session)
    concluir_missao(session, ESTUDANTE, concluida.id, "op-gasta-c", clock=relogio(AGORA))
    with pytest.raises(OperacaoReutilizadaError):
        _iniciar(session, concluida, "op-gasta-c")

    iniciada = _avulsa(session)
    _iniciar(session, iniciada, "op-gasta-i")
    with pytest.raises(OperacaoReutilizadaError):
        concluir_missao(session, ESTUDANTE, iniciada.id, "op-gasta-i", clock=relogio(AGORA))


def test_a_chave_de_outra_missao_e_chave_gasta(session: Session) -> None:
    primeira, segunda = _avulsa(session), _avulsa(session)
    _iniciar(session, primeira, "op-i5")
    with pytest.raises(OperacaoReutilizadaError):
        _iniciar(session, segunda, "op-i5")


def test_inexistente_e_alheia(session: Session) -> None:
    with pytest.raises(MissaoNaoEncontradaError):
        iniciar_missao(session, ESTUDANTE, 2**31 - 1, "op-i6", clock=relogio(AGORA))
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    alheia = _avulsa(session, user_id=OUTRO)
    with pytest.raises(NaoPertenceAoUsuarioError):
        _iniciar(session, alheia, "op-i7")


def test_a_diaria_de_hoje_inicia(session: Session) -> None:
    _plano(session)
    assert _iniciar(session, _diaria(session, QUARTA), "op-d1").state is MissionState.EM_ANDAMENTO


def test_a_diaria_perdida_e_expirada_e_a_futura_nao_existe(session: Session) -> None:
    _plano(session)
    with pytest.raises(MissaoExpiradaError):
        _iniciar(session, _diaria(session, QUARTA - timedelta(days=1)), "op-d2")
    with pytest.raises(MissaoNaoEncontradaError):
        _iniciar(session, _diaria(session, QUARTA + timedelta(days=1)), "op-d3")


def test_concluir_depois_de_iniciar_tem_duracao_real(session: Session) -> None:
    missao = _avulsa(session)
    _iniciar(session, missao, "op-i8")
    concluir_missao(
        session, ESTUDANTE, missao.id, "op-c8", clock=relogio(AGORA + timedelta(minutes=25))
    )
    assert missao.completed_at is not None and missao.started_at is not None
    assert missao.completed_at - missao.started_at == timedelta(minutes=25)


# --- API -----------------------------------------------------------------


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def instante() -> Iterator[list[datetime]]:
    """Um relogio que o teste avanca: `instante[0]` e a hora da API."""
    atual = [AGORA]
    app.dependency_overrides[get_clock] = lambda: lambda: atual[0]
    yield atual
    app.dependency_overrides.pop(get_clock, None)


def _criar(client: TestClient) -> dict[str, Any]:
    resposta = client.post(
        "/api/missions",
        json={
            "instructions": "Ler o capitulo 3",
            "completion_criterion": "Resumo",
            "difficulty": 2,
            "estimated_minutes": 30,
            "deadline": (AGORA + timedelta(days=2)).isoformat(),
        },
    )
    assert resposta.status_code == 201, resposta.text
    corpo: dict[str, Any] = resposta.json()
    return corpo


def test_api_inicia_e_depois_mostra_a_duracao(
    client: TestClient, instante: list[datetime]
) -> None:
    criada = _criar(client)
    resposta = client.post(f"/api/missions/{criada['id']}/start", json={"operation_id": "op-a1"})
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["state"] == "em_andamento"
    assert datetime.fromisoformat(corpo["started_at"]) == AGORA
    assert corpo["actual_duration_minutes"] is None

    instante[0] = AGORA + timedelta(minutes=25)
    concluida = client.post(
        f"/api/missions/{criada['id']}/complete", json={"operation_id": "op-a2"}
    ).json()
    assert concluida["actual_duration_minutes"] == 25


def test_api_reenvio_e_o_mesmo_corpo(client: TestClient, instante: list[datetime]) -> None:
    criada = _criar(client)
    caminho = f"/api/missions/{criada['id']}/start"
    primeira = client.post(caminho, json={"operation_id": "op-a3"})
    instante[0] = AGORA + timedelta(minutes=5)
    segunda = client.post(caminho, json={"operation_id": "op-a3"})
    assert segunda.status_code == 200
    assert segunda.json() == primeira.json()


@pytest.mark.parametrize(
    ("preparo", "status", "code"),
    [
        ("iniciada", 409, "transicao_ilegal"),
        ("inexistente", 404, "missao_nao_encontrada"),
    ],
)
def test_api_erros_com_code(
    client: TestClient, instante: list[datetime], preparo: str, status: int, code: str
) -> None:
    criada = _criar(client)
    mission_id = 2**31 - 1 if preparo == "inexistente" else criada["id"]
    if preparo == "iniciada":
        client.post(f"/api/missions/{mission_id}/start", json={"operation_id": "op-a4"})
    resposta = client.post(f"/api/missions/{mission_id}/start", json={"operation_id": "op-a5"})
    assert (resposta.status_code, resposta.json()["code"]) == (status, code)


def test_api_diaria_perdida_e_missao_expirada(
    client: TestClient, session: Session, instante: list[datetime]
) -> None:
    _plano(session)
    perdida = _diaria(session, QUARTA - timedelta(days=1))
    resposta = client.post(f"/api/missions/{perdida.id}/start", json={"operation_id": "op-a6"})
    assert (resposta.status_code, resposta.json()["code"]) == (409, "missao_expirada")


@pytest.mark.parametrize("corpo", [{}, {"operation_id": ""}, {"operation_id": "x" * 201}])
def test_api_chave_invalida_e_422(client: TestClient, corpo: dict[str, Any]) -> None:
    criada = _criar(client)
    assert client.post(f"/api/missions/{criada['id']}/start", json=corpo).status_code == 422
```

- [ ] **Step 2: Rodar e ver reprovar**

Run: `uv run pytest tests/integration/test_iniciar_missao.py -q --no-cov`
Expected: FAIL (`ImportError: cannot import name 'iniciar_missao'`).

- [ ] **Step 3: O serviço.** Em `service.py`: `from focusquest.modules.missions.domain import TipoDeOperacao` e

```python
CONCLUSAO = TipoDeOperacao.CONCLUSAO
INICIO = TipoDeOperacao.INICIO
REAGENDAMENTO = TipoDeOperacao.REAGENDAMENTO
```

(o comentário longo de `CONCLUSAO` fica, com "havera pelo menos o inicio" trocado por "o inicio e o reagendamento tambem gravam aqui"). `_exigir_mesma_operacao` ganha `kind: str` e compara `ja_feita.kind != kind`; a docstring perde o "este ramo nao tem como acontecer em producao". `concluir_missao` passa `CONCLUSAO` e usa `_gravar_operacao`:

```python
def _gravar_operacao(session: Session, operation_id: str) -> None:
    """O `flush` da operacao, com a janela que a trava NAO fecha: duas missoes
    diferentes com a mesma chave nao disputam trava, e quem recusa e a UNIQUE
    -- a recusa sai com a mesma cara do caminho sequencial."""
    try:
        session.flush()
    except IntegrityError as erro:
        if UNICIDADE_DA_OPERACAO not in str(erro.orig):
            raise
        raise OperacaoReutilizadaError(_reuso(operation_id)) from erro


def _operacao_gravada(session: Session, operation_id: str) -> MissionOperation | None:
    return session.scalar(
        select(MissionOperation).where(MissionOperation.operation_id == operation_id)
    )


def iniciar_missao(
    session: Session,
    user_id: int,
    mission_id: int,
    operation_id: str,
    *,
    clock: Clock,
) -> Mission:
    """Inicia a missao (F1-F3), na MESMA ordem da conclusao: trava, relogio,
    ocultacao, reenvio, regra do dia, transicao. Ver `concluir_missao` para o
    porque de cada passo; aqui so muda o destino e o `kind`."""
    missao = buscar_para_escrever(session, user_id, mission_id, travar=True)
    agora = clock()
    lida = ler_missao(session, missao, agora)

    ja_feita = _operacao_gravada(session, operation_id)
    if ja_feita is not None:
        _exigir_mesma_operacao(ja_feita, mission_id, operation_id, INICIO)
        return missao

    if lida.availability in NAO_CONCLUIVEIS:
        raise MissaoExpiradaError(
            f"missao {mission_id} nao pode mais ser iniciada: "
            f"{lida.availability.value}"
        )

    validar_transicao(missao.state, MissionState.EM_ANDAMENTO)
    missao.state = MissionState.EM_ANDAMENTO
    missao.started_at = agora
    session.add(
        MissionOperation(operation_id=operation_id, mission_id=missao.id, kind=INICIO)
    )
    _gravar_operacao(session, operation_id)
    return missao
```

- [ ] **Step 4: Schema e rota.** Em `schemas.py`: `class MissionStart(BaseModel)` com `operation_id: str = Field(min_length=1, max_length=TAMANHO_MAXIMO_DO_IDENTIFICADOR)` e a docstring "o corpo do inicio: so a chave de idempotencia (F2)". Em `router.py`:

```python
@router.post("/{mission_id}/start")
def iniciar(
    mission_id: IdDaMissao,
    dados: MissionStart,
    session: SessaoDaRequisicao,
    clock: Annotated[Clock, Depends(get_clock)],
) -> MissionRead:
    """Inicia a missao (F1). 200, como a conclusao: muda o estado de um recurso
    que ja existia, e o reenvio da mesma chave devolve o mesmo corpo."""
    missao = iniciar_missao(
        session, USUARIO_UNICO, mission_id, dados.operation_id, clock=clock
    )
    session.commit()
    return MissionRead.da_leitura(ler_missao(session, missao, clock()))
```

- [ ] **Step 5: As docstrings velhas.** Em `test_missions_api.py::test_duracao_real_no_corpo_vem_dos_instantes` e no comentário de `test_progression_api.py` (linhas ~176–180), trocar "Nao existe caso de uso de INICIAR…" por uma frase que aponte para `test_iniciar_missao.py` (a duração real pelo caminho de verdade). **Nenhuma asserção muda.**

- [ ] **Step 6: Rodar e ver passar**; depois `uv run pytest tests/integration -q --no-cov -k "missions or cycle or progression or evaluation"` (a mudança de `_exigir_mesma_operacao` e de `_gravar_operacao` toca a conclusão).

- [ ] **Step 7: Mutações:** tirar `ja_feita.kind != kind` (reprova a chave cruzada); ler o relógio antes da trava não é observável aqui (é da Task 5); tirar a regra do dia (reprova a diária perdida); `ler_missao` depois do reenvio (reprova a diária futura só com chave gasta — acrescentar o caso, como `test_diaria_ainda_nao_revelada_responde_como_inexistente`).

- [ ] **Step 8: Commit**

```bash
git add src/focusquest/modules/missions tests/integration/test_iniciar_missao.py tests/integration/test_missions_api.py tests/integration/test_progression_api.py
git commit -m "feat(acompanhamento): iniciar missao, idempotente pelo operation_id"
```

---

### Task 4: reagendar pela tela (simples)

**Files:**
- Modify: `src/focusquest/core/errors.py`, `src/focusquest/main.py`
- Modify: `src/focusquest/modules/missions/service.py`, `schemas.py`, `router.py`
- Test: `tests/integration/test_reagendar_missao.py`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (em `core/errors.py`): `PrazoInalteradoError`, `PrazoDerivadoError`. (O `ReagendamentoInvalidoError`, o código e o handler dele entram na Task 7, com o primeiro caminho que os alcança: o `CodigoDeErro` só tem códigos que algum handler devolve.)
- Produces (em `main.py`): `CodigoDeErro.PRAZO_INALTERADO`, `PRAZO_DERIVADO`, os dois com handler `409`.
- Produces (em `service.py`): `def reagendar_missao(session: Session, user_id: int, mission_id: int, operation_id: str, *, novo_prazo: datetime, motivo: MotivoDoReagendamento, origem: OrigemDoReagendamento, clock: Clock) -> Mission`; `def missao_reagendavel(session: Session, user_id: int, mission_id: int) -> Mission | None`.
- Produces (em `schemas.py`): `class MissionRescheduleIn(BaseModel)` (`extra="forbid"`; `operation_id`, `new_deadline: PrazoComFuso`, `reason: MotivoDoReagendamento`); `class RescheduleRead(BaseModel)` (`previous_deadline`, `new_deadline`, `reason`, `origin`, `rescheduled_at`); `MissionRead.reschedules: list[RescheduleRead]`, preenchido em `da_leitura` **e** em `MissionCompletionRead.da_leitura_e_recompensa` por `_historico_de_prazos(missao)`.
- Produces (rota): `POST /api/missions/{mission_id}/reschedule -> MissionRead`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/integration/test_reagendar_missao.py` (os auxiliares `relogio`, `_avulsa`, `_plano`, `_diaria`, `client`, `instante` e `_criar` são **copiados** de `test_iniciar_missao.py`, sem importar de lá — a regra de `test_missions_concorrencia.py`):

```python
"""Reagendar o prazo (decisoes F6-F13): servico e API."""

# (imports e auxiliares copiados de test_iniciar_missao.py; mais:)
from datetime import timezone

from focusquest.core.errors import PrazoDerivadoError, PrazoExpiradoError, PrazoInalteradoError
from focusquest.modules.missions.domain import MotivoDoReagendamento, OrigemDoReagendamento
from focusquest.modules.missions.models import MissionReschedule
from focusquest.modules.missions.service import missao_reagendavel, reagendar_missao

SAO_PAULO = timezone(timedelta(hours=-3))
NOVO = AGORA + timedelta(days=5)


def _reagendar(
    session: Session,
    missao: Mission,
    chave: str,
    *,
    prazo: datetime = NOVO,
    motivo: MotivoDoReagendamento = MotivoDoReagendamento.FALTA_DE_TEMPO,
    agora: datetime = AGORA,
) -> Mission:
    return reagendar_missao(
        session,
        ESTUDANTE,
        missao.id,
        chave,
        novo_prazo=prazo,
        motivo=motivo,
        origem=OrigemDoReagendamento.USUARIO,
        clock=relogio(agora),
    )


def _historico(session: Session, mission_id: int) -> list[MissionReschedule]:
    return list(
        session.scalars(
            select(MissionReschedule)
            .where(MissionReschedule.mission_id == mission_id)
            .order_by(MissionReschedule.id)
        )
    )


def test_reagenda_e_grava_o_historico(session: Session) -> None:
    missao = _avulsa(session)
    antes = missao.deadline
    _reagendar(session, missao, "op-r1")
    assert missao.deadline == NOVO
    (linha,) = _historico(session, missao.id)
    assert (linha.previous_deadline, linha.new_deadline) == (antes, NOVO)
    assert linha.reason is MotivoDoReagendamento.FALTA_DE_TEMPO
    assert linha.origin is OrigemDoReagendamento.USUARIO
    assert linha.rescheduled_at == AGORA
    assert linha.operation_id == "op-r1"
    assert _operacoes(session, missao.id, "reschedule") == 1


def test_em_andamento_continua_em_andamento(session: Session) -> None:
    missao = _avulsa(session)
    iniciar_missao(session, ESTUDANTE, missao.id, "op-i", clock=relogio(AGORA))
    _reagendar(session, missao, "op-r2", agora=AGORA + timedelta(hours=1))
    assert missao.state is MissionState.EM_ANDAMENTO
    assert missao.started_at == AGORA


def test_dois_reagendamentos_viram_dois_elos(session: Session) -> None:
    missao = _avulsa(session)
    _reagendar(session, missao, "op-r3")
    _reagendar(session, missao, "op-r4", prazo=NOVO + timedelta(days=1))
    primeiro, segundo = _historico(session, missao.id)
    assert segundo.previous_deadline == primeiro.new_deadline == NOVO


def test_reenvio_igual_nao_grava_de_novo(session: Session) -> None:
    missao = _avulsa(session)
    _reagendar(session, missao, "op-r5")
    # O mesmo instante em outro fuso e o mesmo pedido (F13).
    _reagendar(session, missao, "op-r5", prazo=NOVO.astimezone(SAO_PAULO), agora=AGORA + timedelta(hours=2))
    assert len(_historico(session, missao.id)) == 1


@pytest.mark.parametrize(
    "mudanca",
    [
        {"prazo": NOVO + timedelta(minutes=1)},
        {"motivo": MotivoDoReagendamento.DIFICULDADE},
    ],
)
def test_mesma_chave_com_outro_conteudo_e_chave_gasta(
    session: Session, mudanca: dict[str, Any]
) -> None:
    missao = _avulsa(session)
    _reagendar(session, missao, "op-r6")
    with pytest.raises(OperacaoReutilizadaError):
        _reagendar(session, missao, "op-r6", **mudanca)


def test_a_chave_do_inicio_nao_serve_para_reagendar(session: Session) -> None:
    missao = _avulsa(session)
    iniciar_missao(session, ESTUDANTE, missao.id, "op-gasta", clock=relogio(AGORA))
    with pytest.raises(OperacaoReutilizadaError):
        _reagendar(session, missao, "op-gasta")


def test_antecipar_e_permitido(session: Session) -> None:
    missao = _avulsa(session)
    _reagendar(session, missao, "op-r7", prazo=AGORA + timedelta(hours=1))
    assert missao.deadline == AGORA + timedelta(hours=1)


@pytest.mark.parametrize(
    ("preparo", "prazo", "erro"),
    [
        ("concluida", NOVO, TransicaoIlegalError),
        ("nada", AGORA, PrazoExpiradoError),
        ("nada", AGORA - timedelta(days=1), PrazoExpiradoError),
        ("nada", "atual", PrazoInalteradoError),
        ("nada", "atual_sp", PrazoInalteradoError),
    ],
)
def test_cada_recusa_vem_antes_de_qualquer_escrita(
    session: Session, preparo: str, prazo: datetime | str, erro: type[Exception]
) -> None:
    """F17: a confirmacao da Tifa grava a falha DEPOIS da recusa; por isso
    nenhuma recusa pode ter escrito nada antes."""
    missao = _avulsa(session)
    if preparo == "concluida":
        concluir_missao(session, ESTUDANTE, missao.id, "op-c", clock=relogio(AGORA))
    atual = missao.deadline
    assert atual is not None
    alvo = {"atual": atual, "atual_sp": atual.astimezone(SAO_PAULO)}.get(str(prazo), prazo)
    assert isinstance(alvo, datetime)
    with pytest.raises(erro):
        _reagendar(session, missao, "op-r8", prazo=alvo)
    assert missao.deadline == atual
    assert _historico(session, missao.id) == []
    assert _operacoes(session, missao.id, "reschedule") == 0


def test_a_diaria_tem_prazo_derivado(session: Session) -> None:
    _plano(session)
    diaria = _diaria(session, QUARTA)
    with pytest.raises(PrazoDerivadoError):
        _reagendar(session, diaria, "op-r9")
    assert _historico(session, diaria.id) == []


def test_missao_reagendavel(session: Session) -> None:
    pendente = _avulsa(session)
    assert missao_reagendavel(session, ESTUDANTE, pendente.id) is pendente
    concluida = _avulsa(session)
    concluir_missao(session, ESTUDANTE, concluida.id, "op-c9", clock=relogio(AGORA))
    _plano(session)
    session.add(User(id=OUTRO, display_name="Outra pessoa"))
    session.flush()
    alheia = _avulsa(session, user_id=OUTRO)
    for mission_id in (concluida.id, _diaria(session, QUARTA).id, alheia.id, 2**31 - 1):
        assert missao_reagendavel(session, ESTUDANTE, mission_id) is None


# --- API -----------------------------------------------------------------


def _corpo(chave: str, **ajustes: Any) -> dict[str, Any]:
    corpo: dict[str, Any] = {
        "operation_id": chave,
        "new_deadline": NOVO.astimezone(SAO_PAULO).isoformat(),
        "reason": "falta_de_tempo",
    }
    corpo.update(ajustes)
    return corpo


def test_api_reagenda_e_publica_o_historico(
    client: TestClient, instante: list[datetime]
) -> None:
    criada = _criar(client)
    assert criada["reschedules"] == []
    resposta = client.post(f"/api/missions/{criada['id']}/reschedule", json=_corpo("op-a1"))
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert datetime.fromisoformat(corpo["deadline"]) == NOVO
    (linha,) = corpo["reschedules"]
    assert datetime.fromisoformat(linha["previous_deadline"]) == AGORA + timedelta(days=2)
    assert datetime.fromisoformat(linha["new_deadline"]) == NOVO
    assert (linha["reason"], linha["origin"]) == ("falta_de_tempo", "usuario")
    assert datetime.fromisoformat(linha["rescheduled_at"]) == AGORA
    listada = next(m for m in client.get("/api/missions").json() if m["id"] == criada["id"])
    assert listada["reschedules"] == corpo["reschedules"]


def test_api_reenvio_e_o_mesmo_corpo(client: TestClient, instante: list[datetime]) -> None:
    criada = _criar(client)
    caminho = f"/api/missions/{criada['id']}/reschedule"
    primeira = client.post(caminho, json=_corpo("op-a2"))
    instante[0] = AGORA + timedelta(minutes=3)
    segunda = client.post(caminho, json=_corpo("op-a2"))
    assert segunda.json() == primeira.json()


@pytest.mark.parametrize(
    ("corpo", "status", "code"),
    [
        ({"new_deadline": (AGORA + timedelta(days=2)).isoformat()}, 409, "prazo_inalterado"),
        ({"new_deadline": AGORA.isoformat()}, 422, "prazo_expirado"),
    ],
)
def test_api_prazo_recusado_com_code(
    client: TestClient, instante: list[datetime], corpo: dict[str, Any], status: int, code: str
) -> None:
    criada = _criar(client)
    resposta = client.post(f"/api/missions/{criada['id']}/reschedule", json=_corpo("op-a3", **corpo))
    assert (resposta.status_code, resposta.json()["code"]) == (status, code)


def test_api_concluida_e_transicao_ilegal(client: TestClient, instante: list[datetime]) -> None:
    criada = _criar(client)
    client.post(f"/api/missions/{criada['id']}/complete", json={"operation_id": "op-c"})
    resposta = client.post(f"/api/missions/{criada['id']}/reschedule", json=_corpo("op-a4"))
    assert (resposta.status_code, resposta.json()["code"]) == (409, "transicao_ilegal")


def test_api_diaria_e_prazo_derivado(
    client: TestClient, session: Session, instante: list[datetime]
) -> None:
    _plano(session)
    diaria = _diaria(session, QUARTA)
    resposta = client.post(f"/api/missions/{diaria.id}/reschedule", json=_corpo("op-a5"))
    assert (resposta.status_code, resposta.json()["code"]) == (409, "prazo_derivado")


def test_api_chave_gasta_e_operacao_reutilizada(
    client: TestClient, instante: list[datetime]
) -> None:
    criada = _criar(client)
    caminho = f"/api/missions/{criada['id']}/reschedule"
    client.post(caminho, json=_corpo("op-a6"))
    resposta = client.post(caminho, json=_corpo("op-a6", reason="dificuldade"))
    assert (resposta.status_code, resposta.json()["code"]) == (409, "operacao_reutilizada")


@pytest.mark.parametrize(
    ("ajustes", "campo"),
    [
        ({"new_deadline": "2026-10-01T10:00:00"}, "new_deadline"),
        ({"reason": "preguica"}, "reason"),
        ({"note": "x"}, "note"),
        ({"operation_id": ""}, "operation_id"),
    ],
)
def test_api_corpo_invalido_e_422(
    client: TestClient, instante: list[datetime], ajustes: dict[str, Any], campo: str
) -> None:
    criada = _criar(client)
    resposta = client.post(
        f"/api/missions/{criada['id']}/reschedule", json=_corpo("op-a7", **ajustes)
    )
    assert resposta.status_code == 422
    assert resposta.json()["detail"][0]["loc"][-1] == campo
```

- [ ] **Step 2: Rodar e ver reprovar**

Run: `uv run pytest tests/integration/test_reagendar_missao.py -q --no-cov`
Expected: FAIL (`ImportError: cannot import name 'PrazoDerivadoError'`).

- [ ] **Step 3: Os erros** em `core/errors.py`:

```python
class PrazoInalteradoError(DomainError):
    """O novo prazo e o prazo atual (F9): o pedido esta certo, mas nao muda
    nada, e gravar um reagendamento vazio sujaria o historico."""


class PrazoDerivadoError(DomainError):
    """A diaria e a especial tem prazo DERIVADO do ciclo (C10), sem coluna para
    mudar: nao se reagendam (F7)."""
```

e em `main.py`: os dois membros no `CodigoDeErro` (`PRAZO_DERIVADO = "prazo_derivado"`, `PRAZO_INALTERADO = "prazo_inalterado"`) e dois handlers `409` no padrão de `_missao_expirada`, cada um com a docstring de uma linha dizendo por que é `409` (o estado da missão recusa, não a forma do pedido). Os testes de API abaixo alcançam os dois.

- [ ] **Step 4: O serviço** em `service.py`:

```python
def reagendar_missao(
    session: Session,
    user_id: int,
    mission_id: int,
    operation_id: str,
    *,
    novo_prazo: datetime,
    motivo: MotivoDoReagendamento,
    origem: OrigemDoReagendamento,
    clock: Clock,
) -> Mission:
    """Troca o prazo e grava o elo do historico (F6-F13).

    A ordem e a da conclusao (trava, relogio, ocultacao, reenvio), e TODAS as
    recusas vem antes da primeira escrita: a confirmacao da Tifa (F17) grava a
    falha da acao depois de uma recusa daqui, na mesma transacao, e nada desta
    funcao pode ter ido ao banco antes dela.
    """
    missao = buscar_para_escrever(session, user_id, mission_id, travar=True)
    agora = clock()
    lida = ler_missao(session, missao, agora)

    ja_feita = _operacao_gravada(session, operation_id)
    if ja_feita is not None:
        _exigir_mesma_operacao(ja_feita, mission_id, operation_id, REAGENDAMENTO)
        gravado = session.scalars(
            select(MissionReschedule).where(
                MissionReschedule.operation_id == operation_id
            )
        ).one()
        # Mesma chave, OUTRO pedido: chave gasta (F13). Instantes comparam
        # como instantes.
        if (gravado.new_deadline, gravado.reason) != (novo_prazo, motivo):
            raise OperacaoReutilizadaError(_reuso(operation_id))
        return missao

    if missao.mission_type is not MissionType.AVULSA:
        raise PrazoDerivadoError(
            f"missao {mission_id} e {missao.mission_type.value}: o prazo vem do ciclo"
        )
    validar_reagendamento(missao.state)
    problema = problema_do_novo_prazo(novo_prazo, lida.deadline, agora)
    if problema is ProblemaDoNovoPrazo.NO_PASSADO:
        raise PrazoExpiradoError("o novo prazo precisa estar no futuro")
    if problema is ProblemaDoNovoPrazo.INALTERADO:
        raise PrazoInalteradoError("o novo prazo e igual ao prazo atual")

    # A operacao primeiro: a linha do historico tem FK para ela.
    session.add(
        MissionOperation(
            operation_id=operation_id, mission_id=missao.id, kind=REAGENDAMENTO
        )
    )
    _gravar_operacao(session, operation_id)
    missao.reschedules.append(
        MissionReschedule(
            operation_id=operation_id,
            previous_deadline=lida.deadline,
            new_deadline=novo_prazo,
            reason=motivo,
            origin=origem,
            rescheduled_at=agora,
        )
    )
    missao.deadline = novo_prazo
    session.flush()
    return missao


def missao_reagendavel(
    session: Session, user_id: int, mission_id: int
) -> Mission | None:
    """A missao que a Tifa pode propor reagendar (F16), ou `None`. Sem trava:
    e so a pre-condicao da PROPOSTA; a confirmacao revalida tudo com a trava."""
    missao = session.get(Mission, mission_id)
    if (
        missao is None
        or missao.user_id != user_id
        or missao.mission_type is not MissionType.AVULSA
        or missao.state is MissionState.CONCLUIDA
    ):
        return None
    return missao
```

- [ ] **Step 5: Schemas e rota.** `MissionRescheduleIn` (com `model_config = ConfigDict(extra="forbid")` e a docstring do motivo, como `EvidenceIn`), `RescheduleRead`, e `_historico_de_prazos(missao) -> list[RescheduleRead]`, usado nos dois construtores de `MissionRead`. A rota:

```python
@router.post("/{mission_id}/reschedule")
def reagendar(
    mission_id: IdDaMissao,
    dados: MissionRescheduleIn,
    session: SessaoDaRequisicao,
    clock: Annotated[Clock, Depends(get_clock)],
) -> MissionRead:
    """Reagenda o prazo pela tela (F6), com `origin = usuario`."""
    missao = reagendar_missao(
        session,
        USUARIO_UNICO,
        mission_id,
        dados.operation_id,
        novo_prazo=dados.new_deadline,
        motivo=dados.reason,
        origem=OrigemDoReagendamento.USUARIO,
        clock=clock,
    )
    session.commit()
    return MissionRead.da_leitura(ler_missao(session, missao, clock()))
```

- [ ] **Step 6: Rodar e ver passar** (o arquivo novo, e `tests/integration -k "missions or cycle or progression or evaluation or tutoring"`: o `MissionRead` mudou para todos).

- [ ] **Step 7: Mutações:** comparar só `new_deadline` no reenvio (reprova "outro motivo"); gravar a operação **antes** das recusas (reprova "cada recusa vem antes de qualquer escrita"); `previous_deadline=novo_prazo` (reprova os dois elos); tirar a guarda do tipo (reprova a diária — o `CHECK` `ck_missions_prazo_do_tipo` recusaria no banco, mas com `IntegrityError`, não com `prazo_derivado`).

- [ ] **Step 8: Commit**

```bash
git add src/focusquest tests/integration/test_reagendar_missao.py
git commit -m "feat(acompanhamento): reagendar prazo com motivo e historico"
```

---

### Task 5: concorrência e relógio (complexa)

**Files:**
- Test: `tests/integration/test_acompanhamento_concorrencia.py`

**Interfaces:**
- Consumes: `iniciar_missao`, `reagendar_missao`, `concluir_missao`; o padrão de `test_missions_concorrencia.py` (missão commitada com limpeza em `finally` e `lock_timeout`; `threading.Barrier` com `sessao.connection()` antes do `wait()`; resultado por índice; `SEGUNDOS_LIMITE`). **Copiar** os auxiliares, não importar.

Nenhum código de produção muda nesta tarefa — se um teste reprovar, é defeito da Task 3 ou da 4, e a correção entra aqui com o teste que o expôs.

- [ ] **Step 1: Os cenários**, cada um com conexões reais e largada na barreira:
  1. **Dois inícios, chaves diferentes** → `["bloqueada", "iniciou"]` (ordenados), uma operação `start`.
  2. **O mesmo início reenviado em paralelo** → `["iniciou", "iniciou"]`, uma operação.
  3. **Início e conclusão juntos** → a conclusão sempre vence ou convive: estado final `concluida`; se o início venceu, `started_at <= completed_at` (e o `CHECK` da Task 2 garante no banco); se perdeu, `transicao_ilegal` e `started_at` nulo.
  4. **Dois reagendamentos, chaves e prazos diferentes** (Review Focus 1) → duas linhas; o `previous_deadline` da segunda é o `new_deadline` da primeira; o prazo final é o `new_deadline` da segunda. **Esta é a prova da trava:** mutação "sem `travar=True` no `reagendar_missao`" tem de reprovar este cenário (rodar 3 vezes com a mutação; registrar quantas reprovaram).
  5. **O mesmo reagendamento reenviado em paralelo** → uma linha, os dois `200`.
  6. **Reagendamento e conclusão juntos** → nunca uma linha de histórico com `rescheduled_at` depois do `completed_at`; o perdedor do reagendamento é `transicao_ilegal`.
  7. **Mesma chave de reagendamento em duas missões diferentes** → uma grava, a outra `chave gasta` (a janela que a trava não fecha: a UNIQUE).
- [ ] **Step 2: O relógio depois da trava**, no desenho de `test_relogio_e_lido_com_a_linha_ja_travada`: um relógio-sonda que, quando chamado, confere por outra conexão (`SELECT … FOR UPDATE NOWAIT`) que a linha da missão **já** está travada; um caso para `iniciar_missao` e um para `reagendar_missao`. Mutação: `agora = clock()` antes de `buscar_para_escrever` (reprova os dois).
- [ ] **Step 3: Rodar duas vezes seguidas** (`uv run pytest tests/integration/test_acompanhamento_concorrencia.py -q --no-cov`, duas vezes): verde nas duas, sem linha deixada para trás (os testes de isolamento de `test_missions_models.py` exigem a tabela vazia — rodar o arquivo inteiro de modelos depois).
- [ ] **Step 4: Commit** — `test(acompanhamento): concorrencia e relogio do inicio e do reagendamento`.

---

### Task 6: o provedor e a ferramenta nova (simples)

**Files:**
- Modify: `src/focusquest/modules/tutoring/provider.py`, `anthropic_provider.py`, `schemas.py`
- Modify: `tests/integration/test_anthropic_provider.py`
- Test: `tests/unit/test_tutoring_proposta_de_reagendamento.py`

**Interfaces:**
- Consumes: `TipoDeAcao.REAGENDAR_MISSAO` (Task 2), `PrazoComFuso` e `MotivoDoReagendamento` (Task 1), `MAIOR_INTEIRO_DA_COLUNA`.
- Produces (em `provider.py`): `Proposta(nome: str, entrada: dict[str, Any])` — **`nome` primeiro, obrigatório**.
- Produces (em `tutoring/schemas.py`): `class RescheduleProposal(BaseModel)` (`extra="forbid"`; `mission_id: int = Field(ge=1, le=MAIOR_INTEIRO_DA_COLUNA)`, `new_deadline: PrazoComFuso`, `reason: MotivoDoReagendamento`); `CAMPOS_DO_RETRATO = ("instructions", "previous_deadline")`.
- Produces (em `anthropic_provider.py`): `DESCRICAO_DO_REAGENDAMENTO`; `def esquema_do_reagendamento() -> dict[str, Any]`; `responder` com `tools=[criar, reagendar]`.

- [ ] **Step 1: Mudar os testes existentes do adaptador — a mudança principal deste passo, com a justificativa.** Em `test_anthropic_provider.py`: (a) `Proposta(ENTRADA)` vira `Proposta("create_mission", ENTRADA)` nas três ocorrências — o **comportamento** esperado não muda (a mesma entrada, da mesma ferramenta); muda a forma do evento, que agora diz qual ferramenta foi chamada (F18). (b) Em `test_a_requisicao_leva_o_que_a_spec_manda`, `(ferramenta,) = corpo["tools"]` passa a

```python
    criar, reagendar = corpo["tools"]
    assert [criar["name"], reagendar["name"]] == ["create_mission", "reschedule_mission"]
    ferramenta = criar
```

(o resto do teste continua sobre `ferramenta`, sem mudança) — a requisição **deve** levar as duas ferramentas desde a F18; afirmar uma só seria afirmar o comportamento antigo. Registrar os dois no relatório como "teste existente mudado, motivo F18".

- [ ] **Step 2: Os testes novos que falham**, no mesmo arquivo:

```python
ENTRADA_DO_REAGENDAMENTO = {
    "mission_id": 12,
    "new_deadline": "2026-10-05T18:00:00-03:00",
    "reason": "falta_de_tempo",
}


def test_o_reagendamento_vira_proposta_com_o_nome(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(
        blocos=(
            Texto(("Vamos mover:",)),
            ChamadaDeFerramenta(ENTRADA_DO_REAGENDAMENTO, nome="reschedule_mission"),
        )
    )
    assert _todos(falso) == [
        Delta("Vamos mover:"),
        Proposta("reschedule_mission", ENTRADA_DO_REAGENDAMENTO),
        Fim(),
    ]


def test_o_esquema_do_reagendamento_vai_sem_a_docstring(falso: ServidorAnthropicFalso) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    _todos(falso)
    _, reagendar = falso.recebidas[0].corpo["tools"]
    esquema = reagendar["input_schema"]
    assert "description" not in esquema and "title" not in esquema
    assert set(esquema["required"]) == {"mission_id", "new_deadline", "reason"}
    assert esquema["additionalProperties"] is False
    assert "strict" not in reagendar  # F18: como a create_mission
```

e em `tests/unit/test_tutoring_proposta_de_reagendamento.py`:

```python
"""A entrada de `reschedule_mission`: o que o backend aceita do modelo (F15)."""

from typing import Any

import pytest
from pydantic import ValidationError

from focusquest.modules.missions.domain import MotivoDoReagendamento
from focusquest.modules.tutoring.anthropic_provider import esquema_do_reagendamento
from focusquest.modules.tutoring.schemas import RescheduleProposal

VALIDA = {"mission_id": 12, "new_deadline": "2026-10-05T18:00:00-03:00", "reason": "dificuldade"}


def test_a_entrada_valida() -> None:
    proposta = RescheduleProposal.model_validate(VALIDA)
    assert proposta.reason is MotivoDoReagendamento.DIFICULDADE


@pytest.mark.parametrize(
    "ajuste",
    [
        {"mission_id": 0},
        {"mission_id": 2**31},
        {"new_deadline": "2026-10-05T18:00:00"},
        {"reason": "outro"},
        {"instructions": "o modelo tentando escrever o retrato"},
    ],
)
def test_a_entrada_invalida(ajuste: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        RescheduleProposal.model_validate(VALIDA | ajuste)


def test_o_esquema_nomeia_os_tres_motivos_e_nao_leva_docstring() -> None:
    """O enum sai em linha ou por `$ref` (o Pydantic escolhe); nas duas formas
    os tres valores precisam estar la. E nenhuma `description`: as docstrings do
    schema e do enum sao de manutencao, nao servem ao modelo (M8)."""
    texto = json.dumps(esquema_do_reagendamento())
    for motivo in MotivoDoReagendamento:
        assert f'"{motivo.value}"' in texto
    assert '"description"' not in texto
```

(com `import json` no topo do arquivo).

- [ ] **Step 3: Rodar e ver reprovar.**

- [ ] **Step 4: Implementar.** `Proposta` com `nome: str` primeiro (docstring: "qual ferramenta de proposta o modelo chamou (F18); a entrada ainda NAO foi validada"). No adaptador:

```python
DESCRICAO_DO_REAGENDAMENTO = (
    "Propõe mudar o prazo de UMA missão pendente da lista do contexto. NÃO muda "
    "nada: a pessoa vê a proposta num cartão e decide se confirma ou recusa. "
    "Use só depois de conversar o motivo, e no máximo uma proposta por resposta. "
    "O novo prazo (new_deadline) é um instante ISO 8601 com fuso horário, no futuro."
)


def esquema_do_reagendamento() -> dict[str, Any]:
    """O `input_schema` de `reschedule_mission`, gerado do `RescheduleProposal`
    (a tecnica de `esquema_da_proposta`, M8)."""
    esquema = RescheduleProposal.model_json_schema()
    esquema.pop("description", None)
    esquema.pop("title", None)
    # A docstring do enum tambem vai para o `$defs`; e de manutencao (M8).
    for definicao in esquema.get("$defs", {}).values():
        definicao.pop("description", None)
    return esquema
```

`responder` monta as duas `ToolParam` (a segunda com `TipoDeAcao.REAGENDAR_MISSAO.value`) e emite `Proposta(evento.content_block.name, dict(evento.content_block.input))`. `RescheduleProposal` em `tutoring/schemas.py`, com `model_config = ConfigDict(extra="forbid")` e a docstring "a entrada do modelo; o retrato (`CAMPOS_DO_RETRATO`) e escrito pelo backend, nunca pelo modelo (F16) — por isso `extra='forbid'`".

- [ ] **Step 5: Rodar e ver passar** — o arquivo do adaptador inteiro, `test_tutoring_service.py`, `test_tutoring_api.py` e `test_camada3.py` (a camada 3 compara a sequência de eventos, não a requisição; tem de continuar verde sem mudança). O `transmitir` não muda nesta tarefa (ele já lê `evento.entrada`): até a T7, uma chamada de `reschedule_mission` é validada como `MissionCreate` e sai `proposta_invalida` — estado intermediário aceito, porque nenhum caminho da tela chega a ele antes da T7.

- [ ] **Step 6: Mutações:** emitir `Proposta("create_mission", …)` fixo (reprova o reagendamento); tirar `extra="forbid"` (reprova "o modelo tentando escrever o retrato").

- [ ] **Step 7: Commit** — `feat(tutoria): ferramenta de proposta reschedule_mission no provedor`.

---

### Task 7: a tutoria — proposta, confirmação, contexto e persona (complexa)

**Files:**
- Modify: `src/focusquest/core/errors.py`, `src/focusquest/main.py` (o erro, o código e o handler de `reagendamento_invalido`)
- Modify: `src/focusquest/modules/tutoring/service.py`, `router.py`, `context.py`, `persona.py`, `domain.py`
- Test: `tests/integration/test_tutoring_reagendamento.py`; casos novos em `tests/unit/test_tutoring_context.py` e `tests/unit/test_tutoring_persona.py`

**Interfaces:**
- Consumes: `reagendar_missao`, `missao_reagendavel` (Task 4), `Proposta(nome, entrada)` e `RescheduleProposal` (Task 6).
- Produces (em `core/errors.py`): `class ReagendamentoInvalidoError(DomainError)` — "a proposta de reagendamento nao vale mais: a missao sumiu, foi concluida ou ja tem aquele prazo (F17); a acao foi GRAVADA como `falhou` antes deste erro subir". Em `main.py`: `CodigoDeErro.REAGENDAMENTO_INVALIDO = "reagendamento_invalido"` e o handler `409`.
- Produces (em `tutoring/domain.py`): `REAGENDAMENTO_INVALIDO = "reagendamento_invalido"` (mesmo valor do `CodigoDeErro`; um teste de API confere, como o de `PRAZO_EXPIRADO`).
- Produces (em `service.py`): `@dataclass(frozen=True) class ReagendamentoInvalido: acao: TutorAction`; `confirmar_acao(...) -> Executada | PrazoExpirado | ReagendamentoInvalido`.
- Produces (em `router.py`): a confirmação levanta `ReagendamentoInvalidoError` depois do commit, como o `PrazoExpiradoError`.

O que a implementação precisa garantir, com um teste para cada item (servidor falso e banco real; `fabrica` e `conversa` para o que commita, a limpeza própria para o que confirma de verdade):

- [ ] **Step 1: A proposta.** Em `transmitir`, a validação pelo **nome** (`MissionCreate` / `RescheduleProposal` / outro → `proposta_invalida`). Em `_completar`, na **mesma** transação da resposta e com a resposta travada: para `RescheduleProposal`, `missao_reagendavel(session, resposta.user_id, dados.mission_id)`; `None` → a resposta vai a `falhou` com `proposta_invalida` e o texto (o stream emite `error` com `proposta_invalida`, **depois** do commit); senão a ação nasce com `payload = dados.model_dump(mode="json") | {"instructions": alvo.instructions, "previous_deadline": alvo.deadline.isoformat()}`. `_completar` passa a devolver um de três desfechos (`TutorMessage`; recolhida como órfã; pré-condição recusada) — um tipo de união, não um `bool`. Testes:
  - proposta válida → `RespostaConcluida`, uma ação `reschedule_mission` `proposta`, `payload` com os cinco campos, e **nenhuma** mudança na missão (prazo igual, zero linhas em `mission_reschedules`);
  - fora do esquema (sem `reason`) → `falhou`/`proposta_invalida`, nenhuma ação;
  - pré-condição: missão concluída, alheia, inexistente e diária → `falhou`/`proposta_invalida`, nenhuma ação (parametrizado);
  - nome desconhecido (`ChamadaDeFerramenta(…, nome="split_mission")`) → `proposta_invalida`;
  - `create_mission` continua como antes (os testes existentes de `test_tutoring_service.py`, sem mudança).
- [ ] **Step 2: A confirmação.** `confirmar_acao` trava a ação (já faz), confere a chave (já faz), e despacha pelo `kind`. Para `reschedule_mission`: revalida os três campos do modelo com `RescheduleProposal` (pendência 47 vale aqui também — registrar), chama `reagendar_missao(..., origem=TIFA)` e trata os desfechos do F17. `operation_id`, `decided_at` e `state` entram juntos (o cuidado com `ck_tutor_actions_decisao_datada` que o `PrazoExpirado` já documenta). `_resultado_anterior` devolve `ReagendamentoInvalido` para `falhou`/`reagendamento_invalido`. Testes:
  - confirma → `Executada`; a missão tem o prazo novo; uma linha no histórico com `origin = tifa` e `operation_id` = a chave da confirmação; `acao.mission_id` = a missão;
  - prazo proposto já passado → `PrazoExpirado`, ação `falhou`/`prazo_expirado`, missão intacta;
  - a missão concluída **depois** da proposta → `ReagendamentoInvalido`, ação `falhou`/`reagendamento_invalido`, nenhuma linha; o mesmo para o prazo já igual (a pessoa reagendou pela tela para o mesmo instante antes de confirmar) e para a missão apagada;
  - reenvio da confirmação com a mesma chave → o mesmo resultado nos três desfechos, sem nova linha;
  - chave da confirmação já gasta numa operação de missão (um `start`) → `OperacaoReutilizadaError`, ação continua `proposta`;
  - **concorrência** (conexões reais): duas confirmações da mesma proposta com chaves diferentes → uma `Executada`, a outra `transicao_ilegal`; **uma** linha no histórico. E uma confirmação junto com um reagendamento direto da mesma missão → sem espera circular (os dois terminam dentro do `SEGUNDOS_LIMITE`), histórico encadeado.
- [ ] **Step 3: A API.** `POST /api/tutoring/actions/{id}/confirm` de um reagendamento: `200` com `mission` = a reagendada (e o `reschedules` nela); `409 reagendamento_invalido` com a ação **já** `falhou` quando se relê `GET /api/tutoring/messages`; `422 prazo_expirado` idem. Um teste confere `REAGENDAMENTO_INVALIDO == CodigoDeErro.REAGENDAMENTO_INVALIDO.value`.
- [ ] **Step 4: O contexto** (`context.py`), testes de unidade novos em `test_tutoring_context.py` (os existentes não mudam):
  - pendente em andamento: a linha traz "em andamento desde <ISO>";
  - pendente reagendada duas vezes com o último motivo `falta_de_tempo`: "reagendada 2 vezes; último motivo: falta de tempo";
  - uma ação `reschedule_mission` executada no histórico: `"[Proposta de reagendamento da missão #12 para <new_deadline> (falta de tempo) -- executada]"`; a de `create_mission` continua com o texto de hoje (o teste existente prova).
  Os rótulos de motivo em pt-BR para o modelo moram em `context.py` num `dict[MotivoDoReagendamento, str]` exaustivo (o `mypy` não garante exaustividade de `dict`; um teste confere que as chaves são todos os membros).
- [ ] **Step 5: A persona** (`persona.py`): um bloco "Reagendar" com: a ferramenta pelo nome do domínio; "pergunte o motivo antes de propor: dificuldade, falta de tempo ou mudança de prioridade"; "se o motivo for dificuldade, ofereça ajuda — uma pista, um exemplo — antes de adiar"; "reagendar não é falha: nunca use a contagem de reagendamentos para culpar". Testes novos em `test_tutoring_persona.py`: `TipoDeAcao.REAGENDAR_MISSAO.value in PERSONA`; três casos novos em `_EXIGENCIAS_DO_README` (s5 acompanhar/distinguir os três motivos; s5 cobrar sem humilhar; s6 mudança significativa só com confirmação).
- [ ] **Step 6: Mutações:** tirar a pré-condição do `_completar` (reprova a concluída/alheia); gravar a falha **sem** commit antes de levantar (reprova o teste da API que relê a ação); `origem=USUARIO` na confirmação (reprova o `origin = tifa`); travar a missão antes da ação (não observável nos testes sequenciais; o cenário de concorrência cruzada tem de reprovar ou travar — registrar o resultado, como a pendência 104 do E).
- [ ] **Step 7: Commit** — `feat(tutoria): a Tifa propoe reagendar e a confirmacao executa`.

---

### Task 8: frontend — contrato, lib e hooks (simples)

**Files:**
- Modify: `frontend/src/shared/types/mission.ts`, `frontend/src/features/missions/types.ts`, `useCompletionRegistry.ts`, `frontend/src/shared/lib/deadline.ts`
- Create: `frontend/src/features/missions/startFailure.ts`, `rescheduleFailure.ts`, `useStartMission.ts`, `useRescheduleMission.ts` (+ testes); casos novos em `deadline.test.ts` e `useCompletionRegistry.test.tsx`
- Modify (fixtures): toda fixture de `Mission` que o `tsc` apontar

**Interfaces:**
- Produces (em `shared/types/mission.ts`): `type RescheduleReason = 'dificuldade' | 'falta_de_tempo' | 'mudanca_de_prioridade'`; `type RescheduleOrigin = 'usuario' | 'tifa'`; `interface Reschedule { previous_deadline: string; new_deadline: string; reason: RescheduleReason; origin: RescheduleOrigin; rescheduled_at: string }`; `Mission.reschedules: Reschedule[]`; `RESCHEDULE_REASON_LABELS: Record<RescheduleReason, string>` (`'Dificuldade'`, `'Falta de tempo'`, `'Mudança de prioridade'`).
- Produces (em `features/missions/types.ts`): `type StartErrorCode = 'missao_nao_encontrada' | 'transicao_ilegal' | 'operacao_reutilizada' | 'missao_expirada'`; `type RescheduleErrorCode = 'missao_nao_encontrada' | 'transicao_ilegal' | 'operacao_reutilizada' | 'prazo_expirado' | 'prazo_inalterado' | 'prazo_derivado'`; `interface RescheduleDraft { civil: string; reason: RescheduleReason | null }`.
- Produces (em `shared/lib/deadline.ts`): `saoPauloCivilToIso(civil: string): string | null`; `isoToSaoPauloCivil(iso: string): string`.
- Produces: `type MissionAction = 'start' | 'reschedule'`; o `CompletionRegistry` ganha `actionKeyFor(missionId: number, action: MissionAction): string` e `releaseActionKey(missionId: number, action: MissionAction): void` (as chaves do Concluir não mudam: `operationIdFor`/`release`).
- Produces: `startFailure.ts` → `type StartRecovery = 'retry' | 'retry-with-new-operation' | 'refresh'`, `describeStartFailure(error: unknown): { message: string; recovery: StartRecovery }`; `rescheduleFailure.ts` → `type RescheduleRecovery = 'retry' | 'retry-with-new-operation' | 'edit' | 'refresh'`, `describeRescheduleFailure(error: unknown)`.
- Produces: `useStartMission(missionId: number, registry: CompletionRegistry, onStarted?: () => void): { state: StartState; start: () => void }`, com `StartState = { status: 'idle' } | { status: 'submitting' } | { status: 'started'; mission: Mission } | { status: 'failed'; failure: StartFailure }`; `useRescheduleMission(missionId: number, registry: CompletionRegistry): { state: RescheduleState; reschedule: (draft: RescheduleDraft) => void }`, com os mesmos quatro estados (`rescheduled` no lugar de `started`).

- [ ] **Step 1: Contrato e fixtures.** Acrescentar os tipos; `npx tsc -b` reprova em cada fixture de `Mission`; em cada uma, `reschedules: []`. Nenhuma asserção muda. `npm run test:coverage`: PASS.

- [ ] **Step 2: A conversão de fuso**, em `deadline.ts` (mesmo arquivo de `formatDeadline`, a mesma regra de fuso):

```ts
const SAO_PAULO = 'America/Sao_Paulo'

/** As partes do instante no relogio de Sao Paulo. `h23`: meia-noite e 00, nao 24. */
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SAO_PAULO,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function saoPauloParts(instant: number): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number> {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** Quanto o relogio de SP esta a frente de UTC nesse instante (negativo: atras). */
function offsetMs(instant: number): number {
  const p = saoPauloParts(instant)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A hora civil de Sao Paulo do instante, no formato do `datetime-local`
 * (`YYYY-MM-DDTHH:mm`). Os segundos sao cortados, como no `formatDeadline`.
 */
export function isoToSaoPauloCivil(iso: string): string {
  const p = saoPauloParts(new Date(iso).getTime())
  return `${String(p.year)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

const CIVIL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/**
 * O instante (ISO em UTC) da hora civil de Sao Paulo, ou `null` se ela nao
 * existe: data invalida, ou a hora pulada no inicio de um horario de verao.
 *
 * Duas passadas pelo deslocamento, e NAO um deslocamento fixo (F21): Sao Paulo
 * ja teve horario de verao, e a regra do backend (`cycle_domain.py`) recusa
 * suposicao pelo mesmo motivo. A volta (`isoToSaoPauloCivil`) e a prova: o que
 * nao da a mesma hora civil de volta nao existe no relogio de SP.
 */
export function saoPauloCivilToIso(civil: string): string | null {
  const match = CIVIL.exec(civil)
  if (match === null) {
    return null
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const first = naive - offsetMs(naive)
  const instant = naive - offsetMs(first)
  const iso = new Date(instant).toISOString()
  return isoToSaoPauloCivil(iso) === civil ? iso : null
}
```

Testes (em `deadline.test.ts`, que roda com o processo em `Asia/Tokyo`): `'2026-10-02T18:00'` → `'2026-10-02T21:00:00.000Z'`; `'2018-12-01T12:00'` (SP em −02:00) → `'2018-12-01T14:00:00.000Z'`; `'2018-11-04T00:30'` (a hora pulada) → `null`; `'2026-02-31T10:00'` → `null`; `'amanhã'` → `null`; `isoToSaoPauloCivil('2026-10-02T21:00:59Z')` → `'2026-10-02T18:00'`; a volta de `saoPauloCivilToIso` por `isoToSaoPauloCivil` devolve a mesma string em dez instantes de 2026. Mutação: trocar as duas passadas por `naive + 3 * 3_600_000` (reprova 2018); tirar a prova da volta (reprova a hora pulada e o 31/02).

- [ ] **Step 3: Os mapas de falha**, exaustivos (`Record<StartErrorCode, …>`, `Record<RescheduleErrorCode, …>`), com `Object.hasOwn` (um caso com `code: 'toString'` cai no genérico), os textos **exatos** da tabela da spec ("O que a tela mostra"), o 404 sem `code` → `refresh` (RE20 do E), e, no reagendamento, qualquer `422` sem `code` conhecido → `edit` com "O novo prazo não foi aceito. Revise a data e o motivo.". Um teste por `code`, um para rede, um para `toString`.

- [ ] **Step 4: O registro.** Testes em `useCompletionRegistry.test.tsx`: `actionKeyFor(7, 'start')` é estável entre chamadas; é **diferente** de `operationIdFor(7)` e de `actionKeyFor(7, 'reschedule')`; `releaseActionKey(7, 'start')` só troca a chave do início (as outras duas continuam); o `release(7)` do Concluir não toca as chaves de ação. Implementar num `Map<string, string>` com a chave `` `${action}:${String(missionId)}` ``.

- [ ] **Step 5: Os hooks** (com `routeFetch`), no desenho de `useCompleteMission` — a chave vem do registro **antes** de qualquer mudança de estado; `registry.started()` antes do POST, `settled()` no `finally`; um `onStarted` que lança vai para o `console.error` (pendência 94), não para `failed`:
  - `useStartMission`: `start()` faz `POST /api/missions/7/start` com `{ operation_id }`; `submitting` → `started` com a missão da resposta; falha `retry` (rede, 500) **retém** a chave (o segundo `start()` manda a mesma); `transicao_ilegal`, `missao_expirada`, `missao_nao_encontrada` e `operacao_reutilizada` liberam; `onStarted` só no sucesso; um segundo `start()` com o primeiro em voo **não** faz outro POST.
  - `useRescheduleMission`: `reschedule({ civil: '2026-10-05T18:00', reason: 'falta_de_tempo' })` faz `POST /api/missions/7/reschedule` com `{ operation_id, new_deadline: '2026-10-05T21:00:00.000Z', reason: 'falta_de_tempo' }`; rascunho sem motivo, sem data ou com hora inexistente **não** faz POST (o estado não muda); `edit` e os demais não-`retry` liberam a chave; `retry` retém.

- [ ] **Step 6: Rodar e ver reprovar, implementar, rodar e ver passar** (`npm run test:coverage` — 100% nos quatro eixos; ler o `Coverage summary`, `docs/QUALITY.md` §3; `npm run lint`, `npm run typecheck`, `npm run format:check`).

- [ ] **Step 7: Mutações:** mesma chave para Concluir e Iniciar (reprova o registro); liberar a chave no `retry` (reprova a retenção); POST com rascunho sem motivo (reprova o hook).

- [ ] **Step 8: Commit** — `feat(acompanhamento): contrato, fuso de SP e hooks de iniciar e reagendar no frontend`.

---

### Task 9: frontend — o cartão de proposta de reagendamento (complexa)

**Files:**
- Modify: `frontend/src/features/tutoring/types.ts`, `ProposalCard.tsx`, `actionFailure.ts`, `useDecideAction.ts`, `TutorConversation.tsx` (se escolhe o cartão)
- Create: `frontend/src/features/tutoring/DecisionControls.tsx`, `RescheduleProposalCard.tsx` (+ testes)

**Interfaces:**
- Produces (em `tutoring/types.ts`): `ActionRead` vira união discriminada por `kind`: `CreateMissionAction` (`kind: 'create_mission'; payload: MissionProposal`) e `RescheduleMissionAction` (`kind: 'reschedule_mission'; payload: RescheduleProposal`), com `interface RescheduleProposal { mission_id: number; new_deadline: string; reason: 'dificuldade' | 'falta_de_tempo' | 'mudanca_de_prioridade'; instructions: string; previous_deadline: string }` (tipo **próprio** da feature: `tutoring` não importa `missions`, `docs/ARCHITECTURE.md` §5 regra 1; os rótulos de motivo são repetidos aqui, com o comentário de espelho da pendência 32); `ActionErrorCode` ganha `'reagendamento_invalido'`.
- Produces: `DecisionControls` extraído de `ProposalCard.tsx` sem mudança de comportamento (os testes de `ProposalCard.test.tsx` continuam verdes **sem mudança**); `<RescheduleProposalCard action={RescheduleMissionAction} keys onChanged onMissionCreated onRefresh boardHref onGoToBoard />`, com `data-testid="tutor-reschedule-proposal"`; `ActionRecovery` ganha `'invalidated'` (a ação foi gravada `falhou`/`reagendamento_invalido`), e `useDecideAction` o trata como o `'expired'`, com o `error_code` certo.

O que os testes cobram (e a implementação decide como):

- [ ] **Step 1:** o cartão mostra "Proposta de reagendamento", as `instructions` do retrato, "Prazo atual" e "Prazo proposto" como `<time dateTime=…>` com `formatDeadline`, e "Motivo: Falta de tempo" em texto; Confirmar e Recusar com o nome acessível completando a missão; clique duplo não faz dois POSTs (os dois botões desabilitados em voo); `executada` → "Prazo reagendado" e o link "Ver no Quartel-General"; `recusada` → "Proposta recusada"; `falhou` com `prazo_expirado` → o texto de hoje; com `reagendamento_invalido` → "A missão mudou desde a proposta e não pôde ser reagendada. Peça à Tifa uma nova proposta."; a confirmação com `409 reagendamento_invalido` muda o cartão para esse estado **sem** recarregar a conversa; `onMissionCreated` é chamado depois de confirmar (o quadro recarrega — F22).
- [ ] **Step 2:** a conversa escolhe o cartão pelo `kind` (um teste com uma mensagem que traz as duas ações, uma de cada tipo); um `kind` desconhecido vindo de uma API mais nova não quebra a conversa (o `switch` com retorno declarado reprova no `tsc` se faltar um ramo, e o valor fora do tipo cai num texto neutro "Proposta que esta versão não sabe mostrar." — registrar a decisão no relatório).
- [ ] **Step 3:** `describeActionFailure` com `reagendamento_invalido` → `invalidated` e o texto acima; os casos existentes não mudam.
- [ ] **Step 4:** `npm run test:coverage`, `lint`, `typecheck`, `format:check`. Mutações: o cartão mostrando `payload.new_deadline` como "Prazo atual" (reprova); `invalidated` tratado como `retry` (reprova); `DecisionControls` sem o `disabled` em voo (reprova o duplo).
- [ ] **Step 5: Commit** — `feat(tutoria): cartao da proposta de reagendamento`.

---

### Task 10: frontend — o cartão da missão (complexa)

**Files:**
- Create: `frontend/src/features/missions/RescheduleForm.tsx`, `RescheduleHistory.tsx` (+ testes)
- Modify: `frontend/src/features/missions/MissionCard.tsx`, `MissionList.test.tsx`, `CycleSection.test.tsx`

**Interfaces:**
- Consumes: tudo da Task 8.
- Produces: `<RescheduleForm mission={Mission} disabled={boolean} failure={RescheduleFailure | null} onSubmit={(draft: RescheduleDraft) => void} />` (disclosure "Reagendar prazo", `aria-expanded`); `<RescheduleHistory reschedules={Reschedule[]} />` (nada quando a lista é vazia); `MissionCard` mostra `completion.mission` se concluída, senão a última missão devolvida por iniciar ou reagendar, senão a listada.

O que os testes cobram:

Todo texto de data dos testes sai de `formatDeadline` (ou de uma regex, como `headquarters.spec.ts`), nunca de um literal "23/09/2026 12:00": o separador entre data e hora é do ICU, não nosso.

- [ ] **Step 1: Iniciar.** Pendente e `availability: 'disponivel'` → botão "Iniciar" (`data-testid="mission-start"`, nome acessível "Iniciar a missão: …"); pendente perdida/expirada, em andamento e concluída → sem o botão; clicar → "Iniciando…" desabilitado, região viva "Missão iniciada." no sucesso, o rótulo passa a "Em andamento" e aparece "Iniciada em 23/09/2026 12:00" (`data-testid="mission-started-at"`, `<time dateTime>`); falha `refresh` → a mensagem e o botão de recarga (o mesmo `reloadLabel`); falha `retry` → "Tentar de novo" com a mesma chave; o Concluir continua disponível em andamento e, depois de concluir, a "Duração real" aparece.
- [ ] **Step 2: Reagendar.** Só na avulsa não concluída (a diária e a especial da `CycleSection` **não** mostram o disclosure — teste em `CycleSection.test.tsx`); o campo "Novo prazo (horário de Brasília)" começa com `isoToSaoPauloCivil(mission.deadline)`; o `fieldset` "Por que reagendar?" com três rádios, nenhum marcado; "Salvar novo prazo" desabilitado sem motivo e com data inválida (motivo em texto ligado por `aria-describedby`, como o `blockedReason` do Concluir); salvar → o prazo do cartão muda, o disclosure fecha, a região viva anuncia "Prazo reagendado." e o histórico aparece; falha `edit` → a mensagem com `role="alert"` e o formulário **com o que foi digitado**; falha `refresh` → recarga.
- [ ] **Step 3: Histórico.** Com dois reagendamentos: "Reagendada 2 vezes" e o `<details>` "Histórico de prazos" com duas linhas "02/10/2026 18:00 → 05/10/2026 18:00 · Falta de tempo · por você" / "· proposto pela Tifa"; com um: "Reagendada 1 vez"; com nenhum: nada.
- [ ] **Step 4: A recarga espera** (Review Focus 5): "Atualizar o quadro" com um Iniciar em voo fica "Aguardando…" e recarrega quando ele termina; a chave do Iniciar com falha `retry` sobrevive à remontagem (o segundo clique, depois da recarga, manda a mesma chave).
- [ ] **Step 5:** o foco: depois de iniciar, o botão some e o foco vai para o título do cartão se tinha caído no `body` (o mesmo `useEffect` da conclusão); depois de salvar o reagendamento, o foco volta ao botão do disclosure.
- [ ] **Step 6:** `npm run test:coverage` (100% nos quatro eixos), `lint`, `typecheck`, `format:check`. Mutações: o disclosure aparecendo na diária (reprova); o histórico sem o texto do motivo (reprova); o cartão mostrando a listada depois de iniciar (reprova "Em andamento"); limpar o formulário numa falha `edit` (reprova).
- [ ] **Step 7: Commit** — `feat(acompanhamento): iniciar, reagendar e historico de prazos no cartao`.

---

### Task 11: E2E (complexa)

**Files:**
- Create: `frontend/tests/e2e/tracking.spec.ts`

**Interfaces:**
- Consumes: tudo integrado em `feat/incremento-f`; de `./falso`: `definirRoteiro`, `reiniciar`, `requisicoes` (o `Bloco` já aceita `tool_name`); `AxeBuilder`. Cada spec declara os próprios auxiliares (copiar `criarMissao` de `evaluation.spec.ts`, sem importar).

- [ ] **Step 1: Os cenários** (`test.describe.configure({ mode: 'serial' })`, `reiniciar()` no `beforeEach`, `EXECUCAO = randomUUID().slice(0, 8)` em todo texto criado; números lidos da API, P6 do D):
  1. **Iniciar e concluir:** criar uma avulsa pela API; no quadro, clicar "Iniciar"; ver "Em andamento" e "Iniciada em"; `GET /api/missions` confirma `state` e `started_at`; concluir; a "Duração real" do cartão é igual ao `actual_duration_minutes` da API. axe no cartão em andamento.
  2. **Reagendar pela tela:** criar uma avulsa; abrir "Reagendar prazo", preencher `2027-01-10T10:00`, escolher "Falta de tempo", salvar; o prazo do cartão passa a "10/01/2027 10:00"; o histórico mostra "Falta de tempo · por você"; a API tem `reschedules[0]` com `reason: 'falta_de_tempo'`, `origin: 'usuario'` e `new_deadline` = `2027-01-10T13:00:00Z`. axe com o disclosure aberto.
  3. **A Tifa propõe e a pessoa confirma:** criar uma avulsa; `definirRoteiro({ blocks: [{ text: ['Vamos mover.'] }, { tool_name: 'reschedule_mission', tool_input: { mission_id, new_deadline: '2027-02-01T21:00:00Z', reason: 'mudanca_de_prioridade' } }] })`; perguntar pelo painel; o cartão "Proposta de reagendamento" mostra a missão e os dois prazos; `requisicoes()` confere que a API ofereceu as duas ferramentas; confirmar; o quadro recarrega e o cartão da missão tem o prazo novo e "Mudança de prioridade · proposto pela Tifa". axe no cartão de proposta.
- [ ] **Step 2: Rodar** `make check-e2e` duas vezes seguidas (esquema limpo): PASS nas duas; anotar o total de cenários medido.
- [ ] **Step 3: Mutações** (pelo `make check-e2e`): o botão Iniciar sem o POST (só local); o `saoPauloCivilToIso` com `-02:00` fixo; a confirmação da ação ignorando o `kind` (cria missão). Todas reprovam; restaurar por backup.
- [ ] **Step 4: Commit** — `test(e2e): iniciar, reagendar e a proposta da Tifa ponta a ponta`.

---

### Task 12: documentação (simples)

**Files:**
- Modify: `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md`

- [ ] **Step 1: `docs/HANDOFF.md`:** "Decisões tomadas": F1–F24 (resumo; a spec é a fonte) e as decisões da execução; "Dependências e infraestrutura que entraram no F": nenhuma dependência nova (conferir com `git diff <base> -- pyproject.toml uv.lock frontend/package.json frontend/package-lock.json` vazio), os dois endpoints e a ferramenta, com o motivo; a migração `0006` e a ordem de implantação (parar a API, migrar, subir); "Alterações do Incremento F", tarefa a tarefa, com as mutações vistas; "Resultados", os `make check` e `make check-e2e` medidos; pendências: riscar a **3** (`~~…~~ **Resolvida no Incremento F:**`); atualizar a **47** (vale também para o `payload` do reagendamento), a **55** (a Tifa vê estado e reagendamentos das avulsas, ainda não o ciclo) e a **96** (o N+1 ganhou `reschedules`); novas **109–114**, com o texto da spec ("Pendências que o F cria").
- [ ] **Step 2: `docs/ARCHITECTURE.md`:** a árvore (§1) com os arquivos novos; o contrato HTTP de iniciar e reagendar, com a tabela de erros; a ferramenta `reschedule_mission` e o `kind` novo de ação no contrato da tutoria; a ordem das travas (F14) em §3.
- [ ] **Step 3: `docs/QUALITY.md` §9:** a conversa com duas ferramentas no falso (camadas 1 e 2); a camada 3 com duas ferramentas como pendência 109.
- [ ] **Step 4: `make check`** e commit — `docs(acompanhamento): handoff, arquitetura e qualidade do incremento f`.

---

## Autorrevisão do plano (feita ao escrever, contra a spec e o código de `580f6cc`)

Conferido com `grep` no código da base, e não de memória:

- **Nomes que o plano consome e existem:** `buscar_para_escrever`, `ler_missao`, `leitura_da_avulsa`, `NAO_CONCLUIVEIS`, `MissionOperation`, `UNICIDADE_DA_OPERACAO`, `_reuso`, `_exigir_mesma_operacao`, `concluir_missao`, `criar_missao` (`missions/service.py` e `cycle_service.py`); `_instante_representavel`, `TAMANHO_MAXIMO_DO_IDENTIFICADOR`, `MAIOR_INTEIRO_DA_COLUNA`, `_campos_da_entrega`, `MissionRead.da_leitura`, `MissionCompletionRead.da_leitura_e_recompensa` (`missions/schemas.py`); `IdDaMissao`, `SessaoDaRequisicao`, `get_clock`, `USUARIO_UNICO` (`router.py`, `core/`); `PrazoExpiradoError` e o handler `422 prazo_expirado` (`core/errors.py`, `main.py`); `_erro` e `CodigoDeErro` (`main.py`); `TipoDeAcao`, `PRAZO_EXPIRADO`, `confirmar_acao`, `_resultado_anterior`, `PrazoExpirado`, `Executada`, `_completar`, `transmitir` (`tutoring/`); `esquema_da_proposta`, `DESCRICAO_DA_FERRAMENTA`, `responder` (`anthropic_provider.py`); `ChamadaDeFerramenta(entrada, nome=…)`, `Roteiro`, `Texto` (`tests/integration/provedor_falso.py`); o `tool_name` do falso do E2E (`falso_do_e2e.py`, `frontend/tests/e2e/falso.ts`); as fixtures `session`, `fabrica`, `tutoria`, `falso`, `conversa`, `banco_migrado` e `alembic_config` (`tests/integration/conftest.py`); `criar_plano`, `NovaDiaria`, `NovaEspecial` e o desenho de `_plano`/`_diaria` (`test_cycle_completion.py`); `formatDeadline` (`shared/lib/deadline.ts`); `postJson` (`shared/api/client.ts`); `useCompletionRegistry` com `operationIdFor`/`release`/`started`/`settled` e `useCompleteMission`.
- **Fatos do código que mudaram o desenho:** (1) `mission_operations.kind` **não** tem `CHECK` hoje (`0001`), e o comentário de `CONCLUSAO` já previa o início — daí F23 e o `TipoDeOperacao`; (2) `tutor_actions` tem `ck_tutor_actions_missao_so_quando_executada`, então a proposta de reagendamento guarda o alvo no `payload`, e o `mission_id` da ação só nasce na execução; (3) `confirmar_acao` já trata `transicao_ilegal` como "proposta já decidida", daí o código próprio `reagendamento_invalido` (F17); (4) `_texto` do contexto lê `payload['instructions']` e escreve "Proposta de missão" para toda ação — daí o texto por tipo (F19); (5) `test_duracao_real_no_corpo_vem_dos_instantes` grava `started_at` numa **pendente**, então a `0006` **não** cria "pendente sem início" (só "em andamento com início"), e o teste existente fica intacto; (6) `test_a_requisicao_leva_o_que_a_spec_manda` desempacota **uma** ferramenta — a mudança dele é a mudança principal da Task 6, Step 1; (7) os testes de downgrade da `0005` descem da `head` pela cadeia e o Alembic roda a descida numa transação só (`alembic/env.py`) — por isso a `0006` só recusa com dados dela; (8) o espelho de `CHECK`s de `test_missions_models.py` compara modelo e banco — modelo e migração mudam na **mesma** tarefa (Task 2), e o `TipoDeAcao` novo entra ali, não na Task 1.
- **Cobertura da spec:** F1–F4 → Task 3; F5 → nada a codificar (limite declarado; pendência 111 na Task 12); F6–F13 → Tasks 1, 2 e 4; F14 → Tasks 5 e 7; F15–F19 → Tasks 6 e 7; F20–F21 → Tasks 8 e 10; F22 → Task 9; F23 → Task 2; F24 → conferido na Task 12 (diff de dependências vazio) e por nenhuma tarefa tocar `progression/`.
- **Lacuna conhecida, assumida:** o texto de um `kind` de ação desconhecido na conversa (Task 9, Step 2) não está na spec; a tarefa decide e registra.
