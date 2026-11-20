import js from '@eslint/js'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

// There is no formatter in this project, so the rules that only police layout (indentation,
// line breaks, attribute wrapping) stay off; every rule that can catch a bug stays on.
const vueLayoutRulesOff = Object.fromEntries(
  Object.entries(pluginVue.rules)
    .filter(([, rule]) => rule.meta?.type === 'layout')
    .map(([name]) => [`vue/${name}`, 'off']),
)

export default defineConfigWithVueTs(
  {
    name: 'tasky/ignores',
    // src/api/generated is orval output: regenerated with `npm run api:generate`, never edited by hand.
    ignores: ['src/api/generated/**', 'dist/**', 'coverage/**'],
  },
  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommendedTypeChecked,
  {
    name: 'tasky/no-layout-rules',
    rules: vueLayoutRulesOff,
  },
  {
    name: 'tasky/rules',
    rules: {
      // The same convention as `noUnusedParameters` in tsconfig: a leading underscore marks a
      // value that is left out on purpose, and a rest sibling drops the keys destructured before it.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // The ui primitives and the pager are single words by design; templates use them in
      // PascalCase, so they never clash with native elements such as <button> or <dialog>.
      'vue/multi-word-component-names': [
        'error',
        { ignores: ['Badge', 'Button', 'Dialog', 'Pagination', 'Switch'] },
      ],
    },
  },
  {
    name: 'tasky/tests',
    files: ['src/**/*.test.ts', 'src/test/**/*.ts'],
    rules: {
      // Fakes stand in for promise-returning APIs such as fetch: an async fake with no await still
      // has to return a promise and turn a throw into a rejection, which is what the code under test sees.
      '@typescript-eslint/require-await': 'off',
    },
  },
)
