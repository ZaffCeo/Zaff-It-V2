/**
 * Request-It — Zaff-It custom/bulk product request (Stitch: request_it screens).
 *
 * Real flow: customer describes the item (bulk paani ki bottles, marble tools,
 * special kirana) → a support ticket (category 'request_it') is created and
 * the ops team procures it from the market. In demo mode (no backend) the
 * screen states clearly that nothing was submitted.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface RequestItScreenProps {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'RequestIt'>;
}

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'done'; ref: string; demo: boolean }
  | { phase: 'error'; message: string };

export const RequestItScreen: React.FC<RequestItScreenProps> = ({ navigation }) => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const userId = useAppStore((s) => s.userId);
  const zone = useAppStore((s) => s.zone);
  const dark = colorScheme === 'dark';
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;

  const [itemText, setItemText] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [areaText, setAreaText] = useState(zone.city);
  const [state, setState] = useState<SubmitState>({ phase: 'idle' });

  const canSubmit =
    itemText.trim().length >= 10 && state.phase !== 'submitting';

  const submit = async () => {
    if (!canSubmit) return;
    setState({ phase: 'submitting' });

    const subject = `Request-It: ${itemText.trim().slice(0, 80)}`;
    const description = [
      `Item: ${itemText.trim()}`,
      budgetText.trim() ? `Budget: ${budgetText.trim()}` : '',
      `Area: ${areaText.trim() || zone.city}`,
    ]
      .filter(Boolean)
      .join('\n');

    if (!isSupabaseConfigured() || userId === null) {
      // Demo mode — be honest: nothing is stored server-side.
      setTimeout(() => {
        setState({
          phase: 'done',
          ref: 'DEMO-REQUEST',
          demo: true,
        });
      }, 700);
      return;
    }

    const stamp = Date.now().toString(36).toUpperCase();
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        ticket_number: `TKT-REQ-${stamp}`,
        user_id: userId,
        category: 'request_it',
        subject,
        description,
        priority: 'normal',
      })
      .select('ticket_number')
      .single();

    if (error) {
      setState({ phase: 'error', message: error.message });
      return;
    }
    setState({
      phase: 'done',
      ref: data?.ticket_number ?? `TKT-REQ-${stamp}`,
      demo: false,
    });
  };

  if (state.phase === 'done') {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: surface.canvasLowest }]}
        edges={['top', 'left', 'right']}
      >
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons
              name={state.demo ? 'build-outline' : 'checkmark-circle'}
              size={54}
              color={state.demo ? BRAND_COLORS.goldenYellowPressed : BRAND_COLORS.electricGreen}
            />
          </View>
          <Text style={[styles.doneTitle, { color: surface.textPrimary }]}>
            {state.demo ? 'Demo mode — request save nahi hui' : 'Request mil gayi!'}
          </Text>
          <Text style={[styles.doneSub, { color: surface.textMuted }]}>
            {state.demo
              ? 'Backend abhi demo mode me hai — real store par request ticket submit hota.'
              : 'Hamari ops team market se item dhundh ke aapko price quote karegi. Notification milega jab quote taiyar ho.'}
          </Text>
          <View style={[styles.refChip, { backgroundColor: surface.surface1 }]}>
            <Text style={[styles.refLabel, { color: surface.textMuted }]}>REFERENCE</Text>
            <Text style={[styles.refValue, { color: surface.textPrimary }]}>{state.ref}</Text>
          </View>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.doneBtn,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <LinearGradient
              colors={['#FFD34D', '#FFC703']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.doneBtnGradient}
            >
              <Text style={styles.doneBtnText}>Shopping wapas jari rakhein</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.canvasLowest }]}
      edges={['top', 'left', 'right']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
        </Pressable>
        <View>
          <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
            Request-It
          </Text>
          <Text style={[styles.headerSub, { color: surface.textMuted }]}>
            Custom order · bulk · marble tools · special kirana
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>SPECIAL</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero strip */}
          <LinearGradient
            colors={['#121316', '#242018']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Ionicons name="sparkles" size={20} color={BRAND_COLORS.goldenYellow} />
            <Text style={styles.heroText}>
              Jo list me nahi mila, wo bhi milega — hum Makrana market se
              direct laakar denge.
            </Text>
          </LinearGradient>

          {/* Item */}
          <Text style={[styles.fieldLabel, { color: surface.textPrimary }]}>
            Kya mangwana hai? *
          </Text>
          <TextInput
            value={itemText}
            onChangeText={setItemText}
            multiline
            numberOfLines={4}
            placeholder="e.g. 50 paani ki bottles (1L), shaadi ke liye — ya marble cutting blade 14 inch"
            placeholderTextColor={surface.textMuted}
            style={[
              styles.input,
              styles.itemInput,
              { backgroundColor: surface.surface1, borderColor: surface.border, color: surface.textPrimary },
            ]}
          />
          {itemText.trim().length > 0 && itemText.trim().length < 10 ? (
            <Text style={[styles.fieldHintError, { color: STATUS_COLORS.error }]}>
              Thoda detail me likho (kam se kam 10 characters)
            </Text>
          ) : null}

          {/* Budget */}
          <Text style={[styles.fieldLabel, { color: surface.textPrimary }]}>
            Approx budget (optional)
          </Text>
          <TextInput
            value={budgetText}
            onChangeText={setBudgetText}
            keyboardType="numbers-and-punctuation"
            placeholder="e.g. ₹500-800"
            placeholderTextColor={surface.textMuted}
            style={[
              styles.input,
              { backgroundColor: surface.surface1, borderColor: surface.border, color: surface.textPrimary },
            ]}
          />

          {/* Area */}
          <Text style={[styles.fieldLabel, { color: surface.textPrimary }]}>
            Delivery area
          </Text>
          <TextInput
            value={areaText}
            onChangeText={setAreaText}
            placeholder="Makrana"
            placeholderTextColor={surface.textMuted}
            style={[
              styles.input,
              { backgroundColor: surface.surface1, borderColor: surface.border, color: surface.textPrimary },
            ]}
          />

          {state.phase === 'error' ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={15} color={STATUS_COLORS.error} />
              <Text style={[styles.errorText, { color: STATUS_COLORS.error }]}>
                {state.message}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Submit request"
            style={({ pressed }) => [
              styles.submitBtn,
              { opacity: !canSubmit ? 0.5 : pressed ? 0.9 : 1 },
            ]}
          >
            <LinearGradient
              colors={['#FFD34D', '#FFC703']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitGradient}
            >
              {state.phase === 'submitting' ? (
                <Text style={styles.submitText}>Submit ho raha hai…</Text>
              ) : (
                <>
                  <Ionicons name="send" size={16} color={BRAND_COLORS.charcoalBlack} />
                  <Text style={styles.submitText}>Request Bhejo</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <Text style={[styles.footNote, { color: surface.textMuted }]}>
            Ops team 1 working day me quote degi · quote pasand aaye to hi order
            banega · koi advance nahi.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '900' },
  headerSub: { fontSize: 11, marginTop: 1 },
  headerBadge: {
    marginLeft: 'auto',
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  headerBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: BRAND_COLORS.charcoalBlack,
    letterSpacing: 0.6,
  },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  heroText: {
    flex: 1,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: TYPOGRAPHY.bodyMd.lineHeight,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '800',
    marginBottom: 6,
    marginTop: SPACING.md,
  },
  fieldHintError: { fontSize: 11, marginTop: 5, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  itemInput: { minHeight: 104, textAlignVertical: 'top' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.md,
  },
  errorText: { flex: 1, fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '700' },
  submitBtn: { marginTop: SPACING.lg },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
  },
  submitText: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '900',
    color: BRAND_COLORS.charcoalBlack,
  },
  footNote: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    lineHeight: TYPOGRAPHY.bodySm.lineHeight,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  doneIcon: { marginBottom: SPACING.md },
  doneTitle: { fontSize: TYPOGRAPHY.headlineLg.fontSize, fontWeight: '900', textAlign: 'center' },
  doneSub: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: TYPOGRAPHY.bodyMd.lineHeight,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  refChip: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
    marginTop: SPACING.lg,
  },
  refLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  refValue: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '900', marginTop: 3 },
  doneBtn: { alignSelf: 'stretch', marginTop: SPACING.lg },
  doneBtnGradient: {
    alignItems: 'center',
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
  },
  doneBtnText: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '900',
    color: BRAND_COLORS.charcoalBlack,
  },
});

export default RequestItScreen;
