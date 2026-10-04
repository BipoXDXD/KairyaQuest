"""Camada 3 da conversa com DUAS ferramentas (pendencia 109): o pedido de
reagendamento pelo `ProvedorAnthropic.responder` de producao.

Uso, uma vez, com a chave vinda do Keychain do macOS so para este processo
e o `anthropic_base_url` sem override (roteiro da pendencia 42):

    FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password \\
      -s focusquest-anthropic -w)" PYTHONPATH=tests \\
      uv run python -m integration.camada3_do_reagendamento

O turno sai do `montar_turno` de producao com UMA missao avulsa pendente
(transiente, sem banco) e o pedido "estou sem tempo, adie a missao #N para
sexta"; o `responder` oferece `create_mission` e `reschedule_mission`, como a
tela. Aprovado so se o modelo chamar `reschedule_mission` para a missao #N
com uma entrada que o `RescheduleProposal` aceite.

A referencia da conversa (`camada3.REFERENCIA`) so e REGRAVADA se a sequencia
de tipos (sem o `ping`) mudou em relacao a gravada: com a mesma sequencia, a
fotografia de uma ferramenta continua valendo para duas, e o arquivo fica.
Na tela sai a sequencia, o nome da ferramenta, o `reason` e o `new_deadline`
(dados de agenda, nao segredo); o texto da resposta, nao.
"""

import json
import sys
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

import anthropic
from pydantic import ValidationError

from focusquest.core.config import Settings
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.context import montar_turno
from focusquest.modules.tutoring.domain import TipoDeAcao
from focusquest.modules.tutoring.persona import PERSONA
from focusquest.modules.tutoring.provider import (
    MensagemDoTurno,
    Proposta,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from focusquest.modules.tutoring.schemas import RescheduleProposal
from integration import camada3
from integration.espiao import Espiao, provedor_espionado

_API_REAL = "api.anthropic.com"

ID_DA_MISSAO = 7

_PEDIDO = (
    f"Estou sem tempo essa semana. Adie a missão #{ID_DA_MISSAO} para sexta, "
    "às 18h no horário de Brasília."
)


def _missao(agora: datetime) -> Mission:
    """A avulsa pendente, transiente: o `montar_turno` so le os campos."""
    return Mission(
        id=ID_DA_MISSAO,
        instructions="Revisar recursão: 5 exercícios do capítulo 4",
        completion_criterion="5 exercícios resolvidos",
        difficulty=2,
        estimated_minutes=45,
        deadline=agora + timedelta(days=1),
        mission_type=MissionType.AVULSA,
        state=MissionState.PENDENTE,
    )


def turno(agora: datetime) -> Turno:
    base = montar_turno(
        persona=PERSONA,
        agora=agora,
        pendentes=[_missao(agora)],
        progresso=camada3._SEM_PROGRESSO,
        historico=[],
    )
    return Turno(sistema=base.sistema, mensagens=(MensagemDoTurno("user", _PEDIDO),))


def capturar(
    provedor: ProvedorAnthropic, espiao: Espiao, *, agora: datetime
) -> tuple[list[str], list[Proposta]]:
    """A sequencia de tipos e as propostas que o `responder` entregou."""
    propostas = [
        evento
        for evento in provedor.responder(turno(agora))
        if isinstance(evento, Proposta)
    ]
    return camada3.sequencia_de_tipos(espiao.linhas()), propostas


def problema_da_proposta(
    propostas: Sequence[Proposta], *, agora: datetime
) -> str | None:
    """`None` se o modelo pediu o reagendamento certo; senao, o que falhou."""
    if not propostas:
        return "o modelo nao propos nada"
    proposta = propostas[-1]
    if proposta.nome != TipoDeAcao.REAGENDAR_MISSAO.value:
        return f"o modelo chamou {proposta.nome}"
    try:
        valida = RescheduleProposal.model_validate(proposta.entrada)
    except ValidationError as erro:
        campos = [".".join(map(str, e["loc"])) for e in erro.errors()]
        return f"o RescheduleProposal recusou (campos: {campos})"
    if valida.mission_id != ID_DA_MISSAO:
        return f"o modelo reagendou outra missao (#{valida.mission_id})"
    if valida.new_deadline <= agora:
        return "o novo prazo esta no passado"
    return None


def main() -> None:
    settings = Settings()
    if urlsplit(settings.anthropic_base_url).hostname != _API_REAL:
        raise SystemExit(
            "a camada 3 so grava a API real; o anthropic_base_url aponta para "
            f"'{urlsplit(settings.anthropic_base_url).hostname}'"
        )
    if settings.anthropic_api_key is None:
        raise SystemExit(
            "sem FOCUSQUEST_ANTHROPIC_API_KEY no ambiente; nada foi gravado"
        )
    provedor, espiao = provedor_espionado(
        chave=settings.anthropic_api_key.get_secret_value(),
        base_url=settings.anthropic_base_url,
        modelo=settings.tutor_model,
        max_tokens=settings.tutor_max_tokens,
        timeout_segundos=settings.tutor_timeout_seconds,
        fallback=settings.tutor_fallback,
    )
    agora = datetime.now(UTC)
    try:
        tipos, propostas = capturar(provedor, espiao, agora=agora)
    except (ProvedorIndisponivelError, TempoEsgotadoError) as erro:
        causa = erro.__cause__
        status = getattr(causa, "status_code", None)
        corpo = getattr(causa, "body", None)
        raise SystemExit(
            f"{type(erro).__name__} ({type(causa).__name__}, status {status}): "
            f"{json.dumps(corpo, ensure_ascii=False)}; nada foi gravado"
        ) from None
    json.dump({"eventos": tipos}, sys.stdout)
    sys.stdout.write("\n")
    for proposta in propostas:
        json.dump(
            {
                "ferramenta": proposta.nome,
                "reason": proposta.entrada.get("reason"),
                "new_deadline": proposta.entrada.get("new_deadline"),
                "mission_id": proposta.entrada.get("mission_id"),
            },
            sys.stdout,
        )
        sys.stdout.write("\n")
    problema = problema_da_proposta(propostas, agora=agora)
    if problema is not None:
        raise SystemExit(f"reprovado: {problema}; nada foi gravado")
    gravada = json.loads(camada3.REFERENCIA.read_text())["eventos"]
    if camada3.comparavel(tipos) == camada3.comparavel(gravada):
        print("aprovado; a sequencia e a da referencia gravada, que fica como esta")
        return
    camada3.REFERENCIA.write_text(
        json.dumps(
            {
                "capturada_em": datetime.now(UTC).date().isoformat(),
                "sdk": f"anthropic=={anthropic.__version__}",
                "modelo": settings.tutor_model,
                "eventos": tipos,
            },
            indent=2,
        )
        + "\n"
    )
    print("aprovado; a sequencia MUDOU e a referencia da conversa foi regravada")


if __name__ == "__main__":
    main()
