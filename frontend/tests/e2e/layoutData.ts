import type { Page } from '@playwright/test'
import type { CurrentPlan } from '../../src/features/campaigns/types'
import type { MessageRead } from '../../src/features/tutoring/types'
import type { Mission } from '../../src/shared/types/mission'

// Respostas GET determinísticas para os cenários de apresentação (layout e
// fontes): o conteúdo não depende da ordem dos cenários do banco. O resto das
// requisições segue para a API real.
export async function layoutData(
  page: Page,
  missions: Mission[] = [],
  history: MessageRead[] = [],
  plan: CurrentPlan = { plan: null },
) {
  const responses: Record<string, unknown> = {
    '/api/missions': missions,
    '/api/tutoring/status': { available: true },
    '/api/tutoring/messages': history,
    '/api/plans/current': plan,
    '/api/cycle': {
      today: '2026-10-04',
      mission: null,
      streak: 0,
      days_to_milestone: 7,
      special: null,
      late_daily: null,
    },
    '/api/progress': {
      xp_total: 0,
      level: 1,
      level_floor_xp: 0,
      next_level_xp: 100,
      achievements: [],
    },
  }
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (route.request().method() === 'GET' && pathname in responses) {
      return route.fulfill({ json: responses[pathname] })
    }
    return route.continue()
  })
}
