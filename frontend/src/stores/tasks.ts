import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { listTasks, type ListTasksParams, type PageTaskRead, type TaskRead } from '../api/generated/client'
import { ApiError, type ApiErrorKind } from '../api/http'
import { latestOnly } from '../api/latestOnly'
import { FIRST_PAGE, useListViewStore } from './listView'
import { useSettingsStore } from './settings'

// `loading` is the first load, with nothing to show yet; `reloading` keeps the rows of the last answer on screen.
// `failed` says the last request failed; the rows of the last answer, if there was one, are still in `items`.
export type TasksStatus = 'idle' | 'loading' | 'reloading' | 'ready' | 'failed'

export const useTasksStore = defineStore('tasks', () => {
  const view = useListViewStore()
  const settings = useSettingsStore()

  const items = shallowRef<TaskRead[]>([])
  const total = ref(0)
  const pages = ref(0)
  // The page `items` belongs to. The view's page runs ahead of it while a page loads and after it failed to.
  const page = ref(FIRST_PAGE)
  const started = ref(false)
  const inFlight = ref(false)
  const answered = ref(false)

  // Stays through a retry and is cleared by the next answer, so the UI can keep the message up while it tries again.
  const error = ref<ApiErrorKind | null>(null)

  const status = computed<TasksStatus>(() => {
    if (!started.value) return 'idle'
    if (inFlight.value) return answered.value ? 'reloading' : 'loading'
    return error.value === null ? 'ready' : 'failed'
  })

  const query = computed<ListTasksParams>(() => ({ ...view.queryParams, page_size: settings.pageSize }))
  // Compared as text, so a view rebuilt with the same values (back and forward do that) is not a change.
  const queryKey = computed(() => JSON.stringify(query.value))

  const requestList = latestOnly((signal, params: ListTasksParams) => listTasks(params, { signal }))

  let latestRequest = 0
  // The query the state already accounts for: the watcher below skips a change to it.
  let coveredQuery: string | null = null

  // Only the latest request may touch the state. A superseded one normally rejects as `aborted`, but an
  // abort that comes after the response has arrived stops nothing, so the outcome is checked, not its kind.
  // Every path of the latest request either settles the state or hands over to a new request.
  async function load(): Promise<void> {
    const request = ++latestRequest
    const params = query.value
    const requestedPage = view.page
    coveredQuery = queryKey.value
    inFlight.value = true
    let answer: PageTaskRead
    try {
      answer = await requestList(params)
    } catch (failure) {
      if (request !== latestRequest) return
      error.value = failure instanceof ApiError ? failure.kind : 'server'
      inFlight.value = false
      return
    }
    if (request !== latestRequest) return
    let shownPage = requestedPage
    const lastPage = Math.max(answer.pages, FIRST_PAGE)
    if (answer.items.length === 0 && view.page > lastPage) {
      // The list got shorter than the address says (tasks deleted, a bigger page size, an old link).
      view.correctPage(lastPage)
      if (answer.total > 0) return load()
      // Nothing matches at all, so page 1 is as empty as this one: the answer in hand already describes it.
      coveredQuery = queryKey.value
      shownPage = FIRST_PAGE
    }
    items.value = answer.items
    total.value = answer.total
    pages.value = answer.pages
    page.value = shownPage
    answered.value = true
    error.value = null
    inFlight.value = false
  }

  function retry(): void {
    if (started.value) void load()
  }

  function start(): void {
    if (started.value) return
    started.value = true
    void load()
  }

  // Both watchers belong to the store, not to whichever component called `start`, so the list keeps
  // following the view after that component is gone.

  // Synchronous, so the page is already 1 when the query watcher below runs: one request, not two.
  watch(
    () => settings.pageSize,
    () => {
      if (started.value) view.correctPage(FIRST_PAGE)
    },
    { flush: 'sync' },
  )

  // Runs once per tick, however many fields of the view changed in it.
  watch(queryKey, (key) => {
    if (started.value && key !== coveredQuery) void load()
  })

  return { items, total, pages, page, status, error, start, retry }
})
