import { useRef, useState, type ReactElement } from 'react'
import { useT } from '../../shared/i18n/useT'
import { Button } from '../../shared/ui/Button'
import { usePrefersReducedMotion } from '../../shared/ui/usePrefersReducedMotion'
import { faceFor } from './faceArt'
import { TURNTABLE, type TurntableAsset } from './turntable'

const SIZE_CLASS = 'h-40 w-32 rounded-ui object-cover'

function Placeholder(): ReactElement {
  const t = useT()
  const face = faceFor('celebrating')
  return (
    <img
      data-testid="kairya-turntable-placeholder"
      src={face.src}
      alt={t('kairya.turntable.placeholderAlt')}
      width={face.width}
      height={face.height}
      decoding="async"
      className={SIZE_CLASS}
    />
  )
}

/**
 * Com o asset: o video em loop, ou o quadro parado sob movimento reduzido.
 * Se o video ou o quadro falha, volta para o placeholder. Fica separado do
 * `KairyaTurntable` para a leitura do `matchMedia` so acontecer quando ha
 * asset.
 */
function Player({ asset }: { asset: TurntableAsset }): ReactElement {
  const t = useT()
  const reduced = usePrefersReducedMotion()
  const [failed, setFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Estado so do rotulo: o video nasce pausado ate o evento `play` (sem
  // autoplay, o rotulo ja diz "Retomar") e dai segue so os eventos do video.
  const [paused, setPaused] = useState(true)

  // A acao decide pelo elemento real, nao pelo estado: dois cliques antes do
  // evento chegar ainda alternam de verdade.
  const toggle = () => {
    const video = videoRef.current
    if (video?.paused === true) {
      // O navegador pode recusar o play; o estado segue os eventos reais do video.
      void video.play().catch(() => undefined)
    } else {
      video?.pause()
    }
  }
  if (failed) {
    return <Placeholder />
  }
  if (reduced) {
    return (
      <img
        data-testid="kairya-turntable-poster"
        src={asset.poster}
        alt={t('kairya.turntable.alt')}
        width={asset.width}
        height={asset.height}
        className={SIZE_CLASS}
        onError={() => {
          setFailed(true)
        }}
      />
    )
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <video
        ref={videoRef}
        data-testid="kairya-turntable"
        autoPlay
        muted
        loop
        playsInline
        poster={asset.poster}
        src={asset.video}
        role="img"
        aria-label={t('kairya.turntable.alt')}
        width={asset.width}
        height={asset.height}
        className={SIZE_CLASS}
        onPlay={() => {
          setPaused(false)
        }}
        onPause={() => {
          setPaused(true)
        }}
        onError={() => {
          setFailed(true)
        }}
      />
      <Button variant="tertiary" data-testid="kairya-turntable-toggle" onClick={toggle}>
        {t(paused ? 'kairya.turntable.resume' : 'kairya.turntable.pause')}
      </Button>
    </div>
  )
}

/** A Kairya girando na recompensa de nivel novo; sem asset, o placeholder. */
export function KairyaTurntable({
  asset = TURNTABLE,
}: {
  asset?: TurntableAsset | null
}): ReactElement {
  return asset === null ? <Placeholder /> : <Player asset={asset} />
}
