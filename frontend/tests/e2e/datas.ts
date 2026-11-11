/**
 * Datas relativas a hoje para os cenarios E2E (pendencia 207).
 *
 * Os cenarios tinham prazos e dias escritos por extenso, com ano e tudo. Os
 * que semeiam pela API real vencem: o backend so aceita prazo em
 * `(agora, agora + 365 d]`, entao um literal deixa de ser futuro num dia
 * qualquer do calendario e o gate reprova sem nada ter mudado no codigo. Aqui
 * todo instante nasce de `agora` mais N dias, numa hora fixa de Sao Paulo, e
 * as grafias que os cenarios conferem (ISO em UTC, ISO com `-03:00`, o campo
 * `datetime-local`, o texto da tela) saem do MESMO instante.
 *
 * **O fuso do produto e fixo em -03:00.** `America/Sao_Paulo` nao tem horario
 * de verao desde 2019; a conta e feita a mao, com aritmetica de UTC, em vez de
 * `Intl` com `timeZone` -- de proposito: o texto esperado nao pode sair do
 * mesmo mecanismo que a aplicacao usa para formatar, ou um defeito dela
 * combinaria com ele mesmo (ver `PRAZO_NA_TELA` em `headquarters.spec.ts`).
 *
 * **A janela do backend.** Com `1 <= dias <= 364`, qualquer hora do dia cai
 * dentro de `(agora, agora + 365 d]`, seja qual for a hora de `agora`
 * (provado em `tests/unit/datas.test.ts`). Datas passadas de proposito usam
 * `dias` negativo.
 */

/** O deslocamento de Sao Paulo em relacao a UTC: -03:00, sem horario de verao. */
const DESLOCAMENTO_DE_SAO_PAULO_MS = -3 * 3_600_000
const MS_POR_DIA = 86_400_000

const doisDigitos = (valor: number): string => String(valor).padStart(2, '0')

/**
 * O "relogio de parede" de Sao Paulo em `instante`, lido em ISO UTC: a string
 * resultante tem a data e a hora de Sao Paulo, com um `Z` que nao significa
 * nada e e sempre cortado por quem chama.
 */
function paredeDeSaoPaulo(instante: Date): string {
  return new Date(instante.getTime() + DESLOCAMENTO_DE_SAO_PAULO_MS).toISOString()
}

/** O dia civil de Sao Paulo em que cai `instante`: `AAAA-MM-DD`. */
export function diaCivil(instante: Date): string {
  return paredeDeSaoPaulo(instante).slice(0, 10)
}

/** O dia civil `dias` depois de `dia` (antes, se negativo). */
export function somarDias(dia: string, dias: number): string {
  const meiaNoite = Date.parse(`${dia}T00:00:00Z`)
  return new Date(meiaNoite + dias * MS_POR_DIA).toISOString().slice(0, 10)
}

/** Quantos dias civis vao de `inicio` ate `fim` (negativo, se `fim` vem antes). */
export function diasEntre(inicio: string, fim: string): number {
  return (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / MS_POR_DIA
}

/**
 * A segunda-feira da semana de `dia`: o `week_start` que o backend gera para
 * o plano semanal. `getUTCDay` conta domingo como 0, por isso o `+ 6`.
 */
export function segundaDaSemana(dia: string): string {
  const diaDaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay()
  return somarDias(dia, -((diaDaSemana + 6) % 7))
}

/** O dia civil `dias` depois de hoje em Sao Paulo (antes, se negativo). */
export function diaRelativo(dias: number, agora: Date = new Date()): string {
  return somarDias(diaCivil(agora), dias)
}

/** O instante `hora:minuto` de Sao Paulo no dia `diaRelativo(dias)`. */
export function instanteRelativo(
  dias: number,
  hora: number,
  minuto = 0,
  agora: Date = new Date(),
): Date {
  const parede = Date.parse(
    `${diaRelativo(dias, agora)}T${doisDigitos(hora)}:${doisDigitos(minuto)}:00Z`,
  )
  return new Date(parede - DESLOCAMENTO_DE_SAO_PAULO_MS)
}

/** `AAAA-MM-DDTHH:MM:SSZ`: a grafia, sem milissegundos, com que a API devolve o prazo. */
export function isoUtc(instante: Date): string {
  return `${instante.toISOString().slice(0, 19)}Z`
}

/** `AAAA-MM-DDTHH:MM:SS-03:00`: o mesmo instante com o deslocamento de Sao Paulo. */
export function isoSaoPaulo(instante: Date): string {
  return `${paredeDeSaoPaulo(instante).slice(0, 19)}-03:00`
}

/** `AAAA-MM-DDTHH:MM`: o valor do campo `datetime-local`, em horario de Brasilia. */
export function campoDeHorario(instante: Date): string {
  return paredeDeSaoPaulo(instante).slice(0, 16)
}

/**
 * O texto do prazo que a tela mostra, em Sao Paulo: `DD/MM/AAAA` e `HH:MM`.
 * Regex, e nao texto exato: o separador entre data e hora muda entre versoes
 * do ICU.
 */
export function prazoNaTela(instante: Date): RegExp {
  const parede = paredeDeSaoPaulo(instante)
  const data = `${parede.slice(8, 10)}/${parede.slice(5, 7)}/${parede.slice(0, 4)}`
  return new RegExp(`${data}.*${parede.slice(11, 16)}`)
}

/** `DD/MM` de um dia civil: o recorte que o cabecalho do ciclo mostra. */
export function diaEMes(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
}
