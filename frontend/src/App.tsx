import { Headquarters } from './pages/Headquarters'

/**
 * Raiz da aplicacao.
 *
 * Enquanto nao houver roteador, `App` escolhe a tela -- e nada mais. Manter o
 * arquivo com uma responsabilidade so e o que o README §3 quer dizer com "evite
 * `App.tsx` gigante": no dia em que houver mais de uma tela, o que entra aqui e
 * um roteador, nao o conteudo da segunda tela.
 */
function App() {
  return <Headquarters />
}

export default App
