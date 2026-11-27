import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import { BRAND_COLORS, RADII, TYPOGRAPHY } from '@zaff-it/shared/tokens';
import { isSupabaseConfigured, supabase } from '@/services/supabase';

type ZaffIdPayload = {
  exists: boolean;
  identity?: {
    id: string;
    public_id: string;
    status: string;
    created_at: string;
    deactivated_at: string | null;
  };
  connected_apps?: Array<{
    app_key: string;
    display_name: string;
    state: 'connected' | 'coming_soon';
    requires_zaffid: boolean;
  }>;
  event_count?: number;
};

/**
 * ZaffID — One ID. Every Zaff. (Phase 1: Zaff-It only)
 * Identity rides the existing Zaff-It account (Supabase Auth). Optional, never forced.
 * Connected-apps list is honest: only shipped integrations say "Connected".
 */
export const ZaffIdScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();

  const [payload, setPayload] = useState<ZaffIdPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setNotice('Demo mode — live identity load nahi hoga');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('my_zaffid');
      if (error || !data) {
        setNotice(error?.message ?? 'Identity load nahi hua');
      } else {
        setPayload(data as unknown as ZaffIdPayload);
        setNotice(null);
      }
    } catch {
      setNotice('Identity load nahi hua');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const { error } = await supabase.rpc('get_or_create_my_zaffid');
      if (error) {
        setNotice(error.message);
      } else {
        await load();
      }
    } catch {
      setNotice('Creation nahi hua — dobara try karo');
    } finally {
      setCreating(false);
    }
  }, [creating, load]);

  const handleToggleActive = useCallback(async () => {
    const active = payload?.identity?.status === 'active';
    try {
      const { error } = await supabase.rpc('set_my_zaffid_status', {
        p_reactivate: !active,
      });
      if (error) {
        setNotice(error.message);
      } else {
        await load();
      }
    } catch {
      setNotice('Status update nahi hua');
    }
  }, [payload, load]);

  const handleCopy = useCallback(async () => {
    const pid = payload?.identity?.public_id;
    if (!pid) return;
    await Clipboard.setStringAsync(pid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [payload]);

  const identity = payload?.identity;
  const apps = payload?.connected_apps ?? [];

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: BRAND_COLORS.charcoalBlack }]}
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={BRAND_COLORS.goldenYellow} />
          </Pressable>
          <Text style={styles.headerTitle}>
            ZaffID
            <Text style={{ color: BRAND_COLORS.goldenYellow }}> · One ID. Every Zaff.</Text>
          </Text>
        </View>

        {loading ? (
          <Text style={styles.bodyMuted}>…</Text>
        ) : (
          <>
            {/* Identity card */}
            <View
              style={[
                styles.idCard,
                { borderColor: BRAND_COLORS.goldenYellow },
              ]}
            >
              <View style={styles.idCardTopRow}>
                <Text style={styles.idCardBrand}>ZAFFID</Text>
                {identity ? (
                  <View
                    style={[
                      styles.statusChip,
                      {
                        backgroundColor:
                          identity.status === 'active'
                            ? 'rgba(30,215,96,0.16)'
                            : 'rgba(138,148,166,0.18)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        { color: identity.status === 'active' ? BRAND_COLORS.electricGreen : '#8A94A6' },
                      ]}
                    >
                      {identity.status === 'active' ? 'ACTIVE' : 'DEACTIVATED'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.idCardTagline}>One ID. Every Zaff.</Text>
              <Text style={styles.idCardBody}>
                {identity
                  ? 'Ye aapka permanent universal Zaff identity hai — future Zaff products isi se connect honge.'
                  : 'Create your universal Zaff identity and connect with future Zaff products using one account.'}
              </Text>

              {identity ? (
                <>
                  <View style={[styles.pidRow, { borderColor: 'rgba(255,199,3,0.45)' }]}>
                    <Text style={styles.pidText}>{identity.public_id}</Text>
                    <Pressable
                      onPress={handleCopy}
                      style={styles.copyBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Copy ZaffID"
                    >
                      <Ionicons
                        name={copied ? 'checkmark' : 'copy-outline'}
                        size={16}
                        color={BRAND_COLORS.charcoalBlack}
                      />
                      <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy ID'}</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.idCardMeta}>
                    Member since {new Date(identity.created_at).toLocaleDateString('en-IN')} · Free · One-time setup
                  </Text>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={handleCreate}
                    disabled={creating}
                    style={[styles.createBtn, { opacity: creating ? 0.6 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Create Your ZaffID"
                  >
                    <Ionicons name="id-card" size={18} color={BRAND_COLORS.charcoalBlack} />
                    <Text style={styles.createBtnText}>
                      {creating ? 'Creating…' : 'Create Your ZaffID'}
                    </Text>
                  </Pressable>
                  <Text style={styles.idCardMeta}>Free · One-time setup</Text>
                </>
              )}
            </View>

            {notice !== null ? <Text style={styles.notice}>{notice}</Text> : null}

            {/* Connected applications (State C) — honest states only */}
            {identity ? (
              <View style={[styles.sectionCard, { borderColor: 'rgba(255,199,3,0.22)' }]}>
                <Text style={styles.sectionTitle}>Connected Applications</Text>
                {apps.map((a) => (
                  <View key={a.app_key} style={styles.appRow}>
                    <View style={styles.appIconWrap}>
                      <Ionicons
                        name={
                          a.app_key === 'zaff_it'
                            ? 'flash'
                            : a.app_key === 'zaff_ads'
                              ? 'megaphone'
                              : a.app_key === 'zaff_mail'
                                ? 'mail-outline'
                                : a.app_key === 'zaff_surf'
                                  ? 'globe-outline'
                                  : 'map-outline'
                        }
                        size={16}
                        color={a.state === 'connected' ? BRAND_COLORS.goldenYellow : '#8A94A6'}
                      />
                    </View>
                    <Text style={styles.appName}>{a.display_name}</Text>
                    <Text
                      style={[
                        styles.appState,
                        { color: a.state === 'connected' ? BRAND_COLORS.electricGreen : '#8A94A6' },
                      ]}
                    >
                      {a.state === 'connected' ? '✓ Connected' : 'Coming Soon'}
                    </Text>
                  </View>
                ))}
                <Text style={styles.sectionFootnote}>
                  "Connected" sirf tab jab tak integration actually live hai — future products launch
                  hone par apne aap connect honge.
                </Text>
              </View>
            ) : null}

            {/* Identity settings */}
            {identity ? (
              <Pressable
                onPress={handleToggleActive}
                style={[styles.settingsRow, { borderColor: 'rgba(255,255,255,0.10)' }]}
                accessibilityRole="button"
                accessibilityLabel={identity.status === 'active' ? 'Deactivate ZaffID' : 'Reactivate ZaffID'}
              >
                <Ionicons
                  name={identity.status === 'active' ? 'power' : 'refresh-outline'}
                  size={16}
                  color="#FF5A5F"
                />
                <Text style={[styles.settingsText, { color: '#FF5A5F' }]}>
                  {identity.status === 'active' ? 'Deactivate ZaffID' : 'Reactivate ZaffID'}
                </Text>
              </Pressable>
            ) : null}

            <Text style={styles.privacyFoot}>
              ZaffID aapka phone number ya private data expose nahi karta. Public ID se koi login nahi
              hota — ye sirf ek permanent identity label hai.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '900', color: '#F8F9FA' },
  bodyMuted: { color: '#8A94A6', fontSize: TYPOGRAPHY.bodyMd.fontSize },
  idCard: {
    borderWidth: 1.5,
    borderRadius: RADII.xl,
    padding: 18,
    backgroundColor: 'rgba(255,199,3,0.06)',
    gap: 8,
  },
  idCardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  idCardBrand: {
    fontSize: TYPOGRAPHY.headlineLg.fontSize,
    fontWeight: '900',
    color: BRAND_COLORS.goldenYellow,
    letterSpacing: 2,
  },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusChipText: { fontSize: 10, fontWeight: '900' },
  idCardTagline: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', color: '#F8F9FA' },
  idCardBody: { fontSize: TYPOGRAPHY.bodySm.fontSize, color: '#B7BFCC', lineHeight: 19 },
  pidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  pidText: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '900',
    color: BRAND_COLORS.goldenYellow,
    letterSpacing: 1.5,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_COLORS.goldenYellow,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADII.sm,
  },
  copyBtnText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  idCardMeta: { fontSize: 11, color: '#8A94A6', fontWeight: '700' },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BRAND_COLORS.goldenYellow,
    paddingVertical: 14,
    borderRadius: RADII.md,
    marginTop: 4,
  },
  createBtnText: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  notice: { fontSize: TYPOGRAPHY.bodySm.fontSize, color: BRAND_COLORS.goldenYellow },
  sectionCard: { borderWidth: 1, borderRadius: RADII.lg, padding: 14, gap: 10 },
  sectionTitle: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', color: '#F8F9FA' },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { flex: 1, fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '700', color: '#F8F9FA' },
  appState: { fontSize: 11, fontWeight: '900' },
  sectionFootnote: { fontSize: 10, color: '#8A94A6', lineHeight: 14 },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: 12,
  },
  settingsText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900' },
  privacyFoot: { fontSize: 10, color: '#8A94A6', lineHeight: 14, textAlign: 'center' },
});
