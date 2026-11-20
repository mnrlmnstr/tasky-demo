import { deleteTask, updateTask, type TaskRead, type TaskUpdate } from '../api/generated/client'
import { tasksChanged } from './taskChanges'
import { useUndoStore, type UndoLabel } from './undo'

/*
 * One call after a successful create, edit, status or priority change offers its undo in the toast.
 * Delete is not undoable: it is guarded by a confirmation instead.
 */

const EDITABLE_FIELDS = ['title', 'description', 'status', 'priority', 'deadline'] as const satisfies readonly (keyof TaskUpdate)[]

// Whether the undo went through or not, the tasks are reloaded, so they show what the server has.
function offer(label: UndoLabel, reverse: () => Promise<unknown>): void {
  useUndoStore().offer({
    label,
    undo: async () => {
      try {
        await reverse()
      } finally {
        tasksChanged()
      }
    },
  })
}

// Only the fields the action changed, with the values they had before it; `null` puts back an empty one.
function previousValues(before: TaskRead, after: TaskRead): TaskUpdate {
  const changed = EDITABLE_FIELDS.filter((field) => before[field] !== after[field])
  return Object.fromEntries(changed.map((field) => [field, before[field]]))
}

function offerUndoOfUpdate(label: UndoLabel, before: TaskRead, after: TaskRead): void {
  const previous = previousValues(before, after)
  if (Object.keys(previous).length === 0) return
  offer(label, () => updateTask(before.id, previous))
}

/** After `createTask` answered: Undo deletes the task again, without a confirmation. */
export function offerUndoOfCreate(created: Pick<TaskRead, 'id'>): void {
  offer('created', () => deleteTask(created.id))
}

/** After `updateTask` answered an edit: `before` is the task as it was, `after` is the answer. */
export function offerUndoOfEdit(before: TaskRead, after: TaskRead): void {
  offerUndoOfUpdate('updated', before, after)
}

/** After `updateTask` answered a status change: `before` is the task as it was, `after` is the answer. */
export function offerUndoOfStatusChange(before: TaskRead, after: TaskRead): void {
  offerUndoOfUpdate('statusChanged', before, after)
}

/** After `updateTask` answered a priority change: `before` is the task as it was, `after` is the answer. */
export function offerUndoOfPriorityChange(before: TaskRead, after: TaskRead): void {
  offerUndoOfUpdate('priorityChanged', before, after)
}
