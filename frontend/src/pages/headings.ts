/**
 * Os `id` dos titulos de nivel 1 das areas.
 *
 * Depois de navegar, o `App` leva o foco ao titulo da area aberta: sem troca
 * de URL nem de documento, e o foco que diz ao leitor de tela que o conteudo
 * mudou. Os `id` sao das paginas, e moram aqui (e nao no `App`) para o `App`
 * importa-los na direcao certa -- app -> pages, nunca o contrario.
 */
export const HEADQUARTERS_HEADING_ID = 'headquarters-title'
export const CAMPAIGNS_HEADING_ID = 'campaigns-title'
