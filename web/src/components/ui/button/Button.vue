<script setup>
import { computed, useAttrs } from 'vue';
import { Primitive } from 'reka-ui';
import { cva } from 'class-variance-authority';
import { cn } from '../../../lib/utils.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  variant: { type: String, default: 'default' },
  size: { type: String, default: 'default' },
  as: { type: [String, Object], default: 'button' },
  asChild: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
});

const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...value } = attrs;
  return value;
});

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90',
        secondary: 'border border-white/10 bg-white/8 text-foreground shadow-sm hover:bg-white/14',
        outline: 'border border-white/15 bg-transparent text-foreground hover:bg-white/8',
        ghost: 'text-muted-foreground hover:bg-white/8 hover:text-foreground',
        destructive: 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/15 hover:bg-destructive/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-xl px-6',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const classes = computed(() => cn(buttonVariants({ variant: props.variant, size: props.size }), attrs.class));
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :type="as === 'button' ? type : undefined"
    :class="classes"
    v-bind="rest"
  >
    <slot />
  </Primitive>
</template>
