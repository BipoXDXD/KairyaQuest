# Reagendamento exige instantes com deslocamento UTC

Refs #208. Revisão-base `0adeab9a2306b39c76a3b9c8b79e7feb861d376a`.

`problema_do_novo_prazo` verifica o deslocamento UTC do novo prazo,
do prazo atual e do relógio antes de comparar os três instantes. A
presença de um objeto `tzinfo` permite que `utcoffset()` retorne
`None`, caso em que o `datetime` continua sem fuso. A guarda agora
devolve o mesmo `ValueError` usado para um instante sem `tzinfo`.

O teste parametrizado cobre as duas formas de passar um instante sem
fuso em cada argumento. Na base, o novo prazo e o relógio sem
deslocamento causaram `TypeError` e o prazo atual sem deslocamento
passou sem ser rejeitado. A suíte dirigida de domínio e proposta de
reagendamento passou com 64 testes. Ruff (lint e formato) e o mypy
dirigido aos dois arquivos Python também passaram.

A execução dirigida usou `pytest -o addopts='' -q` nos arquivos
`test_acompanhamento_domain.py`, `test_missions_domain.py` e
`test_tutoring_proposta_de_reagendamento.py` de `tests/unit/`.
Os recibos do gate integral ficam no acompanhamento do PR.
