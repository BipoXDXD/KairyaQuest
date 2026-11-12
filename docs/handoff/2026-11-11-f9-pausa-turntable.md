# f9-pausa-turntable: botão de pausa no turntable da Kairya

## Objetivo
Resolver o WCAG 2.2.2 (Pause, Stop, Hide) antes de o asset 3D ser ligado: o vídeo em loop do turntable ganha um botão de pausa.
Isto remove o "Bloqueio da T4" registrado em `docs/handoff/2026-11-11-f9-3d.md`; a consolidação deve riscá-lo.

Revisão-base: 8936820.

## Decisões
- O estado `paused` só decide o rótulo e nasce `true` (o vídeo nasce pausado até o evento `play`); depois segue só os eventos `play`/`pause` do `<video>`. Sem autoplay, o rótulo já nasce "Retomar a animação", sem piscar.
- O clique decide pelo `video.paused` real, não pelo estado: dois cliques antes do evento ainda alternam de verdade.
- O `.catch` do `play()` é a única captura: o navegador pode recusar o play e o estado segue os eventos reais.
- Botão `Button variant="tertiary"` com `kairya.turntable.pause`/`resume` (pt-BR e en); `data-testid="kairya-turntable-toggle"`. Rótulo genérico: só uma recompensa de nível aparece por vez.
- Sem botão sob movimento reduzido, no placeholder e após erro do vídeo.
- O turntable saiu da região viva (`role="status"`, atômica): `RewardAnnouncement` fica só com o texto e o novo `RewardTurntable` é irmão do status em `MissionCard` e `EvaluationPanel`. Efeito visual: o turntable passa a aparecer depois de todo o bloco do anúncio (inclusive conquistas), não entre o nível e as conquistas.

## Alterações
`KairyaTurntable.tsx` e teste, catálogos `pt-BR.ts`/`en.ts`, `RewardAnnouncement.tsx` (+ `RewardTurntable`), `MissionCard.tsx`, `EvaluationPanel.tsx` e os testes de `RewardAnnouncement`, `MissionCard.audio` e `EvaluationPanel`.

## Comandos e resultados
- `npx vitest run src/features/kairya src/features/missions`: 40 arquivos, 1100 testes verdes.
- `npx vitest run --coverage`: suíte completa verde, sem erro de limiar (100%).
- `npx tsc -b` e `npm run lint`: limpos.
- `make check` não foi rodado nesta etapa; fica para o controlador.

## Pendências
- `P-f9-pausa-turntable-1`: o E2E só passa a ver o botão quando houver asset (`TURNTABLE` ainda é nulo).
- `P-f9-pausa-turntable-2`: ao trocar ao vivo de movimento reduzido para normal, o `<video>` novo reaproveita o estado do rótulo até o primeiro evento; o clique já decide pelo elemento, então não prende a pessoa.
