import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { API_URL, FALSO_URL, GALERIA_URL, WEB_URL } from './tests/e2e/servers'

/**
 * A raiz do repositorio, resolvida a partir deste arquivo.
 *
 * O `cwd` do webServer da API precisa ser a raiz: o `uv` procura o
 * `pyproject.toml` e o `Settings` le o `.env` do diretorio corrente. Um
 * caminho relativo simples (`'..'`) funcionaria por acidente -- ele se
 * resolveria contra o diretorio de onde o `npx playwright test` foi chamado,
 * nao contra o diretorio deste arquivo.
 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * As portas saem de `servers.ts`, a fonte unica -- nenhuma e escrita aqui.
 * Com `FOCUSQUEST_E2E_PORT_OFFSET` (pendencia 19), todas se deslocam juntas;
 * uma porta escrita a mao neste arquivo ficaria para tras, e o gate de um
 * worktree subiria um servidor na porta do gate de outro.
 */
const porta = (url: string): string => new URL(url).port

export default defineConfig({
  testDir: './tests/e2e',

  // `forbidOnly` sem condicao de CI, diferente do padrao que o Playwright
  // sugere: um `test.only` esquecido e um teste ignorado, e o AGENTS.md §3
  // proibe teste ignorado em qualquer ambiente -- nao apenas no CI. Reprovar
  // so no CI transformaria a proibicao em surpresa.
  forbidOnly: true,

  // Zero retentativas, de proposito. Uma retentativa que salva o gate esconde
  // exatamente o defeito que interessa aqui: cenario intermitente. Se falhar,
  // tem de falhar.
  retries: 0,

  // Um worker: a API do E2E e o banco de teste sao compartilhados pelos
  // cenarios, e o determinismo vale mais que o paralelismo em duas specs.
  workers: 1,

  reporter: [['list']],

  use: {
    baseURL: WEB_URL,
    // Rastro apenas do que falhou -- em `test-results/`, que o .gitignore da
    // raiz ja ignora.
    trace: 'retain-on-failure',
    // O navegador num fuso que NAO e o do produto. A tela apresenta o prazo em
    // `America/Sao_Paulo` (README §8); com o navegador herdando o fuso da
    // maquina -- que, na do dono, E Sao Paulo --, a asseveracao do texto do
    // prazo passaria mesmo se a aplicacao usasse o fuso de quem le.
    timezoneId: 'Asia/Tokyo',
    // O idioma do navegador fixado. Quando o servidor devolve `locale: null`,
    // o boot grava o idioma detectado em `users.locale`; sem locale fixo, o
    // Chromium headless diz `en-US` e a tutora passaria a responder em EN nos
    // specs seguintes. O E2E de idioma sobrescreve por spec com
    // `test.use({ locale })`.
    locale: 'pt-BR',
    // O convite de som ja dispensado: os E2E existentes rodam sem o cartao
    // (que mudaria layout e foco) e sem edicao. Um spec do convite sobrescreve.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(WEB_URL).origin,
          localStorage: [{ name: 'kairyaquest.soundInvite', value: '1' }],
        },
      ],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Os estados da galeria tem servidor e projeto proprios (abaixo).
      testIgnore: 'ui-states.spec.ts',
    },
    {
      // axe e alvo de 44px por estado dos componentes de `shared/ui/`, cada um
      // montado sozinho na galeria (`ui-gallery.html?case=<id>`).
      name: 'ui-states',
      testMatch: 'ui-states.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: GALERIA_URL },
    },
  ],

  // Os QUATRO servidores -- o falso da Anthropic, a API, o frontend e a
  // galeria de estados da UI -- sao
  // subidos pelo proprio Playwright, em portas dedicadas, com
  // `reuseExistingServer: false`: o README §10 proibe reutilizar servidor
  // pessoal. Com reuso, o E2E de quem estivesse com `npm run dev` aberto
  // passaria contra o servidor da pessoa.
  webServer: [
    {
      // O MESMO servidor falso do pytest, como processo, com o controle HTTP
      // de `/_control/`. PYTHONPATH=tests porque o pacote e `integration`
      // (como o pytest o importa), e nao `tests.integration`.
      command: `uv run python -m integration.falso_do_e2e --porta ${porta(FALSO_URL)}`,
      cwd: REPO_ROOT,
      env: { PYTHONPATH: 'tests' },
      url: `${FALSO_URL}/_control/requests`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // O script aponta FOCUSQUEST_DATABASE_URL para o banco de TESTE antes
      // de trocar de processo para o uvicorn. Ver scripts/e2e-env.sh.
      command: `./scripts/e2e-env.sh uv run uvicorn integration.e2e_app:app --host 127.0.0.1 --port ${porta(API_URL)}`,
      cwd: REPO_ROOT,
      // `/ready` e nao `/health`: o `/health` responde 200 sem tocar no banco,
      // entao ele aprovaria uma API que nao consegue consultar nada. O
      // `/ready` abre a conexao e consulta -- e responde 503 enquanto nao
      // conseguir, o que mantem o Playwright esperando em vez de comecar o
      // cenario contra um banco fora do ar.
      url: `${API_URL}/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        // O provedor da API do E2E e o servidor falso, nunca a Anthropic. O
        // `scripts/e2e-env.sh` RECUSA subir com qualquer endereco fora do
        // loopback e impoe a chave ficticia -- a do .env nunca chega aqui.
        FOCUSQUEST_ANTHROPIC_BASE_URL: FALSO_URL,
        PYTHONPATH: 'tests',
      },
    },
    {
      // `vite preview` e nao `vite dev`: o que o cenario visita e o BUILD de
      // producao, o mesmo artefato que iria para o ar. O `make check-e2e`
      // roda o build antes, e e dele que o preview serve.
      command: `npx vite preview --host 127.0.0.1 --port ${porta(WEB_URL)} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        // O alvo do proxy de `/api`. Sem isto o `vite.config.ts` cai no
        // padrao 8000 -- a API de DESENVOLVIMENTO --, e o pior caso nao seria
        // falhar: o cenario passaria contra o servidor errado. O `.env` nao
        // serve para isto: o Vite nao injeta o `.env` em `process.env`.
        API_PROXY_TARGET: API_URL,
      },
    },
    {
      // A galeria do projeto `ui-states`. `vite` de desenvolvimento, e nao o
      // preview: o `ui-gallery.html` fica fora do build de producao de
      // proposito, e so o servidor de desenvolvimento o serve sem build. Mesmo
      // `env` do preview, mais `VITE_API_URL`, para o proxy de `/api` nunca
      // cair na API de desenvolvimento se um caso vier a falar com ela.
      command: `npx vite --host 127.0.0.1 --port ${porta(GALERIA_URL)} --strictPort`,
      url: `${GALERIA_URL}/ui-gallery.html`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        API_PROXY_TARGET: API_URL,
        // O preview nao precisa disto: a variavel vai embutida no build
        // (`Makefile`, alvo check-e2e). O `vite` de desenvolvimento le `VITE_*`
        // ao servir, e o `shared/api/client.ts` recusa carregar sem ela; no CI
        // nao ha `frontend/.env`, e um caso que importe o cliente (a 4.5 monta
        // o `LanguageSwitcher`) deixaria a galeria em branco.
        VITE_API_URL: '/api',
      },
    },
  ],
})
