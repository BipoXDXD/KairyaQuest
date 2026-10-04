import { useCallback, useEffect, useRef } from 'react'
import { CycleSection, type CycleSectionHandle } from '../features/missions/CycleSection'
import { MissionList, type MissionListHandle } from '../features/missions/MissionList'
import { ProgressPanel, type ProgressPanelHandle } from '../features/progression/ProgressPanel'
import { TutorPanel } from '../features/tutoring/TutorPanel'
import { HEADQUARTERS_HEADING_ID } from './headings'

/**
 * Quartel-General — a tela inicial.
 *
 * A pagina COMPOE: ela decide o layout e junta as features, e nao contem regra
 * nenhuma (`docs/ARCHITECTURE.md` §3). Quem busca as missoes, decide os estados
 * e traduz o dado e a feature `missions` -- que nao sabe que esta pagina
 * existe. E por isso que trocar esta pagina nao mexe na feature.
 *
 * O §7 preve mais coisa aqui (proxima missao, painel da Tifa, navegacao
 * lateral). Este e o recorte que o mesmo §7 autoriza: so o que tem API. O
 * quadro de missoes veio no 1a; o painel da Tifa entrou no 1b-2, ao lado do
 * quadro; a missao de hoje e a sequencia entraram no B, acima do quadro de
 * avulsas; o nivel, o XP e as conquistas ganharam API no D (D14) e entraram
 * como o painel de progresso, acima da missao de hoje. A pagina continua sem
 * regra: compoe as features, e nenhuma delas sabe da outra -- quando a Tifa
 * cria uma missao, e a PAGINA que pede ao quadro para recarregar, pelo `ref`
 * do `MissionList`; quando qualquer missao e concluida (a diaria, a especial
 * ou uma avulsa), e a PAGINA que pede ao painel de progresso para se
 * atualizar, pelo `ref` do `ProgressPanel` (decisao P3: `refresh` silencioso,
 * sem passar por "carregando"). Estrutura vazia esperando conteudo seria
 * interface que promete o que nao existe.
 *
 * `hidden`: desde o C, o `App` OCULTA esta pagina quando Campanhas esta
 * aberta, em vez de desmonta-la -- desmontar levaria junto o painel da Tifa,
 * com o rascunho e o stream em andamento (decisao K2 do plano do C). O
 * atributo vai na raiz (o painel da Tifa fica fora do `main`) e no proprio
 * `main`: o HTML proibe mais de um `main` sem `hidden` no documento.
 */
export function Headquarters({ hidden = false }: { hidden?: boolean }) {
  const board = useRef<MissionListHandle>(null)
  const progress = useRef<ProgressPanelHandle>(null)
  const cycle = useRef<CycleSectionHandle>(null)
  const wasHidden = useRef(hidden)
  // O `!`: o quadro e o painel montam junto com a pagina, antes de qualquer
  // clique que chegue aqui. Um `?.` criaria um ramo que nenhum uso real
  // alcanca.
  const reloadBoard = useCallback(() => {
    board.current!.reload()
  }, [])
  const refreshProgress = useCallback(() => {
    progress.current!.refresh()
  }, [])
  useEffect(() => {
    // A navegação dentro da mesma aba não emite focus/visibilitychange.
    // Só o retorno atualiza: a montagem inicial já carrega cada feature.
    const returning = wasHidden.current && !hidden
    wasHidden.current = hidden
    if (returning) {
      cycle.current!.refresh()
      refreshProgress()
    }
  }, [hidden, refreshProgress])
  return (
    <div hidden={hidden} className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      {/* `pb-24` no celular: o botao fixo "Falar com a Tifa" fica no canto de
          baixo, e sem a folga cobriria os botoes do ultimo cartao do quadro
          (README §7: a conversa nao cobre botoes). */}
      <main
        data-testid="headquarters"
        hidden={hidden}
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 pb-24 lg:pb-8"
      >
        <header className="mb-6">
          <h1
            id={HEADQUARTERS_HEADING_ID}
            tabIndex={-1}
            className="rounded text-2xl font-bold tracking-tight text-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
          >
            Quartel-General — seu painel de estudos
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            O que está em aberto, com prazo e recompensa.
          </p>
        </header>
        <ProgressPanel ref={progress} />
        <CycleSection ref={cycle} onMissionCompleted={refreshProgress} />
        <MissionList ref={board} onMissionCompleted={refreshProgress} />
      </main>
      {/* O `#missions-heading` e o `id` do titulo do quadro. A pagina e quem
          conhece as duas features, entao e ela quem passa o endereco -- a
          feature `tutoring` nao sabe que esse `id` existe. */}
      <TutorPanel hidden={hidden} onMissionCreated={reloadBoard} boardHref="#missions-heading" />
    </div>
  )
}
