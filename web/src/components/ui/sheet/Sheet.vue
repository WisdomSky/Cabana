<script setup>
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Menu' },
});
const emit = defineEmits(['close']);
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => { if (!value) emit('close'); }">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm lg:hidden" />
      <DialogContent
        class="fixed inset-y-0 left-0 z-50 flex w-[min(19rem,88vw)] flex-col border-r border-white/10 bg-cabana-950/95 text-foreground shadow-2xl backdrop-blur-2xl focus:outline-none lg:hidden"
      >
        <DialogTitle class="sr-only">{{ title }}</DialogTitle>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
