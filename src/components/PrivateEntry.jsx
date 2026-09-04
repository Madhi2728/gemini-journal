import { useState } from 'react';
import { api } from '../lib/api.js';
import { encryptText } from '../lib/crypto.js';
import VaultGate from './VaultGate.jsx';

export default function PrivateEntry({ vaultKey, onUnlock }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  if (!vaultKey) {
    return (
      <article className="page page--locked">
        <VaultGate onUnlock={onUnlock} />
      </article>
    );
  }

  async function save(e) {
    e.preventDefault();
    if (!body.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      const [cipher, cipherTitle] = await Promise.all([
        encryptText(vaultKey, body.trim()),
        encryptText(vaultKey, title.trim() || 'Private entry'),
      ]);

      await api.savePrivate({
        iv: cipher.iv,
        ct: cipher.ct,
        titleIv: cipherTitle.iv,
        titleCt: cipherTitle.ct,
      });

      setTitle('');
      setBody('');
      setDone(true);
      setTimeout(() => setDone(false), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="page page--locked">
      <form className="private-form" onSubmit={save}>
        <p className="page-eyebrow">Encrypted here, before it is sent</p>
        <input
          className="title-field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a name"
          maxLength={80}
        />
        <textarea
          className="body-field"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="This one stays between you and this device."
          rows={12}
          maxLength={20000}
        />
        <div className="composer-row">
          <button className="primary" type="submit" disabled={busy || !body.trim()}>
            {busy ? 'Encrypting' : 'Seal entry'}
          </button>
          <span className="hint">Not sent to the AI. No summary, no mood.</span>
        </div>
        {done && <p className="notice notice--good">Sealed. The server holds ciphertext only.</p>}
        {error && <p className="notice notice--bad">{error}</p>}
      </form>
    </article>
  );
}
