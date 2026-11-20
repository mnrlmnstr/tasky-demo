import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SETTINGS_STORAGE_KEY, useSettingsStore } from '../stores/settings'
import { createAppI18n } from './index'
import en from './messages/en'
import uk from './messages/uk'

function browserLanguageIs(language: string): void {
  vi.stubGlobal('navigator', { language })
}

// A fresh pinia stands for a page load: the settings are read again from what the browser holds.
function loadApp() {
  const pinia = createPinia()
  const i18n = createAppI18n(pinia)
  return { settings: useSettingsStore(pinia), t: i18n.global.t, i18n }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.lang = 'en'
  browserLanguageIs('en-US')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('active language', () => {
  it('speaks English on a first visit from an English browser', () => {
    const { t } = loadApp()

    expect(t('header.newTask')).toBe('New task')
  })

  it('speaks Ukrainian on a first visit from a Ukrainian browser', () => {
    browserLanguageIs('uk-UA')

    const { t } = loadApp()

    expect(t('header.newTask')).toBe('Нова задача')
  })

  it('speaks the saved language whatever the browser prefers', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ locale: 'uk' }))

    const { t } = loadApp()

    expect(t('header.settings')).toBe('Налаштування')
  })

  it('switches to Ukrainian as soon as the language setting changes', () => {
    const { settings, t } = loadApp()

    settings.locale = 'uk'

    expect(t('header.newTask')).toBe('Нова задача')
  })

  it('switches back to English as soon as the language setting changes', () => {
    browserLanguageIs('uk-UA')
    const { settings, t } = loadApp()

    settings.locale = 'en'

    expect(t('header.newTask')).toBe('New task')
  })

  it('falls back to English for a message another language lacks', () => {
    const { i18n } = loadApp()

    expect(i18n.global.fallbackLocale.value).toBe('en')
  })

  it('fills the named values into a message', () => {
    const { t } = loadApp()

    expect(t('pagination.page', { page: 2, pages: 7 })).toBe('Page 2 of 7')
  })
})

describe('document language', () => {
  it('marks the page as Ukrainian when it starts in Ukrainian', () => {
    browserLanguageIs('uk-UA')

    loadApp()

    expect(document.documentElement.lang).toBe('uk')
  })

  it('marks the page as English when it starts in English', () => {
    document.documentElement.lang = 'uk'

    loadApp()

    expect(document.documentElement.lang).toBe('en')
  })

  it('follows the language setting when it changes', () => {
    const { settings } = loadApp()

    settings.locale = 'uk'

    expect(document.documentElement.lang).toBe('uk')
  })
})

describe('task count', () => {
  it.each([
    [0, '0 tasks'],
    [1, '1 task'],
    [2, '2 tasks'],
    [5, '5 tasks'],
    [11, '11 tasks'],
    [21, '21 tasks'],
    [101, '101 tasks'],
  ])('reads %d in English as "%s"', (count, expected) => {
    const { t } = loadApp()

    expect(t('list.total', count)).toBe(expected)
  })

  it.each([
    [0, '0 задач'],
    [1, '1 задача'],
    [2, '2 задачі'],
    [3, '3 задачі'],
    [4, '4 задачі'],
    [5, '5 задач'],
    [10, '10 задач'],
    [11, '11 задач'],
    [12, '12 задач'],
    [13, '13 задач'],
    [14, '14 задач'],
    [15, '15 задач'],
    [20, '20 задач'],
    [21, '21 задача'],
    [22, '22 задачі'],
    [24, '24 задачі'],
    [25, '25 задач'],
    [100, '100 задач'],
    [101, '101 задача'],
    [102, '102 задачі'],
    [111, '111 задач'],
    [112, '112 задач'],
    [114, '114 задач'],
    [121, '121 задача'],
    [1000, '1000 задач'],
  ])('reads %d in Ukrainian as "%s"', (count, expected) => {
    const { settings, t } = loadApp()
    settings.locale = 'uk'

    expect(t('list.total', count)).toBe(expected)
  })
})

type MessageTree = { [key: string]: string | MessageTree }

function keyPaths(tree: MessageTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keyPaths(value, `${prefix}${key}.`),
  )
}

function texts(tree: MessageTree): string[] {
  return Object.values(tree).flatMap((value) => (typeof value === 'string' ? [value] : texts(value)))
}

describe('message files', () => {
  it('hold the same keys in Ukrainian and in English', () => {
    expect(keyPaths(uk).sort()).toEqual(keyPaths(en).sort())
  })

  it.each([
    ['English', en],
    ['Ukrainian', uk],
  ])('leave no %s message empty', (_language, messages) => {
    expect(texts(messages).filter((text) => text.trim() === '')).toEqual([])
  })

  it.each([
    'app.title',
    'header.settings',
    'header.newTask',
    'errors.network',
    'errors.server',
    'errors.not_found',
    'errors.generic',
    'list.loading',
    'list.empty',
    'list.noResults',
    'list.retry',
    'list.total',
    'task.status.todo',
    'task.status.in_progress',
    'task.status.done',
    'task.priority.low',
    'task.priority.medium',
    'task.priority.high',
    'task.noDeadline',
    'task.overdue',
    'task.due',
    'task.created',
    'toolbar.searchLabel',
    'toolbar.searchPlaceholder',
    'toolbar.statusLabel',
    'toolbar.statusAll',
    'toolbar.sortBy',
    'toolbar.sort.newest',
    'toolbar.sort.oldest',
    'toolbar.sort.deadlineSoonest',
    'toolbar.sort.deadlineLatest',
    'toolbar.clearFilters',
    'pagination.label',
    'pagination.previous',
    'pagination.next',
    'pagination.page',
    'settings.title',
    'settings.theme',
    'settings.themes.light',
    'settings.themes.dark',
    'settings.themes.system',
    'settings.pageSize',
    'settings.language',
    'settings.languages.uk',
    'settings.languages.en',
    'settings.close',
  ])('cover "%s", which the task list, toolbar and settings need', (key) => {
    expect(keyPaths(en)).toContain(key)
  })

  it('name each language in its own words in both files', () => {
    expect([uk.settings.languages, en.settings.languages]).toEqual([
      { uk: 'Українська', en: 'English' },
      { uk: 'Українська', en: 'English' },
    ])
  })
})
