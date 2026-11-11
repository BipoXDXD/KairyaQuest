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
- (e) O layout do composer foi medido com `layoutData`, sem as dez missões do `layout.spec`
  (rodapé em 837,6 px contra 1029 px antes); o cenário com as dez missões segue sem teste.
- (f) Débitos que seguem abertos ao fechar a fase (revisão final; sem código agora):
  - **N1**: o rosto volta a `idle` com rascunho não vazio ao fim da resposta ou da celebração; a
    próxima tecla não reemite `userTyped`. Correção: emitir `userTyped` após `answerFinished`
    quando `next.draft !== ''` e, no fim da celebração, um efeito no `TutorPanel`. Muda comportamento.
  - **N2**: toda troca de presença re-renderiza todos os consumidores do contexto; separar ações
    (estável) de estado, só com medida.
  - **N3**: `tutorFailed({ offline: false })` e `questionSent` apagam uma saudação ou celebração
    aberta (`cue: null`, `useKairyaMood.ts`). Comportamento coerente do reducer da 6.1, sem teste de
    página.
  - **N4**: comentários sem acento em `faceArt.ts`, `KairyaFace.tsx`, `tutorPresence.ts`,
    `useTutorPresence.ts` (cosmético).
  - Review Focus sem teste: reanúncio na troca de idioma (6.3d M1); saudação com o `main` oculto
    por deep link em Campanhas (6.3d M7); N1; cenário de layout com as dez missões.
  - 6.3a M1, M2: assert redundante por título e assert sem mensagem nos testes da persona.
  - 6.3a M3: o plano viajou no PR da 6.3a (já aceito).
  - 6.3b M2, M3: a regex do `noMathRandom` não pega `Math['random']` nem a referência sem chamada,
    e não varre `src/test/*.ts` nem o E2E.
  - 6.3c M2: o teste "sem classe de transição" não vê CSS externo.
  - 6.3d M3: 400 ms/`ease-out` duplicados com `RewardAnnouncement` (catraca `PENDING_MIGRATION`).
  - 6.3e M3: `dispatchAll` que lança pula `onCompleted` (reducer puro).
  - 6.3e M4: página só com `nao_atende`.
  - 6.3e M5: ordem dos imports (cosmético).
  - 6.3f M2, M3, M4: "uma vez por sessão" já coberto no provider, virada do dia com o app
    montado, acentos no E2E.
  - 6.3g M1, M2, M3: ordem ref/dispatch não observável, proposta só pelo texto, corrida residual do
    helper de animações.
  - 6.3h M2: atomicidade alt/src em um só `evaluate`.
  - 6.3h M3: controle positivo de `semTransicao`, hoje vácuo porque o `<img>` nunca tem transição.
  - 6.3h M4 (parte não aplicada): relógio por teste no axe.
- (g) Fitness function nova `src/test/noCrossFeatureInternals.test.ts`: reprova import de interno
  de outra feature (R3, ARCHITECTURE §5 regra 1).
