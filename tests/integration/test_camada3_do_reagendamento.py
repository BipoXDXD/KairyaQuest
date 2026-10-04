"""Camada 3 da conversa com DUAS ferramentas (pendencia 109): o cenario do
reagendamento pelo `ProvedorAnthropic.responder` de producao, que oferece
`create_mission` e `reschedule_mission`.

A chamada real (`camada3_do_reagendamento.main`) mede que o modelo escolhe
`reschedule_mission` com uma entrada que o `RescheduleProposal` aceita, e
compara a sequencia de tipos com a referencia da conversa
(`camada3.REFERENCIA`); estes testes provam o mesmo caminho contra o falso.
"""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from focusquest.modules.tutoring.domain import TipoDeAcao
from focusquest.modules.tutoring.provider import Proposta
from integration import camada3, camada3_do_reagendamento
from integration.conftest import TIMEOUT_DE_TESTE
from integration.espiao import provedor_espionado
from integration.provedor_falso import (
    ChamadaDeFerramenta,
    Roteiro,
    ServidorAnthropicFalso,
    Texto,
)

AGORA = datetime(2026, 9, 29, 15, tzinfo=UTC)


def _proposta_valida() -> dict[str, object]:
    return {
        "mission_id": camada3_do_reagendamento.ID_DA_MISSAO,
        "new_deadline": "2026-10-02T21:00:00Z",
        "reason": "falta_de_tempo",
    }


def _capturar(falso: ServidorAnthropicFalso) -> tuple[list[str], list[Proposta]]:
    provedor, espiao = provedor_espionado(
        chave="sk-ant-teste",
        base_url=falso.url,
        modelo="claude-opus-5",
        max_tokens=256,
        timeout_segundos=TIMEOUT_DE_TESTE,
        fallback=True,
    )
    return camada3_do_reagendamento.capturar(provedor, espiao, agora=AGORA)


def test_o_contexto_mostra_a_missao_avulsa_pendente_pelo_id(
    falso: ServidorAnthropicFalso,
) -> None:
    """Sem a missao no contexto, o pedido "adie a missao #N" nao teria o que
    reagendar, e a chamada real mediria outra coisa."""
    falso.roteiro = Roteiro(blocos=(Texto(("Certo.",)),))
    _capturar(falso)
    corpo = falso.recebidas[-1].corpo
    assert f"- #{camada3_do_reagendamento.ID_DA_MISSAO}: " in corpo["system"]
    assert (
        f"#{camada3_do_reagendamento.ID_DA_MISSAO}" in (corpo["messages"][0]["content"])
    )
    assert [t["name"] for t in corpo["tools"]] == [
        TipoDeAcao.CRIAR_MISSAO.value,
        TipoDeAcao.REAGENDAR_MISSAO.value,
    ]
    assert len(falso.recebidas) == 1


def test_o_falso_do_reagendamento_emite_a_sequencia_da_api_real(
    falso: ServidorAnthropicFalso,
) -> None:
    falso.roteiro = Roteiro(
        blocos=(
            Texto(("Sem culpa, ", "vamos mover.")),
            ChamadaDeFerramenta(
                _proposta_valida(), nome=TipoDeAcao.REAGENDAR_MISSAO.value
            ),
        )
    )
    tipos, propostas = _capturar(falso)
    referencia = json.loads(camada3.REFERENCIA.read_text())["eventos"]

    assert propostas == [
        Proposta(TipoDeAcao.REAGENDAR_MISSAO.value, _proposta_valida())
    ]
    assert camada3.comparavel(tipos) == camada3.comparavel(referencia)


@pytest.mark.parametrize(
    ("propostas", "esperado"),
    [
        ([Proposta("reschedule_mission", _proposta_valida())], None),
        ([], "o modelo nao propos nada"),
        (
            [Proposta("create_mission", _proposta_valida())],
            "o modelo chamou create_mission",
        ),
        (
            [Proposta("reschedule_mission", {**_proposta_valida(), "mission_id": 1})],
            "outra missao",
        ),
        (
            [Proposta("reschedule_mission", {**_proposta_valida(), "extra": 1})],
            "o RescheduleProposal recusou",
        ),
    ],
)
def test_o_veredito_do_reagendamento(
    propostas: list[Proposta], esperado: str | None
) -> None:
    """O que a chamada real exige para dizer "aprovado"."""
    problema = camada3_do_reagendamento.problema_da_proposta(
        propostas, agora=AGORA - timedelta(days=1)
    )
    if esperado is None:
        assert problema is None
    else:
        assert problema is not None
        assert esperado in problema


def test_a_captura_do_reagendamento_recusa_o_que_nao_e_a_api_real(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    destino = tmp_path / "referencia.json"
    monkeypatch.setattr(camada3, "REFERENCIA", destino)
    with pytest.raises(SystemExit, match="so grava a API real"):
        camada3_do_reagendamento.main()
    assert not destino.exists()
