import { parseDate, toZoned, type CalendarDate } from '@internationalized/date'
import { createEventHook, useUrlSearchParams } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, nextTick, watch } from 'vue'

import { TaskOrdering, TaskStatus, type ListTasksParams } from '../api/generated/client'
import { clockTimeZone, injectClock } from '../i18n/clock'
import { oneOf, readStored, writeStored } from './storage'

export const LIST_VIEW_STORAGE_KEY = 'tasky:list-view'

export const STATUS_FILTERS = ['all', ...Object.values(TaskStatus)] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export const ORDERINGS = Object.values(TaskOrdering)

export type ListQueryParams = Omit<ListTasksParams, 'page_size'>

const DEFAULT_SEARCH = ''
const DEFAULT_STATUS: StatusFilter = 'all'
const DEFAULT_ORDERING: TaskOrdering = '-created_at'
export const FIRST_PAGE = 1

// No bound: a deadline filter is a pair of local days, either of which can be left open.
const NO_DAY = ''

interface Filters {
  search: string
  status: StatusFilter
  ordering: TaskOrdering
  /** First local day due, `YYYY-MM-DD`, or empty. */
  deadlineFrom: string
  /** Last local day due (included), `YYYY-MM-DD`, or empty. */
  deadlineTo: string
}

interface View extends Filters {
  page: number
}

const VIEW_FIELDS = ['search', 'status', 'ordering', 'deadlineFrom', 'deadlineTo', 'page'] as const

// The address names each field the way the API does.
const PARAM_OF = {
  search: 'search',
  status: 'status',
  ordering: 'ordering',
  deadlineFrom: 'deadline_from',
  deadlineTo: 'deadline_to',
  page: 'page',
} as const satisfies Record<keyof View, string>
type OwnedParam = (typeof PARAM_OF)[keyof View]
const OWNED_PARAMS = Object.values(PARAM_OF)

// Whether a change gets its own step in back/forward or takes the place of the current one.
type HistoryStep = 'push' | 'replace'

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

const LOCAL_DAY = /^\d{4}-\d{2}-\d{2}$/

// A real calendar day whose next day is one too, since the API is sent the midnight after the last day.
function dayFrom(value: unknown): string {
  if (typeof value !== 'string' || !LOCAL_DAY.test(value)) return NO_DAY
  try {
    const day = parseDate(value)
    // Past the last day the library knows, adding a day stays on it.
    return day.add({ days: 1 }).compare(day) > 0 ? value : NO_DAY
  } catch {
    return NO_DAY
  }
}

// Each bound is checked on its own; a range that ends before it starts means no deadline filter at all.
function deadlineRange(from: unknown, to: unknown): Pick<Filters, 'deadlineFrom' | 'deadlineTo'> {
  const range = { deadlineFrom: dayFrom(from), deadlineTo: dayFrom(to) }
  const reversed = range.deadlineFrom !== NO_DAY && range.deadlineTo !== NO_DAY && range.deadlineFrom > range.deadlineTo
  return reversed ? { deadlineFrom: NO_DAY, deadlineTo: NO_DAY } : range
}

// Each field is checked on its own, so one bad value does not throw away the others.
function filtersFrom(source: Partial<Record<keyof Filters, unknown>> | null): Filters {
  return {
    search: searchFrom(source?.search),
    status: oneOf(STATUS_FILTERS, source?.status, DEFAULT_STATUS),
    ordering: oneOf(ORDERINGS, source?.ordering, DEFAULT_ORDERING),
    ...deadlineRange(source?.deadlineFrom, source?.deadlineTo),
  }
}

function filtersFromParams(params: Record<string, unknown>): Filters {
  return filtersFrom({ ...params, deadlineFrom: params[PARAM_OF.deadlineFrom], deadlineTo: params[PARAM_OF.deadlineTo] })
}

// Local midnight at the start of the day, as an instant in UTC.
function startOfDay(day: CalendarDate, timeZone: string): string {
  return toZoned(day, timeZone).toAbsoluteString()
}

function loadSavedFilters(): Filters {
  return filtersFrom(readStored(LIST_VIEW_STORAGE_KEY) as Parameters<typeof filtersFrom>[0])
}

// When storage refuses, the view lives in the address only.
function saveFilters(filters: Filters): void {
  writeStored(LIST_VIEW_STORAGE_KEY, filters)
}

// Defaults stay out of the address, so the default view has a bare one.
function paramsOf(view: View): Record<OwnedParam, string | undefined> {
  return {
    search: view.search === DEFAULT_SEARCH ? undefined : view.search,
    status: view.status === DEFAULT_STATUS ? undefined : view.status,
    ordering: view.ordering === DEFAULT_ORDERING ? undefined : view.ordering,
    deadline_from: view.deadlineFrom === NO_DAY ? undefined : view.deadlineFrom,
    deadline_to: view.deadlineTo === NO_DAY ? undefined : view.deadlineTo,
    page: view.page === FIRST_PAGE ? undefined : String(view.page),
  }
}

export const useListViewStore = defineStore('listView', () => {
  // The address is the source of truth: the composable reads it, follows back/forward, and replaces
  // the current history entry a tick after `params` changes.
  const params = useUrlSearchParams('history')
  const clock = injectClock()

  const view = computed<View>(() => ({ ...filtersFromParams(params), page: pageFromParam(params.page) }))

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
    return VIEW_FIELDS.every((field) => next[field] === view.value[field])
  }

  // Status, ordering, page and clearing each add a history entry. Search replaces the current one:
  // it changes on every pause in typing and would bury the views worth going back to.
  function change(next: View, step: HistoryStep): void {
    if (isCurrent(next)) return
    if (step === 'push') addHistoryEntry()
    show(next)
  }

  // A filter that really changes starts the list again from page 1; setting it to what it already is changes nothing.
  function filter(next: Partial<Filters>, step: HistoryStep): void {
    const filtered = { ...view.value, ...next }
    if (!isCurrent(filtered)) change({ ...filtered, page: FIRST_PAGE }, step)
  }

  const search = computed({
    get: () => view.value.search,
    set: (value: string) => filter({ search: searchFrom(value) }, 'replace'),
  })

  const status = computed({
    get: () => view.value.status,
    set: (value: StatusFilter) =>
      filter({ status: oneOf(STATUS_FILTERS, value, DEFAULT_STATUS) }, 'push'),
  })

  const ordering = computed({
    get: () => view.value.ordering,
    set: (value: TaskOrdering) =>
      filter({ ordering: oneOf(ORDERINGS, value, DEFAULT_ORDERING) }, 'push'),
  })

  const deadlineFrom = computed(() => view.value.deadlineFrom)
  const deadlineTo = computed(() => view.value.deadlineTo)

  /** Both bounds at once, as one step in history; an empty one is left open. */
  function setDeadline(from: string, to: string): void {
    filter(deadlineRange(from, to), 'push')
  }

  const page = computed({
    get: () => view.value.page,
    set: (value: number) => change({ ...view.value, page: pageFromNumber(value) }, 'push'),
  })

  // For a page the user did not choose (the list got shorter, the page size changed): it takes the
  // place of the current history entry, so back never lands on a page that sends the user forward again.
  function correctPage(value: number): void {
    change({ ...view.value, page: pageFromNumber(value) }, 'replace')
  }

  // Ordering and page are not filters: they never turn a list with tasks into an empty one.
  const isFiltered = computed(
    () =>
      search.value !== DEFAULT_SEARCH ||
      status.value !== DEFAULT_STATUS ||
      deadlineFrom.value !== NO_DAY ||
      deadlineTo.value !== NO_DAY,
  )

  // The days are the user's: the API gets local midnight of the first day and local midnight after the last.
  const queryParams = computed<ListQueryParams>(() => {
    const query: ListQueryParams = { ordering: ordering.value, page: page.value }
    if (search.value !== DEFAULT_SEARCH) query.search = search.value
    if (status.value !== DEFAULT_STATUS) query.status = status.value
    const timeZone = clockTimeZone(clock)
    if (deadlineFrom.value !== NO_DAY) query.deadline_from = startOfDay(parseDate(deadlineFrom.value), timeZone)
    if (deadlineTo.value !== NO_DAY) {
      query.deadline_to = startOfDay(parseDate(deadlineTo.value).add({ days: 1 }), timeZone)
    }
    return query
  })

  // Told before the view changes, so a field with typing not yet searched for (the toolbar's) can drop it,
  // whichever "Clear filters" was pressed.
  const filtersCleared = createEventHook<void>()

  function clearFilters(): void {
    void filtersCleared.trigger()
    filter({ search: DEFAULT_SEARCH, status: DEFAULT_STATUS, deadlineFrom: NO_DAY, deadlineTo: NO_DAY }, 'push')
  }

  const addressDescribesView = OWNED_PARAMS.some((name) => name in params)
  // Also rewrites what the address held in canonical form, which drops its invalid values.
  show(addressDescribesView ? view.value : { ...loadSavedFilters(), page: FIRST_PAGE })

  // Synchronous, so the view is saved by the time the assignment returns; back/forward pass through here too.
  watch(
    [search, status, ordering, deadlineFrom, deadlineTo],
    () =>
      saveFilters({
        search: search.value,
        status: status.value,
        ordering: ordering.value,
        deadlineFrom: deadlineFrom.value,
        deadlineTo: deadlineTo.value,
      }),
    { flush: 'sync', immediate: true },
  )

  return {
    search,
    status,
    ordering,
    deadlineFrom,
    deadlineTo,
    setDeadline,
    page,
    isFiltered,
    queryParams,
    clearFilters,
    onFiltersCleared: filtersCleared.on,
    correctPage,
  }
})
