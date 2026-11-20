import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import type { TaskRead } from '../api/generated/client'

/**
 * Which task form is on screen, if any. Anything can open it (`openCreate`, `openEdit`);
 * the one `TaskFormDialog` mounted in the app shows it.
 */
export const useTaskFormStore = defineStore('taskForm', () => {
  const open = ref(false)
  /** The task being edited, as it was when the form opened; `null` for a new task. */
  const task = shallowRef<TaskRead | null>(null)

  function show(edited: TaskRead | null): void {
    task.value = edited
    open.value = true
  }

  function openCreate(): void {
    show(null)
  }

  function openEdit(edited: TaskRead): void {
    show(edited)
  }

  function close(): void {
    open.value = false
  }

  return { open, task, openCreate, openEdit, close }
})
