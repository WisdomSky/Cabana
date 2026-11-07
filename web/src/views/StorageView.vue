<template>
  <div class="space-y-5">
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-primary">Storage</p>
      <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">What this host has room for</h1>
      <p class="mt-1 text-sm text-muted-foreground">Real filesystem figures reported by the host. Cabana does not mount or format anything.</p>
    </div>

    <div v-if="error" class="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-red-200">{{ error }}</div>
    <div v-if="!data" class="grid gap-4 lg:grid-cols-2">
      <Skeleton v-for="i in 2" :key="i" class="h-40" />
    </div>

    <template v-else>
      <div class="grid gap-4 lg:grid-cols-2">
        <Card
          v-for="fs in data.filesystems"
          :key="fs.mountpoint"
          class="p-5"
          data-testid="storage-filesystem"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-bold">{{ fs.mountpoint }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ fs.device || 'device' }} · {{ fs.fstype }}</p>
            </div>
            <Badge :variant="fs.percent > 90 ? 'destructive' : fs.percent > 75 ? 'warning' : 'success'" class="shrink-0">
              {{ fs.percent }}% used
            </Badge>
          </div>
          <Progress
            class="mt-4"
            :model-value="fs.percent"
            :indicator-class="fs.percent > 90 ? 'bg-destructive' : fs.percent > 75 ? 'bg-chart-3' : 'bg-primary'"
          />
          <div class="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{{ formatBytes(fs.used) }} used</span>
            <span>{{ formatBytes(fs.available) }} free of {{ formatBytes(fs.total) }}</span>
          </div>
        </Card>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <Card class="p-5">
          <h2 class="font-bold tracking-tight">File manager roots</h2>
          <p class="text-xs text-muted-foreground">Only these folders are browsable in Cabana.</p>
          <ul class="mt-4 space-y-3">
            <li v-for="root in data.roots" :key="root.path" class="rounded-xl border border-white/10 bg-white/5 p-3" data-testid="storage-root">
              <div class="flex items-center justify-between gap-2">
                <code class="truncate font-mono text-xs font-semibold">{{ root.path }}</code>
                <span v-if="root.stats" class="text-xs text-muted-foreground">{{ root.stats.percent }}% used</span>
              </div>
              <Progress v-if="root.stats" class="mt-2 h-1.5" :model-value="root.stats.percent" />
              <p class="mt-1.5 text-[11px] text-muted-foreground">
                {{ root.entries ?? 0 }} entries
                <span v-if="root.stats"> · {{ formatBytes(root.stats.available) }} free</span>
              </p>
            </li>
          </ul>
        </Card>

        <Card class="p-5">
          <h2 class="font-bold tracking-tight">App data</h2>
          <p class="text-xs text-muted-foreground">
            Top-level folders in <code class="font-mono">{{ data.appData?.path }}</code>.
          </p>
          <div class="mt-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 to-cabana-700/30 p-4">
            <p class="text-xs uppercase tracking-wider text-primary">Applications with data folders</p>
            <p class="mt-1 text-3xl font-bold">{{ data.appData?.appCount ?? 0 }}</p>
          </div>
          <ul class="mt-3 flex flex-wrap gap-1.5">
            <li v-for="app in data.appData?.apps" :key="app.name" class="rounded-md border border-white/10 bg-white/6 px-2 py-1 font-mono text-[10px] text-muted-foreground">
              {{ app.name }}
            </li>
          </ul>
          <p v-if="!data.appData?.apps?.length" class="mt-3 text-xs text-muted-foreground">No app data folders yet.</p>
        </Card>
      </div>

      <div class="rounded-xl border border-primary/20 bg-primary/8 px-4 py-3 text-xs leading-relaxed text-slate-300">
        <strong class="text-foreground">No disk operations here.</strong> Cabana reports usage from the kernel using
        standard filesystem statistics. Mounting, partitioning, formatting, SMB, and disk management are deliberately
        out of scope for v1.
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api, formatBytes } from '../lib/api.js';
import Badge from '../components/ui/badge/Badge.vue';
import Card from '../components/ui/card/Card.vue';
import Progress from '../components/ui/progress/Progress.vue';
import Skeleton from '../components/ui/skeleton/Skeleton.vue';

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
