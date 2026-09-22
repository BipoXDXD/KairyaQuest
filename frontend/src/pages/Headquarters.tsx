import { MissionList } from '../features/missions/MissionList'
import { TutorPanel } from '../features/tutoring/TutorPanel'

/**
 * Quartel-general — a tela inicial.
 *
 * A pagina COMPOE: ela decide o layout e junta as features, e nao contem regra
 * nenhuma (`docs/ARCHITECTURE.md` §3). Quem busca as missoes, decide os estados
 * e traduz o dado e a feature `missions` -- que nao sabe que esta pagina
 * existe. E por isso que trocar esta pagina nao mexe na feature.
 *
 * O §7 preve mais coisa aqui (proxima missao, XP, progresso, painel da Tifa,
 * navegacao lateral). Este e o recorte que o mesmo §7 autoriza: so o que tem
 * API. O quadro de missoes veio no 1a; o painel da Tifa entrou no 1b-2, ao
 * lado do quadro. A pagina continua sem regra: compoe duas features, e nenhuma
 * das duas sabe da outra. Estrutura vazia esperando conteudo seria interface
 * que promete o que nao existe.
 */
export function Headquarters() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      {/* `pb-24` no celular: o botao fixo "Falar com a Tifa" fica no canto de
          baixo, e sem a folga cobriria os botoes do ultimo cartao do quadro
          (README §7: a conversa nao cobre botoes). */}
      <main
        data-testid="headquarters"
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 pb-24 lg:pb-8"
      >
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
      <TutorPanel />
    </div>
  )
}
