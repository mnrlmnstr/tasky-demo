import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { CLOCK, type Clock } from './i18n/clock'
import { useUndoStore } from './stores/undo'
import { appPlugins } from './test/appPlugins'
import { task } from './test/tasksApi'
import { taskServer } from './test/taskServer'

const NOON: Clock = { now: () => new Date('2026-03-05T12:00:00Z'), timeZone: 'UTC' }

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openPage(address: string) {
  const server = taskServer([task('Write', { priority: 'low' }), task('Call', { priority: 'high' })])
  history.replaceState(null, '', address)
  mounted = mount(App, {
    attachTo: document.body,
    global: { plugins: appPlugins(), provide: { [CLOCK as symbol]: NOON } },
  })
  await settle()
  return { page: mounted, server }
}

function priorityOf(page: VueWrapper, title: string): DOMWrapper<HTMLButtonElement> {
  const trigger = page
    .findAll<HTMLButtonElement>('main [data-testid="task-priority"]')
    .find((candidate) => candidate.attributes('aria-label') !== undefined && rowTitle(candidate) === title)
  if (!trigger) throw new Error(`No priority of "${title}" on the page`)
  return trigger
}

function rowTitle(trigger: DOMWrapper<Element>): string | undefined {
  const row = trigger.element.closest('tr, li, [data-testid="board-card"]')
  return row?.querySelector('[data-testid="task-title"]')?.textContent?.trim()
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]'))
}

async function pick(page: VueWrapper, title: string, label: string) {
  priorityOf(page, title).element.click()
  await settle()
  const item = menuItems().find((candidate) => candidate.textContent?.trim() === label)
  if (!item) throw new Error(`The menu has no "${label}" item`)
  item.click()
  await settle()
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.unstubAllGlobals()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
  history.replaceState(null, '', '/')
})

describe.each([
  ['list', '/'],
  ['table', '/?view=table'],
])('the priority in the %s', (_view, address) => {
  it('is changed from its badge, saved, reloaded, and kept', async () => {
    const { page, server } = await openPage(address)
    const listsBefore = server.lists

    await pick(page, 'Write', 'High')

    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Write', body: { priority: 'high' } }])
    expect(server.lists).toBeGreaterThan(listsBefore)
    expect(priorityOf(page, 'Write').attributes('aria-label')).toBe('Priority: High. Change priority')
    expect(priorityOf(page, 'Write').text()).toBe('High')
  })

  it('is put back by the undo in the toast', async () => {
    const { page } = await openPage(address)
    await pick(page, 'Write', 'Medium')
    expect(document.body.textContent).toContain('Priority changed')

    await useUndoStore().run()
    await settle()

    expect(priorityOf(page, 'Write').attributes('aria-label')).toBe('Priority: Low. Change priority')
  })

  it('goes back when the change fails', async () => {
    const { page, server } = await openPage(address)
    server.failChanges('offline')

    await pick(page, 'Call', 'Low')

    expect(priorityOf(page, 'Call').attributes('aria-label')).toBe('Priority: High. Change priority')
    expect(useUndoStore().notice).toBe('network')
  })
})
