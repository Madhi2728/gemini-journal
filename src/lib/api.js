import { auth } from './firebase.js';

const BASE = import.meta.env.VITE_API_BASE || '/api';

// Every request carries a fresh Firebase ID token. The server derives identity
// from it. We never send a uid -- if we did, the server would ignore it.

async function request(path, { method = 'GET', body } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to continue.');

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

export const api = {
  openSession: () => request('/session', { method: 'POST' }),
  say: (id, text) => request(`/session/${id}/message`, { method: 'POST', body: { text } }),
  closeSession: (id) => request(`/session/${id}/close`, { method: 'POST' }),

  vaultConfig: () => request('/vault'),
  setVerifier: (v) => request('/vault/verifier', { method: 'POST', body: v }),
  savePrivate: (payload) => request('/entries/private', { method: 'POST', body: payload }),

  remove: (id) => request(`/entries/${id}`, { method: 'DELETE' }),
  posture: () => request('/posture'),
  noteSignIn: () => request('/events/signin', { method: 'POST' }),
};
