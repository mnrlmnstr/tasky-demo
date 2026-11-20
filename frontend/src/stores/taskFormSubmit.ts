import { ref } from 'vue'

import { createTask, updateTask, type TaskCreate, type TaskRead, type TaskUpdate } from '../api/generated/client'
import { ApiError, failureKind, type ApiErrorKind, type FieldError } from '../api/http'
import { useTaskFormStore } from './taskForm'
import { tasksChanged } from './taskChanges'
import { offerUndoOfCreate, offerUndoOfEdit } from './undoActions'

/** What the task form sends, as the API takes it: every field the form shows, an empty one as `null`. */
export type TaskFormPayload = Required<Omit<TaskUpdate, 'position'>>

/** Why a save did not go through, for the form to show. */
export interface TaskFormFailure {
  /** The API's `422` answer, field by field: the form places each message. */
  fieldErrors: readonly FieldError[]
  /** What went wrong, when the answer is about no field. */
  kind: ApiErrorKind | null
  /** The edited task turned out to be deleted: there is nothing left to save. */
  gone: boolean
}

// Only what differs from what the form would send if nothing was touched.
function changedFields(payload: TaskFormPayload, untouched: TaskFormPayload): TaskUpdate {
  const fields = Object.keys(payload) as (keyof TaskFormPayload)[]
  return Object.fromEntries(fields.filter((field) => payload[field] !== untouched[field]).map((field) => [field, payload[field]]))
}

// A new task leaves out what was left empty; the API fills in the rest.
function filledFields(payload: TaskFormPayload): TaskCreate {
  const { description, deadline, ...required } = payload
  return {
    ...required,
    ...(description === null ? {} : { description }),
    ...(deadline === null ? {} : { deadline }),
  }
}

function failureOf(reason: unknown, before: TaskRead | null): TaskFormFailure {
  const editing = before !== null
  const kind = failureKind(reason)
  const fieldErrors = reason instanceof ApiError ? reason.fieldErrors : []
  const gone = kind === 'not_found' && editing
  if (gone) tasksChanged({ deleted: before.id })
  // Creating has no task to be missing: a 404 there is the server's fault.
  const shown = kind === 'not_found' && !editing ? 'server' : kind
  return { fieldErrors, kind: fieldErrors.length === 0 ? shown : null, gone }
}

/**
 * Saving the task form that is open (`useTaskFormStore`): a new task is created, an edit sends only the
 * fields that changed. Once saved the form closes, the tasks are reloaded and the undo is offered.
 */
export function useTaskFormSubmit() {
  const form = useTaskFormStore()
  /** A save is on its way to the server. */
  const saving = ref(false)

  /**
   * `untouched` is what the form would send if nothing was touched. Resolves to `null` once saved, or
   * when an edit changed nothing; to the failure otherwise, and the form stays open.
   */
  async function save(payload: TaskFormPayload, untouched: TaskFormPayload): Promise<TaskFormFailure | null> {
    const before = form.task
    const changes = changedFields(payload, untouched)
    if (before !== null && Object.keys(changes).length === 0) {
      form.close()
      return null
    }

    saving.value = true
    let saved: TaskRead
    try {
      saved = before === null ? await createTask(filledFields(payload)) : await updateTask(before.id, changes)
    } catch (reason) {
      saving.value = false
      return failureOf(reason, before)
    }
    saving.value = false
    form.close()
    tasksChanged()
    if (before === null) offerUndoOfCreate(saved)
    else offerUndoOfEdit(before, saved)
    return null
  }

  return { saving, save }
}
