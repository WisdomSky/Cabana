import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import { loadSession, session } from './session.js';
import './style.css';

window.addEventListener('cabana:unauthorized', async () => {
  session.authenticated = false;
  session.user = null;
  session.csrfToken = null;
  if (router.currentRoute.value.meta.requiresAuth) {
    await router.replace('/login');
  }
});

async function boot() {
  await loadSession();
  const app = createApp(App);
  app.use(router);
  app.mount('#app');
}

boot();
