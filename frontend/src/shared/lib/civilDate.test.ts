import { afterEach, describe, expect, it, vi } from 'vitest'
import { civilWeekday, formatCivilDate } from './civilDate'

describe('formatCivilDate', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // A armadilha que a spec do ciclo nomeia: `new Date('2026-09-21')` e a
  // meia-noite em UTC, e formatada em Sao Paulo vira domingo, 20/09.
  it('mostra o dia que a API mandou, sem conversao de fuso', () => {
    expect(formatCivilDate('2026-09-21', 'pt-BR')).toBe('segunda-feira, 21/09')
  })

  it('atravessa a virada do ano sem escorregar para o dia anterior', () => {
    expect(formatCivilDate('2027-01-01', 'pt-BR')).toBe('sexta-feira, 01/01')
  })

  it('nao escorrega de dia a LESTE de UTC a partir de +12h: o formatador fixa o fuso em UTC', async () => {
    // Mesmo motivo do teste de `civilWeekday` abaixo: em Kiritimati (UTC+14)
    // o meio-dia UTC de 21/09 ja e 22/09, e so o `timeZone: 'UTC'` segura.
    vi.resetModules()
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const { formatCivilDate: formatEmKiritimati } = await import('./civilDate')
    expect(formatEmKiritimati('2026-09-21', 'pt-BR')).toBe('segunda-feira, 21/09')
  })
})

describe('civilWeekday', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('da so o dia da semana, sem conversao de fuso', () => {
    expect(civilWeekday('2026-09-24', 'pt-BR')).toBe('quinta-feira')
  })

  it('o domingo que fecha a semana continua domingo', () => {
    expect(civilWeekday('2026-09-27', 'pt-BR')).toBe('domingo')
  })

  // `vi.resetModules()` + import() dinamico nos dois testes abaixo (mesmo
  // padrao de `shared/api/client.test.ts`): o formatador de `civilWeekday` e
  // criado UMA vez, no carregamento do modulo, entao so uma instancia NOVA --
  // sob o `TZ` trocado -- sente o fuso do processo.
  it('nao escorrega de dia a OESTE de UTC: nao volta a `new Date(civil)`, a meia-noite UTC', async () => {
    // O processo de teste fica fixado em Asia/Tokyo (vite.config.ts), a
    // LESTE de UTC. A armadilha que a spec nomeia -- `new Date('2026-09-21')`
    // e a meia-noite UTC, que em Sao Paulo ainda e domingo -- so aparece a
    // OESTE, e e isto que este teste guarda (mesmo padrao do teste
    // "data civil a oeste de utc" do E2E do ciclo).
    //
    // Ele NAO prova que o formatador fixa o fuso em UTC: o meio-dia UTC em
    // Sao Paulo e 9h do MESMO dia, entao tirar o `timeZone: 'UTC'` passa aqui
    // (medido: com o `timeZone: 'UTC'`
    // removido, este teste continua passando). Quem prova isso e o teste
    // seguinte, a LESTE, alem de +12h.
    vi.resetModules()
    vi.stubEnv('TZ', 'America/Sao_Paulo')
    const { civilWeekday: civilWeekdayEmSaoPaulo } = await import('./civilDate')
    expect(civilWeekdayEmSaoPaulo('2026-09-21', 'pt-BR')).toBe('segunda-feira')
  })

  it('nao escorrega de dia a LESTE de UTC a partir de +12h: o formatador fixa o fuso em UTC', async () => {
    // Pacific/Kiritimati e UTC+14: o meio-dia UTC de 21/09 e 2h de 22/09 la.
    // Sem o `timeZone: 'UTC'` no formatador, a segunda-feira vira
    // terca-feira -- e nao e so em Kiritimati: todo fuso real a partir de
    // +12h (Auckland, Fiji, Tonga, Kiritimati) tem essa mesma margem
    // insuficiente, e por isso mata o mutante (Tokyo, +9h, e Sao Paulo, -3h, deixam
    // ele vivo).
    vi.resetModules()
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const { civilWeekday: civilWeekdayEmKiritimati } = await import('./civilDate')
    expect(civilWeekdayEmKiritimati('2026-09-21', 'pt-BR')).toBe('segunda-feira')
  })
})

describe('formatadores da data civil em cada idioma', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // Os textos esperados sao os que o `Intl` produz (conferidos na primeira
  // execucao), fixados literais: o teste pega um idioma trocado ou ignorado.
  it('a mesma data sai no idioma pedido', () => {
    expect(formatCivilDate('2026-09-22', 'pt-BR')).toBe('terça-feira, 22/09')
    expect(formatCivilDate('2026-09-22', 'en')).toBe('Tuesday, 09/22')
    expect(civilWeekday('2026-09-22', 'pt-BR')).toBe('terça-feira')
    expect(civilWeekday('2026-09-22', 'en')).toBe('Tuesday')
  })

  it('alternar os idiomas nao contamina o formatador em cache do outro', () => {
    expect(formatCivilDate('2026-09-22', 'en')).toBe('Tuesday, 09/22')
    expect(formatCivilDate('2026-09-22', 'pt-BR')).toBe('terça-feira, 22/09')
    expect(formatCivilDate('2026-09-23', 'en')).toBe('Wednesday, 09/23')
  })

  it('com o processo em Asia/Tokyo (setup do Vitest), a data civil nao troca de dia em nenhum idioma', () => {
    // O `TZ` do processo e `Asia/Tokyo` (vite.config.ts), a LESTE de UTC: um
    // formatador que lesse a data no fuso do processo poderia escorregar.
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Tokyo')
    expect(formatCivilDate('2026-09-21', 'pt-BR')).toBe('segunda-feira, 21/09')
    expect(formatCivilDate('2026-09-21', 'en')).toBe('Monday, 09/21')
    expect(civilWeekday('2026-09-27', 'pt-BR')).toBe('domingo')
    expect(civilWeekday('2026-09-27', 'en')).toBe('Sunday')
  })

  it('em Kiritimati (UTC+14), o ingles tambem nao escorrega de dia', async () => {
    vi.resetModules()
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const { formatCivilDate: formatEmKiritimati, civilWeekday: weekdayEmKiritimati } =
      await import('./civilDate')
    expect(formatEmKiritimati('2026-09-21', 'en')).toBe('Monday, 09/21')
    expect(weekdayEmKiritimati('2026-09-21', 'en')).toBe('Monday')
  })
})
