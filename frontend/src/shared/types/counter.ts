/**
 * O estado de um contador de caracteres perto de um limite, sem texto: quem
 * exibe escolhe a frase no catalogo, pelo `kind` e pelo plural de `n`.
 *
 * - `remaining`: quantos caracteres ainda cabem (0 inclusive);
 * - `over`: quantos passaram do limite (sempre >= 1).
 *
 * Mora em `shared/` porque a tutoria e as missoes o usam, e uma feature nao
 * importa da outra.
 */
export type Counter = { kind: 'remaining'; n: number } | { kind: 'over'; n: number }
