# Axe no quadro de missões

## Objetivo
Item #173 da guarda-chuva #208, continuação de
`2026-11-14-ds-axe-recusa.md`: o `MissionList`, com os cartões de missão, passa
a ser medido pela galeria `ui-states` (axe sem violações e alvos de 44px). Era
a pendência deixada pelo PR anterior.

Revisão-base: `main` em `fb7d11b`.

## Decisões e porquê
- **O quadro inteiro, não o cartão solto.** O `MissionCard` não é exportado
  pelo módulo, e o quadro é o que a pessoa vê. A galeria monta o
  `MissionList` como o Quartel-General monta, com `AudioProvider` (o cartão
  usa `useAudio`) e `KairyaPresenceProvider`. Nenhum componente de produção
  muda.
- **`AudioProvider storage={null}`.** Som desligado e nenhum arquivo de áudio
  baixado: a galeria mede a tela, não o player.
- **Rotas antes de abrir a página.** O quadro busca as missões na montagem,
  então o spec ganhou o mapa `ROTAS`, que roda antes do `goto`; o `SETUP`
  continua rodando depois, para os cliques. A rota casa pelo `pathname`, e
  não por glob, para não depender da query string da paginação.
- **Um cartão por estado no quadro.** Pendente, em andamento, concluída com
  avaliação aprovada e concluída com avaliação que falhou. Os estados em voo e
  as falhas de Iniciar e Concluir vêm de um clique com o POST interceptado,
  no mesmo molde dos PRs anteriores.
- **Fim da animação antes do axe na recompensa.** O anúncio do XP entra com
  `animate-reward-in` (opacidade, 400 ms). Medido no meio da animação, o axe
  acusou contraste 1,56:1, com o texto ainda misturado ao fundo. O caso espera
  as animações do anúncio terminarem: o contraste que importa é o do quadro
  final.

## Alterações
- `src/test/gallery/caseIds.ts` e `cases.tsx`: seis casos novos
  (`mission-board`, `mission-starting`, `mission-start-failed`,
  `mission-completing`, `mission-completion-failed` e
  `mission-completed-reward`); `caseComponents.tsx`: o `MissionListCase`.
- `tests/e2e/missoesGaleria.ts`: as missões e a resposta de conclusão que as
  rotas devolvem.
- `tests/e2e/ui-states.spec.ts`: o mapa `ROTAS`, seis entradas no `SETUP` e
  os auxiliares `cartao` e `nomeNoCartao`.

## Pendências
- O "carregar mais" do quadro (`missions-load-more` e a falha dele) ainda não
  passa pela galeria.
- O quadro não tem variante em inglês na galeria.
