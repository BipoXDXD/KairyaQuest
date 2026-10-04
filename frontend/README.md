# Frontend do FocusQuest

Interface de estudos em português brasileiro, com Quartel-General,
Campanhas e conversa com a Tifa. Usa o frontend existente em React,
TypeScript, Vite e Tailwind; as versões reproduzíveis estão em
`package-lock.json`.

As regras do repositório estão em [AGENTS.md](../AGENTS.md). Leia também
[README](../README.md), [arquitetura](../docs/ARCHITECTURE.md),
[handoff](../docs/HANDOFF.md) e [qualidade](../docs/QUALITY.md) antes de
alterar o código.

## Executar localmente

Prepare dependências, hooks e PostgreSQL pelo roteiro de primeiro uso em
[QUALITY](../docs/QUALITY.md). Na raiz, em um terminal:

```bash
make migrate
uv run uvicorn focusquest.main:app --host 127.0.0.1 --port 8000
```

Neste diretório, em outro terminal:

```bash
if [ ! -e .env ]; then cp .env.example .env; fi
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Faça a cópia do `.env.example` apenas se ainda não houver `.env` local.
`VITE_API_URL=/api` faz o navegador usar a mesma origem; o proxy do Vite
encaminha para a API em `127.0.0.1:8000`. Para uma API em outra porta,
defina `API_PROXY_TARGET` no ambiente do processo do Vite. Essa variável
não é lida do `.env` por `process.env`; veja `vite.config.ts`.

Não coloque chaves do provedor em variáveis `VITE_*`: elas chegam ao
navegador. A disponibilidade da Tifa é decidida pelo backend; sem provedor
configurado, a interface informa indisponibilidade.

## Build e verificações

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
VITE_API_URL=/api npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

O preview serve o build existente para inspeção local; não é um servidor
de produção. `VITE_*` é incorporado durante o build, portanto mudar o valor
somente ao iniciar o preview não altera o bundle. Veja a
[documentação do Vite](https://vite.dev/guide/env-and-mode) e os
[comandos de preview](https://vite.dev/guide/cli#vite-preview).

O gate do projeto é `make check`, executado na raiz. Ele também verifica
backend, build, Playwright/Chromium, axe-core e segredos. Não substitua esse
gate por uma suíte filtrada antes de propor uma entrega. O E2E usa API,
frontend e provedor falso próprios, sem chamadas pagas.

Para trabalhar em paralelo, use o worktree criado por
`scripts/novo-worktree.sh`: banco e portas exclusivos. Não rode
`make db-up` fora do checkout principal e não execute `check-api` e
`check-e2e` simultaneamente no mesmo banco.

## Onde alterar

- `src/app/`: áreas e navegação; hoje a área ativa é estado local.
- `src/pages/`: composição de telas e coordenação entre features.
- `src/features/`: componentes, contratos, hooks e testes da funcionalidade.
- `src/shared/`: cliente HTTP, tipos, hooks e funções com usuários reais em
  mais de uma feature; componentes não chamam `fetch` diretamente.
- `src/test/`: infraestrutura de testes de componentes.
- `tests/e2e/`: fluxos de navegador. Cenários de persistência usam API,
  banco e provedor falso reais; geometria, foco e corridas de interface usam
  requisições interceptadas conforme o cenário, inclusive SSE simulado.
  Essas fixtures de interface não comprovam persistência.
- `src/index.css`: estilos globais e movimento da recompensa.

Vitest exige 100% de linhas, ramificações, funções e instruções do código
de aplicação em `src/`; o denominador e suas exclusões estão em
`vite.config.ts` e [QUALITY](../docs/QUALITY.md). Testes de componente não
substituem a inspeção visual de desktop/celular ou a validação num aparelho
com teclado virtual.

O retrato da Tifa permanece um placeholder original. Não há assets oficiais
do jogo, tutoria simulada de produção ou autenticação implementada. A entrega
com evidência e a avaliação da Tifa estão implementadas; a avaliação é
interpretação do modelo, identificada na tela. O roadmap e as limitações
atuais estão no handoff.
