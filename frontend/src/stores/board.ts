import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowReactive, watch } from 'vue'

import { listTasks, updateTask, type ListTasksParams, type TaskRead, type TaskStatus } from '../api/generated/client'
import { TASK_STATUSES } from '../api/taskStatuses'
import { failureKind, type ApiErrorKind } from '../api/http'
import { latestOnly } from '../api/latestOnly'
import { FIRST_PAGE, useListViewStore } from './listView'
import { onTasksChanged, tasksChanged } from './taskChanges'
import { useUndoStore } from './undo'
import { offerUndoOfStatusChange } from './undoActions'

/** The most a column shows: the API's largest page. A longer column says how many it leaves out. */
export const BOARD_PAGE_SIZE = 100


// Like the list: `loading` has nothing to show yet, `reloading` keeps the cards of the last answer.
export type ColumnStatus = 'loading' | 'reloading' | 'ready' | 'failed'

export interface BoardColumn {
  items: TaskRead[]
  total: number
  status: ColumnStatus
  /** Stays through a retry and is cleared by the next answer. */
  error: ApiErrorKind | null
}

interface ColumnState {
  items: TaskRead[]
  total: number
  answered: boolean
  inFlight: boolean
  error: ApiErrorKind | null
  latestRequest: number
}

/** A card dropped on another column, shown there until the server's answers have caught up with it. */
interface Move {
  task: TaskRead
  to: TaskStatus
}

function columnStatus(column: ColumnState): ColumnStatus {
  if (column.inFlight) return column.answered ? 'reloading' : 'loading'
  if (column.error !== null) return 'failed'
  return column.answered ? 'ready' : 'loading'
}

/**
 * The board: one list per status, each loaded on its own with the search and ordering of the view, but
 * never its status filter or page. While started it follows the view and the tasks-changed signal.
 */
export const useBoardStore = defineStore('board', () => {
  const view = useListViewStore()

  const state = reactive(
    Object.fromEntries(
      TASK_STATUSES.map((status): [TaskStatus, ColumnState] => [
        status,
        { items: [], total: 0, answered: false, inFlight: false, error: null, latestRequest: 0 },
      ]),
    ) as Record<TaskStatus, ColumnState>,
  )
  const requests = Object.fromEntries(
    TASK_STATUSES.map((status) => [
      status,
      latestOnly((signal, params: ListTasksParams) => listTasks(params, { signal })),
    ]),
  ) as Record<TaskStatus, (params: ListTasksParams) => ReturnType<typeof listTasks>>

  const moves = shallowReactive(new Map<string, Move>())
  const started = ref(false)

  // Everything the view asks the list for, except what the columns decide themselves.
  const sharedQuery = computed(() => {
    const { status: _status, page: _page, ...query } = view.queryParams
    return query
  })
  const sharedQueryKey = computed(() => JSON.stringify(sharedQuery.value))

  // Only the latest request of a column may touch it; a superseded one is ignored whatever its outcome.
  async function load(status: TaskStatus): Promise<void> {
    const column = state[status]
    const request = ++column.latestRequest
    column.inFlight = true
    try {
      const answer = await requests[status]({
        ...sharedQuery.value,
        status,
        page: FIRST_PAGE,
        page_size: BOARD_PAGE_SIZE,
      })
      if (request !== column.latestRequest) return
      column.items = answer.items
      column.total = answer.total
      column.answered = true
      column.error = null
    } catch (failure) {
      if (request !== column.latestRequest) return
      column.error = failureKind(failure)
    }
    column.inFlight = false
  }

  function reloadAll(): Promise<unknown> {
    return Promise.all(TASK_STATUSES.map(load))
  }

  function start(): void {
    if (started.value) return
    started.value = true
    void reloadAll()
  }

  function stop(): void {
    started.value = false
  }

  function retry(status: TaskStatus): void {
    void load(status)
  }

  watch(sharedQueryKey, () => {
    if (started.value) void reloadAll()
  })

  function removeEverywhere(id: TaskRead['id']): void {
    for (const status of TASK_STATUSES) {
      const column = state[status]
      const kept = column.items.filter((item) => item.id !== id)
      column.total -= column.items.length - kept.length
      column.items = kept
    }
  }

  // The card leaves every column at once, also when the reload that follows fails.
  function forget(id: TaskRead['id']): void {
    removeEverywhere(id)
    moves.delete(id)
  }

  // What the server answered to a move, put in place before the columns are asked again: the move is
  // then shown by the board's own state, whichever reload answers last, and also when none does.
  function settle(after: TaskRead): void {
    removeEverywhere(after.id)
    const column = state[after.status]
    column.items = [after, ...column.items]
    column.total += 1
  }

  onTasksChanged(({ deleted }) => {
    if (deleted !== undefined) forget(deleted)
    if (started.value) void reloadAll()
  })

  // What the server last said, with the cards still on their way to another column moved there already.
  const columns = computed(
    () =>
      Object.fromEntries(
        TASK_STATUSES.map((status) => {
          const column = state[status]
          const kept = column.items.filter((item) => (moves.get(item.id)?.to ?? status) === status)
          const listed = new Set(column.items.map((item) => item.id))
          const arrived = [...moves.values()]
            .filter((move) => move.to === status && !listed.has(move.task.id))
            .map((move) => ({ ...move.task, status }))
          const shown: BoardColumn = {
            items: [...arrived, ...kept],
            total: column.total - (column.items.length - kept.length) + arrived.length,
            status: columnStatus(column),
            error: column.error,
          }
          return [status, shown]
        }),
      ) as Record<TaskStatus, BoardColumn>,
  )

  function isMoving(id: string): boolean {
    return moves.has(id)
  }

  /** Moves the card at once, then sends the change; a failure puts it back and says why in the toast. */
  async function move(task: TaskRead, to: TaskStatus): Promise<void> {
    const from = task.status
    if (to === from || moves.has(task.id)) return
    moves.set(task.id, { task, to })
    try {
      const after = await updateTask(task.id, { status: to })
      settle(after)
      offerUndoOfStatusChange(task, after)
      tasksChanged()
    } catch (failure) {
      const kind = failureKind(failure)
      // The task is gone, so the card should go too.
      if (kind === 'not_found') tasksChanged({ deleted: task.id })
      useUndoStore().notifyError(kind)
    } finally {
      moves.delete(task.id)
    }
  }

  return { columns, start, stop, retry, move, isMoving }
})
