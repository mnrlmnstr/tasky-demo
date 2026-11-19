import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { listTasks, type ListTasksParams, type PageTaskRead, type TaskRead } from '../api/generated/client'
import type { ApiError, ApiErrorKind } from '../api/http'
import { latestOnly } from '../api/latestOnly'
import { useListViewStore } from './listView'
import { useSettingsStore } from './settings'

// `loading` is the first load, with nothing to show yet; `reloading` keeps the rows of the last answer on screen.
// `failed` says the last request failed; the rows of the last answer, if there was one, are still in `items`.
export type TasksStatus = 'idle' | 'loading' | 'reloading' | 'ready' | 'failed'

const FIRST_PAGE = 1

export const useTasksStore = defineStore('tasks', () => {
  const view = useListViewStore()
  const settings = useSettingsStore()

  const items = shallowRef<TaskRead[]>([])
  const total = ref(0)
  const pages = ref(0)
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

  // Only the latest request may touch the state. A superseded one normally rejects as `aborted`, but an
  // abort that comes after the response has arrived stops nothing, so the outcome is checked, not its kind.
  async function load(): Promise<void> {
    const request = ++latestRequest
    inFlight.value = true
    let answer: PageTaskRead
    try {
      answer = await requestList(query.value)
    } catch (failure) {
      if (request !== latestRequest) return
      // The generated client rejects with nothing but an ApiError.
      error.value = (failure as ApiError).kind
      inFlight.value = false
      return
    }
    if (request !== latestRequest) return
    if (answer.items.length === 0 && answer.total > 0 && view.page > answer.pages) {
      // The list got shorter than the address says (tasks deleted, a bigger page size, an old link).
      // The page change makes the watcher ask again; until then this still counts as loading.
      view.page = answer.pages
      return
    }
    items.value = answer.items
    total.value = answer.total
    pages.value = answer.pages
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
    // Synchronous, so the page is already 1 when the query watcher below runs: one request, not two.
    watch(
      () => settings.pageSize,
      () => {
        view.page = FIRST_PAGE
      },
      { flush: 'sync' },
    )
    // Runs once per tick, however many fields of the view changed in it.
    watch(queryKey, () => void load())
    void load()
  }

  return { items, total, pages, status, error, start, retry }
})
