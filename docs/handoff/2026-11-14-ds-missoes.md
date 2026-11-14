# Telas de Missões nos componentes do design system

## Objetivo
Migrar a área de Missões (`frontend/src/features/missions/`) para os
componentes de `shared/ui`, item #173 da guarda-chuva #208. Progressão,
Tutoria e a animação da lanterna ficam para incrementos próprios.

Revisão-base: `main` em `044f304`.

## Decisões e porquê
- **Componentes usados:** `Button` (primário só no Concluir, terciário nos
  botões que abrem evidência e reagendamento, secundário no resto), `Field`
  (texto e link da evidência, novo prazo), `Panel` (cartão da missão, seção
  do ciclo, caixas de erro), `StatusLine` e `Badge` (estado da missão e
  verificação).
- **Exceções ao componente, cada uma com motivo:**
  - O status que carrega o anúncio de recompensa continua `div
    role="status"`: o `StatusLine` é um `<p>` e o anúncio tem estrutura
    própria.
  - O destaque que era âmbar virou `text-action-primary`: não existe token
    de aviso.
  - O foco volta ao botão de reagendar por `id`, porque o `Button` não
    aceita `ref`.
- **Superfície sólida no lugar do gradiente.** O cartão de missão e o ciclo
  deixaram as classes `.rpg-mission-card` e `.rpg-cycle`; o CSS morto saiu de
  `index.css` e as duas classes saíram de `gradientContrast.test.ts`. As
  cores de texto dessas telas passam a ser medidas em
  `tokens/contrastPairs.ts`.
- **Quebra de linha no celular preservada:** o cabeçalho do cartão usa
  `flex-wrap sm:flex-nowrap`, no lugar da regra de mídia removida.
- **Primeira dobra em 1440x900.** O botão que abre a evidência passou de link
  de ~20px para `Button` terciário de 44px (alvo de toque), e o Iniciar da
  diária saiu da dobra (`layout.spec.ts`: fim em 909,8px, teto 900). O alvo
  não encolheu; o espaço veio de dois ajustes: a região da evidência fechada
  não leva margem, e o `Badge` do estado fica num `flex`, sem a caixa de
  linha extra. Medido no E2E: o Iniciar termina em 897,4px.

## Alterações
- Os oito componentes de `features/missions/`.
- `MissionList.test.tsx`: o status em repouso agora é afirmado por
  `textContent === ''`, porque o `StatusLine` fica montado com o ícone.
- `shared/ui/designLint.test.ts`: as oito entradas de Missões saíram de
  `PENDING_MIGRATION`.
- `styles/gradientContrast.test.ts` e `src/index.css`: classes removidas.
- Comentários de `tests/e2e/axe-transitorios.spec.ts` e
  `tests/e2e/headquarters.spec.ts` atualizados para as classes e cores novas.

## Pendências
- O `StatusLine` em repouso mostra o ícone em cada cartão (uso documentado
  do componente). Se incomodar visualmente, o ajuste é no componente, não
  aqui.
- Falta token de aviso no design system.
- A folga do Iniciar na dobra de 1440x900 é de 2,6px. Qualquer linha nova
  acima dele no cartão da diária reprova o `layout.spec.ts`.
