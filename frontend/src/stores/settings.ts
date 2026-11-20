import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { oneOf, readStored, writeStored } from './storage'

export const SETTINGS_STORAGE_KEY = 'tasky:settings'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

/** `'all'` shows every matching task on one page, with no pagination. */
export const PAGE_SIZES = [10, 20, 50, 'all'] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export const LOCALES = ['uk', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** How much room the rows, cards and table rows take. */
export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

const BOOLEANS = [true, false] as const

const UKRAINIAN_LANGUAGE_TAG = /^uk(-|$)/i

function browserLocale(): Locale {
  return UKRAINIAN_LANGUAGE_TAG.test(navigator.language ?? '') ? 'uk' : 'en'
}

interface Settings {
  theme: Theme
  pageSize: PageSize
  locale: Locale
  density: Density
  /** Whether list rows and board cards show the first line of the description under the title. */
  showDescriptions: boolean
}

type StoredSettings = Partial<Record<keyof Settings, unknown>> | null

// Each field is checked on its own, so one bad value does not throw away the others.
function loadSettings(): Settings {
  const stored = readStored(SETTINGS_STORAGE_KEY) as StoredSettings
  return {
    theme: oneOf(THEMES, stored?.theme, 'system'),
    pageSize: oneOf(PAGE_SIZES, stored?.pageSize, 20),
    locale: oneOf(LOCALES, stored?.locale, browserLocale()),
    density: oneOf(DENSITIES, stored?.density, 'comfortable'),
    showDescriptions: oneOf(BOOLEANS, stored?.showDescriptions, false),
  }
}

// main.css pins a colour scheme by the attribute; without it the page follows the OS.
function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = loadSettings()
  const theme = ref<Theme>(initial.theme)
  const pageSize = ref<PageSize>(initial.pageSize)
  const locale = ref<Locale>(initial.locale)
  const density = ref<Density>(initial.density)
  const showDescriptions = ref(initial.showDescriptions)

  // Synchronous, so a change is on the page and in storage by the time the assignment returns.
  watch(theme, applyTheme, { flush: 'sync', immediate: true })
  watch(
    [theme, pageSize, locale, density, showDescriptions],
    () => {
      const settings: Settings = {
        theme: theme.value,
        pageSize: pageSize.value,
        locale: locale.value,
        density: density.value,
        showDescriptions: showDescriptions.value,
      }
      writeStored(SETTINGS_STORAGE_KEY, settings)
    },
    { flush: 'sync' },
  )

  return { theme, pageSize, locale, density, showDescriptions }
})
