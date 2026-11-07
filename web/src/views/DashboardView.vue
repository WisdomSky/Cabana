<template>
  <div class="space-y-4">
    <div v-if="error" class="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-red-200">
      {{ error }}
      <button class="ml-2 cursor-pointer font-semibold underline" @click="load()">Try again</button>
    </div>

    <div v-if="!data" class="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
      <div class="space-y-4">
        <Skeleton class="h-32" />
        <Skeleton class="h-64" />
        <Skeleton class="h-40" />
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton v-for="i in 9" :key="i" class="aspect-[1.15/1]" />
      </div>
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
      <div class="space-y-4">
        <Card class="overflow-hidden bg-gradient-to-br from-white/12 via-card/70 to-cabana-900/70 p-5" data-testid="clock-card">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[42px] font-light leading-none tracking-[-0.04em]">{{ clockTime }}</p>
              <p class="mt-2 text-sm text-slate-300">{{ clockDate }}</p>
            </div>
            <div class="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/8">
              <Waves class="size-5 text-primary" />
            </div>
          </div>
          <div class="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <span class="size-1.5 rounded-full bg-emerald-400" />
            <span class="truncate">{{ host.hostname }}</span>
            <span class="text-white/20">·</span>
            <span>up {{ formatUptime(host.uptime) }}</span>
          </div>
        </Card>

        <Card class="p-5">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold tracking-tight">System status</h2>
            <RouterLink :to="{ name: 'storage' }" class="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/8 hover:text-foreground" aria-label="Open storage">
              <ChevronRight class="size-4" />
            </RouterLink>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-2">
            <RingMetric
              testid="metric-cpu"
              :value="host.cpu.usagePercent"
              label="CPU"
              :detail="`${host.cpu.cores} cores · load ${host.cpu.load1.toFixed(2)}`"
            />
            <RingMetric
              testid="metric-memory"
              :value="host.memory.percent"
              label="RAM"
              :detail="`${formatBytes(host.memory.used)} / ${formatBytes(host.memory.total)}`"
              tone="success"
            />
          </div>
          <div class="mt-4 flex items-center justify-between rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs">
            <div class="flex min-w-0 items-center gap-2">
              <Container class="size-4 shrink-0 text-primary" />
              <span class="font-semibold">Docker</span>
              <span class="truncate text-muted-foreground">{{ docker.available ? docker.version : 'Unavailable' }}</span>
            </div>
            <Badge :variant="docker.available ? 'success' : 'destructive'">
              {{ docker.available ? 'Online' : 'Offline' }}
            </Badge>
          </div>
        </Card>

        <Card class="p-5" data-testid="metric-disk">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold tracking-tight">Storage</h2>
            <RouterLink :to="{ name: 'storage' }" class="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/8 hover:text-foreground" aria-label="Storage settings">
              <Settings2 class="size-4" />
            </RouterLink>
          </div>
          <div class="mt-4 flex items-center gap-3">
            <div class="grid size-12 place-items-center rounded-xl border border-white/10 bg-white/8">
              <HardDrive class="size-6 text-slate-200" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <Badge :variant="diskHealth.variant">{{ diskHealth.label }}</Badge>
                <span class="truncate text-[11px] text-muted-foreground">{{ data.dataDir }}</span>
              </div>
              <p class="mt-1 text-sm font-semibold">{{ formatBytes(host.disk?.used) }} used</p>
            </div>
          </div>
          <Progress class="mt-4" :model-value="host.disk?.percent || 0" indicator-class="bg-chart-3" />
          <div class="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{{ host.disk?.percent || 0 }}% of {{ formatBytes(host.disk?.total) }}</span>
            <span>{{ formatBytes(host.disk?.available) }} free</span>
          </div>
        </Card>

        <Card class="p-5" data-testid="metric-network">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold tracking-tight">Network status</h2>
            <Badge variant="secondary">all interfaces</Badge>
          </div>
          <div class="mt-3 h-16 w-full overflow-hidden rounded-lg">
            <svg viewBox="0 0 220 64" preserveAspectRatio="none" class="h-full w-full" aria-label="Recent network throughput">
              <defs>
                <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="var(--chart-1)" stop-opacity="0.35" />
                  <stop offset="1" stop-color="var(--chart-1)" stop-opacity="0" />
                </linearGradient>
              </defs>
              <line v-for="y in [16, 32, 48]" :key="y" x1="0" :y1="y" x2="220" :y2="y" stroke="rgba(255,255,255,0.07)" stroke-width="1" />
              <path :d="networkArea" fill="url(#netFill)" />
              <path :d="networkLine" fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linecap="round" />
            </svg>
          </div>
          <div class="mt-2 flex items-center justify-between text-xs">
            <span class="flex items-center gap-1.5 text-emerald-300"><ArrowDown class="size-3.5" /> {{ formatRate(host.network.rxRate) }}</span>
            <span class="flex items-center gap-1.5 text-primary"><ArrowUp class="size-3.5" /> {{ formatRate(host.network.txRate) }}</span>
            <span class="text-muted-foreground">{{ formatBytes(host.network.rxBytes) }} in</span>
          </div>
        </Card>

        <RouterLink
          :to="{ name: 'settings' }"
          class="flex items-center justify-between rounded-2xl border border-white/10 bg-white/6 px-5 py-3.5 text-sm font-semibold text-slate-200 backdrop-blur-xl transition hover:bg-white/10"
        >
          Widget settings
          <ChevronRight class="size-4" />
        </RouterLink>
      </div>

      <div class="min-w-0">
        <div class="flex items-center gap-3">
          <div class="relative flex-1">
            <Search class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="search"
              class="h-12 rounded-2xl border-white/12 bg-slate-950/35 pl-12 text-base backdrop-blur-xl"
              placeholder="Search..."
              aria-label="Search apps"
              data-testid="dashboard-search"
            />
          </div>
          <Button variant="secondary" size="icon" class="size-12 rounded-2xl" aria-label="Refresh dashboard" :disabled="refreshing" @click="load(true)">
            <RefreshCw class="size-5" :class="{ 'animate-spin': refreshing }" />
          </Button>
        </div>

        <div class="mb-3 mt-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">App</h1>
            <p class="text-xs text-muted-foreground">
              {{ counts.running }} running · {{ counts.total }} installed
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" title="Install an app" @click="router.push({ name: 'store' })">
            <Plus class="size-5" />
          </Button>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          <button
            v-for="tile in tiles"
            :key="tile.key"
            type="button"
            class="group relative flex aspect-[1.15/1] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/14 to-white/5 p-3 text-center text-slate-100 shadow-xl shadow-black/10 backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:from-white/20 hover:to-white/8"
            :data-testid="tile.testid"
            @click="openTile(tile)"
          >
            <span class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <span
              v-if="tile.status"
              class="absolute right-3 top-3 size-2 rounded-full ring-2 ring-slate-900/50"
              :class="tile.status === 'running' ? 'bg-emerald-400' : tile.status === 'stopped' ? 'bg-slate-500' : 'bg-amber-400'"
              :title="tile.status"
            />
            <span
              class="grid size-14 place-items-center rounded-2xl border border-white/10 shadow-inner shadow-white/5 transition group-hover:scale-105 sm:size-16"
              :class="tile.tone"
            >
              <img v-if="tile.iconPath" :src="iconUrl(tile.iconPath)" alt="" class="size-9 object-contain sm:size-10" loading="lazy" />
              <component v-else :is="tile.icon" class="size-7 sm:size-8" />
            </span>
            <span class="w-full truncate text-sm font-medium sm:text-[15px]">{{ tile.name }}</span>
            <span v-if="tile.subtitle" class="w-full truncate text-[10px] text-muted-foreground">{{ tile.subtitle }}</span>
          </button>
        </div>

        <div v-if="!tiles.length" class="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/4 px-6 py-12 text-center backdrop-blur-xl">
          <Search class="mx-auto size-8 text-muted-foreground" />
          <p class="mt-3 font-semibold">No apps match “{{ search }}”</p>
          <p class="mt-1 text-sm text-muted-foreground">Try a different name, or add an app from the store.</p>
        </div>
        <div v-else-if="!apps.length && !search" class="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/4 px-6 py-6 text-center text-sm text-muted-foreground backdrop-blur-xl">
          No apps installed yet. Use the <RouterLink :to="{ name: 'store' }" class="font-semibold text-primary hover:underline">App Store</RouterLink> to add one.
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>Docker containers {{ docker.containers?.running ?? 0 }}/{{ docker.containers?.total ?? 0 }}</span>
          <span class="text-white/20">·</span>
          <span>{{ data.store?.appCount ?? '—' }} store apps</span>
          <span class="text-white/20">·</span>
          <span>{{ data.hostArch }} · Cabana {{ data.version }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Container,
  ChevronRight,
  FolderOpen,
  HardDrive,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Store,
  Waves,
} from 'lucide-vue-next';
import Badge from '../components/ui/badge/Badge.vue';
import Button from '../components/ui/button/Button.vue';
import Card from '../components/ui/card/Card.vue';
import Input from '../components/ui/input/Input.vue';
import Progress from '../components/ui/progress/Progress.vue';
import Skeleton from '../components/ui/skeleton/Skeleton.vue';
import RingMetric from '../components/dashboard/RingMetric.vue';
import { api, appUrl, formatBytes, formatRate, formatUptime, iconUrl } from '../lib/api.js';

const router = useRouter();
const data = ref(null);
const refreshing = ref(false);
const error = ref('');
const search = ref('');
const now = ref(new Date());
const history = ref([]);
let pollTimer = null;
let clockTimer = null;

const host = computed(() => data.value?.host || {
  hostname: '',
  uptime: 0,
  cpu: { usagePercent: 0, cores: 0, load1: 0 },
  memory: { used: 0, total: 0, percent: 0 },
  disk: null,
  network: { rxRate: 0, txRate: 0, rxBytes: 0, txBytes: 0 },
});
const docker = computed(() => data.value?.docker || { available: false });
const apps = computed(() => data.value?.apps?.items || data.value?.apps?.recent || []);
const counts = computed(() => data.value?.apps?.counts || { running: 0, stopped: 0, total: 0 });

const clockTime = computed(() => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now.value));
const clockDate = computed(() => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now.value));

const diskHealth = computed(() => {
  const percent = host.value.disk?.percent || 0;
  if (percent >= 90) return { label: 'Critical', variant: 'destructive' };
  if (percent >= 75) return { label: 'Attention', variant: 'warning' };
  return { label: 'Healthy', variant: 'success' };
});

const shortcuts = [
  { key: 'store', name: 'App Store', icon: Store, to: 'store', tone: 'bg-gradient-to-br from-blue-500/70 to-indigo-500/50 text-white' },
  { key: 'files', name: 'Files', icon: FolderOpen, to: 'files', tone: 'bg-gradient-to-br from-amber-400/60 to-orange-500/40 text-amber-50' },
  { key: 'apps', name: 'My Apps', icon: Boxes, to: 'apps', tone: 'bg-gradient-to-br from-cyan-400/50 to-teal-500/40 text-cyan-50' },
  { key: 'storage', name: 'Storage', icon: HardDrive, to: 'storage', tone: 'bg-gradient-to-br from-violet-400/50 to-purple-500/40 text-violet-50' },
];

const tiles = computed(() => {
  const query = search.value.trim().toLowerCase();
  const shortcutTiles = shortcuts
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .map((item) => ({ ...item, testid: `dashboard-shortcut-${item.key}` }));
  const appTiles = apps.value
    .filter((app) => !query || `${app.title} ${app.id} ${app.storeId || ''}`.toLowerCase().includes(query))
    .map((app) => ({
      key: `app-${app.id}`,
      name: app.title,
      subtitle: app.status === 'running' ? 'Running' : app.status,
      iconPath: app.iconPath,
      icon: Boxes,
      tone: 'bg-white/8',
      status: app.status,
      app,
      to: app.status === 'running' && app.port ? null : 'apps',
      testid: `dashboard-app-${app.id}`,
    }));
  return [...shortcutTiles, ...appTiles];
});

const networkPoints = computed(() => {
  const values = history.value.length ? history.value : [{ rx: host.value.network.rxRate, tx: host.value.network.txRate }];
  const max = Math.max(1024, ...values.map((point) => Math.max(point.rx, point.tx)));
  return values.map((point, index) => ({
    x: values.length === 1 ? 0 : (index / (values.length - 1)) * 220,
    rx: 56 - (point.rx / max) * 48,
    tx: 56 - (point.tx / max) * 48,
  }));
});
const networkLine = computed(() => networkPoints.value.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.rx.toFixed(1)}`).join(' '));
const networkArea = computed(() => `${networkLine.value} L220,64 L0,64 Z`);

function openTile(tile) {
  if (tile.app) {
    if (tile.app.status === 'running' && tile.app.port) {
      window.open(appUrl(tile.app), '_blank', 'noopener,noreferrer');
    } else {
      router.push({ name: 'apps' });
    }
    return;
  }
  router.push({ name: tile.to });
}

async function load(manual = false) {
  if (manual) refreshing.value = true;
  try {
    data.value = await api('/dashboard');
    const net = data.value.host?.network;
    if (net) {
      history.value = [...history.value, { rx: net.rxRate || 0, tx: net.txRate || 0 }].slice(-24);
    }
    error.value = '';
  } catch (err) {
    error.value = err.message;
  } finally {
    refreshing.value = false;
  }
}

onMounted(() => {
  load();
  pollTimer = setInterval(() => load(), 5000);
  clockTimer = setInterval(() => { now.value = new Date(); }, 1000);
});
onBeforeUnmount(() => {
  clearInterval(pollTimer);
  clearInterval(clockTimer);
});
</script>
