<script setup lang="ts">
import { X } from 'lucide-vue-next'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

import IconButton from './IconButton.vue'
import { DESCRIPTION_CLASS, FOOTER_CLASS, PANEL_CLASS, SCRIM_CLASS, TITLE_CLASS } from './overlay'

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  title: string
  description?: string
  /** Accessible name of the close button. */
  closeLabel: string
}>()
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay data-testid="dialog-overlay" :class="SCRIM_CLASS" />
      <!-- Without a description the dialog must not point at one: reka-ui warns otherwise. -->
      <DialogContent :class="PANEL_CLASS" v-bind="description ? {} : { 'aria-describedby': undefined }">
        <header class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <DialogTitle :class="TITLE_CLASS">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" :class="DESCRIPTION_CLASS">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <IconButton :label="closeLabel" class="-mt-1.5 -mr-1.5 shrink-0">
              <X aria-hidden="true" />
            </IconButton>
          </DialogClose>
        </header>
        <div><slot /></div>
        <footer v-if="$slots.footer" data-testid="dialog-footer" :class="FOOTER_CLASS">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
