import { computed, ref, shallowRef, type Ref } from 'vue'

import type { TaskRead } from '../../api/generated/client'
import { placeAt } from '../../stores/taskOrder'
import { dropIndexAt, dropLineAt, otherTaskElements } from './dropIndex'

/**
 * Dragging the rows of a list by their handles: where a row would land, the line that shows it, and
 * the drop. `container` holds the rows, each marked with `data-task-id`, in the order of `items`.
 */
export function useListReorder(
  container: Readonly<Ref<HTMLElement | null>>,
  items: () => readonly TaskRead[],
  place: (task: TaskRead, index: number) => void,
) {
  const dragged = shallowRef<TaskRead | null>(null)
  // Counted without the dragged row; `null` while it would stay where it is.
  const dropIndex = ref<number | null>(null)

  const others = computed(() => items().filter((item) => item.id !== dragged.value?.id))
  const line = computed(() => dropLineAt(others.value, dropIndex.value))

  // The whole row is what is dragged, not only the handle it is held by.
  function start(task: TaskRead, event: DragEvent): void {
    const transfer = event.dataTransfer as DataTransfer
    transfer.setData('text/plain', task.id)
    transfer.effectAllowed = 'move'
    transfer.setDragImage((event.target as Element).closest('li') as Element, 16, 16)
    dragged.value = task
  }

  function end(): void {
    dragged.value = null
    dropIndex.value = null
  }

  function over(event: DragEvent): void {
    const task = dragged.value
    if (task === null) return
    const index = dropIndexAt(otherTaskElements(container.value as HTMLElement, task), event.clientY)
    if (placeAt(items(), task, index) === null) {
      dropIndex.value = null
      return
    }
    event.preventDefault()
    const transfer = event.dataTransfer as DataTransfer
    transfer.dropEffect = 'move'
    dropIndex.value = index
  }

  // Moving onto a row inside the list also leaves the list itself; only a real exit clears the line.
  function leave(event: DragEvent): void {
    const into = event.relatedTarget as Node | null
    if (!(event.currentTarget as HTMLElement).contains(into)) dropIndex.value = null
  }

  function drop(event: DragEvent): void {
    event.preventDefault()
    const task = dragged.value as TaskRead
    const index = dropIndex.value
    end()
    if (index !== null) place(task, index)
  }

  return { line, start, end, over, leave, drop }
}
