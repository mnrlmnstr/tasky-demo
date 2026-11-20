import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useListViewStore } from '../../stores/listView'
import type { Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import TaskToolbar from './TaskToolbar.vue'

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

describe('toolbar', () => {
  it('holds no search field: the search lives in the header', async () => {
    const toolbar = await mountToolbar()

    expect(toolbar.find('input').exists()).toBe(false)
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
    expect(statusSegments(toolbar)[0].attributes('aria-pressed')).toBe('true')
    expect(findClearFilters(toolbar)).toBeUndefined()
  })

  it('is offered for a deadline filter alone and clears it', async () => {
    history.replaceState(null, '', '/?deadline_from=2026-11-20&deadline_to=2026-11-24')
    const toolbar = await mountToolbar()
    const view = useListViewStore()

    await findClearFilters(toolbar)?.trigger('click')

    expect([view.deadlineFrom, view.deadlineTo]).toEqual(['', ''])
    expect(toolbar.get('[data-testid="deadline-filter"]').text()).toBe('Deadline')
    expect(findClearFilters(toolbar)).toBeUndefined()
  })

  // The toolbar is a grid of rows that are always there: a phone has status / sorting, a wider screen
  // has status and sorting on one row. "Clear filters" takes the free end of the last row, so it never
  // adds a row and the list below does not move when a filter is set or cleared.
  it('takes the free end of a row the toolbar always has, instead of a row of its own', async () => {
    history.replaceState(null, '', '/?status=done')

    const toolbar = await mountToolbar()

    const rowClasses = (classes: string[]) => classes.filter((name) => /(^|:)row-start-/.test(name)).sort()
    const clear = findClearFilters(toolbar)?.classes() ?? []
    expect(rowClasses(clear)).toEqual(['md:row-start-1', 'row-start-2'])
    expect(rowClasses(sortTrigger(toolbar).classes())).toEqual(['md:row-start-1', 'row-start-2'])
    expect(rowClasses(toolbar.get('[role="group"][aria-label="Status"]').classes())).toEqual(['row-start-1'])
  })

  it('leaves room for itself by shortening a long sorting name, which the button still names in full', async () => {
    history.replaceState(null, '', '/?status=done&ordering=-deadline')

    const toolbar = await mountToolbar()

    const label = sortTrigger(toolbar).get('span')
    expect(label.text()).toBe('Deadline: latest first')
    expect(label.classes()).toContain('truncate')
    expect(sortTrigger(toolbar).attributes('aria-label')).toBe('Sort: Deadline: latest first')
  })

  // On a wider screen status, "Clear filters" and the sorting share one row: the sorting's column may
  // shrink, the label of "Clear filters" may not, so a long Ukrainian label stays on one line.
  it('keeps its label on one line and lets the sorting give way on a shared row', async () => {
    history.replaceState(null, '', '/?status=done&ordering=-deadline')

    const toolbar = await mountToolbar('uk')

    const clear = toolbar.findAll('button').find((button) => button.text() === 'Скинути фільтри')
    expect(clear?.classes()).toContain('whitespace-nowrap')
    expect(toolbar.get('div.grid').classes()).toContain('md:grid-cols-[auto_minmax(min-content,1fr)_minmax(0,auto)]')
  })

  it('is named in Ukrainian when the language is Ukrainian', async () => {
    history.replaceState(null, '', '/?status=done')

    const toolbar = await mountToolbar('uk')

    expect(toolbar.findAll('button').some((button) => button.text() === 'Скинути фільтри')).toBe(true)
  })
})
