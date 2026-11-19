/*
 * Classes shared by the modal overlays (Dialog, AlertDialog) so the two cannot drift apart.
 * The enter and exit animations are keyed on the `data-state` attribute reka-ui sets.
 */
export const SCRIM_CLASS =
  'fixed inset-0 z-40 bg-scrim data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out'

export const PANEL_CLASS =
  'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-overlay focus:outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out'

export const TITLE_CLASS = 'text-base font-semibold text-text'

export const DESCRIPTION_CLASS = 'text-sm text-text-muted'

export const FOOTER_CLASS = 'flex justify-end gap-2'
