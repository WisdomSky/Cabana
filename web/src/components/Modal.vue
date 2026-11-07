<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center bg-cabana-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" @click.self="close">
        <div
          class="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-sand-200 bg-sand-50 shadow-2xl sm:max-w-2xl sm:rounded-2xl"
          role="dialog"
          aria-modal="true"
        >
          <div class="flex items-start justify-between gap-4 border-b border-sand-200 bg-white px-5 py-4">
            <div>
              <h2 class="text-lg font-bold tracking-tight">{{ title }}</h2>
              <p v-if="subtitle" class="mt-0.5 text-sm text-muted">{{ subtitle }}</p>
            </div>
            <button class="rounded-lg p-1.5 text-muted hover:bg-sand-100 hover:text-ink" aria-label="Close dialog" @click="close">
              <X class="size-5" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <slot />
          </div>
          <div v-if="$slots.footer" class="flex flex-wrap justify-end gap-2 border-t border-sand-200 bg-white px-5 py-3">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
});
const emit = defineEmits(['close']);

function close() {
  emit('close');
}

function onKeydown(event) {
  if (event.key === 'Escape' && props.open) close();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>
