"""Preparar e transmitir um turno, com o banco real e o servidor falso.

O gerador `transmitir` e consumido direto, e nao por HTTP: o `TestClient`
bufferiza a resposta inteira (medicao M9), e so aqui da para olhar o banco NO
INSTANTE de cada evento.
"""

import threading
from collections.abc import Callable, Generator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from focusquest.core.errors import MensagemEmAndamentoError, OperacaoReutilizadaError
from focusquest.modules.progression.models import XpEntry
from focusquest.modules.tutoring.domain import (
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
    Roteiro,
    ServidorAnthropicFalso,
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
    """A guarda da medicao M3: sem ela, o texto parcial viraria `completa`."""
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
    """O timeout do SDK e por espera (M5); o limite total e do servico. Um
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
    """E o que a desconexao do cliente faz ao gerador (via o invoucro da
    Task 7): `close()` no meio."""
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
    """README s6: pedir XP no chat nao altera o saldo. A Tifa so LE o
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
    assert "Progresso do estudante" in falso.recebidas[-1].corpo["system"]


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


def test_resposta_cortada_por_max_tokens_fica_interrompida(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """O `message_stop` chegou, mas por `max_tokens`: o texto e parcial. Ele
    fica gravado e visivel, marcado `interrompida` -- e nao `completa`, que o
    faria parecer inteiro para a tela e para o historico do turno seguinte."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Comeco da ", "explica")),), stop_reason="max_tokens"
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("teto")))
    *_, final = _transmitir(fabrica, tutoria, preparo)

    assert isinstance(final, RespostaConcluida)
    assert final.mensagem.status is StatusDaMensagem.INTERROMPIDA
    assert final.mensagem.content == "Comeco da explica"
    vista = _resposta(fabrica, preparo.resposta_id)
    assert (vista.status, vista.content, vista.error_code) == (
        StatusDaMensagem.INTERROMPIDA,
        "Comeco da explica",
        None,
    )


def test_proposta_cortada_por_max_tokens_nao_vira_acao(
    fabrica: sessionmaker[Session],
    tutoria: Tutoria,
    falso: ServidorAnthropicFalso,
    conversa: Conversa,
) -> None:
    """Com o corte, a entrada da ferramenta pode estar pela metade: nenhuma
    acao nasce dela, mesmo que o que chegou passe no `MissionCreate`.

    O roteiro -- um bloco de ferramenta COMPLETO seguido de `max_tokens` -- e o
    pior caso escolhido de proposito, e nao o formato que a API real costuma
    mandar (nela o corte cai no meio do bloco, e um bloco fechado termina em
    `tool_use`). Com uma entrada que passa na validacao, so a guarda do corte
    impede a acao: e exatamente o que um JSON parcial valido faria."""
    falso.roteiro = Roteiro(
        blocos=(Texto(("Toma",)), ChamadaDeFerramenta(PROPOSTA_VALIDA)),
        stop_reason="max_tokens",
    )
    preparo = _para_gerar(_preparar(fabrica, tutoria, conversa.id("teto-acao")))
    *_, final = _transmitir(fabrica, tutoria, preparo)

    assert isinstance(final, RespostaConcluida)
    assert final.mensagem.status is StatusDaMensagem.INTERROMPIDA
    assert final.mensagem.actions == []
    assert _resposta(fabrica, preparo.resposta_id).actions == []


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
