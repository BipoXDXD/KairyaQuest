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
  'shell.locale.label': 'Idioma',
  'shell.locale.ptBR': 'PT, Português (Brasil)',
  'shell.locale.en': 'EN, English',
  'shell.locale.saveFailed':
    'Não foi possível salvar o idioma {language}. A conexão falhou. Tente de novo.',
  'ui.dialog.cancel': 'Cancelar',
} as const
