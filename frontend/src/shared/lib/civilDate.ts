/**
 * Datas CIVIS do ciclo (`today`, `day`): "2026-09-25", sem hora e sem fuso.
 *
 * Nao sao instantes, e nao passam por conversao de fuso (spec do ciclo, secao
 * "Datas civis versus instantes"). `new Date('2026-09-21')` e a meia-noite em
 * UTC, e formatada em Sao Paulo vira domingo, 20/09 -- o dia errado. Aqui a
 * data e montada ao MEIO-DIA em UTC e formatada em UTC: nenhum fuso entra na
 * conta, e o meio-dia deixa margem de doze horas mesmo se alguem tirar o
 * `timeZone` daqui por engano.
 */
const civilDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
})

export function formatCivilDate(civil: string): string {
  const year = Number(civil.slice(0, 4))
  const month = Number(civil.slice(5, 7))
  const day = Number(civil.slice(8, 10))
  return civilDateFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)))
}
