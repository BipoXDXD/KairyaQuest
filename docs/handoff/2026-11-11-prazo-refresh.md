# Fechamento das pendências 213 e 207 — 2026-11-11

Objetivo: registrar o fechamento das linhas 213 e 207 da tabela de pendências
do `docs/HANDOFF.md`, que seguem abertas lá porque a consolidação ainda não
as riscou. Só documentação: nenhum código nem teste mudou neste PR.
Revisão-base: `846c47b` (`origin/main`).

## Pendência 213 — prazo do `refresh` (decisão da coordenação)

A linha 213 fica **resolvida por este arquivo** e pela seção "Pendência 213:
prazo do refresh (todo GET do cliente) — 2026-11-10" do `docs/HANDOFF.md`.

O código já está na `main`: o PR #77 (`b180a41`, merge `6335edb`) trouxe
`READ_TIMEOUT_MS = 20_000` em `frontend/src/shared/api/client.ts`, aplicado a
todo `requestJson` por `sendWithin`, com os testes com timers falsos em
`client.test.ts`, `useCycle.test.tsx` e `useCurrentPlan.test.tsx`. Foi
conferido em `origin/main` que a constante, o helper e esses testes existem.
Por isso esta frente não escreveu teste vermelho nem código: não havia
comportamento faltando, e um teste novo passaria de primeira.

**Decisão da coordenação, registrada aqui**, e coincide com o que o #77
implementou:

- **Valor escolhido:** os mesmos 20 s das outras chamadas do cliente
  (`MUTATION_TIMEOUT_MS`), sem número novo.
- **Mensagem escolhida:** a de tempo esgotado que o cliente já tem
  (`ApiTimeoutError`, `kind: 'timeout'`), sem texto novo. O refresh mais
  recente que estoura o prazo é uma falha do pedido mais recente como outra
  qualquer, e a regra da pendência 65 ("o pedido mais recente decide") não
  mudou.
- **Recusado:**
  - número próprio para a leitura: criaria um segundo valor sem medida de rede
    por trás (pendência 193) e sem motivo para divergir do POST;
  - texto novo para o refresh: o aviso de desatualizado (`refreshFailed`) e o
    erro com "Tentar novamente" já dizem o que a pessoa pode fazer;
  - retry automático: repetiria uma leitura que o próprio usuário já pode
    refazer, esconderia a falha e multiplicaria os pedidos pendurados.

## Pendência 207 — datas literais de 2027 no E2E

A linha 207 fica **resolvida pelo commit
[`14e2ebf`](https://github.com/BipoXDXD/KairyaQuest/commit/14e2ebf)**
(`frontend/tests/e2e/datas.ts` e os sete specs), que a `main` contém.
Conferido nesta sessão: `git grep -n "2027-" origin/main -- frontend/tests/e2e`
saiu sem nenhuma linha, exit 1.

## Comandos e resultados

- `git grep -n "2027-" origin/main -- frontend/tests/e2e`: vazio, exit 1.
- `git grep -n READ_TIMEOUT_MS origin/main -- frontend/src`: constante em
  `client.ts` e uso nos três arquivos de teste citados.
- `make check` sob a trava: resultado no corpo do PR.

## Pendências

- Nenhuma nova. A consolidação deve riscar as linhas 213 e 207.
