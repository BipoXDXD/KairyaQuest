import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { announceAnswer } from './answerOutcome'
import { readPanelOpen, writePanelOpen } from './panelPreference'
import { ProposalCard } from './ProposalCard'
import { TutorConversation } from './TutorConversation'
import { useActionKeys } from './useActionKeys'
import { useIsDesktop } from './useIsDesktop'
import { useTutorConversation, type SendState } from './useTutorConversation'
import { useTutorStatus } from './useTutorStatus'
import type { MessageKey } from '../../shared/i18n/catalog'
import { useT } from '../../shared/i18n/useT'
import { ART, Button, IconButton, Panel } from '../../shared/ui'

/**
 * O que a regiao viva anuncia: o INICIO e o FIM da resposta, e nao cada
 * palavra (spec, estado "Escrevendo"). Uma regiao que mudasse a cada `delta`
 * faria o leitor de tela recitar o texto aos pedacos, atropelando a si mesmo.
 * A falha e anunciada pelo `role="alert"` da propria conversa; o fim de uma
 * resposta cortada, com texto proprio (`announceAnswer`, pendencia 121).
 */
function liveText(send: SendState): MessageKey | null {
  if (send.status === 'sending' || send.status === 'writing') {
    return 'tutoring.writing'
  }
  return send.status === 'idle' && send.answer !== null ? announceAnswer(send.answer) : null
}

/**
 * As duas versões do retrato, com as dimensões reais de cada arquivo para
 * reservar o espaço antes do download (procedência em docs/ART.md).
 *
 * As duas são decorativas (`alt=""`, moldura `aria-hidden`): o nome "Kairya"
 * já está no painel, no título da folha e no botão "Falar com a Kairya", e um
 * texto alternativo só o repetiria -- dentro do botão, mudaria até o nome
 * acessível dele.
 */
const PORTRAITS = {
  scene: {
    src: ART.kairya.portrait,
    width: 864,
    height: 1152,
    frame: 'relative block h-40 w-full shrink-0 overflow-hidden rounded-ui',
    image: 'size-full object-contain object-top',
  },
  compact: {
    src: ART.kairya.avatar,
    width: 128,
    height: 160,
    frame:
      'block size-10 shrink-0 overflow-hidden rounded-pill border border-action-primary bg-bg-surface',
    image: 'size-full object-cover object-top',
  },
} as const

function Portrait({ scene }: { scene: boolean }) {
  const size = scene ? 'scene' : 'compact'
  const art = PORTRAITS[size]
  return (
    <span data-testid="tutor-portrait" aria-hidden="true" data-size={size} className={art.frame}>
      <img
        src={art.src}
        alt=""
        width={art.width}
        height={art.height}
        decoding="async"
        className={art.image}
      />
    </span>
  )
}

/** A seta do recolher (para a borda) e do abrir (para o conteúdo). */
function Chevron({ toward }: { toward: 'edge' | 'content' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={toward === 'edge' ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
    </svg>
  )
}

/** Os elementos focaveis da folha, na ordem do documento. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, textarea, a[href], [tabindex]'),
  ).filter((item) => item.tabIndex >= 0 && !item.matches(':disabled'))
}

/**
 * O painel da Kairya no Quartel-General.
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
 *
 * No desktop o `aside` e um `Panel` com a luz da lanterna quando aberto; no
 * celular, um `aside` sem moldura, porque o botao e a folha sao fixos e uma
 * caixa com borda ficaria vazia no fluxo da pagina. Por isso a troca de layout
 * remonta o `aside` inteiro, regiao viva inclusive (antes so o conteudo
 * remontava).
 */
export function TutorPanel({
  onMissionCreated,
  boardHref,
  hidden = false,
}: {
  /** Uma proposta foi confirmada: a pagina recarrega o quadro. */
  onMissionCreated: () => void
  /** O endereco do quadro na pagina. A feature nao sabe onde ele mora. */
  boardHref: string
  /** A página conserva a conversa montada ao navegar para outra área. */
  hidden?: boolean
}) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const { state: status, reload: reloadStatus } = useTutorStatus()
  const conversation = useTutorConversation()
  // As chaves de confirmacao, tambem aqui em cima: a recarga da conversa
  // remonta os cartoes, e a chave de um resultado desconhecido tem de voltar
  // no reenvio (pendencia 35).
  const keys = useActionKeys()
  const [desktopOpen, setDesktopOpen] = useState(readPanelOpen)
  const [sheetOpen, setSheetOpen] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const desktopToggle = useRef<HTMLButtonElement>(null)
  const layout = useRef<HTMLDivElement | null>(null)
  const transferFocus = useRef(false)
  // O callback roda antes da remoção da subtree: depois dela activeElement
  // já seria BODY, sem distinguir conversa de foco em outro recurso.
  const captureLayout = useCallback((node: HTMLDivElement | null) => {
    if (node === null) {
      transferFocus.current = layout.current!.contains(document.activeElement)
    }
    layout.current = node
  }, [])
  const openButton = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const sheetClose = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    const transfer = transferFocus.current
    transferFocus.current = false
    // Uma folha lembrada dentro do QG oculto não é um modal ativo.
    if (hidden) {
      return
    }
    if (isDesktop || !sheetOpen) {
      if (transfer) {
        const field = input.current
        const target = isDesktop
          ? field !== null && !field.disabled
            ? field
            : desktopToggle.current!
          : openButton.current!
        target.focus()
      }
      return
    }

    const sheet = document.getElementById('tutor-sheet')!
    const focusSheet = () => {
      const field = input.current!
      ;(field.disabled ? sheetClose.current! : field).focus()
    }
    // Isola irmãos em cada nível, nunca um ancestral da própria folha.
    // A região viva, a folha e o backdrop ficam disponíveis dentro do aside.
    const background: [Element, string | null][] = []
    let branch: Element = panel.current!
    while (branch !== document.body) {
      const parent = branch.parentElement!
      for (const sibling of parent.children) {
        if (sibling !== branch) {
          background.push([sibling, sibling.getAttribute('inert')])
          sibling.setAttribute('inert', '')
        }
      }
      branch = parent
    }
    const containFocus = () => {
      if (!sheet.contains(document.activeElement)) {
        focusSheet()
      }
    }
    document.addEventListener('focusin', containFocus)
    focusSheet()
    return () => {
      document.removeEventListener('focusin', containFocus)
      for (const [element, previous] of background) {
        if (previous === null) {
          element.removeAttribute('inert')
        } else {
          element.setAttribute('inert', previous)
        }
      }
    }
  }, [isDesktop, sheetOpen, hidden])

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

  const live = liveText(conversation.send)
  const toggleLabel = t(desktopOpen ? 'tutoring.panel.collapse' : 'tutoring.panel.expand')

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

  const liveRegion = (
    <p role="status" data-testid="tutor-live" className="sr-only">
      {live === null ? '' : t(live)}
    </p>
  )

  if (isDesktop) {
    return (
      <div
        className={`sticky top-0 grid h-dvh shrink-0 grid-rows-1 self-start ${desktopOpen ? 'w-80 p-4 xl:w-90' : 'w-24 p-2'}`}
      >
        <Panel
          as="aside"
          ref={panel}
          aria-label={t('tutoring.name')}
          glow={desktopOpen}
          data-testid="tutor-panel"
        >
          {liveRegion}
          <div
            key="desktop"
            ref={captureLayout}
            className={`flex h-full min-h-0 flex-col gap-3 ${desktopOpen ? '' : 'items-center'}`}
          >
            <Portrait scene={desktopOpen} />
            <header
              className={`flex gap-3 ${desktopOpen ? 'items-start' : 'flex-col items-center'}`}
            >
              {desktopOpen && (
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl text-text-primary">{t('tutoring.name')}</h2>
                  <p className="text-sm text-text-muted">{t('tutoring.panel.subtitle')}</p>
                </div>
              )}
              <IconButton
                ref={desktopToggle}
                data-testid="tutor-panel-toggle"
                label={toggleLabel}
                title={toggleLabel}
                expanded={desktopOpen}
                controls="tutor-panel-body"
                onClick={toggleDesktop}
                icon={<Chevron toward={desktopOpen ? 'edge' : 'content'} />}
              />
            </header>
            {desktopOpen && (
              <div id="tutor-panel-body" className="flex min-h-0 flex-1 flex-col">
                {body}
              </div>
            )}
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <aside ref={panel} aria-label={t('tutoring.name')} data-testid="tutor-panel">
      {liveRegion}
      <div key="mobile" ref={captureLayout}>
        {!sheetOpen && (
          <div className="fixed right-4 bottom-4 z-20">
            <Button
              ref={openButton}
              variant="primary"
              data-testid="tutor-sheet-open"
              aria-expanded={false}
              aria-controls="tutor-sheet"
              onClick={() => setSheetOpen(true)}
            >
              <Portrait scene={false} />
              {t('tutoring.panel.openSheet')}
            </Button>
          </div>
        )}
        {sheetOpen && (
          <>
            <div
              aria-hidden="true"
              className="fixed inset-0 z-30 bg-bg-canvas/80"
              onClick={closeSheet}
            />
            <div
              id="tutor-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tutor-sheet-title"
              data-testid="tutor-sheet"
              onKeyDown={onSheetKeyDown}
              className="fixed inset-x-0 top-16 bottom-0 z-40 flex flex-col gap-3 rounded-t-ui border-t border-border-subtle bg-bg-surface p-4 text-text-primary"
            >
              <header className="flex items-center gap-3">
                <Portrait scene={false} />
                <h2 id="tutor-sheet-title" className="flex-1 text-2xl text-text-primary">
                  {t('tutoring.name')}
                </h2>
                <Button ref={sheetClose} data-testid="tutor-sheet-close" onClick={closeSheet}>
                  {t('tutoring.panel.closeSheet')}
                </Button>
              </header>
              {body}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
