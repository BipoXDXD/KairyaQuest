/**
 * A data em que a conquista foi destravada, em Sao Paulo (decisao P5 do plano
 * do D). `unlocked_at` e um INSTANTE, nao uma data civil: mostrado no fuso do
 * navegador, a mesma conquista mudaria de dia conforme o computador.
 */
const unlockedFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatUnlockedAt(instant: string): string {
  return unlockedFormatter.format(new Date(instant))
}
