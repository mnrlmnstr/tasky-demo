import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SETTINGS_STORAGE_KEY, useSettingsStore, type Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import SettingsDialog from './SettingsDialog.vue'

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function mountSettings(locale: Locale = 'en') {
  mounted = mount(SettingsDialog, {
    props: { open: true },
    global: { plugins: appPlugins(locale) },
    attachTo: document.body,
  })
  await settle()
}

function getDialog(): HTMLElement {
  const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
  if (!dialog) throw new Error('The settings dialog is not open')
  return dialog
}

function densityGroup(name = 'Density'): HTMLElement {
  const group = getDialog().querySelector<HTMLElement>(`[role="group"][aria-label="${name}"]`)
  if (!group) throw new Error(`The settings dialog has no "${name}" group`)
  return group
}

function descriptionsSwitch(): HTMLInputElement {
  const input = getDialog().querySelector<HTMLInputElement>('input[role="switch"]')
  if (!input) throw new Error('The settings dialog has no switch')
  return input
}

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('view settings', () => {
  it('offer a density, comfortable or compact, with comfortable chosen on a first visit', async () => {
    await mountSettings()

    const segments = [...densityGroup().querySelectorAll('button')]
    expect(segments.map((segment) => segment.textContent.trim())).toEqual(['Comfortable', 'Compact'])
    expect(segments.map((segment) => segment.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
  })

  it('apply and save a density as soon as it is chosen', async () => {
    await mountSettings()

    densityGroup().querySelectorAll('button')[1].click()
    await flushPromises()

    expect(useSettingsStore().density).toBe('compact')
    expect(stored()).toMatchObject({ density: 'compact' })
  })

  it('offer a labelled switch for description previews, off on a first visit', async () => {
    await mountSettings()

    const input = descriptionsSwitch()
    expect(input.closest('label')?.textContent.trim()).toBe('Show descriptions')
    expect(input.checked).toBe(false)
  })

  it('turn description previews on and off, saving each change', async () => {
    await mountSettings()

    descriptionsSwitch().click()
    await flushPromises()
    expect(useSettingsStore().showDescriptions).toBe(true)
    expect(stored()).toMatchObject({ showDescriptions: true })

    descriptionsSwitch().click()
    await flushPromises()
    expect(useSettingsStore().showDescriptions).toBe(false)
  })

  it('speak Ukrainian', async () => {
    await mountSettings('uk')

    expect([...densityGroup('Щільність').querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual([
      'Звичайна',
      'Компактна',
    ])
    expect(descriptionsSwitch().closest('label')?.textContent.trim()).toBe('Показувати описи')
  })
})
