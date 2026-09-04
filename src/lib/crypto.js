// Privacy vault
// -------------
// Entries marked private are encrypted here, in the browser, before they are
// sent anywhere. The key is derived from a passphrase the user types and lives
// only in memory for the length of the session.
//
// The server stores base64 ciphertext. It has no key and no derivation path, so
// "the server cannot read your private entries" is a property of the design,
// not a promise in a privacy policy.
//
// The honest trade: Gemini cannot read them either. Private entries get no
// summary and no mood reading. That is the point.

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const VERIFIER = 'vault-ok';

export async function deriveKey(passphrase, saltB64, iterations = 310000) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,                        // non-extractable: the key cannot be read back out
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(key, text) {
  // A fresh IV per message. Reusing one with AES-GCM is catastrophic.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptText(key, { iv, ct }) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct),
  );
  return dec.decode(plain);
}

// Lets us tell "wrong passphrase" from "corrupted data" without storing a hash
// of the passphrase anywhere.
export const makeVerifier = (key) => encryptText(key, VERIFIER);

export async function checkVerifier(key, verifier) {
  try {
    return (await decryptText(key, verifier)) === VERIFIER;
  } catch {
    return false;
  }
}
