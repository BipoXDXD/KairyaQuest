import { useCallback, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Area } from './app/areas'
import { SideNav } from './app/SideNav'
import { SoundInvite } from './shared/audio/SoundInvite'
import { useAudio } from './shared/audio/useAudio'
import { Campaigns } from './pages/Campaigns'
import { Headquarters } from './pages/Headquarters'
import { CAMPAIGNS_HEADING_ID, HEADQUARTERS_HEADING_ID } from './pages/headings'

const HEADING_OF: Record<Area, string> = {
  headquarters: HEADQUARTERS_HEADING_ID,
  campaigns: CAMPAIGNS_HEADING_ID,
}

/**
 * Raiz da aplicacao -- e o roteador dela.
 *
 * O README §3 pede "evite `App.tsx` gigante", e o `docs/ARCHITECTURE.md` §5
 * regra 6 diz o que entra aqui quando houver mais de uma tela: um roteador,
 * nao o conteudo da segunda tela. E isto: a area ativa como estado local
 * (spec do ciclo diario, C15 -- sem biblioteca de rotas), a navegacao e as
 * paginas. O conteudo de cada area mora na pagina dela.
 *
 * As duas areas nao se comportam igual, de proposito (decisao K2 do plano
 * do C): o Quartel-General fica MONTADO e oculto enquanto Campanhas esta
 * aberta, porque desmonta-lo levaria junto o painel da Kairya -- o rascunho e
 * o stream em andamento, que o backend gravaria como `interrompida`.
 * Campanhas, ao contrario, desmonta ao sair: cada abertura busca a trilha de
 * novo.
 */
function App() {
  const [area, setArea] = useState<Area>('headquarters')
  const { stopVoice } = useAudio()
  const navigate = useCallback(
    (next: Area) => {
      // A bolha do Quartel-General segue montada (oculta) na troca de área, então
      // só aqui a fala em curso pode ser cortada; ao voltar, a mesma fala não repete.
      stopVoice()
      // `flushSync`: o titulo da area aberta tem de estar no DOM (e visivel)
      // antes do foco. O foco no titulo e o que anuncia a troca de area ao
      // leitor de tela -- a URL e o documento nao mudam (decisao K5). O `!`: os
      // dois titulos existem assim que a area deles e a ativa.
      flushSync(() => {
        setArea(next)
      })
      document.getElementById(HEADING_OF[next])!.focus()
    },
    [stopVoice],
  )
  return (
    <div className="min-h-screen bg-bg-canvas text-text-primary lg:flex">
      <SideNav active={area} onNavigate={navigate} />
      <div className="min-w-0 flex-1">
        <SoundInvite />
        <Headquarters hidden={area !== 'headquarters'} />
        {area === 'campaigns' && (
          <Campaigns
            onOpenHeadquarters={() => {
              navigate('headquarters')
            }}
          />
        )}
      </div>
    </div>
  )
}

export default App
