import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { KairyaPresenceProvider } from './features/kairya'
import { I18nProvider } from './shared/i18n/I18nProvider'
import { ServerLocaleSync } from './shared/i18n/ServerLocaleSync'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ServerLocaleSync />
      <KairyaPresenceProvider>
        <App />
      </KairyaPresenceProvider>
    </I18nProvider>
  </StrictMode>,
)
