import { createEventHook } from '@vueuse/core'

import type { TaskRead } from '../api/generated/client'

/**
 * The one signal that the tasks on the server have changed: every create, edit, delete, status change,
 * drag and undo sends it once, and whatever shows tasks (the list, the board) follows it.
 */
export interface TasksChange {
  /** A task the server no longer has: shown gone at once, also when the reload that follows fails. */
  deleted?: TaskRead['id']
}

const changed = createEventHook<TasksChange>()

/** Follows the changes; inside a store or component the listener goes away with it. */
export const onTasksChanged = changed.on

export function tasksChanged(change: TasksChange = {}): void {
  void changed.trigger(change)
}
