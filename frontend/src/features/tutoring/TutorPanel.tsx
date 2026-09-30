import { useRef, useState, type KeyboardEvent } from 'react'
import { announceAnswer } from './answerOutcome'
import { readPanelOpen, writePanelOpen } from './panelPreference'
import { ProposalCard } from './ProposalCard'
import { TutorConversation } from './TutorConversation'
import { useActionKeys } from './useActionKeys'
import { useIsDesktop } from './useIsDesktop'
import { useTutorConversation, type SendState } from './useTutorConversation'
import { useTutorStatus } from './useTutorStatus'

/**
 * O que a regiao viva anuncia: o INICIO e o FIM da resposta, e nao cada
 * palavra (spec, estado "Escrevendo"). Uma regiao que mudasse a cada `delta`
 * faria o leitor de tela recitar o texto aos pedacos, atropelando a si mesmo.
 * A falha e anunciada pelo `role="alert"` da propria conversa; o fim de uma
 * resposta cortada, com texto proprio (`announceAnswer`, pendencia 121).
 */
function liveText(send: SendState): string {
  if (send.status === 'sending' || send.status === 'writing') {
    return 'Tifa está escrevendo…'
  }
  return send.status === 'idle' && send.answer !== null ? announceAnswer(send.answer) : ''
}

/** Retrato PLACEHOLDER: iniciais em verde, nenhum asset dos jogos (README §7). */
function Portrait() {
  return (
    <span
      data-testid="tutor-portrait"
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white"
    >
      TL
    </span>
  )
}

/** Os elementos focaveis da folha, na ordem do documento. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])'),
  )
}

/**
 * O painel da Tifa no Quartel-General.
 *
 * Os DOIS hooks moram aqui, acima dos conteineres: no desktop a conversa e
 * uma coluna lateral expansivel; no celular, uma folha modal aberta por um
 * botao fixo. Trocar de layout remonta o conteiner, e o rascunho e o stream
 * sobrevivem porque nao moram nele.
 *
 * A regiao viva tambem mora aqui, FORA dos conteineres: ela existe desde o
 * primeiro render e continua no documento com o painel recolhido ou a folha
 * fechada -- um leitor de tela so anuncia mudanca numa regiao que ja estava
 * la.
 */
export function TutorPanel({
  onMissionCreated,
  boardHref,
}: {
  /** Uma proposta foi confirmada: a pagina recarrega o quadro. */
  onMissionCreated: () => void
  /** O endereco do quadro na pagina. A feature nao sabe onde ele mora. */
  boardHref: string
}) {
  const isDesktop = useIsDesktop()
  const { state: status, reload: reloadStatus } = useTutorStatus()
  const conversation = useTutorConversation()
  // As chaves de confirmacao, tambem aqui em cima: a recarga da conversa
  // remonta os cartoes, e a chave de um resultado desconhecido tem de voltar
  // no reenvio (pendencia 35).
  const keys = useActionKeys()
  const [desktopOpen, setDesktopOpen] = useState(readPanelOpen)
  const [sheetOpen, setSheetOpen] = useState(false)
  const openButton = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const sheetClose = useRef<HTMLButtonElement>(null)

  const toggleDesktop = () => {
    const next = !desktopOpen
    setDesktopOpen(next)
    writePanelOpen(next)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    // O foco volta a quem abriu: sem isto ele cairia no `body` e quem usa
    // teclado recomecaria do topo da pagina.
    queueMicrotask(() => openButton.current?.focus())
  }

  const onSheetKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      closeSheet()
      return
    }
    if (event.key !== 'Tab') {
      return
    }
    // A folha e modal: o Tab da volta dentro dela, em vez de sair para a
    // pagina que ela cobre. Esc e "Fechar a conversa" saem -- o teclado nao
    // fica preso (README §7).
    const items = focusables(event.currentTarget)
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  const body = (
    <TutorConversation
      conversation={conversation}
      status={status}
      onReloadStatus={reloadStatus}
      renderAction={(action) => (
        <ProposalCard
          action={action}
          keys={keys}
          onChanged={conversation.updateAction}
          onMissionCreated={onMissionCreated}
          onRefresh={conversation.reloadHistory}
          boardHref={boardHref}
          // No celular a folha cobre o quadro: seguir o link sem fecha-la
          // levaria a pessoa a um lugar que ela nao ve.
          onGoToBoard={isDesktop ? undefined : closeSheet}
        />
      )}
      inputRef={input}
    />
  )

  return (
    <aside aria-label="Tifa" data-testid="tutor-panel" className="lg:border-l lg:border-slate-800">
      <p role="status" data-testid="tutor-live" className="sr-only">
        {liveText(conversation.send)}
      </p>

      {isDesktop ? (
        <div className={`flex h-screen flex-col gap-3 p-4 ${desktopOpen ? 'w-96' : 'w-20'}`}>
          <header className="flex items-center gap-3">
            <Portrait />
            {desktopOpen && (
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-50">Tifa</h2>
                <p className="text-xs text-slate-400">sua tutora</p>
              </div>
            )}
            <button
              type="button"
              data-testid="tutor-panel-toggle"
              aria-expanded={desktopOpen}
              aria-controls="tutor-panel-body"
              onClick={toggleDesktop}
              className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
            >
              {desktopOpen ? 'Recolher o painel da Tifa' : 'Abrir o painel da Tifa'}
            </button>
          </header>
          {desktopOpen && (
            <div id="tutor-panel-body" className="flex min-h-0 flex-1 flex-col">
              {body}
            </div>
          )}
        </div>
      ) : (
        <>
          {!sheetOpen && (
            <button
              ref={openButton}
              type="button"
              data-testid="tutor-sheet-open"
              aria-expanded={false}
              aria-controls="tutor-sheet"
              onClick={() => {
                setSheetOpen(true)
                // O foco entra na folha, no campo. Com o campo desabilitado (Tifa
                // fora do ar, status ainda carregando), `focus()` nao faz nada e o
                // foco ficaria no `body`, atras de um dialogo modal: vai para o
                // "Fechar a conversa". Os dois existem: a folha acabou de abrir.
                queueMicrotask(() => {
                  const field = input.current!
                  ;(field.disabled ? sheetClose.current! : field).focus()
                })
              }}
              className="fixed right-4 bottom-4 z-20 flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-lg focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
            >
              <Portrait />
              Falar com a Tifa
            </button>
          )}
          {sheetOpen && (
            <>
              <div
                aria-hidden="true"
                className="fixed inset-0 z-30 bg-black/60"
                onClick={closeSheet}
              />
              <div
                id="tutor-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tutor-sheet-title"
                data-testid="tutor-sheet"
                onKeyDown={onSheetKeyDown}
                className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col gap-3 rounded-t-2xl bg-slate-950 p-4"
              >
                <header className="flex items-center gap-3">
                  <Portrait />
                  <h2 id="tutor-sheet-title" className="flex-1 text-lg font-semibold text-slate-50">
                    Tifa
                  </h2>
                  <button
                    ref={sheetClose}
                    type="button"
                    data-testid="tutor-sheet-close"
                    onClick={closeSheet}
                    className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
                  >
                    Fechar a conversa
                  </button>
                </header>
                {body}
              </div>
            </>
          )}
        </>
      )}
    </aside>
  )
}
