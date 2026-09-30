"""Camada 3 do fallback da recusa (pendencia 174): a API ACEITA o pedido?

Uso, uma vez, com a chave vinda do Keychain do macOS so para este processo
e o `anthropic_base_url` sem override (roteiro da pendencia 42):

    FOCUSQUEST_ANTHROPIC_API_KEY="$(security find-generic-password \\
      -s focusquest-anthropic -w)" PYTHONPATH=tests \\
      uv run python -m integration.camada3_do_fallback

O que prova: o `ProvedorAnthropic.responder` de PRODUCAO, com o fallback
ligado, manda `fallbacks="default"` e o beta `server-side-fallback-2026-07-01`
com as duas ferramentas e `disable_parallel_tool_use`, sem `thinking`, e a
API responde o stream ate o `message_stop` (o risco R1 do plano: um 400 aqui
derrubaria toda pergunta). A sequencia de tipos e comparada com a da
referencia da conversa (`camada3.REFERENCIA`), e o `allowed_fallback_models`
do modelo e lido do Models API (sem cobranca de tokens), so para registro.

O que NAO prova: o fallback em si. Provocar uma recusa sob demanda exigiria
tentar burlar os classificadores de seguranca, e isso nao se faz (pendencia
175).

Grava `referencia_do_fallback_real.json`, ao lado deste arquivo: data, SDK,
modelo, beta, sequencia de tipos e `allowed_fallback_models` -- nunca o
texto, a entrada da ferramenta ou a chave. Se a API recusar, mostra o status
e o corpo do erro (que nao tem a chave) e nao grava nada.
"""

import json
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import anthropic

from focusquest.core.config import Settings
from focusquest.modules.tutoring.anthropic_provider import (
    BETA_DO_FALLBACK,
    ProvedorAnthropic,
)
from focusquest.modules.tutoring.context import montar_turno
from focusquest.modules.tutoring.persona import PERSONA
from focusquest.modules.tutoring.provider import (
    EventoDoProvedor,
    Fim,
    MensagemDoTurno,
    Proposta,
    ProvedorIndisponivelError,
    TempoEsgotadoError,
    Turno,
)
from integration import camada3
from integration.espiao import provedor_espionado

REFERENCIA_DO_FALLBACK = Path(__file__).with_name("referencia_do_fallback_real.json")

_API_REAL = "api.anthropic.com"


@dataclass(frozen=True)
class Captura:
    """O que a chamada deixou: os tipos crus, os eventos do dominio e, do
    pedido, so o corpo e os betas (nunca a chave)."""

    tipos: list[str]
    eventos: list[EventoDoProvedor]
    corpo: dict[str, Any] | None
    betas: list[str]

    @property
    def fim(self) -> Fim | None:
        return next((e for e in self.eventos if isinstance(e, Fim)), None)

    @property
    def propostas(self) -> list[str]:
        return [e.nome for e in self.eventos if isinstance(e, Proposta)]


def turno(agora: datetime) -> Turno:
    """O turno da camada 3 da conversa: quadro vazio e o mesmo pedido."""
    base = montar_turno(
        persona=PERSONA,
        agora=agora,
        pendentes=[],
        progresso=camada3._SEM_PROGRESSO,
        historico=[],
    )
    return Turno(
        sistema=base.sistema, mensagens=(MensagemDoTurno("user", camada3._PEDIDO),)
    )


def capturar(
    *,
    chave: str,
    base_url: str,
    modelo: str,
    max_tokens: int,
    timeout_segundos: float,
    agora: datetime,
) -> tuple[Captura, ProvedorAnthropic]:
    """Uma chamada pelo adaptador de producao com o fallback LIGADO."""
    provedor, espiao = provedor_espionado(
        chave=chave,
        base_url=base_url,
        modelo=modelo,
        max_tokens=max_tokens,
        timeout_segundos=timeout_segundos,
        fallback=True,
    )
    eventos = list(provedor.responder(turno(agora)))
    captura = Captura(
        tipos=camada3.sequencia_de_tipos(espiao.linhas()),
        eventos=eventos,
        corpo=espiao.corpo_do_pedido(),
        betas=espiao.betas_do_pedido(),
    )
    return captura, provedor


def problemas(captura: Captura) -> list[str]:
    """Vazio se a API aceitou o pedido com o fallback; senao, o que falhou."""
    achados: list[str] = []
    if captura.corpo is None or captura.corpo.get("fallbacks") != "default":
        achados.append("o pedido nao levou fallbacks=default")
    if BETA_DO_FALLBACK not in captura.betas:
        achados.append(f"o pedido nao declarou o beta {BETA_DO_FALLBACK}")
    if captura.fim is None:
        achados.append("o stream terminou sem message_stop")
    return achados


def _modelos_de_fallback(provedor: ProvedorAnthropic, modelo: str) -> object:
    """O `allowed_fallback_models` do modelo, ou o erro, para registro."""
    try:
        info = provedor._cliente.beta.models.retrieve(modelo, betas=[BETA_DO_FALLBACK])
    except anthropic.APIStatusError as erro:
        return {"erro": f"status {erro.status_code}"}
    except anthropic.APIError as erro:
        return {"erro": type(erro).__name__}
    return info.allowed_fallback_models


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
    try:
        captura, provedor = capturar(
            chave=settings.anthropic_api_key.get_secret_value(),
            base_url=settings.anthropic_base_url,
            modelo=settings.tutor_model,
            max_tokens=settings.tutor_max_tokens,
            timeout_segundos=settings.tutor_timeout_seconds,
            agora=datetime.now(UTC),
        )
    except (ProvedorIndisponivelError, TempoEsgotadoError) as erro:
        causa = erro.__cause__
        status = getattr(causa, "status_code", None)
        corpo = getattr(causa, "body", None)
        raise SystemExit(
            f"{type(erro).__name__} ({type(causa).__name__}, status {status}): "
            f"{json.dumps(corpo, ensure_ascii=False)}; nada foi gravado"
        ) from None
    fim = captura.fim
    resumo = {
        "eventos": captura.tipos,
        "propostas": captura.propostas,
        "parada": None if fim is None else fim.parada.value,
        "substituto": None if fim is None else fim.substituto,
    }
    json.dump(resumo, sys.stdout)
    sys.stdout.write("\n")
    achados = problemas(captura)
    if achados:
        raise SystemExit(f"reprovado: {'; '.join(achados)}; nada foi gravado")
    gravada = json.loads(camada3.REFERENCIA.read_text())["eventos"]
    igual = camada3.comparavel(captura.tipos) == camada3.comparavel(gravada)
    permitidos = _modelos_de_fallback(provedor, settings.tutor_model)
    REFERENCIA_DO_FALLBACK.write_text(
        json.dumps(
            {
                "capturada_em": datetime.now(UTC).date().isoformat(),
                "sdk": f"anthropic=={anthropic.__version__}",
                "modelo": settings.tutor_model,
                "beta": BETA_DO_FALLBACK,
                "fallbacks": "default",
                "aceito": True,
                "eventos": captura.tipos,
                "mesma_sequencia_da_conversa": igual,
                "substituto": resumo["substituto"],
                "allowed_fallback_models": permitidos,
            },
            indent=2,
        )
        + "\n"
    )
    print(
        "aprovado: a API aceitou o fallback; sequencia "
        + ("igual" if igual else "DIFERENTE")
        + f" da referencia da conversa; allowed_fallback_models: {permitidos}"
    )


if __name__ == "__main__":
    main()
