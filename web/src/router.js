import { createRouter, createWebHistory } from 'vue-router';
import { loadSession, session } from './session.js';
import AppShell from './components/AppShell.vue';
import SetupView from './views/SetupView.vue';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import StoreView from './views/StoreView.vue';
import AppsView from './views/AppsView.vue';
import FilesView from './views/FilesView.vue';
import StorageView from './views/StorageView.vue';
import SettingsView from './views/SettingsView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/setup', name: 'setup', component: SetupView, meta: { public: true, title: 'Set up Cabana' } },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true, title: 'Sign in' } },
    {
      path: '/',
      component: AppShell,
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'dashboard', component: DashboardView, meta: { title: 'Dashboard' } },
        { path: 'store', name: 'store', component: StoreView, meta: { title: 'App store' } },
        { path: 'apps', name: 'apps', component: AppsView, meta: { title: 'My apps' } },
        { path: 'files', name: 'files', component: FilesView, meta: { title: 'Files' } },
        { path: 'storage', name: 'storage', component: StorageView, meta: { title: 'Storage' } },
        { path: 'settings', name: 'settings', component: SettingsView, meta: { title: 'Settings' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  if (!session.loaded) await loadSession();
  if (to.meta.public) {
    if (to.name === 'setup' && !session.needsSetup) {
      return session.authenticated ? '/' : '/login';
    }
    if (to.name === 'login' && session.needsSetup) return '/setup';
    if (to.name === 'login' && session.authenticated) return '/';
    return true;
  }
  if (to.meta.requiresAuth && !session.authenticated) {
    return session.needsSetup ? '/setup' : '/login';
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Cabana` : 'Cabana';
});

export default router;
