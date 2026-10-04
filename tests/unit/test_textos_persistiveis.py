"""Os contratos recusam NUL sem sanitizar outros caracteres ou alterar limites."""

from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from focusquest.modules.missions.cycle_schemas import BonusCreate, DailyCreate
from focusquest.modules.missions.schemas import MissionComplete, MissionCreate
from focusquest.modules.tutoring.schemas import ActionConfirm, MessageCreate

MISSAO: dict[str, Any] = {
    "instructions": "Ler",
    "completion_criterion": "Resumo",
    "difficulty": 2,
    "estimated_minutes": 30,
    "deadline": "2026-09-22T15:00:00Z",
}
DIARIA = {chave: valor for chave, valor in MISSAO.items() if chave != "deadline"}
ESPECIAL = {chave: valor for chave, valor in DIARIA.items() if chave != "difficulty"}
CONTRATOS = [
    (MissionCreate, MISSAO, "instructions"),
    (MissionCreate, MISSAO, "completion_criterion"),
    (DailyCreate, DIARIA, "instructions"),
    (DailyCreate, DIARIA, "completion_criterion"),
    (BonusCreate, ESPECIAL, "instructions"),
    (BonusCreate, ESPECIAL, "completion_criterion"),
    (MissionComplete, {"operation_id": "op"}, "operation_id"),
    (MessageCreate, {"content": "Oi", "client_message_id": "msg"}, "content"),
    (MessageCreate, {"content": "Oi", "client_message_id": "msg"}, "client_message_id"),
    (ActionConfirm, {"operation_id": "op"}, "operation_id"),
]


@pytest.mark.parametrize("schema,corpo,campo", CONTRATOS)
@pytest.mark.parametrize("texto", ["\x00", "\x00abc", "a\x00b", "abc\x00"])
def test_recusa_nul_em_qualquer_posicao(
    schema: type[BaseModel], corpo: dict[str, Any], campo: str, texto: str
) -> None:
    with pytest.raises(ValidationError) as erro:
        schema.model_validate(corpo | {campo: texto})
    (detalhe,) = erro.value.errors()
    assert detalhe["loc"] == (campo,)
    assert detalhe["type"] == "value_error"
    assert detalhe["input"] == texto


@pytest.mark.parametrize("schema,corpo,campo", CONTRATOS)
def test_preserva_texto_unicode_com_trim_so_na_pergunta(
    schema: type[BaseModel], corpo: dict[str, Any], campo: str
) -> None:
    texto = "  Revisão 🗡️\nÁrvore 漢字  "
    validado = schema.model_validate(corpo | {campo: texto})
    esperado = "Revisão 🗡️\nÁrvore 漢字" if campo == "content" else texto
    assert getattr(validado, campo) == esperado


def test_pergunta_so_com_espacos_continua_invalida() -> None:
    with pytest.raises(ValidationError) as erro:
        MessageCreate(client_message_id="id", content=" \n\t ")
    (detalhe,) = erro.value.errors()
    assert detalhe["loc"] == ("content",)
    assert detalhe["type"] == "string_too_short"


def test_trim_da_pergunta_ocorre_antes_do_teto() -> None:
    texto = "🗡" * 4000
    pergunta = MessageCreate(client_message_id=" id ", content=f"  {texto}\n\t ")
    assert pergunta.content == texto
    assert pergunta.client_message_id == " id "


@pytest.mark.parametrize(
    "identificador,tipo,mensagem,contexto",
    [
        (
            "",
            "string_too_short",
            "String should have at least 1 character",
            {"min_length": 1},
        ),
        (
            "🗡" * 201,
            "string_too_long",
            "String should have at most 200 characters",
            {"max_length": 200},
        ),
        (
            " " + "漢" * 200 + " ",
            "string_too_long",
            "String should have at most 200 characters",
            {"max_length": 200},
        ),
    ],
    ids=["vazio", "unicode-201", "unicode-200-mais-padding"],
)
def test_erros_de_tamanho_do_identificador_preservam_o_contrato(
    identificador: str, tipo: str, mensagem: str, contexto: dict[str, int]
) -> None:
    with pytest.raises(ValidationError) as erro:
        MessageCreate(client_message_id=identificador, content="Oi")
    (detalhe,) = erro.value.errors()
    assert detalhe["loc"] == ("client_message_id",)
    assert detalhe["type"] == tipo
    assert detalhe["msg"] == mensagem
    assert detalhe["ctx"] == contexto
    assert detalhe["input"] == identificador


@pytest.mark.parametrize(
    "identificador",
    ["🗡" * 200, " " + "漢" * 198 + " "],
    ids=["unicode-200", "unicode-198-mais-padding"],
)
def test_identificador_unicode_no_teto_preserva_espacos(identificador: str) -> None:
    pergunta = MessageCreate(client_message_id=identificador, content="Oi")
    assert pergunta.client_message_id == identificador
