// Mora num `.ts` e não num `.tsx`: o lint de design (`designLint.test.ts`)
// varre `src/**/*.{ts,tsx,css}`, então estas classes continuam governadas.
/** Classes de foco, desabilitado e toque comuns a todo botão do design system. */
export const BUTTON_BASE =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-ui border font-body text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-safe:active:translate-y-px'
