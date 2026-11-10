import { execFile } from 'node:child_process'
import { FALSO_URL, REPO_ROOT } from './servers'

// Teto para o `uv` e o PostgreSQL: um travado falha aqui, com motivo, e nao
// no timeout generico do teste.
const LIMITE_DO_COMANDO_MS = 60_000

/**
 * O teto diario da tutoria gasto (e devolvido) direto no banco de TESTE, pelo
 * modulo Python `tests/integration/teto_do_e2e.py` -- o contrato e o porque
 * moram la e em `docs/handoff/2026-11-11-f3-4-idioma-e2e.md`.
 *
 * O ambiente do processo filho e explicito: o processo dos testes nao herda o
 * `env` do `webServer`. Sem `PYTHONPATH=tests`, `integration.*` nao e
 * importavel; sem a URL de loopback, o `scripts/e2e-env.sh` recusa rodar (o
 * padrao de `anthropic_base_url` e a API real). `execFile`, sem shell.
 */
function rodar(acao: 'semear' | 'apagar'): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      './scripts/e2e-env.sh',
      ['uv', 'run', 'python', '-m', 'integration.teto_do_e2e', acao],
      {
        cwd: REPO_ROOT,
        timeout: LIMITE_DO_COMANDO_MS,
        env: { ...process.env, PYTHONPATH: 'tests', FOCUSQUEST_ANTHROPIC_BASE_URL: FALSO_URL },
      },
      (erro, _stdout, stderr) => {
        if (erro === null) {
          resolve()
        } else {
          // Morto por sinal (o timeout), o processo deixa o stderr vazio: a
          // mensagem do erro e o que diz o porque.
          reject(new Error(`teto_do_e2e ${acao} falhou: ${erro.message}\n${stderr}`))
        }
      },
    )
  })
}

/** Leva os turnos de hoje ao `tutor_daily_turn_limit` da API do E2E. */
export function semearTeto(): Promise<void> {
  return rodar('semear')
}

/** Apaga o que `semearTeto` gravou. Idempotente: sem nada semeado, sucesso. */
export function apagarTeto(): Promise<void> {
  return rodar('apagar')
}
