"""`_mesma_evidencia`: quando o reenvio e o MESMO pedido (pendencia 97, T-M1).

A funcao decide, no reenvio de uma conclusao, entre devolver o sucesso de antes
e recusar a chave como gasta. Um falso positivo (`True` quando as evidencias
diferem) devolveria 200 a quem pediu outra coisa; um falso negativo (`False`
para o mesmo pedido) transformaria o reenvio legitimo em 409. Os dois erros
sao silenciosos para os testes que so cobrem "igual" e "totalmente diferente",
por isso aqui cada ELEMENTO da dupla `(texto, link)` varia sozinho, nos dois
sentidos, e os casos de ausencia cobrem as quatro combinacoes de
presente/ausente.

A igualdade e ESTRITA de proposito: o texto chega aqui ja normalizado pela
borda (strip do pydantic), entao "Feito" e "feito", ou "Feito" e "Feito ",
sao pedidos diferentes, e a funcao nao tem de "ajudar".
"""

from datetime import UTC, datetime

import pytest

from focusquest.modules.missions.models import MissionEvidence
from focusquest.modules.missions.service import NovaEvidencia, _mesma_evidencia

# O instante da gravacao nao participa da comparacao: o reenvio chega depois.
GRAVADA_EM = datetime(2026, 9, 18, 15, 0, tzinfo=UTC)
LINK = "https://exemplo.com/a"


def _gravada(texto: str, link: str | None) -> MissionEvidence:
    return MissionEvidence(text=texto, link=link, submitted_at=GRAVADA_EM)


@pytest.mark.parametrize(
    ("gravada", "pedida"),
    [
        pytest.param(None, None, id="nenhuma-nas-duas-vezes"),
        pytest.param(
            _gravada("Feito", None), NovaEvidencia("Feito", None), id="so-texto"
        ),
        pytest.param(
            _gravada("Feito", LINK), NovaEvidencia("Feito", LINK), id="texto-e-link"
        ),
    ],
)
def test_e_o_mesmo_pedido(
    gravada: MissionEvidence | None, pedida: NovaEvidencia | None
) -> None:
    assert _mesma_evidencia(gravada, pedida) is True


@pytest.mark.parametrize(
    ("gravada", "pedida"),
    [
        # Ausencia: as duas assimetrias. "Nenhuma" so combina com "nenhuma".
        pytest.param(None, NovaEvidencia("Feito", None), id="gravada-ausente"),
        pytest.param(_gravada("Feito", None), None, id="pedida-ausente"),
        pytest.param(_gravada("Feito", LINK), None, id="pedida-ausente-com-link"),
        # Cada elemento da dupla varia sozinho: o outro fica igual.
        pytest.param(
            _gravada("Feito", None), NovaEvidencia("Outro", None), id="texto-diferente"
        ),
        pytest.param(
            _gravada("Feito", LINK),
            NovaEvidencia("Outro", LINK),
            id="texto-diferente-mesmo-link",
        ),
        pytest.param(
            _gravada("Feito", None), NovaEvidencia("Feito", LINK), id="link-a-mais"
        ),
        pytest.param(
            _gravada("Feito", LINK), NovaEvidencia("Feito", None), id="link-a-menos"
        ),
        pytest.param(
            _gravada("Feito", LINK),
            NovaEvidencia("Feito", LINK + "/b"),
            id="link-diferente",
        ),
        # Fronteira da igualdade: um unico caractere, de caixa ou de espaco.
        pytest.param(
            _gravada("Feito", None), NovaEvidencia("feito", None), id="so-a-caixa"
        ),
        pytest.param(
            _gravada("Feito", None), NovaEvidencia("Feito ", None), id="so-um-espaco"
        ),
        pytest.param(
            _gravada("Feito", None),
            NovaEvidencia("Feit", None),
            id="um-caractere-a-menos",
        ),
    ],
)
def test_e_outro_pedido(
    gravada: MissionEvidence | None, pedida: NovaEvidencia | None
) -> None:
    assert _mesma_evidencia(gravada, pedida) is False


def test_o_instante_da_gravacao_nao_entra_na_comparacao() -> None:
    """O reenvio chega horas depois: `submitted_at` jamais pode distinguir."""
    gravada = _gravada("Feito", LINK)
    gravada.submitted_at = datetime(2020, 1, 1, tzinfo=UTC)
    assert _mesma_evidencia(gravada, NovaEvidencia("Feito", LINK)) is True
