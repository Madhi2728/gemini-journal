import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { api } from '../lib/api.js';

// Isolation is usually invisible, which is why people stop believing in it.
// This view makes it legible: what the server does on your behalf, what it can
// still read, and what it cannot.

const READABLE = {
  signed_in: 'Signed in',
  session_opened: 'Started a conversation',
  ai_call: 'Sent a message to the AI',
  rate_limited: 'Hit the hourly AI limit',
  entry_created: 'Saved an entry',
  entry_deleted: 'Deleted an entry',
  vault_initialised: 'Set up your vault passphrase',
};

const clock = (ts) =>
  ts?.toDate
    ? ts.toDate().toLocaleString(undefined, {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '';

export default function Ledger({ uid, vaultOpen }) {
  const [events, setEvents] = useState([]);
  const [posture, setPosture] = useState(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(db, 'users', uid, 'audit'),
        orderBy('at', 'desc'),
        limit(40),
      ),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setEvents([]),
    );
  }, [uid]);

  useEffect(() => {
    api.posture().then(setPosture).catch(() => setPosture(null));
  }, []);

  return (
    <article className="page">
      <h2 className="entry-title">What is happening to your data</h2>

      <div className="posture">
        <Row
          label="Gemini API key"
          value={posture ? posture.keySource : 'Checking'}
          note="Read at runtime by the backend. Never in the browser bundle."
        />
        <Row
          label="Who the server thinks you are"
          value={`${uid.slice(0, 10)}…`}
          note="Taken from a verified ID token, not from anything this page sends."
        />
        <Row
          label="Direct writes from this browser"
          value="Blocked"
          note="Security Rules deny all client writes. Every change goes through the backend."
        />
        <Row
          label="AI replies used this hour"
          value={posture ? `${posture.aiCallsUsed} of ${posture.aiCallLimit}` : '—'}
          note="A per-account cap, enforced in a transaction before the model is called."
        />
        <Row
          label="Private vault"
          value={vaultOpen ? 'Open on this device' : 'Locked'}
          note="Sealed entries are encrypted here. The server stores ciphertext and has no key."
        />
        <Row
          label="Model in use"
          value={posture ? posture.model : '—'}
          note="Sealed entries are never sent to it."
        />
      </div>

      <h3 className="sub">Recent activity on your account</h3>
      {events.length === 0 ? (
        <p className="hint">Nothing recorded yet.</p>
      ) : (
        <ol className="ledger">
          {events.map((e) => (
            <li key={e.id}>
              <span className="ledger-when tabular">{clock(e.at)}</span>
              <span className="ledger-what">{READABLE[e.event] ?? e.event}</span>
              {e.encrypted === true && <span className="tag tag--sealed">sealed</span>}
              {e.event === 'rate_limited' && <span className="tag tag--warn">blocked</span>}
            </li>
          ))}
        </ol>
      )}
      <p className="hint">
        This log records that something happened, never what you wrote. It is
        written by the server and is read-only, including to you.
      </p>
    </article>
  );
}

function Row({ label, value, note }) {
  return (
    <div className="posture-row">
      <dt>{label}</dt>
      <dd>
        <b>{value}</b>
        <span>{note}</span>
      </dd>
    </div>
  );
}
