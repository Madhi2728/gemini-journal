import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { decryptText } from '../lib/crypto.js';
import VaultGate from './VaultGate.jsx';

const when = (ts) =>
  ts?.toDate
    ? ts.toDate().toLocaleDateString(undefined, {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : 'Just now';

function Sealed({ entry, vaultKey }) {
  const [plain, setPlain] = useState(null);
  const [heading, setHeading] = useState(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let live = true;
    if (!vaultKey) {
      setPlain(null);
      setHeading(null);
      return;
    }
    (async () => {
      try {
        const [b, t] = await Promise.all([
          decryptText(vaultKey, entry.cipher),
          decryptText(vaultKey, entry.cipherTitle),
        ]);
        if (live) { setPlain(b); setHeading(t); }
      } catch {
        if (live) setBroken(true);
      }
    })();
    return () => { live = false; };
  }, [vaultKey, entry]);

  if (broken) {
    return <p className="notice notice--bad">This entry will not open with the current key.</p>;
  }

  if (!plain) {
    // What the server sees. Shown verbatim rather than described.
    return (
      <>
        <h3 className="entry-title is-sealed">Sealed entry</h3>
        <p className="cipher">{entry.cipher.ct.slice(0, 220)}</p>
        <p className="hint">Open the vault to read this.</p>
      </>
    );
  }

  return (
    <>
      <h3 className="entry-title">{heading}</h3>
      <p className="prose prose--long">{plain}</p>
    </>
  );
}

export default function Entries({ entries, vaultKey, onUnlock }) {
  const [gate, setGate] = useState(false);
  const sealedCount = entries.filter((e) => e.kind === 'vault').length;

  if (gate && !vaultKey) {
    return (
      <article className="page page--locked">
        <VaultGate onUnlock={(k) => { onUnlock(k); setGate(false); }} />
      </article>
    );
  }

  if (entries.length === 0) {
    return (
      <article className="page">
        <div className="opener">
          <h2 className="opener-line">Nothing here yet</h2>
          <p className="opener-hint">
            Anything you write or talk through will collect here, newest first.
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="page">
      {sealedCount > 0 && !vaultKey && (
        <button className="unlock-banner" onClick={() => setGate(true)}>
          {sealedCount} sealed {sealedCount === 1 ? 'entry' : 'entries'}. Open the vault to read them.
        </button>
      )}

      <ol className="entry-list">
        {entries.map((e) => (
          <li
            key={e.id}
            className={`entry${e.kind === 'vault' ? ' entry--sealed' : ''}`}
          >
            <p className="entry-date">{when(e.createdAt)}</p>

            {e.kind === 'vault' ? (
              <Sealed entry={e} vaultKey={vaultKey} />
            ) : (
              <>
                <h3 className="entry-title">{e.title}</h3>
                <p className="prose prose--long">{e.summary}</p>
                {e.themes?.length > 0 && (
                  <ul className="themes">
                    {e.themes.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                )}
              </>
            )}

            <button className="quiet quiet--danger" onClick={() => api.remove(e.id)}>
              Delete
            </button>
          </li>
        ))}
      </ol>
    </article>
  );
}
