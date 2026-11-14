# Conversa e painel da Tutoria nos componentes do design system

## Objetivo
Migrar a conversa (`TutorConversation`) e o painel (`TutorPanel`) da Kairya
para os componentes de `shared/ui`. É a segunda metade da Tutoria no item #173
da guarda-chuva #208; a primeira foram os cartões de proposta (PR #218). A
animação da lanterna fica para um incremento próprio.

Revisão-base: `main` em `a9f3b2a`.

## Decisões e porquê
- **`Button` aceita `ref`.** O painel devolve o foco a três botões (recolher,
  abrir e fechar a folha). No React 19 o `ref` é prop comum e o `Button` já o
  repassava em `rest`; faltava só o tipo. Teste novo em `Button.test.tsx`.
- **Botões:**
  - Enviar é o primário da conversa, com `disabled` como antes.
  - Tentar de novo, Recarregar, Recolher/Expandir e Fechar a conversa são
    secundários.
  - "Falar com a Kairya", no celular, é primário dentro de um `div` fixo no
    canto, sem `rounded-full` nem sombra.
- **Carregando o histórico:** vira `Skeleton`, com a mesma estrutura de antes
  (status `sr-only` e três linhas `aria-hidden`).
- **Bolhas:** continuam `li` com classes de token. A do usuário é
  `bg-bg-raised`. A da Kairya é `bg-bg-surface` com contorno
  `border-border-subtle`, declarado decorativo em
  `gradientContrast.test.ts`: a bolha não é controle, e o autor escrito
  identifica cada uma. O `SpeechBubble` (`figure`) não serve aqui, porque
  mudaria a lista que o leitor de tela percorre.
- **Campo da pergunta:** continua `textarea` próprio, com as classes do
  `Field`. O `help` do `Field` só aceita texto, e o contador é um componente
  com `data-testid`.
- **Cores:**
  - Âmbar vira `text-action-primary` (não existe token de aviso): marcas de
    estado, "Escrevendo…" e o aviso de indisponível.
  - Vermelho vira `text-feedback-danger`, e os cinzas viram `text-text-muted`
    ou `text-text-primary`.
- **Folha do celular:**
  - `max-h-[85dvh]` (valor arbitrário) vira a classe `.tutor-sheet` no
    `index.css`.
  - O topo é `rounded-t-ui`, com `border-t border-border-strong`.
  - O fundo escurecido é `bg-bg-canvas/80`.
- **Bordas do painel no desktop:** a cor já vinha do `.rpg-tutor`
  (`border-strong`), que vence a classe utilitária. Por isso
  `lg:border-slate-800` saiu sem substituta, junto com as duas entradas
  decorativas do `TutorPanel`.
- **Nits da revisão:**
  - Os três cartões saíram da lista do `.rpg-tutor` em
    `gradientContrast.test.ts` (nit 1 do PR #218).
  - Saiu o `text-action-primary` redundante do h3 do resumo de conquistas em
    `ProgressPanel` (nit 1 do PR #217); o h3 herda a cor do `summary`.
- **Fim da catraca:** com os dois arquivos limpos, a `PENDING_MIGRATION` do
  `designLint.test.ts` ficaria vazia. Ela e o teste que a conferia saíram, e
  as regras passam a valer para todo arquivo.

## Alterações
- `features/tutoring/TutorConversation.tsx` e `TutorPanel.tsx`.
- `shared/ui/Button.tsx` e `Button.test.tsx`: `ref`.
- `shared/ui/designLint.test.ts`: catraca removida.
- `styles/gradientContrast.test.ts`: lista do painel e bordas decorativas.
- `src/index.css`: `.tutor-sheet`.
- `features/progression/ProgressPanel.tsx`: classe redundante.

## Pendências
- Com várias propostas abertas, a conversa mostra mais de um primário
  (Confirmar de cada cartão, mais Enviar). Isso fica como nota para o design
  (nit 2 do PR #218).
- `.tutor-conversation [role='region']`, `.tutor-name` e `.tutor-portrait` no
  `index.css` ainda usam hex próprios. O lint não os acusa (só mira classes);
  trocar por tokens é ajuste visual à parte.
- `w-96`/`w-20` no contêiner do desktop são vencidos pelas larguras do
  `index.css` em telas grandes. Não mudam nada, mas confundem quem lê.
