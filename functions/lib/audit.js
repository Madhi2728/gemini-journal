import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// The audit trail is what makes isolation visible to the person who owns the
// data. It records that something happened, never what was written.
//
// Journal text, prompts, model output, tokens and secrets must never reach
// this function. The guard below is a backstop, not permission to try.

const ALLOWED_META = new Set([
  'sessionId', 'entryId', 'model', 'remaining', 'count',
  'reason', 'encrypted', 'ip', 'agent',
]);

export async function logAudit(uid, event, meta = {}) {
  const safe = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!ALLOWED_META.has(k)) continue;
    safe[k] = typeof v === 'string' ? v.slice(0, 120) : v;
  }

  try {
    await getFirestore()
      .collection('users').doc(uid)
      .collection('audit')
      .add({ event, ...safe, at: FieldValue.serverTimestamp() });
  } catch {
    // Auditing must never take down the request path.
  }
}
