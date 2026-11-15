# Paginação do quadro na galeria

## Objetivo

Continuação do item #173 na #208 e do PR #223. A galeria `ui-states` mede o
rodapé de “Carregar mais missões” quando está disponível, durante a requisição
e quando a página seguinte falha.

Base `321a225d4b306e0350875f0a6fc90d0b2b73ba53`.

## Decisões

- Os três casos montam o `MissionListCase` existente e interceptam o GET
  antes da navegação. A primeira página tem 50 avulsas de IDs distintos. O
  prazo distinto do último cartão permite identificar a origem do cursor.
- O spec confere `limit`, `after_deadline` e `after_id` na requisição
  iniciada pelo clique. Com o GET pendente, o botão permanece desabilitado e
  ocupado antes e depois do axe e da medição dos alvos de 44 px. Com HTTP 503,
  o rodapé anuncia a falha e oferece nova tentativa.
- Os três casos conferem a sequência dos 50 cartões. O componente de
  produção e as mensagens continuam sendo os da aplicação.

## Validação

- No Chromium, o caso original `mission-board` passou na base. Os três
  estados novos passaram em três repetições cada.
- Controles negativos em cópia local do código da galeria. A remoção de
  `aria-busy` do botão em andamento e de `role="alert"` do rodapé de erro
  derrubou os dois casos correspondentes. Após restaurar os atributos, os
  três casos passaram.
- O recorte usa `npx playwright test --project=ui-states --grep
  "mission-(load-more|loading-more|load-more-failed)$"` em `frontend/`.
  O gate integral segue `make check`, pelos hooks do repositório.

## Pendência

A variante em inglês do quadro segue na fila da #208.
