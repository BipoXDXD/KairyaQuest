import { useState, type ReactElement } from 'react'
import { useT } from '../../shared/i18n/useT'
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
    <video
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
      onError={() => {
        setFailed(true)
      }}
    />
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
