import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SETTINGS_STORAGE_KEY, useSettingsStore, type Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import SettingsDialog from './SettingsDialog.vue'

let mounted: VueWrapper | undefined

/** Lets reka-ui finish its deferred work: focus moves and the outside-press listener are set up on a timer. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function mountSettings(locale: Locale = 'en', open = true) {
  const dialog = mount(SettingsDialog, {
    props: { open, 'onUpdate:open': (value: boolean) => dialog.setProps({ open: value }) },
    global: { plugins: appPlugins(locale) },
    attachTo: document.body,
  })
  mounted = dialog
  await settle()
  return dialog
}

function findDialog(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')
}

function getDialog(): HTMLElement {
  const dialog = findDialog()
  if (!dialog) throw new Error('The settings dialog is not open')
  return dialog
}

function dialogTitle(): string | null | undefined {
  return document.getElementById(getDialog().getAttribute('aria-labelledby') ?? '')?.textContent
}

function groups(): HTMLElement[] {
  return [...getDialog().querySelectorAll<HTMLElement>('[role="group"]')]
}

function group(name: string): HTMLElement {
  const found = groups().find((candidate) => candidate.getAttribute('aria-label') === name)
  if (!found) throw new Error(`The settings dialog has no group named "${name}"`)
  return found
}

function segments(name: string): HTMLButtonElement[] {
  return [...group(name).querySelectorAll('button')]
}

function segmentLabels(name: string): string[] {
  return segments(name).map((segment) => segment.textContent.trim())
}

function selected(name: string): string | undefined {
  return segments(name)
    .find((segment) => segment.getAttribute('aria-pressed') === 'true')
    ?.textContent.trim()
}

async function choose(groupName: string, label: string) {
  const segment = segments(groupName).find((candidate) => candidate.textContent.trim() === label)
  if (!segment) throw new Error(`"${groupName}" has no option "${label}"`)
  segment.click()
  await flushPromises()
}

function visibleLabels(): string[] {
  return [...getDialog().querySelectorAll('[data-testid="setting-label"]')].map((label) =>
    label.textContent.trim(),
  )
}

function stored(): unknown {
  return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
    const pinia = getActivePinia()
    if (pinia) disposePinia(pinia)
  })

  it('shows nothing while closed', async () => {
    await mountSettings('en', false)

    expect(findDialog()).toBeNull()
  })

  it('opens as a dialog titled "Settings"', async () => {
    await mountSettings()

    expect(dialogTitle()).toBe('Settings')
  })

  it('offers theme, tasks per page, language and density, in that order, each with a visible label', async () => {
    await mountSettings()

    expect(groups().map((candidate) => candidate.getAttribute('aria-label'))).toEqual([
      'Theme',
      'Tasks per page',
      'Language',
      'Density',
    ])
    expect(visibleLabels()).toEqual(['Theme', 'Tasks per page', 'Language', 'Density'])
  })

  it('offers the choices of each setting', async () => {
    await mountSettings()

    expect(segmentLabels('Theme')).toEqual(['Light', 'Dark', 'System'])
    expect(segmentLabels('Tasks per page')).toEqual(['10', '20', '50'])
    expect(segmentLabels('Language')).toEqual(['Українська', 'English'])
  })

  it('shows the defaults as selected on a first visit', async () => {
    await mountSettings()

    expect(selected('Theme')).toBe('System')
    expect(selected('Tasks per page')).toBe('20')
    expect(selected('Language')).toBe('English')
  })

  it('shows what was saved earlier as selected', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'dark', pageSize: 50, locale: 'en' }))

    await mountSettings()

    expect(selected('Theme')).toBe('Dark')
    expect(selected('Tasks per page')).toBe('50')
  })

  it('falls back to the defaults when what was saved cannot be read', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{not json')

    await mountSettings()

    expect(selected('Theme')).toBe('System')
    expect(selected('Tasks per page')).toBe('20')
  })

  it('applies and saves a theme as soon as it is chosen', async () => {
    await mountSettings()

    await choose('Theme', 'Dark')

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(selected('Theme')).toBe('Dark')
    expect(stored()).toMatchObject({ theme: 'dark' })
  })

  it('follows the operating system again when "System" is chosen', async () => {
    await mountSettings()
    await choose('Theme', 'Light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    await choose('Theme', 'System')

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(stored()).toMatchObject({ theme: 'system' })
  })

  it('sets and saves the page size as a number as soon as it is chosen', async () => {
    await mountSettings()

    await choose('Tasks per page', '50')

    expect(useSettingsStore().pageSize).toBe(50)
    expect(selected('Tasks per page')).toBe('50')
    expect(stored()).toMatchObject({ pageSize: 50 })
  })

  it('redraws itself in Ukrainian as soon as Ukrainian is chosen', async () => {
    await mountSettings()

    await choose('Language', 'Українська')

    expect(dialogTitle()).toBe('Налаштування')
    expect(visibleLabels()).toEqual(['Тема', 'Задач на сторінці', 'Мова', 'Щільність'])
    expect(segmentLabels('Тема')).toEqual(['Світла', 'Темна', 'Системна'])
    expect(getDialog().querySelector('button[aria-label="Закрити"]')).not.toBeNull()
    expect(document.documentElement.lang).toBe('uk')
    expect(stored()).toMatchObject({ locale: 'uk' })
  })

  it('names each language in its own language whatever the language of the page', async () => {
    await mountSettings('uk')

    expect(segmentLabels('Мова')).toEqual(['Українська', 'English'])
    expect(selected('Мова')).toBe('Українська')
  })

  it('goes back to English when English is chosen', async () => {
    await mountSettings('uk')

    await choose('Мова', 'English')

    expect(dialogTitle()).toBe('Settings')
    expect(document.documentElement.lang).toBe('en')
  })

  it('stays open after a setting is changed', async () => {
    const dialog = await mountSettings()

    await choose('Theme', 'Dark')
    await settle()

    expect(dialog.emitted('update:open')).toBeUndefined()
    expect(findDialog()).not.toBeNull()
  })

  it('has no save button: the only button besides the choices closes it', async () => {
    await mountSettings()

    const others = [...getDialog().querySelectorAll('button')].filter(
      (button) => !button.closest('[role="group"]'),
    )
    expect(others.map((button) => button.getAttribute('aria-label'))).toEqual(['Close'])
  })

  it('closes when the close button is pressed', async () => {
    const dialog = await mountSettings()

    getDialog().querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click()
    await settle()

    expect(dialog.emitted('update:open')).toEqual([[false]])
    expect(findDialog()).toBeNull()
  })

  it('closes when Escape is pressed', async () => {
    const dialog = await mountSettings()

    const target = document.activeElement ?? document.body
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(dialog.emitted('update:open')).toEqual([[false]])
    expect(findDialog()).toBeNull()
  })

  it('closes when the overlay is pressed', async () => {
    const dialog = await mountSettings()

    document.body
      .querySelector('[data-testid="dialog-overlay"]')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(dialog.emitted('update:open')).toEqual([[false]])
    expect(findDialog()).toBeNull()
  })

  it('moves between the choices of a setting with the arrow keys', async () => {
    await mountSettings()
    const [light, dark] = segments('Theme')
    light.focus()

    light.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()

    expect(document.activeElement).toBe(dark)
  })
})
