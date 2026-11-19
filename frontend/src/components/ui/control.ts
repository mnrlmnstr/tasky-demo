/*
 * Classes shared by the pressable controls (Button, IconButton, SegmentedControl) so their
 * focus and disabled states cannot drift apart.
 */
export const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export const CONTROL_CLASS = `inline-flex cursor-pointer items-center justify-center transition-colors ${FOCUS_RING_CLASS} disabled:cursor-not-allowed disabled:opacity-50`
