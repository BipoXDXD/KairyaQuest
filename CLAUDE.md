@AGENTS.md

## Claude Code

O arquivo acima é importado, não duplicado: as regras do projeto moram todas
em `AGENTS.md` e valem aqui sem alteração. Esta seção só registra o que é
específico do Claude Code.

**Por que o import existe.** O Claude Code lê `CLAUDE.md`, não `AGENTS.md`.
A documentação oficial recomenda exatamente este arranjo para um repositório
que já usa `AGENTS.md` com outros agentes: um `CLAUDE.md` que o importa com a
sintaxe `@caminho`, seguido do conteúdo específico do Claude. O import é
expandido e carregado no início da sessão, antes desta seção.

**Confirme que carregou — pelo conteúdo, não pela listagem.** O teste é
saber, sem abrir arquivo nenhum, o que o `AGENTS.md` manda: por exemplo, que
a `main` é protegida e que nenhum alvo do Makefile invoca `pre-commit`. Se
você não tem esse conteúdo em contexto, está trabalhando sem as regras do
projeto — leia `AGENTS.md` à mão antes de continuar.

`/context` lista os arquivos de memória carregados e é onde a documentação
oficial manda conferir que o `CLAUDE.md` entrou. **Não conte com ver
`AGENTS.md` como uma linha própria ali:** ele é um import, e não foi
verificado se a listagem mostra um arquivo importado com nome próprio ou já
expandido dentro do `CLAUDE.md`. Ausência na listagem não prova que não
carregou — por isso o critério acima é o conteúdo.

**Instruções de nível de usuário não relaxam estas.** Um `~/.claude/CLAUDE.md`
pessoal também é carregado e pode contradizer o projeto em matéria de estilo
ou de idioma de resposta. Em conflito sobre **qualidade** — gate, cobertura,
hooks, proteção da `main`, veracidade das afirmações —, vale o `AGENTS.md`
deste repositório. É o que o README §13 quer dizer com "instruções aninhadas
não enfraquecem qualidade".

**Hooks de git não são hooks do Claude Code.** As duas coisas se chamam
"hook" e não têm relação: `make check` roda porque o `pre-commit` está
instalado no `.git/hooks` deste clone, e continuará rodando para qualquer
ferramenta que chame `git commit`. Não tente reimplementar o gate como hook
de sessão.
