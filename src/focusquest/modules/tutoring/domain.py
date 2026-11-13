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
    chamar o provedor, e termina em um dos outros tres. `interrompida` e a
    resposta que nao chegou inteira: o cliente sumiu, o processo morreu, a
    resposta foi recolhida como orfa (nesses tres, resultado desconhecido, e
    `error_code` nulo) ou um limite de tamanho a cortou -- o teto de tokens ou
    a janela de contexto (pendencias 45 e 120: o texto parcial fica, a acao
    nao, e o `error_code` e `RESPOSTA_LONGA`). `falhou` tem sempre um
    `error_code`, inclusive a recusa (`resposta_recusada`, sem o texto).
    """

    GERANDO = "gerando"
    COMPLETA = "completa"
    INTERROMPIDA = "interrompida"
    FALHOU = "falhou"


class EstadoDaAcao(StrEnum):
    """O estado de uma acao proposta pela Kairya.

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
    # A resposta foi recusada (`stop_reason: refusal`, pendencia 120): pelos
    # classificadores de seguranca do provedor ou pelo proprio modelo. O
    # texto parcial e descartado.
    RESPOSTA_RECUSADA = "resposta_recusada"
    # O banco cortou a gravacao final por um teto da sessao (ADR 0001) ou o
    # pool nao entregou conexao, ja com o stream aberto (#177). Mesmo valor
    # do `code` do 503 (`CodigoDeErro.BANCO_OCUPADO`); um teste confere.
    BANCO_OCUPADO = "banco_ocupado"


# O `error_code` de uma resposta `interrompida` porque um limite de tamanho a
# cortou -- o teto de tokens ou a janela de contexto (pendencias 45, 120 e
# 122). NAO e codigo do evento `error`: a cortada sai no `done`, e o codigo so
# diz POR QUE ela esta incompleta, para a tela sugerir pedir por partes. As
# outras `interrompida` (desconexao, orfa) nao tem `error_code`: nelas o
# resultado e desconhecido.
RESPOSTA_LONGA = "resposta_longa"


# O `error_code` de uma acao cujo prazo passou antes da confirmacao. E o
# mesmo valor do `code` do 422 (`CodigoDeErro.PRAZO_EXPIRADO`); um teste de
# API confere que os dois nao divergem.
PRAZO_EXPIRADO = "prazo_expirado"

# O `error_code` de uma proposta de reagendamento que nao vale mais na hora de
# confirmar: a missao sumiu, foi concluida, ja tem aquele prazo ou tem prazo
# derivado (F17). Mesmo valor do `code` do 409
# (`CodigoDeErro.REAGENDAMENTO_INVALIDO`); um teste de API confere.
REAGENDAMENTO_INVALIDO = "reagendamento_invalido"

# O `error_code` de uma acao cuja entrada GRAVADA nao passa mais no esquema
# atual da ferramenta na hora de confirmar: foi proposta antes de um esquema
# endurecer (um teto de texto novo, um motivo que saiu do enum). Pendencia 47.
# Mesmo valor do `code` do 422 (`CodigoDeErro.PROPOSTA_INVALIDA`) e do
# `CodigoDoStream.PROPOSTA_INVALIDA`: e a mesma recusa, so que na confirmacao.
PROPOSTA_INVALIDA = "proposta_invalida"

# Os `error_code` de uma acao cuja proposta saiu dos limites de negocio da
# avulsa (pendencia 26): estimativa fora de 1..1440 minutos ou prazo alem de
# 365 dias. Sao a FONTE dos valores do `code` do 422: o `CodigoDeErro` os
# reaproveita, e a acao gravada diz o mesmo que a resposta HTTP.
ESTIMATIVA_FORA_DO_LIMITE = "estimativa_fora_do_limite"
PRAZO_FORA_DO_LIMITE = "prazo_fora_do_limite"


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
