# Incremento D — Plano de Implementação (progressão de RPG)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a progressão de RPG: um saldo de XP persistido num livro-razão (`xp_entries`), nível calculado pela curva 100·n, sete conquistas determinísticas (`user_achievements`), tudo creditado na mesma transação do "Concluir" que já existe e retroativo para as missões já concluídas; `GET /api/progress`, o campo `reward` na resposta da conclusão, o painel de progresso no Quartel-General, o anúncio da recompensa no cartão e a linha de progresso no contexto da Tifa.

**Architecture:** Um módulo novo, `progression`, no backend (`src/focusquest/modules/progression/`: `domain.py` puro, `models.py`, `service.py`, `schemas.py`, `router.py`) e no frontend (`frontend/src/features/progression/`). A direção das dependências é única: `missions.service` → `progression.service`; `progression.service` só **lê** modelos e regras de `missions` e o modelo `TutorAction` de `tutoring`. A migração `0004` cria as duas tabelas e faz o backfill retroativo com **cópias congeladas** das regras (regra da casa: migração é histórico). A recompensa devolvida pela API é sempre **reconstruída do banco** depois do commit, no primeiro envio e no reenvio.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 18; React 19, TypeScript, Tailwind 4, Vitest, Testing Library, Playwright + axe-core. **Nenhuma dependência nova.**

**Spec:** `docs/superpowers/specs/2026-09-25-incremento-d-progressao-design.md` (decisões D1–D16, "Modelo de dados", "Domínio puro", "Serviço", "API", "Erros", "Frontend", "A Tifa", "Testes", "Riscos"). Aprovada pelo dono em 2026-09-25.

## Global Constraints

- Interface em pt-BR com acento; contratos externos (colunas, chaves JSON, rotas, códigos de conquista) em inglês; identificadores internos podem ser em português; comentários e docstrings do código em português **sem acento** (README §3, `docs/ARCHITECTURE.md` §5 regra 7).
- `make check` verde antes de cada commit (os hooks o rodam); proibido `--no-verify`, `SKIP`, `|| true`, teste ignorado, diretiva de ignorar cobertura, limiar reduzido, `continue-on-error` (`AGENTS.md` §3).
- Cobertura: 100% de linhas e ramificações em `src/focusquest/`; 100% nos quatro eixos em `frontend/src/` (fontes: `pyproject.toml` e `frontend/vite.config.ts`).
- **Regra da casa (spec, "Testes"):** "todo teste novo é visto reprovando antes do código (RED) e por mutação depois dele; toda guarda nova tem um teste que a faz dizer não." Cada Task lista as mutações; o relatório da Task registra o resultado de cada uma.
- Curva (D4): custo de n→n+1 = **100·n**; XP acumulado para o nível L = **50·L·(L−1)**; aritmética **inteira** (`math.isqrt`); sem teto de nível; nível mínimo 1.
- XP de uma missão = `xp_da_missao(tipo, dificuldade)` de hoje: `20 + 10·d·(d−1)`, ×3 na especial (660). O valor é **congelado** no lançamento (D2).
- Códigos das conquistas (valores exatos, nesta ordem): `first_steps`, `streak_7`, `streak_30`, `veteran_10`, `veteran_50`, `veteran_100`, `tifa_partnership`. Títulos: "Primeiros passos", "Uma semana inteira", "Um mês de hábito", "Veterano I", "Veterano II", "Veterano III", "Parceria com a Tifa". Conquista **não** dá XP (D5).
- `xp_entries.source` só aceita `mission_completed`. `UNIQUE(mission_id)`.
- Endpoint novo único: `GET /api/progress` (chaves `xp_total`, `level`, `level_floor_xp`, `next_level_xp`, `achievements[]` com `code`, `title`, `description`, `unlocked_at`). A conclusão ganha `reward` (`xp_awarded`, `xp_total`, `level_before`, `level_after`, `achievements_unlocked[]` com `code`, `title`, `description`). Nenhum código de erro novo.
- O usuário continua `USUARIO_UNICO` (A2); nenhuma rota recebe usuário de outro lugar.
- Ordem de travas fixa: **missão → usuário** (D12).
- Nenhuma dependência nova. Nenhuma chamada HTTP no frontend fora de `shared/api/`; nenhum import de detalhe interno de outra feature (`docs/ARCHITECTURE.md` §5 regras 1, 3 e 6).
- Aviso além da cor, `role="status"` para anúncios, movimento só sob `motion-safe:` (README §7).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Branch de integração `feat/incremento-d`, a partir de `8ab91ce` (a `main`, merge do PR #14).

## Review Focus

1. **Reenvio antigo depois de outras conclusões.** A pessoa conclui A (fica no nível 2), conclui B (nível 3), e o reenvio de A chega atrasado: tem de devolver **exatamente** o `reward` de A (`xp_total` daquele momento, `level_before`/`level_after` de A, as conquistas de A), nunca o saldo atual. Teste na Task 3 (`test_reenvio_antigo_devolve_a_recompensa_daquele_momento`) e na Task 4 pela API (`test_reenvio_devolve_o_mesmo_corpo_com_reward`).
2. **Duas conclusões simultâneas que cruzam o mesmo limiar** (as duas primeiras missões da vida, em paralelo): as duas ganham XP, `first_steps` existe **uma** vez, e nenhuma das duas recebe 500. Teste na Task 3 (`test_duas_primeiras_conclusoes_em_paralelo_destravam_uma_conquista`).
3. **Falha do banco no meio do crédito.** A missão não pode ficar `concluida` sem lançamento; o cliente recebe o erro de hoje e o reenvio com a mesma chave conclui e credita. Teste na Task 3 (`test_falha_no_credito_desfaz_a_conclusao_e_o_reenvio_funciona`).
4. **Sequência quebrada depois de um marco.** Sete dias seguidos, um dia perdido, dois dias concluídos: `streak_7` continua destravada (é a MAIOR sequência), o XP de todas continua no saldo, `streak_30` não aparece. Teste na Task 3 (`test_a_sequencia_quebrada_mantem_streak_7_e_o_xp`).
5. **Saldo exatamente no piso de um nível e saldo grande.** Com 1.000 XP a barra mostra "0 de 500 XP até o nível 6" (`aria-valuenow=0`), nunca "nível 4" nem barra cheia; com 19.000 XP, "Nível 20" e "19.000 XP no total" formatado em pt-BR. Teste na Task 6 (`o piso do nivel mostra a barra vazia do nivel novo` e `saldo grande formatado em pt-BR`).

---

## Decisões que a spec não fixava (entram no HANDOFF na Task 10)

| # | Decisão | Motivo |
|---|---|---|
| P1 | `registrar_conclusao` é chamado **depois** do `try/flush` que grava a `MissionOperation` em `concluir_missao`, e não antes dele | Antes do `flush`, as consultas de `registrar_conclusao` disparariam o *autoflush* do INSERT da operação **fora** do `try` que traduz a violação da `uq_mission_operations_operation_id` em `OperacaoReutilizadaError` — o reuso de chave em paralelo voltaria a sair como 500. A spec dizia "antes do `flush` final"; a intenção (mesma transação, missão travada) é preservada |
| P2 | A trava do usuário é `SELECT … FOR NO KEY UPDATE` (`with_for_update(key_share=True)`), e não `FOR UPDATE` | `FOR NO KEY UPDATE` conflita consigo mesmo — serializa duas conclusões do mesmo usuário, que é o que D12 pede — mas **não** conflita com o `FOR KEY SHARE` que todo INSERT com FK para `users` toma. Com `FOR UPDATE`, criar uma missão, uma mensagem da Tifa ou um plano esperaria cada conclusão em andamento sem necessidade. A ordem missão → usuário não muda |
| P3 | O painel é atualizado depois de cada conclusão com `refresh()` (silencioso), não `reload()` | `reload` passa por "carregando" e desmontaria o painel a cada Concluir; `refresh` troca os números sem piscar (o mesmo motivo da P9 do B) |
| P4 | O anúncio da recompensa fica **dentro** da região viva que o cartão já tem (`mission-completion-status` passa de `<p>` a `<div role="status">`) | Um `role="status"` novo que nasce já com texto não é anunciado por todo leitor de tela (a região precisa existir antes da mudança); a região do cartão existe desde o primeiro render |
| P5 | Data da conquista mostrada em `America/Sao_Paulo` (`Intl.DateTimeFormat` com `timeZone`), em `features/progression/unlockedDate.ts` | `unlocked_at` é um instante (`TIMESTAMPTZ`), não uma data civil; mostrar no fuso do navegador faria a mesma conquista mudar de dia conforme o computador. É o fuso do ciclo (C1) |
| P6 | O E2E lê `GET /api/progress` antes do Concluir e confere o painel e o anúncio contra `antes + xp da missão` da API | Outros arquivos do E2E também concluem missões; um número fixo quebraria com a ordem dos arquivos |
| P7 | Arquivos de teste novos, nomes: `tests/unit/test_progression_domain.py`, `tests/integration/test_progression_migration.py`, `tests/integration/test_progression_service.py`, `tests/integration/test_progression_concorrencia.py`, `tests/integration/test_progression_api.py` | Um arquivo por camada, como `missions`; a concorrência separada pelo mesmo motivo de `test_missions_concorrencia.py` (conexões reais, commits de verdade) |

## Mapa de arquivos

Backend:

- Create: `src/focusquest/modules/progression/__init__.py` (vazio; Task 1).
- Create: `src/focusquest/modules/progression/domain.py` (Task 1).
- Create: `src/focusquest/modules/progression/models.py`, `alembic/versions/0004_progressao.py` (Task 2); Modify: `alembic/env.py` (Task 2).
- Create: `src/focusquest/modules/progression/service.py` (Task 3); Modify: `src/focusquest/modules/missions/service.py` (Task 3).
- Create: `src/focusquest/modules/progression/schemas.py`, `src/focusquest/modules/progression/router.py` (Task 4); Modify: `src/focusquest/modules/missions/schemas.py`, `src/focusquest/modules/missions/router.py`, `src/focusquest/main.py` (Task 4).
- Modify: `src/focusquest/modules/tutoring/context.py`, `src/focusquest/modules/tutoring/service.py` (Task 5).

Frontend:

- Create: `frontend/src/features/progression/types.ts`, `useProgress.ts`, `unlockedDate.ts`, `ProgressPanel.tsx` (+ testes) (Task 6).
- Create: `frontend/src/shared/types/reward.ts`, `frontend/src/features/missions/RewardAnnouncement.tsx` (+ teste); Modify: `frontend/src/features/missions/useCompleteMission.ts`, `MissionCard.tsx` (+ testes), `frontend/src/index.css` (Task 7).
- Modify: `frontend/src/pages/Headquarters.tsx`, `frontend/src/features/missions/CycleSection.tsx`, `frontend/src/features/missions/MissionList.tsx` (+ testes) (Task 8).
- Modify: `frontend/tests/e2e/cycle.spec.ts` (Task 9).

Docs: `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md` (Tasks 0 e 10).

## Ordem e paralelismo

```
Task 0 ─┬─ Task 1 ─ Task 2 ─ Task 3 ─┬─ Task 4 ─┐
        │                            └─ Task 5  │
        ├─ Task 6 ─┐                            │
        └─ Task 7 ─┴─ Task 8 ───────────────────┴─ Task 9 ─ Task 10
```

- **Paralelas (arquivos disjuntos):** a trilha do backend (1 → 2 → 3) roda ao lado da 6 e da 7, que não dependem do backend (o `fetch` é simulado nos testes); {4, 5} depois da 3. No pico, três implementadores: backend, painel e anúncio.
- **Sequenciais:** 2 depende da 1 (o `models.py` usa o `Codigo` do domínio); 3 depende da 2; 8 depende de 6 e 7; 9 depende de 4 e 8; 10 é a última.
- Rodar em paralelo exige um worktree por tarefa com **banco e portas próprios** (`scripts/novo-worktree.sh`, Frente 0). Sem a Frente 0 mesclada, as tarefas podem ser **escritas** em paralelo, mas os commits (o hook roda `make check`) entram um de cada vez.
- Cada tarefa paralela comita na sua branch; o controlador mescla na `feat/incremento-d` na ordem do diagrama.

---

### Task 0: Revisão-base do Incremento D

**Files:**

- Modify: `docs/HANDOFF.md` (seção "Revisão-base", no topo)
- Add: `docs/superpowers/specs/2026-09-25-incremento-d-progressao-design.md`, este plano

- [ ] **Step 1: Registrar a revisão-base.** Inserir, logo depois de `## Revisão-base`, um parágrafo "**Incremento D — a progressão.**" com: a branch `feat/incremento-d`; a base (`git rev-parse main` na hora — hoje `8ab91ce`, merge do PR #14); a spec e este plano; o recorte (saldo, nível, conquistas; entrega e avaliação ficam para o E); e "**Estado de publicação: não publicado.**"
- [ ] **Step 2: Gate.** Run: `make check` — Expected: EXIT 0 (só documentação mudou).
- [ ] **Step 3: Commit.**

```bash
git add docs/HANDOFF.md docs/superpowers/specs/2026-09-25-incremento-d-progressao-design.md docs/superpowers/plans/2026-09-25-incremento-d.md
git commit -m "docs(progressao): spec e plano do incremento d, revisao-base

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: O domínio puro da progressão

**Files:**

- Create: `src/focusquest/modules/progression/__init__.py` (vazio), `src/focusquest/modules/progression/domain.py`
- Test: `tests/unit/test_progression_domain.py`

**Interfaces:**

- Consumes: `focusquest.modules.missions.cycle_domain.Historico`, `sequencia_ate`.
- Produces (usado pelas Tasks 3, 4 e 5):
  - `CUSTO_POR_NIVEL: int = 100`
  - `xp_para_o_nivel(nivel: int) -> int`, `nivel_do_saldo(xp: int) -> int`
  - `@dataclass(frozen=True) FaixaDoNivel(nivel: int, piso: int, proximo: int)`; `faixa_do_nivel(xp: int) -> FaixaDoNivel`
  - `class Codigo(StrEnum)` com os sete códigos
  - `@dataclass(frozen=True) FatosDoUsuario(missoes_concluidas: int, maior_sequencia: int, concluiu_missao_da_tifa: bool)`
  - `@dataclass(frozen=True) Conquista(codigo: Codigo, titulo: str, descricao: str, regra: Callable[[FatosDoUsuario], bool])`; `CATALOGO: tuple[Conquista, ...]` na ordem do Global Constraints; `CONQUISTA_POR_CODIGO: Mapping[Codigo, Conquista]`
  - `conquistas_satisfeitas(fatos: FatosDoUsuario) -> frozenset[Codigo]`
  - `maior_sequencia(historico: Historico) -> int`

- [ ] **Step 1: Testes que reprovam.** `tests/unit/test_progression_domain.py`:

```python
"""A curva de nivel e o catalogo de conquistas: regras puras (spec, D4 e D9)."""

from datetime import date, timedelta

import pytest

from focusquest.modules.missions.cycle_domain import DiaDoPlano
from focusquest.modules.progression.domain import (
    CATALOGO,
    Codigo,
    FaixaDoNivel,
    FatosDoUsuario,
    conquistas_satisfeitas,
    faixa_do_nivel,
    maior_sequencia,
    nivel_do_saldo,
    xp_para_o_nivel,
)

SEGUNDA = date(2026, 9, 21)


@pytest.mark.parametrize(
    ("xp", "nivel"),
    [(0, 1), (99, 1), (100, 2), (299, 2), (300, 3), (999, 4), (1000, 5), (19000, 20)],
)
def test_nivel_do_saldo_nas_bordas(xp: int, nivel: int) -> None:
    assert nivel_do_saldo(xp) == nivel


@pytest.mark.parametrize(
    ("nivel", "xp"), [(1, 0), (2, 100), (3, 300), (5, 1000), (10, 4500), (20, 19000)]
)
def test_xp_para_o_nivel_e_a_tabela_da_spec(nivel: int, xp: int) -> None:
    assert xp_para_o_nivel(nivel) == xp


def test_nivel_do_saldo_e_o_inverso_da_curva_ate_o_nivel_200() -> None:
    for nivel in range(1, 201):
        piso = xp_para_o_nivel(nivel)
        assert nivel_do_saldo(piso) == nivel
        assert nivel_do_saldo(piso - 1) == max(1, nivel - 1)


def test_saldo_negativo_e_recusado() -> None:
    with pytest.raises(ValueError, match="saldo"):
        nivel_do_saldo(-1)


def test_nivel_zero_e_recusado() -> None:
    with pytest.raises(ValueError, match="nivel"):
        xp_para_o_nivel(0)


@pytest.mark.parametrize(
    ("xp", "faixa"),
    [
        (0, FaixaDoNivel(1, 0, 100)),
        (1000, FaixaDoNivel(5, 1000, 1500)),
        (1340, FaixaDoNivel(5, 1000, 1500)),
        (1499, FaixaDoNivel(5, 1000, 1500)),
    ],
)
def test_faixa_do_nivel(xp: int, faixa: FaixaDoNivel) -> None:
    assert faixa_do_nivel(xp) == faixa


def test_o_catalogo_tem_os_sete_codigos_na_ordem_do_painel() -> None:
    assert [c.codigo.value for c in CATALOGO] == [
        "first_steps",
        "streak_7",
        "streak_30",
        "veteran_10",
        "veteran_50",
        "veteran_100",
        "tifa_partnership",
    ]
    assert [c.titulo for c in CATALOGO] == [
        "Primeiros passos",
        "Uma semana inteira",
        "Um mês de hábito",
        "Veterano I",
        "Veterano II",
        "Veterano III",
        "Parceria com a Tifa",
    ]


def _fatos(concluidas: int = 0, sequencia: int = 0, tifa: bool = False) -> FatosDoUsuario:
    return FatosDoUsuario(
        missoes_concluidas=concluidas, maior_sequencia=sequencia, concluiu_missao_da_tifa=tifa
    )


@pytest.mark.parametrize(
    ("codigo", "abaixo", "no_limite"),
    [
        (Codigo.FIRST_STEPS, _fatos(concluidas=0), _fatos(concluidas=1)),
        (Codigo.STREAK_7, _fatos(sequencia=6), _fatos(sequencia=7)),
        (Codigo.STREAK_30, _fatos(sequencia=29), _fatos(sequencia=30)),
        (Codigo.VETERAN_10, _fatos(concluidas=9), _fatos(concluidas=10)),
        (Codigo.VETERAN_50, _fatos(concluidas=49), _fatos(concluidas=50)),
        (Codigo.VETERAN_100, _fatos(concluidas=99), _fatos(concluidas=100)),
        (Codigo.TIFA_PARTNERSHIP, _fatos(tifa=False), _fatos(tifa=True)),
    ],
)
def test_cada_regra_no_limite(
    codigo: Codigo, abaixo: FatosDoUsuario, no_limite: FatosDoUsuario
) -> None:
    assert codigo not in conquistas_satisfeitas(abaixo)
    assert codigo in conquistas_satisfeitas(no_limite)


def _dias(inicio: date, concluidas: list[bool]) -> dict[date, DiaDoPlano]:
    return {
        inicio + timedelta(days=i): DiaDoPlano(concluida=feita, plano_criado_em=inicio)
        for i, feita in enumerate(concluidas)
    }


def test_maior_sequencia_sem_historico_e_zero() -> None:
    assert maior_sequencia({}) == 0


def test_maior_sequencia_e_a_maior_ja_atingida_nao_a_atual() -> None:
    historico = _dias(SEGUNDA, [True] * 7 + [False] + [True] * 2)
    assert maior_sequencia(historico) == 7
```

  Run: `uv run pytest tests/unit/test_progression_domain.py -q --no-cov` — Expected: FAIL (`ModuleNotFoundError: focusquest.modules.progression`).

- [ ] **Step 2: Implementar.** `src/focusquest/modules/progression/__init__.py` vazio. `src/focusquest/modules/progression/domain.py`:

```python
"""Regras puras da progressao: a curva de nivel e o catalogo de conquistas.

Nenhuma funcao daqui toca o banco nem le o relogio (spec, "Dominio puro"). A
migracao 0004 tem COPIAS CONGELADAS destas regras (D8): mudar algo aqui nao
reescreve o passado, e o teste de equivalencia da Task 3 so vale para a regra
de hoje.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from math import isqrt

from focusquest.modules.missions.cycle_domain import Historico, sequencia_ate

# D4: subir do nivel n para o n+1 custa 100*n XP. O XP acumulado para estar
# no nivel L e a soma 100*(1 + 2 + ... + (L-1)) = 50*L*(L-1).
CUSTO_POR_NIVEL = 100


def xp_para_o_nivel(nivel: int) -> int:
    """XP acumulado para ESTAR no nivel `nivel` (o piso do nivel)."""
    if nivel < 1:
        raise ValueError(f"nivel precisa ser >= 1, recebido {nivel}")
    return CUSTO_POR_NIVEL * nivel * (nivel - 1) // 2


def nivel_do_saldo(xp: int) -> int:
    """O maior nivel L com xp_para_o_nivel(L) <= xp, so com inteiros.

    L*(L-1) <= xp/50 equivale a L*(L-1) <= xp//50, porque o lado esquerdo e
    inteiro. A raiz inteira resolve a inequacao sem ponto flutuante: com
    float, saldos grandes arredondariam para o nivel errado bem no piso.
    """
    if xp < 0:
        raise ValueError(f"saldo precisa ser >= 0, recebido {xp}")
    metade = CUSTO_POR_NIVEL // 2
    return (1 + isqrt(1 + 4 * (xp // metade))) // 2


@dataclass(frozen=True)
class FaixaDoNivel:
    """O nivel e os dois pisos que o painel mostra ("340 / 500 XP")."""

    nivel: int
    piso: int
    proximo: int


def faixa_do_nivel(xp: int) -> FaixaDoNivel:
    nivel = nivel_do_saldo(xp)
    return FaixaDoNivel(nivel, xp_para_o_nivel(nivel), xp_para_o_nivel(nivel + 1))


class Codigo(StrEnum):
    """O codigo da conquista: contrato da API e valor da coluna, em ingles."""

    FIRST_STEPS = "first_steps"
    STREAK_7 = "streak_7"
    STREAK_30 = "streak_30"
    VETERAN_10 = "veteran_10"
    VETERAN_50 = "veteran_50"
    VETERAN_100 = "veteran_100"
    TIFA_PARTNERSHIP = "tifa_partnership"


@dataclass(frozen=True)
class FatosDoUsuario:
    """O que as regras precisam saber do usuario, ja lido do banco."""

    missoes_concluidas: int
    maior_sequencia: int
    concluiu_missao_da_tifa: bool


@dataclass(frozen=True)
class Conquista:
    codigo: Codigo
    titulo: str
    descricao: str
    regra: Callable[[FatosDoUsuario], bool]


# A ordem e a do painel (spec, "Catalogo"). Titulos e descricoes sao texto de
# interface, em pt-BR com acento; trocar um deles nao mexe no banco (D9).
CATALOGO: tuple[Conquista, ...] = (
    Conquista(
        Codigo.FIRST_STEPS,
        "Primeiros passos",
        "Conclua a sua primeira missão.",
        lambda f: f.missoes_concluidas >= 1,
    ),
    Conquista(
        Codigo.STREAK_7,
        "Uma semana inteira",
        "Complete a diária 7 dias seguidos.",
        lambda f: f.maior_sequencia >= 7,
    ),
    Conquista(
        Codigo.STREAK_30,
        "Um mês de hábito",
        "Complete a diária 30 dias seguidos.",
        lambda f: f.maior_sequencia >= 30,
    ),
    Conquista(
        Codigo.VETERAN_10,
        "Veterano I",
        "Conclua 10 missões.",
        lambda f: f.missoes_concluidas >= 10,
    ),
    Conquista(
        Codigo.VETERAN_50,
        "Veterano II",
        "Conclua 50 missões.",
        lambda f: f.missoes_concluidas >= 50,
    ),
    Conquista(
        Codigo.VETERAN_100,
        "Veterano III",
        "Conclua 100 missões.",
        lambda f: f.missoes_concluidas >= 100,
    ),
    Conquista(
        Codigo.TIFA_PARTNERSHIP,
        "Parceria com a Tifa",
        "Conclua uma missão proposta pela Tifa.",
        lambda f: f.concluiu_missao_da_tifa,
    ),
)

CONQUISTA_POR_CODIGO: Mapping[Codigo, Conquista] = {c.codigo: c for c in CATALOGO}


def conquistas_satisfeitas(fatos: FatosDoUsuario) -> frozenset[Codigo]:
    """Os codigos cuja regra vale para estes fatos. A regra UNICA (D9)."""
    return frozenset(c.codigo for c in CATALOGO if c.regra(fatos))


def maior_sequencia(historico: Historico) -> int:
    """A maior sequencia JA atingida (D13), nao a atual.

    `sequencia_ate` conta para tras a partir de um dia com a regra do ciclo
    (dia sem plano nao quebra); o maximo sobre todos os dias do historico e a
    maior sequencia que existiu. Quadratico no numero de dias planejados --
    o mesmo custo declarado da C2, desprezivel com usuario unico.
    """
    return max((sequencia_ate(historico, dia) for dia in historico), default=0)
```

- [ ] **Step 3: Ver passar.** Run: `uv run pytest tests/unit/test_progression_domain.py -q --no-cov && uv run ruff check src tests && uv run mypy src tests` — Expected: verdes.
- [ ] **Step 4: Mutações** (cada uma aplicada, vista reprovando, desfeita; conferir com `diff` contra backup): (1) `CUSTO_POR_NIVEL * nivel * (nivel - 1) // 2` → `CUSTO_POR_NIVEL * nivel * nivel // 2` — reprova a tabela; (2) `(1 + isqrt(...)) // 2` → `isqrt(...) // 2` — reprova as bordas; (3) trocar `isqrt` por `int(math.sqrt(...))` com `xp // metade` → `xp / metade` — reprova `test_nivel_do_saldo_e_o_inverso_da_curva_ate_o_nivel_200` ou as bordas (registrar qual); (4) `>= 7` → `> 7` em `STREAK_7` — reprova o limite; (5) `default=0` → sem `default` — reprova o histórico vazio; (6) `max(...)` → `sequencia_ate(historico, max(historico))` (a sequência ATUAL) — reprova `test_maior_sequencia_e_a_maior_ja_atingida_nao_a_atual`; (7) tirar a guarda de saldo negativo — reprova o teste dela.
- [ ] **Step 5: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add src/focusquest/modules/progression/__init__.py src/focusquest/modules/progression/domain.py tests/unit/test_progression_domain.py
git commit -m "feat(progressao): curva de nivel e catalogo de conquistas

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Modelos e migração 0004 com o backfill retroativo

**Files:**

- Create: `src/focusquest/modules/progression/models.py`, `alembic/versions/0004_progressao.py`
- Modify: `alembic/env.py` (importar os modelos novos)
- Test: `tests/integration/test_progression_migration.py`

**Interfaces:**

- Consumes: Task 1 (`Codigo`); `focusquest.core.base.Base`; tabelas `users`, `missions`, `weekly_plans`, `tutor_actions` (0001–0003).
- Produces (usado pelas Tasks 3 e 4):
  - `FONTE_CONCLUSAO: str = "mission_completed"`
  - `class XpEntry(Base)` (`__tablename__ = "xp_entries"`): `id`, `user_id`, `mission_id`, `amount`, `source`, `credited_at`
  - `class UserAchievement(Base)` (`__tablename__ = "user_achievements"`): `user_id`, `code`, `unlocked_at`, `xp_entry_id`
  - Nomes de restrição: `uq_xp_entries_mission_id`, `ck_xp_entries_amount`, `ck_xp_entries_source`, `ck_user_achievements_code`, PK `pk_user_achievements` em (`user_id`, `code`); índices `ix_xp_entries_user_id_id`, `ix_user_achievements_xp_entry_id`.

- [ ] **Step 1: Testes que reprovam.** `tests/integration/test_progression_migration.py`. Siga o padrão de `tests/integration/test_migrations.py` (`test_a_0003_transforma_as_missoes_existentes_em_avulsas`: `command.downgrade(alembic_config(), "0003")`, popular com SQL cru numa conexão commitada, `command.upgrade(alembic_config(), "head")` e **sempre** voltar a `head` num `finally`, apagando só o que o teste inseriu). Cenário populado (`_popular_em_0003`), no usuário 1:
  - uma avulsa dificuldade 2 concluída em `2026-09-10T15:00Z`;
  - um plano da semana de `2026-09-14` criado em `2026-09-14T12:00Z` com 7 diárias dificuldade 1, concluídas de segunda a domingo às 15:00Z de cada dia (7 dias seguidos), e a especial concluída em `2026-09-21T15:00Z`;
  - uma avulsa dificuldade 3 criada por uma `tutor_actions` `create_mission` `executada` (com a `tutor_messages` de que ela depende), concluída em `2026-09-22T15:00Z`;
  - uma avulsa `pendente` (não pode gerar lançamento).

  Testes:
  - `test_a_0004_cria_as_tabelas_e_o_downgrade_as_remove` — `inspect(engine).get_table_names()` em `head` contém `xp_entries` e `user_achievements`; depois de `downgrade("0003")`, não contém; `missions` intacta.
  - `test_o_backfill_lanca_o_xp_de_cada_missao_concluida_na_ordem_historica` — 10 lançamentos (1 + 7 + 1 + 1), nenhum para a pendente; `amount` = 40, sete × 20, 660, 80; `credited_at` = o `completed_at` de cada missão; os `id` crescem na ordem de (`completed_at`, `missions.id`).
  - `test_o_backfill_destrava_as_conquistas_na_data_em_que_a_condicao_valeu` — `first_steps` em `2026-09-10T15:00Z` (a primeira avulsa), `streak_7` em `2026-09-20T15:00Z` (o domingo), `veteran_10` em `2026-09-22T15:00Z` (a 10ª), `tifa_partnership` em `2026-09-22T15:00Z`; nenhuma `streak_30`, `veteran_50`, `veteran_100`; cada uma com `xp_entry_id` = o lançamento da missão daquela data.
  - `test_o_backfill_falha_alto_com_missao_concluida_sem_data` — a restrição do 0001 impede esse estado, então o teste apaga a restrição dentro do teste (`ALTER TABLE missions DROP CONSTRAINT ...` numa conexão em `0003`, recriando-a no `finally`), insere a linha, e espera que `command.upgrade` levante `RuntimeError` com "completed_at" na mensagem. Se a restrição que amarra `state` e `completed_at` não existir no 0001, o implementador registra isso no relatório e o teste insere a linha direto.
  - `test_as_restricoes_novas_dizem_nao` (na `session` com rollback, em `head`): `amount = 0` → `IntegrityError` com `ck_xp_entries_amount`; `source = 'bonus'` → `ck_xp_entries_source`; dois lançamentos da mesma missão → `uq_xp_entries_mission_id`; `code = 'secreta'` → `ck_user_achievements_code`; a mesma (usuário, código) duas vezes → `pk_user_achievements`. Um `pytest.mark.parametrize` com um `savepoint` por caso (`session.begin_nested()`), como os testes de restrição de `test_cycle_models.py`.

  Run: `uv run pytest tests/integration/test_progression_migration.py -q --no-cov` — Expected: FAIL (`xp_entries` não existe / revisão `0004` desconhecida).

- [ ] **Step 2: Implementar os modelos.** `src/focusquest/modules/progression/models.py`:

```python
"""Mapeamento SQLAlchemy da progressao: o livro-razao e as conquistas (D2, D5)."""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from focusquest.core.base import Base
from focusquest.modules.progression.domain import Codigo

# A unica fonte de XP do D. O E acrescenta outras, e a unicidade passa a ser
# (mission_id, source) -- registrado na spec, "Modelo de dados".
FONTE_CONCLUSAO = "mission_completed"

_CODIGOS_SQL = ", ".join(f"'{codigo.value}'" for codigo in Codigo)


class XpEntry(Base):
    """Um lancamento de XP: o valor CONGELADO no instante do credito."""

    __tablename__ = "xp_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(Text)
    credited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("mission_id", name="uq_xp_entries_mission_id"),
        CheckConstraint("amount > 0", name="ck_xp_entries_amount"),
        CheckConstraint(f"source IN ('{FONTE_CONCLUSAO}')", name="ck_xp_entries_source"),
        Index("ix_xp_entries_user_id_id", "user_id", "id"),
    )


class UserAchievement(Base):
    """Uma conquista destravada, com o lancamento que a destravou (D6)."""

    __tablename__ = "user_achievements"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(Text)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    xp_entry_id: Mapped[int] = mapped_column(
        ForeignKey("xp_entries.id", ondelete="CASCADE")
    )

    __table_args__ = (
        PrimaryKeyConstraint("user_id", "code", name="pk_user_achievements"),
        CheckConstraint(f"code IN ({_CODIGOS_SQL})", name="ck_user_achievements_code"),
        Index("ix_user_achievements_xp_entry_id", "xp_entry_id"),
    )
```

  Em `alembic/env.py`, junto dos outros dois: `import focusquest.modules.progression.models  # noqa: F401`.

- [ ] **Step 3: Implementar a migração.** `alembic/versions/0004_progressao.py`:

```python
"""Progressao: o livro-razao de XP e as conquistas, com o retroativo.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# ---------------------------------------------------------------------------
# Copias CONGELADAS, NAO import (D8; ver 0001 e 0003): migracao e historico.
# Elas descrevem a regra de 2026-09-25. O teste de equivalencia (Task 3)
# amarra estas copias a regra viva DAQUELE dia; depois dele, divergir e
# permitido e nao reescreve o passado.
# ---------------------------------------------------------------------------
FONTE = "mission_completed"
CODIGOS = (
    "first_steps",
    "streak_7",
    "streak_30",
    "veteran_10",
    "veteran_50",
    "veteran_100",
    "tifa_partnership",
)
_CODIGOS_SQL = ", ".join(f"'{codigo}'" for codigo in CODIGOS)
FUSO_DO_CICLO = ZoneInfo("America/Sao_Paulo")
_UM_DIA = timedelta(days=1)


def _xp(tipo: str, dificuldade: int) -> int:
    xp = 20 + 10 * dificuldade * (dificuldade - 1)
    return xp * 3 if tipo == "especial" else xp


@dataclass
class _Dia:
    concluida: bool
    plano_criado_em: date


def _sequencia_ate(historico: dict[date, _Dia], dia: date) -> int:
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


def _maior_sequencia(historico: dict[date, _Dia]) -> int:
    return max((_sequencia_ate(historico, dia) for dia in historico), default=0)


def _satisfeitas(concluidas: int, maior: int, tifa: bool) -> set[str]:
    regras = {
        "first_steps": concluidas >= 1,
        "streak_7": maior >= 7,
        "streak_30": maior >= 30,
        "veteran_10": concluidas >= 10,
        "veteran_50": concluidas >= 50,
        "veteran_100": concluidas >= 100,
        "tifa_partnership": tifa,
    }
    return {codigo for codigo, vale in regras.items() if vale}


@dataclass
class _Estado:
    historico: dict[date, _Dia]
    concluidas: int = 0
    tifa: bool = False


def upgrade() -> None:
    op.create_table(
        "xp_entries",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "mission_id",
            sa.Integer,
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("source", sa.Text, nullable=False),
        sa.Column("credited_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("mission_id", name="uq_xp_entries_mission_id"),
        sa.CheckConstraint("amount > 0", name="ck_xp_entries_amount"),
        sa.CheckConstraint(f"source IN ('{FONTE}')", name="ck_xp_entries_source"),
    )
    op.create_index("ix_xp_entries_user_id_id", "xp_entries", ["user_id", "id"])
    op.create_table(
        "user_achievements",
        sa.Column(
            "user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("code", sa.Text, nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "xp_entry_id",
            sa.Integer,
            sa.ForeignKey("xp_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id", "code", name="pk_user_achievements"),
        sa.CheckConstraint(f"code IN ({_CODIGOS_SQL})", name="ck_user_achievements_code"),
    )
    op.create_index(
        "ix_user_achievements_xp_entry_id", "user_achievements", ["xp_entry_id"]
    )
    _backfill(op.get_bind())


def _backfill(conexao: sa.Connection) -> None:
    """D7: lanca o XP de toda missao ja concluida e destrava as conquistas
    na data em que a condicao valeu pela primeira vez."""
    da_tifa = set(
        conexao.execute(
            sa.text(
                "SELECT mission_id FROM tutor_actions "
                "WHERE kind = 'create_mission' AND state = 'executada' "
                "AND mission_id IS NOT NULL"
            )
        ).scalars()
    )
    estados: dict[int, _Estado] = {}
    dia_da_diaria: dict[int, date] = {}
    for user_id, mission_id, dia, criado_em in conexao.execute(
        sa.text(
            "SELECT m.user_id, m.id, m.day, p.created_at FROM missions m "
            "JOIN weekly_plans p ON p.id = m.plan_id WHERE m.mission_type = 'diaria'"
        )
    ):
        estado = estados.setdefault(user_id, _Estado(historico={}))
        estado.historico[dia] = _Dia(False, criado_em.astimezone(FUSO_DO_CICLO).date())
        dia_da_diaria[mission_id] = dia

    concluidas = conexao.execute(
        sa.text(
            "SELECT id, user_id, mission_type, difficulty, completed_at FROM missions "
            "WHERE state = 'concluida' ORDER BY completed_at, id"
        )
    ).all()
    destravadas: dict[int, set[str]] = {}
    for mission_id, user_id, tipo, dificuldade, completed_at in concluidas:
        if completed_at is None:
            raise RuntimeError(
                f"missao {mission_id} concluida sem completed_at: o backfill nao inventa data"
            )
        entrada = conexao.execute(
            sa.text(
                "INSERT INTO xp_entries (user_id, mission_id, amount, source, credited_at) "
                "VALUES (:u, :m, :a, :s, :c) RETURNING id"
            ),
            {"u": user_id, "m": mission_id, "a": _xp(tipo, dificuldade), "s": FONTE, "c": completed_at},
        ).scalar_one()
        estado = estados.setdefault(user_id, _Estado(historico={}))
        if mission_id in dia_da_diaria:
            estado.historico[dia_da_diaria[mission_id]].concluida = True
        estado.concluidas += 1
        estado.tifa = estado.tifa or mission_id in da_tifa
        ja = destravadas.setdefault(user_id, set())
        novas = _satisfeitas(estado.concluidas, _maior_sequencia(estado.historico), estado.tifa) - ja
        for codigo in sorted(novas, key=CODIGOS.index):
            conexao.execute(
                sa.text(
                    "INSERT INTO user_achievements (user_id, code, unlocked_at, xp_entry_id) "
                    "VALUES (:u, :c, :t, :e)"
                ),
                {"u": user_id, "c": codigo, "t": completed_at, "e": entrada},
            )
        ja |= novas


def downgrade() -> None:
    op.drop_table("user_achievements")
    op.drop_table("xp_entries")
```

  (`ruff format` pode quebrar as linhas longas; aceite o formato dele.)

- [ ] **Step 4: Ver passar.** Run: `uv run pytest tests/integration/test_progression_migration.py tests/integration/test_migrations.py -q --no-cov` — Expected: verdes (os testes antigos de migração continuam passando com a `0004` no fim da cadeia; se `test_downgrade_apaga_e_upgrade_devolve_o_esquema` listar tabelas, atualize a lista esperada — mudança da Task, com justificativa no relatório).
- [ ] **Step 5: Mutações.** (1) Tirar o `* 3` da especial na cópia congelada — reprova os valores do backfill; (2) `ORDER BY completed_at, id` → `ORDER BY id` com a avulsa da Tifa criada **antes** das diárias — reprova as datas das conquistas (o cenário insere as linhas fora da ordem de conclusão para isso ser discriminante: o implementador garante e registra); (3) `_maior_sequencia` → `_sequencia_ate(historico, max(historico))` — reprova `streak_7` quando o cenário tiver um dia perdido depois dos sete (acrescentar ao cenário a diária de segunda seguinte **perdida**, sem conclusão, se ainda não houver); (4) tirar a guarda `completed_at is None` — reprova o teste de falha alta; (5) `WHERE state = 'concluida'` removido — reprova "nenhum lançamento para a pendente"; (6) `downgrade` sem `drop_table("xp_entries")` — reprova a ida e volta.
- [ ] **Step 6: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add src/focusquest/modules/progression/models.py alembic/versions/0004_progressao.py alembic/env.py tests/integration/test_progression_migration.py
git commit -m "feat(progressao): livro-razao, conquistas e o retroativo na migracao 0004

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: O serviço — crédito na conclusão, recompensa e leitura

**Files:**

- Create: `src/focusquest/modules/progression/service.py`
- Modify: `src/focusquest/modules/missions/service.py` (chamar `registrar_conclusao`)
- Test: `tests/integration/test_progression_service.py`, `tests/integration/test_progression_concorrencia.py`

**Interfaces:**

- Consumes: Task 1 (`domain`), Task 2 (`XpEntry`, `UserAchievement`, `FONTE_CONCLUSAO`); `missions.models.Mission`, `User`; `missions.domain.MissionState`, `xp_da_missao`; `missions.cycle_service.carregar_historico`; `tutoring.models.TutorAction`; `tutoring.domain.EstadoDaAcao`, `TipoDeAcao`.
- Produces (usado pelas Tasks 4 e 5):
  - `registrar_conclusao(session: Session, missao: Mission, agora: datetime) -> None`
  - `@dataclass(frozen=True) Recompensa(xp_awarded: int, xp_total: int, level_before: int, level_after: int, achievements_unlocked: tuple[Conquista, ...])`
  - `recompensa_da_missao(session: Session, missao: Mission) -> Recompensa`
  - `@dataclass(frozen=True) ConquistaNoPainel(conquista: Conquista, unlocked_at: datetime | None)`
  - `@dataclass(frozen=True) Progresso(xp_total: int, faixa: FaixaDoNivel, conquistas: tuple[ConquistaNoPainel, ...])`
  - `ler_progresso(session: Session, user_id: int) -> Progresso`

- [ ] **Step 1: Testes que reprovam.** `tests/integration/test_progression_service.py` (fixture `session`, com rollback; relógios fixos como em `test_cycle_completion.py`: `ao_meio_dia`, `relogio`, `_plano`, `_diaria`, `criar_missao`, `concluir_missao`). Casos:

```python
"""O credito na conclusao, a recompensa reconstruida e a leitura (spec, "Servico")."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.modules.missions.cycle_service import NovaDiaria, NovaEspecial, criar_plano
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission
from focusquest.modules.missions.service import concluir_missao, criar_missao
from focusquest.modules.progression.domain import Codigo
from focusquest.modules.progression.models import UserAchievement, XpEntry
from focusquest.modules.progression.service import ler_progresso, recompensa_da_missao

ESTUDANTE = 1
AGORA = datetime(2026, 9, 21, 15, tzinfo=UTC)


def relogio(instante: datetime) -> Callable[[], datetime]:
    return lambda: instante


def _avulsa(session: Session, dificuldade: int = 2) -> Mission:
    return criar_missao(
        session,
        user_id=ESTUDANTE,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo entregue",
        difficulty=dificuldade,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=30),
    )


def _concluir(session: Session, missao: Mission, instante: datetime = AGORA) -> Mission:
    return concluir_missao(
        session, ESTUDANTE, missao.id, f"op-{missao.id}", clock=relogio(instante)
    )


def test_concluir_avulsa_lanca_o_xp_congelado_e_destrava_first_steps(session: Session) -> None:
    missao = _concluir(session, _avulsa(session, dificuldade=3))
    entrada = session.scalars(select(XpEntry).where(XpEntry.mission_id == missao.id)).one()
    assert (entrada.amount, entrada.source, entrada.credited_at) == (80, "mission_completed", AGORA)
    recompensa = recompensa_da_missao(session, missao)
    assert recompensa.xp_awarded == 80
    assert recompensa.xp_total == 80
    assert (recompensa.level_before, recompensa.level_after) == (1, 1)
    assert [c.codigo for c in recompensa.achievements_unlocked] == [Codigo.FIRST_STEPS]
```

  Os demais testes, no mesmo arquivo (escreva cada um com o mesmo nível de concretude):
  - `test_a_especial_lanca_660` — com `_plano` (plano semanal) e as sete diárias concluídas nos seus dias, a especial destravada é concluída dentro da janela: lançamento de 660.
  - `test_reenvio_antigo_devolve_a_recompensa_daquele_momento` — conclui A (dificuldade 5: 220 XP → nível 2), conclui B (dificuldade 3: 80 XP), e reenvia A com o **mesmo** `operation_id`: `recompensa_da_missao(session, A)` antes e depois de B são iguais (`xp_total == 220`, `level_before == 1`, `level_after == 2`, conquistas `[first_steps]`); e continua existindo um só lançamento de A.
  - `test_a_sequencia_quebrada_mantem_streak_7_e_o_xp` (Review Focus 4) — dois planos seguidos (semana de 2026-09-14, criado na segunda às 12:00Z; semana de 2026-09-21): conclui as sete diárias da primeira semana (streak_7 destravada no domingo), deixa a segunda-feira seguinte **sem concluir**, conclui terça e quarta com o relógio desses dias; depois: `streak_7` continua em `user_achievements`, a soma de `xp_entries` é 9 × 20, e não há `streak_30`.
  - `test_tifa_partnership_so_com_create_mission_executada` — uma avulsa ligada a uma `TutorAction` `create_mission` em `proposta` **não** destrava; a mesma ação em `executada` (com `mission_id`) destrava ao concluir. Crie a `TutorMessage`/`TutorAction` como `tests/integration/test_tutoring_acoes.py` cria.
  - `test_fatos_contam_so_o_usuario` — missões concluídas de **outro** usuário (registre-o como `_registrar_outro_usuario` em `test_missions_api.py`) não entram em `missoes_concluidas` do usuário 1 nem no saldo dele (`ler_progresso(session, 1).xp_total` não muda).
  - `test_ler_progresso_sem_conclusoes` — `xp_total == 0`, `faixa == FaixaDoNivel(1, 0, 100)`, sete conquistas na ordem do catálogo, todas com `unlocked_at is None`.
  - `test_ler_progresso_com_conquistas_traz_a_data` — depois de uma conclusão, `first_steps` com `unlocked_at == AGORA` e as outras seis nulas.
  - `test_a_trava_do_usuario_e_tomada` — prova do mecanismo, como `test_concluir_trava_a_linha_da_missao`: numa conexão, `SELECT id FROM users WHERE id = 1 FOR SHARE`; noutra sessão (`SET LOCAL lock_timeout = '2s'`), `registrar_conclusao` sobre uma missão já concluída na mesma sessão → `OperationalError` com `LockNotAvailable`. `FOR SHARE` é o modo discriminante: conflita com `FOR NO KEY UPDATE` (P2) e **não** conflita com o `FOR KEY SHARE` do INSERT com FK — sem a trava, o teste fica vermelho. Este teste usa conexões commitadas e mora em `test_progression_concorrencia.py` (abaixo).

  `tests/integration/test_progression_concorrencia.py` (conexões reais e commits, com o padrão de `tests/integration/test_missions_concorrencia.py`: `_missao_commitada`, `threading.Barrier`, `sessao.connection()` **antes** da barreira, `SEGUNDOS_LIMITE`, `LIMITE_DE_TRAVA`, limpeza em `finally` que apaga só as missões criadas — os lançamentos e conquistas vão junto pelo `ON DELETE CASCADE`):
  - `test_duas_primeiras_conclusoes_em_paralelo_destravam_uma_conquista` (Review Focus 2) — duas missões commitadas, usuário sem nenhuma conclusão; duas threads concluem uma cada, ao mesmo tempo: as duas terminam sem exceção, há dois lançamentos, e `first_steps` existe **uma** vez, apontando para um dos dois.
  - `test_falha_no_credito_desfaz_a_conclusao_e_o_reenvio_funciona` (Review Focus 3) — `monkeypatch` de `focusquest.modules.progression.service._inserir_lancamento` para levantar `OperationalError` na primeira chamada: `concluir_missao` + `commit` levanta; numa sessão nova, a missão continua `pendente`, sem `mission_operations` e sem lançamento; a segunda tentativa com o **mesmo** `operation_id` conclui e credita.
  - `test_a_trava_do_usuario_e_tomada` (descrito acima).

  **O teste de equivalência (D8)**, em `test_progression_migration.py` (a Task 3 o acrescenta, porque precisa do serviço): `test_o_backfill_e_equivalente_ao_servico_de_hoje` — o mesmo cenário populado da Task 2, criado duas vezes: (a) em `0003`, com as missões já concluídas → `upgrade head` → coleta `{mission_id → amount}` e `{codigo → (unlocked_at, mission_id do lançamento)}`; (b) em `head`, com as mesmas missões **pendentes**, concluídas uma a uma por `concluir_missao` na mesma ordem e com o relógio de cada `completed_at` → coleta as mesmas duas coleções. As duas coleções têm de ser iguais. Limpe tudo no `finally`.

  Run: `uv run pytest tests/integration/test_progression_service.py tests/integration/test_progression_concorrencia.py -q --no-cov` — Expected: FAIL (`focusquest.modules.progression.service` não existe).

- [ ] **Step 2: Implementar o serviço.** `src/focusquest/modules/progression/service.py`:

```python
"""Casos de uso da progressao: o credito na conclusao, a recompensa e a leitura.

Como em `missions.service`, nada aqui commita: quem abre a transacao a fecha.
Direcao unica (spec, "Servico"): este modulo LE modelos e regras de `missions`
e o modelo de acao da `tutoring`, e nao importa nenhum `service` delas.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from focusquest.modules.missions.cycle_service import carregar_historico
from focusquest.modules.missions.domain import MissionState, xp_da_missao
from focusquest.modules.missions.models import Mission, User
from focusquest.modules.progression.domain import (
    CATALOGO,
    CONQUISTA_POR_CODIGO,
    Codigo,
    Conquista,
    FaixaDoNivel,
    FatosDoUsuario,
    conquistas_satisfeitas,
    faixa_do_nivel,
    maior_sequencia,
    nivel_do_saldo,
)
from focusquest.modules.progression.models import FONTE_CONCLUSAO, UserAchievement, XpEntry
from focusquest.modules.tutoring.domain import EstadoDaAcao, TipoDeAcao
from focusquest.modules.tutoring.models import TutorAction


@dataclass(frozen=True)
class Recompensa:
    xp_awarded: int
    xp_total: int
    level_before: int
    level_after: int
    achievements_unlocked: tuple[Conquista, ...]


@dataclass(frozen=True)
class ConquistaNoPainel:
    conquista: Conquista
    unlocked_at: datetime | None


@dataclass(frozen=True)
class Progresso:
    xp_total: int
    faixa: FaixaDoNivel
    conquistas: tuple[ConquistaNoPainel, ...]


def registrar_conclusao(session: Session, missao: Mission, agora: datetime) -> None:
    """Credita o XP da missao recem-concluida e destrava as conquistas novas.

    Chamada por `concluir_missao` com a MISSAO JA TRAVADA e ja concluida (o
    `flush` da operacao ja aconteceu -- decisao P1 do plano). Tudo na mesma
    transacao da conclusao (D3): se algo falhar, a missao nao fica concluida.
    """
    _travar_usuario(session, missao.user_id)
    entrada = _inserir_lancamento(session, missao, agora)
    fatos = _fatos(session, missao.user_id)
    ja = set(
        session.scalars(
            select(UserAchievement.code).where(UserAchievement.user_id == missao.user_id)
        )
    )
    for conquista in CATALOGO:
        if conquista.codigo in conquistas_satisfeitas(fatos) and conquista.codigo not in ja:
            session.add(
                UserAchievement(
                    user_id=missao.user_id,
                    code=conquista.codigo.value,
                    unlocked_at=agora,
                    xp_entry_id=entrada.id,
                )
            )
    session.flush()


def _travar_usuario(session: Session, user_id: int) -> None:
    """FOR NO KEY UPDATE na linha do usuario (D12, P2), sempre DEPOIS da missao.

    Serializa duas conclusoes do mesmo usuario -- a avaliacao das conquistas
    acontece uma de cada vez -- sem bloquear o FOR KEY SHARE que todo INSERT
    com chave estrangeira para `users` toma.
    """
    session.execute(
        select(User.id).where(User.id == user_id).with_for_update(key_share=True)
    ).one()


def _inserir_lancamento(session: Session, missao: Mission, agora: datetime) -> XpEntry:
    entrada = XpEntry(
        user_id=missao.user_id,
        mission_id=missao.id,
        amount=xp_da_missao(missao.mission_type, missao.difficulty),
        source=FONTE_CONCLUSAO,
        credited_at=agora,
    )
    session.add(entrada)
    session.flush()
    return entrada


def _fatos(session: Session, user_id: int) -> FatosDoUsuario:
    concluidas = session.scalar(
        select(func.count())
        .select_from(Mission)
        .where(Mission.user_id == user_id, Mission.state == MissionState.CONCLUIDA)
    )
    da_tifa = session.scalar(
        select(func.count())
        .select_from(TutorAction)
        .join(Mission, Mission.id == TutorAction.mission_id)
        .where(
            Mission.user_id == user_id,
            Mission.state == MissionState.CONCLUIDA,
            TutorAction.kind == TipoDeAcao.CRIAR_MISSAO,
            TutorAction.state == EstadoDaAcao.EXECUTADA,
        )
    )
    return FatosDoUsuario(
        missoes_concluidas=concluidas or 0,
        maior_sequencia=maior_sequencia(carregar_historico(session, user_id)),
        concluiu_missao_da_tifa=bool(da_tifa),
    )


def recompensa_da_missao(session: Session, missao: Mission) -> Recompensa:
    """A recompensa da conclusao de `missao`, reconstruida do banco (D10).

    Um caminho so para o primeiro envio e para o reenvio: o corpo do reenvio
    e identico ao original POR CONSTRUCAO. O `xp_total` e o saldo DAQUELE
    momento -- a soma dos lancamentos anteriores a este mais ele --, nao o
    atual.
    """
    entrada = session.scalars(select(XpEntry).where(XpEntry.mission_id == missao.id)).one()
    antes = session.scalar(
        select(func.coalesce(func.sum(XpEntry.amount), 0)).where(
            XpEntry.user_id == entrada.user_id, XpEntry.id < entrada.id
        )
    )
    codigos = set(
        session.scalars(
            select(UserAchievement.code).where(UserAchievement.xp_entry_id == entrada.id)
        )
    )
    total = (antes or 0) + entrada.amount
    return Recompensa(
        xp_awarded=entrada.amount,
        xp_total=total,
        level_before=nivel_do_saldo(antes or 0),
        level_after=nivel_do_saldo(total),
        achievements_unlocked=tuple(c for c in CATALOGO if c.codigo.value in codigos),
    )


def ler_progresso(session: Session, user_id: int) -> Progresso:
    """Saldo, faixa do nivel e o catalogo inteiro com a data ou nulo. So leitura."""
    total = session.scalar(
        select(func.coalesce(func.sum(XpEntry.amount), 0)).where(XpEntry.user_id == user_id)
    )
    datas = {
        Codigo(codigo): quando
        for codigo, quando in session.execute(
            select(UserAchievement.code, UserAchievement.unlocked_at).where(
                UserAchievement.user_id == user_id
            )
        ).tuples()
    }
    return Progresso(
        xp_total=total or 0,
        faixa=faixa_do_nivel(total or 0),
        conquistas=tuple(
            ConquistaNoPainel(CONQUISTA_POR_CODIGO[c.codigo], datas.get(c.codigo))
            for c in CATALOGO
        ),
    )
```

  Em `src/focusquest/modules/missions/service.py`, importe `from focusquest.modules.progression.service import registrar_conclusao` e, em `concluir_missao`, **depois** do bloco `try: session.flush() except IntegrityError ...` e antes do `return missao`, acrescente:

```python
    # O credito da progressao, na MESMA transacao (D3) e com a missao ja
    # travada. Depois do `flush` da operacao, e nao antes (decisao P1 do plano
    # do D): antes, o autoflush das consultas da progressao gravaria a
    # operacao FORA do `try` que traduz o reuso de chave.
    registrar_conclusao(session, missao, agora)
```

  O caminho do **reenvio** (`return missao` depois de `_exigir_mesma_operacao`) **não** chama `registrar_conclusao`: o crédito já existe (D11).

- [ ] **Step 3: Ver passar.** Run: `uv run pytest tests/integration -q --no-cov` (a suíte de integração inteira: os testes antigos de conclusão e de concorrência continuam passando com o crédito no caminho) — Expected: verdes. Os testes de `test_missions_concorrencia.py` agora criam lançamentos; a limpeza deles apaga a missão, e o `ON DELETE CASCADE` leva lançamentos e conquistas — confira que nenhum teste de isolamento (`test_isolamento_entre_testes_*`) reprova.
- [ ] **Step 4: Mutações.** (1) Tirar `_travar_usuario` — reprova `test_a_trava_do_usuario_e_tomada` (e, na maioria das execuções, o de concorrência; registrar quantas de seis); (2) `with_for_update(key_share=True)` → `with_for_update()` (`FOR UPDATE`) — **não** reprova nenhum teste funcional (é a escolha P2); registrar e manter o texto do P2 como a justificativa; (3) `XpEntry.id < entrada.id` → `<=` — reprova o reenvio antigo e o `xp_total`; (4) `recompensa_da_missao` lendo o saldo **atual** (sem o filtro de `id`) — reprova `test_reenvio_antigo_devolve_a_recompensa_daquele_momento`; (5) tirar o filtro `Mission.user_id == user_id` em `_fatos` — reprova `test_fatos_contam_so_o_usuario`; (6) tirar `TutorAction.state == EstadoDaAcao.EXECUTADA` — reprova o da Tifa; (7) chamar `registrar_conclusao` também no reenvio — reprova por `uq_xp_entries_mission_id` no teste do reenvio; (8) mover a chamada para **antes** do `try/flush` — reprova `test_mesma_chave_em_missoes_diferentes_e_recusada_tambem_em_paralelo` de `test_missions_concorrencia.py` (registrar se reprova em seis de seis execuções); (9) uma cópia congelada da migração divergente (tirar o ×3) — reprova `test_o_backfill_e_equivalente_ao_servico_de_hoje`.
- [ ] **Step 5: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add src/focusquest/modules/progression/service.py src/focusquest/modules/missions/service.py tests/integration/test_progression_service.py tests/integration/test_progression_concorrencia.py tests/integration/test_progression_migration.py
git commit -m "feat(progressao): credito na conclusao, recompensa reconstruida e leitura

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: A API — `GET /api/progress` e o `reward` da conclusão

**Files:**

- Create: `src/focusquest/modules/progression/schemas.py`, `src/focusquest/modules/progression/router.py`
- Modify: `src/focusquest/modules/missions/schemas.py` (`MissionCompletionRead`), `src/focusquest/modules/missions/router.py` (a rota de concluir), `src/focusquest/main.py` (`include_router`)
- Test: `tests/integration/test_progression_api.py`; Modify: `tests/integration/test_missions_api.py` só onde o corpo da conclusão é comparado por igualdade exata (a chave nova `reward` — mudança da Task, com justificativa no relatório)

**Interfaces:**

- Consumes: Task 3 (`recompensa_da_missao`, `ler_progresso`, `Recompensa`, `Progresso`).
- Produces (contrato consumido pelas Tasks 6, 7 e 9): o JSON da spec, seção "API".
  - `class AchievementRead(BaseModel)`: `code: str`, `title: str`, `description: str`, `unlocked_at: datetime | None`
  - `class ProgressRead(BaseModel)`: `xp_total: int`, `level: int`, `level_floor_xp: int`, `next_level_xp: int`, `achievements: list[AchievementRead]`; `@classmethod do_progresso(cls, progresso: Progresso) -> ProgressRead`
  - `class UnlockedAchievementRead(BaseModel)`: `code`, `title`, `description`
  - `class RewardRead(BaseModel)`: `xp_awarded`, `xp_total`, `level_before`, `level_after`, `achievements_unlocked: list[UnlockedAchievementRead]`; `@classmethod da_recompensa(cls, recompensa: Recompensa) -> RewardRead`
  - `class MissionCompletionRead(MissionRead)`: `reward: RewardRead`

- [ ] **Step 1: Testes que reprovam.** `tests/integration/test_progression_api.py`, com a fixture `client` copiada de `test_missions_api.py` (o override de `get_session` pela sessão do teste, removendo a própria chave no teardown) e `relogio_fixo` pelo override de `get_clock`:
  - `test_progress_sem_conclusoes` — `GET /api/progress` → 200 com exatamente `{"xp_total": 0, "level": 1, "level_floor_xp": 0, "next_level_xp": 100, "achievements": [...]}`: sete itens, os `code` na ordem do catálogo, `title` e `description` da spec, todos com `unlocked_at: null`.
  - `test_progress_depois_de_concluir` — cria uma avulsa dificuldade 5 por `POST /api/missions`, conclui por `POST /api/missions/{id}/complete`: `GET /api/progress` traz `xp_total 220`, `level 2`, `level_floor_xp 100`, `next_level_xp 300`, `first_steps` com `unlocked_at` = o instante do relógio fixo, em ISO com fuso.
  - `test_concluir_devolve_reward` — o 200 da conclusão tem todas as chaves do `MissionRead` de antes **e** `reward == {"xp_awarded": 220, "xp_total": 220, "level_before": 1, "level_after": 2, "achievements_unlocked": [{"code": "first_steps", "title": "Primeiros passos", "description": "Conclua a sua primeira missão."}]}`.
  - `test_reenvio_devolve_o_mesmo_corpo_com_reward` (Review Focus 1) — conclui A, cria e conclui B, reenvia A com o mesmo `operation_id`: o corpo do reenvio é **igual** ao primeiro corpo de A (`==` no dicionário inteiro).
  - `test_openapi_publica_reward_e_progress` — `/openapi.json` tem `GET /api/progress` e o schema da resposta da conclusão tem `reward` como obrigatório.
  - `test_get_missions_e_ciclo_nao_mudam` — `GET /api/missions` e `GET /api/cycle` não têm a chave `reward` em nenhum item (D14).

  Run: `uv run pytest tests/integration/test_progression_api.py -q --no-cov` — Expected: FAIL (404 em `/api/progress`; sem `reward`).

- [ ] **Step 2: Implementar.** `src/focusquest/modules/progression/schemas.py`:

```python
"""Contratos HTTP da progressao. Chaves em ingles: contrato externo (README s3)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from focusquest.modules.progression.domain import Conquista
from focusquest.modules.progression.service import Progresso, Recompensa


class AchievementRead(BaseModel):
    code: str
    title: str
    description: str
    unlocked_at: datetime | None


class ProgressRead(BaseModel):
    xp_total: int
    level: int
    level_floor_xp: int
    next_level_xp: int
    achievements: list[AchievementRead]

    @classmethod
    def do_progresso(cls, progresso: Progresso) -> ProgressRead:
        return cls(
            xp_total=progresso.xp_total,
            level=progresso.faixa.nivel,
            level_floor_xp=progresso.faixa.piso,
            next_level_xp=progresso.faixa.proximo,
            achievements=[
                AchievementRead(
                    code=item.conquista.codigo.value,
                    title=item.conquista.titulo,
                    description=item.conquista.descricao,
                    unlocked_at=item.unlocked_at,
                )
                for item in progresso.conquistas
            ],
        )


class UnlockedAchievementRead(BaseModel):
    code: str
    title: str
    description: str

    @classmethod
    def da_conquista(cls, conquista: Conquista) -> UnlockedAchievementRead:
        return cls(
            code=conquista.codigo.value, title=conquista.titulo, description=conquista.descricao
        )


class RewardRead(BaseModel):
    xp_awarded: int
    xp_total: int
    level_before: int
    level_after: int
    achievements_unlocked: list[UnlockedAchievementRead]

    @classmethod
    def da_recompensa(cls, recompensa: Recompensa) -> RewardRead:
        return cls(
            xp_awarded=recompensa.xp_awarded,
            xp_total=recompensa.xp_total,
            level_before=recompensa.level_before,
            level_after=recompensa.level_after,
            achievements_unlocked=[
                UnlockedAchievementRead.da_conquista(c) for c in recompensa.achievements_unlocked
            ],
        )

```

  Não há ciclo de import: `progression.service` não importa nenhum `schemas`, e `missions.cycle_service` (que ele lê) não importa `missions.schemas`.

  `src/focusquest/modules/progression/router.py`:

```python
"""Transporte HTTP da progressao: uma rota, so leitura (D14)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from focusquest.core.database import get_session
from focusquest.modules.missions.router import USUARIO_UNICO
from focusquest.modules.progression.schemas import ProgressRead
from focusquest.modules.progression.service import ler_progresso

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("")
def progresso(session: Annotated[Session, Depends(get_session)]) -> ProgressRead:
    """Saldo, nivel e o catalogo de conquistas. Sem `commit`: e leitura."""
    return ProgressRead.do_progresso(ler_progresso(session, USUARIO_UNICO))
```

  Em `src/focusquest/modules/missions/schemas.py`:

```python
class MissionCompletionRead(MissionRead):
    """A resposta da conclusao: o MissionRead de sempre e a recompensa (D14)."""

    reward: RewardRead
```

  (import `from focusquest.modules.progression.schemas import RewardRead`.) Em `src/focusquest/modules/missions/router.py`, a rota `concluir` passa a devolver `MissionCompletionRead`:

```python
    missao = concluir_missao(
        session, USUARIO_UNICO, mission_id, dados.operation_id, clock=clock
    )
    session.commit()
    lida = MissionRead.da_leitura(ler_missao(session, missao, clock()))
    # A recompensa sai SEMPRE do banco, depois do commit, no primeiro envio e
    # no reenvio (D10): e o que torna os dois corpos identicos.
    recompensa = RewardRead.da_recompensa(recompensa_da_missao(session, missao))
    return MissionCompletionRead(**lida.model_dump(exclude={"xp", "actual_duration_minutes"}), reward=recompensa)
```

  (troque a anotação de retorno para `-> MissionCompletionRead`; se o `model_dump` com `exclude` dos campos computados ficar frágil, acrescente `MissionCompletionRead.da_leitura_e_recompensa(lida: MissaoLida, recompensa: RewardRead)` que monta os campos explicitamente, como `MissionRead.da_leitura` — preferível.) Em `src/focusquest/main.py`: `from focusquest.modules.progression.router import router as progression_router` e `app.include_router(progression_router)`.

- [ ] **Step 3: Ver passar.** Run: `uv run pytest tests/integration -q --no-cov && uv run mypy src tests` — Expected: verdes.
- [ ] **Step 4: Mutações.** (1) A rota montar o `reward` **antes** do `commit` com um `Recompensa` calculado "na hora" (saldo atual) — reprova o reenvio; (2) `achievements` só com as destravadas — reprova `test_progress_sem_conclusoes`; (3) `level_floor_xp` trocado por `next_level_xp` — reprova os números; (4) esquecer o `include_router` — reprova com 404.
- [ ] **Step 5: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add src/focusquest/modules/progression/schemas.py src/focusquest/modules/progression/router.py src/focusquest/modules/missions/schemas.py src/focusquest/modules/missions/router.py src/focusquest/main.py tests/integration/test_progression_api.py tests/integration/test_missions_api.py
git commit -m "feat(progressao): GET /api/progress e reward na conclusao

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: A Tifa sabe o progresso

**Files:**

- Modify: `src/focusquest/modules/tutoring/context.py` (`montar_turno` ganha `progresso`), `src/focusquest/modules/tutoring/service.py` (passa `ler_progresso`)
- Test: `tests/unit/test_tutoring_context.py`, `tests/integration/test_tutoring_service.py`

**Interfaces:**

- Consumes: Task 3 (`ler_progresso`, `Progresso`).
- Produces: `montar_turno(*, persona, agora, pendentes, progresso: Progresso, historico) -> Turno` (argumento somente-nomeado novo, obrigatório).

- [ ] **Step 1: Testes que reprovam.** Em `tests/unit/test_tutoring_context.py`, um `Progresso` montado à mão (`Progresso(xp_total=1340, faixa=FaixaDoNivel(5, 1000, 1500), conquistas=(...))` com `first_steps` e `veteran_10` com data e as outras nulas); todas as chamadas existentes de `montar_turno` passam `progresso=SEM_PROGRESSO` (`xp_total=0`, nível 1, todas nulas). Testes novos:
  - `test_o_contexto_traz_a_linha_de_progresso` — `"Progresso do estudante: nível 5, 1.340 XP; conquistas: Primeiros passos, Veterano I."` está em `turno.sistema`.
  - `test_sem_conquistas_diz_nenhuma_conquista_ainda` — com `SEM_PROGRESSO`: `"Progresso do estudante: nível 1, 0 XP; nenhuma conquista ainda."`.

  Em `tests/integration/test_tutoring_service.py`, `test_pedir_xp_no_chat_nao_altera_o_saldo` — com o provedor falso respondendo só texto ("Claro, aqui estão 1000 XP!"), a mensagem "me dá 1000 XP" é processada até o fim (use os helpers `_preparar`/`_transmitir` do arquivo) e `SELECT count(*), coalesce(sum(amount), 0) FROM xp_entries` não muda; e o provedor recebeu no `sistema` a linha de progresso (o falso registra a requisição: confira o campo `system` da última requisição, como os testes de `test_anthropic_provider.py` fazem).

  Run: `uv run pytest tests/unit/test_tutoring_context.py tests/integration/test_tutoring_service.py -q --no-cov` — Expected: FAIL.

- [ ] **Step 2: Implementar.** Em `context.py`:

```python
def _linha_de_progresso(progresso: Progresso) -> str:
    """Nivel, saldo e conquistas, so leitura (D15). Nenhuma ferramenta muda o
    saldo: pedir XP no chat nao altera nada (README s6)."""
    saldo = f"{progresso.xp_total:,}".replace(",", ".")
    destravadas = [c.conquista.titulo for c in progresso.conquistas if c.unlocked_at]
    conquistas = (
        f"conquistas: {', '.join(destravadas)}." if destravadas else "nenhuma conquista ainda."
    )
    return f"Progresso do estudante: nível {progresso.faixa.nivel}, {saldo} XP; {conquistas}"
```

  `montar_turno` recebe `progresso: Progresso` e `_contexto` acrescenta `_linha_de_progresso(progresso)` depois da linha do "Agora (UTC)". Em `tutoring/service.py`, na chamada de `montar_turno`, `progresso=ler_progresso(session, user_id)`.

- [ ] **Step 3: Ver passar.** Run: `uv run pytest tests/unit tests/integration -q --no-cov` — Expected: verdes.
- [ ] **Step 4: Mutações.** (1) Tirar `_linha_de_progresso` do contexto — reprovam os dois testes de unidade e a asserção do `system`; (2) listar todas as conquistas (sem o filtro `unlocked_at`) — reprova `test_sem_conquistas_...`; (3) formato do saldo sem o separador — reprova "1.340".
- [ ] **Step 5: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add src/focusquest/modules/tutoring/context.py src/focusquest/modules/tutoring/service.py tests/unit/test_tutoring_context.py tests/integration/test_tutoring_service.py
git commit -m "feat(tutoria): a tifa le o progresso do estudante

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Frontend — o painel de progresso

**Files:**

- Create: `frontend/src/features/progression/types.ts`, `useProgress.ts`, `useProgress.test.tsx`, `unlockedDate.ts`, `unlockedDate.test.ts`, `ProgressPanel.tsx`, `ProgressPanel.test.tsx`

**Interfaces:**

- Consumes: o contrato do `GET /api/progress` (Task 4; nos testes, `routeFetch`).
- Produces (usado pela Task 8):
  - `interface Achievement { code: string; title: string; description: string; unlocked_at: string | null }`
  - `interface Progress { xp_total: number; level: number; level_floor_xp: number; next_level_xp: number; achievements: Achievement[] }`
  - `type ProgressState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'loaded'; progress: Progress; refreshFailed: boolean }`
  - `useProgress(): { state: ProgressState; reload(): void; refresh(): void }`
  - `formatUnlockedAt(instant: string): string` ("21/09/2026", em `America/Sao_Paulo`)
  - `interface ProgressPanelHandle { refresh: () => void }`; `ProgressPanel({ ref?: Ref<ProgressPanelHandle> })`
  - `data-testid`: `progress`, `progress-loading`, `progress-error`, `progress-retry`, `progress-level`, `progress-total`, `progress-bar`, `progress-bar-text`, `progress-achievement` (com `data-code` e `data-unlocked="true"|"false"`), `progress-stale`, `progress-refresh`

- [ ] **Step 1: Testes que reprovam.**
  - `useProgress.test.tsx` — os mesmos casos de `features/missions/useCycle.test.tsx`, trocando a rota por `GET /api/progress` e o dado por um `Progress`: carregando → carregado; erro com `reload`; `refresh` sem passar por `loading`; `refresh` que falha mantém o dado com `refreshFailed`; `refresh` com a carga inicial em voo que falha vira erro (não `loading` eterno); duas respostas de `refresh` fora de ordem ficam com a mais nova; o pedido cancelado no StrictMode que rejeita depois do bom não vira erro; a volta à aba (`visibilitychange` visível) atualiza em silêncio. Copie os corpos de `useCycle.test.tsx` e troque os nomes; nenhum caso a menos.
  - `unlockedDate.test.ts` — `formatUnlockedAt('2026-09-21T13:02:11Z') === '21/09/2026'`; `formatUnlockedAt('2026-09-22T02:30:00Z') === '21/09/2026'` (23:30 em São Paulo, com o processo em `Asia/Tokyo` onde já é 22/09 — o caso que o fuso do navegador erraria).
  - `ProgressPanel.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeFetch } from '../../test/fetchRoutes'
import { ProgressPanel } from './ProgressPanel'
import type { Progress } from './types'

const CATALOGO = [
  ['first_steps', 'Primeiros passos', 'Conclua a sua primeira missão.'],
  ['streak_7', 'Uma semana inteira', 'Complete a diária 7 dias seguidos.'],
  ['streak_30', 'Um mês de hábito', 'Complete a diária 30 dias seguidos.'],
  ['veteran_10', 'Veterano I', 'Conclua 10 missões.'],
  ['veteran_50', 'Veterano II', 'Conclua 50 missões.'],
  ['veteran_100', 'Veterano III', 'Conclua 100 missões.'],
  ['tifa_partnership', 'Parceria com a Tifa', 'Conclua uma missão proposta pela Tifa.'],
] as const

function progress(xp: number, level: number, floor: number, next: number, unlocked: string[] = []): Progress {
  return {
    xp_total: xp,
    level,
    level_floor_xp: floor,
    next_level_xp: next,
    achievements: CATALOGO.map(([code, title, description]) => ({
      code,
      title,
      description,
      unlocked_at: unlocked.includes(code) ? '2026-09-21T13:02:11Z' : null,
    })),
  }
}

function serve(body: Progress) {
  return routeFetch({ 'GET /api/progress': () => Response.json(body) })
}

describe('ProgressPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mostra o nivel, o saldo e a barra com texto e valores ARIA', async () => {
    serve(progress(1340, 5, 1000, 1500, ['first_steps']))
    render(<ProgressPanel />)
    expect(await screen.findByTestId('progress-level')).toHaveTextContent('Nível 5')
    expect(screen.getByTestId('progress-total')).toHaveTextContent('1.340 XP no total')
    const barra = screen.getByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuemin', '0')
    expect(barra).toHaveAttribute('aria-valuemax', '500')
    expect(barra).toHaveAttribute('aria-valuenow', '340')
    expect(barra).toHaveAttribute('aria-valuetext', '340 de 500 XP até o nível 6')
    expect(screen.getByTestId('progress-bar-text')).toHaveTextContent('340 de 500 XP até o nível 6')
  })

  it('o piso do nivel mostra a barra vazia do nivel novo', async () => {
    serve(progress(1000, 5, 1000, 1500))
    render(<ProgressPanel />)
    const barra = await screen.findByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuenow', '0')
    expect(barra).toHaveAttribute('aria-valuetext', '0 de 500 XP até o nível 6')
  })

  it('saldo grande formatado em pt-BR', async () => {
    serve(progress(19000, 20, 19000, 21000))
    render(<ProgressPanel />)
    expect(await screen.findByTestId('progress-level')).toHaveTextContent('Nível 20')
    expect(screen.getByTestId('progress-total')).toHaveTextContent('19.000 XP no total')
  })

  it('conquista destravada tem titulo e data; bloqueada diz como destravar, em texto', async () => {
    serve(progress(20, 1, 0, 100, ['first_steps']))
    render(<ProgressPanel />)
    const itens = await screen.findAllByTestId('progress-achievement')
    expect(itens.map((i) => i.dataset.code)).toEqual(CATALOGO.map(([code]) => code))
    const primeira = itens[0]!
    expect(primeira).toHaveAttribute('data-unlocked', 'true')
    expect(primeira).toHaveTextContent('Primeiros passos')
    expect(primeira).toHaveTextContent('Conquistada em 21/09/2026')
    const bloqueada = itens[1]!
    expect(bloqueada).toHaveAttribute('data-unlocked', 'false')
    expect(within(bloqueada).getByText('Bloqueada:', { exact: false })).toBeInTheDocument()
    expect(bloqueada).toHaveTextContent('Complete a diária 7 dias seguidos.')
  })
})
```

  Mais, no mesmo arquivo: "carregando tem role status" (`progress-loading` com `role="status"`, rota que nunca responde); "erro com Tentar novamente refaz o pedido" (500, depois 200; `progress-retry`); "o aviso de desatualizado aparece quando o refresh falha" (via `ref.current.refresh()` com a segunda resposta 500: `progress-stale` com `role="alert"`, texto "Não foi possível atualizar o progresso." e o botão `progress-refresh` "Atualizar" que chama `reload`); "a secao tem titulo de nivel 2 ligado por aria-labelledby".

  Run: `cd frontend && npx vitest run src/features/progression` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 2: Implementar.**
  - `types.ts`: as duas interfaces do bloco Interfaces.
  - `useProgress.ts`: o código de `features/missions/useCycle.ts` **inteiro**, com `Cycle` → `Progress`, `'/cycle'` → `'/progress'`, `cycle` → `progress` nos estados, e a mensagem de fallback "Falha inesperada ao carregar o progresso.". Mantenha: `requestId` compartilhado entre a carga, o `reload` e o `refresh`; o `catch` do `refresh` que transforma `loading` em `error` e `loaded` em `refreshFailed`; `useRefreshOnReturn(refresh)`.
  - `unlockedDate.ts`:

```ts
/**
 * A data em que a conquista foi destravada, em Sao Paulo (decisao P5 do plano
 * do D). `unlocked_at` e um INSTANTE, nao uma data civil: mostrado no fuso do
 * navegador, a mesma conquista mudaria de dia conforme o computador.
 */
const unlockedFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatUnlockedAt(instant: string): string {
  return unlockedFormatter.format(new Date(instant))
}
```

  - `ProgressPanel.tsx`:

```tsx
import { useImperativeHandle, type ReactElement, type Ref } from 'react'
import { formatUnlockedAt } from './unlockedDate'
import type { Achievement, Progress } from './types'
import { useProgress, type ProgressState } from './useProgress'

export interface ProgressPanelHandle {
  refresh: () => void
}

const xpFormat = new Intl.NumberFormat('pt-BR')

function AchievementItem({ achievement }: { achievement: Achievement }): ReactElement {
  const unlocked = achievement.unlocked_at !== null
  return (
    <li
      data-testid="progress-achievement"
      data-code={achievement.code}
      data-unlocked={String(unlocked)}
      className={
        unlocked
          ? 'rounded border border-emerald-400/60 p-2 text-sm text-slate-100'
          : 'rounded border border-slate-700 p-2 text-sm text-slate-400'
      }
    >
      <span aria-hidden="true">{unlocked ? '★' : '🔒'}</span>{' '}
      <span className="font-medium">{achievement.title}</span>
      <p className="mt-1">
        {unlocked
          ? `Conquistada em ${formatUnlockedAt(achievement.unlocked_at!)}`
          : `Bloqueada: ${achievement.description}`}
      </p>
    </li>
  )
}

function Loaded({ progress }: { progress: Progress }): ReactElement {
  const span = progress.next_level_xp - progress.level_floor_xp
  const into = progress.xp_total - progress.level_floor_xp
  const text = `${xpFormat.format(into)} de ${xpFormat.format(span)} XP até o nível ${String(progress.level + 1)}`
  return (
    <div>
      <p data-testid="progress-level" className="text-xl font-bold text-slate-50">
        Nível {progress.level}
      </p>
      <p data-testid="progress-total" className="text-sm text-slate-300">
        {xpFormat.format(progress.xp_total)} XP no total
      </p>
      <div
        role="progressbar"
        data-testid="progress-bar"
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={into}
        aria-valuetext={text}
        className="mt-2 h-2 w-full rounded bg-slate-800"
      >
        <div className="h-2 rounded bg-emerald-400" style={{ width: `${String((into / span) * 100)}%` }} />
      </div>
      <p data-testid="progress-bar-text" className="mt-1 text-sm text-slate-300">
        {text}
      </p>
      <h3 className="mt-4 mb-2 text-sm font-semibold text-slate-200">Conquistas</h3>
      <ul role="list" className="grid gap-2 sm:grid-cols-2">
        {progress.achievements.map((a) => (
          <AchievementItem key={a.code} achievement={a} />
        ))}
      </ul>
    </div>
  )
}

function ProgressContent({ state, onReload }: { state: ProgressState; onReload: () => void }): ReactElement {
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" data-testid="progress-loading" className="text-sm text-slate-400">
          Consultando o seu progresso…
        </p>
      )
    case 'error':
      return (
        <div role="alert" data-testid="progress-error" className="text-sm text-red-300">
          <p>{state.message}</p>
          <button type="button" data-testid="progress-retry" onClick={onReload} className="mt-2 rounded border border-red-300/60 px-3 py-1 font-medium">
            Tentar novamente
          </button>
        </div>
      )
    case 'loaded':
      return (
        <>
          <Loaded progress={state.progress} />
          {state.refreshFailed && (
            <div role="alert" data-testid="progress-stale" className="mt-2 text-sm text-amber-200">
              <p>Não foi possível atualizar o progresso.</p>
              <button type="button" data-testid="progress-refresh" onClick={onReload} className="mt-2 rounded border border-amber-300/60 px-3 py-1 font-medium text-amber-100">
                Atualizar
              </button>
            </div>
          )}
        </>
      )
  }
}

/**
 * O painel de progresso do Quartel-General (D16): nivel, barra e conquistas.
 * O `ref` e o que a PAGINA usa para atualizar o painel depois de uma conclusao
 * (decisao P3: `refresh`, silencioso), como ja faz com o quadro.
 */
export function ProgressPanel({ ref }: { ref?: Ref<ProgressPanelHandle> }) {
  const { state, reload, refresh } = useProgress()
  useImperativeHandle(ref, () => ({ refresh }), [refresh])
  return (
    <section aria-labelledby="progress-heading" data-testid="progress" className="mb-8">
      <h2 id="progress-heading" className="mb-3 text-lg font-semibold text-slate-200">
        Seu progresso — nível e conquistas
      </h2>
      <ProgressContent state={state} onReload={reload} />
    </section>
  )
}
```

  (Aplique `npm run format` e ajuste as classes às do `CycleSection`, se o lint pedir; o texto e os atributos acima são o contrato.)

- [ ] **Step 3: Ver passar.** Run: `cd frontend && npm run lint && npm run format:check && npm run typecheck && npm run test:coverage` — Expected: verdes, 100% nos quatro eixos, nenhum aviso `act()` (`npx vitest run --reporter=verbose 2>&1 | grep -c "not wrapped in act"` = 1, o aviso antigo de `MissionList.test.tsx`).
- [ ] **Step 4: Mutações.** (1) `aria-valuenow={progress.xp_total}` (sem subtrair o piso) — reprova a barra e o piso; (2) `level + 1` → `level` no texto — reprova o texto; (3) `formatUnlockedAt` sem `timeZone` — reprova o caso das 23:30; (4) bloqueada só com o cadeado (sem o texto "Bloqueada: …") — reprova o teste do texto; (5) o `catch` do `refresh` sem o ramo `loading → error` — reprova o caso da carga em voo; (6) `refresh` que passa por `loading` — reprova "sem passar por loading".
- [ ] **Step 5: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add frontend/src/features/progression
git commit -m "feat(progressao): painel de progresso com nivel, barra e conquistas

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Frontend — o anúncio da recompensa no cartão

**Files:**

- Create: `frontend/src/shared/types/reward.ts`, `frontend/src/features/missions/RewardAnnouncement.tsx`, `RewardAnnouncement.test.tsx`
- Modify: `frontend/src/features/missions/useCompleteMission.ts` (+ teste), `MissionCard.tsx`, `frontend/src/index.css` (a animação), os testes de `features/missions/*` cujos *mocks* da conclusão precisam do `reward`

**Interfaces:**

- Consumes: o contrato do `reward` (Task 4; nos testes, `routeFetch`).
- Produces:
  - `shared/types/reward.ts`: `interface UnlockedAchievement { code: string; title: string; description: string }`, `interface Reward { xp_awarded: number; xp_total: number; level_before: number; level_after: number; achievements_unlocked: UnlockedAchievement[] }`, `interface MissionCompletion extends Mission { reward: Reward }`
  - `CompletionState` com `{ status: 'completed'; mission: Mission; reward: Reward }`
  - `RewardAnnouncement({ reward }: { reward: Reward })`
  - `data-testid`: `reward`, `reward-xp`, `reward-level-up`, `reward-achievement`, `mission-completion-text`; `mission-completion-status` continua existindo, agora num `<div role="status">`

- [ ] **Step 1: Testes que reprovam.**
  - `RewardAnnouncement.test.tsx`:
    - "mostra o XP ganho" — `reward-xp` com "+220 XP".
    - "anuncia a subida de nível só quando o nível muda" — `level_before 4, level_after 5` → `reward-level-up` "Subiu para o nível 5!"; `4 → 4` → sem `reward-level-up`.
    - "lista as conquistas destravadas pelo título" — dois itens `reward-achievement` com "Conquista: Veterano I" e "Conquista: Parceria com a Tifa"; sem conquistas, nenhum item.
    - "a animação só existe sob motion-safe" — a raiz `reward` tem uma classe que começa com `motion-safe:` e **nenhuma** classe `animate-` sem o prefixo.
  - `useCompleteMission.test.tsx`: o caso de sucesso existente passa a responder um `MissionCompletion` e afirma `state` `{ status: 'completed', mission: <a missão sem reward>, reward }` (a `mission` guardada **não** leva a chave `reward`).
  - `MissionCard` (nos testes de `MissionList.test.tsx` e `CycleSection.test.tsx` que concluem): depois do Concluir, `mission-completion-status` é um `role="status"` que contém "Missão concluída." (`mission-completion-text`) **e** o `reward` ("+80 XP"); a região viva existe desde antes do clique (o elemento é o mesmo antes e depois: `expect(depois).toBe(antes)`).

  Run: `cd frontend && npx vitest run src/features/missions` — Expected: FAIL.

- [ ] **Step 2: Implementar.**
  - `shared/types/reward.ts` com as três interfaces e um comentário apontando para a spec (D14) e para o `RewardRead` do backend.
  - `useCompleteMission.ts`: `postJson<MissionCompletion>(...)`, e no `.then`: `const { reward, ...mission } = completion; setState({ status: 'completed', mission, reward })`.
  - `RewardAnnouncement.tsx`:

```tsx
import type { Reward } from '../../shared/types/reward'

/**
 * O anuncio da recompensa no cartao concluido (D16). Mora DENTRO da regiao
 * viva do cartao (decisao P4): uma regiao nova, nascida ja com texto, nao e
 * anunciada por todo leitor de tela. A entrada so anima sob `motion-safe:`
 * (README s7: movimento reduzido).
 */
export function RewardAnnouncement({ reward }: { reward: Reward }) {
  return (
    <div data-testid="reward" className="mt-2 text-sm text-emerald-200 motion-safe:animate-[reward-in_400ms_ease-out]">
      <p data-testid="reward-xp" className="font-semibold">
        +{reward.xp_awarded} XP
      </p>
      {reward.level_after > reward.level_before && (
        <p data-testid="reward-level-up">Subiu para o nível {reward.level_after}!</p>
      )}
      {reward.achievements_unlocked.length > 0 && (
        <ul role="list">
          {reward.achievements_unlocked.map((a) => (
            <li key={a.code} data-testid="reward-achievement">
              Conquista: {a.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

  - `frontend/src/index.css`: `@keyframes reward-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }`.
  - `MissionCard.tsx`, em `CompletionControls`: o `<p role="status" data-testid="mission-completion-status">` vira

```tsx
      <div role="status" data-testid="mission-completion-status" className="text-sm text-emerald-300">
        <p data-testid="mission-completion-text">{statusText(completion)}</p>
        {completion.status === 'completed' && <RewardAnnouncement reward={completion.reward} />}
      </div>
```

  Atualize os *mocks* de conclusão dos testes existentes para responder um `MissionCompletion` (com `reward`); a mudança de asserção de `mission-completion-status` para `mission-completion-text`, onde o teste comparava o texto exato, é mudança desta Task (registrar no relatório).

- [ ] **Step 3: Ver passar.** Run: `cd frontend && npm run lint && npm run format:check && npm run typecheck && npm run test:coverage` — Expected: verdes, 100%, nenhum aviso `act()` novo.
- [ ] **Step 4: Mutações.** (1) `level_after > level_before` → `>=` — reprova "só quando o nível muda"; (2) o `RewardAnnouncement` fora da região viva (irmão do `div role="status"`) — reprova "a região viva contém o reward"; (3) `animate-[reward-in…]` sem o prefixo `motion-safe:` — reprova o teste da animação; (4) guardar a `completion` inteira como `mission` — reprova "a missão guardada não leva reward".
- [ ] **Step 5: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add frontend/src/shared/types/reward.ts frontend/src/features/missions frontend/src/index.css
git commit -m "feat(progressao): anuncio da recompensa no cartao concluido

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Frontend — o painel no Quartel-General e a atualização depois de concluir

**Files:**

- Modify: `frontend/src/pages/Headquarters.tsx` (+ teste), `frontend/src/features/missions/CycleSection.tsx` (+ teste), `frontend/src/features/missions/MissionList.tsx` (+ teste), `frontend/src/App.test.tsx` (a rota `GET /api/progress` no `stubPage`)

**Interfaces:**

- Consumes: Task 6 (`ProgressPanel`, `ProgressPanelHandle`), Task 7 (a conclusão com `reward`).
- Produces: `CycleSection({ onMissionCompleted?: () => void })`; `MissionList({ ref?, onMissionCompleted?: () => void })` (repassado a cada `MissionCard` como `onCompleted`).

- [ ] **Step 1: Testes que reprovam.**
  - `CycleSection.test.tsx`: "avisa a página quando a missão de hoje é concluída" — `onMissionCompleted = vi.fn()`; depois do Concluir com sucesso, chamado uma vez; e o `refresh` do ciclo continua acontecendo (o segundo `GET /api/cycle`).
  - `MissionList.test.tsx`: "avisa a página quando uma avulsa é concluída" — o mesmo, com `onMissionCompleted`.
  - `Headquarters.test.tsx`: "o painel de progresso fica acima da missão de hoje" (`compareDocumentPosition` de `progress` antes de `cycle`); "concluir uma avulsa atualiza o painel sem passar por carregando" — rotas: `GET /api/progress` responde 20 XP na primeira chamada e 100 XP na segunda; depois do Concluir, `progress-total` mostra "100 XP no total", e `progress-loading` **nunca** aparece depois do primeiro carregamento (`queryByTestId` nulo logo após o clique); "concluir a diária também atualiza o painel".
  - `App.test.tsx`: acrescentar a rota `GET /api/progress` ao `stubPage` (os testes do App passam a montar o painel).

  Run: `cd frontend && npx vitest run src/pages src/features/missions src/App.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implementar.** `Headquarters.tsx`:

```tsx
  const progress = useRef<ProgressPanelHandle>(null)
  // O `!`: o painel monta com a pagina, antes de qualquer conclusao.
  const refreshProgress = useCallback(() => {
    progress.current!.refresh()
  }, [])
```

  e no `main`, depois do `header`: `<ProgressPanel ref={progress} />`, `<CycleSection onMissionCompleted={refreshProgress} />`, `<MissionList ref={board} onMissionCompleted={refreshProgress} />`. Atualize o comentário da página: o XP e o progresso agora têm API (D14), então saem da lista do "§7 prevê mais coisa".

  `CycleSection.tsx`: a assinatura vira `CycleSection({ onMissionCompleted }: { onMissionCompleted?: () => void })` e o `card.onCompleted` vira

```tsx
    onCompleted: () => {
      refresh()
      onMissionCompleted?.()
    },
```

  (com `useCallback` se o lint de dependências pedir). `MissionList.tsx`: recebe `onMissionCompleted` e o repassa ao `MissionsContent`, que o passa a cada `MissionCard` como `onCompleted={onMissionCompleted}`.

- [ ] **Step 3: Ver passar.** Run: `cd frontend && npm run lint && npm run format:check && npm run typecheck && npm run test:coverage` — Expected: verdes, 100%.
- [ ] **Step 4: Mutações.** (1) `refreshProgress` chamando `reload` (um `ProgressPanelHandle` com `reload`) — reprova "sem passar por carregando"; (2) o `CycleSection` chamando só `onMissionCompleted` (sem `refresh`) — reprova "o refresh do ciclo continua"; (3) o `MissionList` sem repassar a callback — reprova o teste da avulsa; (4) o painel abaixo do `CycleSection` — reprova a ordem.
- [ ] **Step 5: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add frontend/src/pages frontend/src/features/missions frontend/src/App.test.tsx
git commit -m "feat(progressao): painel no quartel-general, atualizado a cada conclusao

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: E2E — a recompensa na conclusão da diária e o axe com o painel

**Files:**

- Modify: `frontend/tests/e2e/cycle.spec.ts`

- [ ] **Step 1: Cenários.** No arquivo existente, em série (o plano semeado no `beforeAll` continua o único):
  - No cenário "a missão de hoje do plano semeado aparece…": antes do axe, `await expect(page.getByTestId('progress-level')).toBeVisible()` — o axe roda com o painel carregado.
  - No cenário "concluir a missão de hoje leva a sequência a 1…": antes do clique, `const antes = await (await page.request.get('/api/progress')).json()` e `const xp = (await (await page.request.get('/api/cycle')).json()).mission.xp` (P6). Depois do clique, no cartão: `reward-xp` com `+${xp} XP`; no painel: `progress-total` com `${(antes.xp_total + xp).toLocaleString('pt-BR')} XP no total`. Depois do `page.reload()`, o painel continua com o mesmo total (vem do banco). O axe desse cenário já roda depois — com o anúncio e o painel na tela.
  - Um cenário novo, "o painel mostra as conquistas com texto e passa no axe": abre o Quartel-General, espera `progress-level`; os sete `progress-achievement` na ordem do catálogo; `first_steps` com `data-unlocked="true"` (o cenário anterior concluiu uma missão); uma bloqueada com "Bloqueada:" no texto; axe sem violações.
- [ ] **Step 2: Rodar duas vezes.** Run: `make check-e2e && make check-e2e` — Expected: EXIT 0 nas duas (o `reset-test-db` começa cada uma de esquema limpo).
- [ ] **Step 3: Mutações.** (1) Tirar o `refresh` do painel depois da conclusão (Task 8) — reprova o total no painel; (2) `RewardAnnouncement` com `xp_total` no lugar de `xp_awarded` — reprova `reward-xp` (a menos que `antes.xp_total` seja 0: o cenário garante que não é, porque o `beforeAll`… — se na execução `antes.xp_total` for 0, o implementador registra e usa a mutação (1) como a discriminante); (3) a conquista bloqueada só com o ícone — reprova o texto "Bloqueada:".
- [ ] **Step 4: Gate e commit.** Run: `make check` — Expected: EXIT 0.

```bash
git add frontend/tests/e2e/cycle.spec.ts
git commit -m "test(e2e): recompensa na conclusao da diaria e axe com o painel de progresso

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Documentação

**Files:**

- Modify: `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md`

- [ ] **Step 1: HANDOFF.** "Revisão-base" com a contagem de commits medida (`git log --oneline main..HEAD`); "Incremento D — decisões" (D1–D16 da spec e P1–P7 deste plano); "decisões tomadas durante a execução" (as Rulings do controlador, se houver); o motivo do endpoint novo `GET /api/progress` e "nenhuma dependência nova" (AGENTS.md §4); "Alterações do Incremento D" arquivo a arquivo; "Resultados" com `make check` duas vezes e `make check-e2e` duas vezes, números lidos da saída; "Pendências": a unicidade do livro-razão muda no E (`mission_id`, `source`); o custo quadrático da maior sequência (se o histórico crescer muito); o anúncio do reenvio mostra o saldo daquele momento (semântica documentada); a pendência 3 (iniciar missão) continua aberta; "Próximo incremento": E — entrega com evidência e avaliação.
- [ ] **Step 2: ARCHITECTURE.** §1 com os arquivos novos (`git ls-files src/focusquest/modules/progression frontend/src/features/progression`); §3: o módulo `progression` e a direção das dependências (`missions.service` → `progression.service`; `progression` só lê `missions` e o modelo de ação da `tutoring`); o contrato HTTP de `GET /api/progress` e o `reward`; `shared/types/reward.ts`.
- [ ] **Step 3: QUALITY.** O que o axe audita agora (o painel carregado; o cartão com o anúncio).
- [ ] **Step 4: Gate duas vezes e commit.** Run: `make check && make check` — Expected: EXIT 0 nas duas.

```bash
git add docs/HANDOFF.md docs/ARCHITECTURE.md docs/QUALITY.md
git commit -m "docs(progressao): handoff, arquitetura e qualidade do incremento d

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Autorrevisão do plano contra a spec

- **Cobertura da spec.** D1 (módulo): Tasks 1–4 e 6. D2 (livro-razão, valor congelado): Tasks 2 e 3. D3 (mesma transação): Task 3 (P1 ajusta o ponto exato). D4 (curva): Task 1. D5 e D6 (conquistas, `xp_entry_id` NOT NULL): Tasks 2 e 3. D7 e D8 (retroativo, cópias congeladas, equivalência): Tasks 2 e 3. D9 (catálogo, títulos): Task 1. D10 (reenvio reconstruído): Tasks 3 e 4. D11 (duas travas): Tasks 2 (UNIQUE) e 3 (terminal + teste do reenvio). D12 (trava do usuário, ordem): Task 3 (P2 troca o modo da trava, mantém a ordem). D13 (maior sequência): Tasks 1 e 3. D14 (API): Task 4. D15 (Tifa): Task 5. D16 (painel, anúncio, trilha intacta): Tasks 6–9. "Erros" (nenhum código novo; falha desfaz tudo): Task 3. "Testes" da spec: domínio (Task 1), serviço/concorrência/falha/sequência/Tifa/restrições (Tasks 2 e 3), migração e equivalência (Tasks 2 e 3), API (Task 4), frontend (Tasks 6–8), Tifa (Task 5), E2E (Task 9). "Entregas de documentação": Task 10.
- **Tipos e nomes coerentes entre tarefas.** `registrar_conclusao`, `recompensa_da_missao`, `ler_progresso`, `Recompensa`, `Progresso`, `ConquistaNoPainel` (Task 3) são os usados nas Tasks 4 e 5; `ProgressPanelHandle.refresh` (Task 6) é o usado na Task 8; `MissionCompletion`/`Reward` (Task 7) são o contrato da Task 4.
- **Placeholders.** Nenhum "TBD". Os testes de `useProgress` são descritos como cópia integral dos de `useCycle.test.tsx` com a troca de nomes, e o código de `useProgress.ts` como cópia integral de `useCycle.ts`: o arquivo de origem está no repositório e o que muda está listado.
- **Escolhas que o dono deveria conhecer:** P1 (ponto de chamada depois do `flush` da operação, e não antes, como a spec dizia); P2 (`FOR NO KEY UPDATE` em vez de `FOR UPDATE`); P4 (a região viva do cartão muda de `<p>` para `<div>`, e testes antigos que comparavam o texto exato passam a mirar `mission-completion-text`).
