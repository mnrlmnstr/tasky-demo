import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { useUndoStore } from './stores/undo'
import { appPlugins } from './test/appPlugins'
import { requestUrl } from './test/requestUrl'
import { task } from './test/tasksApi'
import { taskServer } from './test/taskServer'

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openApp(address: string) {
  const server = taskServer([task('Write'), task('Call'), task('Ship', { status: 'done' })])
  history.replaceState(null, '', address)
  mounted = mount(App, { attachTo: document.body, global: { plugins: appPlugins() } })
  await settle()
  return { page: mounted, server }
}

// The list asks for its page size (20 by default), the board for 100 per column.
function listRequests() {
  const lists = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => (init?.method ?? 'GET') === 'GET')
    .map(([input]) => requestUrl(input).searchParams.get('page_size'))
  return { list: lists.filter((size) => size === '20').length, board: lists.filter((size) => size === '100').length }
}

function dragEvent(type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: new DataTransfer() })
  return event
}

async function switchTo(page: VueWrapper, name: string) {
  await page.get(`[role="group"][aria-label="View"] button[aria-label="${name}"]`).trigger('click')
  await settle()
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

describe('one signal for changed tasks', () => {
  it('does not load the list while the board is shown, also not for a drag and its undo', async () => {
    const { page } = await openApp('/?view=board')
    expect(listRequests()).toEqual({ list: 0, board: 3 })

    page.findAll('[data-testid="board-card"]')[1].element.dispatchEvent(dragEvent('dragstart'))
    await settle()
    page.get('[data-testid="board-column"][data-status="done"]').element.dispatchEvent(dragEvent('drop'))
    await settle()
    expect(listRequests()).toEqual({ list: 0, board: 6 })

    await useUndoStore().run()
    await settle()
    expect(listRequests()).toEqual({ list: 0, board: 9 })

    await switchTo(page, 'List')
    expect(listRequests()).toEqual({ list: 1, board: 9 })
  })

  it('loads the list once for a change made in it, and not the board', async () => {
    const { page } = await openApp('/')
    expect(listRequests()).toEqual({ list: 1, board: 0 })

    await page.findAll('main [data-testid="task-status"]')[0].trigger('click')
    await settle()
    const done = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find(
      (item) => item.textContent?.trim() === 'Done',
    )
    done?.click()
    await settle()

    expect(listRequests()).toEqual({ list: 2, board: 0 })
  })
})
