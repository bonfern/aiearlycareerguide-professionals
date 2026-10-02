/** Read server-only Firebase credentials from Vercel environment variables. */
export function firebaseConfigured(env = process.env) {
  return Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim());
}

export function loadFirebaseServiceAccount(env = process.env) {
  const rawJson = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const rawBase64 = env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (!rawJson && !rawBase64) throw new Error('Firebase credentials are missing.');
  let account;
  try {
    account = JSON.parse(rawJson || Buffer.from(rawBase64, 'base64').toString('utf8'));
  } catch {
    throw new Error('Firebase credentials could not be parsed. Check the Vercel environment variable.');
  }
  if (!account || typeof account !== 'object' || !account.project_id || !account.client_email || !account.private_key) {
    throw new Error('Firebase credentials are incomplete. A full service-account JSON key is required.');
  }
  return account;
}
