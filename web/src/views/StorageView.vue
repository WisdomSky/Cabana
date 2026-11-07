<template>
  <div class="space-y-5">
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-cabana-600">Storage</p>
      <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">What this host has room for</h1>
      <p class="mt-1 text-sm text-muted">Real filesystem figures reported by the host. Cabana does not mount or format anything.</p>
    </div>

    <div v-if="error" class="rounded-xl border border-coral-500/30 bg-coral-100 px-4 py-3 text-sm text-coral-500">{{ error }}</div>
    <div v-if="!data" class="grid gap-4 lg:grid-cols-2">
      <div v-for="i in 2" :key="i" class="card h-40 animate-pulse bg-white/60" />
    </div>

    <template v-else>
      <div class="grid gap-4 lg:grid-cols-2">
        <div
          v-for="fs in data.filesystems"
          :key="fs.mountpoint"
          class="card p-5"
          data-testid="storage-filesystem"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-bold">{{ fs.mountpoint }}</p>
              <p class="truncate text-xs text-muted">{{ fs.device || 'device' }} · {{ fs.fstype }}</p>
            </div>
            <span class="chip shrink-0">{{ fs.percent }}% used</span>
          </div>
          <div class="mt-4 h-2 overflow-hidden rounded-full bg-sand-100">
            <div
              class="h-full rounded-full"
              :class="fs.percent > 90 ? 'bg-coral-500' : fs.percent > 75 ? 'bg-amber-500' : 'bg-cabana-500'"
              :style="{ width: `${Math.min(100, fs.percent)}%` }"
            />
          </div>
          <div class="mt-2 flex justify-between text-xs text-muted">
            <span>{{ formatBytes(fs.used) }} used</span>
            <span>{{ formatBytes(fs.available) }} free of {{ formatBytes(fs.total) }}</span>
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="card p-5">
          <h2 class="font-bold tracking-tight">File manager roots</h2>
          <p class="text-xs text-muted">Only these folders are browsable in Cabana.</p>
          <ul class="mt-4 space-y-3">
            <li v-for="root in data.roots" :key="root.path" class="rounded-xl bg-sand-50 p-3 ring-1 ring-sand-200" data-testid="storage-root">
              <div class="flex items-center justify-between gap-2">
                <code class="truncate font-mono text-xs font-semibold">{{ root.path }}</code>
                <span v-if="root.stats" class="text-xs text-muted">{{ root.stats.percent }}% used</span>
              </div>
              <div v-if="root.stats" class="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-100">
                <div class="h-full rounded-full bg-cabana-500" :style="{ width: `${Math.min(100, root.stats.percent)}%` }" />
              </div>
              <p class="mt-1.5 text-[11px] text-muted">
                {{ root.entries ?? 0 }} entries
                <span v-if="root.stats"> · {{ formatBytes(root.stats.available) }} free</span>
              </p>
            </li>
          </ul>
        </section>

        <section class="card p-5">
          <h2 class="font-bold tracking-tight">App data</h2>
          <p class="text-xs text-muted">Top-level folders in <code class="font-mono">{{ data.appData?.path }}</code>.</p>
          <div class="mt-4 rounded-xl bg-cabana-950 p-4 text-white">
            <p class="text-xs uppercase tracking-wider text-cabana-300">Applications with data folders</p>
            <p class="mt-1 text-3xl font-bold">{{ data.appData?.appCount ?? 0 }}</p>
          </div>
          <ul class="mt-3 flex flex-wrap gap-1.5">
            <li v-for="app in data.appData?.apps" :key="app.name" class="rounded-md bg-sand-100 px-2 py-1 font-mono text-[10px] text-muted">
              {{ app.name }}
            </li>
          </ul>
          <p v-if="!data.appData?.apps?.length" class="mt-3 text-xs text-muted">No app data folders yet.</p>
        </section>
      </div>

      <div class="rounded-xl border border-cabana-200 bg-cabana-50 px-4 py-3 text-xs leading-relaxed text-cabana-800">
        <strong>No disk operations here.</strong> Cabana reports usage from the kernel using standard filesystem
        statistics. Mounting, partitioning, formatting, SMB, and disk management are deliberately out of scope for v1.
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api, formatBytes } from '../lib/api.js';

const data = ref(null);
const error = ref('');

async function load() {
  try {
    data.value = await api('/storage');
    error.value = '';
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(load);
</script>
