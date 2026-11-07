import { reactive } from 'vue';
import { api, setCsrfToken } from './lib/api.js';

export const session = reactive({
  loaded: false,
  authenticated: false,
  user: null,
  csrfToken: null,
  needsSetup: false,
});

export async function loadSession() {
  try {
    const data = await api('/auth/me', { auth: false });
    session.authenticated = Boolean(data.authenticated);
    session.user = data.user || null;
    session.needsSetup = Boolean(data.needsSetup);
    session.csrfToken = data.csrfToken || null;
    setCsrfToken(session.csrfToken);
  } catch {
    session.authenticated = false;
    session.user = null;
    session.needsSetup = true;
  } finally {
    session.loaded = true;
  }
  return session;
}

export function acceptLogin(data) {
  session.authenticated = true;
  session.user = data.user;
  session.needsSetup = false;
  session.csrfToken = data.csrfToken;
  setCsrfToken(data.csrfToken);
}

export function clearLogin() {
  session.authenticated = false;
  session.user = null;
  session.csrfToken = null;
  setCsrfToken(null);
}
