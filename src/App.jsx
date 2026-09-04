import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from './lib/firebase.js';
import { api } from './lib/api.js';

import SignIn from './components/SignIn.jsx';
import Companion from './components/Companion.jsx';
import PrivateEntry from './components/PrivateEntry.jsx';
import Entries from './components/Entries.jsx';
import Patterns from './components/Patterns.jsx';
import Ledger from './components/Ledger.jsx';
import { useEntries } from './components/useEntries.js';

const VIEWS = [
  { id: 'write', label: 'Write' },
  { id: 'private', label: 'Private' },
  { id: 'entries', label: 'Entries' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'security', label: 'Security' },
];

export default function App() {
  const [user, setUser] = useState(undefined);
  const [view, setView] = useState('write');

  // The derived vault key. Held in memory only, dropped on lock and on sign-out.
  const [vaultKey, setVaultKey] = useState(null);

  const entries = useEntries(user?.uid);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setVaultKey(null);
        if (u) api.noteSignIn().catch(() => {});
      }),
    [],
  );

  if (user === undefined) {
    return <div className="boot">Opening your journal</div>;
  }

  if (!user) {
    return <SignIn onSignIn={() => signInWithPopup(auth, googleProvider)} />;
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="mark">
          <span className="mark-glyph" aria-hidden="true" />
          <span className="mark-name">Journal</span>
        </div>

        <nav className="nav">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`nav-item${view === v.id ? ' is-current' : ''}`}
              onClick={() => setView(v.id)}
              aria-current={view === v.id ? 'page' : undefined}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          {vaultKey && (
            <button className="unlock-chip" onClick={() => setVaultKey(null)}>
              Vault open. Lock it
            </button>
          )}
          <p className="who">{user.email}</p>
          <button className="quiet" onClick={() => signOut(auth)}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="page-well">
        {view === 'write' && <Companion />}
        {view === 'private' && (
          <PrivateEntry vaultKey={vaultKey} onUnlock={setVaultKey} />
        )}
        {view === 'entries' && (
          <Entries entries={entries} vaultKey={vaultKey} onUnlock={setVaultKey} />
        )}
        {view === 'patterns' && <Patterns entries={entries} />}
        {view === 'security' && <Ledger uid={user.uid} vaultOpen={!!vaultKey} />}
      </main>
    </div>
  );
}
