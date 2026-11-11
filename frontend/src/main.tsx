import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { KairyaPresenceProvider } from './features/kairya'
import { AudioProvider } from './shared/audio/AudioProvider'
import { I18nProvider } from './shared/i18n/I18nProvider'
import { ServerLocaleSync } from './shared/i18n/ServerLocaleSync'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ServerLocaleSync />
      <AudioProvider>
        <KairyaPresenceProvider>
          <App />
        </KairyaPresenceProvider>
      </AudioProvider>
    </I18nProvider>
  </StrictMode>,
)
