"""O erro proprio da avaliacao.

Mora aqui, e nao em `core/errors.py`: so `evaluation` o levanta, e `core/`
nao depende de modulo nenhum (`FalhaDaAvaliacao` e de `missions`). Como
`TransicaoIlegalError`, que mora em `missions/domain.py`.
"""

from focusquest.core.errors import DomainError
from focusquest.modules.missions.domain import FalhaDaAvaliacao


class AvaliacaoFalhouError(DomainError):
    """A tentativa de avaliacao falhou, e a falha JA esta gravada (E13).

    `falha` e o `error_code` gravado na linha; o handler o traduz em status e
    `code`. Um tipo so para as tres falhas: o que muda entre elas e o valor, e
    o valor ja e um enum.
    """

    def __init__(self, falha: FalhaDaAvaliacao) -> None:
        super().__init__(f"a avaliacao falhou: {falha.value}")
        self.falha = falha
