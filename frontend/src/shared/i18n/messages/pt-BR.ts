/**
 * O catalogo de referencia: define as chaves (`MessageKey`). Os textos PT sao
 * os da interface atual, sem reescrita.
 *
 * Convencoes (valem para todas as areas):
 * - chaves planas, com ponto: `<area>.<componente>.<papel>`;
 * - plural em chaves irmas `….one` e `….other` (e `….zero` quando o texto
 *   do zero difere), escolhidas por `plural`;
 * - interpolacao `{nome}`; numero e data chegam ja formatados por `Intl.*`.
 */
export const ptBR = {
  'shell.brand.name': 'KairyaQuest',
  'shell.brand.note': 'Sua jornada de estudos',
  'shell.nav.label': 'Áreas',
  'shell.nav.headquarters': 'Quartel-General',
  'shell.nav.campaigns': 'Campanhas',
  'headquarters.hero.title': 'Quartel-General — seu painel de estudos',
  'headquarters.hero.note': 'O que está em aberto, com prazo e recompensa.',
  'campaigns.hero.title': 'Campanhas — planos de estudo',
  'campaigns.hero.note': 'A semana inteira, dia a dia, e a missão especial.',
  'shell.locale.label': 'Idioma',
  'shell.locale.ptBR': 'PT, Português (Brasil)',
  'shell.locale.en': 'EN, English',
  'shell.locale.saveFailed':
    'Não foi possível salvar o idioma {language}. A conexão falhou. Tente de novo.',
  'ui.dialog.cancel': 'Cancelar',
  'ui.language.short.ptBR': 'PT',
  'ui.language.short.en': 'EN',
  'ui.loading': 'Carregando…',
  'ui.sound.voice': 'Voz da Kairya',
  'ui.sound.sfx': 'Efeitos sonoros',
} as const
