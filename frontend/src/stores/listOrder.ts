import { defineStore } from 'pinia'
import { computed, shallowReactive, watch } from 'vue'

import { TaskOrdering, updateTask, type TaskRead } from '../api/generated/client'
import { failureKind } from '../api/http'
import { useListViewStore } from './listView'
import { tasksChanged } from './taskChanges'
import { useTasksStore } from './tasks'
import { indexAfterMove, inCustomOrder, placeAt } from './taskOrder'
import { useUndoStore } from './undo'
import { offerUndoOfMove } from './undoActions'

interface Move {
  /** The task as it is shown: at its new position. */
  task: TaskRead
  /** Still on its way to the server. Once through, it is shown until the list's next answer. */
  pending: boolean
}

/**
 * Reordering the rows of the list on screen, in the custom order only: a row moves within its page,
 * at once, and the list's next answer takes over.
 */
export const useListOrderStore = defineStore('listOrder', () => {
  const tasks = useTasksStore()
  const view = useListViewStore()

  const moves = shallowReactive(new Map<string, Move>())

  // A new answer of the list knows where every task is; only a move still in flight knows better.
  watch(
    () => tasks.items,
    () => {
      for (const [id, move] of moves) if (!move.pending) moves.delete(id)
    },
  )

  const isCustomOrder = computed(() => view.ordering === TaskOrdering.position)

  const items = computed(() => {
    const shown = tasks.items.map((item) => moves.get(item.id)?.task ?? item)
    return isCustomOrder.value ? inCustomOrder(shown) : shown
  })

  function isMoving(id: string): boolean {
    return moves.get(id)?.pending === true
  }

  /** At `index` of the page (counted without the row itself), between its new neighbours. */
  async function place(task: TaskRead, index: number): Promise<void> {
    if (!isCustomOrder.value || isMoving(task.id)) return
    const position = placeAt(items.value, task, index)
    if (position === null) return
    moves.set(task.id, { task: { ...task, position }, pending: true })
    try {
      const after = await updateTask(task.id, { position })
      moves.set(task.id, { task: after, pending: false })
      offerUndoOfMove(task, after)
      tasksChanged()
    } catch (failure) {
      moves.delete(task.id)
      const kind = failureKind(failure)
      if (kind === 'not_found') tasksChanged({ deleted: task.id })
      useUndoStore().notifyError(kind)
    }
  }

  function canMoveBy(task: TaskRead, delta: -1 | 1): boolean {
    return isCustomOrder.value && !isMoving(task.id) && indexAfterMove(items.value, task, delta) !== null
  }

  /** One place up or down within the page: the keyboard way of dragging. */
  function moveBy(task: TaskRead, delta: -1 | 1): Promise<void> {
    const index = indexAfterMove(items.value, task, delta)
    return index === null ? Promise.resolve() : place(task, index)
  }

  return { items, isCustomOrder, isMoving, place, canMoveBy, moveBy }
})
