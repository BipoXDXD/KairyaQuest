# Isolamento da configuração de teste

**Objetivo** — Resolver o item “Configuração de teste exigida em produção”
da issue #208. O patch original usou `0adeab9`. A composição deste
incremento usa `05b6732d`.

**Decisões** — A API e o Alembic em modo padrão leem `Settings`, que continua
a exigir `FOCUSQUEST_DATABASE_URL`, validar os limites PostgreSQL e recusar
chaves desconhecidas no `.env`. O arquivo pode ser compartilhado com as
ferramentas, que usam `ConfiguracaoDeTeste` para ler a URL de teste obrigatória
e o deslocamento das portas do E2E. As conexões da API mantêm os mesmos
ajustes de sessão e pool.

**Alterações** — O Alembic com `-x test=true` valida o sufixo `_test` e o
limite de 63 bytes antes da conexão. A consulta só admite opções de
transporte e diagnóstico. Um valor desconhecido de `-x test` interrompe
a migração antes de criar a engine. A mesma guarda de URL atende a criação e
o reset do banco pela suíte, que também comparam o alvo com a URL configurada.
O script do E2E usa a URL de teste para iniciar a API e mantém as guardas de
loopback do provedor e de chave fictícia. O exemplo de `.env` recebeu apenas
comentários.

**Verificações do patch original**

- `uv lock --check`, Ruff, mypy, `bash -n`, `make check-handoff`,
  `make check-secrets` e `make check-wheel` passaram.
- `make check` passou pelo frontend com 2.875 testes e parou no primeiro
  teste de integração Python. O ambiente bloqueou a conexão com o
  PostgreSQL local. A tentativa de iniciar um cluster isolado também foi
  bloqueada na criação de memória compartilhada.
- As verificações focadas de saúde, configuração do Alembic, guardas de teste,
  script do E2E e configuração do pre-push passaram com 56 testes. Com a URL
  de teste ausente, `/ready` chegou à tentativa de conexão e devolveu
  `503` com `database=unavailable`.
- `pytest tests/unit` passou em 979 testes. Oito testes de build falharam
  no setup por falta de acesso ao socket do Docker, que também bloqueou
  `make check-proxy`.

**Limitação do patch original** — O cenário de regressão com PostgreSQL real
migrado sobe o `TestClient` sem URL de teste e verifica `200` em
`/health`, `/ready` e `/api/me`. A fixture parou na conexão com o banco.
O E2E de navegador parou no reset do banco de teste. Os cenários que sondam
portas para criar worktrees também esbarraram no bloqueio a sockets locais.

**Composição sobre `05b6732d`**

- A R2 passou em 156 testes com PostgreSQL descartável, sem pulos. O caso
  nominal confirmou HTTP 200 em `/health`, `/ready` e `/api/me` com a URL
  de teste ausente no runtime. A fixture foi removida ao final.
- Uma execução posterior revelou que a asserção da recusa do banco de
  desenvolvimento esperava o nome literal `focusquest`. A R3 compara o alvo
  completo da fixture, com a senha redigida. Antes da correção, o teste
  falhou com o nome fictício `kairya208_dev`. Depois, passou com
  `kairya208_dev` e `outro_desenv`, com conexões bloqueadas nas duas provas.
  Ruff e a conferência do formato passaram no arquivo alterado.
