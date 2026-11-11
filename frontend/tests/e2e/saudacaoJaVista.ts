import { test as base } from '@playwright/test'
import { diaCivil } from './datas'

/** A chave que a Kairya grava ao saudar (`GREETING_STORAGE_KEY`, em `dailyOpening.ts`). */
export const CHAVE_DA_SAUDACAO = 'kairyaquest.lastGreeting'

/**
 * O `test` dos specs: o mesmo do Playwright, com a saudacao do dia ja dada.
 *
 * A saudacao da Kairya abre o Quartel-General uma vez por dia, e a bolha
 * empurra o layout e entra com fade (o axe mede o contraste no meio dele).
 * Os specs que nao tratam dela partem do dia ja saudado, num ponto unico em
 * vez de um `addInitScript` por spec. Um spec que testar a propria saudacao
 * limpa a chave (ou usa outro contexto).
 *
 * O dia e o civil de Sao Paulo, de `datas.ts`: a mesma fonte do produto
 * (`PRESENCE_TIME_ZONE`), e nao o `new Date()` local, que no navegador do E2E
 * esta em Asia/Tokyo. So grava se a chave faltar, para um recarregamento nao
 * apagar o que o app gravou.
 */
export const test = base.extend({
  context: async ({ context }, usar) => {
    await context.addInitScript(
      ({ chave, dia }) => {
        try {
          if (window.localStorage.getItem(chave) === null) {
            window.localStorage.setItem(chave, dia)
          }
        } catch {
          // Sem localStorage nao ha o que pre-gravar: a saudacao aparece e o spec falha com mensagem clara.
        }
      },
      { chave: CHAVE_DA_SAUDACAO, dia: diaCivil(new Date()) },
    )
    await usar(context)
  },
})
