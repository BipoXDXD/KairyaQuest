"""A conclusao concorrente perto da meia-noite (spec, "Testes", integracao).

Este modulo tem DOIS testes, e eles provam coisas diferentes -- a distincao
importa porque o primeiro, sozinho, e vacuamente verde em relacao a trava.

`test_conclusao_concorrente_na_virada_do_dia_conclui_uma_vez` disputa a
diaria de quarta com relogios dos DOIS LADOS da meia-noite de Sao Paulo
(23:59:59 e 00:00:01). O resultado e DETERMINISTICO por construcao dos
relogios, e nao depende de qual conexao trava primeiro: a disponibilidade da
diaria e `disponivel` as 23:59:59 (ainda e quarta) e `perdida` ou `concluida`
as 00:00:01 (ja e quinta) -- as duas leituras nunca colidem na MESMA
disponibilidade, e a regra do dia sozinha ja decide o resultado de cada
thread antes de qualquer disputa de trava acontecer. "antes" SEMPRE conclui,
`completed_at` SEMPRE e o instante de "antes"; "depois" recebe
`MissaoExpiradaError` se travar ANTES de "antes" (a diaria ainda esta
`pendente`/`perdida`) ou `TransicaoIlegalError` se travar DEPOIS (a diaria ja
esta `concluida`). Medido: com o `with_for_update` removido de `_buscar` (hoje
`buscar_para_escrever`), o resultado desta funcao continua o mesmo sempre que
"antes" trava primeiro -- so muda quando "depois" trava primeiro, e ai e a
REGRA DO DIA, nao a trava, quem barraria a segunda conclusao. Este teste prova o
contrato da VIRADA DO DIA -- uma conclusao so, do lado certo da meia-noite --
e NAO prova o mecanismo do `FOR UPDATE`.

`test_duas_conclusoes_do_mesmo_lado_da_meia_noite_produzem_uma_so` e quem
prova isso: dois relogios do MESMO lado da meia-noite (23:59:58 e 23:59:59,
ambos quarta) levam a MESMA disponibilidade para as duas threads, e so entao
o resultado passa a depender de qual conexao trava primeiro -- exatamente a
condicao de corrida que `test_concluir_trava_a_linha_da_missao`
(`test_missions_concorrencia.py`) prova por construcao, sem depender de
escalonador. Aqui a prova e por entrelacamento (como
`test_duas_conclusoes_simultaneas_produzem_uma_so` naquele outro modulo), e
por isso e este segundo teste, e nao o primeiro, que a mutacao do
`with_for_update` reprova.
"""

import threading
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import Engine, delete, func, select, text
from sqlalchemy.orm import Session

from focusquest.core.errors import MissaoExpiradaError
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    TransicaoIlegalError,
)
from focusquest.modules.missions.models import Mission, MissionOperation, WeeklyPlan
from focusquest.modules.missions.service import concluir_missao

ESTUDANTE = 1
SEGUNDA = date(2026, 9, 21)
QUARTA = SEGUNDA + timedelta(days=2)
SEGUNDOS_LIMITE = 30
LIMITE_DE_TRAVA = "2s"
ANTES = datetime(2026, 9, 24, 2, 59, 59, tzinfo=UTC)  # quarta 23:59:59 em SP
DEPOIS = datetime(2026, 9, 24, 3, 0, 1, tzinfo=UTC)  # quinta 00:00:01 em SP
# Os dois do MESMO lado da meia-noite: quarta 23:59:58 e 23:59:59 em SP.
QUASE_MEIA_NOITE_UM = datetime(2026, 9, 24, 2, 59, 58, tzinfo=UTC)
QUASE_MEIA_NOITE_DOIS = datetime(2026, 9, 24, 2, 59, 59, tzinfo=UTC)


@pytest.fixture
def diaria_de_quarta(banco_migrado: Engine) -> Iterator[int]:
    """Plano REALMENTE commitado; apagado ao sair, mesmo com o teste vermelho."""
    with Session(bind=banco_migrado) as sessao:
        criar_plano(
            sessao,
            user_id=ESTUDANTE,
            semana=SEGUNDA,
            diarias=[NovaDiaria(f"D{i}", "c", 2, 30) for i in range(7)],
            especial=NovaEspecial("E", "c", 60),
            clock=lambda: datetime(2026, 9, 23, 15, tzinfo=UTC),
        )
        sessao.commit()
        plano_id = sessao.scalars(select(WeeklyPlan.id)).one()
        mission_id = sessao.scalars(
            select(Mission.id).where(
                Mission.mission_type == MissionType.DIARIA, Mission.day == QUARTA
            )
        ).one()
    try:
        yield mission_id
    finally:
        with Session(bind=banco_migrado) as sessao:
            sessao.execute(text(f"SET LOCAL lock_timeout = '{LIMITE_DE_TRAVA}'"))
            sessao.execute(delete(Mission).where(Mission.plan_id == plano_id))
            sessao.execute(delete(WeeklyPlan).where(WeeklyPlan.id == plano_id))
            sessao.commit()


def _duas_conclusoes(
    engine: Engine, mission_id: int, tentativas: list[tuple[str, datetime]]
) -> dict[str, object]:
    """Roda uma conclusao por thread sobre a MESMA missao, cada uma com o
    proprio relogio e o proprio `operation_id`, e devolve o resultado de cada
    uma pelo nome ("ok" ou o tipo do erro de dominio).

    Conexao aberta ANTES da barreira: sem isso a largada e falsa (ver
    `test_missions_concorrencia.py`).
    """
    barreira = threading.Barrier(len(tentativas), timeout=SEGUNDOS_LIMITE)
    resultados: dict[str, object] = {}

    def concluir(nome: str, instante: datetime) -> None:
        with Session(bind=engine) as sessao:
            sessao.connection()
            barreira.wait()
            try:
                concluir_missao(
                    sessao, ESTUDANTE, mission_id, f"op-{nome}", clock=lambda: instante
                )
                sessao.commit()
                resultados[nome] = "ok"
            except (TransicaoIlegalError, MissaoExpiradaError) as erro:
                sessao.rollback()
                resultados[nome] = type(erro)

    threads = [
        threading.Thread(target=concluir, args=(nome, instante))
        for nome, instante in tentativas
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(SEGUNDOS_LIMITE)
        assert not thread.is_alive(), "thread travada: houve espera circular"

    assert len(resultados) == len(tentativas), (
        f"thread morreu sem resultado: {resultados}"
    )
    return resultados


def test_conclusao_concorrente_na_virada_do_dia_conclui_uma_vez(
    banco_migrado: Engine, diaria_de_quarta: int
) -> None:
    resultados = _duas_conclusoes(
        banco_migrado, diaria_de_quarta, [("antes", ANTES), ("depois", DEPOIS)]
    )

    # Deterministico pelos relogios (ver docstring do modulo): "antes" sempre
    # vence, e o instante gravado e sempre o dela -- nunca o de "depois",
    # aconteca o que acontecer com a trava.
    assert resultados["antes"] == "ok"
    assert resultados["depois"] in (MissaoExpiradaError, TransicaoIlegalError)
    with Session(bind=banco_migrado) as sessao:
        missao = sessao.get(Mission, diaria_de_quarta)
        assert missao is not None
        assert missao.state is MissionState.CONCLUIDA
        assert missao.completed_at == ANTES
        assert (
            sessao.scalar(
                select(func.count())
                .select_from(MissionOperation)
                .where(MissionOperation.mission_id == diaria_de_quarta)
            )
            == 1
        )


def test_duas_conclusoes_do_mesmo_lado_da_meia_noite_produzem_uma_so(
    banco_migrado: Engine, diaria_de_quarta: int
) -> None:
    """Dois relogios do MESMO lado da meia-noite: a MESMA disponibilidade
    (`disponivel`) para as duas threads. Ao contrario do teste acima, o
    resultado AQUI depende de qual conexao trava primeiro -- e por isso e
    este teste, e nao aquele, que prova que o `FOR UPDATE` continua
    necessario perto da virada do dia."""
    resultados = _duas_conclusoes(
        banco_migrado,
        diaria_de_quarta,
        [("um", QUASE_MEIA_NOITE_UM), ("dois", QUASE_MEIA_NOITE_DOIS)],
    )

    valores = list(resultados.values())
    assert valores.count("ok") == 1
    # A perdedora encontra a missao ja `concluida`: e transicao ilegal, nunca
    # expiracao -- os dois relogios sao do mesmo dia da diaria.
    assert TransicaoIlegalError in valores
    with Session(bind=banco_migrado) as sessao:
        missao = sessao.get(Mission, diaria_de_quarta)
        assert missao is not None
        assert missao.state is MissionState.CONCLUIDA
        assert missao.completed_at in (QUASE_MEIA_NOITE_UM, QUASE_MEIA_NOITE_DOIS)
        assert (
            sessao.scalar(
                select(func.count())
                .select_from(MissionOperation)
                .where(MissionOperation.mission_id == diaria_de_quarta)
            )
            == 1
        )
