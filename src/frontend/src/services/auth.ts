import { AuthClient } from '@dfinity/auth-client';
import { INTERNET_IDENTITY_URL } from './canisterIds';

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
  return new Promise((resolve) => {
    client.login({
      identityProvider: INTERNET_IDENTITY_URL,
      maxTimeToLive:    BigInt(7 * 24 * 3600 * 1_000_000_000), // 7 days in ns
      onSuccess: () => resolve(true),
      onError:   () => resolve(false),
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
