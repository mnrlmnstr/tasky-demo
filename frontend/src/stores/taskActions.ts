import { computed, ref, watch } from 'vue'

import { deleteTask, updateTask, type TaskPriority, type TaskRead, type TaskStatus } from '../api/generated/client'
import { failureKind } from '../api/http'
import { tasksChanged } from './taskChanges'
import { useUndoStore } from './undo'
import { offerUndoOfPriorityChange, offerUndoOfStatusChange } from './undoActions'

/*
 * What a task's row, card or table row can do with it. A change ends with the tasks-changed signal,
 * which the list and the board both follow.
 */

/** Deleting, behind a confirmation. Not undoable, which is why it is confirmed first. */
export function useTaskDelete(task: () => TaskRead, isBusyElsewhere: () => boolean) {
  const undo = useUndoStore()

  const isConfirmingDelete = ref(false)
  const isDeleting = ref(false)

  function askToDelete(): void {
    if (!isDeleting.value && !isBusyElsewhere()) isConfirmingDelete.value = true
  }

  // The task stays dimmed until the server has deleted it, then leaves the list at once; the reload
  // that follows fills the page up again.
  async function deleteConfirmed(): Promise<void> {
    isDeleting.value = true
    try {
      await deleteTask(task().id)
    } catch (failure) {
      const kind = failureKind(failure)
      // Deleted by someone else in the meantime: that is the outcome the user asked for.
      if (kind !== 'not_found') {
        isDeleting.value = false
        undo.notifyError(kind)
        return
      }
    }
    tasksChanged({ deleted: task().id })
  }

  return { isConfirmingDelete, isDeleting, askToDelete, deleteConfirmed }
}

/** A status picked from the menu: shown at once, ahead of the list, whose next answer takes over. */
export function useStatusChange(task: () => TaskRead) {
  const undo = useUndoStore()

  const pickedStatus = ref<TaskStatus | null>(null)
  const isChangingStatus = ref(false)

  const status = computed(() => pickedStatus.value ?? task().status)

  // A new answer of the list knows better than the pick, unless the pick is still on its way to the server.
  watch(task, () => {
    if (!isChangingStatus.value) pickedStatus.value = null
  })

  async function changeStatus(next: TaskStatus): Promise<void> {
    if (next === status.value) return
    // As it was shown, which is not the list's copy when the reload after an earlier change failed.
    const before: TaskRead = { ...task(), status: status.value }
    pickedStatus.value = next
    isChangingStatus.value = true
    try {
      const after = await updateTask(before.id, { status: next })
      // The task may no longer match the filter, or sort elsewhere.
      tasksChanged()
      offerUndoOfStatusChange(before, after)
    } catch (failure) {
      pickedStatus.value = before.status
      const kind = failureKind(failure)
      // The task is gone, so it should go from the list too.
      if (kind === 'not_found') tasksChanged({ deleted: before.id })
      undo.notifyError(kind)
    } finally {
      isChangingStatus.value = false
    }
  }

  return { pickedStatus, isChangingStatus, status, changeStatus }
}

/**
 * A priority picked from the menu: shown at once, ahead of the list or the board, whose next answer takes
 * over. Its menu offers nothing while the task has a request on its way, so one is sent at a time.
 */
export function usePriorityChange(task: () => TaskRead) {
  const undo = useUndoStore()

  const pickedPriority = ref<TaskPriority | null>(null)
  const isChangingPriority = ref(false)

  const priority = computed(() => pickedPriority.value ?? task().priority)

  watch(task, () => {
    if (!isChangingPriority.value) pickedPriority.value = null
  })

  async function changePriority(next: TaskPriority): Promise<void> {
    if (next === priority.value) return
    const id = task().id
    const previous = priority.value
    pickedPriority.value = next
    isChangingPriority.value = true
    try {
      const after = await updateTask(id, { priority: next })
      // A new priority can sort the task elsewhere.
      tasksChanged()
      // Only the priority is put back, also when the copy shown had other fields out of date.
      offerUndoOfPriorityChange({ ...after, priority: previous }, after)
    } catch (failure) {
      pickedPriority.value = previous
      const kind = failureKind(failure)
      if (kind === 'not_found') tasksChanged({ deleted: id })
      undo.notifyError(kind)
    } finally {
      isChangingPriority.value = false
    }
  }

  return { pickedPriority, isChangingPriority, priority, changePriority }
}
