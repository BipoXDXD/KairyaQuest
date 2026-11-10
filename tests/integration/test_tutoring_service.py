"""Preparar e transmitir um turno, com o banco real e o servidor falso.

O gerador `transmitir` e consumido direto, e nao por HTTP: o `TestClient`
bufferiza a resposta inteira, e so aqui da para olhar o banco NO
INSTANTE de cada evento.
"""

import json
import threading
from collections.abc import Callable, Generator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.errors import MensagemEmAndamentoError, OperacaoReutilizadaError
from focusquest.modules.missions.cycle_service import (
    NovaDiaria,
    NovaEspecial,
    criar_plano,
)
from focusquest.modules.missions.domain import MissionType
from focusquest.modules.missions.models import Mission
from focusquest.modules.missions.service import concluir_missao, iniciar_missao
from focusquest.modules.progression.models import XpEntry
from focusquest.modules.tutoring.context import CABECALHO_DO_CONTEXTO
from focusquest.modules.tutoring.domain import (
    RESPOSTA_LONGA,
    CodigoDoStream,
    EstadoDaAcao,
    StatusDaMensagem,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.service import (
    FOLGA_DO_ORFAO,
    EventoDoTurno,
    JaRespondida,
    ParaGerar,
    PerguntaGravada,
    RespostaConcluida,
    RespostaFalhou,
    Trecho,
    Tutoria,
    listar_mensagens,
    preparar_turno,
    transmitir,
)
from integration.conftest import Conversa
from integration.provedor_falso import (
    APOS_O_PRIMEIRO_PEDACO,
    ChamadaDeFerramenta,
    MotivoDeParada,
    Roteiro,
    ServidorAnthropicFalso,
    Substituicao,
    Texto,
)

ESTUDANTE = 1
AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
PROPOSTA_VALIDA = {
    "instructions": "Ler o capitulo 3",
    "completion_criterion": "Resumo de uma pagina",
    "difficulty": 2,
    "estimated_minutes": 30,
    "deadline": "2026-09-20T12:00:00+00:00",
}


def _preparar(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    cid: str,
    conteudo: str = "Me da uma missao?",
    agora: datetime = AGORA,
) -> JaRespondida | ParaGerar:
    """Prepara e COMMITA, como a rota faz antes de abrir o stream."""
    with fabrica() as sessao:
        preparo = preparar_turno(
            sessao,
            user_id=ESTUDANTE,
            client_message_id=cid,
            conteudo=conteudo,
            tutoria=tutoria,
            clock=lambda: agora,
        )
        sessao.commit()
    return preparo


def _transmitir(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    preparo: JaRespondida | ParaGerar,
    relogio: Callable[[], datetime] = lambda: AGORA,
) -> Generator[EventoDoTurno]:
    return transmitir(fabrica, preparo, tutoria, clock=relogio)


def _resposta(fabrica: sessionmaker[Session], resposta_id: int) -> TutorMessage:
    """A resposta como OUTRA conexao a ve: so o que foi commitado."""
    with fabrica() as sessao:
        resposta = sessao.get(TutorMessage, resposta_id)
        assert resposta is not None
        return resposta


def _para_gerar(preparo: JaRespondida | ParaGerar) -> ParaGerar:
    assert isinstance(preparo, ParaGerar)
    return preparo


def _contexto_do_sistema(sistema: str) -> dict[str, Any]:
    """O JSON do contexto: a ultima linha do sistema, logo depois do
    cabecalho fixo (pendencia 184)."""
    *_, cabecalho, linha = sistema.rpartition(f"{CABECALHO_DO_CONTEXTO}\n")
    assert cabecalho == f"{CABECALHO_DO_CONTEXTO}\n"
    dados: dict[str, Any] = json.loads(linha)
    return dados


# --- O caminho feliz -------------------------------------------------------


def test_a_ordem_dos_eventos(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Bora, ", "estudar!")),))
    preparo = _preparar(fabrica, tutoria, conversa.id("ordem"))
    eventos = list(_transmitir(fabrica, tutoria, preparo))

    assert isinstance(eventos[0], PerguntaGravada)
    assert eventos[0].mensagem.content == "Me da uma missao?"
    assert eventos[1:3] == [Trecho("Bora, "), Trecho("estudar!")]
    assert isinstance(eventos[3], RespostaConcluida)
    assert eventos[3].mensagem.content == "Bora, estudar!"
    assert eventos[3].mensagem.status is StatusDaMensagem.COMPLETA
    assert len(eventos) == 4


def test_done_so_depois_do_commit(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """No instante do `RespostaConcluida`, outra conexao ja ve a resposta
    completa -- com a acao. Emitido antes do commit, o cliente poderia
    confirmar uma acao que ainda nao existe."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Toma",)), ChamadaDeFerramenta(PROPOSTA_VALIDA))
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("commit")))
    for evento in _transmitir(fabrica, tutoria, preparo):
        if isinstance(evento, RespostaConcluida):
            vista = _resposta(fabrica, preparo.resposta_id)
            assert vista.status is StatusDaMensagem.COMPLETA
            assert [a.state for a in vista.actions] == [EstadoDaAcao.PROPOSTA]
            break
    else:
        pytest.fail("o turno terminou sem RespostaConcluida")


def test_a_proposta_valida_vira_acao_com_o_payload_normalizado(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(
        blocos=(Texto(("Toma",)), ChamadaDeFerramenta(PROPOSTA_VALIDA))
    )
    preparo = _preparar(fabrica, tutoria, conversa.id("proposta"))
    *_, final = _transmitir(fabrica, tutoria, preparo)
    assert isinstance(final, RespostaConcluida)
    (acao,) = final.mensagem.actions
    assert acao.state is EstadoDaAcao.PROPOSTA
    assert acao.payload == PROPOSTA_VALIDA | {"deadline": "2026-09-20T12:00:00Z"}


# --- As falhas -------------------------------------------------------------


def test_erro_so_depois_de_gravar_a_falha(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(status_http=500)
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("erro")))
    for evento in _transmitir(fabrica, tutoria, preparo):
        if isinstance(evento, RespostaFalhou):
            assert evento.codigo is CodigoDoStream.PROVEDOR_INDISPONIVEL
            vista = _resposta(fabrica, preparo.resposta_id)
            assert vista.status is StatusDaMensagem.FALHOU
            assert vista.error_code == "provedor_indisponivel"
            break
    else:
        pytest.fail("o turno terminou sem RespostaFalhou")


def test_proposta_invalida_nao_grava_acao_e_mantem_o_texto(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(
        blocos=(
            Texto(("Toma",)),
            ChamadaDeFerramenta(PROPOSTA_VALIDA | {"difficulty": 99}),
        )
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("invalida")))
    *_, final = _transmitir(fabrica, tutoria, preparo)
    assert final == RespostaFalhou(CodigoDoStream.PROPOSTA_INVALIDA)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert vista.status is StatusDaMensagem.FALHOU
    assert vista.content == "Toma"
    assert vista.actions == []
    # Nenhuma chamada automatica nova (README s6).
    assert len(falso.recebidas) == 1


def test_stream_cortado_sem_fim_vira_provedor_indisponivel(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """A guarda do `Fim` (o SDK nao denuncia o corte): sem ela, o texto parcial
    viraria `completa`."""
    # Corta depois do primeiro pedaco ("meio"), antes do segundo.
    falso.roteiro = Roteiro(
        blocos=(Texto(("meio", "resto")),), cortar_apos_eventos=APOS_O_PRIMEIRO_PEDACO
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("corte")))
    *_, final = _transmitir(fabrica, tutoria, preparo)
    assert final == RespostaFalhou(CodigoDoStream.PROVEDOR_INDISPONIVEL)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content) == (StatusDaMensagem.FALHOU, "meio")


def test_demora_no_meio_vira_tempo_esgotado_com_o_texto_parcial(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    # A demora cai antes do segundo pedaco: "meio" ja chegou.
    falso.roteiro = Roteiro(
        blocos=(Texto(("meio", "resto")),),
        atrasar_evento=(APOS_O_PRIMEIRO_PEDACO, 1.2),
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("demora")))
    *_, final = _transmitir(fabrica, tutoria, preparo)
    assert final == RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO)
    assert _resposta(fabrica, preparo.resposta_id).content == "meio"


def test_o_limite_total_e_medido_pelo_relogio(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """O timeout do SDK e por espera; o limite total e do servico. Um
    relogio que anda 61 s por leitura estoura o limite de 60 s no primeiro
    pedaco, sem `sleep`."""
    falso.roteiro = Roteiro(blocos=(Texto(("um", "dois", "tres")),))
    leituras = iter(AGORA + timedelta(seconds=61 * n) for n in range(100))
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("limite")))
    eventos = list(
        _transmitir(fabrica, tutoria, preparo, relogio=lambda: next(leituras))
    )
    assert eventos[1:] == [Trecho("um"), RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO)]


def test_fechar_o_gerador_grava_interrompida_sem_acao(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """E o que a desconexao do cliente faz ao gerador (via o invoucro
    `fechando_ao_cancelar`): `close()` no meio."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("meio", "resto")), ChamadaDeFerramenta(PROPOSTA_VALIDA))
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("fechar")))
    gerador = transmitir(fabrica, preparo, tutoria, clock=lambda: AGORA)
    assert isinstance(next(gerador), PerguntaGravada)
    assert next(gerador) == Trecho("meio")
    gerador.close()
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content) == (StatusDaMensagem.INTERROMPIDA, "meio")
    assert vista.actions == []


def test_fechar_no_primeiro_yield_tambem_grava_interrompida(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """A desconexao mais cedo possivel: exatamente no `yield` da pergunta,
    antes de qualquer `Trecho`. Sem a guarda cobrir esse ponto, a resposta
    ficaria `gerando` ate o recolhimento de orfaos, em vez de `interrompida`
    de uma vez."""
    falso.roteiro = Roteiro(blocos=(Texto(("meio", "resto")),))
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("fechar-cedo")))
    gerador = transmitir(fabrica, preparo, tutoria, clock=lambda: AGORA)
    assert isinstance(next(gerador), PerguntaGravada)
    gerador.close()
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content) == (StatusDaMensagem.INTERROMPIDA, "")
    assert vista.actions == []


# --- O reenvio -------------------------------------------------------------


def test_reenvio_de_pergunta_respondida_nao_chama_o_modelo(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Resposta",)),))
    cid = conversa.id("reenvio")
    list(_transmitir(fabrica, tutoria, _preparar(fabrica, tutoria, cid)))
    assert len(falso.recebidas) == 1

    preparo = _preparar(fabrica, tutoria, cid)
    assert isinstance(preparo, JaRespondida)
    eventos = list(_transmitir(fabrica, tutoria, preparo))
    assert [type(e) for e in eventos] == [PerguntaGravada, RespostaConcluida]
    assert len(falso.recebidas) == 1


def test_reenvio_depois_de_interrompida_gera_resposta_nova(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("meio", "resto")),))
    cid = conversa.id("tentar-de-novo")
    primeira = _para_gerar(_preparar(fabrica, tutoria, cid))
    gerador = _transmitir(fabrica, tutoria, primeira)
    next(gerador), next(gerador)
    gerador.close()

    segunda = _para_gerar(_preparar(fabrica, tutoria, cid))
    assert segunda.pergunta.id == primeira.pergunta.id
    assert segunda.resposta_id != primeira.resposta_id
    *_, final = _transmitir(fabrica, tutoria, segunda)
    assert isinstance(final, RespostaConcluida)
    assert (
        _resposta(fabrica, primeira.resposta_id).status is StatusDaMensagem.INTERROMPIDA
    )


def test_pergunta_enquanto_outra_esta_gerando_e_recusada(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    cid = conversa.id("gerando")
    _preparar(fabrica, tutoria, cid)
    for outro in (cid, conversa.id("outra")):
        with pytest.raises(MensagemEmAndamentoError):
            _preparar(fabrica, tutoria, outro)
    # A pergunta recusada nao foi gravada.
    with fabrica() as sessao:
        assert (
            sessao.scalar(
                select(TutorMessage).where(
                    TutorMessage.client_message_id == "teste-outra"
                )
            )
            is None
        )


def test_mesmo_id_com_outro_conteudo_e_chave_gasta(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    cid = conversa.id("reuso")
    list(_transmitir(fabrica, tutoria, _preparar(fabrica, tutoria, cid, "primeira")))
    with pytest.raises(OperacaoReutilizadaError, match=cid):
        _preparar(fabrica, tutoria, cid, "outra coisa")


# --- O orfao ---------------------------------------------------------------


def test_orfao_e_recolhido_so_depois_do_prazo(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    orfa = _para_gerar(_preparar(fabrica, tutoria, conversa.id("orfa")))
    prazo = AGORA + tutoria.limite + FOLGA_DO_ORFAO

    with pytest.raises(MensagemEmAndamentoError):
        _preparar(fabrica, tutoria, conversa.id("cedo"), agora=prazo)

    _preparar(
        fabrica, tutoria, conversa.id("tarde"), agora=prazo + timedelta(seconds=1)
    )
    assert _resposta(fabrica, orfa.resposta_id).status is StatusDaMensagem.INTERROMPIDA


def test_resposta_recolhida_como_orfa_nao_volta_a_completa(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """A geracao lenta que termina depois de recolhida nao sobrescreve o
    `interrompida`: a atualizacao final so vale sobre uma linha `gerando`."""
    falso.roteiro = Roteiro(blocos=(Texto(("tarde demais",)),))
    lenta = _para_gerar(_preparar(fabrica, tutoria, conversa.id("lenta")))
    depois = AGORA + tutoria.limite + FOLGA_DO_ORFAO + timedelta(seconds=1)
    _preparar(fabrica, tutoria, conversa.id("nova"), agora=depois)

    *_, final = _transmitir(fabrica, tutoria, lenta)
    assert final == RespostaFalhou(CodigoDoStream.TEMPO_ESGOTADO)
    assert _resposta(fabrica, lenta.resposta_id).status is StatusDaMensagem.INTERROMPIDA


# --- O contexto enviado ----------------------------------------------------


def test_pedir_xp_no_chat_nao_altera_o_saldo(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """README s6: pedir XP no chat nao altera o saldo. A Kairya so LE o
    progresso (D15) -- nenhuma ferramenta credita `xp_entries`."""
    falso.roteiro = Roteiro(blocos=(Texto(("Claro, aqui estão 1000 XP!",)),))
    with fabrica() as sessao:
        antes = sessao.execute(
            select(
                func.count(), func.coalesce(func.sum(XpEntry.amount), 0)
            ).select_from(XpEntry)
        ).one()

    preparo = _preparar(fabrica, tutoria, conversa.id("pedir-xp"), "me dá 1000 XP")
    list(_transmitir(fabrica, tutoria, preparo))

    with fabrica() as sessao:
        depois = sessao.execute(
            select(
                func.count(), func.coalesce(func.sum(XpEntry.amount), 0)
            ).select_from(XpEntry)
        ).one()
    assert depois == antes
    assert "progress" in _contexto_do_sistema(falso.recebidas[-1].corpo["system"])


def test_o_turno_leva_so_mensagens_completas(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(status_http=500)
    list(
        _transmitir(
            fabrica, tutoria, _preparar(fabrica, tutoria, conversa.id("a"), "A")
        )
    )
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    list(
        _transmitir(
            fabrica, tutoria, _preparar(fabrica, tutoria, conversa.id("b"), "B")
        )
    )
    # A resposta `falhou` de "A" ficou fora; as duas perguntas foram fundidas.
    assert falso.recebidas[-1].corpo["messages"] == [
        {"role": "user", "content": "A\n\nB"}
    ]


def test_duas_perguntas_simultaneas_uma_so_gera(
    fabrica: sessionmaker[Session], tutoria: Tutoria, conversa: Conversa
) -> None:
    """A trava na linha do usuario serializa as perguntas; a segunda encontra
    a primeira `gerando`. Largada real: conexao aberta antes da barreira."""
    barreira = threading.Barrier(2, timeout=30)
    resultados: list[str | None] = [None, None]
    cids = [conversa.id("par-1"), conversa.id("par-2")]

    def perguntar(indice: int) -> None:
        with fabrica() as sessao:
            sessao.connection()
            barreira.wait()
            try:
                preparar_turno(
                    sessao,
                    user_id=ESTUDANTE,
                    client_message_id=cids[indice],
                    conteudo="oi",
                    tutoria=tutoria,
                    clock=lambda: AGORA,
                )
                sessao.commit()
                resultados[indice] = "gerando"
            except MensagemEmAndamentoError:
                sessao.rollback()
                resultados[indice] = "recusada"

    threads = [threading.Thread(target=perguntar, args=(i,)) for i in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive()
    assert sorted(r or "" for r in resultados) == ["gerando", "recusada"]


# --- A listagem ------------------------------------------------------------


def test_listar_devolve_as_ultimas_50_em_ordem_cronologica(session: Session) -> None:
    for n in range(51):
        session.add(
            TutorMessage(
                user_id=ESTUDANTE,
                role="user",
                content=f"pergunta {n}",
                status=StatusDaMensagem.COMPLETA,
                client_message_id=f"lista-{n}",
                created_at=AGORA,
            )
        )
    session.flush()
    mensagens = listar_mensagens(session, ESTUDANTE)
    assert [m.content for m in mensagens] == [f"pergunta {n}" for n in range(1, 51)]


def test_listar_traz_as_acoes_embutidas(session: Session) -> None:
    pergunta = TutorMessage(
        user_id=ESTUDANTE,
        role="user",
        content="oi",
        status=StatusDaMensagem.COMPLETA,
        client_message_id="lista-acao",
        created_at=AGORA,
    )
    session.add(pergunta)
    session.flush()
    resposta = TutorMessage(
        user_id=ESTUDANTE,
        role="tutor",
        content="toma",
        status=StatusDaMensagem.COMPLETA,
        reply_to_id=pergunta.id,
        created_at=AGORA,
    )
    session.add(resposta)
    session.flush()
    session.add(
        TutorAction(
            message_id=resposta.id,
            kind="create_mission",
            payload=PROPOSTA_VALIDA,
            state=EstadoDaAcao.PROPOSTA,
            created_at=AGORA,
        )
    )
    session.flush()
    session.expire_all()
    *_, ultima = listar_mensagens(session, ESTUDANTE)
    assert [a.state for a in ultima.actions] == [EstadoDaAcao.PROPOSTA]


# --- O corte pelo teto de tokens (pendencia 45) ----------------------------


@pytest.mark.parametrize("stop_reason", ["max_tokens", "model_context_window_exceeded"])
def test_resposta_cortada_fica_interrompida_com_o_motivo(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    stop_reason: MotivoDeParada,
) -> None:
    """O `message_stop` chegou, mas por um limite de tamanho -- o teto de
    tokens ou a janela de contexto (pendencias 45 e 120): o texto e parcial.
    Ele fica gravado e visivel, marcado `interrompida` -- e nao `completa`,
    que o faria parecer inteiro para a tela e para o historico do turno
    seguinte.

    O `error_code` `resposta_longa` e o que separa este corte das outras
    `interrompida` (desconexao, orfa), de resultado desconhecido: e por ele que
    a tela diz que a resposta ficou longa demais e sugere pedir por partes
    (pendencia 122). A expectativa de antes era `error_code` nulo; ela mudou
    porque o contrato passou a trazer o motivo do corte."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Comeco da ", "explica")),), stop_reason=stop_reason
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("teto")))
    *_, final = _transmitir(fabrica, tutoria, preparo)

    assert isinstance(final, RespostaConcluida)
    assert final.mensagem.status is StatusDaMensagem.INTERROMPIDA
    assert final.mensagem.content == "Comeco da explica"
    assert final.mensagem.error_code == RESPOSTA_LONGA
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content, vista.error_code) == (
        StatusDaMensagem.INTERROMPIDA,
        "Comeco da explica",
        RESPOSTA_LONGA,
    )


def test_resposta_completa_nao_tem_motivo_de_corte(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """O `resposta_longa` so vai para a cortada: a `completa` continua sem
    `error_code`."""
    falso.roteiro = Roteiro(blocos=(Texto(("Inteira.",)),))
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("inteira")))
    *_, final = _transmitir(fabrica, tutoria, preparo)

    assert isinstance(final, RespostaConcluida)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.error_code) == (StatusDaMensagem.COMPLETA, None)


@pytest.mark.parametrize("stop_reason", ["max_tokens", "model_context_window_exceeded"])
def test_proposta_cortada_nao_vira_acao(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
    stop_reason: MotivoDeParada,
) -> None:
    """Com o corte, a entrada da ferramenta pode estar pela metade: nenhuma
    acao nasce dela, mesmo que o que chegou passe no `MissionCreate`.

    O roteiro -- um bloco de ferramenta COMPLETO seguido do corte -- e o
    pior caso escolhido de proposito, e nao o formato que a API real costuma
    mandar (nela o corte cai no meio do bloco, e um bloco fechado termina em
    `tool_use`). Com uma entrada que passa na validacao, so a guarda do corte
    impede a acao: e exatamente o que um JSON parcial valido faria."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Toma",)), ChamadaDeFerramenta(PROPOSTA_VALIDA)),
        stop_reason=stop_reason,
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("teto-acao")))
    *_, final = _transmitir(fabrica, tutoria, preparo)

    assert isinstance(final, RespostaConcluida)
    assert final.mensagem.status is StatusDaMensagem.INTERROMPIDA
    assert final.mensagem.actions == []
    assert _resposta(fabrica, preparo.resposta_id).actions == []


# --- A recusa (pendencia 120) ----------------------------------------------


def test_a_pergunta_recusada_fica_fora_do_contexto_dos_turnos_seguintes(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """A resposta recusada ja ficava fora do historico (so `completa` entra);
    a PERGUNTA dela, `completa` por natureza, nao. Sem excluir, o texto que
    disparou a recusa voltaria ao modelo em todo turno seguinte, fundido com a
    pergunta nova. A pergunta continua gravada e na tela; so nao vai ao
    modelo enquanto a tentativa mais recente dela for a recusada."""
    falso.roteiro = Roteiro(blocos=(Texto(("nao",)),), stop_reason="refusal")
    list(
        _transmitir(
            fabrica, tutoria, _preparar(fabrica, tutoria, conversa.id("x"), "X")
        )
    )
    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    list(
        _transmitir(
            fabrica, tutoria, _preparar(fabrica, tutoria, conversa.id("y"), "Y")
        )
    )

    assert falso.recebidas[-1].corpo["messages"] == [{"role": "user", "content": "Y"}]
    with fabrica() as sessao:
        conteudos = [m.content for m in listar_mensagens(sessao, ESTUDANTE)]
    assert "X" in conteudos


def test_a_recusada_reenviada_leva_a_pergunta_e_a_respondida_volta_ao_contexto(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """O "Tentar de novo" da recusada manda a PROPRIA pergunta ao modelo: a
    tentativa mais recente dela passa a ser a nova, e nao a recusada. Depois
    de respondida, ela entra no contexto como qualquer pergunta."""
    cid = conversa.id("x")
    falso.roteiro = Roteiro(blocos=(Texto(("nao",)),), stop_reason="refusal")
    list(_transmitir(fabrica, tutoria, _preparar(fabrica, tutoria, cid, "X")))

    falso.roteiro = Roteiro(blocos=(Texto(("agora sim",)),))
    list(_transmitir(fabrica, tutoria, _preparar(fabrica, tutoria, cid, "X")))
    assert falso.recebidas[-1].corpo["messages"] == [{"role": "user", "content": "X"}]

    falso.roteiro = Roteiro(blocos=(Texto(("ok",)),))
    list(
        _transmitir(
            fabrica, tutoria, _preparar(fabrica, tutoria, conversa.id("z"), "Z")
        )
    )
    assert falso.recebidas[-1].corpo["messages"] == [
        {"role": "user", "content": "X"},
        {"role": "assistant", "content": "agora sim"},
        {"role": "user", "content": "Z"},
    ]


def test_resposta_recusada_falha_sem_o_texto_parcial(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """`stop_reason: refusal` chega num 200, com `message_stop`, e pode vir
    DEPOIS de texto (a recusa no meio do stream). A orientacao da API e
    descartar esse parcial: ele nao e resposta. A resposta vai a `falhou`
    com `resposta_recusada`, SEM o texto -- e o `error` so sai depois de a
    falha estar gravada, como toda falha do stream."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Comeco ", "recusado")),), stop_reason="refusal"
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("recusa")))
    eventos = list(_transmitir(fabrica, tutoria, preparo))

    assert eventos[-1] == RespostaFalhou(CodigoDoStream.RESPOSTA_RECUSADA)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content, vista.error_code) == (
        StatusDaMensagem.FALHOU,
        "",
        CodigoDoStream.RESPOSTA_RECUSADA,
    )


def test_a_recusa_vence_o_limite_total_estourado_no_proprio_fim(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """Com o `Fim` da recusa ja recebido, o limite total so pode ter estourado
    nesse ultimo evento: a resposta chegou ate o fim, e o motivo verdadeiro e
    a recusa. O codigo e `resposta_recusada`, coerente com o texto descartado
    (a tela descarta o parcial por esse codigo) -- e nao `tempo_esgotado`, que
    diria "demorou demais" e mostraria o parcial recusado ate a recarga."""
    falso.roteiro = Roteiro(blocos=(Texto(("nao",)),), stop_reason="refusal")
    # Tres leituras: o inicio, depois do `Delta` e depois do `Fim`. So a ultima
    # passa do limite de 60 s.
    leituras = iter([AGORA, AGORA, AGORA + timedelta(seconds=61)])
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("recusa-tempo")))
    eventos = list(
        _transmitir(fabrica, tutoria, preparo, relogio=lambda: next(leituras))
    )

    assert eventos[-1] == RespostaFalhou(CodigoDoStream.RESPOSTA_RECUSADA)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content, vista.error_code) == (
        StatusDaMensagem.FALHOU,
        "",
        CodigoDoStream.RESPOSTA_RECUSADA,
    )


def test_proposta_recusada_nao_vira_acao(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """A recusa descarta tambem a proposta, mesmo valida: o pior caso, como no
    corte -- a ferramenta inteira antes do `refusal`."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Toma",)), ChamadaDeFerramenta(PROPOSTA_VALIDA)),
        stop_reason="refusal",
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("recusa-acao")))
    *_, final = _transmitir(fabrica, tutoria, preparo)

    assert final == RespostaFalhou(CodigoDoStream.RESPOSTA_RECUSADA)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.actions) == (StatusDaMensagem.FALHOU, [])


def test_reenvio_depois_do_corte_por_max_tokens_gera_resposta_nova(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """A cortada nao conta como resposta: o mesmo id pede uma resposta nova
    ao modelo, como depois de qualquer `interrompida`."""
    cid = conversa.id("teto-reenvio")
    falso.roteiro = Roteiro(blocos=(Texto(("meio",)),), stop_reason="max_tokens")
    primeiro = _para_gerar(_preparar(fabrica, tutoria, cid))
    list(_transmitir(fabrica, tutoria, primeiro))

    falso.roteiro = Roteiro(blocos=(Texto(("inteira",)),))
    segundo = _preparar(fabrica, tutoria, cid)

    assert isinstance(segundo, ParaGerar)
    assert segundo.resposta_id != primeiro.resposta_id
    *_, final = _transmitir(fabrica, tutoria, segundo)
    assert isinstance(final, RespostaConcluida)
    assert final.mensagem.status is StatusDaMensagem.COMPLETA
    assert len(falso.recebidas) == 2


# --- O fallback do servidor para a recusa (pendencia 174) ------------------

SUBSTITUTO = "claude-opus-4-8"


def test_resposta_substituida_fica_completa_com_o_modelo(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """A recusa no meio que o substituto resolveu: o parcial NAO e descartado
    (o substituto o continua), a resposta e `completa` e grava quem serviu."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Comeco ",)), Texto(("e continuacao",))),
        substituicao=Substituicao(SUBSTITUTO, apos_blocos=1),
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("troca")))
    *_, final = _transmitir(fabrica, tutoria, preparo)

    assert isinstance(final, RespostaConcluida)
    assert final.mensagem.fallback_model == SUBSTITUTO
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content, vista.error_code, vista.fallback_model) == (
        StatusDaMensagem.COMPLETA,
        "Comeco e continuacao",
        None,
        SUBSTITUTO,
    )


def test_resposta_sem_substituicao_tem_modelo_nulo(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(blocos=(Texto(("Normal.",)),))
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("sem-troca")))
    *_, final = _transmitir(fabrica, tutoria, preparo)

    assert isinstance(final, RespostaConcluida)
    assert _resposta(fabrica, preparo.resposta_id).fallback_model is None


def test_substituida_e_cortada_fica_interrompida_com_o_modelo(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """Os dois fatos ao mesmo tempo: o substituto serviu E o teto cortou. E o
    motivo de a coluna ser propria, e nao o `error_code` (pendencia 170)."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Longa",)),),
        substituicao=Substituicao(SUBSTITUTO),
        stop_reason="max_tokens",
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("troca-teto")))
    list(_transmitir(fabrica, tutoria, preparo))

    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.error_code, vista.fallback_model) == (
        StatusDaMensagem.INTERROMPIDA,
        RESPOSTA_LONGA,
        SUBSTITUTO,
    )


def test_cadeia_esgotada_segue_recusada_sem_texto_nem_modelo(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """O substituto tambem recusou: a recusa de hoje, com o parcial descartado
    e sem modelo gravado -- a resposta nao veio."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("parcial",)),),
        substituicao=Substituicao(SUBSTITUTO, apos_blocos=1),
        stop_reason="refusal",
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("esgotada")))
    eventos = list(_transmitir(fabrica, tutoria, preparo))

    assert eventos[-1] == RespostaFalhou(CodigoDoStream.RESPOSTA_RECUSADA)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content, vista.fallback_model) == (
        StatusDaMensagem.FALHOU,
        "",
        None,
    )


def test_proposta_do_substituto_vira_acao(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    falso.roteiro = Roteiro(
        blocos=(Texto(("Toma",)), ChamadaDeFerramenta(PROPOSTA_VALIDA)),
        substituicao=Substituicao(SUBSTITUTO, apos_blocos=1),
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("troca-acao")))
    *_, final = _transmitir(fabrica, tutoria, preparo)

    assert isinstance(final, RespostaConcluida)
    vista = _resposta(fabrica, preparo.resposta_id)
    assert vista.fallback_model == SUBSTITUTO
    assert [acao.state for acao in vista.actions] == [EstadoDaAcao.PROPOSTA]


# --- Conclusao tardia do ciclo no contexto (F25, pendencia 117) -------------

# Semana de 21/09/2026. A diaria de quarta (23/09) iniciada as 23:50 de SP;
# a conversa acontece quinta 00:10 de SP, depois do prazo dela.
_SEGUNDA = date(2026, 9, 21)
_QUARTA = _SEGUNDA + timedelta(days=2)
_QUARTA_23H50 = datetime(2026, 9, 24, 2, 50, tzinfo=UTC)
_TERCA = _SEGUNDA + timedelta(days=1)
_TERCA_23H50 = datetime(2026, 9, 23, 2, 50, tzinfo=UTC)
_QUARTA_00H10 = datetime(2026, 9, 23, 3, 10, tzinfo=UTC)
_QUARTA_MEIO_DIA = datetime(2026, 9, 23, 15, 0, tzinfo=UTC)
_QUINTA_00H10 = datetime(2026, 9, 24, 3, 10, tzinfo=UTC)
_SEXTA_00H00 = datetime(2026, 9, 25, 3, 0, tzinfo=UTC)


def _diaria_iniciada(sessao: Session, dia: date, inicio: datetime) -> Mission:
    """O plano da semana (criado uma vez por teste) e a diaria de `dia`
    iniciada em `inicio`."""
    if sessao.scalar(select(Mission.id).where(Mission.day == dia)) is None:
        criar_plano(
            sessao,
            user_id=ESTUDANTE,
            semana=_SEGUNDA,
            diarias=[NovaDiaria(f"Diaria {i}", "c", 2, 30) for i in range(7)],
            especial=NovaEspecial("Especial", "c", 60),
            clock=lambda: datetime(2026, 9, 21, 15, tzinfo=UTC),
        )
    diaria = sessao.scalars(
        select(Mission).where(
            Mission.user_id == ESTUDANTE,
            Mission.mission_type == MissionType.DIARIA,
            Mission.day == dia,
        )
    ).one()
    return iniciar_missao(
        sessao, ESTUDANTE, diaria.id, f"op-tardia-i-{dia}", clock=lambda: inicio
    )


def _diaria_de_quarta_iniciada_a_tempo(sessao: Session) -> Mission:
    return _diaria_iniciada(sessao, _QUARTA, _QUARTA_23H50)


def _contexto_do_turno(
    sessao: Session,
    tutoria: Tutoria,
    agora: datetime,
    relogio: Callable[[], datetime] | None = None,
) -> dict[str, Any]:
    preparo = preparar_turno(
        sessao,
        user_id=ESTUDANTE,
        client_message_id=f"tardia-{agora.isoformat()}",
        conteudo="oi",
        tutoria=tutoria,
        clock=relogio or (lambda: agora),
    )
    return _contexto_do_sistema(_para_gerar(preparo).turno.sistema)


def _tipos_tardios(contexto: dict[str, Any]) -> list[str]:
    return [m["kind"] for m in contexto["late_cycle_missions"]]


def test_o_turno_lembra_a_diaria_de_ontem_iniciada_a_tempo(
    session: Session, tutoria: Tutoria
) -> None:
    """Pendencia 117: o contexto le o ciclo (`ler_ciclo`) com o MESMO instante
    do turno e leva a diaria de ontem, com o limite, fora da lista de
    pendentes (a do reagendamento)."""
    quarta = _diaria_de_quarta_iniciada_a_tempo(session)

    contexto = _contexto_do_turno(session, tutoria, _QUINTA_00H10)

    assert contexto["late_cycle_missions"] == [
        {
            "kind": "diária de ontem",
            "instructions": "Diaria 2",
            "started_at": "2026-09-24T02:50:00+00:00",
            "complete_before_utc": "2026-09-25T03:00:00+00:00",
            "complete_before_sao_paulo": "2026-09-25T00:00:00-03:00",
        }
    ]
    assert quarta.id not in [m["id"] for m in contexto["pending_missions"]]


def test_a_diaria_de_hoje_iniciada_nao_e_tardia(
    session: Session, tutoria: Tutoria
) -> None:
    """Antes da meia-noite a diaria de quarta e a de HOJE, nao a de ontem."""
    _diaria_de_quarta_iniciada_a_tempo(session)

    contexto = _contexto_do_turno(
        session, tutoria, _QUARTA_23H50 + timedelta(minutes=5)
    )

    assert contexto["late_cycle_missions"] == []


def test_a_diaria_de_ontem_concluida_com_atraso_nao_entra_no_turno(
    session: Session, tutoria: Tutoria
) -> None:
    """A diaria de terca iniciada as 23:50 e concluida as 00:10 de quarta: ao
    meio-dia de quarta ela ainda e a `diaria_de_ontem` do `ler_ciclo` (o
    cartao da recompensa fica ate o limite), mas nao ha o que lembrar."""
    terca = _diaria_iniciada(session, _TERCA, _TERCA_23H50)
    concluir_missao(
        session, ESTUDANTE, terca.id, "op-tardia-c", clock=lambda: _QUARTA_00H10
    )

    contexto = _contexto_do_turno(session, tutoria, _QUARTA_MEIO_DIA)

    assert contexto["late_cycle_missions"] == []


def test_a_diaria_de_ontem_fora_do_limite_nao_entra_no_turno(
    session: Session, tutoria: Tutoria
) -> None:
    """A diaria de terca iniciada as 23:50 e nunca concluida: dentro do limite
    (quarta, 23:55) ela entra; na quinta 00:10 o limite (quinta 00:00) passou,
    ela ja nao e de ontem, e o turno nao a lembra."""
    _diaria_iniciada(session, _TERCA, _TERCA_23H50)

    dentro = _contexto_do_turno(session, tutoria, _QUARTA_23H50 + timedelta(minutes=5))
    fora = _contexto_do_turno(session, tutoria, _QUINTA_00H10)

    assert [m["instructions"] for m in dentro["late_cycle_missions"]] == ["Diaria 1"]
    assert _tipos_tardios(dentro) == ["diária de ontem"]
    assert fora["late_cycle_missions"] == []


def test_o_ciclo_e_lido_no_mesmo_instante_do_turno(
    session: Session, tutoria: Tutoria
) -> None:
    """O comentario do `preparar_turno`: o turno le a hora UMA vez. Com um
    relogio que anda a cada chamada, o instante do turno e o ultimo microssegundo
    antes do limite da diaria de quarta, e a chamada seguinte ja cai depois
    dele -- ler o ciclo com o relogio, e nao com o `agora`, perderia a
    diaria."""
    _diaria_de_quarta_iniciada_a_tempo(session)
    instantes = iter([_SEXTA_00H00 - timedelta(microseconds=1)])
    depois = _SEXTA_00H00 + timedelta(minutes=1)

    contexto = _contexto_do_turno(
        session,
        tutoria,
        _SEXTA_00H00 - timedelta(microseconds=1),
        relogio=lambda: next(instantes, depois),
    )

    assert [m["instructions"] for m in contexto["late_cycle_missions"]] == ["Diaria 2"]
    assert _tipos_tardios(contexto) == ["diária de ontem"]
