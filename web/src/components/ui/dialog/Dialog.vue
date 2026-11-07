<script setup>
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { X } from 'lucide-vue-next';

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
});
const emit = defineEmits(['close']);
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => { if (!value) emit('close'); }">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/12 bg-popover/95 text-foreground shadow-2xl shadow-black/50 backdrop-blur-2xl focus:outline-none sm:w-full sm:max-w-2xl"
      >
        <div class="flex items-start justify-between gap-4 border-b border-white/10 bg-white/4 px-5 py-4">
          <div>
            <DialogTitle class="text-lg font-bold tracking-tight">{{ title }}</DialogTitle>
            <DialogDescription :class="subtitle ? 'mt-0.5 text-sm text-muted-foreground' : 'sr-only'">
              {{ subtitle || title }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <button
              class="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
              aria-label="Close dialog"
            >
              <X class="size-5" />
            </button>
          </DialogClose>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex flex-wrap justify-end gap-2 border-t border-white/10 bg-white/4 px-5 py-3">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
