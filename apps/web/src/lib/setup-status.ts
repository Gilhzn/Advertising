/**
 * Deployment self-diagnosis for the setup screen.
 *
 * Reports which environment variables a fresh deployment is still missing, by NAME ONLY - no value,
 * prefix or length of a configured variable is ever returned, so rendering this list never discloses
 * a secret. It is only shown while no sign-in provider exists (see `app/login/page.tsx`), i.e. while
 * the app cannot be used by anyone anyway.
 */

export interface SetupItem {
  /** The variable (or group of variables) to set. */
  name: string;
  /** What breaks while it is missing. */
  detail: string;
}

/** A 32-byte key, hex encoded - the format `encryptSecret` in `@adv/shared` requires. */
const TOKEN_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

function isSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/**
 * Required configuration that is still missing. An empty array means the deployment is ready
 * (aside from the optional per-platform credentials, which the setup wizard reports per platform).
 */
export function missingRequiredEnv(): SetupItem[] {
  const missing: SetupItem[] = [];

  if (!isSet("AUTH_SECRET")) {
    missing.push({
      name: "AUTH_SECRET",
      detail: "Signs session cookies. Any long random string: openssl rand -base64 32",
    });
  }

  if (!isSet("DATABASE_URL")) {
    missing.push({
      name: "DATABASE_URL",
      detail: "Postgres connection string. On Vercel: Storage -> create a Neon database and connect it.",
    });
  }

  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!tokenKey) {
    missing.push({
      name: "TOKEN_ENCRYPTION_KEY",
      detail: "Encrypts stored platform tokens. 64 hex characters: openssl rand -hex 32",
    });
  } else if (!TOKEN_KEY_PATTERN.test(tokenKey)) {
    missing.push({
      name: "TOKEN_ENCRYPTION_KEY",
      detail: "Must be exactly 64 hex characters: openssl rand -hex 32",
    });
  }

  if (!isSet("APP_URL")) {
    missing.push({
      name: "APP_URL",
      detail: "This deployment's public URL. Needed for the platform OAuth redirect URIs.",
    });
  }

  const hasBlob = isSet("BLOB_READ_WRITE_TOKEN");
  const hasR2 = isSet("R2_ACCOUNT_ID") && isSet("R2_ACCESS_KEY_ID") && isSet("R2_SECRET_ACCESS_KEY");
  if (!hasBlob && !hasR2) {
    missing.push({
      name: "BLOB_READ_WRITE_TOKEN (or the R2_* set)",
      detail: "Stores uploaded logos and generated post images. On Vercel: Storage -> connect Blob.",
    });
  }

  return missing;
}
