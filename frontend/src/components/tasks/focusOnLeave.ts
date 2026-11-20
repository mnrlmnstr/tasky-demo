import { inject, onBeforeUnmount, onUnmounted, type Ref } from 'vue'

import { FOCUS_TASK_LIST } from './listFocus'

// Whether the focus is nowhere, or in a menu or dialog: one of this element's own, when it was just acted on.
function isFocusAdrift(): boolean {
  const focused = document.activeElement as Element
  return focused === document.body || focused.closest('[role="menu"], [role="alertdialog"]') !== null
}

/**
 * Hands the focus to the region around the tasks when this element goes away while it holds it, which
 * would otherwise drop it to the top of the page. The focus may also still be in the element's closing
 * menu or dialog, which hands it back to a trigger that is gone by then, or that is fading out with it.
 */
export function useFocusOnLeave(element: Readonly<Ref<HTMLElement | null>>, wasActedOn: () => boolean): void {
  const focusList = inject(FOCUS_TASK_LIST, null)
  let leavesWithFocus = false

  onBeforeUnmount(() => {
    const root = element.value as HTMLElement
    leavesWithFocus = root.contains(document.activeElement) || (wasActedOn() && isFocusAdrift())
    if (focusList !== null) root.addEventListener('focusin', focusList)
  })

  // Only now: an overlay that is still open traps the focus until it is taken down with the element.
  onUnmounted(() => {
    if (leavesWithFocus) focusList?.()
  })
}
