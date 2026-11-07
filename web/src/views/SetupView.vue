<template>
  <AuthFrame>
    <p class="text-xs font-bold uppercase tracking-[0.18em] text-primary">First run</p>
    <h1 class="mt-2 text-3xl font-bold tracking-tight">Welcome to Cabana</h1>
    <p class="mt-2 text-sm leading-relaxed text-muted">
      Create the one administrator account for this server. There are no default credentials, and setup
      closes as soon as this account exists.
    </p>

    <form class="mt-7 space-y-4" @submit.prevent="submit">
      <div>
        <Label class="label" for="setup-username">Username</Label>
        <Input
          id="setup-username"
          v-model.trim="username"
          autocomplete="username"
          placeholder="admin"
          data-testid="setup-username"
          required
        />
        <p class="mt-1 text-xs text-muted">3–32 characters: letters, numbers, dots, dashes, underscores.</p>
      </div>
      <div>
        <Label class="label" for="setup-password">Password</Label>
        <Input
          id="setup-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          placeholder="At least 8 characters"
          data-testid="setup-password"
          required
        />
      </div>
      <div>
        <Label class="label" for="setup-confirm">Confirm password</Label>
        <Input
          id="setup-confirm"
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          data-testid="setup-confirm"
          required
        />
      </div>
      <p v-if="error" class="rounded-xl border border-coral-500/30 bg-coral-100 px-3 py-2 text-sm text-coral-500" data-testid="setup-error">
        {{ error }}
      </p>
      <Button type="submit" class="w-full py-2.5" :disabled="loading" data-testid="setup-submit">
        <Loader2 v-if="loading" class="size-4 animate-spin" />
        {{ loading ? 'Creating your cabana…' : 'Create administrator' }}
      </Button>
    </form>

    <p class="mt-6 text-xs leading-relaxed text-muted">
      Cabana stores its state in <code class="rounded bg-sand-100 px-1 py-0.5 font-mono">/var/lib/cabana</code> and
      app data in <code class="rounded bg-sand-100 px-1 py-0.5 font-mono">/DATA</code>. Nothing leaves this machine
      unless you install an app that talks to the internet.
    </p>
  </AuthFrame>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Loader2 } from 'lucide-vue-next';
import AuthFrame from '../components/AuthFrame.vue';
import Button from '../components/ui/button/Button.vue';
import Input from '../components/ui/input/Input.vue';
import Label from '../components/ui/label/Label.vue';
import { api } from '../lib/api.js';
import { acceptLogin } from '../session.js';

const router = useRouter();
const username = ref('');
const password = ref('');
const confirm = ref('');
const loading = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  if (password.value !== confirm.value) {
    error.value = 'The two passwords do not match.';
    return;
  }
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.';
    return;
  }
  loading.value = true;
  try {
    const data = await api('/setup', {
      method: 'POST',
      body: { username: username.value, password: password.value },
    });
    acceptLogin(data);
    await router.replace('/');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>
