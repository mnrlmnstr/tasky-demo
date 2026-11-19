import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { appPlugins } from './test/appPlugins'
import { fakeTasksApi, pageOf } from './test/tasksApi'

const SEARCH_DELAY = 300

let mounted: VueWrapper | undefined

async function openApp(address = '/') {
  history.replaceState(null, '', address)
  mounted = mount(App, { global: { plugins: appPlugins() }, attachTo: document.body })
  await settle()
  return mounted
}

/** What closing the tab leaves behind: the saved view, and nothing of the page or its stores. */
function closeApp() {
  mounted?.unmount()
  mounted = undefined
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
}

/** Lets the sort menu finish its deferred work (focus moves, positioning) without reaching the search delay. */
async function settle() {
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1)
  await flushPromises()
}

function searchBox(page: VueWrapper) {
  return page.get<HTMLInputElement>('main input[type="search"]')
}

async function search(page: VueWrapper, text: string) {
  await searchBox(page).setValue(text)
  await vi.advanceTimersByTimeAsync(SEARCH_DELAY)
  await flushPromises()
}

function statusSegments(page: VueWrapper) {
  return page.get('main [role="group"][aria-label="Status"]').findAll('button')
}

async function chooseStatus(page: VueWrapper, label: string) {
  const segment = statusSegments(page).find((candidate) => candidate.text() === label)
  if (!segment) throw new Error(`There is no "${label}" status`)
  await segment.trigger('click')
  await settle()
}

function pressedStatus(page: VueWrapper): string | undefined {
  return statusSegments(page)
    .find((segment) => segment.attributes('aria-pressed') === 'true')
    ?.text()
}

function sortTrigger(page: VueWrapper) {
  return page.get<HTMLButtonElement>('main button[aria-haspopup="menu"]')
}

async function chooseSort(page: VueWrapper, label: string) {
  sortTrigger(page).element.click()
  await settle()
  const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!item) throw new Error(`The sort menu has no "${label}" item`)
  item.click()
  await settle()
}

function clearFiltersButton(page: VueWrapper) {
  return page.findAll('main button').find((button) => button.text() === 'Clear filters')
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  // Only the timers: flushPromises waits on the real event loop.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  closeApp()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('toolbar on the page', () => {
  it('sits in the main area above the list', async () => {
    const api = fakeTasksApi()
    const page = await openApp()
    await api.respondTo(0, pageOf(['Write the report']))

    const field = searchBox(page).element
    const firstRow = page.get('main li').element
    expect(field.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('asks the API for the typed search once the typing has paused, not on every keystroke', async () => {
    const api = fakeTasksApi()
    const page = await openApp()

    await searchBox(page).setValue('rep')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 1)
    await searchBox(page).setValue('report')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 1)
    await flushPromises()

    expect(api.queries).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()

    expect(api.paths).toEqual(['/api/v1/tasks', '/api/v1/tasks'])
    expect(api.queries[1]).toEqual({ ordering: '-created_at', page: '1', page_size: '20', search: 'report' })
    expect(location.search).toBe('?search=report')
  })

  it('asks the API for the chosen status', async () => {
    const api = fakeTasksApi()
    const page = await openApp()

    await chooseStatus(page, 'In progress')

    expect(api.queries[1]).toEqual({
      ordering: '-created_at',
      page: '1',
      page_size: '20',
      status: 'in_progress',
    })
    expect(location.search).toBe('?status=in_progress')
  })

  it('asks the API for the chosen sorting', async () => {
    const api = fakeTasksApi()
    const page = await openApp()

    await chooseSort(page, 'Deadline: soonest first')

    expect(api.queries[1]).toEqual({ ordering: 'deadline', page: '1', page_size: '20' })
    expect(location.search).toBe('?ordering=deadline')
  })

  it('combines the search, the status and the sorting in one query and in the address', async () => {
    const api = fakeTasksApi()
    const page = await openApp()

    await search(page, 'report')
    await chooseStatus(page, 'To do')
    await chooseSort(page, 'Deadline: latest first')

    expect(api.queries.at(-1)).toEqual({
      ordering: '-deadline',
      page: '1',
      page_size: '20',
      search: 'report',
      status: 'todo',
    })
    expect(Object.fromEntries(new URLSearchParams(location.search))).toEqual({
      search: 'report',
      status: 'todo',
      ordering: '-deadline',
    })
  })

  it('starts from the first page again when a filter changes', async () => {
    const api = fakeTasksApi()
    const page = await openApp('/?page=2')

    await chooseStatus(page, 'Done')

    expect(api.queries.at(-1)).toEqual({ ordering: '-created_at', page: '1', page_size: '20', status: 'done' })
    expect(location.search).toBe('?status=done')
  })

  it('reproduces the list of a shared address: the same query, and the controls filled in', async () => {
    const api = fakeTasksApi()

    const page = await openApp('/?search=report&status=todo&ordering=deadline')

    expect(api.queries).toEqual([
      { ordering: 'deadline', page: '1', page_size: '20', search: 'report', status: 'todo' },
    ])
    expect(searchBox(page).element.value).toBe('report')
    expect(pressedStatus(page)).toBe('To do')
    expect(sortTrigger(page).text()).toBe('Deadline: soonest first')
  })

  it('shows the same filters when the app is opened again after the tab was closed', async () => {
    fakeTasksApi()
    const first = await openApp()
    await search(first, 'report')
    await chooseStatus(first, 'Done')
    await chooseSort(first, 'Oldest first')
    closeApp()
    const api = fakeTasksApi()

    const page = await openApp('/')

    expect(api.queries).toEqual([
      { ordering: 'created_at', page: '1', page_size: '20', search: 'report', status: 'done' },
    ])
    expect(searchBox(page).element.value).toBe('report')
    expect(pressedStatus(page)).toBe('Done')
    expect(sortTrigger(page).text()).toBe('Oldest first')
  })

  it('follows the address when the user goes back', async () => {
    const api = fakeTasksApi()
    const page = await openApp('/?search=report')
    await chooseStatus(page, 'Done')

    history.back()
    await settle()

    expect(pressedStatus(page)).toBe('All')
    expect(searchBox(page).element.value).toBe('report')
    expect(api.queries.at(-1)).toEqual({ ordering: '-created_at', page: '1', page_size: '20', search: 'report' })
  })

  it('clears the search and the status but keeps the sorting when "Clear filters" is pressed', async () => {
    const api = fakeTasksApi()
    const page = await openApp('/?search=report&status=todo&ordering=deadline')

    await clearFiltersButton(page)?.trigger('click')
    await settle()

    expect(api.queries.at(-1)).toEqual({ ordering: 'deadline', page: '1', page_size: '20' })
    expect(location.search).toBe('?ordering=deadline')
    expect(searchBox(page).element.value).toBe('')
    expect(pressedStatus(page)).toBe('All')
    expect(clearFiltersButton(page)).toBeUndefined()
  })

  it('empties the search field when the empty list offers to clear the filters', async () => {
    const api = fakeTasksApi()
    const page = await openApp('/?search=nothing')
    await api.respondTo(0, pageOf([]))

    await page.get('main [data-testid="task-list-empty"] button').trigger('click')
    await settle()

    expect(searchBox(page).element.value).toBe('')
    expect(api.queries.at(-1)).toEqual({ ordering: '-created_at', page: '1', page_size: '20' })
  })
})
