// Secret retrieval
// ---------------
// One interface, two backends, chosen by configuration rather than by editing
// code. Both satisfy the same rule: the key is read at runtime, server-side
// only, and never appears in the repository or the client bundle.
//
//   SECRET_PROVIDER=gcp   Google Cloud Secret Manager. Needs billing enabled
//                         on the project. Preferred when available.
//   SECRET_PROVIDER=env   The host's encrypted secret store, injected as an
//                         environment variable at boot (Render, Railway, Fly).
//
// Moving between them is a config change, not a rewrite. Nothing else in the
// codebase knows which one is in use.

const PROVIDER = process.env.SECRET_PROVIDER || 'env';
const cache = new Map();

// Maps logical secret names to the env var that carries them under the 'env'
// provider. Keeping this explicit stops anything from reading arbitrary
// environment variables by name at runtime.
const ENV_NAMES = {
  'gemini-api-key': 'GEMINI_API_KEY',
};

let smClient;

async function fromSecretManager(name) {
  if (!smClient) {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    smClient = new SecretManagerServiceClient();
  }

  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID;

  if (!project) throw new Error('secret_lookup_failed: no project id');

  const [version] = await smClient.accessSecretVersion({
    name: `projects/${project}/secrets/${name}/versions/latest`,
  });

  return version?.payload?.data?.toString().trim();
}

function fromEnvironment(name) {
  const varName = ENV_NAMES[name];
  if (!varName) throw new Error(`secret_lookup_failed: ${name} is not mapped`);
  return process.env[varName]?.trim();
}

export async function getSecret(name) {
  if (cache.has(name)) return cache.get(name);

  const value =
    PROVIDER === 'gcp' ? await fromSecretManager(name) : fromEnvironment(name);

  // Fail closed. A missing secret must never fall back to a literal, and must
  // never be logged on the way out.
  if (!value) throw new Error('secret_lookup_failed');

  cache.set(name, value);
  return value;
}

export const secretProvider =
  PROVIDER === 'gcp' ? 'Google Cloud Secret Manager' : 'Host secret store (encrypted at rest)';
