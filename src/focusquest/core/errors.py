"""Erros de dominio comuns, traduzidos para HTTP pelos handlers."""


class DomainError(Exception):
    """Base de todo erro previsto pelo dominio.

    Existe para que um handler consiga distinguir "o dominio recusou, e sabe
    explicar por que" de "algo quebrou". A primeira categoria vira resposta;
    a segunda vira 500 e um traceback no log.
    """


class MissaoNaoEncontradaError(DomainError):
    """Nao existe missao com o identificador pedido."""


class OperacaoReutilizadaError(DomainError):
    """O identificador de operacao ja identifica OUTRA operacao.

    Um `operation_id` fica vinculado a operacao em que foi usado pela
    primeira vez -- a missao E o tipo. Reaproveita-lo em outra missao, ou
    para outro tipo de operacao na mesma missao, e uso indevido do cliente:
    nao e reenvio, e chave gasta.

    A distincao em relacao ao reenvio legitimo e o que sustenta a promessa da
    idempotencia. Se qualquer reuso fosse aceito como "ja feito", concluir a
    missao B com uma chave gasta na missao A devolveria a missao A como
    sucesso -- o cliente receberia 200 e a missao B continuaria pendente, sem
    que nada no caminho tivesse parecido errado.

    O nome e mais largo do que "de outra missao" de proposito, e o motivo e
    estrutural: a restricao UNIQUE que sustenta tudo isso e sobre
    `operation_id` SOZINHO, sem o tipo. Entao a mesma chave usada numa
    operacao de inicio e numa de conclusao e o mesmo conflito, e precisa ser
    o mesmo erro.
    """


class MensagemEmAndamentoError(DomainError):
    """Ja existe uma resposta da Kairya sendo gerada.

    A conversa e uma so: duas perguntas em paralelo intercalariam as
    respostas. O cliente espera a atual terminar -- ou o prazo do orfao.
    """


class AcaoNaoEncontradaError(DomainError):
    """Nao existe acao da tutoria com o identificador pedido -- ou ela e de
    outro usuario.

    Um tipo so para os dois casos, ao contrario da missao: a distincao vai na
    MENSAGEM, que o handler registra no log e nao devolve. A resposta e a
    mesma, pelo mesmo motivo do 404 da missao alheia.
    """


class ProvedorNaoConfiguradoError(DomainError):
    """Nao ha chave do provedor: a Kairya esta indisponivel (README s14)."""


class PrazoExpiradoError(DomainError):
    """O prazo proposto pela Kairya ja passou na hora de confirmar -- ou o novo
    prazo de um reagendamento nao esta no futuro (F9): o mesmo `code` nos dois."""


class NaoPertenceAoUsuarioError(DomainError):
    """A missao existe, mas e de outro usuario.

    E um erro DIFERENTE de MissaoNaoEncontradaError mesmo que a camada web traduza
    os dois para o mesmo status HTTP. Nao sao a mesma pergunta: quem le o log
    precisa saber se o identificador nao existe ou se existe e foi negado --
    um aponta para bug no cliente, o outro para tentativa de acesso indevido.
    Quem esta do outro lado da rede recebe o mesmo status justamente para nao
    conseguir descobrir a diferenca.
    """


class MissaoExpiradaError(DomainError):
    """O dia (ou a janela) da missao ja passou -- ou o dia nem era do plano.

    A requisicao esta correta; e o relogio que recusa. Nao ha o que repetir.
    """


class PlanoExistenteError(DomainError):
    """Ja existe plano para esta semana. O reenvio da criacao cai aqui, e nao
    num plano duplicado: o cliente confirma com `GET /api/plans/current`."""


class SemanaEncerradaError(DomainError):
    """A semana pedida ja terminou: nao ha dia nela que ainda possa ser feito."""


class SemanaDistanteError(DomainError):
    """A semana pedida fica alem da seguinte a atual.

    Alem de reduzir o que da para esconder, e o que impede o 500 de uma semana
    no ano 9999, em que o fim do domingo estouraria o `datetime`.
    """


class SemEvidenciaError(DomainError):
    """A missao nao tem evidencia para a Kairya avaliar (inclui a nao concluida).

    O pedido esta certo; o estado da missao e que recusa -- 409, como a
    transicao ilegal. Autodeclarar nao da direito a avaliacao (E4).
    """


class AvaliacaoEmAndamentoError(DomainError):
    """Ja ha uma tentativa de avaliacao `avaliando`, e ela nao e orfa (E9).

    Tambem e o erro da tentativa SUPERADA (E10): a resposta atrasada de uma
    tentativa que outro pedido ja retomou nao grava nada, e quem pediu fica
    sabendo que a avaliacao segue em outro pedido.
    """


class PrazoInalteradoError(DomainError):
    """O novo prazo e o prazo atual (F9): o pedido esta certo, mas nao muda
    nada, e gravar um reagendamento vazio sujaria o historico."""


class PrazoDerivadoError(DomainError):
    """A diaria e a especial tem prazo DERIVADO do ciclo (C10), sem coluna para
    mudar: nao se reagendam (F7)."""


class ReagendamentoInvalidoError(DomainError):
    """A proposta de reagendamento nao vale mais: a missao sumiu, foi concluida
    ou ja tem aquele prazo (F17). A acao foi GRAVADA como `falhou` antes deste
    erro subir -- a rota commita e so entao levanta."""


class EstimativaForaDoLimite(DomainError):
    """A estimativa da avulsa sai da faixa de negocio (pendencia 26).

    Faixa e nao teto tecnico: a coluna guarda ate 2**31-1, e um dia (1440
    minutos) e o maior bloco que ainda e "uma missao" -- o mesmo teto que o
    ciclo ja impunha a diaria e a especial. O pedido e bem formado; e a regra
    de negocio que o recusa, entao o 422 sai com `code` proprio.
    """


class PrazoForaDoLimite(DomainError):
    """O prazo da avulsa nao esta em `(agora, agora + 365 dias]` (pendencia 26).

    Depende do relogio, e por isso nao mora no schema: o schema nao le hora.
    Na criacao pela tela cobre o passado e o longe demais; na confirmacao da
    Kairya e no reagendamento, so o longe demais (o passado e
    `PrazoExpiradoError`, F9).
    """
