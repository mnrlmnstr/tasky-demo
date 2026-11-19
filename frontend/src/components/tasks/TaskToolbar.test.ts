import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useListViewStore } from '../../stores/listView'
import type { Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import TaskToolbar from './TaskToolbar.vue'

const SEARCH_DELAY = 300

let mounted: VueWrapper | undefined

async function mountToolbar(locale: Locale = 'en') {
  mounted = mount(TaskToolbar, { global: { plugins: appPlugins(locale) }, attachTo: document.body })
  await settle()
  return mounted
}

/** Lets the menu finish its deferred work (focus moves, positioning) without reaching the search delay. */
async function settle() {
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1)
  await flushPromises()
}

function searchBox(toolbar: VueWrapper) {
  return toolbar.get<HTMLInputElement>('input[type="search"]')
}

async function type(toolbar: VueWrapper, text: string) {
  await searchBox(toolbar).setValue(text)
}

function findClearSearch(toolbar: VueWrapper) {
  return toolbar.find('button[aria-label="Clear search"]')
}

function statusSegments(toolbar: VueWrapper) {
  return toolbar.get('[role="group"][aria-label="Status"]').findAll('button')
}

function sortTrigger(toolbar: VueWrapper) {
  return toolbar.get<HTMLButtonElement>('button[aria-haspopup="menu"]')
}

function sortItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]'))
}

async function openSort(toolbar: VueWrapper) {
  sortTrigger(toolbar).element.click()
  await settle()
}

async function chooseSort(toolbar: VueWrapper, label: string) {
  await openSort(toolbar)
  const item = sortItems().find((candidate) => candidate.textContent?.trim() === label)
  if (!item) throw new Error(`The sort menu has no "${label}" item`)
  item.click()
  await settle()
}

async function pressKey(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  await settle()
}

function findClearFilters(toolbar: VueWrapper) {
  return toolbar.findAll('button').find((button) => button.text() === 'Clear filters')
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  // Only the timers: flushPromises waits on the real event loop.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.useRealTimers()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('search', () => {
  it('is a search field named for assistive technology, with a hint and a decorative search icon', async () => {
    const toolbar = await mountToolbar()

    expect(searchBox(toolbar).attributes('aria-label')).toBe('Search tasks')
    expect(searchBox(toolbar).attributes('placeholder')).toBe('Search by title')
    expect(toolbar.get('svg.lucide-search').attributes('aria-hidden')).toBe('true')
  })

  it('shows what was typed at once but searches only after the typing has paused', async () => {
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await type(toolbar, 'report')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 1)

    expect(searchBox(toolbar).element.value).toBe('report')
    expect(view.search).toBe('')

    await vi.advanceTimersByTimeAsync(1)

    expect(view.search).toBe('report')
  })

  it('waits for the last keystroke: typing again starts the pause over', async () => {
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await type(toolbar, 'rep')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 100)
    await type(toolbar, 'report')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 100)

    expect(view.search).toBe('')

    await vi.advanceTimersByTimeAsync(100)

    expect(view.search).toBe('report')
  })

  it('goes back to the first page when the search changes', async () => {
    history.replaceState(null, '', '/?page=3')
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await type(toolbar, 'report')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY)

    expect(view.page).toBe(1)
  })

  it('starts with the search the address carries', async () => {
    history.replaceState(null, '', '/?search=report')

    const toolbar = await mountToolbar()

    expect(searchBox(toolbar).element.value).toBe('report')
  })

  it('follows a search changed elsewhere, such as by going back', async () => {
    const toolbar = await mountToolbar()

    useListViewStore().search = 'bank'
    await nextTick()

    expect(searchBox(toolbar).element.value).toBe('bank')
  })

  it('keeps a space typed at the end, although the search itself is trimmed', async () => {
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await type(toolbar, 'write the ')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY)
    await nextTick()

    expect(view.search).toBe('write the')
    expect(searchBox(toolbar).element.value).toBe('write the ')
  })

  it('offers no clear button while the field is empty', async () => {
    const toolbar = await mountToolbar()

    expect(findClearSearch(toolbar).exists()).toBe(false)
  })

  it('offers a clear button as soon as something is typed', async () => {
    const toolbar = await mountToolbar()

    await type(toolbar, 'r')

    expect(findClearSearch(toolbar).exists()).toBe(true)
    expect(findClearSearch(toolbar).get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('empties the field and the search at once when the clear button is pressed, and returns focus to the field', async () => {
    history.replaceState(null, '', '/?search=report')
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await findClearSearch(toolbar).trigger('click')

    expect(searchBox(toolbar).element.value).toBe('')
    expect(view.search).toBe('')
    expect(document.activeElement).toBe(searchBox(toolbar).element)
    expect(findClearSearch(toolbar).exists()).toBe(false)
  })

  it('does not search for text that was cleared before the pause ended', async () => {
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await type(toolbar, 'report')
    await findClearSearch(toolbar).trigger('click')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY)

    expect(view.search).toBe('')
  })

  it('names the field and its clear button in Ukrainian when the language is Ukrainian', async () => {
    history.replaceState(null, '', '/?search=звіт')

    const toolbar = await mountToolbar('uk')

    expect(searchBox(toolbar).attributes('aria-label')).toBe('Пошук задач')
    expect(searchBox(toolbar).attributes('placeholder')).toBe('Пошук за назвою')
    expect(toolbar.find('button[aria-label="Очистити пошук"]').exists()).toBe(true)
  })
})

describe('status filter', () => {
  it('offers every status, with "All" first and selected by default', async () => {
    const toolbar = await mountToolbar()

    const segments = statusSegments(toolbar)
    expect(segments.map((segment) => segment.text())).toEqual(['All', 'To do', 'In progress', 'Done'])
    expect(segments.map((segment) => segment.attributes('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ])
  })

  it('filters by the status that was chosen and goes back to the first page', async () => {
    history.replaceState(null, '', '/?page=3')
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await statusSegments(toolbar)[2].trigger('click')

    expect(view.status).toBe('in_progress')
    expect(view.page).toBe(1)
    expect(statusSegments(toolbar)[2].attributes('aria-pressed')).toBe('true')
  })

  it('shows the status the address carries', async () => {
    history.replaceState(null, '', '/?status=done')

    const toolbar = await mountToolbar()

    expect(statusSegments(toolbar)[3].attributes('aria-pressed')).toBe('true')
  })

  it('names the statuses in Ukrainian when the language is Ukrainian', async () => {
    const toolbar = await mountToolbar('uk')

    const group = toolbar.get('[role="group"][aria-label="Статус"]')
    expect(group.findAll('button').map((segment) => segment.text())).toEqual([
      'Усі',
      'До виконання',
      'У роботі',
      'Виконано',
    ])
  })
})

describe('sorting', () => {
  it('shows the current sorting on its button, named as the sort control', async () => {
    const toolbar = await mountToolbar()

    expect(sortTrigger(toolbar).attributes('aria-label')).toBe('Sort: Newest first')
    expect(sortTrigger(toolbar).attributes('data-variant')).toBe('secondary')
  })

  it('offers the four sortings, with the current one checked', async () => {
    const toolbar = await mountToolbar()

    await openSort(toolbar)

    expect(sortItems().map((item) => item.textContent?.trim())).toEqual([
      'Newest first',
      'Oldest first',
      'Deadline: soonest first',
      'Deadline: latest first',
    ])
    expect(sortItems().map((item) => item.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ])
  })

  it.each([
    ['Newest first', '-created_at'],
    ['Oldest first', 'created_at'],
    ['Deadline: soonest first', 'deadline'],
    ['Deadline: latest first', '-deadline'],
  ])('sorts "%s" as %s', async (label, ordering) => {
    history.replaceState(null, '', label === 'Newest first' ? '/?ordering=deadline' : '/')
    const toolbar = await mountToolbar()

    await chooseSort(toolbar, label)

    expect(useListViewStore().ordering).toBe(ordering)
    expect(sortTrigger(toolbar).attributes('aria-label')).toBe(`Sort: ${label}`)
  })

  it('goes back to the first page when the sorting changes', async () => {
    history.replaceState(null, '', '/?page=3')
    const toolbar = await mountToolbar()

    await chooseSort(toolbar, 'Oldest first')

    expect(useListViewStore().page).toBe(1)
  })

  it('shows the sorting the address carries, on the button and in the menu', async () => {
    history.replaceState(null, '', '/?ordering=-deadline')
    const toolbar = await mountToolbar()

    await openSort(toolbar)

    expect(sortTrigger(toolbar).attributes('aria-label')).toBe('Sort: Deadline: latest first')
    expect(sortItems().map((item) => item.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'true',
    ])
  })

  it('can be changed from the keyboard alone', async () => {
    const toolbar = await mountToolbar()
    const trigger = sortTrigger(toolbar).element
    trigger.focus()

    await pressKey(trigger, 'ArrowDown')
    await pressKey(document.activeElement as Element, 'End')
    await pressKey(document.activeElement as Element, 'Enter')

    expect(useListViewStore().ordering).toBe('-deadline')
    expect(document.activeElement).toBe(trigger)
  })

  it('names the sortings in Ukrainian when the language is Ukrainian', async () => {
    const toolbar = await mountToolbar('uk')

    await openSort(toolbar)

    expect(sortTrigger(toolbar).attributes('aria-label')).toBe('Сортування: Спочатку нові')
    expect(sortItems().map((item) => item.textContent?.trim())).toEqual([
      'Спочатку нові',
      'Спочатку старі',
      'Дедлайн: спочатку найближчі',
      'Дедлайн: спочатку найдальші',
    ])
  })
})

describe('clear filters', () => {
  it('is not offered while nothing is filtered', async () => {
    const toolbar = await mountToolbar()

    expect(findClearFilters(toolbar)).toBeUndefined()
  })

  it('is not offered for a sorting alone, which is not a filter', async () => {
    history.replaceState(null, '', '/?ordering=deadline')

    const toolbar = await mountToolbar()

    expect(findClearFilters(toolbar)).toBeUndefined()
  })

  it.each([
    ['a status', '/?status=todo'],
    ['a search', '/?search=report'],
  ])('is offered as a ghost button once %s is set', async (_name, address) => {
    history.replaceState(null, '', address)

    const toolbar = await mountToolbar()

    expect(findClearFilters(toolbar)?.attributes('data-variant')).toBe('ghost')
  })

  it('appears as soon as a filter is chosen', async () => {
    const toolbar = await mountToolbar()

    await statusSegments(toolbar)[1].trigger('click')

    expect(findClearFilters(toolbar)).toBeDefined()
  })

  it('resets the search and the status, keeps the sorting, and goes away', async () => {
    history.replaceState(null, '', '/?search=report&status=done&ordering=deadline&page=2')
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await findClearFilters(toolbar)?.trigger('click')

    expect(view.search).toBe('')
    expect(view.status).toBe('all')
    expect(view.ordering).toBe('deadline')
    expect(view.page).toBe(1)
    expect(searchBox(toolbar).element.value).toBe('')
    expect(statusSegments(toolbar)[0].attributes('aria-pressed')).toBe('true')
    expect(findClearFilters(toolbar)).toBeUndefined()
  })

  it('also drops text that was typed but not searched for yet', async () => {
    history.replaceState(null, '', '/?status=done')
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await type(toolbar, 'report')
    await findClearFilters(toolbar)?.trigger('click')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY)

    expect(searchBox(toolbar).element.value).toBe('')
    expect(view.search).toBe('')
  })

  it('is named in Ukrainian when the language is Ukrainian', async () => {
    history.replaceState(null, '', '/?status=done')

    const toolbar = await mountToolbar('uk')

    expect(toolbar.findAll('button').some((button) => button.text() === 'Скинути фільтри')).toBe(true)
  })
})
