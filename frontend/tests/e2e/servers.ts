/**
 * Os enderecos dos servidores DEDICADOS do E2E.
 *
 * Moram aqui, e nao no `playwright.config.ts`, porque tem dois consumidores:
 * o config (que sobe os processos e configura o proxy) e o cenario (que semeia
 * pela API). Repetir a porta nos dois lados e o tipo de duplicacao que
 * silencia: o dia em que uma das duas mudasse, o cenario continuaria passando
 * contra o servidor antigo, se ele por acaso estivesse no ar.
 *
 * Portas proprias -- 8100 para a API e 5273 para o frontend -- porque o
 * README §10 proibe reutilizar servidor pessoal: as de desenvolvimento sao
 * 8000 e 5173.
 */

/** A API dedicada do E2E, apontada para o banco de teste por scripts/e2e-env.sh. */
export const API_URL = 'http://127.0.0.1:8100'

/** O frontend dedicado do E2E, servindo o build de producao com o proxy de `/api`. */
export const WEB_URL = 'http://127.0.0.1:5273'
