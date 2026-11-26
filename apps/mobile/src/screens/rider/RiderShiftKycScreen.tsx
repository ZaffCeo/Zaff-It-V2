import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';

export type KycLoadState = 'ready' | 'loading' | 'empty' | 'error';
export type DocVerifyStatus = 'verified' | 'pending' | 'rejected';

export interface RiderKycProfile {
  riderId: string;
  riderName: string;
  vehicleNumber: string;
  zoneName: string;
  documents: {
    id: string;
    label: string;
    detail: string;
    status: DocVerifyStatus;
  }[];
  shiftSelfieVerified: boolean;
  shiftSelfieTimestamp: string | null;
  isOnline: boolean;
}

export interface RiderShiftKycScreenProps {
  initialState?: KycLoadState;
  initialProfile?: RiderKycProfile;
  onCaptureSelfie?: () => Promise<{ verified: boolean; timestamp: string }> | void;
  onGoOnline?: () => Promise<void> | void;
  onRefresh?: () => Promise<RiderKycProfile | void> | void;
}

const DEFAULT_PROFILE: RiderKycProfile = {
  riderId: 'rdr_mkr_014',
  riderName: 'Imran Ansari',
  vehicleNumber: 'RJ-21-SB-4821',
  zoneName: 'Makrana Central Zone',
  documents: [
    { id: 'dl', label: 'Driving License (DL)', detail: 'Valid till Oct 2031', status: 'verified' },
    { id: 'rc', label: 'Vehicle RC', detail: 'RJ-21-SB-4821 · Verified', status: 'verified' },
    { id: 'id', label: 'Aadhaar e-KYC', detail: 'Masked ID verified', status: 'verified' },
    { id: 'upi', label: 'UPI / Bank Penny-Drop', detail: 'imran.upi@okaxis', status: 'verified' },
  ],
  shiftSelfieVerified: false,
  shiftSelfieTimestamp: null,
  isOnline: false,
};

export const RiderShiftKycScreen: React.FC<RiderShiftKycScreenProps> = ({
  initialState = 'ready',
  initialProfile = DEFAULT_PROFILE,
  onCaptureSelfie,
  onGoOnline,
  onRefresh,
}) => {
  const [loadState, setLoadState] = useState<KycLoadState>(initialState);
  const [profile, setProfile] = useState<RiderKycProfile>(initialProfile);
  const [refreshing, setRefreshing] = useState(false);
  const [capturingSelfie, setCapturingSelfie] = useState(false);
  const [goingOnline, setGoingOnline] = useState(false);

  const allDocsVerified = useMemo(
    () => profile.documents.length > 0 && profile.documents.every((d) => d.status === 'verified'),
    [profile.documents]
  );

  const canGoOnline = allDocsVerified && profile.shiftSelfieVerified;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (onRefresh) {
        const updated = await onRefresh();
        if (updated) setProfile(updated);
      }
      setLoadState('ready');
    } catch {
      setLoadState('error');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleSelfieGate = useCallback(async () => {
    setCapturingSelfie(true);
    try {
      if (onCaptureSelfie) {
        const res = await onCaptureSelfie();
        if (res) {
          setProfile((prev) => ({
            ...prev,
            shiftSelfieVerified: res.verified,
            shiftSelfieTimestamp: res.timestamp,
          }));
          return;
        }
      }
      const nowLabel = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      setProfile((prev) => ({
        ...prev,
        shiftSelfieVerified: true,
        shiftSelfieTimestamp: `Verified today at ${nowLabel}`,
      }));
    } catch {
      setLoadState('error');
    } finally {
      setCapturingSelfie(false);
    }
  }, [onCaptureSelfie]);

  const handleGoOnline = useCallback(async () => {
    if (!canGoOnline) return;
    setGoingOnline(true);
    try {
      if (onGoOnline) await onGoOnline();
      setProfile((prev) => ({ ...prev, isOnline: true }));
    } catch {
      setLoadState('error');
    } finally {
      setGoingOnline(false);
    }
  }, [canGoOnline, onGoOnline]);

  if (loadState === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateContainer}>
          <Text style={styles.stateTitle}>KYC Verification Unavailable</Text>
          <Text style={styles.stateBody}>
            Unable to load rider KYC profile or selfie check service. Check network and retry.
          </Text>
          <TouchableOpacity style={styles.riderPrimaryBtn} onPress={handleRefresh} accessibilityRole="button">
            <Text style={styles.riderPrimaryBtnText}>Retry Verification</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'empty') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateContainer}>
          <Text style={styles.stateTitle}>No KYC Documents Found</Text>
          <Text style={styles.stateBody}>
            Complete your Rider onboarding documents (DL, RC, Aadhaar, UPI) to unlock shifts.
          </Text>
          <TouchableOpacity style={styles.riderPrimaryBtn} onPress={handleRefresh} accessibilityRole="button">
            <Text style={styles.riderPrimaryBtnText}>Refresh KYC Status</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={BRAND_COLORS.goldenYellow}
          />
        }
      >
        {/* Rider Identity Header */}
        <View style={styles.headerCard}>
          <Text style={styles.eyebrow}>RIDER SHIFT & KYC GATE</Text>
          <Text style={styles.riderName}>{profile.riderName}</Text>
          <Text style={styles.riderMeta}>
            {profile.vehicleNumber} · {profile.zoneName}
          </Text>
        </View>

        {/* KYC Documents Checklist */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>1. KYC Verification Status</Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: allDocsVerified
                    ? STATUS_COLORS.successBgDark
                    : STATUS_COLORS.warningBgDark,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: allDocsVerified
                      ? BRAND_COLORS.electricGreenLight
                      : STATUS_COLORS.warningBright,
                  },
                ]}
              >
                {allDocsVerified ? 'ALL VERIFIED' : 'ACTION NEEDED'}
              </Text>
            </View>
          </View>

          {profile.documents.map((doc) => {
            const isVerified = doc.status === 'verified';
            const isRejected = doc.status === 'rejected';
            return (
              <View key={doc.id} style={styles.docRow}>
                <View style={styles.docInfo}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  <Text style={styles.docDetail}>{doc.detail}</Text>
                </View>
                <View
                  style={[
                    styles.docPill,
                    {
                      backgroundColor: isVerified
                        ? STATUS_COLORS.successBgDark
                        : isRejected
                          ? STATUS_COLORS.errorBgDark
                          : STATUS_COLORS.warningBgDark,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.docPillText,
                      {
                        color: isVerified
                          ? BRAND_COLORS.electricGreenLight
                          : isRejected
                            ? STATUS_COLORS.errorBright
                            : STATUS_COLORS.warningBright,
                      },
                    ]}
                  >
                    {doc.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Shift Selfie Gate */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>2. Live Shift Selfie Gate</Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: profile.shiftSelfieVerified
                    ? STATUS_COLORS.successBgDark
                    : BRAND_COLORS.goldenYellowGlow,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: profile.shiftSelfieVerified
                      ? BRAND_COLORS.electricGreenLight
                      : BRAND_COLORS.goldenYellow,
                  },
                ]}
              >
                {profile.shiftSelfieVerified ? 'SELFIE PASSED' : 'REQUIRED'}
              </Text>
            </View>
          </View>

          <Text style={styles.gateDescription}>
            A live selfie with helmet/vest check is mandatory once per shift before going online.
          </Text>

          {profile.shiftSelfieTimestamp ? (
            <View style={styles.selfieVerifiedBox}>
              <Text style={styles.selfieVerifiedText}>{profile.shiftSelfieTimestamp}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.selfieCta,
              profile.shiftSelfieVerified && styles.selfieCtaRetake,
            ]}
            onPress={handleSelfieGate}
            disabled={capturingSelfie}
            accessibilityRole="button"
            accessibilityLabel="Capture live shift selfie"
          >
            {capturingSelfie ? (
              <ActivityIndicator
                color={profile.shiftSelfieVerified ? SURFACE_DARK.textPrimary : SURFACE_DARK.onPrimary}
              />
            ) : (
              <Text
                style={[
                  styles.selfieCtaText,
                  profile.shiftSelfieVerified && styles.selfieCtaRetakeText,
                ]}
              >
                {profile.shiftSelfieVerified ? 'Retake Shift Selfie' : 'Capture Live Shift Selfie'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Go Online Gate CTA (56dp) */}
        <View style={styles.gateFooter}>
          {!canGoOnline && (
            <Text style={styles.gateWarningText}>
              Complete KYC verification and Shift Selfie above to unlock dispatch.
            </Text>
          )}
          <TouchableOpacity
            style={[
              styles.goOnlineBtn,
              !canGoOnline && styles.goOnlineBtnLocked,
              profile.isOnline && styles.goOnlineBtnActive,
            ]}
            onPress={handleGoOnline}
            disabled={!canGoOnline || goingOnline || profile.isOnline}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canGoOnline }}
          >
            {goingOnline ? (
              <ActivityIndicator color={SURFACE_DARK.onSuccess} />
            ) : (
              <Text style={styles.goOnlineBtnText}>
                {profile.isOnline
                  ? 'ONLINE — READY FOR DISPATCH'
                  : canGoOnline
                    ? 'Go Online for Shift'
                    : 'Locked Until Selfie Verified'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: SURFACE_DARK.background },
  container: { padding: SPACING.screenPadding, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  headerCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    gap: SPACING.xs,
  },
  eyebrow: { ...TYPOGRAPHY.captionMin, color: BRAND_COLORS.goldenYellow, letterSpacing: 0.8 },
  riderName: { ...TYPOGRAPHY.headlineLg, color: SURFACE_DARK.textPrimary },
  riderMeta: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary },
  sectionCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    gap: SPACING.md,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...TYPOGRAPHY.titleMd, color: SURFACE_DARK.textPrimary },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADII.sm },
  statusBadgeText: { ...TYPOGRAPHY.captionMin },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  docInfo: { flex: 1, gap: SPACING.xxs },
  docLabel: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.textPrimary },
  docDetail: { ...TYPOGRAPHY.bodySm, color: SURFACE_DARK.textMuted },
  docPill: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADII.sm },
  docPillText: { ...TYPOGRAPHY.captionMin },
  gateDescription: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary },
  selfieVerifiedBox: {
    backgroundColor: STATUS_COLORS.successBgDark,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: BRAND_COLORS.electricGreen,
  },
  selfieVerifiedText: { ...TYPOGRAPHY.labelMd, color: BRAND_COLORS.electricGreenLight },
  selfieCta: {
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfieCtaRetake: {
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
  },
  selfieCtaText: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onPrimary },
  selfieCtaRetakeText: { color: SURFACE_DARK.textPrimary },
  gateFooter: { gap: SPACING.sm },
  gateWarningText: { ...TYPOGRAPHY.bodySm, color: STATUS_COLORS.warningBright, textAlign: 'center' },
  goOnlineBtn: {
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.electricGreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  goOnlineBtnLocked: { backgroundColor: SURFACE_DARK.surface3, opacity: 0.65 },
  goOnlineBtnActive: { backgroundColor: BRAND_COLORS.electricGreen },
  goOnlineBtnText: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onSuccess },
  riderPrimaryBtn: {
    minHeight: TOUCH_TARGETS.riderActionHeight,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderPrimaryBtnText: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onPrimary },
  stateContainer: {
    flex: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  stateTitle: { ...TYPOGRAPHY.headlineMd, color: SURFACE_DARK.textPrimary, textAlign: 'center' },
  stateBody: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary, textAlign: 'center' },
  skeletonWrap: { padding: SPACING.screenPadding, gap: SPACING.md },
  skeletonCard: { height: 140, borderRadius: RADII.lg, backgroundColor: SURFACE_DARK.surface2 },
});

export default RiderShiftKycScreen;
