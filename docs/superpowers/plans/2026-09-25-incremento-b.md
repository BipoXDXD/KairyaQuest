# Incremento B — Plano de Implementação (o ciclo diário)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o ciclo diário: o plano semanal (7 diárias e 1 missão especial), a sequência, as regras de tempo na conclusão, os endpoints `POST /api/plans`, `GET /api/plans/current` e `GET /api/cycle`, e o cartão "Missão de hoje" no Quartel-General.

**Architecture:** O ciclo mora **dentro** do módulo `missions` (a diária e a especial são missões; a conclusão é a mesma rota), em quatro arquivos novos com prefixo `cycle_`: `cycle_domain.py` (regras puras de tempo), `cycle_service.py` (casos de uso e leitura), `cycle_schemas.py` e `cycle_router.py`. O estado do ciclo é **derivado** a cada leitura (C2), nunca gravado. No frontend, a seção do ciclo mora em `features/missions/`, reaproveitando o fluxo de conclusão (chave por missão, `operation_id` preservado).

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 18, `zoneinfo` + `tzdata`; React 19, TypeScript, Vitest, Testing Library, Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-09-18-ciclo-diario-design.md` (decisões C1–C17, "Regras do ciclo", "Modelo de dados", "Endpoints", "Erros", "Testes"). As três decisões bloqueantes (B1 a, B2 ordem 1, B3 b) são do dono (2026-09-18); as nove "Interpretações a confirmar" foram **confirmadas pelo dono em 2026-09-25**, como escritas.

## Global Constraints

- Interface em pt-BR com acento; contratos externos (colunas, chaves JSON, rotas) em inglês; identificadores internos podem ser em português; comentários e docstrings do código em português **sem acento**, como o resto da base (README §3, `docs/ARCHITECTURE.md` §5 regra 7).
- `make check` verde antes de cada commit (os hooks o rodam); proibido `--no-verify`, `SKIP`, `|| true`, teste ignorado, diretiva de ignorar cobertura, limiar reduzido (`AGENTS.md` §3).
- Cobertura: 100% de linhas e ramificações em `src/focusquest/`; 100% nos quatro eixos em `frontend/src/` (fonte: `pyproject.toml` e `frontend/vite.config.ts`).
- **Regra da casa (spec, "Testes"):** toda guarda nova tem um teste que a faz dizer não, e cada teste novo é visto reprovando por mutação antes de valer. Cada Task lista as mutações; o relatório da Task registra o resultado de cada uma.
- O dia é a data civil em `America/Sao_Paulo`, intervalo semiaberto [00:00 de D, 00:00 de D+1); a semana vai de segunda a domingo (C1).
- XP nunca é gravado (A4); especial = `3 × XP(5)` = **660** (C9); especial sempre dificuldade **5**.
- `estimated_minutes` ≤ **1440** para diária e especial (C10); o prazo delas é **derivado**, nunca coluna.
- Tudo que ainda não foi revelado responde o **404 idêntico** ao de missão inexistente (C11).
- Códigos de erro novos (valores exatos): `missao_expirada`, `plano_existente`, `semana_encerrada`, `semana_distante`.
- Nenhuma dependência nova além de **`tzdata==2026.4`** (motivo no HANDOFF).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Branch `feat/incremento-b`, a partir de `12288a2` (a `main`, merge do PR #12).

## Review Focus

1. **Um plano criado no meio da semana**: os dias anteriores à criação aparecem com conteúdo como `fora_do_plano`, não quebram a sequência e respondem 409 `missao_expirada` ao concluir — nunca 404 nem 200. Teste na Task 3 (`test_o_plano_lido_revela_so_ate_hoje`) e na Task 4 (`test_dia_fora_do_plano_e_expirado`).
2. **`week_start` no último ano representável** (`9999-12-27`, a última segunda): tem de ser 409 `semana_distante`, nunca 500 por estouro de `datetime`. Teste na Task 5 (`test_semana_no_ano_9999_e_distante_e_nao_500`).
3. **A tela num fuso a oeste de UTC** mostrando a data civil do ciclo (`today`): `new Date('2026-09-21')` formatado em São Paulo vira domingo, 20/09. Teste na Task 7 (`formatCivilDate`) e no E2E da Task 9 (navegador em `Asia/Tokyo`, texto conferido contra o `today` da API).
4. **A conclusão da diária de hoje e a sequência na mesma tela**: depois do Concluir, a sequência tem de mudar sem recarregar a página e sem desmontar o cartão (a região viva "Missão concluída." precisa continuar lá). Teste na Task 8 (`concluir a missao de hoje atualiza a sequencia sem desmontar o cartao`).
5. **Reenvio da conclusão depois da meia-noite**: a mesma chave, às 00:00:01, devolve o mesmo 200 — nunca 409 `missao_expirada`. Teste na Task 4 (`test_reenvio_depois_da_meia_noite_devolve_a_mesma_conclusao`) e na Task 5 pela API.

---

## Decisões que a spec não fixava (entram no HANDOFF na Task 10)

| # | Decisão | Motivo |
|---|---|---|
| P1 | O ciclo mora no módulo `missions`, em arquivos `cycle_*.py`, e não num módulo próprio | A diária e a especial **são** missões, e a conclusão é a mesma rota. Um módulo `cycle` separado fecharia um ciclo de import: `missions.service` precisa das regras do ciclo na conclusão, e o ciclo precisa de `Mission` e de `User` (que mora em `missions/models.py`, pendência 8). `docs/ARCHITECTURE.md` §5 regra 2 proíbe o ciclo. |
| P2 | `GET /api/plans/current` entra no B, e não no C | O 201 do `POST /api/plans` devolve o plano "na mesma forma do `GET /api/plans/current`" (spec, Endpoints), então o serializador existe no B de qualquer jeito; e a spec manda o cliente que recebe `409 plano_existente` confirmar com esse GET. O C fica com a tela da trilha, a navegação lateral e o axe em Campanhas. |
| P3 | A `availability` da avulsa é `concluida` se o estado é `concluida`, e `disponivel` nos outros | A spec põe `availability` no `MissionRead` e só tabela a diária e a especial. A avulsa não tem regra de dia (o prazo dela nunca bloqueou a conclusão, desde o 1a). |
| P4 | `weekly_plans.created_at` vem do **relógio injetável**, e não do `now()` do banco | É entrada de regra (`fora_do_plano`), como o `created_at` das mensagens da tutoria (1b-1). Misturar o `now()` do banco com o relógio dos testes faria a regra comparar dois relógios. |
| P5 | O `bonus` do `POST /api/plans` recusa campo desconhecido (`extra="forbid"`) | A spec diz "1 missão, sem `difficulty`". Um cliente que mandasse `difficulty` acharia que foi respeitado; o 422 diz que não. |
| P6 | Ocultação implementada por **leitura**: `ler_missao` levanta `MissaoNaoEncontradaError` para o que não foi revelado, e a conclusão chama `ler_missao` logo depois do relógio | Uma função só decide "revelado" para a leitura e para a conclusão; duas acabariam discordando. A ordem da spec (trava, relógio, ocultação, reenvio, regra do dia, transição) continua literal. |
| P7 | A guarda do banco de teste e o recomeço do esquema moram em `tests/integration/banco_de_teste.py`, e rodam como `PYTHONPATH=tests uv run python -m integration.banco_de_teste` | É infraestrutura destrutiva de teste: em `src/` ela poderia ser chamada pela aplicação. O arranjo `PYTHONPATH=tests` já é o do servidor falso do E2E. |
| P8 | O quadro de avulsas passa a se chamar "Outras missões — tarefas com prazo" | A spec, seção Frontend: "'Outras missões', com as avulsas". |
| P9 | Depois de concluir a diária ou a especial, a seção do ciclo **atualiza em silêncio** (`refresh`), sem passar por "carregando" | Recarregar com "carregando" desmontaria o cartão e apagaria o anúncio "Missão concluída.". Se a atualização silenciosa falha, a tela mantém o que tinha e avisa que a sequência pode estar desatualizada, com "Atualizar". |
| P10 | `DAYS_PER_MILESTONE = 7` no frontend espelha `DIAS_POR_MARCO` à mão | Mesmo desenho dos outros espelhos (pendência 32): a tela precisa do número para "N de 7". |

## Mapa de arquivos

Backend:
- Create: `src/focusquest/modules/missions/cycle_domain.py` — regras puras do ciclo (dia, semana, disponibilidade, sequência, marco, janela).
- Create: `src/focusquest/modules/missions/cycle_service.py` — criar plano, ler plano/ciclo/missão, histórico.
- Create: `src/focusquest/modules/missions/cycle_schemas.py` — contratos de `/api/plans` e `/api/cycle`.
- Create: `src/focusquest/modules/missions/cycle_router.py` — as três rotas novas.
- Create: `alembic/versions/0003_ciclo_diario.py`.
- Modify: `src/focusquest/modules/missions/domain.py` — `MissionType`, `xp_da_missao`, constantes da especial.
- Modify: `src/focusquest/modules/missions/models.py` — `WeeklyPlan`, colunas novas de `Mission`.
- Modify: `src/focusquest/modules/missions/schemas.py` — `MissionRead` com `mission_type`, `day`, `availability`.
- Modify: `src/focusquest/modules/missions/service.py` — `criar_missao` com tipo, `listar_missoes` só avulsas, regras do ciclo em `concluir_missao`.
- Modify: `src/focusquest/modules/missions/router.py` — `MissionRead.da_leitura`.
- Modify: `src/focusquest/core/errors.py`, `src/focusquest/main.py` — quatro erros e códigos.
- Modify: `src/focusquest/modules/tutoring/router.py`, `src/focusquest/modules/tutoring/context.py` — prazo pela leitura da avulsa.
- Modify: `pyproject.toml`, `uv.lock` — `tzdata`.

Testes:
- Create: `tests/unit/test_cycle_domain.py`, `tests/unit/test_cycle_invariantes.py`, `tests/integration/test_cycle_models.py`, `tests/integration/test_cycle_service.py`, `tests/integration/test_cycle_completion.py`, `tests/integration/test_cycle_concorrencia.py`, `tests/integration/test_cycle_api.py`, `tests/integration/banco_de_teste.py`, `tests/integration/test_banco_de_teste.py`.
- Modify: `tests/integration/conftest.py`, `tests/integration/test_migrations.py`, `tests/integration/test_missions_models.py`, `tests/integration/test_missions_api.py`, `tests/integration/test_tutoring_models.py`.

Infra:
- Modify: `Makefile` (alvo `reset-test-db`, pré-requisito do `check-e2e`), `scripts/e2e-env.sh` (guarda compartilhada).

Frontend:
- Create: `frontend/src/features/missions/civilDate.ts` (+ teste), `useCycle.ts` (+ teste), `MissionCard.tsx`, `CycleSection.tsx` (+ teste).
- Modify: `frontend/src/features/missions/types.ts`, `completionFailure.ts` (+ teste), `useCompleteMission.ts` (+ teste), `MissionList.tsx`, `frontend/src/pages/Headquarters.tsx` (+ teste), e os literais `Mission` dos testes existentes.
- Create: `frontend/tests/e2e/cycle.spec.ts`.

Docs: `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md`, a spec (nota das interpretações confirmadas e emendas, se houver).

---

### Task 0: Revisão-base do Incremento B

**Files:**
- Modify: `docs/HANDOFF.md` (seção "Revisão-base", no topo, antes do parágrafo do 1b-2)
- Modify: `docs/superpowers/specs/2026-09-18-ciclo-diario-design.md` (seção "Interpretações a confirmar")
- Add: este plano

- [ ] **Step 1: Registrar a revisão-base no HANDOFF.** Inserir, logo depois de `## Revisão-base`, o parágrafo:

```markdown
**Incremento B — o ciclo diário.** Branch `feat/incremento-b`, aberta a
partir de `12288a2` (a `main`: o merge do PR #12, a camada 3 do 1b-2). Spec
em `docs/superpowers/specs/2026-09-18-ciclo-diario-design.md`; plano em
`docs/superpowers/plans/2026-09-25-incremento-b.md`. **Primeira sessão no
Linux** (x86_64): o repositório chegou como arquivo ZIP, sem `.git`; o
histórico foi religado por um clone sem checkout do remoto, e a árvore
conferiu idêntica a `12288a2` (`git status` limpo). Hooks instalados por
`uv run pre-commit install --install-hooks`; `make check` na base, sem
mudança nenhuma: aprovado, EXIT 0 (ver "Resultados"). **Estado de
publicação: não publicado.** Push, PR e merge autorizados pelo dono em
2026-09-25 para este incremento.
```

- [ ] **Step 2: Registrar as interpretações confirmadas na spec.** Acrescentar, logo abaixo do título `## Interpretações a confirmar`:

```markdown
**Confirmadas pelo dono em 2026-09-25, como escritas abaixo** (as nove). O
Incremento B as implementa sem mudança.
```

- [ ] **Step 3: Rodar o gate.** Run: `make check` — Expected: EXIT 0 (só documentação mudou).

- [ ] **Step 4: Commit.**

```bash
git add docs/HANDOFF.md docs/superpowers/specs/2026-09-18-ciclo-diario-design.md docs/superpowers/plans/2026-09-25-incremento-b.md
git commit -m "docs(ciclo): plano do incremento b e revisao-base no linux

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: O domínio puro do ciclo

**Files:**
- Create: `src/focusquest/modules/missions/cycle_domain.py`
- Modify: `src/focusquest/modules/missions/domain.py` (acrescentar ao fim)
- Modify: `pyproject.toml`, `uv.lock`
- Test: `tests/unit/test_cycle_domain.py`

**Interfaces:**
- Produces (usados pelas Tasks 2–5):
  - `domain.MissionType` (StrEnum `AVULSA="avulsa"`, `DIARIA="diaria"`, `ESPECIAL="especial"`), `domain.DIFICULDADE_DA_ESPECIAL = 5`, `domain.MULTIPLICADOR_DA_ESPECIAL = 3`, `domain.xp_da_missao(tipo: MissionType, dificuldade: int) -> int`.
  - `cycle_domain.FUSO_DO_CICLO`, `DIAS_DA_SEMANA = 7`, `DIAS_POR_MARCO = 7`, `MINUTOS_DO_DIA = 1440`, `Availability` (StrEnum com `fora_do_plano`, `bloqueada`, `disponivel`, `concluida`, `perdida`, `expirada`), `NAO_CONCLUIVEIS: frozenset[Availability]`, `DiaDoPlano(concluida: bool, plano_criado_em: date)`, `Historico = Mapping[date, DiaDoPlano]`.
  - Funções: `dia_de(datetime) -> date`, `inicio_do_dia(date) -> datetime`, `fim_do_dia(date) -> datetime`, `segunda_da_semana(date) -> date`, `dias_da_semana(date) -> list[date]`, `disponibilidade_da_diaria(dia, estado, hoje) -> Availability`, `sequencia_ate(historico, dia) -> int`, `sequencia(historico, hoje) -> int`, `dias_para_o_marco(sequencia: int) -> int`, `marco_da_semana(historico, segunda) -> date | None`, `marco_mais_recente(historico, hoje) -> date | None`, `fim_da_janela_da_especial(marco: date) -> datetime`, `disponibilidade_da_especial(marco: date | None, concluida: bool, agora: datetime) -> Availability`.

- [ ] **Step 1: Acrescentar o `tzdata`.**

Run: `uv add "tzdata==2026.4"`
Expected: `pyproject.toml` ganha `"tzdata==2026.4"` em `dependencies` (mantenha a ordem alfabética da lista) e o `uv.lock` é atualizado. `uv lock --check` passa.

- [ ] **Step 2: Escrever os testes que reprovam.** Criar `tests/unit/test_cycle_domain.py`:

```python
"""As regras do ciclo diario, como funcoes puras, em tabela.

Nada aqui le relogio nem toca banco: e o que deixa a meia-noite exata, a
virada da semana e a janela da especial testaveis sem viagem no tempo (spec
do ciclo diario, secao "Testes", dominio puro).
"""

from datetime import UTC, date, datetime, timedelta

import pytest

from focusquest.modules.missions.cycle_domain import (
    NAO_CONCLUIVEIS,
    Availability,
    DiaDoPlano,
    dia_de,
    dias_da_semana,
    dias_para_o_marco,
    disponibilidade_da_diaria,
    disponibilidade_da_especial,
    fim_da_janela_da_especial,
    fim_do_dia,
    inicio_do_dia,
    marco_da_semana,
    marco_mais_recente,
    segunda_da_semana,
    sequencia,
    sequencia_ate,
)
from focusquest.modules.missions.domain import (
    DIFICULDADE_DA_ESPECIAL,
    MissionType,
    xp_da_missao,
    xp_para_dificuldade,
)
from focusquest.modules.missions.schemas import DIFICULDADE_MAXIMA

# 2026-09-21 e uma segunda-feira; a semana dela vai ate o domingo 27.
SEGUNDA = date(2026, 9, 21)
TERCA = SEGUNDA + timedelta(days=1)
QUARTA = SEGUNDA + timedelta(days=2)
QUINTA = SEGUNDA + timedelta(days=3)
DOMINGO = SEGUNDA + timedelta(days=6)
UMA_SEMANA = timedelta(days=7)


def _semana(
    segunda: date, concluidas: set[int], criado_em: date | None = None
) -> dict[date, DiaDoPlano]:
    """Os 7 dias de um plano; `concluidas` sao indices (0 = segunda)."""
    criacao = segunda if criado_em is None else criado_em
    return {
        dia: DiaDoPlano(concluida=indice in concluidas, plano_criado_em=criacao)
        for indice, dia in enumerate(dias_da_semana(segunda))
    }


TODOS = set(range(7))


# --- dia e semana ----------------------------------------------------------


@pytest.mark.parametrize(
    ("instante", "esperado"),
    [
        (datetime(2026, 9, 21, 2, 59, 59, tzinfo=UTC), date(2026, 9, 20)),
        # A meia-noite exata pertence ao dia seguinte (intervalo semiaberto).
        (datetime(2026, 9, 21, 3, 0, 0, tzinfo=UTC), date(2026, 9, 21)),
        (datetime(2026, 9, 22, 2, 59, 59, 999999, tzinfo=UTC), date(2026, 9, 21)),
    ],
)
def test_o_dia_e_a_data_civil_em_sao_paulo(instante: datetime, esperado: date) -> None:
    assert dia_de(instante) == esperado


def test_instante_sem_fuso_e_recusado() -> None:
    with pytest.raises(ValueError, match="sem fuso"):
        dia_de(datetime(2026, 9, 21, 12, 0))


def test_inicio_e_fim_do_dia_sao_as_meias_noites_de_sao_paulo() -> None:
    assert inicio_do_dia(SEGUNDA) == datetime(2026, 9, 21, 3, tzinfo=UTC)
    assert fim_do_dia(SEGUNDA) == datetime(2026, 9, 22, 3, tzinfo=UTC)


@pytest.mark.parametrize("dia", dias_da_semana(SEGUNDA))
def test_a_semana_comeca_na_segunda(dia: date) -> None:
    assert segunda_da_semana(dia) == SEGUNDA


def test_os_sete_dias_da_semana() -> None:
    assert dias_da_semana(SEGUNDA) == [SEGUNDA + timedelta(days=i) for i in range(7)]


# --- disponibilidade da diaria (hoje = quarta) ----------------------------


@pytest.mark.parametrize(
    ("dia", "concluida", "criado_em", "esperado"),
    [
        (QUARTA, True, SEGUNDA, Availability.CONCLUIDA),
        (SEGUNDA, False, QUARTA, Availability.FORA_DO_PLANO),
        (QUINTA, False, SEGUNDA, Availability.BLOQUEADA),
        (QUARTA, False, SEGUNDA, Availability.DISPONIVEL),
        (SEGUNDA, False, SEGUNDA, Availability.PERDIDA),
    ],
)
def test_disponibilidade_da_diaria(
    dia: date, concluida: bool, criado_em: date, esperado: Availability
) -> None:
    estado = DiaDoPlano(concluida=concluida, plano_criado_em=criado_em)
    assert disponibilidade_da_diaria(dia, estado, QUARTA) is esperado


def test_nao_concluiveis_sao_o_que_ja_passou_ou_nao_era_do_plano() -> None:
    assert frozenset(
        {Availability.FORA_DO_PLANO, Availability.PERDIDA, Availability.EXPIRADA}
    ) == NAO_CONCLUIVEIS


# --- sequencia -------------------------------------------------------------


def test_sem_historico_a_sequencia_e_zero() -> None:
    assert sequencia({}, SEGUNDA) == 0
    assert sequencia_ate({}, SEGUNDA) == 0


def test_a_diaria_de_hoje_em_aberto_nao_quebra() -> None:
    assert sequencia(_semana(SEGUNDA, {0, 1}), QUARTA) == 2


def test_a_diaria_de_hoje_concluida_conta() -> None:
    assert sequencia(_semana(SEGUNDA, {0, 1, 2}), QUARTA) == 3


def test_um_dia_perdido_quebra_a_sequencia() -> None:
    historico = _semana(SEGUNDA, {0, 2})
    assert sequencia(historico, QUARTA) == 1
    assert sequencia(historico, QUINTA) == 1


def test_a_sequencia_atravessa_semanas() -> None:
    historico = {**_semana(SEGUNDA - UMA_SEMANA, {3, 4, 5, 6}), **_semana(SEGUNDA, {0, 1})}
    assert sequencia(historico, TERCA) == 6


def test_dia_sem_plano_nao_conta_nem_quebra() -> None:
    """Semana S-2 inteira, S-1 sem plano, segunda de S concluida: 7 + 1."""
    historico = {
        **_semana(SEGUNDA - 2 * UMA_SEMANA, TODOS),
        **_semana(SEGUNDA, {0}),
    }
    assert sequencia(historico, SEGUNDA) == 8


def test_dia_fora_do_plano_nao_conta_nem_quebra() -> None:
    """Plano criado na quarta: segunda e terca ficam fora, e sao puladas."""
    historico = {
        **_semana(SEGUNDA - UMA_SEMANA, TODOS),
        **_semana(SEGUNDA, {2}, criado_em=QUARTA),
    }
    assert sequencia(historico, QUARTA) == 8


@pytest.mark.parametrize(("s", "faltam"), [(0, 7), (6, 1), (7, 7), (8, 6)])
def test_dias_para_o_marco(s: int, faltam: int) -> None:
    assert dias_para_o_marco(s) == faltam


# --- marco -----------------------------------------------------------------


def test_o_marco_no_domingo() -> None:
    historico = _semana(SEGUNDA, TODOS)
    assert sequencia_ate(historico, DOMINGO) == 7
    assert marco_da_semana(historico, SEGUNDA) == DOMINGO


def test_sem_sete_dias_nao_ha_marco() -> None:
    assert marco_da_semana(_semana(SEGUNDA, {0, 1, 2, 3, 4, 5}), SEGUNDA) is None


def test_o_marco_no_meio_da_semana() -> None:
    historico = {**_semana(SEGUNDA - UMA_SEMANA, {3, 4, 5, 6}), **_semana(SEGUNDA, {0, 1, 2})}
    assert marco_da_semana(historico, SEGUNDA) == QUARTA


def test_sequencia_de_14_da_uma_especial_em_cada_semana() -> None:
    historico = {**_semana(SEGUNDA, TODOS), **_semana(SEGUNDA + UMA_SEMANA, TODOS)}
    assert sequencia(historico, DOMINGO + UMA_SEMANA) == 14
    assert marco_da_semana(historico, SEGUNDA) == DOMINGO
    assert marco_da_semana(historico, SEGUNDA + UMA_SEMANA) == DOMINGO + UMA_SEMANA


def test_marco_mais_recente_da_semana_atual() -> None:
    historico = {**_semana(SEGUNDA - UMA_SEMANA, {3, 4, 5, 6}), **_semana(SEGUNDA, {0, 1, 2})}
    assert marco_mais_recente(historico, QUINTA) == QUARTA


def test_marco_mais_recente_da_semana_anterior() -> None:
    """Marco no domingo de S; na segunda de S+1 ele ainda e o mais recente."""
    historico = _semana(SEGUNDA, TODOS)
    assert marco_mais_recente(historico, SEGUNDA + UMA_SEMANA) == DOMINGO


def test_sem_marco_recente() -> None:
    assert marco_mais_recente(_semana(SEGUNDA, {0}), QUARTA) is None


# --- especial --------------------------------------------------------------


def test_a_janela_da_especial_vai_ate_o_fim_do_dia_seguinte() -> None:
    # Marco no domingo 27: a janela fecha na meia-noite de terca 29 em SP.
    assert fim_da_janela_da_especial(DOMINGO) == datetime(2026, 9, 29, 3, tzinfo=UTC)


def test_especial_sem_marco_esta_bloqueada() -> None:
    agora = datetime(2026, 9, 23, 15, tzinfo=UTC)
    assert disponibilidade_da_especial(None, False, agora) is Availability.BLOQUEADA


def test_especial_concluida_continua_concluida_depois_da_janela() -> None:
    depois = fim_da_janela_da_especial(DOMINGO) + timedelta(days=30)
    assert disponibilidade_da_especial(DOMINGO, True, depois) is Availability.CONCLUIDA


@pytest.mark.parametrize(
    ("agora", "esperado"),
    [
        (inicio_do_dia(DOMINGO), Availability.DISPONIVEL),
        (fim_da_janela_da_especial(DOMINGO) - timedelta(microseconds=1), Availability.DISPONIVEL),
        (fim_da_janela_da_especial(DOMINGO), Availability.EXPIRADA),
    ],
)
def test_especial_na_borda_da_janela(agora: datetime, esperado: Availability) -> None:
    assert disponibilidade_da_especial(DOMINGO, False, agora) is esperado


# --- XP da especial ----------------------------------------------------------


def test_a_especial_vale_o_triplo_da_dificuldade_maxima() -> None:
    assert xp_da_missao(MissionType.ESPECIAL, DIFICULDADE_DA_ESPECIAL) == 660


@pytest.mark.parametrize("tipo", [MissionType.AVULSA, MissionType.DIARIA])
def test_avulsa_e_diaria_valem_a_curva_da_dificuldade(tipo: MissionType) -> None:
    assert xp_da_missao(tipo, 3) == xp_para_dificuldade(3)


def test_a_dificuldade_da_especial_e_a_maxima_aceita_pela_api() -> None:
    """Duas constantes que precisam ser a mesma: a regra (dominio) e a borda."""
    assert DIFICULDADE_DA_ESPECIAL == DIFICULDADE_MAXIMA
```

- [ ] **Step 3: Rodar e ver reprovar.** Run: `uv run pytest tests/unit/test_cycle_domain.py -q --no-cov` — Expected: erro de coleta, `ModuleNotFoundError: focusquest.modules.missions.cycle_domain`.

- [ ] **Step 4: Acrescentar ao fim de `domain.py`:**

```python
class MissionType(StrEnum):
    """O tipo da missao (spec do ciclo diario, decisao C4).

    A avulsa e a missao do 1a, com prazo proprio. A diaria e a especial nascem
    do plano semanal, e o prazo delas e DERIVADO (C10), nunca gravado. O nome
    e `mission_type`, e nao `kind`, porque `mission_operations.kind` ja existe
    com outro sentido.
    """

    AVULSA = "avulsa"
    DIARIA = "diaria"
    ESPECIAL = "especial"


# C9: a especial esta sempre na dificuldade maxima e vale o triplo dela --
# "o bonus vale o triplo das missoes dificeis", confirmado pelo dono em
# 2026-09-25. A dificuldade e a mesma de `DIFICULDADE_MAXIMA` (a borda, em
# schemas.py); um teste de unidade amarra as duas.
DIFICULDADE_DA_ESPECIAL = 5
MULTIPLICADOR_DA_ESPECIAL = 3


def xp_da_missao(tipo: MissionType, dificuldade: int) -> int:
    """XP da missao, derivado do tipo e da dificuldade -- nunca armazenado (A4)."""
    xp = xp_para_dificuldade(dificuldade)
    if tipo is MissionType.ESPECIAL:
        return xp * MULTIPLICADOR_DA_ESPECIAL
    return xp
```

- [ ] **Step 5: Criar `cycle_domain.py`:**

```python
"""Regras do ciclo diario, independentes de framework e de persistencia.

Spec: `docs/superpowers/specs/2026-09-18-ciclo-diario-design.md`. Tudo aqui e
funcao pura de (plano, conclusoes, instante): nada le o relogio, nada toca o
banco. O estado do ciclo e DERIVADO a cada leitura (decisao C2) -- nao ha job
a meia-noite, e um servidor que ficou fora do ar nao deixa dia por recalcular.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

# C1: o dia e a data civil em Sao Paulo, o mesmo fuso em que a tela apresenta
# (README s8, decisao A3). O `zoneinfo` procura a base do sistema e, sem ela,
# usa o pacote `tzdata`. Nenhum deslocamento fixo e suposto: Sao Paulo ja teve
# horario de verao, e o dia do passado precisa sair certo tambem.
FUSO_DO_CICLO = ZoneInfo("America/Sao_Paulo")

DIAS_DA_SEMANA = 7
# C7: a especial e desbloqueada a cada 7 dias de sequencia.
DIAS_POR_MARCO = 7
# C10: a diaria e a especial cabem num dia (24 h), inclusive na estimativa.
MINUTOS_DO_DIA = 24 * 60

_UM_DIA = timedelta(days=1)


class Availability(StrEnum):
    """A disponibilidade de uma missao, DERIVADA e nunca gravada.

    E diferente do `state` gravado (`pendente`, `em_andamento`, `concluida`),
    que continua existindo: o estado diz o que foi feito; a disponibilidade diz
    o que ainda pode ser feito, e depende do relogio.
    """

    FORA_DO_PLANO = "fora_do_plano"
    BLOQUEADA = "bloqueada"
    DISPONIVEL = "disponivel"
    CONCLUIDA = "concluida"
    PERDIDA = "perdida"
    EXPIRADA = "expirada"


# Onde concluir responde 409 `missao_expirada`: o dia (ou a janela) ja passou,
# ou o dia nem fazia parte do plano. BLOQUEADA nao esta aqui porque nunca chega
# a regra do dia: o que nao foi revelado responde 404 antes (C11).
NAO_CONCLUIVEIS = frozenset(
    {Availability.FORA_DO_PLANO, Availability.PERDIDA, Availability.EXPIRADA}
)


@dataclass(frozen=True)
class DiaDoPlano:
    """O que as regras precisam saber de um dia planejado."""

    concluida: bool
    # A data, em Sao Paulo, em que o plano deste dia foi criado: os dias
    # anteriores a ela sao `fora_do_plano`.
    plano_criado_em: date


# Os dias planejados do usuario, de todas as semanas.
Historico = Mapping[date, DiaDoPlano]


def dia_de(instante: datetime) -> date:
    """A data civil em Sao Paulo de um instante COM fuso."""
    if instante.tzinfo is None:
        raise ValueError("instante sem fuso: o dia do ciclo depende do fuso")
    return instante.astimezone(FUSO_DO_CICLO).date()


def inicio_do_dia(dia: date) -> datetime:
    """A meia-noite que abre o dia em Sao Paulo."""
    return datetime.combine(dia, time.min, tzinfo=FUSO_DO_CICLO)


def fim_do_dia(dia: date) -> datetime:
    """A meia-noite que fecha o dia: o intervalo e semiaberto, e ela ja e do
    dia seguinte. E tambem o prazo derivado da diaria (C10)."""
    return inicio_do_dia(dia + _UM_DIA)


def segunda_da_semana(dia: date) -> date:
    """A segunda-feira que abre a semana do dia (C1)."""
    return dia - timedelta(days=dia.weekday())


def dias_da_semana(segunda: date) -> list[date]:
    return [segunda + timedelta(days=indice) for indice in range(DIAS_DA_SEMANA)]


def disponibilidade_da_diaria(
    dia: date, estado: DiaDoPlano, hoje: date
) -> Availability:
    """A tabela "Estado de disponibilidade" da spec.

    `concluida` vem primeiro: uma diaria feita continua feita em qualquer dia,
    e e isso que faz o reenvio depois da meia-noite nao virar `perdida`.
    """
    if estado.concluida:
        return Availability.CONCLUIDA
    if dia < estado.plano_criado_em:
        return Availability.FORA_DO_PLANO
    if dia > hoje:
        return Availability.BLOQUEADA
    if dia == hoje:
        return Availability.DISPONIVEL
    return Availability.PERDIDA


def sequencia_ate(historico: Historico, dia: date) -> int:
    """Dias seguidos com a diaria concluida, contando de `dia` para tras.

    Dia sem plano e dia `fora_do_plano` sao pulados, sem somar e sem parar
    (C6): sem missao, o usuario nao deixou de fazer nada. Qualquer outro dia
    para a contagem (B1(a): a sequencia e um contador de habito).
    """
    if not historico:
        return 0
    primeiro = min(historico)
    contagem = 0
    while dia >= primeiro:
        estado = historico.get(dia)
        if estado is not None and dia >= estado.plano_criado_em:
            if not estado.concluida:
                break
            contagem += 1
        dia -= _UM_DIA
    return contagem


def sequencia(historico: Historico, hoje: date) -> int:
    """A sequencia atual: comeca hoje, se a diaria de hoje foi concluida, ou
    ontem, se ela ainda esta em aberto -- o dia de hoje nao quebra nada antes
    de terminar."""
    estado = historico.get(hoje)
    if estado is not None and estado.concluida:
        return sequencia_ate(historico, hoje)
    return sequencia_ate(historico, hoje - _UM_DIA)


def dias_para_o_marco(sequencia_atual: int) -> int:
    """Quantos dias faltam para o proximo marco; 7 quando a sequencia e zero
    ou acabou de bater um marco."""
    return DIAS_POR_MARCO - sequencia_atual % DIAS_POR_MARCO


def marco_da_semana(historico: Historico, segunda: date) -> date | None:
    """O dia da semana em que a sequencia bateu um multiplo de 7, se houve.

    Cada semana tem no maximo um marco (C7): dois multiplos de 7 da mesma
    sequencia ficam 7 dias um do outro.
    """
    for dia in dias_da_semana(segunda):
        estado = historico.get(dia)
        if (
            estado is not None
            and estado.concluida
            and sequencia_ate(historico, dia) % DIAS_POR_MARCO == 0
        ):
            return dia
    return None


def marco_mais_recente(historico: Historico, hoje: date) -> date | None:
    """O marco da semana atual ou, sem ele, o da semana anterior.

    Mais para tras nao precisa: a janela da especial acaba no fim do dia
    seguinte ao marco, e o marco mais tardio da semana anterior (o domingo)
    ainda tem a janela aberta na segunda.
    """
    segunda = segunda_da_semana(hoje)
    atual = marco_da_semana(historico, segunda)
    if atual is not None:
        return atual
    return marco_da_semana(historico, segunda - timedelta(days=DIAS_DA_SEMANA))


def fim_da_janela_da_especial(marco: date) -> datetime:
    """C8: a especial fica disponivel do marco ate o fim do dia seguinte. E
    tambem o prazo derivado da especial."""
    return fim_do_dia(marco + _UM_DIA)


def disponibilidade_da_especial(
    marco: date | None, concluida: bool, agora: datetime
) -> Availability:
    """A tabela "Missao especial" da spec."""
    if concluida:
        return Availability.CONCLUIDA
    if marco is None:
        return Availability.BLOQUEADA
    if agora < fim_da_janela_da_especial(marco):
        return Availability.DISPONIVEL
    return Availability.EXPIRADA
```

- [ ] **Step 6: Rodar e ver passar.** Run: `uv run pytest tests/unit/test_cycle_domain.py -q --no-cov` — Expected: todos verdes.

- [ ] **Step 7: Mutações (restaurar cada uma depois).** Registrar no relatório qual teste reprovou:
  1. `dia_de`: trocar `FUSO_DO_CICLO` por `UTC` → `test_o_dia_e_a_data_civil_em_sao_paulo` reprova.
  2. `disponibilidade_da_diaria`: mover o `if estado.concluida` para o fim → reprova o caso `(QUARTA, True, ...)`? (não: quarta == hoje devolveria DISPONIVEL) → reprova.
  3. `sequencia_ate`: trocar `dia >= estado.plano_criado_em` por `True` → `test_dia_fora_do_plano_nao_conta_nem_quebra` reprova.
  4. `sequencia`: sempre começar em `hoje` → `test_a_diaria_de_hoje_em_aberto_nao_quebra` reprova.
  5. `marco_mais_recente`: devolver só `atual` → `test_marco_mais_recente_da_semana_anterior` reprova.
  6. `disponibilidade_da_especial`: `<` por `<=` → a borda reprova.
  7. `xp_da_missao`: sem o multiplicador → reprova o 660.

- [ ] **Step 8: Gate e commit.** Run: `make check` — Expected: EXIT 0 (cobertura 100%: todo ramo do domínio tem caso).

```bash
git add pyproject.toml uv.lock src/focusquest/modules/missions/domain.py src/focusquest/modules/missions/cycle_domain.py tests/unit/test_cycle_domain.py
git commit -m "feat(ciclo): regras puras do dia, da sequencia e da especial

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migração 0003 e modelos

**Files:**
- Create: `alembic/versions/0003_ciclo_diario.py`
- Modify: `src/focusquest/modules/missions/models.py`
- Modify: `src/focusquest/modules/missions/service.py:70-78` (`criar_missao` passa `mission_type=MissionType.AVULSA`)
- Modify: `tests/integration/test_missions_models.py` (`_missao` e o teste de divergência), `tests/integration/test_missions_api.py:169`, `tests/integration/test_tutoring_models.py:77` (acrescentar `mission_type=MissionType.AVULSA` a cada `Mission(...)`)
- Modify: `tests/integration/test_migrations.py`
- Create: `src/focusquest/modules/missions/cycle_service.py` — **só** `MissaoLida`, `dia_da_diaria` e `leitura_da_avulsa` (a Task 3 acrescenta o resto ao mesmo arquivo)
- Modify: `src/focusquest/modules/tutoring/context.py:46` (prazo por `leitura_da_avulsa`)
- Test: `tests/integration/test_cycle_models.py`, `tests/unit/test_cycle_invariantes.py`

> **Por que três peças do serviço entram aqui (ruling do controlador, 2026-09-25):** com `Mission.deadline: Mapped[datetime | None]`, o `missao.deadline.isoformat()` de `tutoring/context.py` reprova o mypy estrito, e o `make check` desta Task tem de passar. `leitura_da_avulsa` é a forma tipada de ler o prazo da avulsa, e ela precisa de `MissaoLida`. O código delas é o da Task 3, Step 4 (as definições de `MissaoLida`, `dia_da_diaria` e `leitura_da_avulsa`, com o cabeçalho do módulo e só os imports que elas usam), e os testes são os de `tests/unit/test_cycle_invariantes.py`, na Task 3, Step 2 — copie-os de lá.

**Interfaces:**
- Consumes: `MissionType` (Task 1).
- Produces: `models.WeeklyPlan` (`id`, `user_id`, `week_start: date`, `created_at: datetime`); `Mission.mission_type: MissionType`, `Mission.plan_id: int | None`, `Mission.day: date | None`, `Mission.deadline: datetime | None`. Nomes de restrição (os testes os afirmam): `ck_weekly_plans_week_start_segunda`, `uq_weekly_plans_user_id_week_start`, `uq_weekly_plans_id_user_id`, `ck_missions_mission_type`, `ck_missions_plano_do_tipo`, `ck_missions_dia_do_tipo`, `ck_missions_prazo_do_tipo`, `ck_missions_dificuldade_da_especial`, `ck_missions_estimativa_do_ciclo`, `fk_missions_plano_do_usuario`, `uq_missions_plan_id_day`, `uq_missions_especial_por_plano`.

- [ ] **Step 1: Testes de restrição que reprovam.** Criar `tests/integration/test_cycle_models.py`:

```python
"""As restricoes do ciclo, no BANCO: cada teste afirma o NOME da restricao.

Mesmo motivo de `test_missions_models.py`: `IntegrityError` sozinho tambem
seria levantado por um NOT NULL esquecido, e o teste passaria provando outra
coisa. Cada caso viola UMA restricao so -- o PostgreSQL relata so uma.
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission, WeeklyPlan

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
CRIADO_EM = datetime(2026, 9, 21, 15, tzinfo=UTC)


def _plano(session: Session, user_id: int = ESTUDANTE, semana: date = SEGUNDA) -> WeeklyPlan:
    plano = WeeklyPlan(user_id=user_id, week_start=semana, created_at=CRIADO_EM)
    session.add(plano)
    session.flush()
    return plano


def _missao(**campos: object) -> Mission:
    base: dict[str, object] = {
        "user_id": ESTUDANTE,
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo entregue",
        "difficulty": 3,
        "estimated_minutes": 60,
        "state": MissionState.PENDENTE,
    }
    base.update(campos)
    return Mission(**base)


def _diaria(plano: WeeklyPlan, dia: date = SEGUNDA, **campos: object) -> Mission:
    return _missao(
        mission_type=MissionType.DIARIA, plan_id=plano.id, day=dia, deadline=None, **campos
    )


def _recusa(session: Session, restricao: str) -> None:
    with pytest.raises(IntegrityError) as erro:
        session.flush()
    assert restricao in str(erro.value.orig)


def test_o_plano_comeca_numa_segunda(session: Session) -> None:
    session.add(WeeklyPlan(user_id=ESTUDANTE, week_start=SEGUNDA + timedelta(days=1), created_at=CRIADO_EM))
    _recusa(session, "ck_weekly_plans_week_start_segunda")


def test_um_plano_por_semana(session: Session) -> None:
    _plano(session)
    session.add(WeeklyPlan(user_id=ESTUDANTE, week_start=SEGUNDA, created_at=CRIADO_EM))
    _recusa(session, "uq_weekly_plans_user_id_week_start")


def test_tipo_invalido_e_recusado(session: Session) -> None:
    with pytest.raises(IntegrityError) as erro:
        session.execute(
            text(
                "INSERT INTO missions (user_id, instructions, completion_criterion, "
                "difficulty, estimated_minutes, deadline, state, mission_type) VALUES "
                "(1, 'x', 'y', 1, 30, now(), 'pendente', 'semanal')"
            )
        )
    assert "ck_missions_mission_type" in str(erro.value.orig)


def test_avulsa_sem_plano_e_aceita(session: Session) -> None:
    """A metade da FK composta que MATCH SIMPLE deixa passar."""
    session.add(_missao(mission_type=MissionType.AVULSA, deadline=CRIADO_EM))
    session.flush()


def test_avulsa_com_plano_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(_missao(mission_type=MissionType.AVULSA, plan_id=plano.id, deadline=CRIADO_EM))
    _recusa(session, "ck_missions_plano_do_tipo")


def test_diaria_sem_plano_e_recusada(session: Session) -> None:
    session.add(_missao(mission_type=MissionType.DIARIA, day=SEGUNDA, deadline=None))
    _recusa(session, "ck_missions_plano_do_tipo")


def test_diaria_sem_dia_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(_diaria(plano, dia=None))  # type: ignore[arg-type]
    _recusa(session, "ck_missions_dia_do_tipo")


def test_avulsa_com_dia_e_recusada(session: Session) -> None:
    session.add(_missao(mission_type=MissionType.AVULSA, day=SEGUNDA, deadline=CRIADO_EM))
    _recusa(session, "ck_missions_dia_do_tipo")


def test_diaria_com_prazo_gravado_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(_missao(mission_type=MissionType.DIARIA, plan_id=plano.id, day=SEGUNDA, deadline=CRIADO_EM))
    _recusa(session, "ck_missions_prazo_do_tipo")


def test_avulsa_sem_prazo_e_recusada(session: Session) -> None:
    session.add(_missao(mission_type=MissionType.AVULSA, deadline=None))
    _recusa(session, "ck_missions_prazo_do_tipo")


def test_especial_abaixo_da_dificuldade_maxima_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(_missao(mission_type=MissionType.ESPECIAL, plan_id=plano.id, difficulty=4, deadline=None))
    _recusa(session, "ck_missions_dificuldade_da_especial")


def test_diaria_acima_de_um_dia_de_estimativa_e_recusada(session: Session) -> None:
    plano = _plano(session)
    session.add(_diaria(plano, estimated_minutes=1441))
    _recusa(session, "ck_missions_estimativa_do_ciclo")


def test_duas_diarias_no_mesmo_dia_sao_recusadas(session: Session) -> None:
    plano = _plano(session)
    session.add(_diaria(plano))
    session.flush()
    session.add(_diaria(plano))
    _recusa(session, "uq_missions_plan_id_day")


def test_duas_especiais_no_mesmo_plano_sao_recusadas(session: Session) -> None:
    plano = _plano(session)
    for _ in range(2):
        session.add(_missao(mission_type=MissionType.ESPECIAL, plan_id=plano.id, difficulty=5, deadline=None))
    _recusa(session, "uq_missions_especial_por_plano")


def test_diaria_de_outro_usuario_no_plano_e_recusada(session: Session) -> None:
    """A outra metade da FK composta: o banco impede a missao de um usuario no
    plano de outro."""
    session.execute(text("INSERT INTO users (id, display_name) VALUES (2, 'Outro')"))
    plano = _plano(session)
    session.add(_diaria(plano, user_id=2))
    _recusa(session, "fk_missions_plano_do_usuario")
```

- [ ] **Step 2: Rodar e ver reprovar.** Run: `uv run pytest tests/integration/test_cycle_models.py -q --no-cov` — Expected: `ImportError` (`WeeklyPlan`).

- [ ] **Step 3: Migração.** Criar `alembic/versions/0003_ciclo_diario.py`:

```python
"""Ciclo diario: weekly_plans e o tipo, o plano e o dia da missao.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Copia congelada, NAO import de MissionType: migracao e historico (ver 0001).
TIPOS = ("avulsa", "diaria", "especial")
_TIPOS_SQL = ", ".join(f"'{tipo}'" for tipo in TIPOS)

# As regras que amarram tipo, plano, dia e prazo (spec, "Modelo de dados").
# Com `mission_type` NOT NULL, nenhuma igualdade abaixo da desconhecido -- e
# um CHECK aprova o desconhecido, o que tornaria cada uma inutil.
CHECKS = (
    ("ck_missions_mission_type", f"mission_type IN ({_TIPOS_SQL})"),
    ("ck_missions_plano_do_tipo", "(mission_type = 'avulsa') = (plan_id IS NULL)"),
    ("ck_missions_dia_do_tipo", "(mission_type = 'diaria') = (day IS NOT NULL)"),
    ("ck_missions_prazo_do_tipo", "(mission_type = 'avulsa') = (deadline IS NOT NULL)"),
    ("ck_missions_dificuldade_da_especial", "mission_type <> 'especial' OR difficulty = 5"),
    ("ck_missions_estimativa_do_ciclo", "mission_type = 'avulsa' OR estimated_minutes <= 1440"),
)


def upgrade() -> None:
    op.create_table(
        "weekly_plans",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("week_start", sa.Date, nullable=False),
        # Sem server_default: o instante vem do relogio injetavel, porque e
        # entrada da regra `fora_do_plano` (decisao P4 do plano do B).
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "week_start", name="uq_weekly_plans_user_id_week_start"),
        # Alvo da FK composta de `missions`: sem ele, o PostgreSQL recusa uma
        # FK para (id, user_id), que nao seria unico por si.
        sa.UniqueConstraint("id", "user_id", name="uq_weekly_plans_id_user_id"),
        sa.CheckConstraint(
            "EXTRACT(ISODOW FROM week_start) = 1", name="ck_weekly_plans_week_start_segunda"
        ),
    )

    # As missoes que ja existem sao do 1a: viram `avulsa`. O server_default so
    # serve ao preenchimento e sai em seguida -- quem cria missao passa o tipo.
    op.add_column(
        "missions",
        sa.Column("mission_type", sa.Text, nullable=False, server_default="avulsa"),
    )
    op.alter_column("missions", "mission_type", server_default=None)
    op.add_column("missions", sa.Column("plan_id", sa.Integer, nullable=True))
    op.add_column("missions", sa.Column("day", sa.Date, nullable=True))
    # O prazo da diaria e da especial e derivado (C10), entao a coluna aceita
    # nulo -- e o CHECK `ck_missions_prazo_do_tipo` exige que so elas o usem.
    op.alter_column("missions", "deadline", nullable=True)

    # MATCH SIMPLE (o padrao): com `plan_id` nulo, a FK nao e verificada, e e
    # isso que deixa a avulsa passar. MATCH FULL recusaria toda avulsa.
    op.create_foreign_key(
        "fk_missions_plano_do_usuario",
        "missions",
        "weekly_plans",
        ["plan_id", "user_id"],
        ["id", "user_id"],
    )
    for nome, condicao in CHECKS:
        op.create_check_constraint(nome, "missions", condicao)
    # Nulos nao colidem: a especial (dia nulo) convive com esta restricao.
    op.create_unique_constraint("uq_missions_plan_id_day", "missions", ["plan_id", "day"])
    op.create_index(
        "uq_missions_especial_por_plano",
        "missions",
        ["plan_id"],
        unique=True,
        postgresql_where=sa.text("mission_type = 'especial'"),
    )


def downgrade() -> None:
    """Destrutivo por natureza: diaria e especial nao tem prazo gravado, e o
    esquema da 0002 exige um. Falha ALTO em vez de inventar prazo."""
    do_ciclo = (
        op.get_bind()
        .execute(sa.text("SELECT count(*) FROM missions WHERE mission_type <> 'avulsa'"))
        .scalar_one()
    )
    if do_ciclo:
        raise RuntimeError(
            f"downgrade da 0003 recusado: {do_ciclo} missao(oes) do ciclo "
            "(diaria ou especial) nao cabem no esquema da 0002, que exige prazo; "
            "apague-as de proposito antes de voltar"
        )
    op.drop_index("uq_missions_especial_por_plano", table_name="missions")
    op.drop_constraint("uq_missions_plan_id_day", "missions", type_="unique")
    for nome, _ in reversed(CHECKS):
        op.drop_constraint(nome, "missions", type_="check")
    op.drop_constraint("fk_missions_plano_do_usuario", "missions", type_="foreignkey")
    op.alter_column("missions", "deadline", nullable=False)
    op.drop_column("missions", "day")
    op.drop_column("missions", "plan_id")
    op.drop_column("missions", "mission_type")
    op.drop_table("weekly_plans")
```

- [ ] **Step 4: Modelos.** Em `models.py`:
  - imports: acrescentar `from datetime import date, datetime`, e `Date`, `ForeignKeyConstraint`, `text` ao import de `sqlalchemy`; `from focusquest.modules.missions.domain import MissionState, MissionType`.
  - acrescentar, depois de `_ESTADOS_SQL`: `_TIPOS_SQL = ", ".join(f"'{tipo.value}'" for tipo in MissionType)` com o mesmo comentário de "o modelo DESCREVE a tabela de hoje".
  - acrescentar, depois de `MissionStateText`:

```python
class MissionTypeText(TypeDecorator[MissionType]):
    """TEXT no banco, MissionType no Python -- mesmo motivo de MissionStateText."""

    impl = Text
    cache_ok = True

    def process_result_value(self, value: Any, dialect: Dialect) -> MissionType:
        return MissionType(value)


class WeeklyPlan(Base):
    """O plano de uma semana: 7 diarias e 1 especial (spec, C3).

    Que o plano tem os 7 dias, e que o dia de cada diaria cai na semana dele,
    e garantido SO pelo servico (`cycle_service.criar_plano`), e esta
    declarado assim na spec: nenhuma restricao do banco o expressa.
    """

    __tablename__ = "weekly_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    week_start: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("user_id", "week_start", name="uq_weekly_plans_user_id_week_start"),
        UniqueConstraint("id", "user_id", name="uq_weekly_plans_id_user_id"),
        CheckConstraint(
            "EXTRACT(ISODOW FROM week_start) = 1", name="ck_weekly_plans_week_start_segunda"
        ),
    )
```

  - em `Mission`: trocar `deadline` para `Mapped[datetime | None] = mapped_column(DateTime(timezone=True))` e acrescentar, depois de `estimated_minutes`:

```python
    # O tipo e passado por quem cria (sem default no modelo nem no banco),
    # pelo mesmo motivo do `state` explicito em `criar_missao`.
    mission_type: Mapped[MissionType] = mapped_column(MissionTypeText)
    plan_id: Mapped[int | None] = mapped_column(Integer, default=None)
    day: Mapped[date | None] = mapped_column(Date, default=None)
```

  - acrescentar ao fim de `Mission.__table_args__` (antes do `Index` existente ou depois, tanto faz), com os MESMOS textos da migração:

```python
        CheckConstraint(f"mission_type IN ({_TIPOS_SQL})", name="ck_missions_mission_type"),
        CheckConstraint(
            "(mission_type = 'avulsa') = (plan_id IS NULL)", name="ck_missions_plano_do_tipo"
        ),
        CheckConstraint(
            "(mission_type = 'diaria') = (day IS NOT NULL)", name="ck_missions_dia_do_tipo"
        ),
        CheckConstraint(
            "(mission_type = 'avulsa') = (deadline IS NOT NULL)", name="ck_missions_prazo_do_tipo"
        ),
        CheckConstraint(
            "mission_type <> 'especial' OR difficulty = 5",
            name="ck_missions_dificuldade_da_especial",
        ),
        CheckConstraint(
            "mission_type = 'avulsa' OR estimated_minutes <= 1440",
            name="ck_missions_estimativa_do_ciclo",
        ),
        ForeignKeyConstraint(
            ["plan_id", "user_id"],
            ["weekly_plans.id", "weekly_plans.user_id"],
            name="fk_missions_plano_do_usuario",
        ),
        UniqueConstraint("plan_id", "day", name="uq_missions_plan_id_day"),
        Index(
            "uq_missions_especial_por_plano",
            "plan_id",
            unique=True,
            postgresql_where=text("mission_type = 'especial'"),
        ),
```

- [ ] **Step 5: `criar_missao`** — acrescentar `mission_type=MissionType.AVULSA,` ao `Mission(...)` de `service.py` (e o import). Nos quatro `Mission(...)` de teste listados em **Files**, acrescentar `mission_type=MissionType.AVULSA` (no `_missao` de `test_missions_models.py`, como chave de `base`).

- [ ] **Step 5b: As três peças do serviço e o prazo da tutoria.** Criar `cycle_service.py` com `MissaoLida`, `dia_da_diaria` e `leitura_da_avulsa` (texto da Task 3, Step 4) e `tests/unit/test_cycle_invariantes.py` (texto da Task 3, Step 2). Em `tutoring/context.py`, a linha do prazo passa a `f"- #{missao.id}: {missao.instructions} (prazo {leitura_da_avulsa(missao).deadline.isoformat()})"` (import de `leitura_da_avulsa`). Mutação: `leitura_da_avulsa` sempre `DISPONIVEL` → o teste parametrizado reprova.

- [ ] **Step 6: Divergência modelo × migração.** Em `test_missions_models.py`, no `test_o_modelo_descreve_os_mesmos_checks_que_a_migracao_criou`: acrescentar `Mission.metadata.tables["weekly_plans"].to_metadata(metadados)` (alvo da FK composta) e, depois do `espelho.indexes.clear()`:

```python
    # Restricao UNIQUE nasce com um indice de mesmo nome, e nome de indice e
    # unico por schema: `uq_missions_plan_id_day` colidiria com o da tabela
    # real. Este teste compara so os CHECK (pendencia 9); os UNIQUE, o indice
    # parcial e a FK composta sao provados pelos testes de recusa nomeada de
    # `test_cycle_models.py`.
    for restricao in [r for r in espelho.constraints if isinstance(r, UniqueConstraint)]:
        espelho.constraints.remove(restricao)
```

E acrescentar o teste irmão para `weekly_plans`:

```python
def test_o_modelo_de_weekly_plans_descreve_os_checks_da_migracao(session: Session) -> None:
    """O mesmo espelho, para a tabela nova: o CHECK da segunda-feira."""
    metadados = MetaData()
    Mission.metadata.tables["users"].to_metadata(metadados)
    espelho = Mission.metadata.tables["weekly_plans"].to_metadata(
        metadados, name="weekly_plans_espelho_do_modelo"
    )
    for restricao in [r for r in espelho.constraints if isinstance(r, UniqueConstraint)]:
        espelho.constraints.remove(restricao)
    espelho.create(session.connection())

    assert _checks_do_postgres(session, "weekly_plans_espelho_do_modelo") == _checks_do_postgres(
        session, "weekly_plans"
    )
```

(import: `from sqlalchemy import UniqueConstraint`.)

- [ ] **Step 7: Migração em `test_migrations.py`.**
  - `TABELAS_DA_MIGRACAO` passa a incluir `"weekly_plans"`, e `test_migracao_aplica_em_banco_vazio` passa a exigir `"weekly_plans"`. **Atenção:** `test_downgrade_da_0002_leva_so_a_tutoria` volta à 0001 e afirma `tabelas >= TABELAS_DA_MIGRACAO`; `weekly_plans` some junto (é da 0003). Troque, nesse teste, a asserção por `tabelas >= {"users", "missions", "mission_operations"}`.
  - Acrescentar (imports: `datetime`, `UTC`, `Session`, `delete`, `WeeklyPlan`, `Mission`, `MissionType`, `MissionState`):

```python
def test_a_0003_transforma_as_missoes_existentes_em_avulsas(banco_migrado: Engine) -> None:
    """A linha do 1a atravessa a 0003 como avulsa, com plano e dia nulos."""
    command.downgrade(alembic_config(), "0002")
    try:
        with banco_migrado.begin() as conexao:
            conexao.execute(
                text(
                    "INSERT INTO missions (user_id, instructions, completion_criterion, "
                    "difficulty, estimated_minutes, deadline) VALUES "
                    "(1, 'da 0002', 'y', 1, 30, now())"
                )
            )
        command.upgrade(alembic_config(), "head")
        with banco_migrado.connect() as conexao:
            linha = conexao.execute(
                text("SELECT mission_type, plan_id, day FROM missions WHERE instructions = 'da 0002'")
            ).one()
        assert tuple(linha) == ("avulsa", None, None)
    finally:
        command.upgrade(alembic_config(), "head")
        with banco_migrado.begin() as conexao:
            conexao.execute(text("DELETE FROM missions WHERE instructions = 'da 0002'"))


def test_o_downgrade_da_0003_recusa_quando_existe_diaria(banco_migrado: Engine) -> None:
    """Falha ALTO, e a transacao do Alembic desfaz tudo: o esquema continua em head."""
    with Session(bind=banco_migrado) as sessao:
        plano = WeeklyPlan(user_id=1, week_start=date(2026, 9, 21), created_at=datetime(2026, 9, 21, 15, tzinfo=UTC))
        sessao.add(plano)
        sessao.flush()
        sessao.add(
            Mission(
                user_id=1, instructions="diaria do downgrade", completion_criterion="y",
                difficulty=1, estimated_minutes=30, state=MissionState.PENDENTE,
                mission_type=MissionType.DIARIA, plan_id=plano.id, day=date(2026, 9, 21),
                deadline=None,
            )
        )
        sessao.commit()
        plano_id = plano.id
    try:
        with pytest.raises(RuntimeError, match="downgrade da 0003 recusado"):
            command.downgrade(alembic_config(), "0002")
        assert "weekly_plans" in inspect(banco_migrado).get_table_names()
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(delete(Mission).where(Mission.plan_id == plano_id))
            sessao.execute(delete(WeeklyPlan).where(WeeklyPlan.id == plano_id))
            sessao.commit()


def test_o_downgrade_da_0003_leva_so_o_ciclo(banco_migrado: Engine) -> None:
    command.downgrade(alembic_config(), "0002")
    try:
        tabelas = set(inspect(banco_migrado).get_table_names())
        colunas = {c["name"] for c in inspect(banco_migrado).get_columns("missions")}
        assert "weekly_plans" not in tabelas
        assert {"tutor_messages", "tutor_actions", "missions"} <= tabelas
        assert not ({"mission_type", "plan_id", "day"} & colunas)
    finally:
        command.upgrade(alembic_config(), "head")
```

- [ ] **Step 8: Rodar.** Run: `uv run pytest tests/integration -q --no-cov` — Expected: tudo verde (o banco de teste é recriado pela fixture).

- [ ] **Step 9: Mutações (restaurar cada uma).**
  1. Na migração, `MATCH FULL` na FK (`match="FULL"` no `create_foreign_key`) → `test_avulsa_sem_plano_e_aceita` reprova.
  2. Remover `op.alter_column("missions", "mission_type", server_default=None)` → nenhum teste de recusa pega; **o de divergência não compara default**. Registre no relatório como limitação (não é CHECK) e acrescente o teste abaixo, que a pega:

```python
def test_a_missao_sem_tipo_e_recusada_pelo_banco(session: Session) -> None:
    """O server_default da 0003 serviu so ao preenchimento: sem tipo, NOT NULL."""
    with pytest.raises(IntegrityError) as erro:
        session.execute(
            text(
                "INSERT INTO missions (user_id, instructions, completion_criterion, "
                "difficulty, estimated_minutes, deadline, state) VALUES "
                "(1, 'x', 'y', 1, 30, now(), 'pendente')"
            )
        )
    assert "mission_type" in str(erro.value.orig)
```
  (no `test_cycle_models.py`). Rodar a mutação de novo e ver este reprovar.
  3. No modelo, trocar `difficulty = 5` por `difficulty = 4` no CHECK da especial → o teste de divergência reprova.
  4. Remover o `raise` do downgrade → `test_o_downgrade_da_0003_recusa_quando_existe_diaria` reprova (o `alter_column ... nullable=False` estoura com outro erro, ou o `pytest.raises(match=...)` não casa).

- [ ] **Step 10: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add alembic/versions/0003_ciclo_diario.py src/focusquest/modules/missions/models.py src/focusquest/modules/missions/service.py tests/
git commit -m "feat(ciclo): migracao 0003 com plano semanal e tipo da missao

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Serviço do ciclo — criar o plano e ler

**Files:**
- Modify: `src/focusquest/modules/missions/cycle_service.py` (criado na Task 2 com `MissaoLida`, `dia_da_diaria` e `leitura_da_avulsa`; esta Task acrescenta o resto do Step 4)
- Modify: `src/focusquest/core/errors.py` (três erros novos)
- Test: `tests/integration/test_cycle_service.py` (o `tests/unit/test_cycle_invariantes.py` do Step 2 **já existe** desde a Task 2 — não o recrie)

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces:
  - `core.errors.PlanoExistenteError`, `SemanaEncerradaError`, `SemanaDistanteError` (subclasses de `DomainError`).
  - `cycle_service.NovaDiaria(instructions, completion_criterion, difficulty, estimated_minutes)`, `NovaEspecial(instructions, completion_criterion, estimated_minutes)`, `MissaoLida(missao: Mission, deadline: datetime, availability: Availability)`, `DiaLido(dia, availability, missao: MissaoLida | None)`, `EspecialLida(availability, progresso: int, missao: MissaoLida | None)`, `PlanoLido(semana: date, dias: list[DiaLido], especial: EspecialLida)`, `CicloLido(hoje, missao: MissaoLida | None, sequencia, dias_para_o_marco, especial: MissaoLida | None)`.
  - `criar_plano(session, *, user_id, semana, diarias, especial, clock) -> PlanoLido`; `ler_plano_atual(session, user_id, *, clock) -> PlanoLido | None`; `ler_ciclo(session, user_id, *, clock) -> CicloLido`; `ler_missao(session, missao, agora) -> MissaoLida` (levanta `MissaoNaoEncontradaError` para o não revelado); `leitura_da_avulsa(missao) -> MissaoLida`; `dia_da_diaria(missao) -> date`; `carregar_historico(session, user_id) -> dict[date, DiaDoPlano]`.

- [ ] **Step 1: Erros.** Acrescentar a `core/errors.py`:

```python
class MissaoExpiradaError(DomainError):
    """O dia (ou a janela) da missao ja passou -- ou o dia nem era do plano.

    A requisicao esta correta; e o relogio que recusa. Nao ha o que repetir.
    """


class PlanoExistenteError(DomainError):
    """Ja existe plano para esta semana. O reenvio da criacao cai aqui, e nao
    num plano duplicado: o cliente confirma com `GET /api/plans/current`."""


class SemanaEncerradaError(DomainError):
    """A semana pedida ja terminou: nao ha dia nela que ainda possa ser feito."""


class SemanaDistanteError(DomainError):
    """A semana pedida fica alem da seguinte a atual.

    Alem de reduzir o que da para esconder, e o que impede o 500 de uma semana
    no ano 9999, em que o fim do domingo estouraria o `datetime`.
    """
```

(`MissaoExpiradaError` entra aqui e é usado na Task 4.)

- [ ] **Step 2: Testes que reprovam.** Criar `tests/integration/test_cycle_service.py`:

```python
"""Os casos de uso do ciclo contra PostgreSQL real, com relogio fixo."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.errors import (
    MissaoNaoEncontradaError,
    PlanoExistenteError,
    SemanaDistanteError,
    SemanaEncerradaError,
)
from focusquest.modules.missions.cycle_domain import Availability, fim_do_dia
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    PlanoLido,
    criar_plano,
    ler_ciclo,
    ler_missao,
    ler_plano_atual,
)
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission, WeeklyPlan
from focusquest.modules.missions.service import concluir_missao

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
UMA_SEMANA = timedelta(days=7)


def ao_meio_dia(dia: date) -> datetime:
    """12:00 em Sao Paulo (15:00 UTC; SP nao tem horario de verao desde 2019)."""
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


QUARTA_MEIO_DIA = ao_meio_dia(SEGUNDA + timedelta(days=2))


def relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


def _diarias(quantas: int = 7) -> list[NovaDiaria]:
    return [
        NovaDiaria(f"Diaria {i}", f"Criterio {i}", difficulty=2, estimated_minutes=30)
        for i in range(quantas)
    ]


ESPECIAL = NovaEspecial("Prova simulada", "Nota registrada", estimated_minutes=120)


def _criar(session: Session, semana: date = SEGUNDA, agora: datetime = QUARTA_MEIO_DIA) -> PlanoLido:
    return criar_plano(
        session, user_id=ESTUDANTE, semana=semana, diarias=_diarias(), especial=ESPECIAL,
        clock=relogio(agora),
    )


def _diaria_do_dia(session: Session, dia: date) -> Mission:
    return session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.DIARIA, Mission.day == dia)
    ).one()


def _concluir_no_dia(session: Session, dia: date) -> None:
    concluir_missao(
        session, ESTUDANTE, _diaria_do_dia(session, dia).id, f"op-{dia}",
        clock=relogio(ao_meio_dia(dia)),
    )


def test_criar_grava_sete_diarias_e_uma_especial(session: Session) -> None:
    _criar(session)
    plano = session.scalars(select(WeeklyPlan)).one()
    missoes = session.scalars(select(Mission).where(Mission.plan_id == plano.id)).all()

    assert plano.created_at == QUARTA_MEIO_DIA
    diarias = sorted((m for m in missoes if m.mission_type is MissionType.DIARIA), key=lambda m: m.day or SEGUNDA)
    assert [m.day for m in diarias] == [SEGUNDA + timedelta(days=i) for i in range(7)]
    (especial,) = [m for m in missoes if m.mission_type is MissionType.ESPECIAL]
    assert especial.difficulty == 5
    assert especial.day is None
    assert all(m.deadline is None and m.state is MissionState.PENDENTE for m in missoes)


def test_o_plano_lido_revela_so_ate_hoje(session: Session) -> None:
    """Criado na quarta: segunda e terca `fora_do_plano` COM conteudo, quarta
    disponivel, quinta a domingo como bau fechado (sem missao)."""
    lido = _criar(session)

    assert [d.availability for d in lido.dias] == [
        Availability.FORA_DO_PLANO, Availability.FORA_DO_PLANO, Availability.DISPONIVEL,
        Availability.BLOQUEADA, Availability.BLOQUEADA, Availability.BLOQUEADA, Availability.BLOQUEADA,
    ]
    assert all(d.missao is not None for d in lido.dias[:3])
    assert all(d.missao is None for d in lido.dias[3:])
    quarta = lido.dias[2].missao
    assert quarta is not None
    assert quarta.deadline == fim_do_dia(SEGUNDA + timedelta(days=2))
    assert lido.especial.availability is Availability.BLOQUEADA
    assert lido.especial.missao is None
    assert lido.especial.progresso == 0


def test_plano_da_semana_seguinte_vem_todo_fechado(session: Session) -> None:
    lido = _criar(session, semana=SEGUNDA + UMA_SEMANA)
    assert all(d.availability is Availability.BLOQUEADA and d.missao is None for d in lido.dias)


def test_semana_alem_da_seguinte_e_distante(session: Session) -> None:
    with pytest.raises(SemanaDistanteError):
        _criar(session, semana=SEGUNDA + 2 * UMA_SEMANA)


def test_semana_passada_esta_encerrada(session: Session) -> None:
    with pytest.raises(SemanaEncerradaError):
        _criar(session, semana=SEGUNDA - UMA_SEMANA)


@pytest.mark.parametrize(
    ("agora", "aceita"),
    [
        # Domingo 27, 23:59:59 em SP: a semana de 21 ainda esta aberta.
        (datetime(2026, 9, 28, 2, 59, 59, tzinfo=UTC), True),
        # Segunda 28, 00:00 em SP: acabou.
        (datetime(2026, 9, 28, 3, 0, 0, tzinfo=UTC), False),
    ],
)
def test_a_semana_encerra_na_meia_noite_de_domingo(session: Session, agora: datetime, aceita: bool) -> None:
    if aceita:
        _criar(session, agora=agora)
    else:
        with pytest.raises(SemanaEncerradaError):
            _criar(session, agora=agora)


def test_plano_repetido_e_recusado(session: Session) -> None:
    _criar(session)
    with pytest.raises(PlanoExistenteError):
        _criar(session)


def test_outra_violacao_nao_e_traduzida_como_plano_existente(session: Session) -> None:
    """Uma terca viola o CHECK da segunda-feira, e nao a UNIQUE: o erro sobe cru."""
    with pytest.raises(IntegrityError) as erro:
        _criar(session, semana=SEGUNDA + timedelta(days=1))
    assert "ck_weekly_plans_week_start_segunda" in str(erro.value.orig)


def test_plano_sem_sete_diarias_e_recusado_pelo_servico(session: Session) -> None:
    """Os 7 dias sao garantidos SO pelo servico (spec, Modelo de dados)."""
    with pytest.raises(ValueError, match="7 diarias"):
        criar_plano(
            session, user_id=ESTUDANTE, semana=SEGUNDA, diarias=_diarias(6), especial=ESPECIAL,
            clock=relogio(QUARTA_MEIO_DIA),
        )
    assert session.scalar(select(func.count()).select_from(WeeklyPlan)) == 0


def test_ler_plano_atual(session: Session) -> None:
    assert ler_plano_atual(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA)) is None
    _criar(session)
    lido = ler_plano_atual(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA))
    assert lido is not None
    assert lido.semana == SEGUNDA


def test_ciclo_sem_plano(session: Session) -> None:
    ciclo = ler_ciclo(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA))
    assert (ciclo.hoje, ciclo.missao, ciclo.sequencia, ciclo.dias_para_o_marco, ciclo.especial) == (
        SEGUNDA + timedelta(days=2), None, 0, 7, None,
    )


def test_ciclo_com_a_missao_de_hoje_antes_e_depois_de_concluir(session: Session) -> None:
    _criar(session)
    antes = ler_ciclo(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA))
    assert antes.missao is not None
    assert antes.missao.availability is Availability.DISPONIVEL

    _concluir_no_dia(session, SEGUNDA + timedelta(days=2))
    depois = ler_ciclo(session, ESTUDANTE, clock=relogio(QUARTA_MEIO_DIA))
    assert depois.missao is not None
    assert depois.missao.availability is Availability.CONCLUIDA
    assert (depois.sequencia, depois.dias_para_o_marco) == (1, 6)


def _semana_inteira(session: Session) -> None:
    """Plano criado na segunda, com as 7 diarias concluidas cada uma no seu dia."""
    _criar(session, agora=ao_meio_dia(SEGUNDA))
    for i in range(7):
        _concluir_no_dia(session, SEGUNDA + timedelta(days=i))


def test_a_especial_aparece_no_marco_e_fica_ate_o_fim_do_dia_seguinte(session: Session) -> None:
    _semana_inteira(session)
    domingo = SEGUNDA + timedelta(days=6)

    no_domingo = ler_ciclo(session, ESTUDANTE, clock=relogio(ao_meio_dia(domingo)))
    assert no_domingo.sequencia == 7
    assert no_domingo.especial is not None
    assert no_domingo.especial.availability is Availability.DISPONIVEL

    segunda_seguinte = ler_ciclo(session, ESTUDANTE, clock=relogio(ao_meio_dia(SEGUNDA + UMA_SEMANA)))
    assert segunda_seguinte.especial is not None

    # Terca 29, 00:00 em SP: a janela fechou, e `special` some do ciclo.
    fechada = ler_ciclo(session, ESTUDANTE, clock=relogio(datetime(2026, 9, 29, 3, tzinfo=UTC)))
    assert fechada.especial is None


def test_especial_concluida_aparece_como_concluida_dentro_da_janela(session: Session) -> None:
    _semana_inteira(session)
    domingo = SEGUNDA + timedelta(days=6)
    especial = session.scalars(select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)).one()
    concluir_missao(session, ESTUDANTE, especial.id, "op-especial", clock=relogio(ao_meio_dia(domingo)))

    ciclo = ler_ciclo(session, ESTUDANTE, clock=relogio(ao_meio_dia(SEGUNDA + UMA_SEMANA)))
    assert ciclo.especial is not None
    assert ciclo.especial.availability is Availability.CONCLUIDA


def test_marco_no_domingo_e_a_trilha_da_semana_seguinte_em_zero_de_sete(session: Session) -> None:
    """O "caso concreto" da spec: na segunda de S+1, o ciclo mostra a especial
    de S e a trilha de S+1 mostra o marcador em 0 de 7. As duas sao verdade."""
    _semana_inteira(session)
    segunda_seguinte = SEGUNDA + UMA_SEMANA
    _criar(session, semana=segunda_seguinte, agora=ao_meio_dia(segunda_seguinte))

    ciclo = ler_ciclo(session, ESTUDANTE, clock=relogio(ao_meio_dia(segunda_seguinte)))
    trilha = ler_plano_atual(session, ESTUDANTE, clock=relogio(ao_meio_dia(segunda_seguinte)))

    assert ciclo.especial is not None
    assert trilha is not None
    assert trilha.especial.availability is Availability.BLOQUEADA
    assert trilha.especial.progresso == 0


def test_a_trilha_mostra_a_especial_revelada_depois_do_marco(session: Session) -> None:
    _semana_inteira(session)
    trilha = ler_plano_atual(session, ESTUDANTE, clock=relogio(ao_meio_dia(SEGUNDA + timedelta(days=6))))
    assert trilha is not None
    assert trilha.especial.availability is Availability.DISPONIVEL
    assert trilha.especial.missao is not None


def test_ler_diaria_futura_responde_como_inexistente(session: Session) -> None:
    _criar(session)
    with pytest.raises(MissaoNaoEncontradaError):
        ler_missao(session, _diaria_do_dia(session, SEGUNDA + timedelta(days=5)), QUARTA_MEIO_DIA)


def test_ler_especial_bloqueada_responde_como_inexistente(session: Session) -> None:
    _criar(session)
    especial = session.scalars(select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)).one()
    with pytest.raises(MissaoNaoEncontradaError):
        ler_missao(session, especial, QUARTA_MEIO_DIA)
```

E `tests/unit/test_cycle_invariantes.py` (sem banco: objetos em memória):

```python
"""As duas conferencias de invariante do servico do ciclo.

Nenhum caminho da API as alcanca -- os CHECK do banco impedem o dado --, e
por isso elas sao provadas com objetos em memoria: um ramo que so existe para
o dia em que o esquema divergir ainda e um ramo, e precisa de teste.
"""

from datetime import UTC, date, datetime

import pytest

from focusquest.modules.missions.cycle_domain import Availability
from focusquest.modules.missions.cycle_service import dia_da_diaria, leitura_da_avulsa
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission

PRAZO = datetime(2026, 9, 30, 15, tzinfo=UTC)


def _missao(**campos: object) -> Mission:
    base: dict[str, object] = {
        "id": 7, "user_id": 1, "instructions": "x", "completion_criterion": "y",
        "difficulty": 2, "estimated_minutes": 30, "state": MissionState.PENDENTE,
    }
    base.update(campos)
    return Mission(**base)


def test_diaria_sem_dia_e_divergencia_do_esquema() -> None:
    with pytest.raises(RuntimeError, match="ck_missions_dia_do_tipo"):
        dia_da_diaria(_missao(mission_type=MissionType.DIARIA, day=None))


def test_dia_da_diaria() -> None:
    assert dia_da_diaria(_missao(mission_type=MissionType.DIARIA, day=date(2026, 9, 21))) == date(2026, 9, 21)


def test_avulsa_sem_prazo_e_divergencia_do_esquema() -> None:
    with pytest.raises(RuntimeError, match="ck_missions_prazo_do_tipo"):
        leitura_da_avulsa(_missao(mission_type=MissionType.AVULSA, deadline=None))


@pytest.mark.parametrize(
    ("estado", "esperada"),
    [
        (MissionState.PENDENTE, Availability.DISPONIVEL),
        (MissionState.EM_ANDAMENTO, Availability.DISPONIVEL),
        (MissionState.CONCLUIDA, Availability.CONCLUIDA),
    ],
)
def test_a_avulsa_so_distingue_concluida(estado: MissionState, esperada: Availability) -> None:
    lida = leitura_da_avulsa(_missao(mission_type=MissionType.AVULSA, deadline=PRAZO, state=estado))
    assert (lida.deadline, lida.availability) == (PRAZO, esperada)
```

- [ ] **Step 3: Rodar e ver reprovar.** Run: `uv run pytest tests/integration/test_cycle_service.py tests/unit/test_cycle_invariantes.py -q --no-cov` — Expected: `ModuleNotFoundError: ...cycle_service`. (`test_a_especial...` e os que concluem usam `concluir_missao` **sem** as regras do ciclo ainda; eles passam a exercitar as regras na Task 4, sem mudança.)

- [ ] **Step 4: Implementar `cycle_service.py`:**

```python
"""Casos de uso do ciclo diario: criar o plano da semana e ler o ciclo.

Como `service.py`, nada aqui conhece HTTP e nada commita: quem abre a
transacao e quem a fecha. A leitura e sempre DERIVADA (decisao C2): o que esta
revelado, disponivel, perdido ou expirado sai do relogio, do plano e das
conclusoes, e nunca de uma coluna.

A ocultacao (C11) mora em `ler_missao`: o que ainda nao foi revelado levanta
`MissaoNaoEncontradaError`, o MESMO erro de "nao existe". A conclusao usa a
mesma funcao, e e isso que impede a leitura e a conclusao de discordarem
sobre o que existe (decisao P6 do plano do B).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from focusquest.core.clock import Clock
from focusquest.core.errors import (
    MissaoNaoEncontradaError,
    PlanoExistenteError,
    SemanaDistanteError,
    SemanaEncerradaError,
)
from focusquest.modules.missions.cycle_domain import (
    DIAS_DA_SEMANA,
    DIAS_POR_MARCO,
    Availability,
    DiaDoPlano,
    Historico,
    dia_de,
    dias_da_semana,
    dias_para_o_marco,
    disponibilidade_da_diaria,
    disponibilidade_da_especial,
    fim_da_janela_da_especial,
    fim_do_dia,
    marco_da_semana,
    marco_mais_recente,
    segunda_da_semana,
    sequencia,
)
from focusquest.modules.missions.domain import (
    DIFICULDADE_DA_ESPECIAL,
    MissionState,
    MissionType,
)
from focusquest.modules.missions.models import Mission, WeeklyPlan

# O nome da restricao do plano repetido: reconhece QUAL IntegrityError e o
# 409, pelo mesmo motivo de `UNICIDADE_DA_OPERACAO` em service.py.
UNICIDADE_DA_SEMANA = "uq_weekly_plans_user_id_week_start"


@dataclass(frozen=True)
class NovaDiaria:
    instructions: str
    completion_criterion: str
    difficulty: int
    estimated_minutes: int


@dataclass(frozen=True)
class NovaEspecial:
    """Sem dificuldade: a especial esta sempre na maxima (C9)."""

    instructions: str
    completion_criterion: str
    estimated_minutes: int


@dataclass(frozen=True)
class MissaoLida:
    """A missao com o que e derivado dela: o prazo e a disponibilidade."""

    missao: Mission
    deadline: datetime
    availability: Availability


@dataclass(frozen=True)
class DiaLido:
    """Um dia da trilha. Dia futuro e bau fechado: `missao` e None (B3)."""

    dia: date
    availability: Availability
    missao: MissaoLida | None


@dataclass(frozen=True)
class EspecialLida:
    """A especial da trilha. Bloqueada, e um marcador sem missao."""

    availability: Availability
    progresso: int
    missao: MissaoLida | None


@dataclass(frozen=True)
class PlanoLido:
    semana: date
    dias: list[DiaLido]
    especial: EspecialLida


@dataclass(frozen=True)
class CicloLido:
    hoje: date
    missao: MissaoLida | None
    sequencia: int
    dias_para_o_marco: int
    especial: MissaoLida | None


def dia_da_diaria(missao: Mission) -> date:
    """O dia de uma diaria. Nulo seria o esquema divergindo do CHECK."""
    if missao.day is None:
        raise RuntimeError(
            f"missao {missao.id} sem dia: o CHECK ck_missions_dia_do_tipo foi violado"
        )
    return missao.day


def leitura_da_avulsa(missao: Mission) -> MissaoLida:
    """A avulsa lida: o prazo e o da coluna, e a disponibilidade so distingue
    concluida (decisao P3 do plano do B) -- a avulsa nao tem regra de dia."""
    if missao.deadline is None:
        raise RuntimeError(
            f"missao {missao.id} sem prazo: o CHECK ck_missions_prazo_do_tipo foi violado"
        )
    if missao.state is MissionState.CONCLUIDA:
        return MissaoLida(missao, missao.deadline, Availability.CONCLUIDA)
    return MissaoLida(missao, missao.deadline, Availability.DISPONIVEL)


def carregar_historico(session: Session, user_id: int) -> dict[date, DiaDoPlano]:
    """Os dias planejados do usuario, de todas as semanas.

    Le o historico inteiro a cada calculo (custo declarado da C2). Com usuario
    unico e 7 linhas por semana, nao pesa.
    """
    linhas = session.execute(
        select(Mission, WeeklyPlan.created_at)
        .join(WeeklyPlan, Mission.plan_id == WeeklyPlan.id)
        .where(Mission.user_id == user_id, Mission.mission_type == MissionType.DIARIA)
    ).tuples()
    return {
        dia_da_diaria(missao): DiaDoPlano(
            concluida=missao.state is MissionState.CONCLUIDA,
            plano_criado_em=dia_de(criado_em),
        )
        for missao, criado_em in linhas
    }


def _plano_da_missao(session: Session, missao: Mission) -> WeeklyPlan:
    # `.one()`: a FK composta garante o plano; a falta dele e divergencia.
    return session.scalars(select(WeeklyPlan).where(WeeklyPlan.id == missao.plan_id)).one()


def _ler_diaria(missao: Mission, plano: WeeklyPlan, hoje: date) -> MissaoLida:
    dia = dia_da_diaria(missao)
    if dia > hoje:
        raise MissaoNaoEncontradaError(
            f"missao {missao.id} e a diaria de {dia}, ainda nao revelada"
        )
    estado = DiaDoPlano(
        concluida=missao.state is MissionState.CONCLUIDA,
        plano_criado_em=dia_de(plano.created_at),
    )
    return MissaoLida(missao, fim_do_dia(dia), disponibilidade_da_diaria(dia, estado, hoje))


def _ler_especial(missao: Mission, marco: date, agora: datetime) -> MissaoLida:
    return MissaoLida(
        missao,
        fim_da_janela_da_especial(marco),
        disponibilidade_da_especial(marco, missao.state is MissionState.CONCLUIDA, agora),
    )


def ler_missao(session: Session, missao: Mission, agora: datetime) -> MissaoLida:
    """A missao lida, ou `MissaoNaoEncontradaError` se ainda nao foi revelada.

    Nao revelado (C11): a diaria de um dia futuro (inclusive de uma semana
    futura) e a especial sem marco. Os dois respondem o mesmo 404 de "nao
    existe" -- a distincao vai so para a mensagem, que o handler registra no
    log e nao devolve.
    """
    if missao.mission_type is MissionType.AVULSA:
        return leitura_da_avulsa(missao)
    plano = _plano_da_missao(session, missao)
    if missao.mission_type is MissionType.DIARIA:
        return _ler_diaria(missao, plano, dia_de(agora))
    marco = marco_da_semana(carregar_historico(session, missao.user_id), plano.week_start)
    if marco is None:
        raise MissaoNaoEncontradaError(f"missao {missao.id} e uma especial ainda bloqueada")
    return _ler_especial(missao, marco, agora)


def criar_plano(
    session: Session,
    *,
    user_id: int,
    semana: date,
    diarias: Sequence[NovaDiaria],
    especial: NovaEspecial,
    clock: Clock,
) -> PlanoLido:
    """Cria o plano da semana e devolve na forma da trilha.

    A ordem das recusas importa: `semana_distante` vem ANTES de qualquer
    aritmetica sobre `semana`, porque e ela que impede o estouro de uma semana
    no ano 9999. So depois dela e seguro somar dias a `semana`.
    """
    if len(diarias) != DIAS_DA_SEMANA:
        raise ValueError(
            f"o plano precisa de {DIAS_DA_SEMANA} diarias, recebeu {len(diarias)}"
        )
    agora = clock()
    hoje = dia_de(agora)
    segunda_atual = segunda_da_semana(hoje)
    if semana > segunda_atual + timedelta(days=DIAS_DA_SEMANA):
        raise SemanaDistanteError(
            f"a semana de {semana} fica alem da seguinte a atual ({segunda_atual})"
        )
    if semana + timedelta(days=DIAS_DA_SEMANA - 1) < hoje:
        raise SemanaEncerradaError(f"a semana de {semana} ja terminou")

    plano = WeeklyPlan(user_id=user_id, week_start=semana, created_at=agora)
    session.add(plano)
    try:
        session.flush()
    except IntegrityError as erro:
        if UNICIDADE_DA_SEMANA not in str(erro.orig):
            raise
        raise PlanoExistenteError(f"ja existe plano para a semana de {semana}") from erro

    for indice, nova in enumerate(diarias):
        session.add(
            Mission(
                user_id=user_id,
                mission_type=MissionType.DIARIA,
                plan_id=plano.id,
                day=semana + timedelta(days=indice),
                instructions=nova.instructions,
                completion_criterion=nova.completion_criterion,
                difficulty=nova.difficulty,
                estimated_minutes=nova.estimated_minutes,
                deadline=None,
                state=MissionState.PENDENTE,
            )
        )
    session.add(
        Mission(
            user_id=user_id,
            mission_type=MissionType.ESPECIAL,
            plan_id=plano.id,
            day=None,
            instructions=especial.instructions,
            completion_criterion=especial.completion_criterion,
            difficulty=DIFICULDADE_DA_ESPECIAL,
            estimated_minutes=especial.estimated_minutes,
            deadline=None,
            state=MissionState.PENDENTE,
        )
    )
    session.flush()
    return _ler_plano(session, plano, agora)


def _ler_plano(session: Session, plano: WeeklyPlan, agora: datetime) -> PlanoLido:
    hoje = dia_de(agora)
    diarias: dict[date, Mission] = {}
    especiais: list[Mission] = []
    for missao in session.scalars(select(Mission).where(Mission.plan_id == plano.id)):
        if missao.mission_type is MissionType.DIARIA:
            diarias[dia_da_diaria(missao)] = missao
        else:
            especiais.append(missao)
    # Exatamente uma: o indice unico parcial garante no maximo uma, e o
    # servico cria sempre uma. O desempacotamento falha alto se nao for.
    (especial,) = especiais

    dias: list[DiaLido] = []
    for dia in dias_da_semana(plano.week_start):
        if dia > hoje:
            dias.append(DiaLido(dia, Availability.BLOQUEADA, None))
            continue
        lida = _ler_diaria(diarias[dia], plano, hoje)
        dias.append(DiaLido(dia, lida.availability, lida))

    historico = carregar_historico(session, plano.user_id)
    progresso = sequencia(historico, hoje) % DIAS_POR_MARCO
    marco = marco_da_semana(historico, plano.week_start)
    if marco is None:
        return PlanoLido(
            plano.week_start, dias, EspecialLida(Availability.BLOQUEADA, progresso, None)
        )
    lida_especial = _ler_especial(especial, marco, agora)
    return PlanoLido(
        plano.week_start,
        dias,
        EspecialLida(lida_especial.availability, progresso, lida_especial),
    )


def ler_plano_atual(session: Session, user_id: int, *, clock: Clock) -> PlanoLido | None:
    """O plano da semana atual, ou None: "sem plano" e estado, nao erro."""
    agora = clock()
    plano = session.scalar(
        select(WeeklyPlan).where(
            WeeklyPlan.user_id == user_id,
            WeeklyPlan.week_start == segunda_da_semana(dia_de(agora)),
        )
    )
    if plano is None:
        return None
    return _ler_plano(session, plano, agora)


def _especial_vigente(
    session: Session, user_id: int, historico: Historico, agora: datetime
) -> MissaoLida | None:
    """A especial do marco mais recente, enquanto a janela dela estiver aberta
    (spec, "A especial no Quartel-General")."""
    marco = marco_mais_recente(historico, dia_de(agora))
    if marco is None or agora >= fim_da_janela_da_especial(marco):
        return None
    especial = session.scalars(
        select(Mission)
        .join(WeeklyPlan, Mission.plan_id == WeeklyPlan.id)
        .where(
            Mission.user_id == user_id,
            Mission.mission_type == MissionType.ESPECIAL,
            WeeklyPlan.week_start == segunda_da_semana(marco),
        )
    ).one()
    return _ler_especial(especial, marco, agora)


def ler_ciclo(session: Session, user_id: int, *, clock: Clock) -> CicloLido:
    """O dia: a missao de hoje, a sequencia e a especial vigente."""
    agora = clock()
    hoje = dia_de(agora)
    historico = carregar_historico(session, user_id)
    atual = sequencia(historico, hoje)
    de_hoje = session.scalar(
        select(Mission).where(
            Mission.user_id == user_id,
            Mission.mission_type == MissionType.DIARIA,
            Mission.day == hoje,
        )
    )
    return CicloLido(
        hoje=hoje,
        missao=None if de_hoje is None else ler_missao(session, de_hoje, agora),
        sequencia=atual,
        dias_para_o_marco=dias_para_o_marco(atual),
        especial=_especial_vigente(session, user_id, historico, agora),
    )
```

- [ ] **Step 5: Rodar e ver passar.** Run: `uv run pytest tests/integration/test_cycle_service.py tests/unit/test_cycle_invariantes.py -q --no-cov` — Expected: verdes.

- [ ] **Step 6: Mutações (restaurar cada uma).**
  1. Inverter a ordem das recusas (encerrada antes de distante) — reprova só com o ano 9999, que é da Task 5; registre e confira de novo lá.
  2. `_ler_plano`: tirar o `if dia > hoje` (revelar tudo) → `test_o_plano_lido_revela_so_ate_hoje` reprova.
  3. `_especial_vigente`: tirar a condição da janela → `test_a_especial_aparece...` reprova (a terça 00:00).
  4. `criar_plano`: tirar o `if UNICIDADE_DA_SEMANA not in ...: raise` → `test_outra_violacao_nao_e_traduzida_como_plano_existente` reprova.
  5. `leitura_da_avulsa`: sempre `DISPONIVEL` → o parametrizado reprova.

- [ ] **Step 7: Gate e commit.** Run: `make check` — Expected: EXIT 0. Se a cobertura acusar um ramo de `cycle_service.py` sem caso, o teste que falta é o do ramo — não uma diretiva.

```bash
git add src/focusquest/core/errors.py src/focusquest/modules/missions/cycle_service.py tests/integration/test_cycle_service.py tests/unit/test_cycle_invariantes.py
git commit -m "feat(ciclo): criar o plano semanal e ler o ciclo derivado do relogio

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: As regras do ciclo na conclusão

**Files:**
- Modify: `src/focusquest/modules/missions/service.py` (`concluir_missao`, `listar_missoes`)
- Test: `tests/integration/test_cycle_completion.py`, `tests/integration/test_cycle_concorrencia.py`

**Interfaces:**
- Consumes: `ler_missao`, `NAO_CONCLUIVEIS`, `MissaoExpiradaError`.
- Produces: `concluir_missao` (mesma assinatura) com a ordem da spec; `listar_missoes` devolve **só avulsas**.

- [ ] **Step 1: Testes que reprovam.** Criar `tests/integration/test_cycle_completion.py`:

```python
"""A ordem da conclusao do ciclo (spec, "Regras do ciclo", Ordem da conclusao):
trava, relogio, ocultacao, reenvio, regra do dia, transicao."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.core.errors import MissaoExpiradaError, MissaoNaoEncontradaError
from focusquest.modules.missions.cycle_service import NovaDiaria, NovaEspecial, criar_plano
from focusquest.modules.missions.domain import MissionState, MissionType, TransicaoIlegalError
from focusquest.modules.missions.models import Mission, MissionOperation
from focusquest.modules.missions.service import concluir_missao, criar_missao, listar_missoes

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)


def ao_meio_dia(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


def relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


def _plano(session: Session, semana: date = SEGUNDA, criado: date = QUARTA) -> None:
    criar_plano(
        session, user_id=ESTUDANTE, semana=semana,
        diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
        especial=NovaEspecial("E", "c", 60), clock=relogio(ao_meio_dia(criado)),
    )


def _diaria(session: Session, dia: date) -> Mission:
    return session.scalars(
        select(Mission).where(Mission.mission_type == MissionType.DIARIA, Mission.day == dia)
    ).one()


def _concluir(session: Session, missao: Mission, operacao: str, agora: datetime) -> Mission:
    return concluir_missao(session, ESTUDANTE, missao.id, operacao, clock=relogio(agora))


def test_conclui_a_diaria_de_hoje(session: Session) -> None:
    _plano(session)
    missao = _concluir(session, _diaria(session, QUARTA), "op", ao_meio_dia(QUARTA))
    assert missao.state is MissionState.CONCLUIDA
    assert missao.completed_at == ao_meio_dia(QUARTA)


@pytest.mark.parametrize("dias_a_frente", [1, 7])
def test_diaria_ainda_nao_revelada_responde_como_inexistente(session: Session, dias_a_frente: int) -> None:
    _plano(session)
    _plano(session, semana=SEGUNDA + timedelta(days=7))
    with pytest.raises(MissaoNaoEncontradaError):
        _concluir(session, _diaria(session, QUARTA + timedelta(days=dias_a_frente)), "op", ao_meio_dia(QUARTA))


def test_especial_bloqueada_responde_como_inexistente(session: Session) -> None:
    _plano(session)
    especial = session.scalars(select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)).one()
    with pytest.raises(MissaoNaoEncontradaError):
        _concluir(session, especial, "op", ao_meio_dia(QUARTA))


def test_diaria_de_ontem_esta_expirada(session: Session) -> None:
    _plano(session)
    with pytest.raises(MissaoExpiradaError):
        _concluir(session, _diaria(session, QUARTA), "op", ao_meio_dia(QUARTA + timedelta(days=1)))


def test_dia_fora_do_plano_e_expirado(session: Session) -> None:
    """Plano criado na quarta: a segunda aparece, mas nao pode ser feita."""
    _plano(session)
    with pytest.raises(MissaoExpiradaError):
        _concluir(session, _diaria(session, SEGUNDA), "op", ao_meio_dia(QUARTA))


def test_reenvio_depois_da_meia_noite_devolve_a_mesma_conclusao(session: Session) -> None:
    _plano(session)
    diaria = _diaria(session, QUARTA)
    antes = datetime(2026, 9, 24, 2, 59, 59, tzinfo=UTC)   # quarta 23:59:59 em SP
    depois = datetime(2026, 9, 24, 3, 0, 1, tzinfo=UTC)    # quinta 00:00:01 em SP
    _concluir(session, diaria, "op-da-virada", antes)

    reenvio = _concluir(session, diaria, "op-da-virada", depois)

    assert reenvio.completed_at == antes
    operacoes = session.scalar(
        select(func.count()).select_from(MissionOperation).where(MissionOperation.mission_id == diaria.id)
    )
    assert operacoes == 1


def test_operacao_nova_sobre_diaria_concluida_e_transicao_ilegal_em_qualquer_dia(session: Session) -> None:
    """"Ja foi feita" informa melhor do que "expirou" (spec)."""
    _plano(session)
    diaria = _diaria(session, QUARTA)
    _concluir(session, diaria, "op-1", ao_meio_dia(QUARTA))
    with pytest.raises(TransicaoIlegalError):
        _concluir(session, diaria, "op-2", ao_meio_dia(QUARTA + timedelta(days=1)))


def test_a_ocultacao_vem_antes_do_reuso(session: Session) -> None:
    """Uma chave gasta em outra missao, mandada ao id de uma diaria oculta, tem
    de dar o 404 de "nao existe" -- o 409 de reuso revelaria que ela existe."""
    _plano(session)
    avulsa = criar_missao(
        session, user_id=ESTUDANTE, instructions="a", completion_criterion="c",
        difficulty=1, estimated_minutes=10, deadline=ao_meio_dia(QUARTA),
    )
    _concluir(session, avulsa, "op-gasta", ao_meio_dia(QUARTA))
    with pytest.raises(MissaoNaoEncontradaError):
        _concluir(session, _diaria(session, QUARTA + timedelta(days=1)), "op-gasta", ao_meio_dia(QUARTA))


def test_especial_fora_da_janela_esta_expirada(session: Session) -> None:
    _plano(session, criado=SEGUNDA)
    for i in range(7):
        dia = SEGUNDA + timedelta(days=i)
        _concluir(session, _diaria(session, dia), f"op-{i}", ao_meio_dia(dia))
    especial = session.scalars(select(Mission).where(Mission.mission_type == MissionType.ESPECIAL)).one()
    fechada = datetime(2026, 9, 29, 3, tzinfo=UTC)  # terca 00:00 em SP
    with pytest.raises(MissaoExpiradaError):
        _concluir(session, especial, "op-e", fechada)


def test_a_avulsa_nao_tem_regra_de_dia(session: Session) -> None:
    """Prazo no passado nunca bloqueou a avulsa (desde o 1a) e continua sem bloquear."""
    avulsa = criar_missao(
        session, user_id=ESTUDANTE, instructions="a", completion_criterion="c",
        difficulty=1, estimated_minutes=10, deadline=ao_meio_dia(SEGUNDA),
    )
    assert _concluir(session, avulsa, "op", ao_meio_dia(QUARTA)).state is MissionState.CONCLUIDA


def test_a_listagem_devolve_so_avulsas(session: Session) -> None:
    _plano(session)
    avulsa = criar_missao(
        session, user_id=ESTUDANTE, instructions="a", completion_criterion="c",
        difficulty=1, estimated_minutes=10, deadline=ao_meio_dia(QUARTA),
    )
    assert [m.id for m in listar_missoes(session, ESTUDANTE)] == [avulsa.id]
```

E `tests/integration/test_cycle_concorrencia.py`, copiando o **padrão** de `test_missions_concorrencia.py` (conexão aberta antes da barreira, `SEGUNDOS_LIMITE`, limpeza em `finally` com `lock_timeout`; não importe aquele módulo):

```python
"""A conclusao concorrente perto da meia-noite (spec, "Testes", integracao).

Duas conexoes disputam a diaria de quarta com relogios dos dois lados da
meia-noite de Sao Paulo. Qualquer que seja a ordem do escalonador, o
resultado tem de ser UMA conclusao: se a das 23:59:59 trava primeiro, ela
conclui e a outra recebe `transicao_ilegal`; se a das 00:00:01 trava
primeiro, ela recebe `missao_expirada` e a outra conclui.
"""

import threading
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import Engine, delete, func, select, text
from sqlalchemy.orm import Session

from focusquest.core.errors import MissaoExpiradaError
from focusquest.modules.missions.cycle_service import NovaDiaria, NovaEspecial, criar_plano
from focusquest.modules.missions.domain import MissionState, MissionType, TransicaoIlegalError
from focusquest.modules.missions.models import Mission, MissionOperation, WeeklyPlan
from focusquest.modules.missions.service import concluir_missao

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)
SEGUNDOS_LIMITE = 30
LIMITE_DE_TRAVA = "2s"
ANTES = datetime(2026, 9, 24, 2, 59, 59, tzinfo=UTC)
DEPOIS = datetime(2026, 9, 24, 3, 0, 1, tzinfo=UTC)


@pytest.fixture
def diaria_de_quarta(banco_migrado: Engine) -> Iterator[int]:
    """Plano REALMENTE commitado; apagado ao sair, mesmo com o teste vermelho."""
    with Session(bind=banco_migrado) as sessao:
        criar_plano(
            sessao, user_id=ESTUDANTE, semana=SEGUNDA,
            diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
            especial=NovaEspecial("E", "c", 60),
            clock=lambda: datetime(2026, 9, 23, 15, tzinfo=UTC),
        )
        sessao.commit()
        plano_id = sessao.scalars(select(WeeklyPlan.id)).one()
        mission_id = sessao.scalars(
            select(Mission.id).where(Mission.mission_type == MissionType.DIARIA, Mission.day == QUARTA)
        ).one()
    try:
        yield mission_id
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            sessao.execute(delete(Mission).where(Mission.plan_id == plano_id))
            sessao.execute(delete(WeeklyPlan).where(WeeklyPlan.id == plano_id))
            sessao.commit()


def test_conclusao_concorrente_na_virada_do_dia_conclui_uma_vez(
    banco_migrado: Engine, diaria_de_quarta: int
) -> None:
    barreira = threading.Barrier(2, timeout=SEGUNDOS_LIMITE)
    resultados: dict[str, object] = {}

    def concluir(nome: str, instante: datetime) -> None:
        with Session(bind=banco_migrado) as sessao:
            # Conexao aberta ANTES da barreira: sem isso a largada e falsa
            # (ver `test_missions_concorrencia.py`).
            sessao.connection()
            barreira.wait()
            try:
                concluir_missao(sessao, ESTUDANTE, diaria_de_quarta, f"op-{nome}", clock=lambda: instante)
                sessao.commit()
                resultados[nome] = "ok"
            except (TransicaoIlegalError, MissaoExpiradaError) as erro:
                sessao.rollback()
                resultados[nome] = type(erro)

    threads = [
        threading.Thread(target=concluir, args=("antes", ANTES)),
        threading.Thread(target=concluir, args=("depois", DEPOIS)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(SEGUNDOS_LIMITE)
        assert not thread.is_alive()

    assert list(resultados.values()).count("ok") == 1
    assert resultados["antes"] == "ok" or resultados["depois"] == "ok"
    with Session(bind=banco_migrado) as sessao:
        missao = sessao.get(Mission, diaria_de_quarta)
        assert missao is not None
        assert missao.state is MissionState.CONCLUIDA
        assert sessao.scalar(
            select(func.count()).select_from(MissionOperation).where(MissionOperation.mission_id == diaria_de_quarta)
        ) == 1
```

- [ ] **Step 2: Rodar e ver reprovar.** Run: `uv run pytest tests/integration/test_cycle_completion.py tests/integration/test_cycle_concorrencia.py -q --no-cov` — Expected: reprovam os de ocultação, expiração e listagem (a conclusão ainda não conhece o ciclo).

- [ ] **Step 3: Implementar.** Em `service.py`:
  - imports: `from focusquest.core.errors import MissaoExpiradaError` (junto dos outros), `from focusquest.modules.missions.cycle_domain import NAO_CONCLUIVEIS`, `from focusquest.modules.missions.cycle_service import ler_missao`, e `MissionType` no import de `domain`.
  - `listar_missoes`: acrescentar `Mission.mission_type == MissionType.AVULSA` ao `.where(...)` e, na docstring, a frase: "So avulsas: a diaria e a especial aparecem pelo ciclo (`GET /api/cycle`), e listar uma diaria futura aqui a revelaria (C11)."
  - `concluir_missao`: entre `agora = clock()` e a consulta de `ja_feita`, e entre o reenvio e `validar_transicao`:

```python
    agora = clock()

    # Ocultacao ANTES do reenvio (spec, "Ordem da conclusao", passo 3): um
    # `operation_id` gasto em outra missao, mandado ao id de uma missao
    # oculta, cairia na checagem de reuso e receberia 409, enquanto um id
    # inexistente recebe 404 -- a diferenca revelaria que ela existe.
    # `ler_missao` levanta o mesmo `MissaoNaoEncontradaError` de "nao existe".
    lida = ler_missao(session, missao, agora)

    ja_feita = session.scalar(...)            # inalterado
    if ja_feita is not None:                   # inalterado
        ...

    # Regra do dia, so para o que nao foi concluido (a disponibilidade de uma
    # missao concluida e `concluida`, que nao esta em NAO_CONCLUIVEIS). Depois
    # do reenvio: a conclusao das 23:59:59 reenviada as 00:00:01 ja devolveu o
    # mesmo 200 acima.
    if lida.availability in NAO_CONCLUIVEIS:
        raise MissaoExpiradaError(
            f"missao {mission_id} nao pode mais ser concluida: {lida.availability.value}"
        )

    validar_transicao(missao.state, MissionState.CONCLUIDA)   # inalterado
```

  E atualizar o comentário "No Incremento A so o `completed_at` usa a hora; no B, a regra do dia a le..." para o presente: "A hora decide a ocultacao, a regra do dia e o `completed_at`."

- [ ] **Step 4: Rodar e ver passar.** Run: `uv run pytest tests/integration -q --no-cov` — Expected: verdes, inclusive os antigos de missão.

- [ ] **Step 5: Mutações (restaurar cada uma).**
  1. Mover `lida = ler_missao(...)` para depois do bloco de reenvio → `test_a_ocultacao_vem_antes_do_reuso` reprova (409 de reuso no lugar do 404).
  2. Mover a regra do dia para antes do reenvio → `test_reenvio_depois_da_meia_noite...` **não** reprova (a concluída é `concluida`); registre, e aplique a mutação que importa: calcular a regra pelo **dia** e não pela disponibilidade (`if dia_da_diaria(missao) < dia_de(agora): raise`) antes do reenvio → reprova.
  3. Tirar o filtro de avulsas → `test_a_listagem_devolve_so_avulsas` reprova.
  4. No teste de concorrência: rodar **cinco** vezes (`--count` não existe; rode o comando 5×) e registrar que passa nas 5. Mutação: tirar o `with_for_update` de `_buscar` e rodar 5× — registrar quantas reprovam (a spec não exige 5/5 aqui; a pendência 44 registra taxas parciais).

- [ ] **Step 6: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add src/focusquest/modules/missions/service.py tests/integration/test_cycle_completion.py tests/integration/test_cycle_concorrencia.py
git commit -m "feat(ciclo): ocultacao e regra do dia na conclusao, listagem so de avulsas

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: A API do ciclo

**Files:**
- Create: `src/focusquest/modules/missions/cycle_schemas.py`, `src/focusquest/modules/missions/cycle_router.py`
- Modify: `src/focusquest/modules/missions/schemas.py` (`MissionRead`), `src/focusquest/modules/missions/router.py`, `src/focusquest/main.py`, `src/focusquest/modules/tutoring/router.py:145`, `src/focusquest/modules/tutoring/context.py:46`
- Test: `tests/integration/test_cycle_api.py`

**Interfaces:**
- Consumes: Tasks 3 e 4.
- Produces (contrato HTTP; o frontend das Tasks 7–9 depende destes nomes):
  - `MissionRead` ganha `mission_type` (`"avulsa" | "diaria" | "especial"`), `day` (`"YYYY-MM-DD"` ou `null`) e `availability`; `xp` passa a ser `xp_da_missao`. Construído por `MissionRead.da_leitura(lida: MissaoLida)`.
  - `POST /api/plans` → 201 `PlanRead`: `{"week_start", "days": [{"day", "availability", "mission": MissionRead | null} ×7], "special": {"availability", "progress", "mission": MissionRead | null}}`.
  - `GET /api/plans/current` → 200 `{"plan": PlanRead | null}`.
  - `GET /api/cycle` → 200 `{"today", "mission": MissionRead | null, "streak", "days_to_milestone", "special": MissionRead | null}`.
  - Erros 409: `plano_existente`, `semana_encerrada`, `semana_distante`, `missao_expirada`.

- [ ] **Step 1: Testes que reprovam.** Criar `tests/integration/test_cycle_api.py`:

```python
"""O contrato HTTP do ciclo: formas, recusas, codigos e a ocultacao por 404."""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from focusquest.core.clock import get_clock
from focusquest.core.database import get_session
from focusquest.main import app
from focusquest.modules.missions.domain import MissionType
from focusquest.modules.missions.models import Mission

SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)


def ao_meio_dia(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, 15, tzinfo=UTC)


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """Como em `test_missions_api.py`: a requisicao usa a sessao do teste, e a
    fixture remove a PROPRIA chave no teardown."""
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def relogio() -> Iterator[list[datetime]]:
    """Um relogio que o teste move: `relogio[0] = ...` muda o instante."""
    instante = [ao_meio_dia(QUARTA)]
    app.dependency_overrides[get_clock] = lambda: lambda: instante[0]
    yield instante
    app.dependency_overrides.pop(get_clock, None)


def _corpo(semana: date = SEGUNDA, **ajustes: Any) -> dict[str, Any]:
    corpo: dict[str, Any] = {
        "week_start": semana.isoformat(),
        "days": [
            {"instructions": f"Diaria {i}", "completion_criterion": f"Criterio {i}",
             "difficulty": 2, "estimated_minutes": 30}
            for i in range(7)
        ],
        "bonus": {"instructions": "Prova simulada", "completion_criterion": "Nota registrada",
                  "estimated_minutes": 120},
    }
    corpo.update(ajustes)
    return corpo


def _id_da_diaria(session: Session, dia: date) -> int:
    return session.scalars(
        select(Mission.id).where(Mission.mission_type == MissionType.DIARIA, Mission.day == dia)
    ).one()


def _id_da_especial(session: Session) -> int:
    return session.scalars(select(Mission.id).where(Mission.mission_type == MissionType.ESPECIAL)).one()


def _concluir(client: TestClient, mission_id: int, operacao: str = "op") -> Any:
    return client.post(f"/api/missions/{mission_id}/complete", json={"operation_id": operacao})


def test_criar_o_plano_devolve_a_trilha_sem_revelar_o_futuro(client: TestClient, relogio: list[datetime]) -> None:
    resposta = client.post("/api/plans", json=_corpo())

    assert resposta.status_code == 201
    plano = resposta.json()
    assert plano["week_start"] == "2026-09-21"
    assert [d["availability"] for d in plano["days"]] == [
        "fora_do_plano", "fora_do_plano", "disponivel",
        "bloqueada", "bloqueada", "bloqueada", "bloqueada",
    ]
    # Bau fechado: a chave `mission` e nula, e o dia e so a data.
    for dia in plano["days"][3:]:
        assert set(dia) == {"day", "availability", "mission"}
        assert dia["mission"] is None
    quarta = plano["days"][2]["mission"]
    assert quarta["mission_type"] == "diaria"
    assert quarta["day"] == "2026-09-23"
    assert quarta["availability"] == "disponivel"
    assert datetime.fromisoformat(quarta["deadline"]) == datetime(2026, 9, 24, 3, tzinfo=UTC)
    # A especial bloqueada: marcador sem id, sem conteudo e sem dificuldade.
    assert plano["special"] == {"availability": "bloqueada", "progress": 0, "mission": None}


@pytest.mark.parametrize(
    "ajuste",
    [
        {"days": [{"instructions": "x", "completion_criterion": "y", "difficulty": 2, "estimated_minutes": 30}] * 6},
        {"week_start": "2026-09-22"},
        {"bonus": {"instructions": "x", "completion_criterion": "y", "estimated_minutes": 30, "difficulty": 5}},
        {"days": [{"instructions": "x", "completion_criterion": "y", "difficulty": 2, "estimated_minutes": 1441}] * 7},
        {"days": [{"instructions": "x", "completion_criterion": "y", "difficulty": 6, "estimated_minutes": 30}] * 7},
        {"bonus": {"instructions": "x", "completion_criterion": "y", "estimated_minutes": 1441}},
        {"days": [{"instructions": "", "completion_criterion": "y", "difficulty": 2, "estimated_minutes": 30}] * 7},
    ],
    ids=["seis-dias", "terca", "bonus-com-dificuldade", "diaria-de-1441", "dificuldade-6", "bonus-de-1441", "instrucao-vazia"],
)
def test_validacao_do_plano_responde_422(client: TestClient, relogio: list[datetime], ajuste: dict[str, Any]) -> None:
    assert client.post("/api/plans", json=_corpo(**ajuste)).status_code == 422


@pytest.mark.parametrize(
    ("semana", "code"),
    [(SEGUNDA - timedelta(days=7), "semana_encerrada"), (SEGUNDA + timedelta(days=14), "semana_distante")],
)
def test_semana_fora_do_alcance_responde_409_com_code(
    client: TestClient, relogio: list[datetime], semana: date, code: str
) -> None:
    resposta = client.post("/api/plans", json=_corpo(semana))
    assert resposta.status_code == 409
    assert resposta.json()["code"] == code


def test_semana_no_ano_9999_e_distante_e_nao_500(client: TestClient, relogio: list[datetime]) -> None:
    """9999-12-27 e a ultima segunda representavel: o fim do domingo seguinte
    estouraria o `datetime`. A recusa `semana_distante` vem antes da conta."""
    resposta = client.post("/api/plans", json=_corpo(date(9999, 12, 27)))
    assert (resposta.status_code, resposta.json()["code"]) == (409, "semana_distante")


def test_plano_repetido_responde_409_plano_existente(client: TestClient, relogio: list[datetime]) -> None:
    assert client.post("/api/plans", json=_corpo()).status_code == 201
    resposta = client.post("/api/plans", json=_corpo())
    assert (resposta.status_code, resposta.json()["code"]) == (409, "plano_existente")


def test_plano_atual_nulo_e_depois_na_mesma_forma_do_201(client: TestClient, relogio: list[datetime]) -> None:
    assert client.get("/api/plans/current").json() == {"plan": None}
    criado = client.post("/api/plans", json=_corpo()).json()
    assert client.get("/api/plans/current").json() == {"plan": criado}


def test_ciclo_sem_plano(client: TestClient, relogio: list[datetime]) -> None:
    assert client.get("/api/cycle").json() == {
        "today": "2026-09-23", "mission": None, "streak": 0, "days_to_milestone": 7, "special": None,
    }


def test_concluir_a_diaria_de_hoje_pela_api(client: TestClient, relogio: list[datetime], session: Session) -> None:
    client.post("/api/plans", json=_corpo())
    missao = client.get("/api/cycle").json()["mission"]
    assert missao["availability"] == "disponivel"

    resposta = _concluir(client, missao["id"])

    assert resposta.status_code == 200
    assert resposta.json()["availability"] == "concluida"
    ciclo = client.get("/api/cycle").json()
    assert (ciclo["streak"], ciclo["days_to_milestone"]) == (1, 6)


def test_o_nao_revelado_responde_o_mesmo_404_de_inexistente(
    client: TestClient, relogio: list[datetime], session: Session
) -> None:
    """Corpo INTEIRO igual, e nao so o status (C11)."""
    client.post("/api/plans", json=_corpo())
    client.post("/api/plans", json=_corpo(SEGUNDA + timedelta(days=7)))
    inexistente = _concluir(client, 999_999)
    ocultas = [
        _id_da_diaria(session, QUARTA + timedelta(days=1)),           # dia futuro desta semana
        _id_da_diaria(session, SEGUNDA + timedelta(days=7)),          # semana seguinte
        session.scalars(                                              # especial bloqueada
            select(Mission.id).where(Mission.mission_type == MissionType.ESPECIAL).order_by(Mission.id)
        ).first(),
    ]
    assert inexistente.status_code == 404
    for mission_id in ocultas:
        assert mission_id is not None
        resposta = _concluir(client, mission_id)
        assert (resposta.status_code, resposta.json()) == (404, inexistente.json())


def test_diaria_perdida_responde_409_missao_expirada(
    client: TestClient, relogio: list[datetime], session: Session
) -> None:
    client.post("/api/plans", json=_corpo())
    relogio[0] = ao_meio_dia(QUARTA + timedelta(days=1))
    resposta = _concluir(client, _id_da_diaria(session, QUARTA))
    assert (resposta.status_code, resposta.json()["code"]) == (409, "missao_expirada")


def test_reenvio_depois_da_meia_noite_pela_api(client: TestClient, relogio: list[datetime], session: Session) -> None:
    client.post("/api/plans", json=_corpo())
    mission_id = _id_da_diaria(session, QUARTA)
    relogio[0] = datetime(2026, 9, 24, 2, 59, 59, tzinfo=UTC)
    primeira = _concluir(client, mission_id, "op-virada")
    relogio[0] = datetime(2026, 9, 24, 3, 0, 1, tzinfo=UTC)
    reenvio = _concluir(client, mission_id, "op-virada")
    assert (reenvio.status_code, reenvio.json()) == (200, primeira.json())


def test_a_semana_inteira_revela_a_especial_de_660_xp(
    client: TestClient, relogio: list[datetime], session: Session
) -> None:
    relogio[0] = ao_meio_dia(SEGUNDA)
    client.post("/api/plans", json=_corpo())
    for i in range(7):
        relogio[0] = ao_meio_dia(SEGUNDA + timedelta(days=i))
        missao = client.get("/api/cycle").json()["mission"]
        assert _concluir(client, missao["id"], f"op-{i}").status_code == 200

    especial = client.get("/api/cycle").json()["special"]
    assert (especial["mission_type"], especial["difficulty"], especial["xp"]) == ("especial", 5, 660)
    assert especial["availability"] == "disponivel"
    concluida = _concluir(client, especial["id"], "op-especial").json()
    assert (concluida["availability"], concluida["xp"]) == ("concluida", 660)


def test_a_listagem_tem_so_avulsas_com_os_campos_novos(client: TestClient, relogio: list[datetime]) -> None:
    client.post("/api/plans", json=_corpo())
    criada = client.post(
        "/api/missions",
        json={"instructions": "a", "completion_criterion": "c", "difficulty": 1,
              "estimated_minutes": 10, "deadline": "2026-10-01T12:00:00Z"},
    ).json()
    lista = client.get("/api/missions").json()
    assert [m["id"] for m in lista] == [criada["id"]]
    assert (criada["mission_type"], criada["day"], criada["availability"]) == ("avulsa", None, "disponivel")
```

- [ ] **Step 2: Rodar e ver reprovar.** Run: `uv run pytest tests/integration/test_cycle_api.py -q --no-cov` — Expected: 404 nas rotas novas e `KeyError`/asserção nos campos novos.

- [ ] **Step 3: `MissionRead`.** Em `schemas.py`:
  - imports: `from datetime import UTC, date, datetime`; do domínio, `MissionType` e `xp_da_missao` (tirar `xp_para_dificuldade` se ficar sem uso); `from focusquest.modules.missions.cycle_domain import Availability`; `from focusquest.modules.missions.cycle_service import MissaoLida`; tirar `ConfigDict` se ficar sem uso.
  - substituir a classe por:

```python
class MissionRead(BaseModel):
    """A missao como a API a publica.

    Nao e mais validada direto do objeto do SQLAlchemy (`from_attributes`):
    `deadline` e `availability` sao DERIVADOS para a diaria e a especial (C10,
    C2), e so o servico sabe deriva-los. Quem publica uma missao passa por
    `da_leitura`, com o que o servico leu.

    Os dois `type: ignore[prop-decorator]` abaixo nao escondem defeito nosso:
    o mypy nao suporta decorador acima de `@property`, e `@computed_field`
    precisa estar acima -- e a ordem que o proprio pydantic documenta.
    """

    id: int
    instructions: str
    completion_criterion: str
    difficulty: int
    estimated_minutes: int
    mission_type: MissionType
    # Data CIVIL do ciclo, sem fuso: a tela a mostra sem conversao.
    day: date | None
    # Obrigatorio na resposta mesmo sendo nulo na COLUNA para diaria e
    # especial: e calculado para elas, e a especial bloqueada nunca e
    # publicada como MissionRead (spec, Endpoints).
    deadline: datetime
    availability: Availability
    state: MissionState
    started_at: datetime | None
    completed_at: datetime | None

    @classmethod
    def da_leitura(cls, lida: MissaoLida) -> "MissionRead":
        missao = lida.missao
        return cls(
            id=missao.id,
            instructions=missao.instructions,
            completion_criterion=missao.completion_criterion,
            difficulty=missao.difficulty,
            estimated_minutes=missao.estimated_minutes,
            mission_type=missao.mission_type,
            day=missao.day,
            deadline=lida.deadline,
            availability=lida.availability,
            state=missao.state,
            started_at=missao.started_at,
            completed_at=missao.completed_at,
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def xp(self) -> int:
        """Derivado do tipo e da dificuldade, nunca armazenado (A4, C9)."""
        return xp_da_missao(self.mission_type, self.difficulty)

    # `actual_duration_minutes`: inalterado.
```

- [ ] **Step 4: Rotas de missão.** Em `router.py`: `from focusquest.modules.missions.cycle_service import leitura_da_avulsa, ler_missao`; o `criar` devolve `MissionRead.da_leitura(leitura_da_avulsa(missao))`; o `listar`, `MissionRead.da_leitura(leitura_da_avulsa(missao))` por item; o `concluir`:

```python
    missao = concluir_missao(
        session, USUARIO_UNICO, mission_id, dados.operation_id, clock=clock
    )
    session.commit()
    # Relida depois do commit, com o relogio lido de novo: a disponibilidade de
    # uma missao concluida e `concluida` em qualquer instante, e o prazo nao
    # depende do instante -- ler a hora de novo nao muda a resposta.
    return MissionRead.da_leitura(ler_missao(session, missao, clock()))
```

Na tutoria: `tutoring/router.py:145` passa a `mission=MissionRead.da_leitura(leitura_da_avulsa(resultado.missao))` (o `context.py` já usa `leitura_da_avulsa` desde a Task 2). A Tifa só cria avulsas; a leitura da avulsa é o que dá o prazo tipado como não nulo.

- [ ] **Step 5: `cycle_schemas.py`:**

```python
"""Contratos de entrada e saida do plano semanal e do ciclo.

Chaves em ingles (contrato), como em schemas.py. A forma da trilha e a MESMA
no 201 do `POST /api/plans` e no `GET /api/plans/current` (spec, Endpoints):
um 201 que mostrasse o que a conclusao por id nega com 404 seria um endpoint
afirmando a existencia do que outro nega.
"""

from datetime import date
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from focusquest.modules.missions.cycle_domain import (
    DIAS_DA_SEMANA,
    MINUTOS_DO_DIA,
    Availability,
)
from focusquest.modules.missions.cycle_service import (
    CicloLido,
    DiaLido,
    EspecialLida,
    PlanoLido,
)
from focusquest.modules.missions.schemas import DIFICULDADE_MAXIMA, MissionRead


def _segunda_feira(dia: date) -> date:
    """`week_start` e segunda-feira (C1). E validacao de forma -- nao depende
    do relogio --, entao e 422, e nao 409."""
    if dia.weekday() != 0:
        raise ValueError("week_start precisa ser uma segunda-feira")
    return dia


class DailyCreate(BaseModel):
    instructions: str = Field(min_length=1)
    completion_criterion: str = Field(min_length=1)
    difficulty: int = Field(ge=1, le=DIFICULDADE_MAXIMA)
    estimated_minutes: int = Field(gt=0, le=MINUTOS_DO_DIA)


class BonusCreate(BaseModel):
    """A especial: sem `difficulty`, que e sempre a maxima (C9). Campo
    desconhecido e 422 (decisao P5): quem manda `difficulty` fica sabendo que
    ela nao e respeitada."""

    model_config = ConfigDict(extra="forbid")

    instructions: str = Field(min_length=1)
    completion_criterion: str = Field(min_length=1)
    estimated_minutes: int = Field(gt=0, le=MINUTOS_DO_DIA)


class PlanCreate(BaseModel):
    week_start: Annotated[date, AfterValidator(_segunda_feira)]
    days: list[DailyCreate] = Field(min_length=DIAS_DA_SEMANA, max_length=DIAS_DA_SEMANA)
    bonus: BonusCreate


class DayRead(BaseModel):
    day: date
    availability: Availability
    mission: MissionRead | None

    @classmethod
    def da_leitura(cls, lido: DiaLido) -> "DayRead":
        missao = None if lido.missao is None else MissionRead.da_leitura(lido.missao)
        return cls(day=lido.dia, availability=lido.availability, mission=missao)


class SpecialRead(BaseModel):
    availability: Availability
    # A sequencia atual modulo 7: o "N de 7" do proximo marco.
    progress: int
    mission: MissionRead | None

    @classmethod
    def da_leitura(cls, lida: EspecialLida) -> "SpecialRead":
        missao = None if lida.missao is None else MissionRead.da_leitura(lida.missao)
        return cls(availability=lida.availability, progress=lida.progresso, mission=missao)


class PlanRead(BaseModel):
    week_start: date
    days: list[DayRead]
    special: SpecialRead

    @classmethod
    def da_leitura(cls, lido: PlanoLido) -> "PlanRead":
        return cls(
            week_start=lido.semana,
            days=[DayRead.da_leitura(dia) for dia in lido.dias],
            special=SpecialRead.da_leitura(lido.especial),
        )


class CurrentPlanRead(BaseModel):
    """"Sem plano" e estado, nao erro: `{"plan": null}` com 200."""

    plan: PlanRead | None


class CycleRead(BaseModel):
    today: date
    mission: MissionRead | None
    streak: int
    days_to_milestone: int
    special: MissionRead | None

    @classmethod
    def da_leitura(cls, lido: CicloLido) -> "CycleRead":
        return cls(
            today=lido.hoje,
            mission=None if lido.missao is None else MissionRead.da_leitura(lido.missao),
            streak=lido.sequencia,
            days_to_milestone=lido.dias_para_o_marco,
            special=None if lido.especial is None else MissionRead.da_leitura(lido.especial),
        )
```

- [ ] **Step 6: `cycle_router.py`:**

```python
"""Transporte HTTP do plano semanal e do ciclo. Mesmas regras de router.py:
contrato validado, caso de uso, commit, contrato de saida -- e nenhum erro
tratado aqui (main.py os traduz)."""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from focusquest.core.clock import Clock, get_clock
from focusquest.modules.missions.cycle_schemas import (
    CurrentPlanRead,
    CycleRead,
    PlanCreate,
    PlanRead,
)
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
    ler_ciclo,
    ler_plano_atual,
)
from focusquest.modules.missions.router import USUARIO_UNICO, SessaoDaRequisicao

router = APIRouter(prefix="/api", tags=["cycle"])

Relogio = Annotated[Clock, Depends(get_clock)]


@router.post("/plans", status_code=status.HTTP_201_CREATED)
def criar(dados: PlanCreate, session: SessaoDaRequisicao, clock: Relogio) -> PlanRead:
    """Cria o plano da semana. O reenvio responde 409 `plano_existente`, e nao
    um plano duplicado (README s6: falhas nao duplicam missoes)."""
    plano = criar_plano(
        session,
        user_id=USUARIO_UNICO,
        semana=dados.week_start,
        diarias=[
            NovaDiaria(
                instructions=dia.instructions,
                completion_criterion=dia.completion_criterion,
                difficulty=dia.difficulty,
                estimated_minutes=dia.estimated_minutes,
            )
            for dia in dados.days
        ],
        especial=NovaEspecial(
            instructions=dados.bonus.instructions,
            completion_criterion=dados.bonus.completion_criterion,
            estimated_minutes=dados.bonus.estimated_minutes,
        ),
        clock=clock,
    )
    session.commit()
    return PlanRead.da_leitura(plano)


@router.get("/plans/current")
def atual(session: SessaoDaRequisicao, clock: Relogio) -> CurrentPlanRead:
    plano = ler_plano_atual(session, USUARIO_UNICO, clock=clock)
    return CurrentPlanRead(plan=None if plano is None else PlanRead.da_leitura(plano))


@router.get("/cycle")
def ciclo(session: SessaoDaRequisicao, clock: Relogio) -> CycleRead:
    return CycleRead.da_leitura(ler_ciclo(session, USUARIO_UNICO, clock=clock))
```

- [ ] **Step 7: `main.py`.** Incluir o router (`from focusquest.modules.missions.cycle_router import router as cycle_router`; `app.include_router(cycle_router)`), os quatro membros de `CodigoDeErro` (`MISSAO_EXPIRADA = "missao_expirada"`, `PLANO_EXISTENTE = "plano_existente"`, `SEMANA_ENCERRADA = "semana_encerrada"`, `SEMANA_DISTANTE = "semana_distante"`), tirar da docstring de `CodigoDeErro` a frase "Os do ciclo diario (...) entram com o erro que os usa" (agora entraram), e os handlers:

```python
@app.exception_handler(MissaoExpiradaError)
def _missao_expirada(request: Request, exc: MissaoExpiradaError) -> JSONResponse:
    """409: o pedido esta certo, o relogio e que recusa. Nada a repetir."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.MISSAO_EXPIRADA)


@app.exception_handler(PlanoExistenteError)
def _plano_existente(request: Request, exc: PlanoExistenteError) -> JSONResponse:
    """409: o cliente confirma o que existe com `GET /api/plans/current`."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.PLANO_EXISTENTE)


@app.exception_handler(SemanaEncerradaError)
def _semana_encerrada(request: Request, exc: SemanaEncerradaError) -> JSONResponse:
    """409, e nao 422: depende do relogio, e regra de relogio nao e validacao
    de schema (spec, Erros)."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.SEMANA_ENCERRADA)


@app.exception_handler(SemanaDistanteError)
def _semana_distante(request: Request, exc: SemanaDistanteError) -> JSONResponse:
    """409 pelo mesmo motivo de `_semana_encerrada`."""
    return _erro(status.HTTP_409_CONFLICT, str(exc), CodigoDeErro.SEMANA_DISTANTE)
```

- [ ] **Step 8: Rodar e ver passar.** Run: `uv run pytest tests -q --no-cov` — Expected: tudo verde (inclusive `test_missions_api.py`, `test_tutoring_*`; um teste existente que compare o corpo inteiro de uma missão precisa ganhar os três campos novos — isso é mudança **aditiva do contrato**, declarada na spec, não acomodação de defeito; registre quais mudaram).

- [ ] **Step 9: Mutações (restaurar cada uma).**
  1. Inverter as recusas em `criar_plano` (encerrada antes de distante) → `test_semana_no_ano_9999_e_distante_e_nao_500` reprova com 500 (`OverflowError`).
  2. `BonusCreate` sem `extra="forbid"` → o caso `bonus-com-dificuldade` reprova.
  3. `DayRead.da_leitura` sempre com `mission` → `test_criar_o_plano_devolve_a_trilha...` reprova.
  4. Handler de `MissaoExpiradaError` removido → `test_diaria_perdida...` reprova com 500.

- [ ] **Step 10: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add src/ tests/
git commit -m "feat(ciclo): rotas do plano semanal e do ciclo, com a ocultacao por 404

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: O `check-e2e` começa de esquema limpo (C17)

**Files:**
- Create: `tests/integration/banco_de_teste.py`, `tests/integration/test_banco_de_teste.py`
- Modify: `tests/integration/conftest.py` (tirar `exigir_banco_de_teste`, usar `recriar_esquema`), `tests/integration/test_migrations.py` (import), `scripts/e2e-env.sh`, `Makefile`

**Interfaces:**
- Produces: `integration.banco_de_teste.exigir_banco_de_teste(engine)`, `recriar_esquema(engine)`, `main()`; alvo `make reset-test-db` (pré-requisito do `check-e2e`, no lugar do `migrate-test`).

- [ ] **Step 1: Teste que reprova.** Criar `tests/integration/test_banco_de_teste.py`:

```python
"""O recomeco do esquema de teste: a guarda diz nao ANTES do DROP."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import Engine, inspect, text

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url

from .banco_de_teste import recriar_esquema
from .conftest import alembic_config

RAIZ = Path(__file__).resolve().parents[2]


def test_recriar_esquema_recusa_o_banco_de_desenvolvimento(settings: Settings) -> None:
    """A guarda so le `engine.url` -- o banco de desenvolvimento nunca e tocado."""
    engine = create_engine_from_url(settings.database_url)
    try:
        with pytest.raises(RuntimeError, match="recusando rodar teste destrutivo"):
            recriar_esquema(engine)
    finally:
        engine.dispose()


def test_recriar_esquema_apaga_tudo_do_banco_de_teste(banco_migrado: Engine) -> None:
    with banco_migrado.begin() as conexao:
        conexao.execute(text("CREATE TABLE sobra_de_execucao (id int)"))
    try:
        recriar_esquema(banco_migrado)
        assert inspect(banco_migrado).get_table_names() == []
    finally:
        command.upgrade(alembic_config(), "head")


def test_o_modulo_como_comando_recusa_o_banco_errado(settings: Settings) -> None:
    """O caminho do `make reset-test-db`: com a variavel de teste apontada para o
    banco de desenvolvimento, o comando sai com erro e sem DROP."""
    ambiente = {**os.environ, "PYTHONPATH": "tests", "FOCUSQUEST_TEST_DATABASE_URL": settings.database_url}
    resultado = subprocess.run(
        [sys.executable, "-m", "integration.banco_de_teste"],
        cwd=RAIZ, env=ambiente, capture_output=True, text=True, check=False,
    )
    assert resultado.returncode != 0
    assert "termine em '_test'" in resultado.stderr
```

- [ ] **Step 2: Rodar e ver reprovar.** Run: `uv run pytest tests/integration/test_banco_de_teste.py -q --no-cov` — Expected: `ModuleNotFoundError: integration.banco_de_teste`.

- [ ] **Step 3: Criar `tests/integration/banco_de_teste.py`.** Mover para ele, **sem mudar o corpo nem a docstring**, a função `exigir_banco_de_teste` de `conftest.py`, e acrescentar:

```python
"""A guarda do banco de teste e o recomeco do esquema, compartilhados.

Dois consumidores: a fixture `banco_migrado` (suite pytest) e o
`make reset-test-db`, pre-requisito do `check-e2e` desde o Incremento B (spec
do ciclo diario, C17: o plano e unico por semana, e um `check-e2e` repetido
reprovaria com `409 plano_existente`). O `scripts/e2e-env.sh` tambem usa a
guarda, no lugar da copia que tinha num heredoc.

Mora em tests/, e nao em src/ (decisao P7 do plano do B): e infraestrutura
DESTRUTIVA de teste, e nenhum caminho da aplicacao deve poder chama-la. Como
comando: `PYTHONPATH=tests uv run python -m integration.banco_de_teste`, o
mesmo arranjo do servidor falso do E2E.
"""

from sqlalchemy import Engine, make_url, text

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url


# def exigir_banco_de_teste(engine: Engine) -> None: ... (movida do conftest)


def recriar_esquema(engine: Engine) -> None:
    """Apaga e recria o schema `public` do banco de teste.

    A guarda vem ANTES do DROP: uma verificacao depois do comando destrutivo
    nao e verificacao, e autopsia.
    """
    exigir_banco_de_teste(engine)
    with engine.begin() as conexao:
        conexao.execute(text("DROP SCHEMA public CASCADE"))
        conexao.execute(text("CREATE SCHEMA public"))


def main() -> None:
    engine = create_engine_from_url(Settings().test_database_url)
    try:
        recriar_esquema(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
```

No `conftest.py`, `banco_migrado` passa a ser `recriar_esquema(engine)` seguido do `command.upgrade(...)` (a docstring dela continua valendo; troque só a frase da guarda por "a guarda e o DROP moram em `banco_de_teste.recriar_esquema`"). `test_migrations.py` importa `exigir_banco_de_teste` de `.banco_de_teste`. Tire de `conftest.py` os imports que ficarem sem uso (`make_url`).

- [ ] **Step 4: `scripts/e2e-env.sh`.** Trocar a guarda de nome do heredoc pela compartilhada, e rodar o heredoc com `PYTHONPATH=tests`:

```bash
url="$(PYTHONPATH=tests uv run python - <<'PY'
from urllib.parse import urlsplit

from focusquest.core.config import Settings
from focusquest.core.database import create_engine_from_url
from integration.banco_de_teste import exigir_banco_de_teste

# A MESMA guarda da suite pytest e do `make reset-test-db` (C17), e nao uma
# copia: ela confere o alvo contra a configuracao E o nome terminado em
# `_test`. Aqui ela protege escrita (o E2E cria planos e missoes).
engine = create_engine_from_url(Settings().test_database_url)
try:
    exigir_banco_de_teste(engine)
except RuntimeError as erro:
    raise SystemExit(f"recusando subir a API do E2E: {erro}") from None
finally:
    engine.dispose()

# (o bloco do provedor em loopback continua igual)
...

print(engine.url.render_as_string(hide_password=False))
PY
)"
```

Atualize o comentário acima do heredoc (ele descrevia a "segunda condição" copiada). `tests/integration/test_e2e_env.py` continua valendo: a mensagem ainda começa com `recusando subir a API do E2E`.

- [ ] **Step 5: `Makefile`.** Acrescentar `reset-test-db` ao `.PHONY`, trocar o pré-requisito do `check-e2e` e criar o alvo:

```make
# `reset-test-db` e PRE-REQUISITO, e nao `migrate-test`: desde o Incremento B
# o E2E semeia um plano semanal, que e unico por semana -- sem esquema limpo,
# o segundo `make check-e2e` seguido reprovaria com 409 (spec do ciclo, C17).
check-e2e: reset-test-db ## Build e testes ponta a ponta com Playwright e axe-core
	cd $(WEB) && VITE_API_URL=/api npm run build
	cd $(WEB) && npx playwright test

reset-test-db: ## DESTRUTIVO: recria o banco de TESTE do zero e aplica as migracoes
	PYTHONPATH=tests uv run python -m integration.banco_de_teste
	uv run alembic -x test=true upgrade head
```

(Mantenha o comentário existente do `check-e2e` sobre `VITE_API_URL`; ajuste a frase que falava de `migrate-test` como pré-requisito.)

- [ ] **Step 6: Rodar.** Run: `uv run pytest tests/integration -q --no-cov` e depois `make check-e2e && make check-e2e` — Expected: verdes; o segundo `check-e2e` seguido também (critério de aceite da C17).

- [ ] **Step 7: Mutações (restaurar cada uma).**
  1. `recriar_esquema` sem a chamada à guarda → `test_recriar_esquema_recusa_o_banco_de_desenvolvimento` reprova (**atenção:** com a mutação, esse teste tentaria dropar o banco de desenvolvimento; rode a mutação com `FOCUSQUEST_DATABASE_URL` apontada para um banco descartável `focusquest_mutacao` criado para isso, ou prove a mutação trocando a guarda por `pass` e confirmando o `DID NOT RAISE` **antes** de qualquer conexão — o `create_engine` é preguiçoso, mas o `engine.begin()` não. Registre o método usado).
  2. `e2e-env.sh` sem a guarda → `test_recusa_banco_sem_sufixo_de_teste` reprova.

- [ ] **Step 8: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add Makefile scripts/e2e-env.sh tests/integration/
git commit -m "test(e2e): check-e2e comeca de esquema limpo com a guarda compartilhada

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Frontend — contrato, data civil e o hook do ciclo

**Files:**
- Modify: `frontend/src/features/missions/types.ts`, `completionFailure.ts`, `completionFailure.test.ts`
- Modify (literais `Mission` de teste, acrescentar `mission_type: 'avulsa', day: null, availability: 'disponivel'` — ou `'concluida'` quando `state: 'concluida'`): `MissionList.test.tsx`, `useMissions.test.tsx`, `useCompleteMission.test.tsx`, `pages/Headquarters.test.tsx`
- Create: `frontend/src/features/missions/civilDate.ts`, `civilDate.test.ts`, `useCycle.ts`, `useCycle.test.tsx`

**Interfaces:**
- Produces: tipos `MissionType`, `Availability`, `Cycle`; `Mission` com `mission_type`, `day`, `availability`; `DAYS_PER_MILESTONE = 7`; `MissionErrorCode` com `'missao_expirada'`; `formatCivilDate(civil: string): string`; `useCycle(): { state: CycleState; reload(): void; refresh(): void }` com `CycleState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'loaded'; cycle: Cycle; refreshFailed: boolean }`.

- [ ] **Step 1: Tipos.** Em `types.ts`, acrescentar:

```ts
/** O tipo da missao (spec do ciclo diario, C4). Dado, nao texto de interface. */
export type MissionType = 'avulsa' | 'diaria' | 'especial'

/**
 * A disponibilidade DERIVADA pela API (nunca gravada): o que ainda pode ser
 * feito, e nao o que foi feito (esse e `state`).
 */
export type Availability =
  | 'fora_do_plano'
  | 'bloqueada'
  | 'disponivel'
  | 'concluida'
  | 'perdida'
  | 'expirada'

/**
 * Dias de sequencia por missao especial. Espelha `DIAS_POR_MARCO`, em
 * src/focusquest/modules/missions/cycle_domain.py, a mao (pendencia 32).
 */
export const DAYS_PER_MILESTONE = 7

/** O dia do ciclo, como `GET /api/cycle` o publica. */
export interface Cycle {
  /** Data CIVIL ("2026-09-25"), sem fuso: mostrada por `formatCivilDate`. */
  today: string
  mission: Mission | null
  streak: number
  days_to_milestone: number
  special: Mission | null
}
```

  No `Mission`, depois de `estimated_minutes`: `mission_type: MissionType`, `/** Data civil da diaria; null fora dela. */ day: string | null`, e depois de `state`: `availability: Availability`. `MissionErrorCode` ganha `| 'missao_expirada'`.

- [ ] **Step 2: Falha nova.** Em `completionFailure.ts`, no `FAILURE_BY_CODE`:

```ts
  missao_expirada: {
    message:
      'O dia desta missão já terminou e ela não pode mais ser concluída. Atualize para ver o estado atual.',
    recovery: 'refresh',
  },
```

  E em `completionFailure.test.ts`, um caso para `missao_expirada` no mesmo formato dos outros (mensagem e `recovery: 'refresh'`).

- [ ] **Step 3: Testes da data civil e do hook, que reprovam.** `civilDate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatCivilDate } from './civilDate'

describe('formatCivilDate', () => {
  // A armadilha que a spec do ciclo nomeia: `new Date('2026-09-21')` e a
  // meia-noite em UTC, e formatada em Sao Paulo vira domingo, 20/09.
  it('mostra o dia que a API mandou, sem conversao de fuso', () => {
    expect(formatCivilDate('2026-09-21')).toBe('segunda-feira, 21/09')
  })

  it('atravessa a virada do ano sem escorregar para o dia anterior', () => {
    expect(formatCivilDate('2027-01-01')).toBe('sexta-feira, 01/01')
  })
})
```

`useCycle.test.tsx` (padrão de `useMissions.test.tsx`: `renderHook`, `routeFetch`, `waitFor`):

```ts
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../../test/fetchRoutes'
import type { Cycle } from './types'
import { useCycle } from './useCycle'

const semPlano: Cycle = { today: '2026-09-23', mission: null, streak: 0, days_to_milestone: 7, special: null }
const comSequencia: Cycle = { ...semPlano, streak: 1, days_to_milestone: 6 }

describe('useCycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('carrega o ciclo', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(semPlano) })
    const { result } = renderHook(() => useCycle())
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', cycle: semPlano, refreshFailed: false })
    })
  })

  it('mostra o erro com a mensagem do cliente HTTP, e o reload tenta de novo', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) =>
        call === 1 ? new Response(null, { status: 503 }) : Response.json(semPlano),
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'error', message: 'O servidor respondeu 503.' })
    })
    act(() => {
      result.current.reload()
    })
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
  })

  it('uma falha que nao e ApiError tem mensagem propria', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nao e json', { status: 200 })))
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'error', message: 'Falha inesperada ao carregar o ciclo.' })
    })
  })

  it('o refresh atualiza sem passar por carregando', async () => {
    routeFetch({ 'GET /api/cycle': (_init, call) => Response.json(call === 1 ? semPlano : comSequencia) })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
    })
    expect(result.current.state.status).toBe('loaded')
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', cycle: comSequencia, refreshFailed: false })
    })
  })

  it('o refresh que falha mantem o ciclo e marca que pode estar desatualizado', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) => (call === 1 ? Response.json(semPlano) : new Response(null, { status: 500 })),
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
    })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'loaded', cycle: semPlano, refreshFailed: true })
    })
  })

  it('o refresh que falha durante um reload nao troca o carregando por nada', async () => {
    let falharRefresh: (resposta: Response) => void = () => undefined
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 1) return Response.json(semPlano)
        if (call === 2) return new Promise<Response>((resolve) => { falharRefresh = resolve })
        return new Promise<Response>(() => undefined) // o reload fica em voo
      },
    })
    const { result } = renderHook(() => useCycle())
    await waitFor(() => {
      expect(result.current.state.status).toBe('loaded')
    })
    act(() => {
      result.current.refresh()
      result.current.reload()
    })
    await act(async () => {
      falharRefresh(new Response(null, { status: 500 }))
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({ status: 'loading' })
  })

  it('um pedido cancelado na desmontagem nao vira erro', async () => {
    routeFetch({ 'GET /api/cycle': () => new Promise<Response>(() => undefined) })
    const { result, unmount } = renderHook(() => useCycle())
    unmount()
    await Promise.resolve()
    expect(result.current.state).toEqual({ status: 'loading' })
  })
})
```

  Se o cancelamento na desmontagem não exercitar o ramo `aborted` (a promessa nunca resolve), troque a rota por uma que rejeite quando o `signal` abortar: `(init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('abortado', 'AbortError'))))` — é o ramo que a cobertura cobra.

- [ ] **Step 4: Rodar e ver reprovar.** Run: `cd frontend && npx vitest run src/features/missions` — Expected: módulos inexistentes, e `tsc` acusa os literais `Mission` sem os campos novos até o Step 5.

- [ ] **Step 5: Implementar.** `civilDate.ts`:

```ts
/**
 * Datas CIVIS do ciclo (`today`, `day`): "2026-09-25", sem hora e sem fuso.
 *
 * Nao sao instantes, e nao passam por conversao de fuso (spec do ciclo, secao
 * "Datas civis versus instantes"). `new Date('2026-09-21')` e a meia-noite em
 * UTC, e formatada em Sao Paulo vira domingo, 20/09 -- o dia errado. Aqui a
 * data e montada ao MEIO-DIA em UTC e formatada em UTC: nenhum fuso entra na
 * conta, e o meio-dia deixa margem de doze horas mesmo se alguem tirar o
 * `timeZone` daqui por engano.
 */
const civilDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
})

export function formatCivilDate(civil: string): string {
  const year = Number(civil.slice(0, 4))
  const month = Number(civil.slice(5, 7))
  const day = Number(civil.slice(8, 10))
  return civilDateFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)))
}
```

`useCycle.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { ApiError, requestJson } from '../../shared/api/client'
import type { Cycle } from './types'

/**
 * Os estados da secao do ciclo, como uniao discriminada (mesmo desenho de
 * `useMissions`). "Sem plano" NAO e um estado daqui: e `loaded` com
 * `cycle.mission === null` -- para a API, sem plano e estado, nao erro.
 *
 * `refreshFailed` existe por causa do `refresh` (decisao P9 do plano do B):
 * a atualizacao silenciosa que falha nao desmonta o que esta na tela, mas a
 * tela precisa dizer que a sequencia pode estar velha.
 */
export type CycleState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; cycle: Cycle; refreshFailed: boolean }

export interface UseCycleResult {
  state: CycleState
  /** Recarrega passando por "carregando". E o "Tentar novamente" do erro. */
  reload: () => void
  /**
   * Atualiza em silencio, SEM passar por "carregando": e o que roda depois de
   * uma conclusao, para a sequencia mudar sem desmontar o cartao concluido.
   */
  refresh: () => void
}

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Falha inesperada ao carregar o ciclo.'
}

export function useCycle(): UseCycleResult {
  const [state, setState] = useState<CycleState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((anterior) => anterior + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    requestJson<Cycle>('/cycle', controller.signal)
      .then((cycle) => {
        setState({ status: 'loaded', cycle, refreshFailed: false })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setState({ status: 'error', message: messageFor(error) })
      })
    return () => {
      controller.abort()
    }
  }, [attempt])

  const refresh = useCallback(() => {
    requestJson<Cycle>('/cycle')
      .then((cycle) => {
        setState({ status: 'loaded', cycle, refreshFailed: false })
      })
      .catch(() => {
        // So marca o que esta carregado: se um reload comecou nesse meio
        // tempo, a tela esta em "carregando" e o reload decide o resto.
        setState((atual) => (atual.status === 'loaded' ? { ...atual, refreshFailed: true } : atual))
      })
  }, [])

  return { state, reload, refresh }
}
```

  Atualizar os literais `Mission` dos testes existentes (lista em **Files**).

- [ ] **Step 6: Rodar e ver passar.** Run: `cd frontend && npm run typecheck && npx vitest run` — Expected: verdes.

- [ ] **Step 7: Mutações.** (1) `formatCivilDate` com `new Date(civil)` e `timeZone: 'America/Sao_Paulo'` → o teste de 21/09 reprova (mostra 20/09). (2) `refresh` passando por `setState({ status: 'loading' })` → o teste "sem passar por carregando" reprova. (3) Tirar o `atual.status === 'loaded' ?` → o teste do reload reprova (vira `loaded` com campos faltando, ou o `tsc` recusa — registre qual).

- [ ] **Step 8: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add frontend/src
git commit -m "feat(ciclo): contrato do ciclo, data civil e hook no frontend

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Frontend — "Missão de hoje" no Quartel-General

**Files:**
- Create: `frontend/src/features/missions/MissionCard.tsx` (extraído de `MissionList.tsx`), `CycleSection.tsx`, `CycleSection.test.tsx`
- Modify: `MissionList.tsx` (usa `MissionCard`; título "Outras missões — tarefas com prazo"), `useCompleteMission.ts` (+ `onCompleted`), `useCompleteMission.test.tsx`, `pages/Headquarters.tsx`, `pages/Headquarters.test.tsx`

**Interfaces:**
- Consumes: Task 7.
- Produces: `MissionCard({ mission, registry, onReload, reloadWaiting, onCompleted? })`; `useCompleteMission(missionId, registry, onCompleted?)`; `CycleSection()`; `data-testid`s que o E2E da Task 9 usa: `cycle`, `cycle-today`, `cycle-no-plan`, `cycle-streak`, `cycle-progress`, `cycle-special`, `cycle-loading`, `cycle-error`, `cycle-retry`, `cycle-stale`, `cycle-refresh`, e os do cartão (`mission-item`, `mission-instructions`, `mission-state`, `mission-complete`, `mission-completion-status`).

- [ ] **Step 1: `onCompleted` em `useCompleteMission`.** Terceiro parâmetro opcional `onCompleted?: () => void`, chamado no `.then`, **depois** do `setState({ status: 'completed', mission })`, e incluído nas dependências do `useCallback`. Docstring: "Quem precisa reagir ao sucesso -- a secao do ciclo atualiza a sequencia -- passa `onCompleted`; o quadro de avulsas nao passa nada." Teste novo em `useCompleteMission.test.tsx`: "chama onCompleted depois do sucesso, e não na falha" (um `vi.fn()`, um POST 200 e um POST 409 `transicao_ilegal`, conferindo `toHaveBeenCalledTimes(1)` só no primeiro).

- [ ] **Step 2: Extrair `MissionCard.tsx`.** Mover de `MissionList.tsx` para `MissionCard.tsx`, **sem mudar o conteúdo**, as constantes `CARD_CLASS`, `COMPLETE_BUTTON_CLASS`, `RELOAD_BUTTON_CLASS`, `RELOAD_WAITING_LABEL`, as funções `completeLabel`, `statusText`, `CompletionControls` e o componente `MissionCard` (agora `export function MissionCard`), com a prop nova `onCompleted?: () => void` repassada a `useCompleteMission(listed.id, registry, onCompleted)`. `MissionList.tsx` fica com `RELOAD_WAITING_ANNOUNCEMENT`, `MissionsContent`, `MissionListHandle` e `MissionList`, importando `MissionCard`. O título do quadro passa a "Outras missões — tarefas com prazo" (decisão P8). `MissionList.test.tsx` continua passando sem mudança (ele testa pelo `data-testid`); se algum teste citar o título antigo, troque-o pelo novo.

- [ ] **Step 3: Testes da seção, que reprovam.** Criar `CycleSection.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestsTo, routeFetch } from '../../test/fetchRoutes'
import { CycleSection } from './CycleSection'
import type { Cycle, Mission } from './types'

const diaria: Mission = {
  id: 31,
  instructions: 'Resolver 5 exercicios de recursao',
  completion_criterion: 'Cinco exercicios corrigidos',
  difficulty: 2,
  estimated_minutes: 45,
  mission_type: 'diaria',
  day: '2026-09-23',
  deadline: '2026-09-24T00:00:00-03:00',
  state: 'pendente',
  availability: 'disponivel',
  started_at: null,
  completed_at: null,
  xp: 40,
  actual_duration_minutes: null,
}
const diariaConcluida: Mission = { ...diaria, state: 'concluida', availability: 'concluida', completed_at: '2026-09-23T15:00:00Z' }
const especial: Mission = {
  ...diaria, id: 38, mission_type: 'especial', day: null, difficulty: 5, xp: 660,
  instructions: 'Prova simulada', deadline: '2026-09-29T00:00:00-03:00',
}

const ciclo = (ajustes: Partial<Cycle> = {}): Cycle => ({
  today: '2026-09-23', mission: diaria, streak: 3, days_to_milestone: 4, special: null, ...ajustes,
})

describe('CycleSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('anuncia o carregamento', () => {
    routeFetch({ 'GET /api/cycle': () => new Promise<Response>(() => undefined) })
    render(<CycleSection />)
    expect(screen.getByRole('status')).toHaveTextContent('Consultando o ciclo…')
  })

  it('sem plano, diz que nao ha diaria e que o dia sem plano nao quebra a sequencia', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo({ mission: null, streak: 0, days_to_milestone: 7 })) })
    render(<CycleSection />)
    expect(await screen.findByTestId('cycle-no-plan')).toHaveTextContent(/não quebra/)
    expect(screen.getByTestId('cycle-progress')).toHaveTextContent('Missão especial: 0 de 7 — faltam 7 dias.')
  })

  it('mostra a data civil de hoje sem conversao de fuso', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo()) })
    render(<CycleSection />)
    expect(await screen.findByTestId('cycle-today')).toHaveTextContent('Hoje é quarta-feira, 23/09.')
  })

  it('mostra a missao de hoje com a sequencia e o progresso ate a especial', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo()) })
    render(<CycleSection />)
    const cartao = await screen.findByTestId('mission-item')
    expect(within(cartao).getByTestId('mission-instructions')).toHaveTextContent(diaria.instructions)
    expect(screen.getByTestId('cycle-streak')).toHaveTextContent('Sequência: 3 dias seguidos')
    expect(screen.getByTestId('cycle-progress')).toHaveTextContent('Missão especial: 3 de 7 — faltam 4 dias.')
  })

  it('usa o singular para um dia', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo({ streak: 1, days_to_milestone: 1 })) })
    render(<CycleSection />)
    expect(await screen.findByTestId('cycle-streak')).toHaveTextContent('Sequência: 1 dia seguido')
    expect(screen.getByTestId('cycle-progress')).toHaveTextContent('Missão especial: 1 de 7 — falta 1 dia.')
  })

  it('concluir a missao de hoje atualiza a sequencia sem desmontar o cartao', async () => {
    const fetchMock = routeFetch({
      'GET /api/cycle': (_init, call) =>
        Response.json(call === 1 ? ciclo() : ciclo({ mission: diariaConcluida, streak: 4, days_to_milestone: 3 })),
      'POST /api/missions/31/complete': () => Response.json(diariaConcluida),
    })
    render(<CycleSection />)
    fireEvent.click(await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }))

    expect(await screen.findByTestId('mission-completion-status')).toHaveTextContent('Missão concluída.')
    await waitFor(() => {
      expect(screen.getByTestId('cycle-streak')).toHaveTextContent('Sequência: 4 dias seguidos')
    })
    // O anuncio continua la: o refresh nao passou por "carregando".
    expect(screen.getByTestId('mission-completion-status')).toHaveTextContent('Missão concluída.')
    expect(requestsTo(fetchMock, 'GET /api/cycle')).toHaveLength(2)
  })

  it('a missao de hoje ja concluida nao oferece Concluir', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo({ mission: diariaConcluida })) })
    render(<CycleSection />)
    await screen.findByTestId('mission-item')
    expect(screen.queryByTestId('mission-complete')).toBeNull()
  })

  it('com a especial vigente, mostra o cartao dela no lugar do progresso', async () => {
    routeFetch({ 'GET /api/cycle': () => Response.json(ciclo({ streak: 7, days_to_milestone: 7, special: especial })) })
    render(<CycleSection />)
    const secao = await screen.findByTestId('cycle-special')
    expect(within(secao).getByRole('heading', { level: 3 })).toHaveTextContent('Missão especial — bônus da sequência')
    expect(within(secao).getByTestId('mission-xp')).toHaveTextContent('660 XP')
    expect(screen.queryByTestId('cycle-progress')).toBeNull()
  })

  it('o erro de carregamento oferece Tentar novamente', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) => (call === 1 ? new Response(null, { status: 503 }) : Response.json(ciclo())),
    })
    render(<CycleSection />)
    const erro = await screen.findByTestId('cycle-error')
    expect(erro).toHaveTextContent('Falha ao carregar o ciclo.')
    fireEvent.click(screen.getByTestId('cycle-retry'))
    expect(await screen.findByTestId('mission-item')).toBeInTheDocument()
  })

  it('se a atualizacao depois da conclusao falha, avisa e oferece Atualizar', async () => {
    routeFetch({
      'GET /api/cycle': (_init, call) => {
        if (call === 2) return new Response(null, { status: 500 })
        return Response.json(call === 1 ? ciclo() : ciclo({ mission: diariaConcluida, streak: 4, days_to_milestone: 3 }))
      },
      'POST /api/missions/31/complete': () => Response.json(diariaConcluida),
    })
    render(<CycleSection />)
    fireEvent.click(await screen.findByRole('button', { name: `Concluir a missão: ${diaria.instructions}` }))
    expect(await screen.findByTestId('cycle-stale')).toHaveTextContent('Não foi possível atualizar a sequência.')
    fireEvent.click(screen.getByTestId('cycle-refresh'))
    await waitFor(() => {
      expect(screen.getByTestId('cycle-streak')).toHaveTextContent('Sequência: 4 dias seguidos')
    })
    expect(screen.queryByTestId('cycle-stale')).toBeNull()
  })
})
```

- [ ] **Step 4: Rodar e ver reprovar.** Run: `cd frontend && npx vitest run src/features/missions/CycleSection.test.tsx` — Expected: módulo inexistente.

- [ ] **Step 5: `CycleSection.tsx`:**

```tsx
import type { ReactElement } from 'react'
import { formatCivilDate } from './civilDate'
import { MissionCard } from './MissionCard'
import { DAYS_PER_MILESTONE, type Cycle } from './types'
import type { CompletionRegistry } from './useCompletionRegistry'
import { useCompletionRegistry } from './useCompletionRegistry'
import { useCycle, type CycleState } from './useCycle'

/** "1 dia seguido" / "3 dias seguidos". */
function streakLabel(days: number): string {
  return days === 1 ? '1 dia seguido' : `${String(days)} dias seguidos`
}

/** "falta 1 dia" / "faltam 4 dias". */
function remainingLabel(days: number): string {
  return days === 1 ? 'falta 1 dia' : `faltam ${String(days)} dias`
}

interface CardProps {
  registry: CompletionRegistry
  onReload: () => void
  reloadWaiting: boolean
  onCompleted: () => void
}

/**
 * O ciclo carregado: a missao de hoje (ou "sem plano"), a sequencia, e o
 * progresso ate a especial -- ou o cartao dela, quando esta vigente.
 *
 * Os cartoes sao os MESMOS do quadro de avulsas (`MissionCard`): a conclusao
 * da diaria segue as mesmas regras de chave e reenvio. O `onCompleted` e o
 * `refresh` silencioso (decisao P9): a sequencia muda sem desmontar o cartao.
 */
function CycleLoaded({
  cycle,
  refreshFailed,
  card,
}: {
  cycle: Cycle
  refreshFailed: boolean
  card: CardProps
}) {
  return (
    <div className="flex flex-col gap-3">
      <p data-testid="cycle-today" className="text-sm text-slate-400">
        Hoje é {formatCivilDate(cycle.today)}.
      </p>
      {cycle.mission === null ? (
        <p data-testid="cycle-no-plan" className="text-sm text-slate-300">
          Sem plano nesta semana: não há diária para hoje. Um dia sem plano não quebra a sua
          sequência.
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-3">
          <MissionCard mission={cycle.mission} {...card} />
        </ul>
      )}
      <p data-testid="cycle-streak" className="text-sm font-medium text-slate-200">
        Sequência: {streakLabel(cycle.streak)}
      </p>
      {cycle.special === null ? (
        <p data-testid="cycle-progress" className="text-sm text-slate-300">
          Missão especial: {cycle.streak % DAYS_PER_MILESTONE} de {DAYS_PER_MILESTONE} —{' '}
          {remainingLabel(cycle.days_to_milestone)}.
        </p>
      ) : (
        <div data-testid="cycle-special">
          <h3 className="mb-2 text-base font-semibold text-emerald-200">
            Missão especial — bônus da sequência
          </h3>
          <ul role="list" className="flex flex-col gap-3">
            <MissionCard mission={cycle.special} {...card} />
          </ul>
        </div>
      )}
      {refreshFailed && (
        <div role="alert" data-testid="cycle-stale" className="text-sm text-amber-200">
          <p>Não foi possível atualizar a sequência.</p>
          <button
            type="button"
            data-testid="cycle-refresh"
            onClick={card.onReload}
            className="mt-2 rounded border border-amber-300/60 px-3 py-1 font-medium text-amber-100 hover:bg-amber-900/40 focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:outline-none"
          >
            Atualizar
          </button>
        </div>
      )}
    </div>
  )
}

/** Um estado por ramo; `ReactElement` faz um estado novo reprovar o `tsc`. */
function CycleContent({ state, card }: { state: CycleState; card: CardProps }): ReactElement {
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" data-testid="cycle-loading" className="text-sm text-slate-400">
          Consultando o ciclo…
        </p>
      )
    case 'error':
      return (
        <div
          role="alert"
          data-testid="cycle-error"
          className="rounded-lg border border-red-500/50 bg-red-950/40 p-4 text-sm text-red-200"
        >
          <p className="font-semibold">Falha ao carregar o ciclo.</p>
          <p className="mt-1">{state.message}</p>
          <button
            type="button"
            data-testid="cycle-retry"
            onClick={card.onReload}
            className="mt-3 rounded border border-red-400/60 px-3 py-1 font-medium text-red-100 hover:bg-red-900/50 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none"
          >
            Tentar novamente
          </button>
        </div>
      )
    case 'loaded':
      return <CycleLoaded cycle={state.cycle} refreshFailed={state.refreshFailed} card={card} />
  }
}

/**
 * "Missão de hoje" no Quartel-General (Incremento B).
 *
 * O registro das conclusoes e PROPRIO desta secao, e nao o do quadro de
 * avulsas: os conjuntos de missoes sao disjuntos (diaria e especial aqui,
 * avulsas la), e cada registro espera so as conclusoes que o reload DELE
 * remontaria.
 */
export function CycleSection() {
  const { state, reload, refresh } = useCycle()
  const { registry, reload: requestReload, waitingForCompletion } = useCompletionRegistry(reload)
  const card: CardProps = {
    registry,
    onReload: requestReload,
    reloadWaiting: waitingForCompletion,
    onCompleted: refresh,
  }
  return (
    <section aria-labelledby="cycle-heading" data-testid="cycle" className="mb-8">
      <h2 id="cycle-heading" className="mb-3 text-lg font-semibold text-slate-200">
        Missão de hoje — sua diária
      </h2>
      <CycleContent state={state} card={card} />
    </section>
  )
}
```

- [ ] **Step 6: Página.** `Headquarters.tsx`: importar `CycleSection` e renderizar `<CycleSection />` entre o `<header>` e o `<MissionList ref={board} />`; na docstring, trocar "O quadro de missoes veio no 1a; o painel da Tifa entrou no 1b-2" por uma frase que inclua "a missao de hoje e a sequencia entraram no B, acima do quadro de avulsas". `Headquarters.test.tsx`: `stubPage` ganha `'GET /api/cycle': () => Response.json({ today: '2026-09-23', mission: null, streak: 0, days_to_milestone: 7, special: null })`; o teste de "uma ida a rede por recurso" ganha `GET /api/cycle` com 1 e o total passa a 4; e um teste novo "compoe a missao de hoje acima do quadro de avulsas" que confere a ordem no DOM (`screen.getByTestId('cycle').compareDocumentPosition(screen.getByTestId('missions')) & Node.DOCUMENT_POSITION_FOLLOWING` diferente de zero).

- [ ] **Step 7: Rodar e ver passar.** Run: `cd frontend && npm run lint && npm run typecheck && npx vitest run --coverage` — Expected: verdes e 100% nos quatro eixos.

- [ ] **Step 8: Mutações.** (1) `onCompleted={reload}` no lugar de `refresh` → "sem desmontar o cartão" reprova (o anúncio some). (2) Tirar o `cycle.special === null ?` (sempre o progresso) → o teste da especial reprova. (3) `streakLabel` sem o singular → o teste do singular reprova.

- [ ] **Step 9: Gate e commit.** Run: `make check` — Expected: EXIT 0 (o E2E existente também, já com a seção na tela).

```bash
git add frontend/src
git commit -m "feat(ciclo): missao de hoje, sequencia e especial no quartel-general

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: E2E do ciclo

**Files:**
- Create: `frontend/tests/e2e/cycle.spec.ts`

- [ ] **Step 1: Escrever o cenário.**

```ts
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { API_URL } from './servers'

/**
 * O ciclo ponta a ponta: semear o plano da semana que a API diz ser a atual,
 * abrir o Quartel-General, concluir a missao de hoje e ver a sequencia.
 *
 * As datas vem do `today` da API, e nunca do relogio do navegador (que roda
 * em Asia/Tokyo, ver `playwright.config.ts`): a data civil que a tela mostra
 * tem de ser a da API, e a meia-noite de Sao Paulo nao e a de Toquio.
 *
 * **Limitacao conhecida (spec, Riscos):** se a semeadura e a conclusao
 * caírem em lados diferentes da meia-noite de Sao Paulo, o cenario reprova.
 * Semear a partir do `today` da API estreita a janela, mas nao a fecha. Sem
 * nova tentativa automatica e sem teste pulado.
 *
 * O esquema e limpo no inicio do `make check-e2e` (C17): esta execucao e a
 * unica dona do plano da semana.
 */
const EXECUCAO = randomUUID().slice(0, 8)

interface CicloDaApi {
  today: string
}

/** A segunda-feira da semana de uma data civil, em aritmetica UTC pura. */
function segundaDe(civil: string): string {
  const dia = new Date(`${civil}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7))
  return dia.toISOString().slice(0, 10)
}

/** "23/09", escrito por extenso: o E2E nao importa o formatador da aplicacao. */
function diaMes(civil: string): string {
  return `${civil.slice(8, 10)}/${civil.slice(5, 7)}`
}

const DIAS = Array.from({ length: 7 }, (_, indice) => ({
  instructions: `Diaria ${String(indice + 1)} do ciclo (e2e ${EXECUCAO})`,
  completion_criterion: `Criterio ${String(indice + 1)} (e2e ${EXECUCAO})`,
  difficulty: 2,
  estimated_minutes: 30,
}))

let hoje = ''
let missaoDeHoje = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: API_URL })
  const ciclo = (await (await api.get('/api/cycle')).json()) as CicloDaApi
  hoje = ciclo.today
  const resposta = await api.post('/api/plans', {
    data: {
      week_start: segundaDe(hoje),
      days: DIAS,
      bonus: {
        instructions: `Especial (e2e ${EXECUCAO})`,
        completion_criterion: `Criterio da especial (e2e ${EXECUCAO})`,
        estimated_minutes: 120,
      },
    },
  })
  expect(resposta.status()).toBe(201)
  missaoDeHoje = DIAS[(new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7]!.instructions
  await api.dispose()
})

async function abrirCiclo(page: Page) {
  await page.goto('/')
  const ciclo = page.getByTestId('cycle')
  await expect(ciclo.getByTestId('mission-instructions')).toHaveText(missaoDeHoje)
  return ciclo
}

test('a missao de hoje do plano semeado aparece com a data civil da API, e passa no axe', async ({ page }) => {
  const ciclo = await abrirCiclo(page)

  await expect(ciclo.getByTestId('cycle-today')).toContainText(diaMes(hoje))
  // O plano foi criado hoje: os dias anteriores estao fora do plano, e a
  // sequencia comeca do zero.
  await expect(ciclo.getByTestId('cycle-progress')).toHaveText(/0 de 7/)

  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])
})

test('concluir a missao de hoje leva a sequencia a 1, no servidor, e a tela concluida passa no axe', async ({ page }) => {
  const ciclo = await abrirCiclo(page)

  await ciclo.getByRole('button', { name: `Concluir a missão: ${missaoDeHoje}` }).click()

  await expect(ciclo.getByTestId('mission-state')).toHaveText('Concluída')
  await expect(ciclo.getByTestId('cycle-streak')).toHaveText('Sequência: 1 dia seguido')
  await expect(ciclo.getByTestId('cycle-progress')).toHaveText(/1 de 7/)

  // Recarregar le do servidor: a conclusao e a sequencia sao do banco.
  await page.reload()
  await expect(ciclo.getByTestId('mission-state')).toHaveText('Concluída')
  await expect(ciclo.getByTestId('cycle-streak')).toHaveText('Sequência: 1 dia seguido')

  const resultado = await new AxeBuilder({ page }).analyze()
  expect(resultado.violations).toEqual([])
})
```

- [ ] **Step 2: Rodar.** Run: `make check-e2e` e, em seguida, de novo `make check-e2e` — Expected: EXIT 0 nas duas (os 11 cenários antigos mais os 2 novos: 13).

- [ ] **Step 3: Mutações.** (1) Na `CycleSection`, `onCompleted` sem nada (tirar o `refresh`) → "1 dia seguido" reprova antes do reload. (2) `formatCivilDate` com `new Date(civil)` e `timeZone: 'America/Sao_Paulo'` → o `cycle-today` reprova no navegador (mostra o dia anterior). Restaurar.

- [ ] **Step 4: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add frontend/tests/e2e/cycle.spec.ts
git commit -m "test(e2e): ciclo semeado pela api, conclusao da diaria e axe

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Documentação

**Files:**
- Modify: `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md`, a spec (se alguma decisão da execução mudou o texto dela, numa seção "Emendas (2026-09-25, execução do B)")

- [ ] **Step 1: HANDOFF.**
  - "Revisão-base": completar o parágrafo do B com a contagem de commits (`git log --oneline 12288a2..HEAD | wc -l`, medida).
  - "Decisões tomadas": seção "Incremento B — decisões que a spec não fixava" com a tabela P1–P10 deste plano, e "Incremento B — decisões tomadas durante a execução" com o que os relatórios das Tasks registraram (mutações que precisaram de outra forma, testes antigos que mudaram pelo contrato aditivo).
  - "Dependências e infraestrutura que entraram no B": `tzdata==2026.4` (a spec: garante a base IANA em qualquer máquina; a base do sistema continua tendo precedência); os três endpoints (`POST /api/plans`, `GET /api/plans/current`, `GET /api/cycle`); o alvo `reset-test-db`; nenhum serviço novo.
  - "Alterações do Incremento B": arquivo a arquivo, como nas seções dos incrementos anteriores.
  - "Resultados": as linhas medidas de `make check` (duas vezes seguidas) e de `make check-e2e` duas vezes seguidas, com os números que a saída mostrar.
  - "Ambiente verificado": acrescentar a máquina Linux (x86_64, kernel 7.0), com as versões medidas nesta sessão (`node --version`, `npm --version`, `uv --version`, `docker --version`, `docker compose version`, `git --version`, `gh --version`, `make --version`) — sem apagar a linha do macOS, que registra onde os incrementos anteriores foram medidos.
  - "Pendências": riscar a **20** (o `check-e2e` começa de esquema limpo); na **26**, registrar que a parte das diárias e especiais foi implementada (teto 1440, prazo derivado) e que a avulsa continua aberta; a **9** cresce (os UNIQUE, o índice parcial e a FK composta são provados por recusa nomeada, não pelo teste de divergência); a **32** cresce (`DAYS_PER_MILESTONE` e `'missao_expirada'` espelhados à mão); a **19** continua. **Novas:** (a) a chave real da Anthropic mora no Keychain do **macOS**, e esta máquina é Linux: não há cofre documentado aqui (`secret-tool` não está instalado), então a chamada real (camada 3, roteiro pela tela) não é reproduzível nesta máquina até o dono decidir onde a chave mora no Linux — nunca no `.env`, pela decisão D-a; (b) o limite conhecido do E2E perto da meia-noite de São Paulo (spec, Riscos); (c) a Tifa não vê as diárias no contexto (`listar_missoes` devolve só avulsas) — ligar o ciclo à tutoria é do incremento que implementar `propose_plan`.
  - "Próximo incremento": B entregue; o próximo é o **C** (trilha em Campanhas, navegação lateral, axe na trilha), que encontra pronto o `GET /api/plans/current`.

- [ ] **Step 2: ARCHITECTURE.** Árvore do §1 regerada com `git ls-files` (os arquivos novos); §3 com o contrato HTTP do ciclo (as três rotas, os quatro códigos, a forma da trilha e do bau fechado, `MissionRead` com os campos novos e a listagem só de avulsas) e o modelo de dados (`weekly_plans`, as colunas novas, as restrições pelo nome); §5 com a razão de o ciclo morar em `missions` (P1).

- [ ] **Step 3: QUALITY.** A seção do `check-e2e` passa a dizer que ele começa de esquema limpo (`reset-test-db`, guarda compartilhada em `tests/integration/banco_de_teste.py`), que a pendência 20 fechou e que a 19 continua; a lista de alvos do §1 ganha `reset-test-db`.

- [ ] **Step 4: Gate duas vezes e commit.** Run: `make check && make check` — Expected: EXIT 0 nas duas.

```bash
git add docs/
git commit -m "docs(ciclo): handoff, arquitetura e qualidade do incremento b

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Publicação (autorizada pelo dono em 2026-09-25).** Uma ref por vez: `git push -u origin feat/incremento-b` (o `pre-push` roda o gate num worktree); `gh pr create` com corpo que liste as Tasks, os resultados medidos e as pendências novas; esperar `gh pr checks` com `quality-gate` verde; `gh pr merge --merge` (merge commit, o padrão do projeto); atualizar a linha "Estado de publicação" do HANDOFF numa branch de documentação **só se** o dono pedir — o registro do PR fica em `gh pr view`.

---

## Autorrevisão do plano contra a spec

- **Cobertura da spec.** C1 (Task 1), C2 (Tasks 1 e 3, nada gravado), C3 (Tasks 2 e 3), C4 (Tasks 1 e 2), C5 (Task 4), C6 (Task 1), C7 (Task 1), C8 (Tasks 1 e 3), C9 (Tasks 1, 2 e 5), C10 (Tasks 2 e 5), C11 (Tasks 3, 4 e 5 — corpo inteiro comparado), C12 (Task 5, quatro códigos novos), C13 (a conclusão continua lendo o relógio depois da trava; a ocultação vem logo depois, Task 4), C14 (nenhuma tela de criar plano), C15 (**não** entra: navegação lateral é do C, decisão P2), C16 (já mesclada no PR #5), C17 (Task 6). "Regras do ciclo" e "Ordem da conclusão": Task 4. "Modelo de dados", inclusive o downgrade que falha alto: Task 2. "Endpoints" e "Erros": Task 5. "Frontend" do QG: Tasks 7 e 8 (a trilha é do C). "Testes": domínio (Task 1), integração (Tasks 2–6), frontend (Tasks 7–8), E2E (Task 9). "Entregas de documentação": Task 10.
- **Placeholders.** Os dois lugares com instrução em vez de código (os literais `Mission` dos testes antigos e o corpo movido de `exigir_banco_de_teste`) são movimentos mecânicos, descritos pelo campo exato a acrescentar ou pelo trecho exato a mover.
- **Consistência de nomes.** `ler_missao`, `leitura_da_avulsa`, `dia_da_diaria`, `MissaoLida`, `MissionRead.da_leitura`, `NAO_CONCLUIVEIS`, `DAYS_PER_MILESTONE`, `refresh`, `onCompleted`: conferidos entre as Tasks.
