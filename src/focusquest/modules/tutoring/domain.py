"""Regras da tutoria, independentes de framework, de persistencia e do SDK."""

from enum import StrEnum

from focusquest.modules.missions.domain import TransicaoIlegalError


class Papel(StrEnum):
    """Quem escreveu a mensagem. Valores em ingles: `role` e contrato."""

    USUARIO = "user"
    TUTORA = "tutor"


class StatusDaMensagem(StrEnum):
    """O ciclo de vida de uma mensagem.

    A pergunta nasce `completa`. A resposta nasce `gerando`, gravada ANTES de
    chamar o provedor, e termina em um dos outros tres. `interrompida` e
    "resultado desconhecido": o cliente sumiu, o processo morreu ou a resposta
    foi recolhida como orfa. `falhou` tem sempre um `error_code`.
    """

    GERANDO = "gerando"
    COMPLETA = "completa"
    INTERROMPIDA = "interrompida"
    FALHOU = "falhou"


class EstadoDaAcao(StrEnum):
    """O estado de uma acao proposta pela Tifa.

    Nao existe "confirmada e ainda nao executada": confirmar cria a missao na
    mesma transacao (spec do 1b, "Confirmacao e execucao sao um passo so").
    """

    PROPOSTA = "proposta"
    EXECUTADA = "executada"
    RECUSADA = "recusada"
    FALHOU = "falhou"


class TipoDeAcao(StrEnum):
    """O que a acao faz. E o nome da ferramenta que o modelo chamou."""

    CRIAR_MISSAO = "create_mission"
    REAGENDAR_MISSAO = "reschedule_mission"


class CodigoDoStream(StrEnum):
    """Os codigos do evento `error` do stream e da coluna `error_code`.

    Nao estao no `CodigoDeErro` de `main.py`, que tem so os codigos que algum
    handler HTTP devolve: estes viajam dentro de um 200 ja aberto.
    """

    PROVEDOR_INDISPONIVEL = "provedor_indisponivel"
    TEMPO_ESGOTADO = "tempo_esgotado"
    PROPOSTA_INVALIDA = "proposta_invalida"


# O `error_code` de uma acao cujo prazo passou antes da confirmacao. E o
# mesmo valor do `code` do 422 (`CodigoDeErro.PRAZO_EXPIRADO`); um teste de
# API confere que os dois nao divergem.
PRAZO_EXPIRADO = "prazo_expirado"

# O `error_code` de uma proposta de reagendamento que nao vale mais na hora de
# confirmar: a missao sumiu, foi concluida, ja tem aquele prazo ou tem prazo
# derivado (F17). Mesmo valor do `code` do 409
# (`CodigoDeErro.REAGENDAMENTO_INVALIDO`); um teste de API confere.
REAGENDAMENTO_INVALIDO = "reagendamento_invalido"


_TRANSICOES_DA_ACAO: dict[EstadoDaAcao, frozenset[EstadoDaAcao]] = {
    EstadoDaAcao.PROPOSTA: frozenset(
        {EstadoDaAcao.EXECUTADA, EstadoDaAcao.RECUSADA, EstadoDaAcao.FALHOU}
    ),
    EstadoDaAcao.EXECUTADA: frozenset(),
    EstadoDaAcao.RECUSADA: frozenset(),
    EstadoDaAcao.FALHOU: frozenset(),
}


def validar_transicao_da_acao(atual: EstadoDaAcao, destino: EstadoDaAcao) -> None:
    """Valida a transicao da acao, com o mesmo erro e a mesma forma de
    mensagem da missao: o `code` na resposta e `transicao_ilegal` nos dois."""
    if destino not in _TRANSICOES_DA_ACAO[atual]:
        permitidos = sorted(e.value for e in _TRANSICOES_DA_ACAO[atual])
        alvo = ", ".join(permitidos) if permitidos else "nenhum estado"
        raise TransicaoIlegalError(
            f"nao e possivel ir de '{atual.value}' para '{destino.value}'; "
            f"a partir de '{atual.value}' so se pode ir para: {alvo}"
        )
