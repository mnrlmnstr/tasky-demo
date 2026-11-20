import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import indexHtml from '../../index.html?raw'
import { SETTINGS_STORAGE_KEY, useSettingsStore } from './settings'

function browserLanguageIs(language: string): void {
  vi.stubGlobal('navigator', { language })
}

function storedSettingsAre(value: unknown): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value))
}

function storedSettings(): unknown {
  return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')
}

// A fresh pinia stands for a page load: the store is built again from what the browser holds.
function loadStore() {
  setActivePinia(createPinia())
  return useSettingsStore()
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  browserLanguageIs('en-US')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('first visit', () => {
  it('starts with the system theme and 20 tasks per page', () => {
    const settings = loadStore()

    expect(settings.theme).toBe('system')
    expect(settings.pageSize).toBe(20)
  })

  it.each([
    ['uk', 'uk'],
    ['uk-UA', 'uk'],
    ['UK-ua', 'uk'],
    ['en-US', 'en'],
    ['de-DE', 'en'],
    ['ukr', 'en'],
    ['', 'en'],
  ])('with the browser language "%s" the locale is %s', (language, locale) => {
    browserLanguageIs(language)

    const settings = loadStore()

    expect(settings.locale).toBe(locale)
  })

  it('falls back to English when the browser reports no language', () => {
    vi.stubGlobal('navigator', {})

    const settings = loadStore()

    expect(settings.locale).toBe('en')
  })

  it('leaves the page following the OS theme', () => {
    loadStore()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('writes nothing to local storage', () => {
    loadStore()

    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull()
  })
})

describe('returning visit', () => {
  it('restores the saved theme, page size and language', () => {
    storedSettingsAre({ theme: 'dark', pageSize: 50, locale: 'uk' })

    const settings = loadStore()

    expect(settings.theme).toBe('dark')
    expect(settings.pageSize).toBe(50)
    expect(settings.locale).toBe('uk')
  })

  it.each(['light', 'dark'] as const)('pins the page to the saved %s theme', (theme) => {
    storedSettingsAre({ theme, pageSize: 20, locale: 'en' })

    loadStore()

    expect(document.documentElement.getAttribute('data-theme')).toBe(theme)
  })

  it('clears a stale pinned theme when the saved theme is system', () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    storedSettingsAre({ theme: 'system', pageSize: 20, locale: 'en' })

    loadStore()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('keeps the saved language over the browser language', () => {
    browserLanguageIs('uk-UA')
    storedSettingsAre({ theme: 'system', pageSize: 20, locale: 'en' })

    const settings = loadStore()

    expect(settings.locale).toBe('en')
  })

  it('keeps what a previous visit changed', () => {
    const firstVisit = loadStore()
    firstVisit.theme = 'light'
    firstVisit.pageSize = 10
    firstVisit.locale = 'uk'

    const secondVisit = loadStore()

    expect(secondVisit.theme).toBe('light')
    expect(secondVisit.pageSize).toBe(10)
    expect(secondVisit.locale).toBe('uk')
  })
})

describe('unusable saved data', () => {
  it.each([
    ['an unknown theme', { theme: 'sepia', pageSize: 50, locale: 'uk' }, 'system', 50, 'uk'],
    ['a non-string theme', { theme: 1, pageSize: 50, locale: 'uk' }, 'system', 50, 'uk'],
    ['an unsupported page size', { theme: 'dark', pageSize: 25, locale: 'uk' }, 'dark', 20, 'uk'],
    ['a page size as text', { theme: 'dark', pageSize: '50', locale: 'uk' }, 'dark', 20, 'uk'],
    ['an unknown language', { theme: 'dark', pageSize: 50, locale: 'de' }, 'dark', 50, 'en'],
    ['a missing theme', { pageSize: 50, locale: 'uk' }, 'system', 50, 'uk'],
    ['a missing page size', { theme: 'dark', locale: 'uk' }, 'dark', 20, 'uk'],
    ['a missing language', { theme: 'dark', pageSize: 50 }, 'dark', 50, 'en'],
    ['an empty object', {}, 'system', 20, 'en'],
    ['null', null, 'system', 20, 'en'],
    ['a list', ['dark', 50, 'uk'], 'system', 20, 'en'],
    ['a bare string', 'dark', 'system', 20, 'en'],
    ['a number', 50, 'system', 20, 'en'],
  ])('with %s each field falls back on its own', (_case, stored, theme, pageSize, locale) => {
    storedSettingsAre(stored)

    const settings = loadStore()

    expect(settings.theme).toBe(theme)
    expect(settings.pageSize).toBe(pageSize)
    expect(settings.locale).toBe(locale)
  })

  it('takes the browser language when the saved language is invalid', () => {
    browserLanguageIs('uk-UA')
    storedSettingsAre({ theme: 'dark', pageSize: 50, locale: 'de' })

    const settings = loadStore()

    expect(settings.locale).toBe('uk')
  })

  it('starts from the defaults when the saved text is not JSON', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{theme: dark')

    const settings = loadStore()

    expect(settings.theme).toBe('system')
    expect(settings.pageSize).toBe(20)
    expect(settings.locale).toBe('en')
  })

  it('starts from the defaults when local storage refuses to read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('access denied', 'SecurityError')
      },
    })

    const settings = loadStore()

    expect(settings.theme).toBe('system')
    expect(settings.pageSize).toBe(20)
    expect(settings.locale).toBe('en')
  })

  it('starts from the defaults when there is no local storage', () => {
    vi.stubGlobal('localStorage', undefined)

    const settings = loadStore()

    expect(settings.theme).toBe('system')
    expect(settings.pageSize).toBe(20)
    expect(settings.locale).toBe('en')
  })

  it('does not take a setting from the object prototype', () => {
    storedSettingsAre({ theme: 'toString', pageSize: 'constructor', locale: '__proto__' })

    const settings = loadStore()

    expect(settings.theme).toBe('system')
    expect(settings.pageSize).toBe(20)
    expect(settings.locale).toBe('en')
  })
})

// The snippet in index.html runs before the stylesheet and the app, so it cannot import the store:
// these tests keep the two reading the same key and shape.
describe('pre-paint snippet in index.html', () => {
  const inlineScript = /<script>([\s\S]*?)<\/script>/

  function runPrePaintSnippet(): void {
    const source = inlineScript.exec(indexHtml)?.[1] ?? 'throw new Error("no inline script in index.html")'
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs the inline snippet from index.html exactly as the browser would
    new Function(source)()
  }

  it.each(['light', 'dark'] as const)('pins the %s theme the store saved', (theme) => {
    loadStore().theme = theme
    document.documentElement.removeAttribute('data-theme')

    runPrePaintSnippet()

    expect(document.documentElement.getAttribute('data-theme')).toBe(theme)
  })

  it('leaves the page following the OS when the store saved the system theme', () => {
    const settings = loadStore()
    settings.theme = 'dark'
    settings.theme = 'system'

    runPrePaintSnippet()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('leaves the page following the OS when nothing is saved', () => {
    runPrePaintSnippet()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it.each([
    ['an unknown theme', JSON.stringify({ theme: 'sepia' })],
    ['a non-string theme', JSON.stringify({ theme: ['dark'] })],
    ['no theme', JSON.stringify({ pageSize: 50 })],
    ['null', 'null'],
    ['a bare string', '"dark"'],
    ['text that is not JSON', '{theme: dark'],
  ])('ignores saved data holding %s', (_case, saved) => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, saved)

    runPrePaintSnippet()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('survives local storage that refuses to read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('access denied', 'SecurityError')
      },
    })

    runPrePaintSnippet()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('survives a browser without local storage', () => {
    vi.stubGlobal('localStorage', undefined)

    runPrePaintSnippet()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('sits in the head, ahead of the app script', () => {
    const head = indexHtml.slice(0, indexHtml.indexOf('</head>'))

    expect(head).toMatch(inlineScript)
  })
})

describe('changing the theme', () => {
  it.each(['light', 'dark'] as const)('pins the page to the %s theme at once', (theme) => {
    const settings = loadStore()

    settings.theme = theme

    expect(document.documentElement.getAttribute('data-theme')).toBe(theme)
  })

  it('goes back to following the OS when set to system', () => {
    const settings = loadStore()
    settings.theme = 'dark'

    settings.theme = 'system'

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('saving', () => {
  it('stores all the settings as one object when the theme changes', () => {
    const settings = loadStore()

    settings.theme = 'dark'

    expect(storedSettings()).toEqual({ theme: 'dark', pageSize: 20, locale: 'en', density: 'comfortable', showDescriptions: false })
  })

  it('stores a changed page size', () => {
    const settings = loadStore()

    settings.pageSize = 50

    expect(storedSettings()).toEqual({ theme: 'system', pageSize: 50, locale: 'en', density: 'comfortable', showDescriptions: false })
  })

  it('stores a changed language', () => {
    const settings = loadStore()

    settings.locale = 'uk'

    expect(storedSettings()).toEqual({ theme: 'system', pageSize: 20, locale: 'uk', density: 'comfortable', showDescriptions: false })
  })

  it('still applies a change when local storage refuses to write', () => {
    const settings = loadStore()
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      },
    })

    settings.theme = 'dark'

    expect(settings.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('still applies a change when there is no local storage', () => {
    const settings = loadStore()
    vi.stubGlobal('localStorage', undefined)

    settings.pageSize = 10

    expect(settings.pageSize).toBe(10)
  })
})

// The inline snippet cannot import the store, so the key is written out there a second time.
describe('storage key in index.html', () => {
  it('is the key the store saves under', () => {
    expect(indexHtml).toContain(`localStorage.getItem('${SETTINGS_STORAGE_KEY}')`)
  })
})
