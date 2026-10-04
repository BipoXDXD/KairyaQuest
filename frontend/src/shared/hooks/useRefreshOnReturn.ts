import { useEffect, useRef } from 'react'

/**
 * Liga um `refresh` silencioso aos dois eventos de "a aba voltou": o
 * `visibilitychange` do documento -- so quando fica VISIVEL, nunca quando
 * fica oculto -- e o `focus` da janela. Remove os dois ouvintes ao
 * desmontar.
 *
 * Mora em `shared/hooks/` (`docs/ARCHITECTURE.md` §5, regra 3) porque tem
 * dois usuarios reais desde que nasce: `useCycle` (Quartel-General) e
 * `useCurrentPlan` (trilha de Campanhas).
 *
 * O `refresh` mais recente fica numa `ref`, e o efeito que registra os
 * ouvintes roda uma UNICA vez (dependencias vazias). A alternativa --
 * `[refresh]` nas dependencias do efeito -- so seria inocua se `refresh`
 * tivesse identidade estavel entre renderizacoes (medido: `useCycle` e
 * `useCurrentPlan` usam `useCallback` com array vazio, entao hoje ela E
 * estavel); mas o contrato deste gancho nao exige isso de quem chama, e um
 * `refresh` que muda de identidade a cada render reinscreveria os dois
 * ouvintes a cada render -- trabalho refeito sem motivo, e o tipo de
 * acoplamento entre gancho e forma de quem o chama que a `ref` evita. O
 * teste "usa sempre o refresh mais recente..." prova as duas metades: o
 * valor chamado e sempre o novo, e o registro acontece uma vez so.
 *
 * `visibilitychange` e `focus` podem disparar os dois quando a aba volta (o
 * navegador nao garante so um), entao este gancho pode chamar `refresh` duas
 * vezes seguidas de proposito -- ele nao junta os dois eventos num so
 * pedido. Isso NAO e "uma chamada de rede a mais" e mais nada: duas chamadas
 * concorrentes de `refresh` sem nenhuma guarda deixariam a resposta mais
 * VELHA, se chegasse por ULTIMO, sobrescrever a mais nova com dado
 * desatualizado. Quem fecha esse risco e
 * `useCycle` e `useCurrentPlan`, e nao este gancho: os dois tem uma
 * sequencia de pedidos (`requestId`) que so deixa a resposta do pedido mais
 * RECENTE mexer no estado, entao chamar `refresh` duas vezes aqui e seguro
 * por CONSTRUCAO do lado de quem chama, nao por sorte na ordem de chegada.
 *
 * A `ref` e atualizada dentro de um `useEffect` PROPRIO, e nao durante a
 * renderizacao: escrever em `ref.current` no corpo do componente e o que a
 * regra `react-hooks/refs` proibe (refs sao para fora da renderizacao). Como
 * ela nao tem array de dependencias, roda depois de TODA renderizacao --
 * exatamente o "sempre o mais recente" que o `refresh` mais recente precisa.
 */
export function useRefreshOnReturn(refresh: () => void): void {
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  })

  useEffect(() => {
    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible') {
        refreshRef.current()
      }
    }
    function onFocus(): void {
      refreshRef.current()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
}
