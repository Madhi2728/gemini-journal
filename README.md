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
| Key from Secret Manager, cached, fails closed | `server/lib/secrets.js` |
| Identity from verified ID token only | `server/lib/auth.js` |
| Ownership re-checked in app code | `server/index.js` |
| Per-user AI quota, transactional | `server/lib/ratelimit.js` |
| Prompt injection delimiting | `server/lib/gemini.js` |
| Model output validated and clamped | `server/lib/gemini.js` |
| Default-deny rules, no client writes | `firestore.rules` |
| Audit log with a field allowlist | `server/lib/audit.js` |
| Client-side encryption | `src/lib/crypto.js` |
| CSP and security headers | `firebase.json` |

Rules are the second line of defence, not the only one. The Admin SDK bypasses
them by design, so every route re-checks ownership itself.

---

## Setup

No card required. Firestore, Auth and Hosting run on Firebase's free Spark
plan; the API runs on Render's free tier.

**1. Firebase project.** Create one at console.firebase.google.com. Stay on
Spark. Enable Authentication with the Google provider, and create a Firestore
database in production mode.

**2. Service account.** Project settings -> Service accounts -> Generate new
private key. Base64 it, because Render environment variables are single-line:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("serviceAccount.json")) | Set-Clipboard
```

Delete the JSON file afterwards. It is a real credential and `.gitignore`
covers `*-key.json`, not every name it might have.

**3. Deploy the API to Render.** New -> Web Service, connect this repo, and
Render reads `render.yaml`. Set four values under Environment:

| Variable | Value |
| --- | --- |
| `GEMINI_API_KEY` | your AI Studio key |
| `FIREBASE_SERVICE_ACCOUNT` | the base64 blob from step 2 |
| `ALLOWED_ORIGINS` | `https://YOUR_PROJECT.web.app` |
| `SECRET_PROVIDER` | `env` |

**4. Point the client at it.** Copy `.env.example` to `.env`, fill in the
Firebase web config from Project settings, and set `VITE_API_BASE` to your
Render URL with `/api` on the end.

**5. Deploy the client.**

```bash
npm install
npm run build
firebase deploy --only hosting,firestore:rules
```

Local development: `npm run dev` for the client, and `npm start` in `server/`
with a `.env` based on `server/.env.example`.

### Switching to Secret Manager

Secret Manager needs billing enabled on the Google Cloud project, which is why
it is not the default here. The code supports it already. If you enable billing:

```bash
gcloud services enable secretmanager.googleapis.com
printf '%s' 'YOUR_KEY' | gcloud secrets create gemini-api-key --data-file=-
```

Then set `SECRET_PROVIDER=gcp` and drop `GEMINI_API_KEY`. Nothing else changes,
and the security dashboard reports the new provider on its own.

Both paths hold the same property: the key is read at runtime, server-side
only, and never reaches the repository or the browser. Only the store differs.

### One thing about the free tier

Render free instances sleep after about 15 minutes idle, and the next request
takes roughly a minute to wake them. Hit `/healthz` a couple of minutes before
demoing, or the first judge to click sign-in will watch a spinner.

## Model version

The model name is a single constant in `server/lib/gemini.js`, overridable
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
