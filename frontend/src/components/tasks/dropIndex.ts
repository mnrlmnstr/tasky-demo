import type { TaskRead } from '../../api/generated/client'

/** Where a task dragged over a list would go: before the first of `elements` whose middle is below the pointer. */
export function dropIndexAt(elements: readonly Element[], clientY: number): number {
  return elements.filter((element) => {
    const { top, height } = element.getBoundingClientRect()
    return top + height / 2 < clientY
  }).length
}

/** The elements of the tasks in `container` marked with `data-task-id`, except the one being dragged. */
export function otherTaskElements(container: Element, dragged: TaskRead): Element[] {
  return Array.from(container.querySelectorAll('[data-task-id]')).filter(
    (element) => element.getAttribute('data-task-id') !== dragged.id,
  )
}

/** Which side of which task the line showing where a drop lands goes: before the task at `index`, or after the last. */
export function dropLineAt(
  others: readonly TaskRead[],
  index: number | null,
): { id: string; side: 'before' | 'after' } | null {
  if (index === null || others.length === 0) return null
  return index < others.length ? { id: others[index].id, side: 'before' } : { id: others[others.length - 1].id, side: 'after' }
}
