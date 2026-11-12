import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import { I18nProvider } from '../../shared/i18n/I18nProvider'
import { GALLERY_CASE_IDS, isGalleryCaseId } from './caseIds'
import { GALLERY_CASES } from './cases'

// Monta UM caso por página: o `ConfirmDialog` aberto é modal e deixaria o
// resto inerte. O `<h1>` (só para leitor de tela) é o id do caso, um
// identificador, e não texto de interface.
const params = new URLSearchParams(window.location.search)
const requested = params.get('case')
// `&lang=en` monta o caso em inglês; sem ele, em português.
const locale = params.get('lang') === 'en' ? 'en' : 'pt-BR'
const root = document.getElementById('root')
if (root === null) {
  throw new Error('ui-gallery.html sem #root')
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider initialLocale={locale}>
      <main className="p-6">
        {isGalleryCaseId(requested) ? (
          <>
            <h1 className="sr-only">{requested}</h1>
            <section data-gallery-case={requested}>{GALLERY_CASES[requested]()}</section>
          </>
        ) : (
          <ul>
            {GALLERY_CASE_IDS.map((id) => (
              <li key={id}>
                <a href={`?case=${id}`}>{id}</a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </I18nProvider>
  </StrictMode>,
)
