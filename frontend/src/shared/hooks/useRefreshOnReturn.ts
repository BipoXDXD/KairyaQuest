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
 * `visibilitychange` e `focus` podem disparar os dois quando a aba volta
 * (o navegador nao garante so um). Dois `refresh` seguidos sao aceitaveis
 * aqui de proposito: nao ha por que juntar os dois eventos num so pedido
 * quando o pior caso e uma segunda chamada de rede a mais.
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
