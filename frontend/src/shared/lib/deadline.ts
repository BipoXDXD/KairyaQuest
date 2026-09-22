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
