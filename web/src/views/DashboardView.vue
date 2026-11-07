<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-cabana-600">Dashboard</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {{ greeting }}{{ session.user?.username ? `, ${session.user.username}` : '' }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ data?.host?.hostname || 'This host' }}
          <span v-if="data?.host"> · up {{ formatUptime(data.host.uptime) }} · {{ data.host.platform }}</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-secondary btn-sm" :disabled="refreshing" @click="load(true)">
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': refreshing }" /> Refresh
        </button>
        <RouterLink :to="{ name: 'store' }" class="btn-primary btn-sm">
          <Store class="size-3.5" /> App store
        </RouterLink>
      </div>
    </div>

    <div v-if="error" class="rounded-xl border border-coral-500/30 bg-coral-100 px-4 py-3 text-sm text-coral-500">
      {{ error }}
      <button class="ml-2 font-semibold underline" @click="load()">Try again</button>
    </div>

    <div v-if="!data" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div v-for="i in 4" :key="i" class="card h-32 animate-pulse bg-white/60" />
    </div>

    <template v-else>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="CPU"
          :value="`${host.cpu.usagePercent.toFixed(1)}%`"
          :hint="`${host.cpu.cores} cores · load ${host.cpu.load1.toFixed(2)}`"
          :percent="host.cpu.usagePercent"
          :icon="Cpu"
          tone="teal"
          testid="metric-cpu"
        />
        <MetricCard
          label="Memory"
          :value="formatBytes(host.memory.used)"
          :hint="`${formatBytes(host.memory.total)} total · ${host.memory.percent}% used`"
          :percent="host.memory.percent"
          :icon="MemoryStick"
          tone="blue"
          testid="metric-memory"
        />
        <MetricCard
          label="Disk"
          :value="host.disk ? formatBytes(host.disk.used) : '—'"
          :hint="host.disk ? `${formatBytes(host.disk.available)} free of ${formatBytes(host.disk.total)}` : 'No data directory'"
          :percent="host.disk?.percent ?? null"
          :icon="HardDrive"
          tone="coral"
          testid="metric-disk"
        />
        <MetricCard
          label="Network"
          :value="`↓ ${formatRate(host.network.rxRate)}`"
          :hint="`↑ ${formatRate(host.network.txRate)} · total ${formatBytes(host.network.rxBytes)} in`"
          :icon="ArrowDownUp"
          tone="sand"
          testid="metric-network"
        />
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section class="card p-5 lg:col-span-2">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="font-bold tracking-tight">Your apps</h2>
              <p class="text-xs text-muted">
                {{ counts.running }} running · {{ counts.stopped }} stopped · {{ counts.total }} installed
              </p>
            </div>
            <RouterLink :to="{ name: 'apps' }" class="text-xs font-bold text-cabana-700 hover:underline">
              Manage all
            </RouterLink>
          </div>

          <div v-if="!apps.length" class="mt-6 rounded-xl border border-dashed border-sand-300 bg-sand-50 p-6 text-center">
            <Boxes class="mx-auto size-8 text-cabana-400" />
            <p class="mt-2 text-sm font-semibold">No apps yet</p>
            <p class="mt-1 text-xs text-muted">Install something from the official CasaOS/ZimaOS store to get started.</p>
            <RouterLink :to="{ name: 'store' }" class="btn-primary btn-sm mt-4">Browse the store</RouterLink>
          </div>

          <ul v-else class="mt-4 divide-y divide-sand-100">
            <li v-for="app in apps" :key="app.id" class="flex items-center gap-3 py-3" :data-testid="`dashboard-app-${app.id}`">
              <img v-if="app.iconPath" :src="iconUrl(app.iconPath)" alt="" class="size-9 rounded-lg border border-sand-200 object-contain p-1" />
              <div v-else class="grid size-9 place-items-center rounded-lg bg-cabana-100 text-xs font-bold uppercase text-cabana-700">
                {{ app.title.slice(0, 2) }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">{{ app.title }}</p>
                <p class="truncate text-xs text-muted">
                  {{ app.source === 'store' ? 'Official store' : 'Custom Compose' }}
                  <span v-if="app.port"> · port {{ app.port }}</span>
                </p>
              </div>
              <AppStatusBadge :status="app.status" :health="app.health" />
              <div class="flex items-center gap-1">
                <a
                  v-if="app.status === 'running' && app.port"
                  :href="appUrl(app)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rounded-lg p-1.5 text-muted hover:bg-sand-100 hover:text-ink"
                  title="Open app"
                >
                  <ExternalLink class="size-4" />
                </a>
                <button
                  v-if="app.status === 'stopped' || app.status === 'error'"
                  class="rounded-lg p-1.5 text-muted hover:bg-sand-100 hover:text-ink"
                  title="Start app"
                  @click="action(app, 'start')"
                >
                  <Play class="size-4" />
                </button>
                <button
                  v-else-if="app.status === 'running'"
                  class="rounded-lg p-1.5 text-muted hover:bg-sand-100 hover:text-ink"
                  title="Stop app"
                  @click="action(app, 'stop')"
                >
                  <Square class="size-4" />
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section class="space-y-4">
          <div class="card p-5">
            <div class="flex items-center justify-between">
              <h2 class="font-bold tracking-tight">Platform</h2>
              <Container class="size-4 text-muted" />
            </div>
            <dl class="mt-4 space-y-2.5 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted">Docker</dt>
                <dd class="font-semibold" :class="docker.available ? 'text-cabana-700' : 'text-coral-500'">
                  {{ docker.available ? `v${docker.version}` : 'Unavailable' }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted">Containers</dt>
                <dd class="font-semibold">{{ docker.containers?.running ?? 0 }} / {{ docker.containers?.total ?? 0 }} running</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted">Store apps</dt>
                <dd class="font-semibold">{{ data.store?.appCount ?? '—' }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-muted">Store updated</dt>
                <dd class="font-semibold">{{ relativeTime(data.store?.updatedAt) }}</dd>
              </div>
            </dl>
            <div v-if="!docker.available" class="mt-3 rounded-lg bg-coral-100 px-3 py-2 text-xs text-coral-500">
              Start Docker and check that <code class="font-mono">/var/run/docker.sock</code> is reachable from the Cabana service.
            </div>
          </div>

          <div class="card overflow-hidden">
            <div class="bg-cabana-900 px-5 py-4 text-white">
              <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cabana-300">
                <HardDrive class="size-3.5" /> {{ data.dataDir || '/DATA' }}
              </div>
              <p class="mt-2 text-2xl font-bold">{{ host.disk ? formatBytes(host.disk.used) : '—' }}</p>
              <p class="text-xs text-cabana-200">{{ host.disk ? `${formatBytes(host.disk.available)} available · ${host.disk.percent}% used` : 'Unavailable' }}</p>
            </div>
            <div class="flex items-center justify-between px-5 py-3 text-sm">
              <span class="text-muted">Storage overview</span>
              <RouterLink :to="{ name: 'storage' }" class="font-semibold text-cabana-700 hover:underline">Inspect</RouterLink>
            </div>
          </div>
        </section>
      </div>

      <div v-if="orphans?.length" class="rounded-xl border border-yellow-300/60 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        <p class="font-semibold">Containers Cabana no longer tracks</p>
        <p class="mt-1 text-xs">{{ orphans.map((o) => o.name).join(', ') }}. You can remove them with Docker if they are not needed.</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  ArrowDownUp,
  Boxes,
  Container,
  Cpu,
  ExternalLink,
  HardDrive,
  MemoryStick,
  Play,
  RefreshCw,
  Square,
  Store,
} from 'lucide-vue-next';
import MetricCard from '../components/MetricCard.vue';
import AppStatusBadge from '../components/AppStatusBadge.vue';
import { api, appUrl, formatBytes, formatRate, formatUptime, iconUrl, relativeTime } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { session } from '../session.js';

const data = ref(null);
const refreshing = ref(false);
const error = ref('');
let timer = null;

const host = computed(() => data.value?.host || {
  cpu: { usagePercent: 0, cores: 0, load1: 0 },
  memory: { used: 0, total: 0, percent: 0 },
  disk: null,
  network: { rxRate: 0, txRate: 0, rxBytes: 0 },
  uptime: 0,
});
const docker = computed(() => data.value?.docker || { available: false });
const apps = computed(() => data.value?.apps?.recent || []);
const counts = computed(() => data.value?.apps?.counts || { running: 0, stopped: 0, total: 0 });
const orphans = computed(() => data.value?.orphans || []);
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
});

async function load(manual = false) {
  if (manual) refreshing.value = true;
  try {
    data.value = await api('/dashboard');
    error.value = '';
  } catch (err) {
    error.value = err.message;
  } finally {
    refreshing.value = false;
  }
}

async function action(app, verb) {
  try {
    await api(`/apps/${encodeURIComponent(app.id)}/${verb}`, { method: 'POST' });
    toast(`${app.title} ${verb === 'start' ? 'started' : 'stopped'}.`);
    await load();
  } catch (err) {
    toast(err.message, 'error', 8000);
  }
}

onMounted(() => {
  load();
  timer = setInterval(() => load(), 5000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>
