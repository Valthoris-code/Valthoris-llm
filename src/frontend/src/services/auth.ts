import { AuthClient } from '@dfinity/auth-client';
import { II_DERIVATION_ORIGIN, INTERNET_IDENTITY_URL } from './canisterIds';

let authClient: AuthClient | null = null;

export async function getAuthClient(): Promise<AuthClient> {
  if (!authClient) {
    authClient = await AuthClient.create({
      idleOptions: {
        // Disable automatic idle logout — users control their own sessions
        disableIdle: true,
      },
    });
  }
  return authClient;
}

export async function login(): Promise<boolean> {
  const client = await getAuthClient();
  return new Promise((resolve, reject) => {
    client.login({
      identityProvider: INTERNET_IDENTITY_URL,
      // Keeps the derived principal identical on every origin this bundle is
      // served from, so a profile stored in the canisters is still found after
      // a logout/login cycle performed from a different URL.
      ...(II_DERIVATION_ORIGIN ? { derivationOrigin: II_DERIVATION_ORIGIN } : {}),
      maxTimeToLive:    BigInt(7 * 24 * 3600 * 1_000_000_000), // 7 days in ns
      onSuccess: () => resolve(true),
      // A failed or cancelled Internet Identity flow is a real failure: it is
      // reported to the caller instead of resolving as if nothing happened.
      onError:   (error) => reject(new Error(error ?? 'Internet Identity sign-in failed')),
    });
  });
}

export async function logout(): Promise<void> {
  const client = await getAuthClient();
  await client.logout();
  authClient = null;
}

export async function isAuthenticated(): Promise<boolean> {
  const client = await getAuthClient();
  return client.isAuthenticated();
}

export async function getIdentity() {
  const client = await getAuthClient();
  return client.getIdentity();
}
