import { useState } from 'react';
import { api } from '../lib/api.js';
import { deriveKey, makeVerifier, checkVerifier } from '../lib/crypto.js';

export default function VaultGate({ onUnlock }) {
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function unlock(e) {
    e.preventDefault();
    if (phrase.length < 8) {
      return setError('Use at least 8 characters. Longer is better than complicated.');
    }

    setBusy(true);
    setError(null);
    try {
      const cfg = await api.vaultConfig();
      const key = await deriveKey(phrase, cfg.salt, cfg.iterations);

      if (!cfg.initialised) {
        await api.setVerifier(await makeVerifier(key));
      } else if (!(await checkVerifier(key, cfg.verifier))) {
        setError('That passphrase does not open this vault.');
        return;
      }

      setPhrase('');
      onUnlock(key);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="vault-gate" onSubmit={unlock}>
      <span className="lock" aria-hidden="true" />
      <h2 className="entry-title">Your passphrase opens the vault</h2>
      <p className="prose">
        Private entries are encrypted on this device before they are sent. The
        passphrase never leaves your browser, so nobody at the other end can
        recover it for you. If you forget it, those entries stay closed.
      </p>
      <input
        type="password"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder="Passphrase"
        autoComplete="off"
      />
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Deriving key' : 'Open vault'}
      </button>
      {error && <p className="notice notice--bad">{error}</p>}
    </form>
  );
}
