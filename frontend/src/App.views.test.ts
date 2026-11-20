import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from './api/generated/client'
import App from './App.vue'
import { useUndoStore } from './stores/undo'
import { appPlugins } from './test/appPlugins'
import { task } from './test/tasksApi'
import { taskServer } from './test/taskServer'

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openApp(rows: TaskRead[], address = '/') {
  const server = taskServer(rows)
  history.replaceState(null, '', address)
  mounted = mount(App, { attachTo: document.body, global: { plugins: appPlugins() } })
  await settle()
  return { page: mounted, server }
}

function rows(): TaskRead[] {
  return [task('Write'), task('Call'), task('Ship', { status: 'done' })]
}

async function switchTo(page: VueWrapper, name: string) {
  await page.get(`[role="group"][aria-label="View"] button[aria-label="${name}"]`).trigger('click')
  await settle()
}

function query(): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(location.search))
}

function boardTitles(page: VueWrapper, status: string): string[] {
  return page
    .findAll(`[data-testid="board-column"][data-status="${status}"] [data-testid="task-title"]`)
    .map((title) => title.text())
}

function dragEvent(type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: new DataTransfer() })
  return event
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.unstubAllGlobals()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('views of the tasks', () => {
  it('opens the list by default', async () => {
    const { page } = await openApp(rows())

    expect(page.find('main ul').exists()).toBe(true)
    expect(page.find('main table').exists()).toBe(false)
    expect(page.find('[data-testid="board-column"]').exists()).toBe(false)
  })

  it('opens the view a shared address names', async () => {
    const { page } = await openApp(rows(), '/?view=board')

    expect(boardTitles(page, 'todo')).toEqual(['Write', 'Call'])
    expect(boardTitles(page, 'done')).toEqual(['Ship'])
  })

  it('keeps the search, filters and sorting when switching views', async () => {
    const { page } = await openApp(rows(), '/?search=wr&ordering=deadline')

    await switchTo(page, 'Board')
    expect(query()).toEqual({ search: 'wr', ordering: 'deadline', view: 'board' })
    await switchTo(page, 'Table')
    expect(query()).toEqual({ search: 'wr', ordering: 'deadline', view: 'table' })
    expect(page.find('main table').exists()).toBe(true)
    await switchTo(page, 'List')
    expect(query()).toEqual({ search: 'wr', ordering: 'deadline' })
  })

  it('gives the board a wider page than the list', async () => {
    const { page } = await openApp(rows())
    const card = () => page.get('header').element.parentElement?.classList
    expect(card()).toContain('max-w-[760px]')

    await switchTo(page, 'Board')

    expect(card()).toContain('max-w-[1100px]')
  })

  it('moves a card between columns on the server, and Undo moves it back', async () => {
    const { page, server } = await openApp(rows(), '/?view=board')
    const card = page.findAll('[data-testid="board-card"]')[1]
    const done = page.get('[data-testid="board-column"][data-status="done"]')

    card.element.dispatchEvent(dragEvent('dragstart'))
    await settle()
    done.element.dispatchEvent(dragEvent('dragover'))
    done.element.dispatchEvent(dragEvent('drop'))
    await settle()

    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Call', body: { status: 'done' } }])
    expect(boardTitles(page, 'done')).toEqual(['Call', 'Ship'])

    await useUndoStore().run()
    await settle()

    expect(server.changes.at(-1)).toEqual({ method: 'PATCH', path: '/api/v1/tasks/id-Call', body: { status: 'todo' } })
    expect(boardTitles(page, 'todo')).toEqual(['Write', 'Call'])
  })

  it('shows the list as the server has it after changes made on the board', async () => {
    const { page } = await openApp(rows(), '/?view=board')
    const done = page.get('[data-testid="board-column"][data-status="done"]')
    page.findAll('[data-testid="board-card"]')[0].element.dispatchEvent(dragEvent('dragstart'))
    await settle()
    done.element.dispatchEvent(dragEvent('drop'))
    await settle()

    await switchTo(page, 'List')

    expect(page.findAll('main [data-testid="task-status"]').map((s) => s.attributes('aria-label'))).toEqual([
      'Status: Done. Change status',
      'Status: To do. Change status',
      'Status: Done. Change status',
    ])
  })
})
