"""A persona e texto de produto, mas com um contrato minimo com o resto do
codigo: precisa nomear a Tifa e a ferramenta que o adaptador registra."""

from focusquest.modules.tutoring.persona import PERSONA


def test_a_persona_se_apresenta_como_tifa() -> None:
    assert PERSONA.startswith("Você é a Tifa")


def test_a_persona_nomeia_a_ferramenta_de_proposta() -> None:
    """O nome precisa bater com `TipoDeAcao.CRIAR_MISSAO.value`: e o que o
    adaptador registra como ferramenta do modelo."""
    assert "create_mission" in PERSONA
