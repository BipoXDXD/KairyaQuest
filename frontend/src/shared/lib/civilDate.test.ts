import { afterEach, describe, expect, it, vi } from 'vitest'
import { civilWeekday, formatCivilDate } from './civilDate'

describe('formatCivilDate', () => {
  // A armadilha que a spec do ciclo nomeia: `new Date('2026-09-21')` e a
  // meia-noite em UTC, e formatada em Sao Paulo vira domingo, 20/09.
  it('mostra o dia que a API mandou, sem conversao de fuso', () => {
    expect(formatCivilDate('2026-09-21')).toBe('segunda-feira, 21/09')
  })

  it('atravessa a virada do ano sem escorregar para o dia anterior', () => {
    expect(formatCivilDate('2027-01-01')).toBe('sexta-feira, 01/01')
  })
})

describe('civilWeekday', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('da so o dia da semana, sem conversao de fuso', () => {
    expect(civilWeekday('2026-09-24')).toBe('quinta-feira')
  })

  it('o domingo que fecha a semana continua domingo', () => {
    expect(civilWeekday('2026-09-27')).toBe('domingo')
  })

  it('nao escorrega de dia a OESTE de UTC, onde a armadilha da data civil aparece de verdade', async () => {
    // O processo de teste fica fixado em Asia/Tokyo (vite.config.ts), que e a
    // LESTE de UTC: meio-dia UTC + 9h ainda cai no MESMO dia, entao rodar so
    // em Tokyo nunca pegaria um `civilWeekday` que perdesse o `timeZone: 'UTC'`
    // (medido: o mutante sobrevive em Tokyo). A armadilha e a mesma que o
    // comentario do arquivo documenta para `formatCivilDate`, e o mesmo padrao
    // do teste "data civil a oeste de utc" do E2E do ciclo (5d250b3,
    // `tests/e2e/cycle.spec.ts`): so um fuso a OESTE de UTC, como
    // America/Sao_Paulo, prova que a funcao fixa o fuso em UTC de verdade, e
    // nao depende do fuso de quem roda o processo.
    //
    // `vi.resetModules()` + import() dinamico (mesmo padrao de
    // `shared/api/client.test.ts`): o formatador de `civilWeekday` e criado
    // UMA vez, no carregamento do modulo, entao so uma instancia NOVA -- sob o
    // `TZ` trocado -- exercitaria a falta do `timeZone` se ela existisse.
    vi.resetModules()
    vi.stubEnv('TZ', 'America/Sao_Paulo')
    const { civilWeekday: civilWeekdayEmSaoPaulo } = await import('./civilDate')
    expect(civilWeekdayEmSaoPaulo('2026-09-21')).toBe('segunda-feira')
  })
})
