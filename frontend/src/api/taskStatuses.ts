import type { TaskStatus } from './generated/client'

// One entry per status, so a status the API adds does not compile until it has its place in the order.
const POSITION: Record<TaskStatus, number> = { todo: 0, in_progress: 1, done: 2 }

/**
 * Every status, in the order a task goes through them: the order of the form's choices, the status
 * filter, the status menus and the board's columns.
 */
export const TASK_STATUSES = (Object.keys(POSITION) as TaskStatus[]).sort((a, b) => POSITION[a] - POSITION[b])
