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
    """Ja existe uma resposta da Tifa sendo gerada.

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


class NaoPertenceAoUsuarioError(DomainError):
    """A missao existe, mas e de outro usuario.

    E um erro DIFERENTE de MissaoNaoEncontradaError mesmo que a Task 9 traduza
    os dois para o mesmo status HTTP. Nao sao a mesma pergunta: quem le o log
    precisa saber se o identificador nao existe ou se existe e foi negado --
    um aponta para bug no cliente, o outro para tentativa de acesso indevido.
    Quem esta do outro lado da rede recebe o mesmo status justamente para nao
    conseguir descobrir a diferenca.
    """
