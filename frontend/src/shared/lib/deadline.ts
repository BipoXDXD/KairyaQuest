/**
 * Formatador do prazo, criado UMA vez fora de qualquer componente.
 *
 * O prazo chega como string ISO com fuso, entao `new Date(...)` produz o
 * instante certo -- nunca se deve cortar a string na mao para formatar.
 *
 * O texto visivel sai em `America/Sao_Paulo`, e NAO no fuso de quem le: e o que
 * o README §8 manda ("apresente em America/Sao_Paulo") e o que a decisao A3 da
 * spec repete. Sem o `timeZone`, o `Intl` usaria o fuso do navegador, e a
 * mesma missao mostraria dias diferentes para quem estivesse fora de SP. O
 * instante original continua exposto no atributo `dateTime` do `<time>`.
 *
 * Quem guarda esta escolha e o teste de unidade com um instante em que SP e
 * UTC caem em dias diferentes, rodando com o processo fixado em `Asia/Tokyo`
 * (ver `vite.config.ts`) -- sem a fixacao, numa maquina em SP, o teste passaria
 * sem o `timeZone`.
 */
const deadlineFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * O prazo como a pessoa le: em `America/Sao_Paulo` (README §8, decisao A3).
 *
 * Mora em `shared/lib/` porque tem dois usuarios reais -- o cartao da missao e
 * o cartao da proposta da Tifa -- e a regra do fuso e UMA (`docs/ARCHITECTURE.md`
 * §5, regra 3). Uma copia por feature seria a segunda regra para divergir.
 */
export function formatDeadline(iso: string): string {
  return deadlineFormatter.format(new Date(iso))
}

const SAO_PAULO = 'America/Sao_Paulo'

/** As partes do instante no relogio de Sao Paulo. `h23`: meia-noite e 00, nao 24. */
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SAO_PAULO,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

type CivilParts = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>

function saoPauloParts(instant: number): CivilParts {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** Quanto o relogio de SP esta a frente de UTC nesse instante (negativo: atras). */
function offsetMs(instant: number): number {
  const p = saoPauloParts(instant)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A hora civil de Sao Paulo do instante, no formato do `datetime-local`
 * (`YYYY-MM-DDTHH:mm`). Os segundos sao cortados, como no `formatDeadline`.
 */
export function isoToSaoPauloCivil(iso: string): string {
  const p = saoPauloParts(new Date(iso).getTime())
  return `${String(p.year).padStart(4, '0')}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

const CIVIL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/**
 * O instante (ISO em UTC) da hora civil de Sao Paulo, ou `null` se ela nao
 * existe: formato que nao e o do `datetime-local`, data invalida, ou a hora
 * pulada no inicio de um horario de verao.
 *
 * Duas passadas pelo deslocamento, e NAO um deslocamento fixo (F21): Sao Paulo
 * ja teve horario de verao, e a regra do backend (`cycle_domain.py`) recusa
 * suposicao pelo mesmo motivo. A volta (`isoToSaoPauloCivil`) e a prova: o que
 * nao da a mesma hora civil de volta nao existe no relogio de SP (o `Date.UTC`
 * "rola" o 31/02 para marco, e a volta desmente).
 *
 * Numa hora que se repete (o fim do horario de verao), vale a primeira
 * ocorrencia. O `datetime-local` nao tem como escolher, e as duas tem o mesmo
 * texto de volta.
 */
export function saoPauloCivilToIso(civil: string): string | null {
  const match = CIVIL.exec(civil)
  if (match === null) {
    return null
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const first = naive - offsetMs(naive)
  const instant = naive - offsetMs(first)
  const iso = new Date(instant).toISOString()
  return isoToSaoPauloCivil(iso) === civil ? iso : null
}

const civilDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * A data CIVIL ("2026-09-29") do instante em `America/Sao_Paulo`: o mesmo dia
 * que o `cycle_domain.py` chama de `dia_de`. A localidade `en-CA` e escolhida
 * so porque o formato curto dela e o ISO (`AAAA-MM-DD`); o texto nunca vai
 * para a tela.
 */
export function saoPauloCivilDate(iso: string): string {
  return civilDateFormatter.format(new Date(iso))
}
