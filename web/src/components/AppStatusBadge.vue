<template>
  <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold capitalize" :class="classes">
    <span class="size-1.5 rounded-full" :class="dot" />
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ status: { type: String, default: 'missing' }, health: { type: String, default: null } });

const label = computed(() => {
  if (props.status === 'running' && props.health && !['none', 'healthy'].includes(props.health)) {
    return props.health;
  }
  return props.status;
});
const classes = computed(() => {
  if (props.status === 'running') return 'bg-cabana-100 text-cabana-700';
  if (props.status === 'stopped') return 'bg-sand-100 text-muted';
  if (props.status === 'error') return 'bg-coral-100 text-coral-500';
  return 'bg-yellow-50 text-yellow-700';
});
const dot = computed(() => {
  if (props.status === 'running') return props.health === 'unhealthy' ? 'bg-coral-500' : 'bg-cabana-500';
  if (props.status === 'stopped') return 'bg-sand-300';
  if (props.status === 'error') return 'bg-coral-500';
  return 'bg-yellow-500';
});
</script>
