# wt/f6-fechamento: prova ponta a ponta da presença da Kairya (F6 Tarefa 6.3h) — 2026-11-11

Objetivo: provar, no navegador, a Presença da Kairya e fechar a Fase 6.
Revisão-base: `c12cfc1`.

## Declarações

- Zero dependência nova (runtime e dev).
- Zero endpoint novo, zero migração, nenhuma alteração em `src/`.
- Só E2E e docs.

## Alterações

- `frontend/tests/e2e/presenca.spec.ts` (novo): saudação uma vez por dia (recarregar não repete,
  dia seguinte repete); celebração ao concluir a diária e volta ao neutro em 3 s com a fala mantida;
  fechar remove a bolha; `reducedMotion` sem transição e troca de `src` imediata; axe com a bolha
  aberta (esquemas `light` e `dark`); composer da tutora inteiro no viewport 1440x900 com a
  saudação aberta (rodapé em 837,6 px).
- `frontend/tests/e2e/cycle-midnight.spec.ts`: regrava `kairyaquest.lastGreeting` com o dia civil de
  São Paulo do instante fixado (`diaCivil`), por `addInitScript` em `fixarRelogio`. O fixture
  `saudacaoJaVista` semeia o relógio real, que não coincide com o dia do app fixado em 2025-01.
- `frontend/tests/e2e/saudacaoJaVista.ts`: exporta `CHAVE_DA_SAUDACAO`.

## Decisões E2E da fase

- **Fixture `saudacaoJaVista`**: `test` estendido que semeia a saudação do dia (civil de São Paulo)
  para os specs que não tratam dela, num ponto único. Quem testa a saudação importa `test` do
  `@playwright/test`.
- **Helper `esperarAnimacoesFinitas(page)`**: o axe só roda depois das animações finitas (o fade-in da
  bolha mede contraste falso); ignora animações infinitas. O contraste da bolha é provado aqui, sem
  violação nos dois esquemas.
- O app tem um único tema; os "dois temas" viram as preferências `light`/`dark` do navegador.
- Computed `transition-duration` com movimento reduzido vem como `1e-05s` (piso do navegador para
  zero); o spec exige `< 0,001 s`.

## Pendências

- (a) `weekPlanCreated` e `farewell` ficam sem gatilho (R5): não há tela do plano da semana nem
  resumo do dia; quem criá-las despacha `{ type: 'say', topic: ... }`.
- (b) A voz da fala fica na F8 (R4): ponto de ligação é `useKairya().state.cue` (`{ line, detail }`);
  a F8 faz um efeito `playVoice(lineSrc(locale, cue.line))` com `prefs.voice` ligado (~10 linhas).
- (c) P-f6-humor-1 (saudação perdida na janela de milissegundos) continua aberta, não tocada aqui.
- (d) `portrait.webp` está fora de uso no painel e fica como fonte do avatar (R12).
