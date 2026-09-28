import type { ReactElement } from 'react'
import type {
  EvaluationSummary,
  Evidence,
  Mission,
  Verdict,
  Verification,
} from '../../shared/types/mission'
import type { Reward } from '../../shared/types/reward'
import { describeEvaluationErrorCode, type EvaluationFailure } from './evaluationFailure'
import { RELOAD_WAITING_LABEL } from './reloadWaiting'
import { RewardAnnouncement } from './RewardAnnouncement'
import { useRequestEvaluation, type EvaluationRequestState } from './useRequestEvaluation'

/** O rotulo fixo de toda avaliacao concluida (README §5: o modelo interpreta). */
const MODEL_LABEL = 'Avaliação da Tifa — interpretação do modelo, não verificação automática'

/**
 * O que vira ancora: so `http`/`https`, sem diferenciar maiusculas (EM2). O
 * backend ja recusa o resto (E3), mas um dado vindo de uma API defasada nao
 * pode transformar `javascript:` num link clicavel -- por isso a guarda mora
 * TAMBEM aqui, onde o `href` nasce.
 */
const LINK_SCHEME = /^https?:\/\//i

const REQUEST_BUTTON_CLASS =
  'rounded border border-sky-400/60 px-3 py-1 text-sm font-medium text-sky-100 ' +
  'hover:bg-sky-900/50 focus-visible:ring-2 focus-visible:ring-sky-300 ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

/** O selo da verificacao, sempre em texto (E4). Exaustivo sobre o tipo. */
const VERIFICATION_LABELS: Record<Verification, string> = {
  autodeclarada: 'Autodeclarada',
  com_evidencia: 'Com evidência',
}

function VerdictIcon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d={d} />
    </svg>
  )
}

/**
 * Como cada veredito aparece: TEXTO e icone (README §7: aviso alem da cor --
 * quem informa e o `label`; o icone, `aria-hidden`, so reforca). O
 * `Record<Verdict, ...>` e exaustivo: um veredito novo no contrato reprova o
 * `tsc` aqui, em vez de aparecer cru na tela. Tracos 24x24 desenhados a mao,
 * como os de `features/campaigns/availability.ts` (tecnica copiada, nao
 * importada: features nao se importam).
 */
const VERDICT_DISPLAY: Record<Verdict, { label: string; icon: ReactElement; tone: string }> = {
  atende: {
    label: 'Critério atendido',
    icon: <VerdictIcon d="M5 12l5 5L20 7" />,
    tone: 'text-emerald-200',
  },
  parcial: {
    label: 'Atendido em parte',
    icon: <VerdictIcon d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 3v18" />,
    tone: 'text-amber-200',
  },
  nao_atende: {
    label: 'Critério não atendido',
    icon: <VerdictIcon d="M6 6l12 12M18 6L6 18" />,
    tone: 'text-red-300',
  },
}

/**
 * O que o painel mostra da avaliacao, decidido num lugar so.
 *
 * - `none`: nada avaliado ainda (ou um resumo que nao se sustenta): pedir.
 * - `requesting`: o pedido esta no ar.
 * - `in_progress`: a API diz `avaliando` -- outra aba, ou uma tentativa orfa.
 *   O botao continua habilitado: o backend retoma a orfa, ou responde
 *   `avaliacao_em_andamento`, que tem mensagem propria.
 * - `failed`: a falha do pedido, ou a `falhou` gravada, pelo MESMO mapa.
 * - `concluded`: o veredito. `fresh` diz se ele veio da resposta agora (a
 *   regiao viva anuncia) ou da leitura da missao; `reward` so vem na resposta
 *   que acabou de creditar o bonus (EM1).
 */
type EvaluationView =
  | { kind: 'none' }
  | { kind: 'requesting' }
  | { kind: 'in_progress' }
  | { kind: 'failed'; failure: EvaluationFailure; fresh: boolean }
  | ConcludedView

interface ConcludedView {
  kind: 'concluded'
  verdict: Verdict
  feedback: string | null
  fresh: boolean
  reward: Reward | null
}

function viewOfSummary(
  summary: EvaluationSummary | null,
  fresh: boolean,
  reward: Reward | null,
): EvaluationView {
  // `== null` de proposito: uma API anterior ao E nem manda a chave.
  if (summary == null) {
    return { kind: 'none' }
  }
  switch (summary.state) {
    case 'concluida':
      // Concluida sem veredito e contrato violado: melhor deixar pedir de novo
      // (o backend devolve a avaliacao de verdade) do que inventar um.
      return summary.verdict === null
        ? { kind: 'none' }
        : { kind: 'concluded', verdict: summary.verdict, feedback: summary.feedback, fresh, reward }
    case 'avaliando':
      return { kind: 'in_progress' }
    case 'falhou':
      return { kind: 'failed', failure: describeEvaluationErrorCode(summary.error_code), fresh }
  }
}

/** A resposta do pedido, quando ha, vale mais que a leitura da missao. */
function currentView(
  stored: EvaluationSummary | null,
  request: EvaluationRequestState,
): EvaluationView {
  switch (request.status) {
    case 'idle':
      return viewOfSummary(stored, false, null)
    case 'requesting':
      return { kind: 'requesting' }
    case 'done':
      return viewOfSummary(request.result.evaluation, true, request.result.reward ?? null)
    case 'failed':
      return { kind: 'failed', failure: request.failure, fresh: true }
  }
}

/** O que a regiao viva anuncia. Vazio quando nao ha nada acontecendo agora. */
function statusText(view: EvaluationView): string {
  if (view.kind === 'requesting') {
    return 'A Tifa está avaliando…'
  }
  return view.kind === 'concluded' && view.fresh
    ? `Avaliação concluída: ${VERDICT_DISPLAY[view.verdict].label}.`
    : ''
}

function EvidenceLink({ link }: { link: string }) {
  return (
    <p data-testid="evaluation-evidence-link" className="mt-1 text-sm break-all text-slate-300">
      <span className="text-slate-400">Link: </span>
      {LINK_SCHEME.test(link) ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-300 underline underline-offset-2 hover:text-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
        >
          {link}
          <span className="sr-only"> (abre em nova aba)</span>
        </a>
      ) : (
        link
      )}
    </p>
  )
}

function ConcludedEvaluation({ view }: { view: ConcludedView }) {
  const { label, icon, tone } = VERDICT_DISPLAY[view.verdict]
  return (
    <div className="mt-2 flex flex-col gap-1 text-sm">
      <p
        data-testid="evaluation-verdict"
        data-verdict={view.verdict}
        className={`inline-flex items-center gap-1 font-semibold ${tone}`}
      >
        {icon}
        <span>{label}</span>
      </p>
      <p data-testid="evaluation-feedback" className="whitespace-pre-line text-slate-200">
        {view.feedback}
      </p>
      <p data-testid="evaluation-label" className="text-xs text-slate-400">
        {MODEL_LABEL}
      </p>
      {/* EM1: sem `reward` (a leitura depois de recarregar, ou a resposta
          idempotente de uma avaliacao ja concluida) nao ha o numero; o saldo
          esta no painel de progresso. Com `reward`, quem fala e o anuncio. */}
      {view.verdict === 'atende' && view.reward === null && (
        <p data-testid="evaluation-bonus-credited" className="text-emerald-200">
          Bônus de XP creditado ao seu saldo.
        </p>
      )}
    </div>
  )
}

/**
 * A evidencia entregue e a avaliacao da Tifa sobre ela.
 *
 * A regiao `role="status"` existe desde o primeiro render, vazia (P4 do D), e
 * o `RewardAnnouncement` do bonus mora DENTRO dela, como o da conclusao.
 *
 * O botao some so quando repetir nao tem sentido: avaliacao concluida (E8) ou
 * falha que pede atualizar. Na falha `unavailable` (503) ele fica HABILITADO
 * (E18: "fica sempre habilitado"; o 503 vira mensagem): desabilitar o mataria
 * ate remontar o cartao, mesmo com a chave configurada depois (M3 da revisao).
 */
function EvidenceAndEvaluation({
  mission,
  evidence,
  onRewarded,
  onReload,
  reloadLabel,
  reloadWaiting,
  describedBy,
}: {
  mission: Mission
  evidence: Evidence
  onRewarded?: () => void
  onReload?: () => void
  reloadLabel: string
  reloadWaiting: boolean
  describedBy?: string
}) {
  const { state: request, request: requestEvaluation } = useRequestEvaluation(
    mission.id,
    onRewarded,
  )
  const view = currentView(mission.evaluation, request)
  const failure = view.kind === 'failed' ? view.failure : null
  const canRequest = view.kind !== 'concluded' && failure?.recovery !== 'refresh'

  return (
    <div className="mt-2">
      <p
        data-testid="evaluation-evidence-text"
        className="text-sm whitespace-pre-line text-slate-200"
      >
        {evidence.text}
      </p>
      {evidence.link !== null && <EvidenceLink link={evidence.link} />}

      {view.kind === 'concluded' && <ConcludedEvaluation view={view} />}
      {view.kind === 'in_progress' && (
        <p data-testid="evaluation-in-progress" className="mt-2 text-sm text-slate-300">
          Avaliação em andamento
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {canRequest && (
          <button
            type="button"
            data-testid="evaluation-request"
            disabled={view.kind === 'requesting'}
            onClick={requestEvaluation}
            aria-describedby={describedBy}
            className={REQUEST_BUTTON_CLASS}
          >
            {failure?.recovery === 'retry' ? 'Tentar de novo' : 'Pedir avaliação da Tifa'}
          </button>
        )}
        {failure?.recovery === 'refresh' && onReload !== undefined && (
          <button
            type="button"
            data-testid="evaluation-reload"
            disabled={reloadWaiting}
            onClick={onReload}
            className={REQUEST_BUTTON_CLASS}
          >
            {reloadWaiting ? RELOAD_WAITING_LABEL : reloadLabel}
          </button>
        )}
        <div role="status" data-testid="evaluation-status" className="text-sm text-sky-200">
          <p data-testid="evaluation-status-text">{statusText(view)}</p>
          {view.kind === 'concluded' && view.reward !== null && (
            <RewardAnnouncement reward={view.reward} bonus />
          )}
        </div>
        {failure !== null && (
          // `alert` so na falha FRESCA (o pedido que a pessoa acabou de fazer).
          // A gravada, lida com a pagina, e texto comum: com varias missoes
          // falhadas, cada cartao anunciaria um evento que nao e novo (M2).
          <p
            role={view.kind === 'failed' && view.fresh ? 'alert' : undefined}
            data-testid="evaluation-error"
            className="w-full text-sm text-red-300"
          >
            {failure.message}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * O painel do cartao concluido: o selo da verificacao e, com evidencia, a
 * evidencia e a avaliacao da Tifa (E4, E5, E18).
 *
 * Sem `verification` (uma API anterior ao incremento E) nao ha o que dizer, e
 * o painel nao aparece. Autodeclarada mostra so o selo: nao ha o que avaliar,
 * e o botao que o backend recusaria com `sem_evidencia` nem nasce.
 *
 * `onRewarded` e o mesmo aviso da conclusao (P3 do D): o bonus mexe no saldo,
 * e a pagina atualiza o painel de progresso em silencio.
 *
 * `onReload` e o mesmo recarregamento que a falha de conclusao usa: a falha
 * `refresh` da avaliacao manda atualizar, e o painel oferece o botao.
 * `reloadWaiting` e o mesmo estado do botao da conclusao: com uma conclusao em
 * voo, recarregar agora a atropelaria, entao o botao fica desabilitado e diz a
 * mesma espera (MF2).
 * `describedBy` e o id do titulo da missao, que descreve o "Pedir avaliação
 * da Tifa" sem mudar o nome exato dele.
 */
export function EvaluationPanel({
  mission,
  onRewarded,
  onReload,
  reloadLabel = 'Atualizar o quadro',
  reloadWaiting = false,
  describedBy,
}: {
  mission: Mission
  onRewarded?: () => void
  onReload?: () => void
  reloadLabel?: string
  reloadWaiting?: boolean
  describedBy?: string
}) {
  // `== null` de proposito: uma API anterior ao E nem manda as chaves.
  if (mission.verification == null) {
    return null
  }
  return (
    // Um `div`, e nao `section` rotulada: com varios cartoes, seriam varias
    // regioes de mesmo nome (o `landmark-unique` do axe).
    <div data-testid="evaluation-panel" className="mt-3 border-t border-slate-700/70 pt-3">
      <span
        data-testid="evaluation-verification"
        className="inline-block rounded-full border border-slate-400/50 px-2 py-0.5 text-xs font-medium text-slate-200"
      >
        {VERIFICATION_LABELS[mission.verification]}
      </span>
      {mission.evidence != null && (
        <EvidenceAndEvaluation
          mission={mission}
          evidence={mission.evidence}
          onRewarded={onRewarded}
          onReload={onReload}
          reloadLabel={reloadLabel}
          reloadWaiting={reloadWaiting}
          describedBy={describedBy}
        />
      )}
    </div>
  )
}
