import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Fitness function da i18n: na interface ja traduzida, todo texto que a
    // pessoa le passa pelo `t()`. Um literal com letra no JSX, ou num atributo
    // que a pessoa le ou ouve, nao muda com o idioma. Glifos (▸, ✦) e
    // `alt=""` de imagem decorativa passam: nao ha letra. O escopo cresce a
    // cada area migrada; o teste e `tests/unit/no-literal-jsx.test.ts`.
    files: [
      'src/app/**/*.tsx',
      'src/pages/Headquarters.tsx',
      'src/features/missions/**/*.tsx',
      'src/features/tutoring/**/*.tsx',
    ],
    ignores: ['src/shared/i18n/**', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/\\p{L}/u]',
          message: 'Texto de interface vai pelo t(), nunca literal no JSX.',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > Literal[value=/\\p{L}/u]',
          message: 'Texto de interface vai pelo t(), nunca literal no atributo.',
        },
      ],
    },
  },
])
