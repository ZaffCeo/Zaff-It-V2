/**
 * Firebase Phone Auth bridge → Supabase session (ZAFF-IT dual-provider auth)
 *
 * Why: Supabase native SMS needs Twilio (+ India DLT paperwork). Firebase
 * Phone Auth works day-one without DLT (10 free SMS/day), then this module
 * exchanges the Firebase ID token for a REAL Supabase session via
 * `signInWithIdToken({ provider: 'firebase' })` — so auth.uid()/RLS on all
 * 26 tables keeps working unchanged.
 *
 * Setup (one-time, when the founder provides creds):
 *   1. Vercel env: EXPO_PUBLIC_FIREBASE_API_KEY, EXPO_PUBLIC_FIREBASE_PROJECT_ID
 *   2. Supabase Dashboard → Authentication → Third-Party Auth → Add Firebase
 *      → paste the Firebase Project ID (Supabase verifies Google-signed JWTs).
 *
 * Web-first: Firebase phone auth via dynamic import runs on the web preview
 * (reCAPTCHA invisible). Native builds keep the Twilio/demo path until
 * @react-native-firebase is wired in a native shell.
 */
import { Platform } from 'react-native';

// Firebase web config is a PUBLIC project identifier by design (auth security
// lives in Firebase rules + authorized domains), so committing it as a default
// is standard Firebase practice. Env vars still override when provided.
const FIREBASE_API_KEY =
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyABna0QcPXTpZguZbdMTsEk7zqZiRM1GsY';
const FIREBASE_PROJECT_ID =
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'zaff-it';

/** True only when creds exist AND we're on web (recaptcha requirement). */
export const FIREBASE_PHONE_ENABLED =
  Boolean(FIREBASE_API_KEY && FIREBASE_PROJECT_ID) && Platform.OS === 'web';

/** Human label of the active OTP channel for the login screen caption. */
export const activeOtpChannelLabel = (): string => {
  if (FIREBASE_PHONE_ENABLED) return 'Firebase SMS';
  if (Platform.OS === 'web') return 'Twilio SMS (demo fallback)';
  return 'Twilio SMS';
};

type FirebaseBundle = {
  auth: import('firebase/auth').Auth;
  signInWithPhoneNumber: typeof import('firebase/auth').signInWithPhoneNumber;
  RecaptchaVerifier: typeof import('firebase/auth').RecaptchaVerifier;
};

let bundle: FirebaseBundle | null = null;
let verifier: import('firebase/auth').RecaptchaVerifier | null = null;
let pendingConfirmation: import('firebase/auth').ConfirmationResult | null = null;

async function ensureBundle(): Promise<FirebaseBundle> {
  if (bundle) return bundle;
  const appMod = await import('firebase/app');
  const authMod = await import('firebase/auth');
  const app = appMod.getApps().length
    ? appMod.getApp()
    : appMod.initializeApp({
        apiKey: FIREBASE_API_KEY,
        projectId: FIREBASE_PROJECT_ID,
        authDomain: `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
      });
  const auth = authMod.getAuth(app);
  auth.languageCode = 'en';
  bundle = {
    auth,
    signInWithPhoneNumber: authMod.signInWithPhoneNumber,
    RecaptchaVerifier: authMod.RecaptchaVerifier,
  };
  return bundle;
}

/** Send SMS OTP via Firebase (invisible reCAPTCHA). Web only. */
export async function sendFirebaseOtp(phoneE164: string): Promise<void> {
  const b = await ensureBundle();
  if (!verifier) {
    // Hidden DOM node required by the reCAPTCHA widget.
    let node = document.getElementById('zaff-recaptcha');
    if (!node) {
      node = document.createElement('div');
      node.id = 'zaff-recaptcha';
      node.style.display = 'none';
      document.body.appendChild(node);
    }
    verifier = new b.RecaptchaVerifier(b.auth, node, { size: 'invisible' });
    await verifier.render();
  }
  pendingConfirmation = await b.signInWithPhoneNumber(b.auth, phoneE164, verifier);
}

/**
 * Confirm the OTP → returns the Firebase ID token for the Supabase exchange.
 * Throws Error('NO_PENDING_LOGIN') if send was never called.
 */
export async function confirmFirebaseOtp(
  code: string,
): Promise<{ idToken: string; uid: string; phone?: string }> {
  if (!pendingConfirmation) throw new Error('NO_PENDING_LOGIN');
  const cred = await pendingConfirmation.confirm(code);
  pendingConfirmation = null;
  const idToken = await cred.user.getIdToken();
  return { idToken, uid: cred.user.uid, phone: cred.user.phoneNumber ?? undefined };
}

/** Clear any half-finished Firebase flow (back-navigation / resend). */
export function resetFirebaseOtpFlow(): void {
  pendingConfirmation = null;
}
