import type { TaskPriority } from './generated/client'

// One entry per priority, so a priority the API adds does not compile until it has its place in the order.
const POSITION: Record<TaskPriority, number> = { low: 0, medium: 1, high: 2 }

/** Every priority, from the lowest to the highest: the order of the form's choices and the priority menus. */
export const TASK_PRIORITIES = (Object.keys(POSITION) as TaskPriority[]).sort((a, b) => POSITION[a] - POSITION[b])
