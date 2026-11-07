<script setup>
import { computed } from 'vue';

const props = defineProps({
  value: { type: Number, default: 0 },
  label: { type: String, required: true },
  detail: { type: String, default: '' },
  tone: { type: String, default: 'primary' },
  testid: { type: String, default: '' },
});
const circumference = 2 * Math.PI * 38;
const dash = computed(() => `${(Math.min(100, Math.max(0, props.value)) / 100) * circumference} ${circumference}`);
const stroke = computed(() => ({ primary: 'var(--primary)', success: 'var(--chart-2)', warning: 'var(--chart-3)' })[props.tone] || 'var(--primary)');
</script>

<template>
  <div class="flex flex-col items-center gap-2" :data-testid="testid">
    <div class="relative size-[92px]">
      <svg class="size-full -rotate-90" viewBox="0 0 92 92" aria-hidden="true">
        <circle cx="46" cy="46" r="38" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" />
        <circle
          cx="46"
          cy="46"
          r="38"
          fill="none"
          :stroke="stroke"
          stroke-width="8"
          stroke-linecap="round"
          :stroke-dasharray="dash"
          class="transition-all duration-700"
        />
      </svg>
      <div class="absolute inset-0 grid place-items-center">
        <span class="text-xl font-light tracking-tight">{{ Math.round(value) }}%</span>
      </div>
    </div>
    <div class="text-center">
      <p class="text-xs font-semibold uppercase tracking-wider text-slate-300">{{ label }}</p>
      <p class="mt-0.5 text-[11px] text-muted-foreground">{{ detail }}</p>
    </div>
  </div>
</template>
