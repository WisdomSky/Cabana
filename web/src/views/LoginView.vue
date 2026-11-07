<template>
  <AuthFrame>
    <p class="text-xs font-bold uppercase tracking-[0.18em] text-primary">Welcome back</p>
    <h1 class="mt-2 text-3xl font-bold tracking-tight">Sign in to Cabana</h1>
    <p class="mt-2 text-sm text-muted">Use the administrator account you created on this server.</p>

    <form class="mt-7 space-y-4" @submit.prevent="submit">
      <div>
        <Label class="label" for="login-username">Username</Label>
        <Input
          id="login-username"
          v-model.trim="username"
          autocomplete="username"
          data-testid="login-username"
          required
          autofocus
        />
      </div>
      <div>
        <Label class="label" for="login-password">Password</Label>
        <Input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          data-testid="login-password"
          required
        />
      </div>
      <p v-if="error" class="rounded-xl border border-coral-500/30 bg-coral-100 px-3 py-2 text-sm text-coral-500" data-testid="login-error">
        {{ error }}
      </p>
      <Button type="submit" class="w-full py-2.5" :disabled="loading" data-testid="login-submit">
        <Loader2 v-if="loading" class="size-4 animate-spin" />
        {{ loading ? 'Signing in…' : 'Sign in' }}
      </Button>
    </form>

    <p class="mt-6 text-xs leading-relaxed text-muted">
      Sessions are kept in an HttpOnly cookie. If you have lost the password, reset it from a root shell on the
      server — Cabana has no email-based recovery by design.
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
const loading = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    const data = await api('/auth/login', {
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
