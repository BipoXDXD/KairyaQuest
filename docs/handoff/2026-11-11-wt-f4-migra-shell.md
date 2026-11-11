# wt/f4-migra-shell: intermitente do E2E `headquarters.spec.ts:337` — 2026-11-11

Objetivo: investigar a reprovação do pre-push gate em `eca336d` (merge de
`wt/f4-ui-entrada` 55e9bc0) no cenário "concluir pela tela muda o estado no
servidor, e a tela concluida e acessivel".

## A falha

- Única falha da rodada: `Test timeout of 30000ms exceeded` (35,2 s), com a
  última asseveração (`mission-state` = "Concluída" depois do `page.reload()`)
  ainda pendente: `element(s) not found`. Os outros 120 cenários da mesma
  rodada levaram entre 0,3 s e 4,7 s; este costuma levar de 1,9 s a 3,1 s.
- O log da API mostra o cenário inteiro chegando ao servidor: criação,
  carga da tela, `POST /complete` 200, `GET /api/progress` da atualização e
  as cinco leituras da recarga (inclusive `GET /api/missions` 200). Ou seja,
  nada foi recusado nem ficou sem resposta no servidor; o orçamento de 30 s
  se esgotou num passo do lado do navegador/preview.
- O rastro (`trace.zip`) ficou no diretório temporário do gate, já apagado.

## O que foi medido

| Execução | Condição | Resultado |
|---|---|---|
| só o cenário, `--repeat-each 30` | carga natural (load average 76) | 30/30 |
| `headquarters.spec.ts` inteiro, `--repeat-each 8` | carga natural | 48/48 |
| só o cenário, `--repeat-each 4`, `--trace on` | carga natural | 4/4; nenhum passo acima de 0,8 s |
| só o cenário, `--repeat-each 25` | + 14 laços de CPU (10 núcleos) | 25/25 |

A coordenação também rodou `make check-e2e` completo em `eca336d` duas vezes
(01:19 e 01:23): 121/121 nas duas.

## Conclusão

Nenhum defeito reproduzível no teste nem na aplicação em 107 execuções do
cenário, inclusive com CPU saturada. A forma da falha (um único passo parado
cerca de 25 s, com o servidor tendo respondido tudo) coincide com a janela em
que o monitor da máquina registrou `MAC-SWAP-ALTO` e `MAC-DISCO:12G`
(11/11 01:04–01:14): processos do navegador ou do `vite preview` paginados
para o disco. Não houve mudança de código: aumentar o timeout, pôr retry ou
`sleep` esconderia exatamente esse sinal (o `playwright.config.ts` proíbe
retentativa de propósito).

Achado lateral: `f4-migra-shell` e `f4-migra-tutoria` têm o mesmo
`FOCUSQUEST_E2E_PORT_OFFSET` (16) nos `.env`; gates simultâneos dos dois
colidem nas portas do E2E se rodarem ao mesmo tempo. O gate desta rodada usa
o deslocamento do próprio `.env` (16); o hook pre-push só aceita de 0 a 24.

## Próximos passos

- Se a falha voltar, guardar o `test-results/` do gate antes de ele ser
  apagado: o rastro diz qual passo parou (axe, `reload` ou render).
- Dar deslocamentos únicos aos worktrees que repetem (0, 6, 9, 16).
