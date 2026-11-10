/**
 * O mapa da arte servida em `public/art/` (versionada pela Fase 7). Todo
 * componente pega o caminho daqui, nunca de string solta; o `assets.test.ts`
 * reprova caminho sem arquivo e arquivo acima de 200 KB.
 */
export const ART = {
  kairya: {
    portrait: '/art/kairya/portrait.webp',
    neutral: '/art/kairya/neutral.webp',
    listening: '/art/kairya/listening.webp',
    thinking: '/art/kairya/thinking.webp',
    celebrating: '/art/kairya/celebrating.webp',
    concerned: '/art/kairya/concerned.webp',
    avatar: '/art/kairya/avatar.webp',
  },
  scenes: { hq: '/art/scenes/hq.webp', campaigns: '/art/scenes/campaigns.webp' },
  empty: {
    missions: '/art/empty/missions.webp',
    plan: '/art/empty/plan.webp',
    'campaign-new': '/art/empty/campaign-new.webp',
  },
  trial: { weeklyTrial: '/art/trial/weekly-trial.webp' },
} as const satisfies Record<string, Record<string, `/art/${string}.webp`>>
