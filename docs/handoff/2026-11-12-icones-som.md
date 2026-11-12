# Ícones distintos nos botões de som (2026-11-12)

- `SoundToggle` usava o mesmo alto-falante nos dois canais; agora `voice` é um balão de fala (duas linhas de texto; cortado = balão com barra diagonal) e `sfx` é uma nota musical (cortada = nota com barra diagonal). A forma muda entre ligado e cortado, não só a cor.
- Mantidos `data-testid` `sound-icon-on`/`sound-icon-off`; novo `data-icon="voice"|"sfx"` identifica o canal. Testes novos: ícone por canal (`test.each`), desenhos distintos e nomes acessíveis diferentes em PT e EN.
- A fila de sons da 1ª diária não mudou: a spec F8 D17 / Review Focus 5 define um play por conclusão, com prioridade level_up > achievement > lantern_lit.
