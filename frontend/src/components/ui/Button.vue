<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-muted',
  ghost: 'text-text hover:bg-surface-muted',
}

const {
  variant = 'secondary',
  type = 'button',
  disabled = false,
  loading = false,
} = defineProps<{
  variant?: ButtonVariant
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
}>()
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
    :data-variant="variant"
    class="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-control px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
    :class="VARIANT_CLASSES[variant]"
  >
    <LoaderCircle
      v-if="loading"
      data-testid="button-spinner"
      class="size-4 animate-spin"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
