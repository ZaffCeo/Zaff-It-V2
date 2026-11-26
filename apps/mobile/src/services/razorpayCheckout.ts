/**
 * Razorpay Checkout (web popup) loader.
 *
 * Web-only: injects checkout.razorpay.com/v1/checkout.js once and opens the
 * standard Razorpay popup. Native (Android/iOS) will use react-native-razorpay
 * during the EAS build phase; callers should gate on Platform.OS === 'web'.
 *
 * The key id is a PUBLIC identifier (safe in the client). Test-mode default is
 * `rzp_test_…` — set EXPO_PUBLIC_RAZORPAY_KEY_ID for the live key at launch.
 *
 * Payment confirmation is server-side: the razorpay-webhook edge function
 * verifies the HMAC signature and flips payments.status='captured'. The popup
 * result alone is treated as UX signal, never as payment proof.
 */

export const RAZORPAY_KEY_ID =
  process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? 'rzp_test_U4wgGfEVOXrjH5';

const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

type RazorpayHandlerResponse = {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  error?: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
  };
};

type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: RazorpayHandlerResponse) => void) => void };

type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Razorpay checkout is web-only'));
  }
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Razorpay checkout.js'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type RazorpayCheckoutInput = {
  /** PUBLIC key id (rzp_test_… / rzp_live_…). */
  keyId?: string;
  /** Razorpay order id returned by checkout-create-order. */
  razorpayOrderId: string;
  amountPaise: number;
  currency?: string;
  orderNumber?: string;
  prefillName?: string;
  prefillPhone?: string;
  prefillEmail?: string;
  themeColor?: string;
};

export type RazorpayCheckoutResult =
  | { outcome: 'success'; paymentId?: string }
  | { outcome: 'failed'; description?: string }
  | { outcome: 'dismissed' };

export async function openRazorpayCheckout(
  input: RazorpayCheckoutInput,
): Promise<RazorpayCheckoutResult> {
  await loadCheckoutScript();
  const Ctor = window.Razorpay;
  if (!Ctor) throw new Error('Razorpay checkout unavailable');

  return new Promise<RazorpayCheckoutResult>((resolve) => {
    let settled = false;
    const finish = (result: RazorpayCheckoutResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const rzp = new Ctor({
      key: input.keyId ?? RAZORPAY_KEY_ID,
      order_id: input.razorpayOrderId,
      amount: input.amountPaise,
      currency: input.currency ?? 'INR',
      name: 'Zaff-It',
      description: input.orderNumber ? `Order ${input.orderNumber}` : 'Hyperlocal order',
      image: 'https://zaff-it-farzand-alis-projects.vercel.app/assets/icon.png',
      prefill: {
        name: input.prefillName,
        contact: input.prefillPhone,
        email: input.prefillEmail,
      },
      notes: input.orderNumber ? { order_number: input.orderNumber } : undefined,
      theme: { color: input.themeColor ?? '#FFC703' },
      modal: { confirm_close: true },
    });

    rzp.on('payment.success', (resp: RazorpayHandlerResponse) => {
      finish({ outcome: 'success', paymentId: resp.razorpay_payment_id });
    });
    rzp.on('payment.error', (resp: RazorpayHandlerResponse) => {
      finish({ outcome: 'failed', description: resp.error?.description });
    });
    rzp.on('payment.dismiss', () => {
      finish({ outcome: 'dismissed' });
    });

    rzp.open();
  });
}
