<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { errorMessageKey } from '../../i18n/errorMessages'
import { useUndoStore } from '../../stores/undo'
import Button from '../ui/Button.vue'
import IconButton from '../ui/IconButton.vue'

const { t } = useI18n()
const undo = useUndoStore()

const closeButton = useTemplateRef('closeButton')

// What the toast says: the action that can be undone, why undoing it failed, or why another action
// failed. Empty = no toast.
const message = computed(() => {
  if (undo.notice !== null) return t(errorMessageKey(undo.notice))
  if (undo.error !== null) return t('undo.failed', { reason: t(errorMessageKey(undo.error)) })
  return undo.label === null ? '' : t(`undo.labels.${undo.label}`)
})

const isFailure = computed(() => undo.error !== null || undo.notice !== null)

// The window does not run out under the pointer or while the keyboard is on the toast.
const hovered = ref(false)
const focused = ref(false)
// Where the focus was before it entered the toast: it goes back there when the toast goes away.
let focusOrigin: HTMLElement | null = null

watch(
  () => hovered.value || focused.value,
  (held) => {
    if (held) undo.pause()
    else undo.resume()
  },
  { flush: 'sync' },
)

function onFocusIn(event: FocusEvent): void {
  if (!focused.value) focusOrigin = event.relatedTarget as HTMLElement | null
  focused.value = true
}

function onFocusOut(event: FocusEvent): void {
  const toast = event.currentTarget as HTMLElement
  if (!toast.contains(event.relatedTarget as Node | null)) focused.value = false
}

// A toast taken away under the pointer or the focus gets no leave event, so the hold is dropped here.
watch(message, (text) => {
  if (text !== '') return
  if (focused.value) focusOrigin?.focus()
  focusOrigin = null
  hovered.value = false
  focused.value = false
})

// The Undo button is gone after a failure: a keyboard user is put on the button that is left.
watch(isFailure, async (failed) => {
  if (!failed || !focused.value) return
  await nextTick()
  closeButton.value?.$el.focus()
})
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-30 mx-auto flex max-w-[760px] justify-center px-4">
    <!-- Always in the page, with only its text changing: a region inserted already filled is not announced. -->
    <p role="status" aria-live="polite" class="sr-only">{{ message }}</p>

    <Transition enter-active-class="animate-slide-up">
      <div
        v-if="message !== ''"
        data-testid="undo-toast"
        role="group"
        :aria-label="message"
        class="pointer-events-auto flex max-w-full items-center gap-1 rounded-card border border-border bg-raised py-1.5 pr-1.5 pl-4 shadow-overlay"
        @pointerenter="hovered = true"
        @pointerleave="hovered = false"
        @focusin="onFocusIn"
        @focusout="onFocusOut"
        @keydown.esc="undo.dismiss()"
      >
        <p
          aria-hidden="true"
          class="mr-2 min-w-0 text-sm"
          :class="isFailure ? 'text-danger-text' : 'text-text'"
        >
          {{ message }}
        </p>
        <Button
          v-if="undo.label !== null"
          variant="ghost"
          :busy="undo.running"
          class="h-8! shrink-0 px-2.5! text-accent-text!"
          @click="undo.run()"
        >
          {{ t('undo.action') }}
        </Button>
        <IconButton
          ref="closeButton"
          :label="t('undo.dismiss')"
          :disabled="undo.running"
          class="size-8! shrink-0 [&>svg]:size-4!"
          @click="undo.dismiss()"
        >
          <X aria-hidden="true" />
        </IconButton>
      </div>
    </Transition>
  </div>
</template>
