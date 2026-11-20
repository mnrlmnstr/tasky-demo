import type { TaskRead } from '../api/generated/client'

/*
 * The custom order (`ordering=position`): lower positions come first. A moved task takes a position
 * between its new neighbours, so no other task has to change.
 */

type Positioned = Pick<TaskRead, 'position'>

/** Between two neighbours, either of which may be missing (the top, the bottom, an empty list). */
export function positionBetween(before: Positioned | undefined, after: Positioned | undefined): number {
  if (before !== undefined && after !== undefined) return (before.position + after.position) / 2
  if (after !== undefined) return after.position - 1
  if (before !== undefined) return before.position + 1
  return 0
}

/** As the API sorts them: by position, ties newest first, then by id. */
export function inCustomOrder<T extends TaskRead>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      a.position - b.position ||
      Date.parse(b.created_at) - Date.parse(a.created_at) ||
      a.id.localeCompare(b.id),
  )
}

/**
 * The position `task` gets when put at `index` of `items`, counted without the task itself, or `null`
 * when that is where it already is.
 */
export function placeAt(items: readonly TaskRead[], task: TaskRead, index: number): number | null {
  if (items.findIndex((item) => item.id === task.id) === index) return null
  const others = items.filter((item) => item.id !== task.id)
  return positionBetween(others[index - 1], others[index])
}

/** Where `task` lands when moved `delta` places in `items`, or `null` when that is past an end. */
export function indexAfterMove(items: readonly TaskRead[], task: TaskRead, delta: number): number | null {
  const from = items.findIndex((item) => item.id === task.id)
  const to = from + delta
  return from === -1 || to < 0 || to >= items.length ? null : to
}
