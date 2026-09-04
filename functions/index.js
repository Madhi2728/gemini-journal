import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';

import { requireUser } from './lib/auth.js';
import { consumeAiCall } from './lib/ratelimit.js';
import { logAudit } from './lib/audit.js';
import { chat, summarise, MODEL } from './lib/gemini.js';

initializeApp();
const db = getFirestore();
const app = express();

// ---------------------------------------------------------------------------
// Trust boundary
//
// Everything below runs server-side. It holds the Gemini key, it is the only
// writer to Firestore, and it derives the user's identity from a verified ID
// token. The browser can reach these routes but cannot influence whose data
// they touch.
// ---------------------------------------------------------------------------

const ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(cors({ origin: ORIGINS, credentials: false }));
app.use(express.json({ limit: '64kb' }));
app.use(requireUser);

// Every path is built from req.uid. There is no code path that reads a uid
// from the request, and no query that spans users.
const userDoc = (uid) => db.collection('users').doc(uid);

const str = (v, max) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 || t.length > max ? null : t;
};

function fail(res, status, message, err) {
  if (err) console.error('request_failed', { status, code: err?.message ?? 'unknown' });
  return res.status(status).json({ error: message });
}

// --- Sessions: multi-turn conversation ------------------------------------
//
// History lives in Firestore and is loaded server-side on every turn. The
// client sends one message, never the transcript -- so it cannot rewrite what
// the model believes was said, or replay another user's conversation.

app.post('/session', async (req, res) => {
  try {
    const ref = await userDoc(req.uid).collection('sessions').add({
      turns: [],
      open: true,
      startedAt: FieldValue.serverTimestamp(),
    });
    await logAudit(req.uid, 'session_opened', { sessionId: ref.id });
    return res.json({ sessionId: ref.id });
  } catch (err) {
    return fail(res, 500, 'Could not start a session. Try again.', err);
  }
});

app.post('/session/:id/message', async (req, res) => {
  const text = str(req.body?.text, 4000);
  if (!text) return fail(res, 400, 'Write something between 1 and 4000 characters.');

  try {
    const ref = userDoc(req.uid).collection('sessions').doc(req.params.id);
    const snap = await ref.get();

    // Ownership is re-checked here in application code. Security Rules do not
    // apply to the Admin SDK, so this is the check that actually holds.
    if (!snap.exists) return fail(res, 404, 'That session no longer exists.');
    if (!snap.data().open) return fail(res, 409, 'That session is already closed.');

    const quota = await consumeAiCall(req.uid);
    if (!quota.ok) {
      await logAudit(req.uid, 'rate_limited', { sessionId: req.params.id });
      return res.status(429).json({
        error: 'You have hit the hourly limit on AI replies.',
        resetAt: quota.resetAt,
      });
    }

    const history = snap.data().turns ?? [];
    const reply = await chat(history, text);

    await ref.update({
      turns: FieldValue.arrayUnion(
        { role: 'user', text, at: Date.now() },
        { role: 'model', text: reply, at: Date.now() },
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await logAudit(req.uid, 'ai_call', {
      sessionId: req.params.id,
      model: MODEL,
      remaining: quota.remaining,
    });

    return res.json({ reply, remaining: quota.remaining });
  } catch (err) {
    return fail(res, 502, 'The AI did not respond. Try again in a moment.', err);
  }
});

app.post('/session/:id/close', async (req, res) => {
  try {
    const ref = userDoc(req.uid).collection('sessions').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return fail(res, 404, 'That session no longer exists.');

    const history = snap.data().turns ?? [];
    if (history.length === 0) {
      await ref.delete();
      return res.json({ entryId: null });
    }

    const quota = await consumeAiCall(req.uid);
    if (!quota.ok) return fail(res, 429, 'You have hit the hourly limit on AI replies.');

    const { title, summary, mood, themes } = await summarise(history);

    const entry = await userDoc(req.uid).collection('entries').add({
      kind: 'ai',
      title, summary, mood, themes,
      turnCount: history.length,
      createdAt: FieldValue.serverTimestamp(),
    });

    await ref.update({ open: false, entryId: entry.id });
    await logAudit(req.uid, 'entry_created', { entryId: entry.id, encrypted: false });

    return res.json({ entryId: entry.id, title, summary, mood, themes });
  } catch (err) {
    return fail(res, 502, 'Could not save that session. Your text is still here.', err);
  }
});

// --- Privacy vault --------------------------------------------------------
//
// Vault entries are encrypted in the browser before they are sent. This server
// receives base64 ciphertext and an IV. It has no key, no key derivation path,
// and no way to read the contents -- deliberately. The trade is real: vault
// entries never reach Gemini, so they get no summary and no mood.

app.get('/vault', async (req, res) => {
  try {
    const ref = userDoc(req.uid).collection('meta').doc('vault');
    const snap = await ref.get();
    if (snap.exists) return res.json(snap.data());

    // The salt is not a secret. It exists to make precomputation useless and is
    // per-user by design.
    const setup = {
      salt: crypto.randomBytes(16).toString('base64'),
      iterations: 310000,
      initialised: false,
    };
    await ref.set(setup);
    return res.json(setup);
  } catch (err) {
    return fail(res, 500, 'Could not load your vault settings.', err);
  }
});

app.post('/vault/verifier', async (req, res) => {
  const iv = str(req.body?.iv, 64);
  const ct = str(req.body?.ct, 512);
  if (!iv || !ct) return fail(res, 400, 'Malformed vault verifier.');

  try {
    await userDoc(req.uid).collection('meta').doc('vault')
      .set({ verifier: { iv, ct }, initialised: true }, { merge: true });
    await logAudit(req.uid, 'vault_initialised');
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, 500, 'Could not set up your vault.', err);
  }
});

app.post('/entries/private', async (req, res) => {
  const iv = str(req.body?.iv, 64);
  const ct = str(req.body?.ct, 32000);
  const titleIv = str(req.body?.titleIv, 64);
  const titleCt = str(req.body?.titleCt, 2000);
  if (!iv || !ct || !titleIv || !titleCt) {
    return fail(res, 400, 'Malformed encrypted entry.');
  }

  try {
    const entry = await userDoc(req.uid).collection('entries').add({
      kind: 'vault',
      cipher: { iv, ct },
      cipherTitle: { iv: titleIv, ct: titleCt },
      createdAt: FieldValue.serverTimestamp(),
    });
    await logAudit(req.uid, 'entry_created', { entryId: entry.id, encrypted: true });
    return res.json({ entryId: entry.id });
  } catch (err) {
    return fail(res, 500, 'Could not save that entry.', err);
  }
});

app.delete('/entries/:id', async (req, res) => {
  try {
    await userDoc(req.uid).collection('entries').doc(req.params.id).delete();
    await logAudit(req.uid, 'entry_deleted', { entryId: req.params.id });
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, 500, 'Could not delete that entry.', err);
  }
});

// --- Security posture -----------------------------------------------------

app.post('/events/signin', async (req, res) => {
  await logAudit(req.uid, 'signed_in', {
    ip: req.get('x-forwarded-for')?.split(',')[0] ?? 'unknown',
    agent: req.get('user-agent') ?? 'unknown',
  });
  return res.json({ ok: true });
});

app.get('/posture', async (req, res) => {
  try {
    const rate = await userDoc(req.uid).collection('meta').doc('rate').get();
    const data = rate.exists ? rate.data() : {};
    return res.json({
      model: MODEL,
      keySource: 'Google Cloud Secret Manager',
      aiCallsUsed: data.count ?? 0,
      aiCallLimit: data.limit ?? 40,
      windowResetsAt: (data.windowStart ?? Date.now()) + 60 * 60 * 1000,
      tokenIssuedAt: req.authTime ? req.authTime * 1000 : null,
    });
  } catch (err) {
    return fail(res, 500, 'Could not load your security summary.', err);
  }
});

export const api = onRequest(
  { region: 'us-central1', memory: '512MiB', timeoutSeconds: 60, maxInstances: 10 },
  app,
);
