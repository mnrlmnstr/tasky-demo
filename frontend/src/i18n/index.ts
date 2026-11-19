import type { Pinia } from 'pinia'
import { watch } from 'vue'
import { createI18n } from 'vue-i18n'

import { useSettingsStore } from '../stores/settings'
import en from './messages/en'
import uk from './messages/uk'

const UKRAINIAN_PLURALS = new Intl.PluralRules('uk')

// Position of each plural category among the forms of a Ukrainian message: «задача | задачі | задач».
// Fractions ("other") take the second form: «1,5 задачі».
const UKRAINIAN_FORM: Record<Intl.LDMLPluralRule, number> = {
  zero: 2,
  one: 0,
  two: 1,
  few: 1,
  many: 2,
  other: 1,
}

function ukrainianPluralForm(count: number): number {
  return UKRAINIAN_FORM[UKRAINIAN_PLURALS.select(count)]
}

/**
 * The app's vue-i18n instance. Its language is the settings store's `locale`: assigning that field
 * switches every message and `<html lang>` at once.
 */
export function createAppI18n(pinia: Pinia) {
  const settings = useSettingsStore(pinia)
  const i18n = createI18n({
    legacy: false,
    locale: settings.locale,
    fallbackLocale: 'en',
    messages: { en, uk },
    pluralRules: { uk: ukrainianPluralForm },
  })

  watch(
    () => settings.locale,
    (locale) => {
      i18n.global.locale.value = locale
      document.documentElement.lang = locale
    },
    { flush: 'sync', immediate: true },
  )

  return i18n
}
