import type { MessageKey } from '../../shared/i18n/catalog'
import type { Availability } from '../../shared/types/mission'

/**
 * Como cada disponibilidade aparece: TEXTO (a chave do catalogo) e icone (README §7: aviso alem da
 * cor -- o icone sozinho nunca informa; quem informa e o `label`, e o icone so
 * reforca). O tom (cor da borda e do texto) e decisao de apresentacao da
 * trilha, e mora em `CampaignTrail.tsx`, perto de quem desenha.
 *
 * `Record<Availability, ...>` faz o mapa ser EXAUSTIVO: uma disponibilidade
 * nova no contrato reprova o `tsc` aqui, em vez de aparecer crua na tela
 * (`availability.test.ts` prova isto percorrendo todos os valores do tipo).
 *
 * Os `icon` sao tracos num quadro 24x24, desenhados a mao (sem biblioteca de
 * icones: nenhuma dependencia nova por seis desenhos).
 */
export const AVAILABILITY_DISPLAY: Record<Availability, { label: MessageKey; icon: string }> = {
  fora_do_plano: {
    label: 'campaigns.availability.fora_do_plano',
    icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM8 12h8',
  },
  bloqueada: {
    label: 'campaigns.availability.bloqueada',
    icon: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  },
  disponivel: {
    label: 'campaigns.availability.disponivel',
    icon: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  },
  concluida: {
    label: 'campaigns.availability.concluida',
    icon: 'M5 12l5 5L20 7',
  },
  perdida: {
    label: 'campaigns.availability.perdida',
    icon: 'M6 6l12 12M18 6L6 18',
  },
  expirada: {
    label: 'campaigns.availability.expirada',
    icon: 'M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9',
  },
}
