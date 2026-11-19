import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Locale } from '../../stores/settings'
import { UNDO_WINDOW_MS, useUndoStore } from '../../stores/undo'
import { appPlugins } from '../../test/appPlugins'
import UndoToast from './UndoToast.vue'

const TOAST = '[data-testid="undo-toast"]'

let mounted: VueWrapper | undefined

function mountToast(locale: Locale = 'en') {
  mounted = mount(UndoToast, { attachTo: document.body, global: { plugins: appPlugins(locale) } })
  return { host: mounted, undo: useUndoStore() }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.useRealTimers()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('an error notice in the toast', () => {
  it.each([
    ['network', 'Could not reach the server. Check your connection and try again.'],
    ['server', 'Something went wrong on the server. Please try again.'],
    ['not_found', 'This task no longer exists.'],
    ['validation', 'Something went wrong. Please try again.'],
    ['aborted', 'Something went wrong. Please try again.'],
  ] as const)('says what went wrong after a "%s" failure, in the danger colour', async (kind, text) => {
    const { host, undo } = mountToast()

    undo.notifyError(kind)
    await flushPromises()

    expect(host.get(`${TOAST} p`).text()).toBe(text)
    expect(host.get(`${TOAST} p`).classes()).toContain('text-danger-text')
  })

  it('speaks Ukrainian when the language is Ukrainian', async () => {
    const { host, undo } = mountToast('uk')

    undo.notifyError('server')
    await flushPromises()

    expect(host.get(`${TOAST} p`).text()).toBe('На сервері сталася помилка. Спробуйте ще раз.')
  })

  it('has nothing to undo: only the dismiss button, which takes it down', async () => {
    const { host, undo } = mountToast()
    undo.notifyError('network')
    await flushPromises()

    expect(host.findAll(`${TOAST} button`)).toHaveLength(1)
    await host.get(`${TOAST} button[aria-label="Dismiss"]`).trigger('click')

    expect(host.find(TOAST).exists()).toBe(false)
  })

  it('is announced through the polite region the undo offers use', async () => {
    const { host, undo } = mountToast()

    undo.notifyError('network')
    await flushPromises()

    expect(host.get('[role="status"]').text()).toBe(
      'Could not reach the server. Check your connection and try again.',
    )
  })

  it('shows one line at a time: the newest notice replaces the one before it', async () => {
    const { host, undo } = mountToast()
    undo.notifyError('network')
    await flushPromises()

    undo.notifyError('server')
    await flushPromises()

    expect(host.findAll(TOAST)).toHaveLength(1)
    expect(host.get(TOAST).text()).toBe('Something went wrong on the server. Please try again.')
  })

  it('goes away by itself once the window has passed', async () => {
    const { host, undo } = mountToast()
    undo.notifyError('network')
    await flushPromises()

    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    await flushPromises()

    expect(host.find(TOAST).exists()).toBe(false)
  })

  it('moves the focus from the Undo button it replaces to the dismiss button', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: () => Promise.resolve() })
    await flushPromises()
    host.get<HTMLButtonElement>(`${TOAST} button[data-variant="ghost"]`).element.focus()

    undo.notifyError('server')
    await flushPromises()

    expect(document.activeElement).toBe(host.get(`${TOAST} button[aria-label="Dismiss"]`).element)
  })
})
