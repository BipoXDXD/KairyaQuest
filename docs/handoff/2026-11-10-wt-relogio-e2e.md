# Pendência 116: E2E atravessando a meia-noite e a F25 — 2026-11-10

A linha 116 da tabela de pendências ("Sem E2E atravessando meia-noite/F25 …
sem relógio controlável no browser/API de E2E") fica **resolvida por esta
seção**.

**O que mudou.**
- `tests/integration/relogio_do_e2e.py` (novo): `RelogioDoE2E`, o relógio da
  API do E2E — real até o harness fixar um instante, real de novo ao soltar —,
  a rota `PUT /_e2e/clock` (corpo `{"now": <date-time com fuso>}`, campo extra
  recusado) e `DELETE /_e2e/clock`, e `montar_app_do_e2e`, que troca o
  `get_clock` do app de produção pelo relógio controlável e o monta sob um app
  externo que tem só a rota de controle.
- `tests/integration/e2e_app.py`: a entrada do uvicorn do E2E passa a servir
  esse app externo. O nome exportado continua `app`.
- `frontend/tests/e2e/cycle-midnight.spec.ts` (novo): o cenário da virada.
  Reusa `somarDias` e `diaEMes` do helper `frontend/tests/e2e/datas.ts`
  (#78), sem editá-lo; os instantes são literais porque os dois relógios são
  fixados neles.
- Testes pytest novos: `tests/integration/test_relogio_do_e2e.py` (o harness,
  contra um app de produção falso) e
  `tests/integration/test_relogio_sem_controle_em_producao.py` (o app de
  produção sem a rota e com o relógio real).
- Nenhum arquivo de `src/` mudou. `main.py`, as regras do ciclo e os serviços
  continuam lendo o relógio só por `get_clock`; não há `if` de ambiente.

**O que o E2E prova.** Semana de 06/01/2025, com os relógios da API (rota de
controle) e do navegador (`page.clock.setFixedTime`) no mesmo instante:
1. Quarta 23:50 em São Paulo: a diária de quarta é iniciada pela tela.
2. Quinta 00:10: a tela mostra hoje = 09/01 e a diária de quarta na seção da
   conclusão tardia, com o motivo "ainda pode ser concluída até o fim de hoje";
   sequência 0. Concluída pela tela, ela fica "Concluída com atraso" e a
   sequência vai a 1 (conta o dia da missão); o reload confirma no servidor.
3. A diária de quinta é iniciada na quinta; na sexta 00:10 ela aparece como
   tardia; no sábado 00:10 (passou o fim do dia seguinte ao prazo) a seção
   some e `POST /api/missions/{id}/complete` responde 409 `missao_expirada`.

**Decisões.**
- A rota mora num app **externo** que monta o de produção (`mount("/")`), e
  não num `include_router` em `focusquest.main.app`: o app de produção é objeto
  de módulo, importado pelo pytest, e registrar a rota nele faria o processo
  que importasse o harness ter controle de relógio no app "de produção". O
  ciclo de vida do externo é o do de produção, para o log continuar
  configurado.
- Prefixo `/_e2e`, fora de `/api`: o `vite preview` do E2E só repassa `/api`,
  então a página não alcança a rota pela origem da tela; só o processo do
  Playwright, falando direto com a porta da API em loopback.
- O relógio fixado fica parado (não anda a partir do instante): o cenário move
  em saltos explícitos e o resultado não depende da velocidade do navegador.
- Semana no passado (2025) e não a real: os outros specs semeiam a semana real
  e o plano é único por semana. A sequência dos outros specs não é afetada: ela
  para no domingo 12/01, planejado e nunca concluído.

**STRIDE da rota de controle do relógio.**

| Ameaça | Mitigação | Teste |
|---|---|---|
| Tampering/Elevation: um cliente move "agora" na produção (reabre diária perdida, conclui fora do prazo, zera o teto diário da tutoria) | A rota só existe em `tests/integration/`, que a imagem da API não copia (`docker/api.Dockerfile` copia só `src/`); o app de produção mantém `get_clock` real e não tem `/_e2e` | `test_relogio_sem_controle_em_producao.py::test_a_rota_do_relogio_responde_404_e_o_relogio_nao_muda` (PUT e DELETE: 404 e `today` = dia real), `::test_o_app_de_producao_nao_publica_a_rota_do_relogio`, `::test_o_app_de_producao_usa_o_relogio_real` |
| Tampering por entrada: instante sem fuso, lixo ou campo extra move o relógio para um valor que ninguém pediu | DTO estrito (`AwareDatetime`, `extra="forbid"`) → 422 e relógio intacto; `fixar` recusa instante sem fuso | `test_relogio_do_e2e.py::test_put_recusa_corpo_invalido_e_nao_mexe_no_relogio`, `::test_fixar_recusa_instante_sem_fuso` |
| Repudiation/integridade da suíte: relógio fixado vaza para os specs seguintes | `afterAll` do spec faz `DELETE` e exige 204, mesmo se um teste reprovar | `test_relogio_do_e2e.py::test_delete_devolve_o_relogio_real`; o próprio `afterAll` do spec |
| Spoofing pela página do E2E | Rota fora de `/api` (sem proxy no `vite preview`), API do E2E só em 127.0.0.1 | Sem teste próprio (ver limitações) |

**Sabotagem.** Com a rota registrada no app de produção no mesmo processo do
pytest (`app.include_router(roteador_do_relogio(...))` antes de rodar o
arquivo), três dos quatro testes de produção reprovam (esquema e os dois 404);
com o `get_clock` de produção também trocado, os quatro reprovam. Sem a
sabotagem, os quatro passam. A sabotagem foi feita por script fora do
repositório, sem editar `main.py`. Ela revelou um defeito do primeiro rascunho:
enumerar `app.routes` não acha rotas de `include_router` no FastAPI 0.142 (elas
ficam num nó interno, sem `path`); o teste passou a usar o esquema OpenAPI
gerado na hora.

**Comandos e resultados.** Preenchidos no corpo do PR com as linhas lidas.

**Limitações novas.**
- O E2E cobre a diária. A especial em conclusão tardia e o teto diário da
  tutoria na virada continuam provados só por testes de serviço/API/componente.
- O navegador recebe o instante por `page.clock.setFixedTime`, que fixa
  `Date.now` sem simular timers. Hoje a tela do ciclo não lê o relógio do
  navegador (o dia vem do `today` da API); se passar a ler, o alinhamento já
  está no cenário, mas o avanço de timers não.
- A recusa de alcançar `/_e2e` pela origem da tela não tem teste próprio: vale
  enquanto o proxy do `vite.config.ts` repassar só `/api`.
