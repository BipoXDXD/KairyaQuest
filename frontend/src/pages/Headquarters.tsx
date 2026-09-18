import { MissionList } from '../features/missions/MissionList'

/**
 * Quartel-general — a tela inicial.
 *
 * A pagina COMPOE: ela decide o layout e junta as features, e nao contem regra
 * nenhuma (`docs/ARCHITECTURE.md` §3). Quem busca as missoes, decide os estados
 * e traduz o dado e a feature `missions` -- que nao sabe que esta pagina
 * existe. E por isso que trocar esta pagina nao mexe na feature.
 *
 * O §7 preve mais coisa aqui (proxima missao, XP, progresso, painel da Tifa,
 * navegacao lateral). Este e o recorte inicial que o mesmo §7 autoriza: so o
 * quadro de missoes, porque so ele tem API. Estrutura vazia esperando conteudo
 * seria interface que promete o que nao existe.
 */
export function Headquarters() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main data-testid="headquarters" className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Quartel-general — seu painel de estudos
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            O que está em aberto, com prazo e recompensa.
          </p>
        </header>
        <MissionList />
      </main>
    </div>
  )
}
