import { computed, inject, onBeforeUnmount, onUnmounted, ref, watch, type Ref } from 'vue'

import { deleteTask, updateTask, type TaskRead, type TaskStatus } from '../../api/generated/client'
import { failureKind } from '../../api/http'
import { tasksChanged } from '../../stores/taskChanges'
import { useUndoStore } from '../../stores/undo'
import { offerUndoOfStatusChange } from '../../stores/undoActions'
import { FOCUS_TASK_LIST } from './listFocus'

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

// Whether the focus is nowhere, or in a menu or dialog: one of this element's own, when it was just acted on.
function isFocusAdrift(): boolean {
  const focused = document.activeElement as Element
  return focused === document.body || focused.closest('[role="menu"], [role="alertdialog"]') !== null
}

/**
 * Hands the focus to the region around the tasks when this element goes away while it holds it, which
 * would otherwise drop it to the top of the page. The focus may also still be in the element's closing
 * menu or dialog, which hands it back to a trigger that is gone by then, or that is fading out with it.
 */
export function useFocusOnLeave(element: Readonly<Ref<HTMLElement | null>>, wasActedOn: () => boolean): void {
  const focusList = inject(FOCUS_TASK_LIST, null)
  let leavesWithFocus = false

  onBeforeUnmount(() => {
    const root = element.value as HTMLElement
    leavesWithFocus = root.contains(document.activeElement) || (wasActedOn() && isFocusAdrift())
    if (focusList !== null) root.addEventListener('focusin', focusList)
  })

  // Only now: an overlay that is still open traps the focus until it is taken down with the element.
  onUnmounted(() => {
    if (leavesWithFocus) focusList?.()
  })
}
