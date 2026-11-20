import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useListViewStore } from '../../stores/listView'
import type { Locale } from '../../stores/settings'
import { useTasksStore } from '../../stores/tasks'
import { appPlugins } from '../../test/appPlugins'
import { fakeTasksApi, pageOf } from '../../test/tasksApi'
import TaskList from './TaskList.vue'

let mounted: VueWrapper | undefined

// The list as the app shows it: mounted with the real stores, which then start loading.
function openList({ locale = 'en' as Locale, address = '/', realTransitions = false } = {}) {
  history.replaceState(null, '', address)
  const list = mount(TaskList, {
    attachTo: document.body,
    global: { plugins: appPlugins(locale), stubs: realTransitions ? { TransitionGroup: false } : {} },
  })
  mounted = list
  useTasksStore().start()
  return list
}

function titles(list: VueWrapper): string[] {
  return list.findAll('[data-testid="task-title"]').map((title) => title.text())
}

// Intl groups thousands with a no-break space in Ukrainian.
function plainText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function clearFiltersButton(list: VueWrapper) {
  return list.findAll('button').find((button) => button.text() === 'Clear filters')
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

describe('first load', () => {
  it('says the tasks are loading until the first answer arrives', () => {
    fakeTasksApi()

    const list = openList()

    expect(list.get('[role="status"]').text()).toBe('Loading tasks…')
    expect(titles(list)).toEqual([])
    expect(list.text()).not.toContain('No tasks yet')
  })

  it('says so in Ukrainian when the language is Ukrainian', () => {
    fakeTasksApi()

    const list = openList({ locale: 'uk' })

    expect(list.get('[role="status"]').text()).toBe('Завантажуємо задачі…')
  })

  it('shows the tasks in the order the API returned them once they arrive', async () => {
    const api = fakeTasksApi()
    const list = openList()

    await api.respondTo(0, pageOf(['Write the report', 'Call the bank', 'Book a flight']))

    expect(titles(list)).toEqual(['Write the report', 'Call the bank', 'Book a flight'])
    expect(list.find('[aria-hidden="true"].animate-pulse').exists()).toBe(false)
  })

  it('lists every task as an item of one list', async () => {
    const api = fakeTasksApi()
    const list = openList({ realTransitions: true })

    await api.respondTo(0, pageOf(['Write the report', 'Call the bank']))

    expect(list.findAll('ul > li')).toHaveLength(2)
  })
})

describe('total count', () => {
  it.each([
    ['en', 1, '1 task'],
    ['en', 42, '42 tasks'],
    ['en', 1234, '1,234 tasks'],
    ['uk', 1, '1 задача'],
    ['uk', 3, '3 задачі'],
    ['uk', 5, '5 задач'],
    ['uk', 21, '21 задача'],
    ['uk', 1234, '1 234 задачі'],
    ['uk', 1235, '1 235 задач'],
  ] as const)('in %s, a total of %i reads "%s"', async (locale, total, expected) => {
    const api = fakeTasksApi()
    const list = openList({ locale })

    await api.respondTo(0, pageOf(['Write the report'], { total }))

    expect(plainText(list.get('[data-testid="task-total"]').text())).toBe(expected)
  })
})

// One live region that is always there: a screen reader only announces changes to a region it already knows.
describe('announcements', () => {
  it('announces politely, from the same element, through loading and loaded', async () => {
    const api = fakeTasksApi()
    const list = openList()
    const region = list.get('[role="status"]')
    expect(region.text()).toBe('Loading tasks…')

    await api.respondTo(0, pageOf(['Write the report', 'Call the bank'], { total: 1234, pages: 62 }))

    expect(list.findAll('[role="status"]')).toHaveLength(1)
    expect(list.get('[role="status"]').element).toBe(region.element)
    expect(region.text()).toBe('1,234 tasks')
  })

  it('announces that the tasks are being updated while another page loads, then the count again', async () => {
    const api = fakeTasksApi()
    const list = openList()
    const region = list.get('[role="status"]')
    await api.respondTo(0, pageOf(['Write the report'], { total: 40, pages: 2 }))

    useListViewStore().page = 2
    await flushPromises()
    expect(region.text()).toBe('Updating tasks…')

    await api.respondTo(1, pageOf(['Book a flight'], { total: 41, page: 2, pages: 3 }))
    expect(region.text()).toBe('41 tasks')
    expect(list.get('[role="status"]').element).toBe(region.element)
  })

  it('announces the update in Ukrainian when the language is Ukrainian', async () => {
    const api = fakeTasksApi()
    const list = openList({ locale: 'uk' })
    await api.respondTo(0, pageOf(['Write the report'], { total: 40, pages: 2 }))

    useListViewStore().page = 2
    await flushPromises()

    expect(list.get('[role="status"]').text()).toBe('Оновлюємо задачі…')
  })

  it.each([
    ['no filter is set', '/', 'No tasks yet'],
    ['a filter is set', '/?status=done', 'No tasks match your filters'],
  ])('announces that there is nothing to show when %s', async (_name, address, message) => {
    const api = fakeTasksApi()
    const list = openList({ address })

    await api.respondTo(0, pageOf([]))

    expect(list.get('[role="status"]').text()).toBe(message)
  })

  it('leaves a failure to the alert, so it is announced once', async () => {
    const api = fakeTasksApi()
    const list = openList()
    const region = list.get('[role="status"]')

    await api.failWith(0, 500)

    expect(list.get('[role="status"]').element).toBe(region.element)
    expect(region.text()).toBe('')
    expect(list.get('[role="alert"] p').text()).toBe('Something went wrong on the server. Please try again.')
  })
})

describe('reloading', () => {
  it('keeps the previous tasks on screen, marked busy, while another page loads', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.respondTo(0, pageOf(['Write the report', 'Call the bank'], { total: 40, pages: 2 }))

    useListViewStore().page = 2
    await flushPromises()

    expect(titles(list)).toEqual(['Write the report', 'Call the bank'])
    expect(list.get('ul').attributes('aria-busy')).toBe('true')
    expect(list.get('ul').classes()).toContain('opacity-50')
    expect(list.find('[aria-hidden="true"].animate-pulse').exists()).toBe(false)
  })

  it('shows the new tasks at full strength once the other page arrives', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.respondTo(0, pageOf(['Write the report', 'Call the bank'], { total: 40, pages: 2 }))
    useListViewStore().page = 2
    await flushPromises()

    await api.respondTo(1, pageOf(['Book a flight'], { total: 40, page: 2, pages: 2 }))

    expect(titles(list)).toEqual(['Book a flight'])
    expect(list.get('ul').attributes('aria-busy')).toBeUndefined()
    expect(list.get('ul').classes()).not.toContain('opacity-50')
  })

  it('holds a task that leaves the list where it was while it fades out', async () => {
    const api = fakeTasksApi()
    const list = openList({ realTransitions: true })
    await api.respondTo(0, pageOf(['Write the report', 'Call the bank'], { total: 40, pages: 2 }))
    useListViewStore().page = 2
    await flushPromises()

    await api.respondTo(1, pageOf(['Book a flight'], { total: 40, page: 2, pages: 2 }))

    const leaving = list.findAll('li.task-row-leave-active')
    expect(leaving).toHaveLength(2)
    expect(leaving.map((row) => (row.element as HTMLElement).style.top)).toEqual(['0px', '0px'])
  })
})

describe('nothing to show', () => {
  it('says there are no tasks yet when the list is empty and no filter is set', async () => {
    const api = fakeTasksApi()
    const list = openList()

    await api.respondTo(0, pageOf([]))

    expect(list.get('[data-testid="task-list-empty"]').text()).toBe('No tasks yet')
    expect(clearFiltersButton(list)).toBeUndefined()
    expect(list.find('[data-testid="task-total"]').exists()).toBe(false)
    expect(list.find('[aria-hidden="true"].animate-pulse').exists()).toBe(false)
  })

  it('says no tasks match and offers to clear the filters when a filter is set', async () => {
    const api = fakeTasksApi()
    const list = openList({ address: '/?status=done' })

    await api.respondTo(0, pageOf([]))

    expect(list.get('[data-testid="task-list-empty"]').text()).toContain('No tasks match your filters')
    expect(clearFiltersButton(list)).toBeDefined()
  })

  it('words the no-results state in Ukrainian when the language is Ukrainian', async () => {
    const api = fakeTasksApi()
    const list = openList({ locale: 'uk', address: '/?search=звіт' })

    await api.respondTo(0, pageOf([]))

    const empty = list.get('[data-testid="task-list-empty"]')
    expect(empty.text()).toContain('За цими фільтрами нічого не знайдено')
    expect(empty.get('button').text()).toBe('Скинути фільтри')
  })

  it('asks for the unfiltered list and shows loading when "Clear filters" is pressed', async () => {
    const api = fakeTasksApi()
    const list = openList({ address: '/?status=done&search=report' })
    await api.respondTo(0, pageOf([]))

    await clearFiltersButton(list)!.trigger('click')
    await flushPromises()

    expect(api.queries[1]).toEqual({ ordering: '-created_at', page: '1', page_size: '20' })
    expect(list.get('[role="status"]').text()).toBe('Loading tasks…')
    expect(list.find('[data-testid="task-list-empty"]').exists()).toBe(false)
  })

  it('shows the tasks that come back after the filters are cleared', async () => {
    const api = fakeTasksApi()
    const list = openList({ address: '/?status=done' })
    await api.respondTo(0, pageOf([]))
    await clearFiltersButton(list)!.trigger('click')
    await flushPromises()

    await api.respondTo(1, pageOf(['Write the report']))

    expect(titles(list)).toEqual(['Write the report'])
  })
})

describe('errors', () => {
  it.each([
    ['the connection is lost', 'network', 'Could not reach the server. Check your connection and try again.'],
    ['the server fails', 500, 'Something went wrong on the server. Please try again.'],
    ['the list is not there', 404, 'This task no longer exists.'],
    ['the API rejects the request', 422, 'Something went wrong. Please try again.'],
  ] as const)('explains what happened when %s', async (_name, failure, message) => {
    const api = fakeTasksApi()
    const list = openList()

    if (failure === 'network') await api.loseConnection(0)
    else await api.failWith(0, failure)

    expect(list.get('[role="alert"] p').text()).toBe(message)
    expect(list.find('[aria-hidden="true"].animate-pulse').exists()).toBe(false)
    expect(list.find('[data-testid="task-list-empty"]').exists()).toBe(false)
  })

  it('explains the failure in Ukrainian when the language is Ukrainian', async () => {
    const api = fakeTasksApi()
    const list = openList({ locale: 'uk' })

    await api.failWith(0, 500)

    const alert = list.get('[role="alert"]')
    expect(alert.get('p').text()).toBe('На сервері сталася помилка. Спробуйте ще раз.')
    expect(alert.get('button').text()).toBe('Спробувати ще раз')
  })

  it('asks again when "Try again" is pressed, showing the button busy until the answer', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.failWith(0, 500)

    await list.get('[role="alert"] button').trigger('click')

    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual(api.queries[0])
    const retry = list.get('[role="alert"] button')
    expect(retry.text()).toBe('Try again')
    expect(retry.attributes('aria-busy')).toBe('true')
  })

  it('keeps "Try again" focusable while it asks again, and does not ask twice when it is pressed again', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.loseConnection(0)
    const retry = list.get<HTMLButtonElement>('[role="alert"] button')
    retry.element.focus()

    await retry.trigger('click')
    await retry.trigger('click')

    expect(api.queries).toHaveLength(2)
    expect(retry.element.disabled).toBe(false)
    expect(retry.attributes('aria-disabled')).toBe('true')
    expect(retry.find('[data-testid="button-spinner"]').exists()).toBe(true)
    expect(document.activeElement).toBe(retry.element)
  })

  it('leaves "Try again" ready to press once the request has failed', async () => {
    const api = fakeTasksApi()
    const list = openList()

    await api.failWith(0, 500)

    const retry = list.get('[role="alert"] button')
    expect(retry.attributes('aria-busy')).toBeUndefined()
    expect(retry.attributes('aria-disabled')).toBeUndefined()
  })

  it('replaces the error with the tasks when the retry succeeds', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.failWith(0, 500)
    await list.get('[role="alert"] button').trigger('click')

    await api.respondTo(1, pageOf(['Write the report']))

    expect(list.find('[role="alert"]').exists()).toBe(false)
    expect(titles(list)).toEqual(['Write the report'])
  })

  it('keeps the tasks and shows the error above them when a reload fails', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.respondTo(0, pageOf(['Write the report', 'Call the bank'], { total: 40, pages: 2 }))
    useListViewStore().page = 2
    await flushPromises()

    await api.loseConnection(1)

    expect(titles(list)).toEqual(['Write the report', 'Call the bank'])
    expect(list.find('[role="alert"] ~ ul').exists()).toBe(true)
    expect(list.get('ul').attributes('aria-busy')).toBeUndefined()
  })
})

describe('pages', () => {
  it('says which page is shown when the tasks span several pages', async () => {
    const api = fakeTasksApi()
    const list = openList()

    await api.respondTo(0, pageOf(['Write the report'], { total: 45, pages: 3 }))

    expect(list.get('[data-testid="page-position"]').text()).toBe('Page 1 of 3')
  })

  it('offers no page controls when all the tasks fit on one page', async () => {
    const api = fakeTasksApi()
    const list = openList()

    await api.respondTo(0, pageOf(['Write the report']))

    expect(list.find('nav').exists()).toBe(false)
  })

  it('asks for the next page and puts it in the address when "Next" is pressed', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.respondTo(0, pageOf(['Write the report'], { total: 45, pages: 3 }))

    await list.get('button[aria-label="Next"]').trigger('click')
    await flushPromises()

    expect(api.queries[1]).toEqual({ ordering: '-created_at', page: '2', page_size: '20' })
    expect(location.search).toBe('?page=2')
  })

  it('names the page of the tasks on screen: the old one until the next page arrives', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.respondTo(0, pageOf(['Write the report'], { total: 45, pages: 3 }))

    await list.get('button[aria-label="Next"]').trigger('click')
    await flushPromises()
    expect(list.get('[data-testid="page-position"]').text()).toBe('Page 1 of 3')

    await api.respondTo(1, pageOf(['Book a flight'], { total: 45, page: 2, pages: 3 }))
    expect(list.get('[data-testid="page-position"]').text()).toBe('Page 2 of 3')
  })

  it('still names the page of the tasks on screen after the next page failed to load', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.respondTo(0, pageOf(['Write the report'], { total: 45, pages: 3 }))
    await list.get('button[aria-label="Next"]').trigger('click')
    await flushPromises()

    await api.loseConnection(1)

    expect(titles(list)).toEqual(['Write the report'])
    expect(list.get('[data-testid="page-position"]').text()).toBe('Page 1 of 3')
    expect(list.get('[data-testid="task-total"]').text()).toBe('45 tasks')
    expect(list.get('button[aria-label="Previous"]').attributes('aria-disabled')).toBe('true')
  })

  it('asks for the page that failed again when "Next" is pressed once more', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.respondTo(0, pageOf(['Write the report'], { total: 45, pages: 3 }))
    await list.get('button[aria-label="Next"]').trigger('click')
    await flushPromises()
    await api.loseConnection(1)

    await list.get('button[aria-label="Next"]').trigger('click')
    await flushPromises()

    expect(api.queries).toHaveLength(3)
    expect(api.queries[2]).toEqual({ ordering: '-created_at', page: '2', page_size: '20' })

    await api.respondTo(2, pageOf(['Book a flight'], { total: 45, page: 2, pages: 3 }))
    expect(list.get('[data-testid="page-position"]').text()).toBe('Page 2 of 3')
    expect(list.find('[role="alert"]').exists()).toBe(false)
  })

  it('asks once for the next page however many times "Next" is pressed while it loads', async () => {
    const api = fakeTasksApi()
    const list = openList()
    await api.respondTo(0, pageOf(['Write the report'], { total: 45, pages: 3 }))

    await list.get('button[aria-label="Next"]').trigger('click')
    await flushPromises()
    await list.get('button[aria-label="Next"]').trigger('click')
    await flushPromises()

    expect(api.queries).toHaveLength(2)
  })

  it('goes back a page when "Previous" is pressed', async () => {
    const api = fakeTasksApi()
    const list = openList({ address: '/?page=3' })
    await api.respondTo(0, pageOf(['Write the report'], { total: 45, page: 3, pages: 3 }))

    await list.get('button[aria-label="Previous"]').trigger('click')
    await flushPromises()

    expect(api.queries[1]).toMatchObject({ page: '2' })
  })

  it('has nowhere further to go on the last page', async () => {
    const api = fakeTasksApi()
    const list = openList({ address: '/?page=3' })

    await api.respondTo(0, pageOf(['Write the report'], { total: 45, page: 3, pages: 3 }))

    expect(list.get('button[aria-label="Next"]').attributes('aria-disabled')).toBe('true')
    expect(list.get('button[aria-label="Previous"]').attributes('aria-disabled')).toBeUndefined()
  })
})
