import type { ReactElement } from 'react'
import { MISSION_STATE_LABELS, type Mission } from './types'
import { useCompleteMission, type CompletionState } from './useCompleteMission'
import { useCompletionRegistry, type CompletionRegistry } from './useCompletionRegistry'
import { useMissions, type MissionsState } from './useMissions'

/**
 * Formatador do prazo, criado UMA vez fora do componente.
 *
 * O prazo chega como string ISO com fuso, entao `new Date(...)` produz o
 * instante certo -- nunca se deve cortar a string na mao para formatar.
 *
 * O texto visivel sai em `America/Sao_Paulo`, e NAO no fuso de quem le: e o que
 * o README §8 manda ("apresente em America/Sao_Paulo") e o que a decisao A3 da
 * spec repete. Sem o `timeZone`, o `Intl` usaria o fuso do navegador, e a
 * mesma missao mostraria dias diferentes para quem estivesse fora de SP. O
 * instante original continua exposto no atributo `dateTime` do `<time>`.
 *
 * Quem guarda esta escolha e o teste de unidade com um instante em que SP e
 * UTC caem em dias diferentes, rodando com o processo fixado em `Asia/Tokyo`
 * (ver `vite.config.ts`) -- sem a fixacao, numa maquina em SP, o teste passaria
 * sem o `timeZone`.
 */
const deadlineFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const CARD_CLASS =
  'rounded-lg border border-slate-700/70 bg-slate-900/60 p-4 shadow-sm ' +
  'focus-within:ring-2 focus-within:ring-emerald-400'

const COMPLETE_BUTTON_CLASS =
  'rounded border border-emerald-400/60 px-3 py-1 text-sm font-medium text-emerald-100 ' +
  'hover:bg-emerald-900/50 focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const RELOAD_BUTTON_CLASS =
  'rounded border border-slate-400/60 px-3 py-1 text-sm font-medium text-slate-100 ' +
  'hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

/** O texto do "Atualizar o quadro" enquanto espera uma conclusao em voo. */
const RELOAD_WAITING_LABEL = 'Aguardando a conclusão em andamento…'

/** O que a regiao viva do quadro anuncia durante essa espera. */
const RELOAD_WAITING_ANNOUNCEMENT = 'Aguardando a conclusão em andamento para atualizar o quadro.'

/** O texto do botao de concluir em cada estado em que ele aparece. */
function completeLabel(completion: CompletionState): string {
  if (completion.status === 'submitting') {
    return 'Concluindo…'
  }
  return completion.status === 'failed' ? 'Tentar de novo' : 'Concluir'
}

/** O que a regiao viva anuncia. Vazio quando nao ha nada acontecendo. */
function statusText(completion: CompletionState): string {
  if (completion.status === 'submitting') {
    return 'Concluindo a missão…'
  }
  return completion.status === 'completed' ? 'Missão concluída.' : ''
}

/**
 * O botao Concluir e o que a tela diz durante e depois da conclusao.
 *
 * Cada estado, decidido de proposito:
 *
 * - **parado**: "Concluir", com o nome acessivel completando QUAL missao.
 * - **enviando**: o botao fica desabilitado e diz "Concluindo…", e a regiao
 *   viva anuncia. Desabilitar nao e so estetica: e o que impede o clique
 *   duplo de mandar dois pedidos.
 * - **concluida**: o botao some, porque `concluida` e terminal (A5), e a
 *   regiao viva anuncia "Missão concluída.". O rotulo de estado do cartao ja
 *   mostra a missao que a API devolveu.
 * - **falha que se repete** (rede, erro sem code, chave gasta): o aviso e o
 *   botao vira "Tentar de novo" -- com a mesma chave, ou com uma nova, quem
 *   decide e o hook.
 * - **falha que nao se repete** (ja concluida, nao existe mais): o aviso, e
 *   "Atualizar o quadro" no lugar do Concluir. Repetir so daria o mesmo erro;
 *   recarregar mostra o estado de verdade.
 * - **esperando o quadro**: "Atualizar o quadro" pedido com outra conclusao em
 *   voo fica desabilitado e diz "Aguardando a conclusão em andamento…"; o
 *   quadro recarrega sozinho quando ela termina (`useCompletionRegistry`). Quem
 *   anuncia a espera e a regiao viva do QUADRO, e nao a deste cartao: a espera
 *   e do quadro inteiro, e varios cartoes com o botao anunciariam o mesmo
 *   texto varias vezes.
 *
 * A regiao `role="status"` existe desde o primeiro render, vazia: um leitor de
 * tela so anuncia mudancas numa regiao viva que ja estava no documento.
 *
 * O nome acessivel do botao completa QUAL missao ele conclui, num `sr-only`:
 * com varias missoes no quadro, "Concluir" sozinho seria o mesmo nome em todos
 * os botoes. O espaco entre o rotulo e o `span` fica FORA dele, no `{' '}`:
 * escrito dentro do `span`, o calculo do nome acessivel do jsdom o descartava
 * e o nome saia "Concluira missão" (medido).
 */
function CompletionControls({
  mission,
  completion,
  onComplete,
  onReload,
  reloadWaiting,
}: {
  mission: Mission
  completion: CompletionState
  onComplete: () => void
  onReload: () => void
  reloadWaiting: boolean
}) {
  // Missao que ja veio concluida do quadro: nada a oferecer nem a anunciar. O
  // rotulo de estado ja diz "Concluída".
  if (mission.state === 'concluida' && completion.status === 'idle') {
    return null
  }

  const failure = completion.status === 'failed' ? completion.failure : null
  const canComplete = mission.state !== 'concluida' && failure?.recovery !== 'refresh'

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {canComplete && (
        <button
          type="button"
          data-testid="mission-complete"
          disabled={completion.status === 'submitting'}
          onClick={onComplete}
          className={COMPLETE_BUTTON_CLASS}
        >
          {completeLabel(completion)}{' '}
          <span className="sr-only">a missão: {mission.instructions}</span>
        </button>
      )}
      {failure?.recovery === 'refresh' && (
        <button
          type="button"
          data-testid="mission-reload"
          disabled={reloadWaiting}
          onClick={onReload}
          className={RELOAD_BUTTON_CLASS}
        >
          {reloadWaiting ? RELOAD_WAITING_LABEL : 'Atualizar o quadro'}
        </button>
      )}
      <p role="status" data-testid="mission-completion-status" className="text-sm text-emerald-300">
        {statusText(completion)}
      </p>
      {failure !== null && (
        <p
          role="alert"
          data-testid="mission-completion-error"
          className="w-full text-sm text-red-300"
        >
          {failure.message}
        </p>
      )}
    </div>
  )
}

function MissionCard({
  mission: listed,
  registry,
  onReload,
  reloadWaiting,
}: {
  mission: Mission
  registry: CompletionRegistry
  onReload: () => void
  reloadWaiting: boolean
}) {
  const { state: completion, complete } = useCompleteMission(listed.id, registry)
  // Depois do sucesso, o cartao mostra a missao que a API DEVOLVEU. Ela nao
  // fica velha: `concluida` e terminal (A5), e a proxima leitura do quadro --
  // o "Atualizar", ou o "Tentar novamente" da lista -- monta cartoes novos.
  const mission = completion.status === 'completed' ? completion.mission : listed

  return (
    <li data-testid="mission-item" data-mission-id={mission.id} className={CARD_CLASS}>
      <div className="flex items-start justify-between gap-4">
        <h3 data-testid="mission-instructions" className="text-base font-semibold text-slate-100">
          {mission.instructions}
        </h3>
        {/* O estado vem como rotulo em texto, nao como cor: o README §7 exige
            aviso alem da cor. */}
        <span
          data-testid="mission-state"
          className="shrink-0 rounded-full border border-emerald-400/50 px-2 py-0.5 text-xs font-medium text-emerald-300"
        >
          {MISSION_STATE_LABELS[mission.state]}
        </span>
      </div>

      <p data-testid="mission-completion-criterion" className="mt-2 text-sm text-slate-300">
        <span className="text-slate-400">Critério de conclusão: </span>
        {mission.completion_criterion}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-300 sm:grid-cols-4">
        <dt className="text-slate-400">Prazo</dt>
        <dd>
          <time data-testid="mission-deadline" dateTime={mission.deadline}>
            {deadlineFormatter.format(new Date(mission.deadline))}
          </time>
        </dd>

        <dt className="text-slate-400">Dificuldade</dt>
        {/* O "5" espelha `DIFICULDADE_MAXIMA`, em
            src/focusquest/modules/missions/schemas.py. Nada amarra os dois
            automaticamente (isso pediria gerar o tipo a partir do OpenAPI):
            quem mudar um tem de mudar o outro, e `types.ts` repete o teto. */}
        <dd data-testid="mission-difficulty">{mission.difficulty} de 5</dd>

        <dt className="text-slate-400">Estimativa</dt>
        <dd data-testid="mission-estimated-minutes">{mission.estimated_minutes} min</dd>

        <dt className="text-slate-400">Recompensa</dt>
        <dd data-testid="mission-xp">{mission.xp} XP</dd>

        {/* `actual_duration_minutes` e computado pela API e vem nulo enquanto
            faltar o inicio ou a conclusao. Nulo significa "ainda nao existe",
            e nao "zero minuto": mostrar "0 min" seria afirmar o que ninguem
            mediu. */}
        {mission.actual_duration_minutes !== null && (
          <>
            <dt className="text-slate-400">Duração real</dt>
            <dd data-testid="mission-actual-duration">{mission.actual_duration_minutes} min</dd>
          </>
        )}
      </dl>

      <CompletionControls
        mission={mission}
        completion={completion}
        onComplete={complete}
        onReload={onReload}
        reloadWaiting={reloadWaiting}
      />
    </li>
  )
}

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
  registry,
  onReload,
  reloadWaiting,
}: {
  state: MissionsState
  registry: CompletionRegistry
  onReload: () => void
  reloadWaiting: boolean
}): ReactElement {
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" data-testid="missions-loading" className="text-sm text-slate-400">
          Convocando as missões…
        </p>
      )

    // Vazio e erro sao telas DIFERENTES porque pedem acoes opostas: aqui a
    // leitura funcionou e o quadro esta vazio; no erro, nao se sabe o que ha
    // no quadro.
    case 'empty':
      return (
        <p data-testid="missions-empty" className="text-sm text-slate-300">
          Nenhuma missão no quadro. Peça uma nova campanha à Tifa para começar.
        </p>
      )

    case 'error':
      return (
        <div
          role="alert"
          data-testid="missions-error"
          className="rounded-lg border border-red-500/50 bg-red-950/40 p-4 text-sm text-red-200"
        >
          <p className="font-semibold">Falha ao carregar as missões.</p>
          <p className="mt-1">{state.message}</p>
          <button
            type="button"
            data-testid="missions-retry"
            onClick={onReload}
            className="mt-3 rounded border border-red-400/60 px-3 py-1 font-medium text-red-100 hover:bg-red-900/50 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none"
          >
            Tentar novamente
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
        <ul role="list" data-testid="missions-list" className="flex flex-col gap-3">
          {state.missions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              registry={registry}
              onReload={onReload}
              reloadWaiting={reloadWaiting}
            />
          ))}
        </ul>
      )
  }
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
 * por ele, e espera a conclusao em voo.
 */
export function MissionList() {
  const { state, reload } = useMissions()
  const { registry, reload: requestReload, waitingForCompletion } = useCompletionRegistry(reload)

  return (
    <section aria-labelledby="missions-heading" data-testid="missions">
      <h2 id="missions-heading" className="mb-3 text-lg font-semibold text-slate-200">
        Missões — tarefas com prazo
      </h2>
      {/* A regiao viva da espera existe desde o primeiro render, vazia, em
          todos os estados da lista: um leitor de tela so anuncia mudanca numa
          regiao que ja estava no documento. `sr-only` porque o texto visivel
          ja esta no botao; o anuncio e para quem nao o ve mudar. */}
      <p role="status" data-testid="missions-reload-status" className="sr-only">
        {waitingForCompletion ? RELOAD_WAITING_ANNOUNCEMENT : ''}
      </p>
      <MissionsContent
        state={state}
        registry={registry}
        onReload={requestReload}
        reloadWaiting={waitingForCompletion}
      />
    </section>
  )
}
