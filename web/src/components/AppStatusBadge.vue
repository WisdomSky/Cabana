<template>
  <Badge :variant="variant">
    <span class="size-1.5 rounded-full" :class="dot" />
    {{ label }}
  </Badge>
</template>

<script setup>
import { computed } from 'vue';
import Badge from './ui/badge/Badge.vue';

const props = defineProps({ status: { type: String, default: 'missing' }, health: { type: String, default: null } });

const label = computed(() => {
  if (props.status === 'running' && props.health && !['none', 'healthy'].includes(props.health)) {
    return props.health;
  }
  return props.status;
});
const variant = computed(() => {
  if (props.status === 'running') return props.health === 'unhealthy' ? 'destructive' : props.health === 'starting' ? 'warning' : 'success';
  if (props.status === 'stopped') return 'secondary';
  if (props.status === 'error') return 'destructive';
  return 'warning';
});
const dot = computed(() => {
  if (props.status === 'running') return props.health === 'unhealthy' ? 'bg-red-300' : props.health === 'starting' ? 'bg-amber-300' : 'bg-emerald-300';
  if (props.status === 'stopped') return 'bg-slate-400';
  if (props.status === 'error') return 'bg-red-300';
  return 'bg-amber-300';
});
</script>
