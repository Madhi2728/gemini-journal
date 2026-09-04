import { getAuth } from 'firebase-admin/auth';

// Identity comes from a verified Firebase ID token and nothing else.
//
// The request body, query string and any custom header are attacker-controlled.
// A uid supplied there is ignored everywhere in this codebase.

export async function requireUser(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Sign in to continue.' });
  }

  try {
    // checkRevoked: true so a revoked session stops working immediately.
    const decoded = await getAuth().verifyIdToken(token, true);
    req.uid = decoded.uid;
    req.authTime = decoded.auth_time;
    return next();
  } catch (err) {
    console.warn('auth_rejected', { code: err?.code ?? 'unknown' });
    return res.status(401).json({ error: 'Your session expired. Sign in again.' });
  }
}
