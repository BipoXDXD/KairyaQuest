import type { MessageKey } from '../shared/i18n/catalog'

/**
 * As areas da aplicacao, na ordem da navegacao lateral.
 *
 * A area ativa e estado local do `App` (spec do ciclo diario, C15): sem
 * biblioteca de rotas e sem URL por area. A rota por URL entra quando houver
 * a terceira area. O `id` e dado, nao texto de interface; o `labelKey` e a
 * chave do catalogo com o nome que a pessoa le.
 */
export type Area = 'headquarters' | 'campaigns'

export const AREAS: readonly { id: Area; labelKey: MessageKey }[] = [
  { id: 'headquarters', labelKey: 'shell.area.headquarters' },
  { id: 'campaigns', labelKey: 'shell.area.campaigns' },
]
