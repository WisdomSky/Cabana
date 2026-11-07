<template>
  <div class="card p-4 sm:p-5" :data-testid="testid">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-muted">{{ label }}</p>
        <p class="mt-1.5 text-2xl font-bold tracking-tight">{{ value }}</p>
      </div>
      <div class="grid size-9 place-items-center rounded-xl" :class="iconBg">
        <component :is="icon" class="size-[18px]" :class="iconColor" />
      </div>
    </div>
    <div v-if="percent !== null && percent !== undefined" class="mt-3">
      <div class="h-1.5 overflow-hidden rounded-full bg-sand-100">
        <div class="h-full rounded-full transition-all duration-500" :class="barColor" :style="{ width: `${Math.min(100, Math.max(0, percent))}%` }" />
      </div>
    </div>
    <p class="mt-2 text-xs text-muted">{{ hint }}</p>
  </div>
</template>

<script setup>
const props = defineProps({
  label: String,
  value: String,
  hint: String,
  percent: { type: Number, default: null },
  icon: Object,
  tone: { type: String, default: 'teal' },
  testid: String,
});
const iconBg = { teal: 'bg-cabana-100', coral: 'bg-coral-100', sand: 'bg-sand-100', blue: 'bg-sky-50' }[props.tone];
const iconColor = { teal: 'text-cabana-600', coral: 'text-coral-500', sand: 'text-amber-700', blue: 'text-sky-600' }[props.tone];
const barColor = { teal: 'bg-cabana-500', coral: 'bg-coral-500', sand: 'bg-amber-500', blue: 'bg-sky-500' }[props.tone];
</script>
