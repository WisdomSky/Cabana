<template>
  <div class="space-y-5">
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-primary">Settings</p>
      <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Server settings</h1>
      <p class="mt-1 text-sm text-muted">Administrator account, app defaults, file roots, and store refresh.</p>
    </div>

    <div v-if="error" class="rounded-xl border border-coral-500/30 bg-coral-100 px-4 py-3 text-sm text-coral-500">{{ error }}</div>
    <Skeleton v-if="!data" class="h-48" />

    <template v-else>
      <div class="grid gap-4 lg:grid-cols-2">
        <Card class="p-5">
          <div class="flex items-center gap-2">
            <KeyRound class="size-4 text-primary" />
            <h2 class="font-bold tracking-tight">Administrator password</h2>
          </div>
          <p class="mt-1 text-xs text-muted">Signed in as <strong>{{ session.user?.username }}</strong>. Other sessions are signed out when the password changes.</p>
          <form class="mt-4 space-y-3" @submit.prevent="changePassword">
            <div>
              <Label for="current-password">Current password</Label>
              <Input id="current-password" v-model="password.current" type="password" autocomplete="current-password" data-testid="current-password" required />
            </div>
            <div>
              <Label for="new-password">New password</Label>
              <Input id="new-password" v-model="password.next" type="password" autocomplete="new-password" data-testid="new-password" required />
            </div>
            <div>
              <Label for="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" v-model="password.confirm" type="password" autocomplete="new-password" data-testid="confirm-password" required />
            </div>
            <p v-if="password.error" class="text-sm text-coral-500">{{ password.error }}</p>
            <Button type="submit" :disabled="password.busy" data-testid="password-submit">
              <Loader2 v-if="password.busy" class="size-4 animate-spin" /> Update password
            </Button>
          </form>
        </Card>

        <Card class="p-5">
          <div class="flex items-center gap-2">
            <Container class="size-4 text-primary" />
            <h2 class="font-bold tracking-tight">App defaults</h2>
          </div>
          <p class="mt-1 text-xs text-muted">Used for new installs when a store Compose file references $PUID, $PGID, or $TZ.</p>
          <form class="mt-4 space-y-3" @submit.prevent="saveDefaults">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <Label for="puid">PUID</Label>
                <Input id="puid" v-model.number="defaults.puid" type="number" min="1" max="65535" data-testid="settings-puid" />
              </div>
              <div>
                <Label for="pgid">PGID</Label>
                <Input id="pgid" v-model.number="defaults.pgid" type="number" min="1" max="65535" data-testid="settings-pgid" />
              </div>
            </div>
            <div>
              <Label for="tz">Timezone</Label>
              <Input id="tz" v-model.trim="defaults.tz" class="font-mono" placeholder="UTC or America/New_York" data-testid="settings-tz" />
            </div>
            <p class="text-[11px] text-muted">Changes apply to future installs; existing apps keep their Compose definitions.</p>
            <Button type="submit" :disabled="defaults.busy" data-testid="settings-save-defaults">
              <Loader2 v-if="defaults.busy" class="size-4 animate-spin" /> Save defaults
            </Button>
          </form>
        </Card>

        <Card class="p-5">
          <div class="flex items-center gap-2">
            <FolderCog class="size-4 text-primary" />
            <h2 class="font-bold tracking-tight">File manager roots</h2>
          </div>
          <p class="mt-1 text-xs text-muted">One absolute path per line. Roots must already exist; broad roots expose more of the host.</p>
          <form class="mt-4 space-y-3" @submit.prevent="saveRoots">
            <Textarea v-model="roots.text" class="min-h-24 font-mono text-xs" spellcheck="false" data-testid="file-roots" />
            <div>
              <Label for="roots-password">Current password (required)</Label>
              <Input id="roots-password" v-model="roots.password" type="password" autocomplete="current-password" data-testid="roots-password" />
            </div>
            <p v-if="roots.error" class="text-sm text-coral-500">{{ roots.error }}</p>
            <Button type="submit" :disabled="roots.busy" data-testid="settings-save-roots">
              <Loader2 v-if="roots.busy" class="size-4 animate-spin" /> Save roots
            </Button>
          </form>
        </Card>

        <Card class="p-5">
          <div class="flex items-center gap-2">
            <RefreshCw class="size-4 text-primary" />
            <h2 class="font-bold tracking-tight">App store</h2>
          </div>
          <p class="mt-1 text-xs text-muted">
            The official CasaOS/ZimaOS v2 index is cached locally and refreshed automatically. You can force a refresh now.
          </p>
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Cache file</dt>
              <dd class="font-mono text-xs">/var/lib/cabana/store/index.json</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Last refresh</dt>
              <dd class="font-semibold">{{ relativeTime(data.settings.storeFetchedAt) }}</dd>
            </div>
          </dl>
          <Button variant="secondary" class="mt-4" :disabled="storeBusy" data-testid="settings-store-refresh" @click="refreshStore">
            <RefreshCw class="size-4" :class="{ 'animate-spin': storeBusy }" /> Refresh official store
          </Button>
        </Card>
      </div>

      <Card class="p-5">
        <h2 class="font-bold tracking-tight">System</h2>
        <dl class="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-wide text-muted">Cabana</dt>
            <dd class="font-mono text-xs">{{ data.system.version }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-wide text-muted">Docker</dt>
            <dd class="font-mono text-xs">{{ data.system.docker.available ? data.system.docker.version : 'unavailable' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-wide text-muted">Compose</dt>
            <dd class="font-mono text-xs">{{ data.system.docker.composeVersion || 'unavailable' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-wide text-muted">Architecture</dt>
            <dd class="font-mono text-xs">{{ data.system.hostArch }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-wide text-muted">State directory</dt>
            <dd class="font-mono text-xs">{{ data.system.stateDir }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-semibold uppercase tracking-wide text-muted">App data directory</dt>
            <dd class="font-mono text-xs">{{ data.system.dataDir }}</dd>
          </div>
        </dl>
      </Card>

      <Card class="p-5">
        <h2 class="font-bold tracking-tight">About Cabana</h2>
        <p class="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Cabana is an independent, CasaOS-inspired personal cloud server for home Linux machines. App catalog
          data comes from the <a href="https://github.com/IceWhaleTech/CasaOS-AppStore" target="_blank" rel="noopener noreferrer" class="font-semibold text-primary hover:underline">official CasaOS/ZimaOS app store</a>;
          Cabana is not affiliated with or endorsed by CasaOS or ZimaOS.
        </p>
        <div class="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
          <p><strong class="text-ink">In v1:</strong> store apps, custom Compose, files, storage overview, admin settings.</p>
          <p><strong class="text-ink">Out of v1:</strong> disk mounting/SMB, multi-user, remote access, TLS, backups, app upgrades, third-party stores.</p>
        </div>
        <p class="mt-3 text-xs leading-relaxed text-muted">
          Custom Compose files can request privileged or host-network access; Cabana asks for explicit confirmation
          before installing those. The installer never partitions or formats disks, and the browser never talks to
          the Docker API directly.
        </p>
      </Card>
    </template>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { Container, FolderCog, KeyRound, Loader2, RefreshCw } from 'lucide-vue-next';
import { api, relativeTime } from '../lib/api.js';
import Button from '../components/ui/button/Button.vue';
import Card from '../components/ui/card/Card.vue';
import Input from '../components/ui/input/Input.vue';
import Label from '../components/ui/label/Label.vue';
import Skeleton from '../components/ui/skeleton/Skeleton.vue';
import Textarea from '../components/ui/textarea/Textarea.vue';
import { session } from '../session.js';
import { toast } from '../lib/toast.js';

const data = ref(null);
const error = ref('');
const password = reactive({ current: '', next: '', confirm: '', busy: false, error: '' });
const defaults = reactive({ puid: 1000, pgid: 1000, tz: 'UTC', busy: false });
const roots = reactive({ text: '', password: '', busy: false, error: '' });
const storeBusy = ref(false);

async function load() {
  try {
    data.value = await api('/settings');
    defaults.puid = data.value.settings.puid;
    defaults.pgid = data.value.settings.pgid;
    defaults.tz = data.value.settings.tz;
    roots.text = data.value.settings.fileRoots.join('\n');
    error.value = '';
  } catch (err) {
    error.value = err.message;
  }
}

async function changePassword() {
  password.error = '';
  if (password.next !== password.confirm) {
    password.error = 'The new passwords do not match.';
    return;
  }
  password.busy = true;
  try {
    await api('/settings/password', {
      method: 'POST',
      body: { currentPassword: password.current, newPassword: password.next },
    });
    password.current = '';
    password.next = '';
    password.confirm = '';
    toast('Administrator password updated.');
  } catch (err) {
    password.error = err.message;
  } finally {
    password.busy = false;
  }
}

async function saveDefaults() {
  defaults.busy = true;
  try {
    const result = await api('/settings', { method: 'PATCH', body: { puid: defaults.puid, pgid: defaults.pgid, tz: defaults.tz } });
    data.value.settings = result.settings;
    toast('App defaults saved.');
  } catch (err) {
    toast(err.message, 'error', 7000);
  } finally {
    defaults.busy = false;
  }
}

async function saveRoots() {
  roots.busy = true;
  roots.error = '';
  try {
    const fileRoots = roots.text.split('\n').map((line) => line.trim()).filter(Boolean);
    const result = await api('/settings', { method: 'PATCH', body: { fileRoots, currentPassword: roots.password } });
    data.value.settings = result.settings;
    roots.password = '';
    toast('File roots saved.');
  } catch (err) {
    roots.error = err.message;
  } finally {
    roots.busy = false;
  }
}

async function refreshStore() {
  storeBusy.value = true;
  try {
    const result = await api('/store/refresh', { method: 'POST' });
    toast(`Official store refreshed: ${result.appCount} apps.`);
    await load();
  } catch (err) {
    toast(err.message, 'error', 8000);
  } finally {
    storeBusy.value = false;
  }
}

onMounted(load);
</script>
