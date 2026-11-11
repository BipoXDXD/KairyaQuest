import { useCallback, useEffect, useRef } from 'react'
import { KairyaBubble } from '../features/kairya'
import {
  CycleSection,
  type CycleSectionHandle,
  MissionList,
  type MissionListHandle,
} from '../features/missions'
import { ProgressPanel, type ProgressPanelHandle } from '../features/progression'
import { TutorPanel } from '../features/tutoring'
import { useT } from '../shared/i18n/useT'
import { AreaHero } from './AreaHero'
import { HEADQUARTERS_HEADING_ID } from './headings'

/**
 * Quartel-General — a tela inicial.
 *
 * A pagina COMPOE: ela decide o layout e junta as features, e nao contem regra
 * nenhuma (`docs/ARCHITECTURE.md` §3). Quem busca as missoes, decide os estados
 * e traduz o dado e a feature `missions` -- que nao sabe que esta pagina
 * existe. E por isso que trocar esta pagina nao mexe na feature.
 *
 * O §7 preve mais coisa aqui (proxima missao, painel da Kairya, navegacao
 * lateral). Este e o recorte que o mesmo §7 autoriza: so o que tem API. O
 * quadro de missoes veio no 1a; o painel da Kairya entrou no 1b-2, ao lado do
 * quadro; a missao de hoje e a sequencia entraram no B, acima do quadro de
 * avulsas; o nivel, o XP e as conquistas ganharam API no D (D14) e entraram
 * como o painel de progresso, acima da missao de hoje. A pagina continua sem
 * regra: compoe as features, e nenhuma delas sabe da outra -- quando a Kairya
 * cria uma missao, e a PAGINA que pede ao quadro para recarregar, pelo `ref`
 * do `MissionList`; quando qualquer missao e concluida (a diaria, a especial
 * ou uma avulsa), e a PAGINA que pede ao painel de progresso para se
 * atualizar, pelo `ref` do `ProgressPanel` (decisao P3: `refresh` silencioso,
 * sem passar por "carregando"). Estrutura vazia esperando conteudo seria
 * interface que promete o que nao existe.
 *
 * A fala da Kairya (F6) entra como `KairyaBubble`, logo abaixo do cabecalho e
 * dentro do `main`: a pagina so a compoe e nao conhece as regras dela (quando
 * fala, em que tom, o que o leitor de tela anuncia). Fica em linha, sem
 * posicao fixa, porque o botao "Falar com a Kairya" ja ocupa a base da tela no
 * celular e a conversa nao cobre botoes (README §7); e nao depende do painel
 * da tutora, que pode estar recolhido.
 *
 * `hidden`: desde o C, o `App` OCULTA esta pagina quando Campanhas esta
 * aberta, em vez de desmonta-la -- desmontar levaria junto o painel da Kairya,
 * com o rascunho e o stream em andamento (decisao K2 do plano do C). O
 * atributo vai na raiz (o painel da Kairya fica fora do `main`) e no proprio
 * `main`: o HTML proibe mais de um `main` sem `hidden` no documento.
 */
export function Headquarters({ hidden = false }: { hidden?: boolean }) {
  const t = useT()
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
    <div hidden={hidden} className="headquarters-layout lg:flex">
      {/* `area-main--fab-clearance` (base.css): abaixo do lg, 96 px de folga
          no fim, porque o botao fixo "Falar com a Kairya" ocupa os 80 px de
          baixo da tela e cobriria os botoes do ultimo cartao do quadro
          (README §7: a conversa nao cobre botoes). */}
      <main
        data-testid="headquarters"
        hidden={hidden}
        className="area-main area-main--fab-clearance mx-auto w-full min-w-0 flex-1 px-4 pt-8 lg:px-6 lg:py-8 xl:p-8"
      >
        <AreaHero
          scene="hq"
          headingId={HEADQUARTERS_HEADING_ID}
          title={t('headquarters.header.title')}
          note={t('headquarters.header.subtitle')}
        />
        <KairyaBubble />
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
