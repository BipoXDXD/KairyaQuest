"""Erros de dominio comuns, traduzidos para HTTP pelos handlers."""


class DomainError(Exception):
    """Base de todo erro previsto pelo dominio.

    Existe para que um handler consiga distinguir "o dominio recusou, e sabe
    explicar por que" de "algo quebrou". A primeira categoria vira resposta;
    a segunda vira 500 e um traceback no log.
    """


class MissaoNaoEncontradaError(DomainError):
    """Nao existe missao com o identificador pedido."""


class NaoPertenceAoUsuarioError(DomainError):
    """A missao existe, mas e de outro usuario.

    E um erro DIFERENTE de MissaoNaoEncontradaError mesmo que a Task 9 traduza
    os dois para o mesmo status HTTP. Nao sao a mesma pergunta: quem le o log
    precisa saber se o identificador nao existe ou se existe e foi negado --
    um aponta para bug no cliente, o outro para tentativa de acesso indevido.
    Quem esta do outro lado da rede recebe o mesmo status justamente para nao
    conseguir descobrir a diferenca.
    """
