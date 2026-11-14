# Nenhum pedido do cenário anterior sobrevive ao reset do E2E (#151) — 2026-11-12

Objetivo: fechar a **cascata** da pendência `P-e2e-flaky-1` (`docs/HANDOFF.md`): o
cenário "avaliando" de `axe-transitorios` estourou a janela de 5 s, o pedido de
avaliação dele ficou a meio caminho (já na API, ainda não no falso), o `reiniciar()`
do cenário seguinte esvaziou o roteiro do falso e o pedido atrasado chegou depois
dele: a avaliação gravou `falhou` no banco compartilhado, e o cenário (c) de
`tutoring.spec` reprovou com *strict mode violation* (um "Tentar de novo" de
`evaluation-request` ao lado do `tutor-retry`). Revisão-base: `ba7b389` (main).

## Declarações

- Zero dependência nova, zero endpoint de produção, zero migração. Só harness do E2E
  (`tests/integration/`), um helper do Playwright e documentação.
- Nenhum timeout aumentado, nenhum retry, nenhuma asserção afrouxada (a do (c) está
  intacta), nenhum teste pulado, limiar de cobertura intacto, nenhum hook tocado.
- **Estado da pendência `P-e2e-flaky-1`: a cascata do cenário (c) está resolvida;
  a pendência continua aberta.** A causa de o "avaliando" (e o "decisão recusada")
  estourarem a janela de 5 s no runner do CI **não foi identificada** e segue
  investigável se reaparecer. O `HANDOFF.md` não foi editado (o `check-handoff`
  reprova isso fora da consolidação); a consolidação deve acrescentar este parágrafo à
  linha da `P-e2e-flaky-1`.

## Causa

`tests/integration/falso_do_e2e.py`, rota `/_control/reset`: troca o roteiro por
`Roteiro()` e rearma o `Event`. O falso não sabe a qual cenário um pedido pertence:
um pedido que chega **depois** do reset captura o roteiro vazio. A API grava
`avaliando` e chama o provedor (`evaluation/service.py`, `avaliar_missao`); com o
roteiro vazio a resposta não traz `record_evaluation`, a tentativa vira `falhou`
e é commitada (a reprodução usa uma rota-substituta, não o `avaliar_missao` real).

## Correção

- `tests/integration/reset_do_e2e.py` (novo): `RastreadorDePedidos` + middleware ASGI
  puro `ContaPedidos` (conta o pedido HTTP até a resposta terminar; o streaming da
  tutoria não escapa) e `POST /_e2e/reset`, que faz, em ordem: (1) `/_control/release`
  no falso; (2) espera a API ficar ociosa (teto de 25 s; estourou, responde `409
  {"em_voo": n}` sem mexer no falso); (3) `/_control/reset`. O pedido em voo termina
  contra o roteiro do cenário que o originou.
- `tests/integration/relogio_do_e2e.py`: `montar_app_do_e2e(..., falso_url=...)` liga o
  rastreador e a rota (só quando o endereço do falso é dado).
- `tests/integration/e2e_app.py`: passa o endereço do falso, já validado como loopback
  (`_url_do_falso`, a mesma guarda de antes, agora também no import).
- `frontend/tests/e2e/falso.ts`: `reiniciar()` chama `POST {API_URL}/_e2e/reset`.
- `docs/QUALITY.md` §4: parágrafo "Reset entre cenários".

## Testes

- `tests/integration/test_reset_do_e2e.py` (6 casos), determinístico, sem `sleep`: o
  pedido já está dentro da API e só segue para o falso quando o falso recebe o sinal do
  reset (o `Event` `liberar`). Vermelho antes da correção (reset só do falso):
  `AssertionError: assert ['falhou'] == ['concluida']`. Um caso mantém o mecanismo do
  defeito como prova de que o reset do harness é necessário; outro cobre o `409`.
- `tests/integration/test_relogio_sem_controle_em_producao.py`: `/_e2e/reset` responde
  404 no app de produção.

## Limite declarado

Fica de fora, por desenho, um pedido ainda no navegador ou no proxy do `vite preview`
que não chegou à API: o Playwright fecha a página do cenário anterior antes do
`beforeEach` seguinte, o que aborta o que não saiu do navegador.
