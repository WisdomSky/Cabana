<template>
  <RouterView />
  <ToastHost />
</template>

<script setup>
import { RouterView } from 'vue-router';
import ToastHost from './components/ToastHost.vue';
</script>
