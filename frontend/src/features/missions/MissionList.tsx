import { useEffect, useImperativeHandle, type ReactElement, type Ref } from 'react'
import { MissionCard } from './MissionCard'
import { useCompletionRegistry, type CompletionRegistry } from './useCompletionRegistry'
import { useMissions, type MissionsState, type MoreMissionsState } from './useMissions'
import { LoadFailureMessage } from '../../shared/i18n/LoadFailureMessage'
import { useT } from '../../shared/i18n/useT'

/**
 * Os quatro estados da tela, um por ramo.
 *
 * O tipo de retorno `ReactElement` e declarado de proposito: com ele, um
 * estado novo em `MissionsState` torna o fim da funcao alcancavel e o `tsc`
 * reprova com "lacks ending return statement". Um `default` com mensagem
 * generica compilaria -- e engoliria o estado novo em silencio.
 */
function MissionsContent({
  state,
  more,
  registry,
  onReload,
  onLoadMore,
  reloadWaiting,
  onMissionCompleted,
}: {
  state: MissionsState
  more: MoreMissionsState
  registry: CompletionRegistry
  onReload: () => void
  onLoadMore: () => void
  reloadWaiting: boolean
  onMissionCompleted?: () => void
}): ReactElement {
  const t = useT()
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" data-testid="missions-loading" className="text-sm text-slate-400">
          {t('missions.list.loading')}
        </p>
      )

    // Vazio e erro sao telas DIFERENTES porque pedem acoes opostas: aqui a
    // leitura funcionou e o quadro esta vazio; no erro, nao se sabe o que ha
    // no quadro.
    case 'empty':
      return (
        <p data-testid="missions-empty" className="text-sm text-slate-300">
          {t('missions.list.empty')}
        </p>
      )

    case 'error':
      return (
        <div
          role="alert"
          data-testid="missions-error"
          className="rounded-lg border border-red-500/50 bg-red-950/40 p-4 text-sm text-red-200"
        >
          <p className="font-semibold">{t('missions.list.loadFailed')}</p>
          <p className="mt-1">
            <LoadFailureMessage
              failure={state.failure}
              unexpected="missions.list.unexpectedFailure"
            />
          </p>
          <button
            type="button"
            data-testid="missions-retry"
            onClick={onReload}
            className="mt-3 rounded border border-red-400/60 px-3 py-1 font-medium text-red-100 hover:bg-red-900/50 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none"
          >
            {t('missions.action.retryLoad')}
          </button>
        </div>
      )

    case 'loaded':
      return (
        // `role="list"` explicito num `<ul>` nao e redundancia. O preflight do
        // Tailwind aplica `list-style: none`, e o Safari com VoiceOver REMOVE a
        // role de lista quando o list-style e none: a lista deixa de ser
        // anunciada como lista e o leitor de tela perde a contagem de itens.
        //
        // Quem guarda este atributo e o teste de unidade -- e pela asseveracao
        // do ATRIBUTO, nao por `getByRole('list')`: medido, o jsdom computa a
        // role implicita do `<ul>` e a consulta por role passa mesmo sem o
        // atributo. O axe em Chromium tambem nao o acusa, porque o defeito e
        // do Safari. Ver MissionList.test.tsx.
        <>
          <ul role="list" data-testid="missions-list" className="flex flex-col gap-3">
            {state.missions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                registry={registry}
                onReload={onReload}
                reloadWaiting={reloadWaiting}
                onCompleted={onMissionCompleted}
                onRewarded={onMissionCompleted}
              />
            ))}
          </ul>
          <MoreMissions more={more} onLoadMore={onLoadMore} />
        </>
      )
  }
}

const LOAD_MORE_BUTTON =
  'mt-3 rounded border border-slate-500 px-3 py-1 text-sm font-medium text-slate-200 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70'

/**
 * O rodape da lista: pedir a pagina seguinte (#182). A falha daqui nao troca
 * a lista pelo erro -- as missoes ja carregadas continuam na tela, e so o
 * rodape avisa e oferece a nova tentativa.
 */
function MoreMissions({
  more,
  onLoadMore,
}: {
  more: MoreMissionsState
  onLoadMore: () => void
}): ReactElement | null {
  const t = useT()
  switch (more.status) {
    case 'none':
      return null

    case 'available':
      return (
        <button
          type="button"
          data-testid="missions-load-more"
          onClick={onLoadMore}
          className={LOAD_MORE_BUTTON}
        >
          {t('missions.list.loadMore')}
        </button>
      )

    // O botao fica no lugar, desabilitado, para o foco nao cair no `body`
    // enquanto a pagina chega.
    case 'loading':
      return (
        <button
          type="button"
          data-testid="missions-load-more"
          disabled
          aria-busy="true"
          className={LOAD_MORE_BUTTON}
        >
          {t('missions.list.loadingMore')}
        </button>
      )

    case 'error':
      return (
        <div
          role="alert"
          data-testid="missions-load-more-error"
          className="mt-3 rounded-lg border border-red-500/50 bg-red-950/40 p-4 text-sm text-red-200"
        >
          <p className="font-semibold">{t('missions.list.loadMoreFailed')}</p>
          <p className="mt-1">
            <LoadFailureMessage
              failure={more.failure}
              unexpected="missions.list.unexpectedFailure"
            />
          </p>
          <button
            type="button"
            data-testid="missions-load-more-retry"
            onClick={onLoadMore}
            className="mt-3 rounded border border-red-400/60 px-3 py-1 font-medium text-red-100 hover:bg-red-900/50 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none"
          >
            {t('missions.action.retryLoad')}
          </button>
        </div>
      )
  }
}

/**
 * O que a PAGINA pode pedir ao quadro: recarregar (1b-2, a missao criada pela
 * Kairya).
 *
 * Um `ref`, e nao um contador em prop observado por efeito: o efeito que chama
 * `setState` ao ver a prop mudar e o que o `react-hooks/set-state-in-effect`
 * reprova, e a recarga e um EVENTO (a confirmacao deu certo), nao um estado.
 */
export interface MissionListHandle {
  reload: () => void
}

/**
 * O quadro de missoes do Quartel-General.
 *
 * A feature busca os proprios dados e resolve os proprios estados; ela nao
 * conhece a pagina que a compoe. A ordem da lista e a que a API devolveu
 * (ordenada por prazo) -- reordenar aqui criaria uma segunda politica de
 * ordenacao para discordar da primeira.
 *
 * O registro das conclusoes (`useCompletionRegistry`) mora AQUI, e nao nos
 * cartoes: e o nivel que nao desmonta no reload. Todo pedido de recarga -- o
 * "Atualizar o quadro" de um cartao e o "Tentar novamente" do erro -- passa
 * por ele, e espera a conclusao em voo. A recarga pedida pela PAGINA (pelo
 * `ref`, quando a Kairya cria uma missao) tambem.
 *
 * `onMissionCompleted` e o que a PAGINA pede para saber de toda conclusao de
 * uma avulsa -- repassado a cada `MissionCard` como `onCompleted` (para
 * atualizar o painel de progresso) e como `onRewarded`
 * (incremento E: o bonus da avaliacao tambem muda o saldo). O quadro de avulsas
 * nao tem `refresh` proprio (ao contrario da `CycleSection`): a lista so
 * muda pelo `reload`/`requestReload` de sempre.
 */
export function MissionList({
  ref,
  onMissionCompleted,
}: {
  ref?: Ref<MissionListHandle>
  onMissionCompleted?: () => void
}) {
  const t = useT()
  const { state, more, reload, loadMore } = useMissions()
  const { registry, reload: requestReload, waitingForCompletion } = useCompletionRegistry(reload)
  // O `requestReload`, e nao o `reload` cru: com uma conclusao em voo, a
  // recarga pedida de fora ESPERA, como o "Atualizar o quadro" (Incremento A).
  useImperativeHandle(ref, () => ({ reload: requestReload }), [requestReload])

  useEffect(() => {
    if (state.status === 'loaded') {
      registry.reconcileCompleted(
        state.missions
          .filter((mission) => mission.state === 'concluida')
          .map((mission) => mission.id),
      )
    }
  }, [state, registry])

  return (
    <section aria-labelledby="missions-heading" data-testid="missions">
      <h2 id="missions-heading" className="mb-3 text-lg font-semibold text-slate-200">
        {t('missions.list.title')}
      </h2>
      {/* A regiao viva da espera existe desde o primeiro render, vazia, em
          todos os estados da lista: um leitor de tela so anuncia mudanca numa
          regiao que ja estava no documento. `sr-only` porque o texto visivel
          ja esta no botao; o anuncio e para quem nao o ve mudar. */}
      <p role="status" data-testid="missions-reload-status" className="sr-only">
        {waitingForCompletion ? t('missions.list.reloadWaiting') : ''}
      </p>
      <MissionsContent
        state={state}
        more={more}
        registry={registry}
        onReload={requestReload}
        onLoadMore={loadMore}
        reloadWaiting={waitingForCompletion}
        onMissionCompleted={onMissionCompleted}
      />
    </section>
  )
}
