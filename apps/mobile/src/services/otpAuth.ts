/**
 * OTP auth channels — Twilio/Firebase REMOVED (founder decision 2026-11-28):
 * Supabase auth stays the only real provider. Until an Indian SMS gateway
 * (MSG91 / DLT-ready provider) is wired into Supabase Auth → Phone, the app
 * ships a DEMO OTP mode: the 6-digit code is generated locally and shown on
 * the login screen (nothing is sent over SMS). Flip EXPO_PUBLIC_DEMO_OTP=false
 * after the gateway is configured — then signInWithOtp/verifyOtp('sms') go live.
 */
import { Platform } from 'react-native';

/** Demo OTP stays ON until the Indian gateway lands (env can force it off). */
export const DEMO_OTP_ENABLED = process.env.EXPO_PUBLIC_DEMO_OTP !== 'false';

/** Human label of the active OTP channel for the login screen caption. */
export const activeOtpChannelLabel = (): string => {
  if (DEMO_OTP_ENABLED) return 'Demo OTP';
  return Platform.OS === 'web' ? 'Supabase SMS' : 'Supabase SMS';
};

/** 6-digit numeric OTP for the demo flow (cryptographically random). */
export const generateDemoOtp = (): string => {
  const buf = new Uint32Array(6);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
    return Array.from(buf, (n) => n % 10).join('');
  }
  return String(Math.floor(100000 + Math.random() * 900000));
};
