import type { Messages } from '../catalog'

/**
 * As mesmas chaves de `ptBR`; o `satisfies` reprova chave faltando ou sobrando.
 * Os nomes dos idiomas sao a sigla visivel seguida do endonimo, iguais nos
 * dois catalogos: o nome acessivel comeca pelo texto visivel (WCAG 2.5.3).
 */
export const en = {
  'shell.locale.label': 'Language',
  'shell.locale.ptBR': 'PT, Português (Brasil)',
  'shell.locale.en': 'EN, English',
  'shell.locale.saveFailed':
    "Couldn't save {language} as your language. The connection failed. Try again.",
  'ui.dialog.cancel': 'Cancel',
  'ui.loading': 'Loading…',
} as const satisfies Messages
