# Quadro de missões em inglês na galeria

Última fatia do item #173 na #208, sobre a `main` do #228 em
`0121fbcd7bb2e3dc280cd09d64bcb9b54b7d865f`.

`mission-board (en)` monta o mesmo `MissionList` e intercepta o mesmo GET do
quadro em português antes de navegar para a galeria. A variante confere o
`lang` do documento, o título, os nomes acessíveis de Start e Complete e os
textos dos cartões com avaliação aprovada e com falha. A auditoria existente
roda axe e mede os alvos de 44 × 44 px em ambos os idiomas. A mudança fica no
registro de casos e no spec da galeria.

O quadro em português passou na base. Os casos em português e inglês passaram
em três repetições cada. Remover temporariamente `lang=en` da URL do spec fez
a variante inglesa falhar ao encontrar `pt-BR`. O parâmetro foi restaurado.

O `make check` passou com 2.527 testes pytest e 32 subtests, 2.875 testes Vitest,
cinco testes de proxy e 232 Playwright, incluindo o quadro em inglês, sem skips.
