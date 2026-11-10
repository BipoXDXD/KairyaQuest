"""Camada 3 da conclusao tardia no contexto (pendencia 180): o texto novo do
contexto e da persona (pendencia 117) contra a API real, com o fallback da
recusa ligado (pendencia 174).

Uso, uma vez, com a chave vinda do Keychain do macOS so para este processo
e o `anthropic_base_url` sem override (roteiro da pendencia 42):

    FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password \\
      -s focusquest-anthropic -w)" PYTHONPATH=tests \\
      uv run python -m integration.camada3_da_conclusao_tardia

O turno sai do `montar_turno` de producao (transiente, sem banco) com UMA
avulsa pendente, com `#id`, e a diaria de ONTEM em andamento, na secao de
conclusao tardia (sem `#id`, como o contexto a monta). A pessoa pede para
adiar a diaria de ontem. A persona manda nunca reagendar a diaria e lembrar
que ainda da para concluir ate o limite; o `responder` oferece
`create_mission` e `reschedule_mission`, como a tela.

Aprovado so se o modelo NAO propuser `reschedule_mission` (nem para a
avulsa, que e a unica com `#id`) e o stream chegar ao `message_stop`. O texto
da resposta e mostrado na tela para ler se ela lembra o limite -- dados de
agenda ficticios, nao segredo -- e NADA e gravado: a referencia da conversa
(`camada3.REFERENCIA`) fica como esta. A sequencia de tipos e comparada com
ela sem o bloco `tool_use`, so para registro.
"""

import json
import sys
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from focusquest.core.config import Settings
from focusquest.modules.missions.cycle_domain import (
    Availability,
    dia_de,
    fim_do_dia,
)
from focusquest.modules.missions.cycle_service import MissaoLida
from focusquest.modules.missions.domain import MissionState, MissionType
from focusquest.modules.missions.models import Mission
from focusquest.modules.tutoring.anthropic_provider import ProvedorAnthropic
from focusquest.modules.tutoring.context import montar_turno
from focusquest.modules.tutoring.domain import TipoDeAcao
from focusquest.modules.tutoring.persona import PERSONA
from focusquest.modules.tutoring.provider import (
    Delta,
    MensagemDoTurno,
    Proposta,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from integration import camada3
from integration.espiao import Espiao, provedor_espionado

_API_REAL = "api.anthropic.com"

ID_DA_AVULSA = 7

_PEDIDO = (
    "Não vou conseguir terminar a diária de ontem hoje. "
    "Dá para adiar ela para amanhã à noite?"
)


def _avulsa(agora: datetime) -> Mission:
    """A avulsa pendente, transiente: o `montar_turno` so le os campos."""
    return Mission(
        id=ID_DA_AVULSA,
        instructions="Revisar recursão: 5 exercícios do capítulo 4",
        completion_criterion="5 exercícios resolvidos",
        difficulty=2,
        estimated_minutes=45,
        deadline=agora + timedelta(days=2),
        mission_type=MissionType.AVULSA,
        state=MissionState.PENDENTE,
    )


def _diaria_de_ontem(agora: datetime) -> MissaoLida:
    """A diaria de ontem, iniciada 20 minutos antes do prazo (a meia-noite de
    Sao Paulo que abriu hoje): e o `disponivel` da conclusao tardia."""
    ontem = dia_de(agora) - timedelta(days=1)
    prazo = fim_do_dia(ontem)
    missao = Mission(
        id=ID_DA_AVULSA + 1,
        instructions="Resolver 5 exercícios de laço",
        completion_criterion="5 exercícios resolvidos",
        difficulty=2,
        estimated_minutes=30,
        mission_type=MissionType.DIARIA,
        day=ontem,
        state=MissionState.EM_ANDAMENTO,
        started_at=(prazo - timedelta(minutes=20)).astimezone(UTC),
    )
    return MissaoLida(
        missao=missao, deadline=prazo, availability=Availability.DISPONIVEL
    )


def turno(agora: datetime) -> Turno:
    base = montar_turno(
        persona=PERSONA,
        agora=agora,
        pendentes=[_avulsa(agora)],
        progresso=camada3._SEM_PROGRESSO,
        historico=[],
        tardias=(_diaria_de_ontem(agora),),
    )
    return Turno(
        sistema=base.sistema,
        contexto=base.contexto,
        mensagens=(MensagemDoTurno("user", _PEDIDO),),
    )


def capturar(
    provedor: ProvedorAnthropic, espiao: Espiao, *, agora: datetime
) -> tuple[list[str], list[Proposta], str]:
    """A sequencia de tipos, as propostas e o texto que o `responder` entregou."""
    propostas: list[Proposta] = []
    texto: list[str] = []
    for evento in provedor.responder(turno(agora)):
        if isinstance(evento, Proposta):
            propostas.append(evento)
        elif isinstance(evento, Delta):
            texto.append(evento.texto)
    return camada3.sequencia_de_tipos(espiao.linhas()), propostas, "".join(texto)


def sem_bloco_de_ferramenta(tipos: Sequence[str]) -> list[str]:
    """A sequencia sem o bloco `tool_use`: do inicio dele ate o seu fim."""
    saida: list[str] = []
    dentro = False
    for tipo in tipos:
        if tipo == "content_block_start:tool_use":
            dentro = True
        elif dentro and tipo == "content_block_stop":
            dentro = False
        elif not dentro:
            saida.append(tipo)
    return saida


def problema(propostas: Sequence[Proposta], tipos: Sequence[str]) -> str | None:
    """`None` se o modelo nao reagendou nada e o stream terminou inteiro."""
    reagendamentos = [
        p for p in propostas if p.nome == TipoDeAcao.REAGENDAR_MISSAO.value
    ]
    if reagendamentos:
        entradas = [p.entrada.get("mission_id") for p in reagendamentos]
        return f"o modelo propos reschedule_mission (mission_id {entradas})"
    if not tipos or tipos[-1] != "message_stop":
        return "o stream terminou sem message_stop"
    return None


def main() -> None:
    settings = Settings()
    if urlsplit(settings.anthropic_base_url).hostname != _API_REAL:
        raise SystemExit(
            "a camada 3 so mede a API real; o anthropic_base_url aponta para "
            f"'{urlsplit(settings.anthropic_base_url).hostname}'"
        )
    if settings.anthropic_api_key is None:
        raise SystemExit("sem FOCUSQUEST_ANTHROPIC_API_KEY no ambiente")
    provedor, espiao = provedor_espionado(
        chave=settings.anthropic_api_key.get_secret_value(),
        base_url=settings.anthropic_base_url,
        modelo=settings.tutor_model,
        max_tokens=settings.tutor_max_tokens,
        timeout_segundos=settings.tutor_timeout_seconds,
        fallback=settings.tutor_fallback,
        esforco=settings.tutor_effort,
        esforco_da_avaliacao=settings.evaluation_effort,
    )
    agora = datetime.now(UTC)
    try:
        tipos, propostas, texto = capturar(provedor, espiao, agora=agora)
    except (ProvedorIndisponivelError, TempoEsgotadoError) as erro:
        causa = erro.__cause__
        status = getattr(causa, "status_code", None)
        corpo = getattr(causa, "body", None)
        raise SystemExit(
            f"{type(erro).__name__} ({type(causa).__name__}, status {status}): "
            f"{json.dumps(corpo, ensure_ascii=False)}"
        ) from None
    referencia = json.loads(camada3.REFERENCIA.read_text())["eventos"]
    json.dump(
        {
            "modelo": settings.tutor_model,
            "max_tokens": settings.tutor_max_tokens,
            "fallback": settings.tutor_fallback,
            "eventos": tipos,
            "igual_a_referencia_sem_a_ferramenta": camada3.comparavel(tipos)
            == sem_bloco_de_ferramenta(camada3.comparavel(referencia)),
            "propostas": [
                {"ferramenta": p.nome, "entrada": p.entrada} for p in propostas
            ],
        },
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n--- texto da resposta ---\n")
    sys.stdout.write(texto)
    sys.stdout.write("\n--- fim do texto ---\n")
    falha = problema(propostas, tipos)
    if falha is not None:
        raise SystemExit(f"reprovado: {falha}")
    print("aprovado: nenhum reagendamento proposto, stream ate o message_stop")


if __name__ == "__main__":
    main()
