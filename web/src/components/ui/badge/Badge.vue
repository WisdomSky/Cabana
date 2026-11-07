<script setup>
import { computed, useAttrs } from 'vue';
import { cva } from 'class-variance-authority';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });
const props = defineProps({ variant: { type: String, default: 'default' } });
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none transition-colors',
  {
    variants: {
      variant: {
        default: 'border-white/10 bg-white/8 text-foreground',
        secondary: 'border-transparent bg-white/6 text-muted-foreground',
        success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
        warning: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
        destructive: 'border-red-400/20 bg-red-400/10 text-red-300',
        outline: 'border-white/15 text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
const classes = computed(() => cn(badgeVariants({ variant: props.variant }), attrs.class));
</script>

<template>
  <span :class="classes" v-bind="rest"><slot /></span>
</template>
