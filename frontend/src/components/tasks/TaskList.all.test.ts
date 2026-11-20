import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { TaskRead } from '../../api/generated/client'
import { SETTINGS_STORAGE_KEY, useSettingsStore, type PageSize } from '../../stores/settings'
import { useTasksStore } from '../../stores/tasks'
import { appPlugins } from '../../test/appPlugins'
import { requestUrl } from '../../test/requestUrl'
import { task } from '../../test/tasksApi'
import { taskServer } from '../../test/taskServer'
import TaskTable from './table/TaskTable.vue'
import TaskList from './TaskList.vue'

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

const COUNT = 230

// More than two pages of 100, in the custom order: `Task n` at position n - 1.
function rows(): TaskRead[] {
  return Array.from({ length: COUNT }, (_, index) => task(`Task ${index + 1}`, { position: index }))
}

async function openList(address = '/?ordering=position', { table = false, pageSize = 'all' }: { table?: boolean; pageSize?: PageSize } = {}) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ pageSize }))
  const server = taskServer(rows())
  history.replaceState(null, '', address)
  mounted = mount(TaskList, {
    attachTo: document.body,
    global: { plugins: appPlugins() },
    slots: table ? { rows: TaskTable } : {},
  })
  useTasksStore().start()
  await settle()
  return { list: mounted, server }
}

function titles(list: VueWrapper): string[] {
  return list.findAll('[data-testid="task-title"]').map((title) => title.text())
}

function rowOf(list: VueWrapper, title: string): DOMWrapper<Element> {
  return list.findAll('li[data-task-id]').find((row) => row.get('[data-testid="task-title"]').text() === title) as DOMWrapper<Element>
}

function handle(list: VueWrapper, title: string): HTMLElement {
  return rowOf(list, title).get<HTMLElement>('[data-testid="task-move"]').element
}

function requestedPages(): string[] {
  return vi.mocked(fetch).mock.calls.map(([input]) => {
    const query = requestUrl(input).searchParams
    return `${query.get('page')}/${query.get('page_size')}`
  })
}

function dragEvent(type: string, clientY = 0): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const transfer = new DataTransfer()
  Object.defineProperty(transfer, 'setDragImage', { value: () => undefined })
  Object.defineProperty(event, 'dataTransfer', { value: transfer })
  Object.defineProperty(event, 'clientY', { value: clientY })
  return event
}

// Each row 50px high, from the top: the middle of row n (from 0) is at n * 50 + 25.
function layOut(list: VueWrapper) {
  list.findAll('li[data-task-id]').forEach((row, index) => {
    row.element.getBoundingClientRect = () => ({ top: index * 50, height: 50 }) as DOMRect
  })
}

function moveItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]'))
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
})

describe('the list with all the tasks on one page', () => {
  it('shows every matching task, in order, with no pagination', async () => {
    const { list } = await openList()

    expect(requestedPages()).toEqual(['1/100', '2/100', '3/100'])
    expect(titles(list)).toEqual(rows().map((row) => row.title))
    expect(list.get('[data-testid="task-total"]').text()).toBe('230 tasks')
    expect(list.find('nav').exists()).toBe(false)
  })

  it('hides the pagination as soon as "All" is chosen, before the whole set has loaded', async () => {
    const { list } = await openList('/', { pageSize: 20 })
    expect(list.find('nav').exists()).toBe(true)

    useSettingsStore().pageSize = 'all'
    await nextTick()

    expect(list.find('nav').exists()).toBe(false)
    await settle()
    expect(titles(list)).toHaveLength(COUNT)
  })

  it('shows the pagination again from page 1 when a number is chosen again', async () => {
    const { list } = await openList('/')

    useSettingsStore().pageSize = 50
    await settle()

    expect(titles(list)).toEqual(rows().slice(0, 50).map((row) => row.title))
    expect(list.get('[data-testid="page-position"]').text()).toBe('Page 1 of 5')
  })
})

describe('reordering with all the tasks on one page', () => {
  it('moves the first task of the second hundred up past the last of the first', async () => {
    const { list, server } = await openList()

    handle(list, 'Task 101').click()
    await settle()
    moveItems()[0].click()
    await settle()

    expect(server.changes.map((change) => change.body)).toEqual([{ position: 98.5 }])
  })

  it('moves the last task of the first hundred down past the first of the second', async () => {
    const { list, server } = await openList()

    handle(list, 'Task 100').click()
    await settle()
    moveItems()[1].click()
    await settle()

    expect(server.changes.map((change) => change.body)).toEqual([{ position: 100.5 }])
  })

  it('offers Move down for every task but the very last of the whole list', async () => {
    const { list } = await openList()

    handle(list, `Task ${COUNT}`).click()
    await settle()

    expect(moveItems().map((item) => item.hasAttribute('data-disabled'))).toEqual([false, true])
  })

  it('drops a dragged task between neighbours that came from different pages', async () => {
    const { list, server } = await openList()

    handle(list, 'Task 230').dispatchEvent(dragEvent('dragstart'))
    await nextTick()
    layOut(list)
    // Just above the middle of the row of Task 101.
    list.get('ul').element.dispatchEvent(dragEvent('dragover', 100 * 50 + 10))
    await nextTick()
    list.get('ul').element.dispatchEvent(dragEvent('drop'))
    await settle()

    expect(server.changes.map((change) => change.body)).toEqual([{ position: 99.5 }])
    expect(titles(list).slice(99, 102)).toEqual(['Task 100', 'Task 230', 'Task 101'])
  })
})

describe('the table with all the tasks on one page', () => {
  it('shows every matching task with no pagination, as the list does', async () => {
    const { list } = await openList('/?view=table', { table: true })

    expect(list.findAll('tbody tr')).toHaveLength(COUNT)
    expect(list.find('nav').exists()).toBe(false)
  })
})
