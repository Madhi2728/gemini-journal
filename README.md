# Personal Gemini Journal

A journal you can talk to, built so that the privacy claims are properties of
the architecture rather than promises in a policy.

Phase 1 of this project is the AI Studio configuration in
`phase1-ai-studio-constitution.md`. Everything here was built under it.

---

## What it does

Sign in, talk something through with Gemini, and the conversation is summarised
into an entry. Or write privately, in which case the text is encrypted in your
browser before it goes anywhere and the AI never sees it.

Three things go past the base spec:

**Privacy vault.** Entries marked private are encrypted client-side with
AES-GCM under a key derived from your passphrase via PBKDF2. The server receives
base64 ciphertext and holds no key. Locked entries render their actual
ciphertext in the UI, so the claim is visible rather than asserted. The honest
cost: Gemini cannot read them either, so they get no summary and no mood.

**Security dashboard.** A per-user, server-written audit trail plus a live
posture summary — where the API key comes from, which identity the server
resolved, how much of your AI quota is left, whether the vault is open. It logs
that something happened, never what you wrote.

**Mood timeline.** Each summarised session is scored -1 to 1 with up to four
themes, drawn as an ink line across the page. Sealed entries are excluded and
counted separately, because a silent gap would misrepresent the data.

---

## Architecture

```
Browser (React + Vite)          Cloud Functions (Express)      Google Cloud
─────────────────────           ─────────────────────────      ────────────
Firebase Auth ──── ID token ──▶ verifyIdToken()
                                      │
WebCrypto (vault key,                 ├── getSecret() ───────▶ Secret Manager
never leaves the device)              │                        (gemini-api-key)
                                      ├── rate limit (txn)
Firestore reads ◀───────────────┐     └── generateContent() ─▶ Gemini API
(own subtree only, read-only)   └──── Admin SDK writes ──────▶ Firestore
```

The browser never calls Gemini and never writes to Firestore. It reads its own
subtree and posts to the API. That is the whole trust boundary.

### Why the backend exists

Secret Manager is not reachable from a browser, and a key shipped in client
JavaScript is a public key. Any design that satisfies "never hardcoded" honestly
needs a server-side hop. This one is a single Express app behind one function.

### Controls, and where to find them

| Control | File |
| --- | --- |
| Key from Secret Manager, cached, fails closed | `functions/lib/secrets.js` |
| Identity from verified ID token only | `functions/lib/auth.js` |
| Ownership re-checked in app code | `functions/index.js` |
| Per-user AI quota, transactional | `functions/lib/ratelimit.js` |
| Prompt injection delimiting | `functions/lib/gemini.js` |
| Model output validated and clamped | `functions/lib/gemini.js` |
| Default-deny rules, no client writes | `firestore.rules` |
| Audit log with a field allowlist | `functions/lib/audit.js` |
| Client-side encryption | `src/lib/crypto.js` |
| CSP and security headers | `firebase.json` |

Rules are the second line of defence, not the only one. The Admin SDK bypasses
them by design, so every route re-checks ownership itself.

---

## Setup

**1. Firebase project.** Create one, then enable Authentication (Google
provider), Firestore, and upgrade to Blaze — Cloud Functions requires it.

**2. Store the Gemini key.** Get a key from AI Studio, then:

```bash
gcloud services enable secretmanager.googleapis.com
printf '%s' 'YOUR_KEY' | gcloud secrets create gemini-api-key --data-file=-
```

Grant the runtime service account access to that secret and nothing else:

```bash
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**3. Configure the client.** Copy `.env.example` to `.env` and fill in the
Firebase web config from Project settings. These values are public by design;
the Gemini key is not among them and never will be.

**4. Set the allowed origin** for the backend:

```bash
firebase functions:config:unset 2>/dev/null
# set ALLOWED_ORIGINS in functions/.env, e.g.
echo "ALLOWED_ORIGINS=https://YOUR_PROJECT.web.app" > functions/.env
```

**5. Install and deploy.**

```bash
npm install
cd functions && npm install && cd ..
firebase deploy
```

For local work: `npm run dev` alongside `firebase emulators:start`, and point
`VITE_API_BASE` at the emulator URL.

---

## Model version

The model name is a single constant in `functions/lib/gemini.js`, overridable
with the `GEMINI_MODEL` environment variable. Google retires model aliases
quickly — check the current list at ai.google.dev/gemini-api/docs/models before
demoing, and change that one line if needed.

---

## Verifying the claims

Two checks worth running in front of a judge:

```bash
npm run build
grep -rE "AIzaSy|secretmanager|gemini-api-key" dist/   # returns nothing
```

Then open the Security tab in the app, write a private entry, and look at it in
the Firestore console. The stored document contains an IV and a base64 blob.
There is no key anywhere in the project that opens it.

---

## Known limits

Worth saying out loud rather than being caught on:

- Forgetting the vault passphrase means those entries are gone. That is the
  design, not a bug, but there is no recovery path.
- The rate limiter is per-user and Firestore-backed, so it costs a read and a
  write per AI call. Fine at this scale, not what you would ship at millions.
- Conversation history lives in a single document array, which caps a session
  at Firestore's 1 MiB document limit. A subcollection would be the fix.
- Deleting an entry does not scrub it from Firestore backups.
