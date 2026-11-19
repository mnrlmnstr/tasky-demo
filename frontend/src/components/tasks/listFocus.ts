import type { InjectionKey } from 'vue'

/**
 * Moves the keyboard focus to the task list region. TaskList provides it for a row that goes away
 * while it holds the focus, which would otherwise fall back to the top of the page.
 */
export const FOCUS_TASK_LIST: InjectionKey<() => void> = Symbol('focus task list')
