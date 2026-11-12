# wt/lote21-base: `novo-worktree.sh` nasce da `origin/main` (lote 21) — 2026-11-12

Objetivo: resolver a pendência **P-worktree-base-1** do `docs/HANDOFF.md`. O
`scripts/novo-worktree.sh` criava o worktree a partir da `main` local
(`git worktree add ... main`) e lia o `.env.example` de `main:`. No principal
bare, `git fetch` só atualiza `origin/main`, então a `main` local ficava parada
(em `d65a97d`, PR #65) e o worktree nascia numa revisão velha, com `.env`
gerado de um exemplo velho que as Settings recusavam. Revisão-base: `ba7b389`
(origin/main).

## Declarações

- Zero dependência nova, zero endpoint, zero migração, zero contrato do produto.
  Só script, teste e documentação.
- Nenhum teste pulado, limiar de cobertura intacto, nenhum hook tocado.

## Decisão: o que acontece se o fetch falhar

**O script recusa, sem criar nada**, e mostra o erro do git. Vale para: sem rede,
sem o remoto `origin`, remoto sem a branch `main`. **Não há fallback para a
`main` local** (nasceria de uma revisão velha em silêncio, o defeito original) e
**não se usa uma `origin/main` antiga** que sobrou de um fetch anterior: sem fetch
bem-sucedido não há base. Custo: o script passa a exigir rede; as recusas
locais (nome, destino, deslocamento, bancos, trava) vêm
antes do fetch e não dependem dela. `GIT_TERMINAL_PROMPT=0` evita que o git espere credencial.

## Alterações

- `scripts/novo-worktree.sh`: `git fetch origin +refs/heads/main:refs/remotes/origin/main` (refspec explícito,
  vale sem `remote.origin.fetch`) depois de todas as recusas locais e logo antes
  de criar o worktree; resolve `refs/remotes/origin/main` para um sha; `git show <sha>:.env.example`;
  `git worktree add -b wt/<nome> <dest> <sha>` (um sha não é rastreado, então um
  `git push` sem argumento não mira a main protegida).
  Comentários do cabeçalho atualizados.
- `tests/integration/test_novo_worktree.py`: a fixture ganhou um remoto `origin`
  (bare temporário) e `Repositorio.publicar()`; os testes que mudavam a `main`
  local passam a empurrar. Testes novos (vermelhos antes do script):
  worktree no commit do remoto à frente da `main` local; `.env.example` vindo do
  remoto (e não da `main` local); commit só local não entra; fetch que falha,
  sem remoto `origin` e remoto sem `main` recusam sem criar nada.
- `docs/QUALITY.md`: parágrafo "A base do worktree é a `origin/main`".

## O `.env` do worktree nasce só do `.env.example` da `origin/main` (extra do #149)

Achado da coordenação: o `.env` do principal ainda tem `FOCUSQUEST_CHAVE_REMOVIDA`, e
as `Settings` (`extra="forbid"`) recusam chave desconhecida. Auditoria do script:
a única coisa que ele lia do `.env` do principal para **montar** o `.env` novo era o
`FOCUSQUEST_TEST_DATABASE_URL` (servidor, credencial e query da URL; só o nome do
banco era trocado). As demais linhas já vinham do exemplo, e o teste dos canários de
segredo já cobria isso. O sintoma original (chave de provedor já removido do exemplo) foi do exemplo velho (a `main` local
parada), não de cópia. Mesmo assim, a URL arrastava a credencial do principal.

Decisão: **nenhuma** linha ou valor do `.env` do principal entra no novo.
- `FOCUSQUEST_TEST_DATABASE_URL`: derivada da linha do `.env.example` da `origin/main`
  (só o nome do banco muda). Se o exemplo não a tem, ou o banco dele não termina em
  `_test`, o script recusa.
- `FOCUSQUEST_E2E_PORT_OFFSET`: calculado pelo script (primeiro livre).
- Mais nada é necessário.
- A recusa "o principal não tem `.env`" **foi removida**: o `.env` do principal não
  é mais insumo. Ele continua sendo lido (se existir) só pelo laço dos worktrees
  registrados, para saber que bancos e deslocamentos estão ocupados; nada é copiado.
- Custo: quem roda o Postgres local com outra porta ou credencial que o exemplo
  precisa ajustar a URL no `.env` do worktree (o gate do principal usa a dele).

Testes: `test_o_env_do_worktree_nasce_so_do_exemplo_e_passa_no_settings` (canários
em `FOCUSQUEST_CHAVE_REMOVIDA`, numa variável qualquer e na URL do banco do principal;
o `.env` gerado carrega no `Settings`), `test_funciona_sem_env_no_principal`,
`test_a_query_da_url_do_exemplo_e_preservada` e as recusas do exemplo sem URL ou com
banco sem `_test`.

## Para a consolidação do `docs/HANDOFF.md`

Este PR não toca o `docs/HANDOFF.md` (o `make check-handoff` reprova). A
consolidação deve:

- riscar a pendência **P-worktree-base-1** como resolvida (lote 21, este PR),
  tirando o "Contorno" (`git merge --ff-only origin/main` no worktree novo);
- na tabela de Comandos, trocar "Árvore interna a partir da `main` local (ver
  P-worktree-base-1)" por "Árvore interna a partir da `origin/main`, buscada pelo
  script (recusa se o fetch falhar)".
