import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

// The transcript is authoritative on the server. We keep a copy to render, but
// we only ever send the newest message -- the model's view of history comes
// from Firestore, not from this component's state.

export default function Companion() {
  const [sessionId, setSessionId] = useState(null);
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  async function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    setBusy(true);
    setError(null);
    setDraft('');
    setTurns((t) => [...t, { role: 'user', text }]);

    try {
      let id = sessionId;
      if (!id) {
        ({ sessionId: id } = await api.openSession());
        setSessionId(id);
      }
      const { reply } = await api.say(id, text);
      setTurns((t) => [...t, { role: 'model', text: reply }]);
    } catch (err) {
      setError(err.message);
      setDraft(text);
      setTurns((t) => t.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const entry = await api.closeSession(sessionId);
      setSaved(entry);
      setSessionId(null);
      setTurns([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <article className="page">
        <p className="page-eyebrow">Saved to your entries</p>
        <h2 className="entry-title">{saved.title}</h2>
        <p className="prose">{saved.summary}</p>
        {saved.themes?.length > 0 && (
          <ul className="themes">
            {saved.themes.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
        <button className="primary" onClick={() => setSaved(null)}>
          Start another
        </button>
      </article>
    );
  }

  return (
    <article className="page page--talk">
      {turns.length === 0 && !busy && (
        <div className="opener">
          <h2 className="opener-line">How was today?</h2>
          <p className="opener-hint">
            Write as much or as little as you like. When you are done, save the
            conversation and it becomes an entry.
          </p>
        </div>
      )}

      <div className="thread">
        {turns.map((t, i) => (
          <p key={i} className={t.role === 'user' ? 'said-mine' : 'said-theirs'}>
            {t.text}
          </p>
        ))}
        {busy && <p className="said-theirs is-thinking">Thinking</p>}
        <div ref={endRef} />
      </div>

      {error && <p className="notice notice--bad">{error}</p>}

      <form className="composer" onSubmit={send}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Start writing"
          maxLength={4000}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e);
          }}
        />
        <div className="composer-row">
          <button className="primary" type="submit" disabled={busy || !draft.trim()}>
            Send
          </button>
          {turns.length > 0 && (
            <button className="quiet" type="button" onClick={finish} disabled={busy}>
              Save and close
            </button>
          )}
        </div>
      </form>
    </article>
  );
}
