# ARCHITECTURE

Este documento existe para responder uma pergunta prática: **onde vai o
arquivo que estou prestes a criar?** — e, antes dela, de que cada diretório é
responsável.

O documento é dividido em dois blocos rotulados, e a distinção é obrigatória:

- **O que existe hoje** (§1) — descrição. Gerada do disco, verificável com
  `find`.
- **O que é alvo e ainda não foi implementado** (§2, §3 e as linhas marcadas
  como contrato em §4) — **contrato**, não descrição. Nada nesses trechos
  existe no repositório hoje.

Documentar um backend inexistente como se existisse seria afirmação falsa, e
este projeto trata afirmação falsa em documentação como defeito grave. Por
isso os dois blocos nunca se misturam.

## 1. O que existe hoje

Árvore real, gerada do disco, sem `node_modules/`, `.venv/`, `.git/`,
`.tools/`, `dist/`, `coverage/`, `.superpowers/` e `.idea/` — todos ignorados
pelo git (os cinco últimos existem na máquina de desenvolvimento, mas não
chegam a um clone).

```text
FocusQuest/
├── .github/
│   └── workflows/
│       └── quality.yml            # o gate no GitHub Actions: um job por alvo do Makefile
├── docs/                          # documentação viva do projeto
│   ├── ARCHITECTURE.md            # este arquivo
│   ├── HANDOFF.md                 # estado corrente: decisões, alterações, pendências
│   ├── QUALITY.md                 # o gate: comandos, cobertura, limitações
│   └── superpowers/               # planos e specs do processo de execução por incrementos
│       ├── plans/
│       └── specs/
├── frontend/                      # a aplicação React; TODO código de interface mora aqui
│   ├── public/                    # arquivos servidos sem passar pelo bundler
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/                       # código-fonte da aplicação (denominador da cobertura)
│   │   ├── assets/                # imagens e SVGs importados pelo código
│   │   ├── test/                  # infraestrutura de teste, não código de aplicação
│   │   │   └── setup.ts
│   │   ├── App.css
│   │   ├── App.test.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── main.test.tsx
│   │   └── main.tsx
│   ├── .gitignore
│   ├── .prettierignore
│   ├── .prettierrc.json
│   ├── README.md
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json               # também define os scripts que o Makefile chama
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   └── vite.config.ts             # build, plugins e limiares de cobertura do Vitest
├── scripts/                       # lógica de shell do gate, compartilhada entre local e CI
│   ├── check-push.sh              # valida o topo de cada ref enviada, em worktree isolado
│   └── install-gitleaks.sh        # baixa o Gitleaks fixado, verificado por dois SHA-256
├── .gitignore
├── .gitleaks.toml                 # configuração da varredura de segredos
├── .pre-commit-config.yaml        # declara os hooks pre-commit, pre-merge-commit e pre-push
├── .python-version
├── AGENTS.md                      # regras comuns a todos os agentes
├── CLAUDE.md                      # importa AGENTS.md e acrescenta o específico do Claude Code
├── Makefile                       # a entrada única do gate: bootstrap, check, format
├── README.md                      # a especificação do produto; autoridade final
├── pyproject.toml                 # raiz Python: só ferramentas (Ruff, mypy, pre-commit)
└── uv.lock
```

### O que a árvore acima **não** tem

Registrado explicitamente, para que ninguém leia ausência como descuido:

- **Não existe backend.** Nenhum arquivo `.py` no repositório. `pyproject.toml`
  e `uv.lock` existem, mas só declaram o grupo `dev` (Ruff, mypy,
  pre-commit) — sem pacote, sem dependência de aplicação, sem módulo. Por
  consequência, também não existem `alembic/`, `tests/`, `compose.yaml`,
  `Dockerfile` nem `.env.example`.
- **Não existe `.run/`.** O README §4 manda versionar configuração de execução
  compartilhada, e o `.gitignore` já reserva o caminho (comentando que `.run/`
  **não** entra nele), mas o diretório ainda não foi criado.
- **Não existem `features/`, `shared/`, `pages/` nem `app/` no frontend.** O
  `src/` é plano hoje: um `App.tsx` de placeholder, o `main.tsx` que o monta,
  os dois testes correspondentes e os estilos. Essas pastas são contrato (§2),
  e cada uma nasce com o primeiro arquivo real que a justifique.

## 2. Árvore-alvo — contrato, não descrição

A árvore abaixo é a do README §3, reproduzida aqui como contrato. **Cada
módulo nasce apenas quando houver implementação real**; criar a pasta vazia
antes disso é a "camada vazia" que o README §3 proíbe.

```text
focusquest/
  src/focusquest/
    main.py
    core/                   # configuração, conexão e infraestrutura comum
    modules/
      missions/
        router.py           # transporte HTTP
        schemas.py          # contratos de entrada e saída
        service.py          # casos de uso
        domain.py           # regras independentes de framework
        repository.py       # acesso à persistência, quando necessário
        models.py           # mapeamento SQLAlchemy
      tutoring/
      progress/
  tests/
    unit/
    integration/
  alembic/
  web/
    src/
      app/                  # inicialização, rotas e providers
      pages/                # composição de telas
      features/
        tutoring/
        missions/
        rewards/
      shared/
        ui/                 # componentes visuais reutilizáveis
        api/                # cliente HTTP e tratamento de erros
        hooks/
        lib/
        types/
      assets/
      styles/               # tokens e estilos globais
    tests/e2e/
  scripts/
  docs/
  .github/workflows/
  .run/
  AGENTS.md
  CLAUDE.md
  pyproject.toml
  uv.lock
  compose.yaml
  Dockerfile
  Makefile
  .env.example
  README.md
```

### Divergência deliberada: `frontend/`, não `web/`

A árvore-alvo chama a pasta do frontend de `web/`; **neste repositório ela é
`frontend/` e assim permanece**. Não é descuido nem pendência: o próprio §3
manda "adaptar a árvore à localização atual do frontend" e "não mover arquivos
só por estética". Renomear `web/` custaria ajustar imports, aliases, scripts
do `package.json`, o `WEB := frontend` do Makefile, o
`cache-dependency-path: frontend/package-lock.json` do workflow e os caminhos
de cobertura — tudo isso para não mudar nenhum comportamento. A decisão já
está registrada em `docs/HANDOFF.md`; esta seção é a versão arquitetural dela.

Onde o restante deste documento cita um caminho da árvore-alvo sob `web/`,
leia `frontend/`.

## 3. Responsabilidades por camada

### Backend — **contrato**, nada disto existe hoje

Conforme o README §3:

| Camada | Responsabilidade | O que **não** faz |
|---|---|---|
| `router.py` | Coordena HTTP: recebe a requisição, valida o contrato, chama o serviço, traduz o resultado em resposta e código de status. | Não contém regra de negócio nem acesso ao banco. |
| `schemas.py` | Contratos de entrada e saída (Pydantic): a fronteira entre o mundo externo e o interno. | Não é o modelo de persistência. |
| `service.py` | Executa o caso de uso: orquestra domínio e persistência, controla a transação, decide o que é sucesso e o que é falha. | Não conhece `Request`, `Response` nem código HTTP. |
| `domain.py` | Concentra as regras, independentes de framework: transições de estado válidas, cálculo de XP, ciclos de pré-requisito. | Não importa SQLAlchemy, FastAPI nem nada de I/O. |
| `repository.py` | Trata o banco: consultas e gravações, quando a camada se justificar. | Não decide regra; só busca e persiste. |
| `models.py` | Mapeamento SQLAlchemy das tabelas. | Não é o contrato da API. |
| `core/` | Configuração, conexão e infraestrutura comum a todos os módulos. | Não é depósito de funções soltas. |

A regra que dá sentido à tabela: o modelo **solicita**, o backend **autoriza e
executa** (README §6). Nenhuma camada acima do domínio pode conceder XP,
concluir missão ou confirmar recompensa por conta própria.

### Frontend — parte descrição, parte contrato

- **`src/app/`** *(contrato)* — inicialização, rotas e providers. Hoje o papel
  é cumprido por `src/main.tsx`, que monta `App` em `#root` dentro de
  `StrictMode`.
- **`src/pages/`** *(contrato)* — **composição**: uma página junta features e
  componentes reutilizáveis e decide o layout da tela. Não contém regra.
- **`src/features/<feature>/`** *(contrato)* — a feature é a unidade real de
  organização: componentes, hooks, contratos e testes **daquele** assunto,
  agrupados. `tutoring`, `missions` e `rewards` são os três previstos.
- **`src/shared/`** *(contrato)* — só o que é de fato compartilhado: `ui/`
  (componentes visuais sem regra de negócio), `api/` (cliente HTTP e
  tratamento de erros, centralizados), `hooks/`, `lib/`, `types/`.
- **`src/styles/`** *(contrato)* — tokens e estilos globais. Hoje os estilos
  globais estão em `src/index.css` e `src/App.css`.
- **`src/assets/`** *(existe)* — imagens e SVGs importados pelo código, em
  oposição a `public/`, servido sem passar pelo bundler.
- **`src/test/`** *(existe)* — infraestrutura de teste (setup do jsdom).
  Está **fora** do denominador da cobertura de propósito; ver
  `docs/QUALITY.md` §3.

## 4. Onde colocar cada tipo de arquivo

A coluna **Estado** separa o que já é caminho real do que é contrato. Um
caminho marcado como contrato é criado pelo primeiro arquivo que
legitimamente pertence a ele — nunca antes.

### Frontend

| Vou criar… | Vai em | Estado |
|---|---|---|
| Componente visual reutilizável, sem regra de negócio (botão, cartão, barra de progresso) | `frontend/src/shared/ui/<Componente>.tsx` | contrato |
| Componente específico de uma feature (cartão de missão, painel da Tifa) | `frontend/src/features/<feature>/<Componente>.tsx` | contrato |
| Chamada HTTP | `frontend/src/shared/api/` — **sempre**. Componente nenhum chama `fetch` direto. | contrato |
| Tipo compartilhado por mais de uma feature | `frontend/src/shared/types/` | contrato |
| Tipo usado só por uma feature | junto da feature, em `frontend/src/features/<feature>/` | contrato |
| Hook genérico | `frontend/src/shared/hooks/` | contrato |
| Hook que só faz sentido dentro de uma feature | `frontend/src/features/<feature>/` | contrato |
| Token visual (cor, espaçamento, tipografia, foco, movimento) | `frontend/src/styles/` | contrato |
| Estilo global | hoje `frontend/src/index.css`; migra para `frontend/src/styles/` quando a pasta nascer | existe |
| Teste de componente | **ao lado do arquivo testado**, com o mesmo nome e sufixo `.test.tsx` (`App.tsx` → `App.test.tsx`) | existe |
| Página (composição de features) | `frontend/src/pages/` | contrato |
| Teste ponta a ponta | `frontend/tests/e2e/` — entra junto com o alvo `check-e2e` | contrato |
| Imagem ou SVG importado pelo código | `frontend/src/assets/` | existe |
| Arquivo servido cru, sem bundler (favicon) | `frontend/public/` | existe |

### Backend — tudo contrato

| Vou criar… | Vai em |
|---|---|
| Rota HTTP | `src/focusquest/modules/<módulo>/router.py` |
| Contrato de entrada/saída da API | `src/focusquest/modules/<módulo>/schemas.py` |
| Caso de uso | `src/focusquest/modules/<módulo>/service.py` |
| Regra de domínio | `src/focusquest/modules/<módulo>/domain.py` |
| Modelo (tabela SQLAlchemy) | `src/focusquest/modules/<módulo>/models.py` |
| Consulta ou gravação no banco | `src/focusquest/modules/<módulo>/repository.py` |
| Migração | `alembic/versions/` |
| Configuração, conexão, infraestrutura comum | `src/focusquest/core/` |
| Teste unitário / de integração | `tests/unit/` / `tests/integration/` |

**Lembrete de contrato:** o primeiro arquivo `.py` do repositório traz junto o
alvo `check-api` do Makefile e o job correspondente do CI. Isso não é
opcional; está em `docs/QUALITY.md` §4.

### Fora da aplicação

| Vou criar… | Vai em |
|---|---|
| Lógica de shell com mais de duas linhas usada pelo gate | `scripts/` (decisão D6: o Make do macOS roda cada linha em sua própria shell) |
| Job do CI | `.github/workflows/quality.yml`, **só depois** de existir o alvo do Makefile que ele executa |
| Documentação de arquitetura | este arquivo |
| Configuração de execução compartilhada do PyCharm | `.run/` (ainda não existe; versionado de propósito) |

## 5. Convenções de fronteira

1. **Não importe detalhe interno de outra feature.** Se `missions` precisa de
   algo de `tutoring`, ou o que ela precisa é compartilhado — e então sobe
   para `shared/` — ou a dependência está errada. Importar
   `features/tutoring/internals/...` de dentro de `features/missions/` é o
   acoplamento que a divisão por feature existe para impedir.
2. **Nada de dependência circular.** Se A importa B e B importa A, o que as
   duas realmente compartilham é uma terceira coisa que ainda não foi
   extraída. Extraia-a em vez de fechar o ciclo.
3. **Só sobe para `shared/` o que é realmente compartilhado.** O critério é
   uso real por mais de uma feature, não expectativa de reúso futuro. Regra
   específica de uma feature fica na feature — mesmo que pareça genérica.
4. **Nada de depósito de código.** `utils`, `common`, `helpers` e um `core/`
   usado como sótão acumulam funções sem dono, e ninguém consegue dizer de que
   o arquivo é responsável. Se o nome do módulo não descreve uma
   responsabilidade, o módulo está errado. Prefira funções e composição;
   Repository, Unit of Work, Strategy e Adapter só quando resolverem um
   problema real (README §3).
5. **Centralize configuração, cliente HTTP, erros e tokens visuais.** Cada um
   em um lugar, não replicado por feature.
6. **Os dois alertas explícitos do README §3**, repetidos porque são os dois
   defeitos que este projeto mais provavelmente cometeria:
   - **Nada de `App.tsx` gigante.** Hoje `App.tsx` tem nove linhas. No momento
     em que ele começar a acumular telas, estado e chamadas, o conteúdo se
     divide em `pages/` e `features/` — o crescimento dele é o sinal, não a
     consequência.
   - **Nada de chamadas HTTP espalhadas por componentes.** Toda ida à rede
     passa pelo cliente de `shared/api/`, com tratamento de erro no mesmo
     lugar. Um `fetch` dentro de um componente é um defeito de arquitetura,
     não um atalho.
7. **Interface em português do Brasil; identificadores em inglês.** O texto
   que o usuário lê é pt-BR; nomes de variáveis, funções, tipos, arquivos e
   rotas são em inglês.

## 6. Qual documento responde o quê

| Pergunta | Documento |
|---|---|
| O que o produto deve ser? Qual a regra da spec sobre isto? | `README.md` — autoridade final |
| Onde vai este arquivo? De que este diretório é responsável? | **este documento** |
| Como rodo o gate? O que ele mede, o que não mede, e o que ele **não** protege? | `docs/QUALITY.md` |
| O que já foi feito, o que foi decidido e por quê, o que ainda está pendente? | `docs/HANDOFF.md` |
| Como trabalho aqui sem quebrar nada? | `AGENTS.md` (e `CLAUDE.md`, que o importa) |

A fronteira entre este documento e os outros dois de `docs/`: **arquitetura**
descreve a forma do código e não fala de comandos; **qualidade** descreve a
verificação e não fala de onde o arquivo mora; **handoff** descreve o estado
em um momento do tempo e envelhece de propósito, enquanto estes dois só mudam
quando a forma ou o gate mudam.
