import { createPinia, setActivePinia } from 'pinia'

import { createAppI18n } from '../i18n'
import { type Locale, useSettingsStore } from '../stores/settings'

/**
 * What main.ts installs, for `mount(Component, { global: { plugins: appPlugins() } })`.
 * A fresh pinia per call, also made the active one, so `useSettingsStore()` in the test is the store the component sees.
 */
export function appPlugins(locale: Locale = 'en') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSettingsStore(pinia).locale = locale
  return [pinia, createAppI18n(pinia)]
}
