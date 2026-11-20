<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'

import { CONTROL_CLASS } from './control'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-muted',
  ghost: 'text-text hover:bg-surface-muted',
  danger: 'bg-danger text-danger-contrast hover:bg-danger-hover',
}

const {
  variant = 'secondary',
  type = 'button',
  disabled = false,
  loading = false,
  busy = false,
} = defineProps<{
  variant?: ButtonVariant
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  /** Shows progress and cannot be pressed: natively disabled, so it gives up the keyboard focus. */
  loading?: boolean
  /**
   * Shows progress the same way but stays focusable, for a button the user may press again and again
   * (a retry): its owner ignores the click meanwhile.
   */
  busy?: boolean
}>()
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || busy ? 'true' : undefined"
    :aria-disabled="busy ? 'true' : undefined"
    :data-variant="variant"
    class="h-9 gap-2 rounded-control px-3.5 text-sm font-medium"
    :class="[CONTROL_CLASS, VARIANT_CLASSES[variant]]"
  >
    <LoaderCircle
      v-if="loading || busy"
      data-testid="button-spinner"
      class="size-4 animate-spin"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
