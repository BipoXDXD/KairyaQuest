# Idioma do usuário no front: `GET`/`PATCH /api/me` (F3, Task 5) — 2026-11-10

O front passa a ler o idioma do servidor no boot e a gravá-lo a cada troca.
Nenhuma dependência nova; o endpoint é o da Tarefa 3.

**Arquivos.** `shared/api/me.ts` (`fetchMe`, `saveLocale`, `ServerLocale`),
`patchJson` em `shared/api/client.ts` (mesmo tratamento de erro e de prazo do
`postJson`, que agora compartilham `sendWithBody`), `shared/i18n/ServerLocaleSync.tsx`,
e mudanças em `I18nProvider`, `i18nContext` e `LocaleSwitcher`. `main.tsx`
monta `<ServerLocaleSync/>` dentro do `<I18nProvider>`.

**Parse na fronteira.** `fetchMe` recebe o corpo como `unknown` e devolve
`ServerLocale`, uma união discriminada: `chosen` (idioma conhecido), `unset`
(`null`: nunca escolheu) e `unknown` (valor que este front não conhece, ou a
chave ausente). Corpo sem `display_name` texto → `ApiError` de formato.

**Boot.** O provider sobe no idioma local (cache válido ou
`navigator.language`). O `ServerLocaleSync` faz o `GET`: `chosen` vence o
cache e o grava; `unknown` ou falha mantêm o idioma local, sem mensagem e
sem escrita.

**Decisão: a tutora na primeira visita.** Com `locale: null`, o front grava
o idioma local em silêncio (`saveLocale`), uma vez. Sem isso, a UI ficaria em
EN (detectado) e a tutora em PT (fallback de `ler_idioma`) até o primeiro
clique no seletor. Adotada a alternativa (c) da revisão, **restrita ao caso
`null`**: o risco de sobrescrever a escolha de outro dispositivo não existe,
porque `NULL` prova que nenhum dispositivo escolheu. A falha dessa escrita
não reverte nem avisa: a coluna segue `NULL` e o próximo boot tenta de novo.

**Troca.** `setLocale` aplica na hora (estado, cache, `<html lang>`) e chama
`saveLocale`. Se a escrita falhar, volta ao idioma anterior e rejeita; o
seletor mostra `shell.locale.saveFailed` na região `role="status"`, que
existe vazia desde o primeiro render (leitor de tela só anuncia mudança em
região viva que já estava no documento). Trocar para o idioma atual não chama
o servidor.

**`<html lang>` no mesmo commit.** O provider escreve o `lang` num
`useLayoutEffect`, não num `useEffect`: com o passive effect, o commit que
mostrava o aviso de falha (já revertido para PT) ainda deixava o `<html lang>`
em `en` por um instante, e o teste "PATCH falhando reverte e avisa" reprovava
de forma intermitente no CI. O teste "o aviso de falha nunca aparece com o
idioma ainda trocado" observa o primeiro commit do aviso e reprova sempre com
o `useEffect`.

**Contador de geração (ordem no cliente).** Cada troca incrementa a geração;
o boot a captura antes do `GET` (`beginServerSync`) e o resultado só se
aplica (`applyServerLocale`), inclusive a escrita silenciosa do caso `null`,
se nenhuma troca começou depois. A falha de uma troca antiga não reverte nem
avisa: a mais nova já decidiu o estado.

**Fila de escritas (ordem no servidor).** O contador protege só o cliente.
O provider encadeia todas as escritas, a silenciosa e as do seletor: cada
`PATCH` parte depois que o anterior terminou, com sucesso ou falha (a falha
não trava a fila). O servidor recebe os PATCHes na ordem das ações, e o
último a chegar é a escolha mais recente.

**Separação `ServerLocaleSync` × provider.** O `I18nProvider` não faz
`fetch` no boot; é dono do estado, do contador e da fila. Quem fala com o
servidor no boot é o `ServerLocaleSync`, montado só em `main.tsx`, que lê um
contexto próprio (`ServerSyncContext`, sem hook público). O `renderWithI18n`
monta só o provider, então os testes de componente não ganham `GET /api/me`.
Os testes que clicam no seletor declaram a rota `PATCH /api/me`.

**Texto.** `shell.locale.saveFailed` segue o padrão das mensagens de erro (o
que falhou, causa, o que fazer; 12 a 18 palavras, conferido por teste com
os dois endônimos). A causa é "O servidor não confirmou a troca." / "The
server didn't confirm the change.", que vale para rede fora, 503, prazo
estourado e 4xx; "a conexão falhou" seria falso em vários desses casos. Os
endônimos (`shell.locale.ptBR.endonym`, `shell.locale.en.endonym`) são chaves
do catálogo, iguais nos dois idiomas. Dentro da frase, o nome do idioma sai
num `<span lang>` com o código do próprio idioma (WCAG 3.1.2), montado por
`translateParts`, que devolve a mensagem em partes com a variável como
elemento.

**Limite da fila.** Se o `PATCH` silencioso do boot pendurar, o `PATCH` do
clique só parte quando ele estourar o `MUTATION_TIMEOUT_MS` (20 s). Somando
o prazo do próprio clique, a mensagem de falha pode chegar até cerca de 40 s
depois do clique. A tela já mostra o idioma escolhido nesse intervalo. É o
custo aceito da ordem no servidor.

**StrictMode.** O `ServerLocaleSync` ignora o resultado de um `GET` cujo
efeito já foi limpo (`signal.aborted`). Sem isso, um `fetch` que resolve
apesar do abort aplicaria o resultado duas vezes, e o caso `null` sairia em
dois `PATCH`es.

**E2E com idioma fixo.** O `playwright.config.ts` fixa `locale: 'pt-BR'` no
`use` global. Com o banco de teste em `NULL`, o boot grava o idioma do
navegador em `users.locale`; sem o locale fixo, o Chromium headless diz
`en-US` e a tutora passaria a responder em EN nos specs seguintes. O E2E de
idioma (Tarefa 10) sobrescreve por spec com `test.use({ locale })`.

Pendências: a mensagem de falha no seletor (coluna de 224px) precisa da
conferência visual no E2E. Duas trocas seguidas que falham (a antiga em
silêncio, a nova revertendo) deixam a tela no idioma da antiga, que também
não foi gravado; o próximo boot lê o servidor e corrige.

# Idioma do usuário no back: `users.locale` e `/api/me` (F3, Task 3) — 2026-11-10

Base: `c0a5eb4`. Migração `0009_user_locale` (`down_revision = "0008"`; o
contract da Tarefa 2.2 passa a ser a `0010`). Acrescenta `users.locale`
(`text`, CHECK `ck_users_locale`: `locale IN ('pt-BR', 'en')`). As linhas
existentes ficam `NULL`. O downgrade remove o CHECK e a coluna, e perde só a
preferência de idioma.

**Endpoint novo: `GET` e `PATCH /api/me`.** O front precisa ler e gravar o
idioma escolhido, e nenhum endpoint existente fala do usuário: `/api/progress`
é saldo e conquistas, e pôr a preferência ali misturaria leitura agregada com
escrita de configuração. `GET` devolve exatamente `{"display_name", "locale"}`,
com `"locale": null` para quem nunca escolheu. `PATCH` aceita só
`{"locale": "pt-BR" | "en"}` e devolve o mesmo corpo do `GET`. O `null` não é
aceito no `PATCH`: não existe "desescolher". Campo extra (`display_name`,
`id`, `role`...) → 400 `{"detail", "code": "campo_desconhecido"}`, com corpo
fixo que não ecoa o campo. Valor fora da lista ou corpo que não é objeto →
422 no formato nativo. Com extra e valor inválido juntos, vence o 400.

**Como sai o 400.** O handler global de `RequestValidationError` segue em 422
para toda a API. O router de `users` usa a `APIRoute` própria
`RotaQueRecusaCampoExtra`, que captura o `RequestValidationError` e, se algum
erro for `extra_forbidden`, levanta `CampoDesconhecidoError` (`core/errors.py`).
`main.py` traduz em 400 (`CodigoDeErro.CAMPO_DESCONHECIDO`), e a tradução HTTP
continua num arquivo só.

**Sem `If-Match`.** O `PATCH` grava um único valor escolhido pela própria
pessoa, num `UPDATE` atômico e idempotente: a última escolha vence, e não há
leitura-modificação-escrita que um ETag protegeria. Com autenticação e mais
campos editáveis, a decisão volta.

**Por que `User` continua em `missions/models.py`.** As tabelas de `missions`
apontam para `users.id`; com a classe em `users`, `missions` passaria a
importar `users` só para resolver a chave estrangeira. `users/service.py` lê
`display_name` e `locale` e escreve só `locale`.

**Desvio da spec (3.3).** A spec pede `users.locale` "not null default".
Aqui a coluna é anulável e sem default: com default, o servidor não distingue
"escolheu `pt-BR`" de "nunca escolheu", e a detecção por `navigator.language`
da §6 nunca valeria. O fallback do back para `pt-BR` mora só em
`users.service.ler_idioma` (`IDIOMA_PADRAO`). `Idioma` (`core/idioma.py`) fica
no `core` porque `tutoring`, `evaluation` e `users` o usam.

**Implantação.** A 0009 só acrescenta: a API antiga ignora a coluna e o CHECK
aceita `NULL`, então a ordem migrar → subir a API nova não tem janela de
erro. Rollback de código não exige downgrade.

**Desvio do plano: `RETURNING` em vez de `rowcount`.** `atualizar_idioma`
confere a linha afetada por `UPDATE ... RETURNING display_name` (exatamente
uma, senão `RuntimeError`), e não por `rowcount`. O motivo é o mypy estrito:
`Session.execute(update(...))` é tipado como `Result`, que não tem `rowcount`.
A semântica é a mesma e a resposta sai sem segunda consulta.

Validação no worktree, sem banco, com `UV_PYTHON=3.14.10` (resultados lidos
na saída de cada comando):

- `uv run pytest tests/unit -q` → `475 passed, 32 subtests passed`
  (inclui `test_idioma.py` e `test_me_validacao.py`);
- `uv run ruff check .` → `All checks passed!`;
- `uv run ruff format --check .` → `181 files already formatted`;
- `uv run mypy src tests alembic` → `Success: no issues found in 174 source
  files`;
- `uv run alembic upgrade 0008:0009 --sql` e `downgrade 0009:0008 --sql`
  (offline) → o `ADD COLUMN`/`ADD CONSTRAINT` e o `DROP CONSTRAINT`/`DROP
  COLUMN` esperados; `alembic heads` → `0009 (head)`.

Os testes de integração (`tests/integration/test_me_api.py`) e de migração
(`tests/integration/test_user_locale_migration.py`), a suíte de integração
inteira e a cobertura de 100% precisam de PostgreSQL e não rodaram no
worktree. Eles rodam no `make check` completo do hook de commit, com um
PostgreSQL efêmero: este registro só entra no histórico se esse gate passar.
As contagens do gate ficam na descrição do PR.

# Valores `kairya` no banco e no contrato (expand) — 2026-11-10

Base: `e57fa2b`. A migração `0008_kairya_sem_tifa` troca os dois valores
persistidos que ainda carregavam o nome antigo, em modelo expand/contract.
Colunas afetadas: `mission_reschedules.origin` (`tifa` → `kairya`) e
`user_achievements.code` (`tifa_partnership` → `kairya_partnership`). Nenhuma
outra coluna, índice ou CHECK cita esses valores (0001–0007 conferidas).

Decisão: expand + backfill numa revisão só. Os CHECKs
`ck_mission_reschedules_origin` e `ck_user_achievements_code` passam a aceitar
o valor novo **e** o antigo, e o `UPDATE` troca todas as linhas antigas: um
backup anterior restaurado e migrado termina sem valor antigo e sem violar
CHECK. O downgrade devolve os valores antigos e os CHECKs da 0007. O domínio
escreve só os valores novos; a leitura (tolerant reader nos `TypeDecorator`
`OrigemDoReagendamentoText` e `CodigoText`) normaliza o valor antigo antes do
domínio e do contrato. `user_achievements.code` passou de `str` a `Codigo`
no modelo, e os modelos descrevem o CHECK expandido.

**Mudança incompatível de contrato JSON.** `origin` em `reschedules` passa a
emitir `kairya` (antes `tifa`), e `code` das conquistas, em `GET /api/progress`
e no `reward` da conclusão, passa a emitir `kairya_partnership` (antes
`tifa_partnership`). O frontend muda no mesmo PR e precisa sair no mesmo
deploy: um front antigo com a API nova mostraria a origem sem rótulo.

**Ordem de implantação** (mesmo procedimento da 0006): parar a API, rodar
`make migrate`, subir a API e o front novos juntos. A API antiga não lê os
valores novos (`GET /api/progress` e `GET /api/missions` respondem 500) e,
se ficar no ar depois da migração, grava `tifa_partnership` ao lado da
`kairya_partnership` do mesmo usuário. **Rollback de código** exige antes o
`downgrade` da 0008: a API nova contra o CHECK da 0007 tem a escrita de
`kairya` recusada.

**Par de conquistas.** Se o par `tifa_partnership` + `kairya_partnership` do
mesmo usuário surgir (API antiga no ar entre a migração e o restart, ou
restore só de dados sobre o banco migrado), a 0008 o desfaz antes de cada
`UPDATE`, no upgrade e no downgrade: fica a linha de `unlocked_at` mais antigo
(no empate, a de menor código) e o XP não muda. Sem o par, o `DELETE` não faz
nada. Até a 2.2, `UserAchievement` não é alterado nem removido pelo ORM: o
tolerant reader troca o código da chave primária na identity key.

Pendência (Tarefa 2.2, outro PR, **só depois de um deploy estável desta**):
contract — repetir o `DELETE` do par e o `UPDATE` (pode haver resíduo da
janela ou de restore), depois fechar os CHECKs só com os valores novos e
remover o tolerant reader (`_ORIGENS_ANTIGAS` e `_CODIGOS_ANTIGOS`).
`docs/ARCHITECTURE.md` e specs antigas ainda citam o valor antigo; fora do
escopo desta tarefa.

Validação: o `make check` no commit desta etapa, que inclui os testes de
integração de `tests/integration/test_kairya_migration.py` (backfill, CHECKs,
ciclo downgrade/upgrade, par de conquistas nos dois sentidos e no empate,
tolerant reader), além de E2E e cobertura de 100% do front. No worktree, sem
banco, nada disso foi executado.
desktop (e em 390px) fica para o gate E2E e para a F4 4.6. ~~O texto EN de
`shell.locale.saveFailed` passa pela revisão de UX writing na Tarefa 5~~:
resolvido na Tarefa 5 (entrada acima).

# Trechos de `docs/HANDOFF.md` retirados pelo commit 62e1ec1 — 2026-11-11

O commit 62e1ec1 devolveu o `docs/HANDOFF.md` à versão da base e deixou de
levar para cá três trechos que este branch havia editado. O terceiro foi
restaurado acima (pendências da Tarefa 3); os outros dois seguem com o texto
original.

**Anotação na seção da arte e dos valores persistidos (renomeação de
personagem).** Ficava ao fim do parágrafo que diz que os dois valores
persistidos conservam seu contrato de armazenamento/API, logo antes do
parágrafo sobre créditos da Anthropic:

*(Superado pela seção de 2026-11-10 (0008): os dois valores persistidos
passam a `kairya` e `kairya_partnership`, com migração.)*

**Linha da tabela de endpoints (seção "Dependências, endpoints e
infraestrutura: motivos").** Ficava entre `/api/progress`,
`/api/missions/{id}/evaluation` e `/api/missions/{id}/start`:

| Peças | Motivo |
|---|---|
| `/api/me` (GET/PATCH) | Ler e gravar o idioma escolhido (F3); `null` = nunca escolheu. Nenhum endpoint existente fala do usuário. |
