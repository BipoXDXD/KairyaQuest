/**
 * Datas CIVIS do ciclo (`today`, `day`, `week_start`): "2026-09-25", sem hora
 * e sem fuso.
 *
 * Nao sao instantes, e nao passam por conversao de fuso (spec do ciclo, secao
 * "Datas civis versus instantes"). `new Date('2026-09-21')` e a meia-noite em
 * UTC, e formatada em Sao Paulo vira domingo, 20/09 -- o dia errado. Aqui a
 * data e montada ao MEIO-DIA em UTC e formatada em UTC: nenhum fuso entra na
 * conta. O meio-dia so da margem de -12h a +11h: a partir de +12h (Auckland,
 * Fiji, Tonga, Kiritimati) ele ja e o dia seguinte, entao quem segura o dia
 * la e o `timeZone: 'UTC'` dos formatadores -- e o que os testes com
 * `TZ=Pacific/Kiritimati` guardam.
 *
 * Mora em `shared/lib/` desde o Incremento C (`docs/ARCHITECTURE.md` §5,
 * regra 3): nasceu em `features/missions/` para a "Missão de hoje" e passou a
 * ter um segundo usuario real, a trilha de `features/campaigns/`.
 */
const civilDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
})

const civilWeekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
})

/** O meio-dia em UTC da data civil: da margem ampla ao dia, mas sozinho nao basta a partir de +12h (ver comentario do arquivo). */
function civilNoon(civil: string): Date {
  const year = Number(civil.slice(0, 4))
  const month = Number(civil.slice(5, 7))
  const day = Number(civil.slice(8, 10))
  return new Date(Date.UTC(year, month - 1, day, 12))
}

/** "segunda-feira, 21/09". */
export function formatCivilDate(civil: string): string {
  return civilDateFormatter.format(civilNoon(civil))
}

/** So o dia da semana, sem o resto da data: "quinta-feira" (o bau da trilha). */
export function civilWeekday(civil: string): string {
  return civilWeekdayFormatter.format(civilNoon(civil))
}
