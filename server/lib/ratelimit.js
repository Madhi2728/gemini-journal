import { getFirestore } from 'firebase-admin/firestore';

// Per-user quota on model calls. Someone will try to run up the bill; a token
// bucket in a transaction is enough to stop it and cheap enough to run inline.

const WINDOW_MS = 60 * 60 * 1000;
const MAX_CALLS = 40;

export async function consumeAiCall(uid) {
  const db = getFirestore();
  const ref = db.collection('users').doc(uid).collection('meta').doc('rate');

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    let windowStart = snap.exists ? (snap.data().windowStart ?? 0) : 0;
    let count = snap.exists ? (snap.data().count ?? 0) : 0;

    if (now - windowStart > WINDOW_MS) {
      windowStart = now;
      count = 0;
    }

    const resetAt = windowStart + WINDOW_MS;
    if (count >= MAX_CALLS) return { ok: false, remaining: 0, resetAt, limit: MAX_CALLS };

    tx.set(ref, { windowStart, count: count + 1, limit: MAX_CALLS }, { merge: true });
    return { ok: true, remaining: MAX_CALLS - count - 1, resetAt, limit: MAX_CALLS };
  });
}
