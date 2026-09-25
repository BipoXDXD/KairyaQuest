import { CAMPAIGNS_HEADING_ID } from './headings'

/**
 * Campanhas — planos de estudo (README §7; spec do ciclo diario, "Campanhas
 * — a trilha").
 *
 * A pagina COMPOE, como o Quartel-general: o `main`, o titulo e, no lugar
 * do paragrafo reservado abaixo, a trilha da semana -- `<CampaignTrail />`,
 * de `features/campaigns/CampaignTrail.tsx`, sem props, com titulos a partir
 * do `h2` (decisao K11 do plano do C). Ate a trilha chegar, a pagina diz a
 * verdade: nada de estrutura vazia prometendo o que nao existe.
 */
export function Campaigns() {
  return (
    <main data-testid="campaigns" className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1
          id={CAMPAIGNS_HEADING_ID}
          tabIndex={-1}
          className="rounded text-2xl font-bold tracking-tight text-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
        >
          Campanhas — planos de estudo
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          A semana inteira, dia a dia, e a missão especial.
        </p>
      </header>
      <p
        data-testid="campaigns-placeholder"
        className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300"
      >
        A trilha da semana ainda não chegou a esta versão. A missão de hoje continua no
        Quartel-general.
      </p>
    </main>
  )
}
