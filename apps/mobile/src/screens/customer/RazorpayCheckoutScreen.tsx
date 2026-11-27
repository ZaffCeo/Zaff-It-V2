import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BRAND_COLORS, TYPOGRAPHY, SPACING, RADII } from '@zaff-it/shared/tokens';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/useAppStore';
import { RAZORPAY_KEY_ID } from '@/services/razorpayCheckout';

type Props = NativeStackScreenProps<CustomerStackParamList, 'RazorpayCheckout'>;

/**
 * Android/iOS Razorpay Standard Checkout via WebView (checkout.js).
 *
 * Why WebView and not react-native-razorpay: the native SDK module pins older
 * React Native/new-arch assumptions; on Expo SDK 57 / RN 0.86 the WebView
 * approach uses Razorpay's official web SDK inside an in-app browser with a
 * postMessage bridge, no extra native SDK risk. Payment confirmation remains
 * SERVER-side (razorpay-webhook HMAC) — the WebView result is UX signal only,
 * identical to the web popup flow.
 *
 * UPI intent handling: some payment methods try to open external UPI apps via
 * intent:// URLs — we hand those to the OS from onShouldStartLoadWithRequest.
 */
export const RazorpayCheckoutScreen: React.FC<Props> = ({ navigation, route }) => {
  const {
    razorpayOrderId = '',
    amountPaise = 0,
    currency = 'INR',
    orderNumber = '',
    orderId = '',
  } = route.params ?? {};
  const clearCart = useAppStore((s) => s.clearCart);
  const [outcome, setOutcome] = useState<'pending' | 'failed' | 'dismissed'>('pending');
  const [failureText, setFailureText] = useState<string>('');
  const [reloadKey, setReloadKey] = useState(0);

  const html = useMemo(() => buildCheckoutHtml({ razorpayOrderId, amountPaise, currency, orderNumber }), [
    razorpayOrderId,
    amountPaise,
    currency,
    orderNumber,
  ]);

  const finishToTracking = () => {
    // Mirror CartCheckoutScreen's post-payment flow: clear the local basket and
    // land on order tracking. Webhook remains the payment source of truth.
    clearCart();
    if (orderId) navigation.navigate('OrderTracking', { orderId });
    else navigation.goBack();
  };

  const onMessage = (event: WebViewMessageEvent) => {
    let data: { type?: string; description?: string } = {};
    try {
      data = JSON.parse(String(event.nativeEvent.data));
    } catch {
      return;
    }
    if (data.type === 'success') {
      finishToTracking();
      return;
    }
    if (data.type === 'failed') {
      setOutcome('failed');
      setFailureText(data.description ?? '');
      return;
    }
    if (data.type === 'dismissed') {
      setOutcome('dismissed');
      return;
    }
  };

  const retry = () => {
    setOutcome('pending');
    setFailureText('');
    setReloadKey((k) => k + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Razorpay Secure Payment</Text>
          <Text style={styles.headerSub}>
            {orderNumber} · ₹{(amountPaise / 100).toFixed(2)}
          </Text>
        </View>
      </View>

      {outcome === 'pending' ? (
        <WebView
          key={reloadKey}
          source={{ baseUrl: 'https://checkout.razorpay.com', html }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(req) => {
            // Hand external app switches (UPI intents) to the OS.
            if (req.url.startsWith('intent://') || req.url.startsWith('upi://')) {
              void Linking.openURL(req.url).catch(() => undefined);
              return false;
            }
            return true;
          }}
          style={styles.webview}
        />
      ) : (
        <View style={styles.stateWrap}>
          <Ionicons
            name={outcome === 'failed' ? 'close-circle' : 'information-circle'}
            size={54}
            color={outcome === 'failed' ? '#FF6B6B' : BRAND_COLORS.goldenYellow}
          />
          <Text style={styles.stateTitle}>
            {outcome === 'failed' ? 'Payment failed' : 'Payment window closed'}
          </Text>
          <Text style={styles.stateSub}>
            {failureText ? `${failureText}. ` : ''}Order save ho gaya hai — payment baad me Orders se retry kar
            sakte ho. Confirmation server-side webhook se hota hai.
          </Text>
          <Pressable onPress={retry} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="Retry payment">
            <Text style={styles.retryText}>Dobara try karein</Text>
          </Pressable>
          <Pressable
            onPress={() => finishToTracking()}
            style={styles.laterBtn}
            accessibilityRole="button"
            accessibilityLabel="Go to order tracking"
          >
            <Text style={styles.laterText}>Order dekho</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
};

function buildCheckoutHtml(opts: {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  orderNumber: string;
}): string {
  const payload = JSON.stringify({
    key: RAZORPAY_KEY_ID,
    order_id: opts.razorpayOrderId,
    amount: opts.amountPaise,
    currency: opts.currency,
    name: 'ZAFF-IT',
    description: `Order ${opts.orderNumber}`,
    image: 'https://zaff-it.vercel.app/zaff-logo.png',
    theme: { color: '#FFC703' },
  });
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body{margin:0;padding:16px;background:#121416;color:#fff;font-family:sans-serif}</style>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
<div id="status">Payment window khul raha hai…</div>
<script>
  var payload = ${payload};
  var post = function (obj) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
  };
  try {
    var rzp = new Razorpay(payload);
    rzp.on('payment.failed', function (resp) {
      post({ type: 'failed', description: (resp.error && resp.error.description) || '' });
    });
    rzp.on('payment.dismissed', function () {
      post({ type: 'dismissed' });
    });
    rzp.open();
    document.getElementById('status').style.display = 'none';
  } catch (e) {
    post({ type: 'failed', description: 'Checkout failed to start: ' + e.message });
  }
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND_COLORS.charcoalBlack },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    gap: SPACING.xs,
    backgroundColor: BRAND_COLORS.charcoalBlack,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerCenter: { flex: 1, marginLeft: 2 },
  headerTitle: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '700', color: '#FFFFFF' },
  headerSub: { fontSize: TYPOGRAPHY.bodySm.fontSize, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  webview: { flex: 1, backgroundColor: BRAND_COLORS.charcoalBlack },
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  stateTitle: { fontSize: TYPOGRAPHY.headlineLg.fontSize, fontWeight: '800', color: '#FFFFFF' },
  stateSub: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
    marginTop: SPACING.sm,
  },
  retryText: { color: BRAND_COLORS.charcoalBlack, fontWeight: '800', fontSize: TYPOGRAPHY.bodyMd.fontSize },
  laterBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
  },
  laterText: { color: '#FFFFFF', fontWeight: '700', fontSize: TYPOGRAPHY.bodyMd.fontSize },
});
