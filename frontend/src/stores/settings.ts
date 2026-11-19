import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const SETTINGS_STORAGE_KEY = 'tasky:settings'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const PAGE_SIZES = [10, 20, 50] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export const LOCALES = ['uk', 'en'] as const
export type Locale = (typeof LOCALES)[number]

const UKRAINIAN_LANGUAGE_TAG = /^uk(-|$)/i

function browserLocale(): Locale {
  return UKRAINIAN_LANGUAGE_TAG.test(navigator.language ?? '') ? 'uk' : 'en'
}

interface Settings {
  theme: Theme
  pageSize: PageSize
  locale: Locale
}

type StoredSettings = Partial<Record<keyof Settings, unknown>> | null

// Storage can be absent, blocked or hold anything another script or an older version wrote; all of that reads as "nothing saved".
function readStoredSettings(): StoredSettings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null') as StoredSettings
  } catch {
    return null
  }
}

function oneOf<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback
}

// Each field is checked on its own, so one bad value does not throw away the others.
function loadSettings(): Settings {
  const stored = readStoredSettings()
  return {
    theme: oneOf(THEMES, stored?.theme, 'system'),
    pageSize: oneOf(PAGE_SIZES, stored?.pageSize, 20),
    locale: oneOf(LOCALES, stored?.locale, browserLocale()),
  }
}

// Private browsing, a full quota or a blocked storage must not break the app: the setting then lasts for the visit only.
function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    return
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

  // Synchronous, so a change is on the page and in storage by the time the assignment returns.
  watch(theme, applyTheme, { flush: 'sync', immediate: true })
  watch(
    [theme, pageSize, locale],
    () => saveSettings({ theme: theme.value, pageSize: pageSize.value, locale: locale.value }),
    { flush: 'sync' },
  )

  return { theme, pageSize, locale }
})
