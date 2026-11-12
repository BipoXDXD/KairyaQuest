import { renderHook } from '@testing-library/react'

/**
 * Descarrega os efeitos passivos que o React deixou pendentes.
 *
 * O som sai de efeitos passivos (`useSpokenCue`, `useTutorPresence`, o aviso da
 * especial). Depois de um commit vindo de fora do `act` (uma resposta de
 * `fetch`, um `findBy`), o React os roda numa tarefa do Scheduler, e o `findBy`
 * pode resolver antes dela. Uma afirmação de AUSÊNCIA ("nada tocou") feita ali
 * passa vazia: o efeito que tocaria ainda não rodou.
 *
 * Todo render começa descarregando os efeitos pendentes, de qualquer raiz.
 * Montar e desmontar uma raiz própria e vazia provoca esse render sem mexer na
 * árvore sob teste: ao voltar, os efeitos do último commit já rodaram, e a
 * ausência afirmada vale. Observável, sem `sleep` e sem prazo maior.
 *
 * `act(async () => {})` NÃO serve: não descarrega a tarefa agendada fora do `act`.
 * Para afirmar uma PRESENÇA, espere o próprio efeito (`waitFor`).
 */
export function flushPendingEffects(): void {
  renderHook(() => undefined).unmount()
}
