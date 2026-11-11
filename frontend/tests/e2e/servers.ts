/**
 * Os enderecos dos servidores DEDICADOS do E2E.
 *
 * Moram aqui, e nao no `playwright.config.ts`, porque tem dois consumidores:
 * o config (que sobe os processos e configura o proxy) e o cenario (que semeia
 * pela API). Repetir a porta nos dois lados e o tipo de duplicacao que
 * silencia: o dia em que uma das duas mudasse, o cenario continuaria passando
 * contra o servidor antigo, se ele por acaso estivesse no ar. Este arquivo e a
 * FONTE UNICA das portas: o `playwright.config.ts` deriva todas daqui.
 *
 * Portas proprias -- 8100 para a API e 5273 para o frontend -- porque o
 * README §10 proibe reutilizar servidor pessoal: as de desenvolvimento sao
 * 8000 e 5173.
 *
 * 8150 para o servidor falso: na faixa 81xx da API do E2E, para ser lida como
 * porta de teste ponta a ponta; nao colide com 8000/5173 (desenvolvimento),
 * 8100/5273 (E2E) nem 55432 (PostgreSQL); e nao e 8101, o "proximo numero" que
 * alguem escolheria por reflexo para outro servidor.
 *
 * **Deslocamento por worktree (pendencia 19).** `FOCUSQUEST_E2E_PORT_OFFSET`
 * soma o mesmo inteiro a todas as portas, para dois gates rodarem ao mesmo tempo
 * em worktrees diferentes. Sem a variavel, ou com ela vazia, o deslocamento e
 * zero e as portas sao as de sempre.
 */

const PORTA_DA_API = 8100
const PORTA_DO_WEB = 5273
const PORTA_DO_FALSO = 8150
const PORTA_DA_GALERIA = 5373

/**
 * O maior deslocamento seguro: o vao entre a API e o falso, menos um (49).
 *
 * DERIVADO, e nao escrito: com deslocamentos de 0 a 49 as tres faixas ficam
 * disjuntas -- API 8100-8149, falso 8150-8199, frontend 5273-5322 --, e nenhum
 * worktree cai na porta de outro. Com 50, a API de um (8150) seria o falso de
 * quem usa zero. O `Settings` do Python declara o mesmo limite, e
 * `tests/unit/test_config.py` confere que os dois batem.
 */
export const DESLOCAMENTO_MAXIMO = PORTA_DO_FALSO - PORTA_DA_API - 1

/**
 * Le o deslocamento, RECUSANDO o que nao for um inteiro de 0 ao maximo.
 *
 * So digitos, sem sinal, espaco, ponto, expoente ou hexadecimal: `Number()`
 * aceitaria `' 3'`, `'1e1'` e `'0x10'`, e um erro de digitacao viraria uma
 * porta que ninguem escolheu. A mensagem nomeia a variavel e a faixa, para o
 * conserto ser obvio sem abrir este arquivo.
 */
export function lerDeslocamento(valor: string | undefined): number {
  if (valor === undefined || valor === '') {
    return 0
  }
  if (!/^\d+$/.test(valor) || Number(valor) > DESLOCAMENTO_MAXIMO) {
    throw new Error(
      `FOCUSQUEST_E2E_PORT_OFFSET=${JSON.stringify(valor)} invalido: esperado um ` +
        `inteiro de 0 a ${String(DESLOCAMENTO_MAXIMO)} (o deslocamento das portas do ` +
        'E2E; ver docs/QUALITY.md secao 4)',
    )
  }
  return Number(valor)
}

/** Os quatro enderecos com as portas deslocadas. */
export function enderecos(deslocamento: number): {
  api: string
  web: string
  falso: string
  galeria: string
} {
  const em = (porta: number): string => `http://127.0.0.1:${String(porta + deslocamento)}`
  return {
    api: em(PORTA_DA_API),
    web: em(PORTA_DO_WEB),
    falso: em(PORTA_DO_FALSO),
    galeria: em(PORTA_DA_GALERIA),
  }
}

const ENDERECOS = enderecos(lerDeslocamento(process.env.FOCUSQUEST_E2E_PORT_OFFSET))

/** A API dedicada do E2E, apontada para o banco de teste por scripts/e2e-env.sh. */
export const API_URL = ENDERECOS.api

/** O frontend dedicado do E2E, servindo o build de producao com o proxy de `/api`. */
export const WEB_URL = ENDERECOS.web

/** O servidor falso da Anthropic, como processo (`tests/integration/falso_do_e2e.py`). */
export const FALSO_URL = ENDERECOS.falso

/**
 * A galeria de estados da UI (`ui-gallery.html`), servida pelo `vite` de
 * desenvolvimento para o projeto `ui-states`. 5373: fora da faixa do frontend
 * do E2E (5273-5322) com qualquer deslocamento valido, e longe da 5173 de
 * desenvolvimento.
 */
export const GALERIA_URL = ENDERECOS.galeria
