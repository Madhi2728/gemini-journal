import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Secrets are read from Google Cloud Secret Manager at runtime, server-side
// only, and cached for the lifetime of the process. Nothing is ever written to
// disk, logged, or returned to a client.
//
// The service account needs roles/secretmanager.secretAccessor on the NAMED
// secret only -- not project-wide, and never roles/owner.

const client = new SecretManagerServiceClient();
const cache = new Map();

export async function getSecret(name) {
  if (cache.has(name)) return cache.get(name);

  const project =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT;

  if (!project) throw new Error('secret_lookup_failed');

  const [version] = await client.accessSecretVersion({
    name: `projects/${project}/secrets/${name}/versions/latest`,
  });

  const value = version?.payload?.data?.toString().trim();
  // Fail closed. A missing secret must never fall back to a literal.
  if (!value) throw new Error('secret_lookup_failed');

  cache.set(name, value);
  return value;
}
