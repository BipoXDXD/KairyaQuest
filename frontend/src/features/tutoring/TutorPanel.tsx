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
import { useAudio } from '../../shared/audio/useAudio'
import { useT } from '../../shared/i18n/useT'
import { Button } from '../../shared/ui'
import { KairyaFace, useKairya } from '../kairya'
import { useTutorPresence } from './useTutorPresence'

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
 * O avatar compacto, com as dimensões reais do arquivo para reservar o espaço
 * antes do download (procedência em docs/ART.md). É decorativo (`alt=""`): ele
 * aparece no painel recolhido (rotulado "Kairya"), ao lado do título da folha
 * ou dentro do botão "Falar com a Kairya", e um texto alternativo ali repetiria
 * o nome e mudaria o nome acessível do botão.
 */
const COMPACT_AVATAR = { src: '/art/kairya/avatar.webp', width: 128, height: 160 } as const

/** O retrato aberto é o rosto com a expressão do momento; o compacto fica fixo. */
function Portrait({ scene }: { scene: boolean }) {
  const { state } = useKairya()
  return (
    <span
      data-testid="tutor-portrait"
      aria-hidden={scene ? undefined : true}
      data-size={scene ? 'scene' : 'compact'}
      className="tutor-portrait"
    >
      {scene ? (
        <KairyaFace mood={state.mood} size="scene" />
      ) : (
        <img
          src={COMPACT_AVATAR.src}
          alt=""
          width={COMPACT_AVATAR.width}
          height={COMPACT_AVATAR.height}
          decoding="async"
        />
      )}
    </span>
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
  const { dispatch } = useKairya()
  const { playSfx, stopVoice } = useAudio()
  useTutorPresence({ send: conversation.send, draft: conversation.draft })
  // Toda confirmacao bem-sucedida chega aqui (R7): a pagina recarrega o quadro
  // e a Kairya confirma a missao na bolha.
  const handleMissionCreated = () => {
    dispatch({ type: 'say', topic: 'proposalAccepted' })
    onMissionCreated()
  }
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
    if (next) playSfx('panel_open')
    setDesktopOpen(next)
    writePanelOpen(next)
  }

  // A folha cobre a bolha: a fala sem legenda visivel e proibida (D15), entao
  // abrir corta a voz; so o clique que abre, nunca o desktop.
  const openSheet = () => {
    stopVoice()
    playSfx('panel_open')
    setSheetOpen(true)
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
          onMissionCreated={handleMissionCreated}
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
    <aside
      ref={panel}
      aria-label={t('tutoring.name')}
      data-testid="tutor-panel"
      className="rpg-tutor lg:border-l"
    >
      <p role="status" data-testid="tutor-live" className="sr-only">
        {live === null ? '' : t(live)}
      </p>

      {isDesktop ? (
        <div
          key="desktop"
          ref={captureLayout}
          className={`tutor-desktop flex h-screen flex-col gap-3 p-4 ${desktopOpen ? 'tutor-desktop-open w-96' : 'tutor-desktop-closed w-20'}`}
        >
          <Portrait scene={desktopOpen} />
          <header
            className={`tutor-heading flex items-center gap-3 ${desktopOpen ? '' : 'flex-col'}`}
          >
            {desktopOpen && (
              <div className="flex-1">
                <h2 className="tutor-name">{t('tutoring.name')}</h2>
                <p className="text-xs text-text-muted">{t('tutoring.panel.subtitle')}</p>
              </div>
            )}
            <Button
              ref={desktopToggle}
              data-testid="tutor-panel-toggle"
              aria-label={toggleLabel}
              title={toggleLabel}
              aria-expanded={desktopOpen}
              aria-controls="tutor-panel-body"
              onClick={toggleDesktop}
            >
              {desktopOpen ? toggleLabel : <span aria-hidden="true">›</span>}
            </Button>
          </header>
          {desktopOpen && (
            <div id="tutor-panel-body" className="flex min-h-0 flex-1 flex-col">
              {body}
            </div>
          )}
        </div>
      ) : (
        <div key="mobile" ref={captureLayout}>
          {!sheetOpen && (
            <div className="fixed right-4 bottom-4 z-20">
              <Button
                ref={openButton}
                variant="primary"
                data-testid="tutor-sheet-open"
                aria-expanded={false}
                aria-controls="tutor-sheet"
                onClick={openSheet}
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
                className="tutor-sheet fixed inset-x-0 bottom-0 z-40 flex flex-col gap-3 rounded-t-ui border-t border-border-strong bg-bg-canvas p-4"
              >
                <header className="flex items-center gap-3">
                  <Portrait scene={false} />
                  <h2 id="tutor-sheet-title" className="flex-1 text-lg text-text-primary">
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
      )}
    </aside>
  )
}
