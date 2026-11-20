import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { DENSITIES, SETTINGS_STORAGE_KEY, useSettingsStore } from './settings'

function storedSettingsAre(value: unknown): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value))
}

function storedSettings(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')
}

// A fresh pinia stands for a page load: the store is built again from what the browser holds.
function loadStore() {
  setActivePinia(createPinia())
  return useSettingsStore()
}

beforeEach(() => {
  localStorage.clear()
})

describe('density', () => {
  it('is comfortable or compact', () => {
    expect(DENSITIES).toEqual(['comfortable', 'compact'])
  })

  it('is comfortable on a first visit', () => {
    expect(loadStore().density).toBe('comfortable')
  })

  it('is saved with the other settings and restored on the next visit', () => {
    loadStore().density = 'compact'

    expect(storedSettings()).toMatchObject({ density: 'compact', theme: 'system' })
    expect(loadStore().density).toBe('compact')
  })

  it('falls back to comfortable when the saved one is invalid, keeping the other settings', () => {
    storedSettingsAre({ density: 'tiny', theme: 'dark' })

    const settings = loadStore()

    expect(settings.density).toBe('comfortable')
    expect(settings.theme).toBe('dark')
  })
})

describe('description previews', () => {
  it('are off on a first visit', () => {
    expect(loadStore().showDescriptions).toBe(false)
  })

  it('are saved with the other settings and restored on the next visit', () => {
    loadStore().showDescriptions = true

    expect(storedSettings()).toMatchObject({ showDescriptions: true, theme: 'system' })
    expect(loadStore().showDescriptions).toBe(true)
  })

  it('stay off when the saved value is not a boolean, keeping the other settings', () => {
    storedSettingsAre({ showDescriptions: 'yes', density: 'compact' })

    const settings = loadStore()

    expect(settings.showDescriptions).toBe(false)
    expect(settings.density).toBe('compact')
  })
})
