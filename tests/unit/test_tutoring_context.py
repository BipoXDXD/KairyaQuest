"""A montagem do turno: o que o modelo recebe, e em que forma."""

from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta

from focusquest.modules.missions.cycle_domain import Availability, fim_do_dia
from focusquest.modules.missions.cycle_service import CicloLido, MissaoLida
from focusquest.modules.missions.domain import (
    MissionState,
    MissionType,
    MotivoDoReagendamento,
    OrigemDoReagendamento,
)
from focusquest.modules.missions.models import Mission, MissionReschedule
from focusquest.modules.progression.domain import CATALOGO, Codigo, FaixaDoNivel
from focusquest.modules.progression.service import ConquistaNoPainel, Progresso
from focusquest.modules.tutoring.context import (
    ROTULO_DO_MOTIVO,
    montar_turno,
    tardias_do_ciclo,
)
from focusquest.modules.tutoring.domain import (
    EstadoDaAcao,
    Papel,
    StatusDaMensagem,
    TipoDeAcao,
)
from focusquest.modules.tutoring.models import TutorAction, TutorMessage
from focusquest.modules.tutoring.provider import MensagemDoTurno

AGORA = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)

# Sem nenhum XP nem conquista -- o que `ler_progresso` devolve para um
# estudante novo. Os testes que nao falam de progresso usam este valor para
# nao precisar montar um `Progresso` cada vez.
SEM_PROGRESSO = Progresso(
    xp_total=0,
    faixa=FaixaDoNivel(1, 0, 100),
    conquistas=tuple(ConquistaNoPainel(c, None) for c in CATALOGO),
)


def _msg(
    papel: Papel, texto: str, acoes: list[TutorAction] | None = None
) -> TutorMessage:
    return TutorMessage(
        role=papel,
        content=texto,
        status=StatusDaMensagem.COMPLETA,
        created_at=AGORA,
        actions=acoes or [],
    )


def test_o_sistema_traz_persona_agora_e_missoes_pendentes() -> None:
    pendente = Mission(
        id=7,
        instructions="Ler o capitulo 3",
        completion_criterion="Resumo",
        difficulty=2,
        estimated_minutes=30,
        deadline=AGORA + timedelta(days=1),
        state=MissionState.PENDENTE,
    )
    turno = montar_turno(
        persona="PERSONA",
        agora=AGORA,
        pendentes=[pendente],
        progresso=SEM_PROGRESSO,
        historico=[],
    )
    assert turno.sistema.startswith("PERSONA")
    assert "2026-09-19T12:00:00+00:00" in turno.sistema
    assert "#7" in turno.sistema
    assert "Ler o capitulo 3" in turno.sistema


def test_sem_missoes_pendentes_o_sistema_diz_nenhuma() -> None:
    turno = montar_turno(
        persona="P", agora=AGORA, pendentes=[], progresso=SEM_PROGRESSO, historico=[]
    )
    assert "nenhuma" in turno.sistema


def test_papeis_viram_user_e_assistant() -> None:
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        progresso=SEM_PROGRESSO,
        historico=[_msg(Papel.USUARIO, "oi"), _msg(Papel.TUTORA, "ola!")],
    )
    assert turno.mensagens == (
        MensagemDoTurno("user", "oi"),
        MensagemDoTurno("assistant", "ola!"),
    )


def test_mensagens_seguidas_do_mesmo_papel_sao_fundidas() -> None:
    """Uma pergunta cuja resposta falhou deixa duas perguntas seguidas."""
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        progresso=SEM_PROGRESSO,
        historico=[_msg(Papel.USUARIO, "primeira"), _msg(Papel.USUARIO, "segunda")],
    )
    assert turno.mensagens == (MensagemDoTurno("user", "primeira\n\nsegunda"),)


def test_o_historico_nunca_comeca_pela_tutora() -> None:
    """O corte das ultimas N mensagens pode cair numa resposta; a API exige
    que a conversa comece pelo usuario."""
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        progresso=SEM_PROGRESSO,
        historico=[_msg(Papel.TUTORA, "resto"), _msg(Papel.USUARIO, "oi")],
    )
    assert turno.mensagens == (MensagemDoTurno("user", "oi"),)


def test_mensagem_sem_texto_nem_acao_e_descartada() -> None:
    """Uma `completa` vazia (o `Fim` nao cobre esgotamento de `tutor_max_tokens`)
    nao pode chegar a API: ela rejeita mensagem sem texto. Descartada, as
    duas perguntas do usuario ao redor ficam adjacentes e se fundem, como
    qualquer par do mesmo papel."""
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        progresso=SEM_PROGRESSO,
        historico=[
            _msg(Papel.USUARIO, "oi"),
            _msg(Papel.TUTORA, ""),
            _msg(Papel.USUARIO, "ainda ai?"),
        ],
    )
    assert turno.mensagens == (MensagemDoTurno("user", "oi\n\nainda ai?"),)


def test_acoes_antigas_entram_como_texto_com_o_estado_real() -> None:
    """Sem `tool_result`, um `tool_use` antigo deixaria o historico mal
    formado; como texto, o modelo sabe o que foi confirmado ou recusado.

    O id da ACAO nao usa `#`, que so nomeia MISSAO -- o mesmo `#` que a
    lista de pendentes e a `reschedule_mission` usam. A executada diz qual
    missao criou."""
    acao = TutorAction(
        id=12,
        kind=TipoDeAcao.CRIAR_MISSAO,
        payload={"instructions": "Revisar funcoes"},
        state=EstadoDaAcao.EXECUTADA,
        mission_id=7,
    )
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        progresso=SEM_PROGRESSO,
        historico=[
            _msg(Papel.USUARIO, "me da uma missao"),
            _msg(Papel.TUTORA, "Toma!", [acao]),
        ],
    )
    assert turno.mensagens[1].texto == (
        "Toma!\n\n[Proposta de missão (ação 12): Revisar funcoes -- executada "
        "-> missão #7]"
    )


def test_a_proposta_de_criacao_nao_decidida_nao_usa_cerquilha() -> None:
    """So ids de MISSAO usam `#`: a acao 3 que criou a missao 7 nao
    pode aparecer como "#3", ou o modelo reagendaria a missao #3."""
    acao = TutorAction(
        id=3,
        kind=TipoDeAcao.CRIAR_MISSAO,
        payload={"instructions": "Ler cap. 3"},
        state=EstadoDaAcao.RECUSADA,
    )
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        progresso=SEM_PROGRESSO,
        historico=[_msg(Papel.USUARIO, "oi"), _msg(Papel.TUTORA, "Toma!", [acao])],
    )
    texto = turno.mensagens[1].texto
    assert texto == "Toma!\n\n[Proposta de missão (ação 3): Ler cap. 3 -- recusada]"
    assert "#" not in texto


def test_o_contexto_traz_a_linha_de_progresso() -> None:
    """So leitura (D15): nivel, saldo e as conquistas destravadas."""
    progresso = Progresso(
        xp_total=1340,
        faixa=FaixaDoNivel(5, 1000, 1500),
        conquistas=tuple(
            ConquistaNoPainel(
                c,
                AGORA if c.codigo in (Codigo.FIRST_STEPS, Codigo.VETERAN_10) else None,
            )
            for c in CATALOGO
        ),
    )
    turno = montar_turno(
        persona="P", agora=AGORA, pendentes=[], progresso=progresso, historico=[]
    )
    assert (
        "Progresso do estudante: nível 5, 1.340 XP; "
        "conquistas: Primeiros passos, Veterano I."
    ) in turno.sistema


def test_sem_conquistas_diz_nenhuma_conquista_ainda() -> None:
    turno = montar_turno(
        persona="P", agora=AGORA, pendentes=[], progresso=SEM_PROGRESSO, historico=[]
    )
    assert (
        "Progresso do estudante: nível 1, 0 XP; nenhuma conquista ainda."
        in turno.sistema
    )


# --- Acompanhamento (F19) --------------------------------------------------


def _pendente(**ajustes: object) -> Mission:
    campos: dict[str, object] = {
        "id": 7,
        "instructions": "Ler o capitulo 3",
        "completion_criterion": "Resumo",
        "difficulty": 2,
        "estimated_minutes": 30,
        "deadline": AGORA + timedelta(days=1),
        "state": MissionState.PENDENTE,
    }
    return Mission(**(campos | ajustes))


def _linha_da_missao(missao: Mission) -> str:
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[missao],
        progresso=SEM_PROGRESSO,
        historico=[],
    )
    (linha,) = [x for x in turno.sistema.splitlines() if x.startswith("- #7")]
    return linha


def _reagendamento(motivo: MotivoDoReagendamento, dias: int) -> MissionReschedule:
    return MissionReschedule(
        operation_id=f"op-{dias}",
        previous_deadline=AGORA + timedelta(days=dias - 1),
        new_deadline=AGORA + timedelta(days=dias),
        reason=motivo,
        origin=OrigemDoReagendamento.USUARIO,
        rescheduled_at=AGORA,
    )


def test_a_pendente_diz_o_estado() -> None:
    linha = _linha_da_missao(_pendente())
    assert "pendente" in linha
    assert "reagendada" not in linha


def test_a_em_andamento_diz_desde_quando() -> None:
    inicio = AGORA - timedelta(minutes=25)
    linha = _linha_da_missao(
        _pendente(state=MissionState.EM_ANDAMENTO, started_at=inicio)
    )
    assert f"em andamento desde {inicio.isoformat()}" in linha


def test_a_reagendada_diz_quantas_vezes_e_o_ultimo_motivo() -> None:
    missao = _pendente(
        reschedules=[
            _reagendamento(MotivoDoReagendamento.DIFICULDADE, 2),
            _reagendamento(MotivoDoReagendamento.FALTA_DE_TEMPO, 3),
        ]
    )
    assert "reagendada 2 vezes; último motivo: falta de tempo" in (
        _linha_da_missao(missao)
    )


def test_uma_vez_no_singular() -> None:
    missao = _pendente(
        reschedules=[_reagendamento(MotivoDoReagendamento.MUDANCA_DE_PRIORIDADE, 2)]
    )
    assert "reagendada 1 vez; último motivo: mudança de prioridade" in (
        _linha_da_missao(missao)
    )


def test_todo_motivo_tem_rotulo() -> None:
    """O mypy nao garante exaustividade de `dict`: um motivo novo sem rotulo
    chegaria ao modelo como o valor cru."""
    assert set(ROTULO_DO_MOTIVO) == set(MotivoDoReagendamento)


def test_a_proposta_de_reagendamento_entra_como_texto_proprio() -> None:
    """F19: com o `_texto` de antes, um reagendamento apareceria ao modelo
    como "Proposta de missao" com a instrucao do retrato."""
    acao = TutorAction(
        id=31,
        kind=TipoDeAcao.REAGENDAR_MISSAO,
        payload={
            "mission_id": 12,
            "new_deadline": "2026-10-05T21:00:00Z",
            "reason": "falta_de_tempo",
            "instructions": "Resumir o capitulo 3",
            "previous_deadline": "2026-10-02T21:00:00Z",
        },
        state=EstadoDaAcao.EXECUTADA,
    )
    turno = montar_turno(
        persona="P",
        agora=AGORA,
        pendentes=[],
        progresso=SEM_PROGRESSO,
        historico=[
            _msg(Papel.USUARIO, "estou sem tempo"),
            _msg(Papel.TUTORA, "Vamos mover.", [acao]),
        ],
    )
    assert turno.mensagens[1].texto == (
        "Vamos mover.\n\n[Proposta de reagendamento da missão #12 para "
        "2026-10-05T21:00:00Z (falta de tempo) -- executada]"
    )


# --- Conclusao tardia do ciclo (F25, pendencia 117) -------------------------

# Quinta 30/09/2026, meio-dia em Sao Paulo. A diaria de ontem (quarta) venceu a
# meia-noite que abriu hoje, e a conclusao tardia vai ate a meia-noite que
# abre sexta.
HOJE_SP = date(2026, 9, 30)
MEIO_DIA_SP = datetime(2026, 9, 30, 15, 0, tzinfo=UTC)
PRAZO_DE_ONTEM = fim_do_dia(HOJE_SP - timedelta(days=1))
LIMITE_DE_ONTEM = datetime(2026, 10, 1, 3, 0, tzinfo=UTC)  # sexta 00:00 SP


def _do_ciclo(
    tipo: MissionType,
    prazo: datetime,
    disponibilidade: Availability,
    *,
    id_: int = 41,
    instrucao: str = "Resolver 5 exercicios de laco",
) -> MissaoLida:
    missao = Mission(
        id=id_,
        mission_type=tipo,
        instructions=instrucao,
        completion_criterion="c",
        difficulty=2,
        estimated_minutes=30,
        state=MissionState.EM_ANDAMENTO,
        started_at=prazo - timedelta(minutes=10),
    )
    return MissaoLida(missao, prazo, disponibilidade)


def _ciclo(
    *,
    ontem: MissaoLida | None = None,
    especial: MissaoLida | None = None,
) -> CicloLido:
    return CicloLido(
        hoje=HOJE_SP,
        missao=None,
        sequencia=0,
        dias_para_o_marco=7,
        especial=especial,
        diaria_de_ontem=ontem,
    )


def _sistema_com(tardias: Sequence[MissaoLida]) -> str:
    return montar_turno(
        persona="P",
        agora=MEIO_DIA_SP,
        pendentes=[],
        progresso=SEM_PROGRESSO,
        historico=[],
        tardias=tardias,
    ).sistema


def test_a_diaria_de_ontem_iniciada_a_tempo_entra_como_tardia() -> None:
    ontem = _do_ciclo(MissionType.DIARIA, PRAZO_DE_ONTEM, Availability.DISPONIVEL)
    assert tardias_do_ciclo(_ciclo(ontem=ontem), MEIO_DIA_SP) == (ontem,)


def test_a_diaria_de_ontem_ja_concluida_com_atraso_nao_entra() -> None:
    """`ler_ciclo` a mantem ate o limite para o Quartel-General (o cartao da
    recompensa); para a Tifa ela nao e mais nada a lembrar."""
    ontem = _do_ciclo(MissionType.DIARIA, PRAZO_DE_ONTEM, Availability.CONCLUIDA)
    assert tardias_do_ciclo(_ciclo(ontem=ontem), MEIO_DIA_SP) == ()


def test_a_especial_na_janela_nao_e_tardia() -> None:
    """A especial ainda no prazo e o ciclo de hoje, nao conclusao tardia: fica
    com a pendencia 55, fora deste recorte."""
    na_janela = _do_ciclo(
        MissionType.ESPECIAL, MEIO_DIA_SP + timedelta(hours=1), Availability.DISPONIVEL
    )
    assert tardias_do_ciclo(_ciclo(especial=na_janela), MEIO_DIA_SP) == ()


def test_a_especial_depois_da_janela_iniciada_a_tempo_e_tardia() -> None:
    especial = _do_ciclo(MissionType.ESPECIAL, PRAZO_DE_ONTEM, Availability.DISPONIVEL)
    ontem = _do_ciclo(
        MissionType.DIARIA, PRAZO_DE_ONTEM, Availability.DISPONIVEL, id_=40
    )
    assert tardias_do_ciclo(_ciclo(ontem=ontem, especial=especial), MEIO_DIA_SP) == (
        ontem,
        especial,
    )


def test_a_especial_concluida_depois_da_janela_nao_entra() -> None:
    especial = _do_ciclo(MissionType.ESPECIAL, PRAZO_DE_ONTEM, Availability.CONCLUIDA)
    assert tardias_do_ciclo(_ciclo(especial=especial), MEIO_DIA_SP) == ()


def test_a_tardia_entra_no_contexto_com_o_limite_e_sem_reagendamento() -> None:
    """O limite e a meia-noite SEGUINTE ao prazo (F25), em UTC como o "Agora"
    e tambem na hora de Sao Paulo: e uma meia-noite de la, e "ontem" e o dia
    civil de la -- so em UTC, a Tifa diria "ate as 3h".
    Sem `#id`: o `#` e o que a `reschedule_mission` recebe, e a diaria nao e
    reagendavel -- a linha diz isso com todas as letras."""
    ontem = _do_ciclo(MissionType.DIARIA, PRAZO_DE_ONTEM, Availability.DISPONIVEL)
    sistema = _sistema_com([ontem])
    assert (
        "Missões do ciclo em conclusão tardia (iniciadas a tempo; a pessoa ainda "
        "pode concluí-las, mas elas não podem ser reagendadas):"
    ) in sistema
    assert (
        "- diária de ontem: Resolver 5 exercicios de laco (em andamento desde "
        f"{(PRAZO_DE_ONTEM - timedelta(minutes=10)).isoformat()}; pode ser "
        "concluída antes de "
        f"{LIMITE_DE_ONTEM.isoformat()}, que é 2026-10-01T00:00:00-03:00 em "
        "São Paulo)"
    ) in sistema.splitlines()
    assert "#41" not in sistema


def test_a_especial_tardia_diz_que_e_a_especial() -> None:
    especial = _do_ciclo(
        MissionType.ESPECIAL,
        PRAZO_DE_ONTEM,
        Availability.DISPONIVEL,
        instrucao="Projeto da semana",
    )
    linhas = _sistema_com([especial]).splitlines()
    assert any(
        linha.startswith("- missão especial: Projeto da semana (") for linha in linhas
    )


def test_sem_tardias_o_contexto_nao_ganha_a_secao() -> None:
    assert "conclusão tardia" not in _sistema_com([])


def test_a_secao_tardia_fica_depois_das_pendentes_e_antes_do_progresso() -> None:
    ontem = _do_ciclo(MissionType.DIARIA, PRAZO_DE_ONTEM, Availability.DISPONIVEL)
    sistema = _sistema_com([ontem])
    assert (
        sistema.index("Missões pendentes:")
        < sistema.index("Missões do ciclo em conclusão tardia")
        < sistema.index("Progresso do estudante")
    )
