<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end">
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-1 opacity-0"
    >
      <div
        v-for="item in toasts"
        :key="item.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl shadow-black/30 backdrop-blur-xl"
        :class="item.type === 'error' ? 'border-destructive/30 bg-popover/95 text-foreground' : 'border-primary/30 bg-popover/95 text-foreground'"
        data-testid="toast"
        role="status"
      >
        <AlertTriangle v-if="item.type === 'error'" class="mt-0.5 size-4 shrink-0 text-destructive" />
        <CheckCircle2 v-else class="mt-0.5 size-4 shrink-0 text-emerald-300" />
        <p class="flex-1 leading-snug">{{ item.message }}</p>
        <button class="cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Dismiss notification" @click="dismiss(item.id)">
          <X class="size-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { CheckCircle2, AlertTriangle, X } from 'lucide-vue-next';
import { dismiss, toasts } from '../lib/toast.js';
</script>
