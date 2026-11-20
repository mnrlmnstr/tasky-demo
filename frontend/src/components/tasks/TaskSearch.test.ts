import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useListViewStore } from '../../stores/listView'
import type { Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import TaskSearch from './TaskSearch.vue'

const SEARCH_DELAY = 300

let mounted: VueWrapper | undefined

async function mountSearch(locale: Locale = 'en') {
  mounted = mount(TaskSearch, { global: { plugins: appPlugins(locale) }, attachTo: document.body })
  await flushPromises()
  return mounted
}

function searchBox(search: VueWrapper) {
  return search.get<HTMLInputElement>('input[type="search"]')
}

async function type(search: VueWrapper, text: string) {
  await searchBox(search).setValue(text)
}

function findClearSearch(search: VueWrapper) {
  return search.find('button[aria-label="Clear search"]')
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
    const search = await mountSearch()

    expect(searchBox(search).attributes('aria-label')).toBe('Search tasks')
    expect(searchBox(search).attributes('placeholder')).toBe('Search by title')
    expect(search.get('svg.lucide-search').attributes('aria-hidden')).toBe('true')
  })

  it('shows what was typed at once but searches only after the typing has paused', async () => {
    const search = await mountSearch()
    const view = useListViewStore()

    await type(search, 'report')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 1)

    expect(searchBox(search).element.value).toBe('report')
    expect(view.search).toBe('')

    await vi.advanceTimersByTimeAsync(1)

    expect(view.search).toBe('report')
  })

  it('waits for the last keystroke: typing again starts the pause over', async () => {
    const search = await mountSearch()
    const view = useListViewStore()

    await type(search, 'rep')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 100)
    await type(search, 'report')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 100)

    expect(view.search).toBe('')

    await vi.advanceTimersByTimeAsync(100)

    expect(view.search).toBe('report')
  })

  it('goes back to the first page when the search changes', async () => {
    history.replaceState(null, '', '/?page=3')
    const search = await mountSearch()
    const view = useListViewStore()

    await type(search, 'report')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY)

    expect(view.page).toBe(1)
  })

  it('starts with the search the address carries', async () => {
    history.replaceState(null, '', '/?search=report')

    const search = await mountSearch()

    expect(searchBox(search).element.value).toBe('report')
  })

  it('follows a search changed elsewhere, such as by going back', async () => {
    const search = await mountSearch()

    useListViewStore().search = 'bank'
    await nextTick()

    expect(searchBox(search).element.value).toBe('bank')
  })

  it('keeps a space typed at the end, although the search itself is trimmed', async () => {
    const search = await mountSearch()
    const view = useListViewStore()

    await type(search, 'write the ')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY)
    await nextTick()

    expect(view.search).toBe('write the')
    expect(searchBox(search).element.value).toBe('write the ')
  })

  it('offers no clear button while the field is empty', async () => {
    const search = await mountSearch()

    expect(findClearSearch(search).exists()).toBe(false)
  })

  it('offers a clear button as soon as something is typed', async () => {
    const search = await mountSearch()

    await type(search, 'r')

    expect(findClearSearch(search).exists()).toBe(true)
    expect(findClearSearch(search).get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('empties the field and the search at once when the clear button is pressed, and returns focus to the field', async () => {
    history.replaceState(null, '', '/?search=report')
    const search = await mountSearch()
    const view = useListViewStore()

    await findClearSearch(search).trigger('click')

    expect(searchBox(search).element.value).toBe('')
    expect(view.search).toBe('')
    expect(document.activeElement).toBe(searchBox(search).element)
    expect(findClearSearch(search).exists()).toBe(false)
  })

  it('does not search for text that was cleared before the pause ended', async () => {
    const search = await mountSearch()
    const view = useListViewStore()

    await type(search, 'report')
    await findClearSearch(search).trigger('click')
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY)

    expect(view.search).toBe('')
  })

  it('empties the field when the filters are cleared', async () => {
    history.replaceState(null, '', '/?search=report&status=done')
    const search = await mountSearch()

    useListViewStore().clearFilters()
    await nextTick()

    expect(searchBox(search).element.value).toBe('')
  })

  it('also drops text that was typed but not searched for yet when the filters are cleared', async () => {
    history.replaceState(null, '', '/?status=done')
    const search = await mountSearch()
    const view = useListViewStore()

    await type(search, 'report')
    view.clearFilters()
    await nextTick()
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY)

    expect(searchBox(search).element.value).toBe('')
    expect(view.search).toBe('')
  })

  it('names the field and its clear button in Ukrainian when the language is Ukrainian', async () => {
    history.replaceState(null, '', '/?search=звіт')

    const search = await mountSearch('uk')

    expect(searchBox(search).attributes('aria-label')).toBe('Пошук задач')
    expect(searchBox(search).attributes('placeholder')).toBe('Пошук за назвою')
    expect(search.find('button[aria-label="Очистити пошук"]').exists()).toBe(true)
  })
})
