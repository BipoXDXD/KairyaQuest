import { SFX_NAMES, sfxSrc, type SfxName } from '../../shared/audio/sfx'
import { CATALOGS } from '../../shared/i18n/catalog'
import { LOCALES, type Locale } from '../../shared/i18n/locale'
import { lineSrc } from './lineAudio'
import { LINE_IDS, lineKey, type LineId } from './lines'

// Só o teste-golden importa este módulo: os prompts não entram no bundle.

/** Os arquivos servidos por `/audio/...` moram em `frontend/public/audio/...`. */
const PUBLIC_DIR = 'frontend/public'

/** Prompt (em inglês, como o modelo prefere) e duração-alvo, em segundos, de cada efeito. */
export const SFX_GUIDE: Readonly<Record<SfxName, { prompt: string; seconds: number }>> = {
  mission_done: {
    prompt: 'Soft wooden wind chime with a gentle bell, short warm resolve, quiet',
    seconds: 1,
  },
  xp_tick: {
    prompt: 'Tiny soft wooden tick with a faint sparkle, very short quiet interface sound',
    seconds: 0.5,
  },
  level_up: {
    prompt:
      'Warm rising three-note marimba phrase with a soft temple bell tail, gentle and uplifting',
    seconds: 2,
  },
  achievement: {
    prompt: 'Gentle bright chime with a soft paper rustle, a small proud moment, warm',
    seconds: 1.5,
  },
  weekly_trial_unlocked: {
    prompt: 'Soft low drum tap followed by a warm resonant bell, calm anticipation',
    seconds: 2,
  },
  lantern_lit: {
    prompt: 'Soft match strike and a warm gentle flame whoosh, cozy and quiet',
    seconds: 1,
  },
  proposal_arrived: {
    prompt: 'Soft paper scroll unrolling with a light wooden knock, friendly notification',
    seconds: 0.8,
  },
  message_sent: {
    prompt: 'Short soft whoosh of paper, light and airy, quiet interface sound',
    seconds: 0.5,
  },
  soft_error: {
    prompt: 'Two muted soft wooden taps, low and gentle, not alarming',
    seconds: 0.5,
  },
  streak_kept: {
    prompt: 'Single soft wooden clapper tap with a short warm chime, steady',
    seconds: 0.8,
  },
  trail_step: {
    prompt: 'Single soft footstep on a stone path at night, quiet',
    seconds: 0.5,
  },
  panel_open: {
    prompt: 'Soft sliding paper door opening, gentle wooden glide, quiet',
    seconds: 0.8,
  },
}

export interface LineEntry {
  id: LineId
  locale: Locale
  text: string
  file: string
}

export interface SfxEntry {
  name: SfxName
  prompt: string
  seconds: number
  file: string
}

export interface RecordingScript {
  version: 1
  lines: readonly LineEntry[]
  sfx: readonly SfxEntry[]
}

/** O roteiro de gravação: falas na ordem `LOCALES` × `LINE_IDS`, efeitos na de `SFX_NAMES`. */
export function buildRecordingScript(): RecordingScript {
  const lines = LOCALES.flatMap((locale) =>
    LINE_IDS.map((id) => ({
      id,
      locale,
      text: CATALOGS[locale][lineKey(id)],
      file: PUBLIC_DIR + lineSrc(locale, id),
    })),
  )
  const sfx = SFX_NAMES.map((name) => ({
    name,
    ...SFX_GUIDE[name],
    file: PUBLIC_DIR + sfxSrc(name),
  }))
  return { version: 1, lines, sfx }
}
