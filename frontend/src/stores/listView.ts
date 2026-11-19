import { useUrlSearchParams } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, nextTick, watch } from 'vue'

import { TaskOrdering, TaskStatus, type ListTasksParams } from '../api/generated/client'

export const LIST_VIEW_STORAGE_KEY = 'tasky:list-view'

export const STATUS_FILTERS = ['all', ...Object.values(TaskStatus)] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export const ORDERINGS = Object.values(TaskOrdering)

export type ListQueryParams = Omit<ListTasksParams, 'page_size'>

const DEFAULT_SEARCH = ''
const DEFAULT_STATUS: StatusFilter = 'all'
const DEFAULT_ORDERING: TaskOrdering = '-created_at'
const FIRST_PAGE = 1

interface Filters {
  search: string
  status: StatusFilter
  ordering: TaskOrdering
}

interface View extends Filters {
  page: number
}

const DEFAULT_VIEW: View = {
  search: DEFAULT_SEARCH,
  status: DEFAULT_STATUS,
  ordering: DEFAULT_ORDERING,
  page: FIRST_PAGE,
}

const OWNED_PARAMS = ['search', 'status', 'ordering', 'page'] as const
type OwnedParam = (typeof OWNED_PARAMS)[number]

function oneOf<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback
}

function searchFrom(value: unknown): string {
  return typeof value === 'string' ? value.trim() : DEFAULT_SEARCH
}

function pageFromNumber(value: number): number {
  return Number.isSafeInteger(value) && value >= FIRST_PAGE ? value : FIRST_PAGE
}

const POSITIVE_INTEGER = /^[1-9]\d*$/

// Strict on purpose: "2e3", " 2" or "1.5" are not page numbers anyone was given a link to.
function pageFromParam(value: unknown): number {
  return typeof value === 'string' && POSITIVE_INTEGER.test(value) ? pageFromNumber(Number(value)) : FIRST_PAGE
}

// Each field is checked on its own, so one bad value does not throw away the others.
function filtersFrom(source: Partial<Record<keyof Filters, unknown>> | null): Filters {
  return {
    search: searchFrom(source?.search),
    status: oneOf(STATUS_FILTERS, source?.status, DEFAULT_STATUS),
    ordering: oneOf(ORDERINGS, source?.ordering, DEFAULT_ORDERING),
  }
}

// Storage can be absent, blocked or hold anything another script or an older version wrote; all of that reads as "nothing saved".
function loadSavedFilters(): Filters {
  try {
    return filtersFrom(JSON.parse(localStorage.getItem(LIST_VIEW_STORAGE_KEY) ?? 'null'))
  } catch {
    return filtersFrom(null)
  }
}

// Private browsing, a full quota or a blocked storage must not break the app: the view then lives in the address only.
function saveFilters(filters: Filters): void {
  try {
    localStorage.setItem(LIST_VIEW_STORAGE_KEY, JSON.stringify(filters))
  } catch {
    return
  }
}

// Defaults stay out of the address, so the default view has a bare one.
function paramsOf(view: View): Record<OwnedParam, string | undefined> {
  return {
    search: view.search === DEFAULT_SEARCH ? undefined : view.search,
    status: view.status === DEFAULT_STATUS ? undefined : view.status,
    ordering: view.ordering === DEFAULT_ORDERING ? undefined : view.ordering,
    page: view.page === FIRST_PAGE ? undefined : String(view.page),
  }
}

export const useListViewStore = defineStore('listView', () => {
  // The address is the source of truth: the composable reads it, follows back/forward, and replaces
  // the current history entry a tick after `params` changes.
  const params = useUrlSearchParams('history')

  const view = computed<View>(() => ({ ...filtersFrom(params), page: pageFromParam(params.page) }))

  function show(next: View): void {
    const nextParams = paramsOf(next)
    for (const name of OWNED_PARAMS) {
      const value = nextParams[name]
      if (value === undefined) {
        delete params[name]
      } else {
        params[name] = value
      }
    }
  }

  let entryAdded = false

  // The composable only replaces the current entry, so a change that deserves its own step in
  // back/forward first duplicates the entry; the replacement then lands on the copy. Changes made
  // in the same tick share one entry.
  function addHistoryEntry(): void {
    if (entryAdded) return
    entryAdded = true
    history.pushState(history.state, '', location.href)
    void nextTick(() => {
      entryAdded = false
    })
  }

  function isCurrent(next: View): boolean {
    return OWNED_PARAMS.every((name) => next[name] === view.value[name])
  }

  // Status, ordering, page and clearing each add a history entry. Search replaces the current one:
  // it changes on every pause in typing and would bury the views worth going back to.
  function change(next: View, { addsHistoryEntry }: { addsHistoryEntry: boolean }): void {
    if (isCurrent(next)) return
    if (addsHistoryEntry) addHistoryEntry()
    show(next)
  }

  // A filter that really changes starts the list again from page 1; setting it to what it already is changes nothing.
  function filter(next: Partial<Filters>, history: { addsHistoryEntry: boolean }): void {
    const filtered = { ...view.value, ...next }
    if (!isCurrent(filtered)) change({ ...filtered, page: FIRST_PAGE }, history)
  }

  const search = computed({
    get: () => view.value.search,
    set: (value: string) => filter({ search: searchFrom(value) }, { addsHistoryEntry: false }),
  })

  const status = computed({
    get: () => view.value.status,
    set: (value: StatusFilter) =>
      filter({ status: oneOf(STATUS_FILTERS, value, DEFAULT_STATUS) }, { addsHistoryEntry: true }),
  })

  const ordering = computed({
    get: () => view.value.ordering,
    set: (value: TaskOrdering) =>
      filter({ ordering: oneOf(ORDERINGS, value, DEFAULT_ORDERING) }, { addsHistoryEntry: true }),
  })

  const page = computed({
    get: () => view.value.page,
    set: (value: number) => change({ ...view.value, page: pageFromNumber(value) }, { addsHistoryEntry: true }),
  })

  // Ordering and page are not filters: they never turn a list with tasks into an empty one.
  const isFiltered = computed(() => search.value !== DEFAULT_SEARCH || status.value !== DEFAULT_STATUS)

  const queryParams = computed<ListQueryParams>(() => {
    const query: ListQueryParams = { ordering: ordering.value, page: page.value }
    if (search.value !== DEFAULT_SEARCH) query.search = search.value
    if (status.value !== DEFAULT_STATUS) query.status = status.value
    return query
  })

  function clearFilters(): void {
    change(DEFAULT_VIEW, { addsHistoryEntry: true })
  }

  const addressDescribesView = OWNED_PARAMS.some((name) => name in params)
  // Also rewrites what the address held in canonical form, which drops its invalid values.
  show(addressDescribesView ? view.value : { ...loadSavedFilters(), page: FIRST_PAGE })

  // Synchronous, so the view is saved by the time the assignment returns; back/forward pass through here too.
  watch(
    [search, status, ordering],
    () => saveFilters({ search: search.value, status: status.value, ordering: ordering.value }),
    { flush: 'sync', immediate: true },
  )

  return { search, status, ordering, page, isFiltered, queryParams, clearFilters }
})
