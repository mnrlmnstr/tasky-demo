import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, type ApiErrorKind } from '../../api/http'
import type { Locale } from '../../stores/settings'
import { UNDO_WINDOW_MS, useUndoStore } from '../../stores/undo'
import { appPlugins } from '../../test/appPlugins'
import UndoToast from './UndoToast.vue'

const TOAST = '[data-testid="undo-toast"]'

let mounted: VueWrapper | undefined
let outside: HTMLButtonElement

function mountToast(locale: Locale = 'en') {
  mounted = mount(UndoToast, { attachTo: document.body, global: { plugins: appPlugins(locale) } })
  return { host: mounted, undo: useUndoStore() }
}

const done = () => Promise.resolve()

function failing(kind: ApiErrorKind) {
  return () => Promise.reject(new ApiError(kind))
}

function undoButton(host: VueWrapper) {
  return host.get<HTMLButtonElement>(`${TOAST} button[data-variant="ghost"]`)
}

function dismissButton(host: VueWrapper) {
  return host.get<HTMLButtonElement>(`${TOAST} button[aria-label="Dismiss"]`)
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  // Something on the page that has the focus before the toast shows up.
  outside = document.createElement('button')
  document.body.append(outside)
  outside.focus()
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  outside.remove()
  vi.useRealTimers()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('undo toast', () => {
  it('shows nothing until an action offers an undo', () => {
    const { host } = mountToast()

    expect(host.find(TOAST).exists()).toBe(false)
  })

  it('shows what was done, an Undo button and a small dismiss button', async () => {
    const { host, undo } = mountToast()

    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    expect(host.get(TOAST).text()).toContain('Task created')
    expect(undoButton(host).text()).toBe('Undo')
    expect(dismissButton(host).find('svg.lucide-x').exists()).toBe(true)
  })

  it.each([
    ['created', 'Task created', 'Задачу створено'],
    ['updated', 'Task updated', 'Задачу оновлено'],
    ['statusChanged', 'Status changed', 'Статус змінено'],
  ] as const)('names a "%s" action in English and in Ukrainian', async (label, english, ukrainian) => {
    const inEnglish = mountToast('en')
    inEnglish.undo.offer({ label, undo: done })
    await flushPromises()
    expect(inEnglish.host.get(`${TOAST} p`).text()).toBe(english)
    inEnglish.host.unmount()

    const inUkrainian = mountToast('uk')
    inUkrainian.undo.offer({ label, undo: done })
    await flushPromises()
    expect(inUkrainian.host.get(`${TOAST} p`).text()).toBe(ukrainian)
  })

  it('speaks Ukrainian on its buttons when the language is Ukrainian', async () => {
    const { host, undo } = mountToast('uk')

    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    expect(undoButton(host).text()).toBe('Скасувати')
    expect(host.find(`${TOAST} button[aria-label="Закрити"]`).exists()).toBe(true)
  })

  it('replaces the toast in place when a newer action offers an undo', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()
    const first = host.get(TOAST).element

    undo.offer({ label: 'statusChanged', undo: done })
    await flushPromises()

    expect(host.findAll(TOAST)).toHaveLength(1)
    expect(host.get(TOAST).element).toBe(first)
    expect(host.get(`${TOAST} p`).text()).toBe('Status changed')
  })

  it('goes away once the undo window has passed', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    await flushPromises()

    expect(host.find(TOAST).exists()).toBe(false)
  })

  it('goes away when it is dismissed', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    await dismissButton(host).trigger('click')

    expect(host.find(TOAST).exists()).toBe(false)
    expect(undo.label).toBeNull()
  })
})

describe('undoing from the toast', () => {
  it('runs the undo once, shows progress on the button meanwhile, keeping the focus on it, and then goes away', async () => {
    const { host, undo } = mountToast()
    let finish!: () => void
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    undo.offer({ label: 'created', undo: action })
    await flushPromises()

    const button = undoButton(host).element as HTMLElement
    button.focus()
    await undoButton(host).trigger('click')
    expect(undoButton(host).attributes('aria-busy')).toBe('true')
    expect(undoButton(host).attributes('aria-disabled')).toBe('true')
    expect(undoButton(host).attributes('disabled')).toBeUndefined()
    expect(document.activeElement).toBe(button)
    expect(dismissButton(host).attributes('disabled')).toBeDefined()
    await undoButton(host).trigger('click')

    finish()
    await flushPromises()

    expect(action).toHaveBeenCalledTimes(1)
    expect(host.find(TOAST).exists()).toBe(false)
  })

  it.each([
    ['not_found', 'Could not undo. This task no longer exists.'],
    ['network', 'Could not undo. Could not reach the server. Check your connection and try again.'],
    ['server', 'Could not undo. Something went wrong on the server. Please try again.'],
    ['validation', 'Could not undo. Something went wrong. Please try again.'],
    ['aborted', 'Could not undo. Something went wrong. Please try again.'],
    ['client', 'Could not undo. Something went wrong. Please try again.'],
  ] as const)('says why an undo failed with "%s" and offers no second try', async (kind, message) => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: failing(kind) })
    await flushPromises()

    await undoButton(host).trigger('click')
    await flushPromises()

    expect(host.get(`${TOAST} p`).text()).toBe(message)
    expect(host.find(`${TOAST} button[data-variant="ghost"]`).exists()).toBe(false)
    expect(dismissButton(host).attributes('disabled')).toBeUndefined()
  })

  it('says in Ukrainian that the task is already gone', async () => {
    const { host, undo } = mountToast('uk')
    undo.offer({ label: 'created', undo: failing('not_found') })
    await flushPromises()

    await undoButton(host).trigger('click')
    await flushPromises()

    expect(host.get(`${TOAST} p`).text()).toBe('Не вдалося скасувати. Цієї задачі вже немає.')
  })
})

describe('pausing the undo window', () => {
  it('keeps the toast while the pointer is over it and lets the rest of the window run after it leaves', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1000)

    await host.get(TOAST).trigger('pointerenter')
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 3)
    await flushPromises()
    expect(host.find(TOAST).exists()).toBe(true)

    await host.get(TOAST).trigger('pointerleave')
    vi.advanceTimersByTime(1000)
    await flushPromises()
    expect(host.find(TOAST).exists()).toBe(false)
  })

  it('keeps the toast while the focus is inside it, also when it moves between its buttons', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    await undoButton(host).trigger('focusin', { relatedTarget: outside })
    await undoButton(host).trigger('focusout', { relatedTarget: dismissButton(host).element })
    await dismissButton(host).trigger('focusin', { relatedTarget: undoButton(host).element })
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 3)
    await flushPromises()
    expect(host.find(TOAST).exists()).toBe(true)

    await dismissButton(host).trigger('focusout', { relatedTarget: outside })
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    await flushPromises()
    expect(host.find(TOAST).exists()).toBe(false)
  })

  it('stays paused under the pointer after the focus has left it', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    await host.get(TOAST).trigger('pointerenter')
    await undoButton(host).trigger('focusin', { relatedTarget: outside })
    await undoButton(host).trigger('focusout', { relatedTarget: outside })
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 3)
    await flushPromises()

    expect(host.find(TOAST).exists()).toBe(true)
  })

  it('does not stay paused for the next offer after it was dismissed under the pointer', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()
    await host.get(TOAST).trigger('pointerenter')
    await dismissButton(host).trigger('click')

    undo.offer({ label: 'updated', undo: done })
    await flushPromises()
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    await flushPromises()

    expect(host.find(TOAST).exists()).toBe(false)
  })
})

describe('undo toast accessibility', () => {
  it('announces the action politely through a region that is on the page before the offer', async () => {
    const { host, undo } = mountToast()
    const region = host.get('[role="status"]')
    expect(region.text()).toBe('')

    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    expect(host.get('[role="status"]').element).toBe(region.element)
    expect(region.text()).toBe('Task created')
    expect(region.attributes('aria-live')).toBe('polite')
  })

  it('announces a failed undo through the same region', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: failing('not_found') })
    await flushPromises()

    await undoButton(host).trigger('click')
    await flushPromises()

    expect(host.get('[role="status"]').text()).toBe('Could not undo. This task no longer exists.')
  })

  it('is read once: the visible text is left to the live region, and names the group its buttons are in', async () => {
    const { host, undo } = mountToast()

    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    expect(host.get(TOAST).attributes('role')).toBe('group')
    expect(host.get(TOAST).attributes('aria-label')).toBe('Task created')
    expect(host.get(`${TOAST} p`).attributes('aria-hidden')).toBe('true')
  })

  it('leaves the focus where it was when it appears', async () => {
    const { undo } = mountToast()

    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    expect(document.activeElement).toBe(outside)
  })

  it('offers Undo and dismiss as real buttons in the tab order', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()

    for (const button of [undoButton(host), dismissButton(host)]) {
      expect(button.element.tagName).toBe('BUTTON')
      expect(button.attributes('tabindex')).toBeUndefined()
      expect(button.attributes('disabled')).toBeUndefined()
    }
    undoButton(host).element.focus()
    expect(document.activeElement).toBe(undoButton(host).element)
  })

  it('is dismissed by Escape when the focus is inside it, and hands the focus back', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()
    const button = undoButton(host)
    button.element.focus()
    await button.trigger('focusin', { relatedTarget: outside })

    await button.trigger('keydown', { key: 'Escape' })

    expect(host.find(TOAST).exists()).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('hands the focus back after an undo started from the keyboard', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()
    const button = undoButton(host)
    button.element.focus()
    await button.trigger('focusin', { relatedTarget: outside })

    await button.trigger('click')
    await flushPromises()

    expect(host.find(TOAST).exists()).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('does not move the focus when it goes away with the focus elsewhere', async () => {
    const { host, undo } = mountToast()
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    undo.offer({ label: 'created', undo: done })
    await flushPromises()
    await undoButton(host).trigger('focusin', { relatedTarget: outside })
    await undoButton(host).trigger('focusout', { relatedTarget: elsewhere })
    elsewhere.focus()

    undo.dismiss()
    await flushPromises()

    expect(document.activeElement).toBe(elsewhere)
    elsewhere.remove()
  })

  it('has nowhere to hand the focus back to when it came from outside the page', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: done })
    await flushPromises()
    await undoButton(host).trigger('focusin', { relatedTarget: null })

    await undoButton(host).trigger('keydown', { key: 'Escape' })

    expect(host.find(TOAST).exists()).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('moves the focus to the dismiss button when the undo it started from fails', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: failing('server') })
    await flushPromises()
    const button = undoButton(host)
    button.element.focus()
    await button.trigger('focusin', { relatedTarget: outside })

    await button.trigger('click')
    await flushPromises()

    expect(document.activeElement).toBe(dismissButton(host).element)
  })

  it('leaves the focus alone when an undo started with the pointer fails', async () => {
    const { host, undo } = mountToast()
    undo.offer({ label: 'created', undo: failing('server') })
    await flushPromises()

    await undoButton(host).trigger('click')
    await flushPromises()

    expect(document.activeElement).toBe(outside)
  })
})
