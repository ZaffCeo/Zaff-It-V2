import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY_VALUE =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

/**
 * Expo SecureStore adapter for Supabase Auth session persistence.
 * Keeps JWTs encrypted at rest on Android Keystore / iOS Keychain.
 */
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // SecureStore can fail on simulators without keychain; fail gracefully
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore deletion errors
    }
  },
};

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY_VALUE,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export const SUPABASE_ANON_KEY = SUPABASE_ANON_KEY_VALUE;
export const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

export type FreshSession = {
  /** Valid access token: user JWT when a session exists (refreshed if near expiry), else the public anon key. */
  token: string;
  mode: 'user' | 'anon';
  /** True when the user WAS signed in but the refresh failed — caller should offer re-authentication. */
  needsReauth: boolean;
};

/**
 * Returns a guaranteed-fresh Supabase session token for edge-function calls.
 *
 * Root-cause fix for "Invalid or expired Supabase JWT": supabase-js
 * `getSession()` returns the PERSISTED token without refreshing it, so calls
 * made after the 1-hour access-token lifetime ship an expired bearer. This
 * helper refreshes proactively (expiry < 60s) and reports when the user must
 * re-authenticate instead of silently degrading.
 *
 * Falls back to the public anon key only for demo sessions (no user session
 * at all) — edge functions gate that behind ALLOW_ZAFFY_ANON separately.
 */
export async function ensureFreshSession(): Promise<FreshSession> {
  if (!isSupabaseConfigured()) {
    return { token: SUPABASE_ANON_KEY_VALUE, mode: 'anon', needsReauth: false };
  }
  let session = (await supabase.auth.getSession()).data.session;
  const expiresAtMs = (session?.expires_at ?? 0) * 1000;
  const needsRefresh = !session || expiresAtMs - Date.now() < 60_000;
  if (needsRefresh && session) {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session ?? session;
    } catch {
      // refresh failed — kept the stale session; needsReauth decided below
    }
  }
  if (session?.access_token) {
    const stillStale =
      ((session.expires_at ?? 0) * 1000) - Date.now() < 60_000 && needsRefresh;
    return { token: session.access_token, mode: 'user', needsReauth: stillStale };
  }
  // No session at all: genuine demo/anon mode (not a failed refresh of a user)
  return { token: SUPABASE_ANON_KEY_VALUE, mode: 'anon', needsReauth: false };
}

export function isSupabaseConfigured(): boolean {
  return (
    Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) &&
    !SUPABASE_URL.includes('your-project-ref') &&
    !SUPABASE_URL.includes('placeholder')
  );
}
