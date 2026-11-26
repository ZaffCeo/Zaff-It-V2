import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
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

export type AdminLoadState = 'ready' | 'loading' | 'empty' | 'error';
export type ExceptionSeverity = 'critical' | 'warning';

export interface OrderExceptionItem {
  id: string;
  orderCode: string;
  type: 'SLA_BREACH' | 'RIDER_UNASSIGNED' | 'MERCHANT_REJECT' | 'COD_DISCREPANCY';
  severity: ExceptionSeverity;
  locality: string;
  elapsedMinutes: number;
  summary: string;
}

export interface MakranaZoneRules {
  zoneName: string;
  centerLat: string;
  centerLng: string;
  serviceRadiusKm: string;
  etaMinMinutes: string;
  etaMaxMinutes: string;
  baseDeliveryFeePaise: string;
  freeDeliveryThresholdPaise: string;
  surgeMultiplier: string;
}

export interface DarkStoreReadiness {
  currentDailyOrders: number;
  targetDailyOrders: number; // 500 orders/day trigger
  activeMerchantsCount: number;
  activeRidersCount: number;
  enableDarkStore: boolean;
  enableP1Verticals: boolean;
}

export interface AdminOpsBoardScreenProps {
  initialState?: AdminLoadState;
  initialExceptions?: OrderExceptionItem[];
  initialZoneRules?: MakranaZoneRules;
  initialReadiness?: DarkStoreReadiness;
  onResolveException?: (exceptionId: string) => Promise<void> | void;
  onReassignRider?: (exceptionId: string) => Promise<void> | void;
  onSaveZoneRules?: (rules: MakranaZoneRules) => Promise<void> | void;
  onToggleFeatureFlag?: (
    flag: 'enableDarkStore' | 'enableP1Verticals',
    nextValue: boolean
  ) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
}

const DEFAULT_EXCEPTIONS: OrderExceptionItem[] = [
  {
    id: 'exc_01',
    orderCode: 'MKR-1038',
    type: 'RIDER_UNASSIGNED',
    severity: 'critical',
    locality: 'Jain Nagar, Makrana',
    elapsedMinutes: 8,
    summary: 'No rider accepted offer after 2 broadcast rounds.',
  },
  {
    id: 'exc_02',
    orderCode: 'MKR-1035',
    type: 'SLA_BREACH',
    severity: 'warning',
    locality: 'Station Road, Makrana',
    elapsedMinutes: 16,
    summary: 'Merchant prep exceeded 12m target SLA.',
  },
];

const DEFAULT_ZONE_RULES: MakranaZoneRules = {
  zoneName: 'Makrana Pilot Polygon v1',
  centerLat: '27.0418',
  centerLng: '74.7186',
  serviceRadiusKm: '4.5',
  etaMinMinutes: '20',
  etaMaxMinutes: '30',
  baseDeliveryFeePaise: '2500',
  freeDeliveryThresholdPaise: '19900',
  surgeMultiplier: '1.0',
};

const DEFAULT_READINESS: DarkStoreReadiness = {
  currentDailyOrders: 342,
  targetDailyOrders: 500,
  activeMerchantsCount: 28,
  activeRidersCount: 19,
  enableDarkStore: false,
  enableP1Verticals: false,
};

function formatPaisePreview(paiseStr: string): string {
  const num = Number(paiseStr);
  if (!Number.isFinite(num) || num < 0) return '₹0.00';
  const rupees = num / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(rupees);
  } catch {
    return `₹${rupees.toFixed(2)}`;
  }
}

export const AdminOpsBoardScreen: React.FC<AdminOpsBoardScreenProps> = ({
  initialState = 'ready',
  initialExceptions = DEFAULT_EXCEPTIONS,
  initialZoneRules = DEFAULT_ZONE_RULES,
  initialReadiness = DEFAULT_READINESS,
  onResolveException,
  onReassignRider,
  onSaveZoneRules,
  onToggleFeatureFlag,
  onRefresh,
}) => {
  const [loadState, setLoadState] = useState<AdminLoadState>(initialState);
  const [exceptions, setExceptions] = useState<OrderExceptionItem[]>(initialExceptions);
  const [severityFilter, setSeverityFilter] = useState<'all' | ExceptionSeverity>('all');
  const [zoneRules, setZoneRules] = useState<MakranaZoneRules>(initialZoneRules);
  const [rulesSavedNotice, setRulesSavedNotice] = useState<string | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<DarkStoreReadiness>(initialReadiness);
  const [darkStoreConfirmVisible, setDarkStoreConfirmVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
      setLoadState('ready');
    } catch {
      setLoadState('error');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const filteredExceptions = useMemo(() => {
    if (severityFilter === 'all') return exceptions;
    return exceptions.filter((e) => e.severity === severityFilter);
  }, [exceptions, severityFilter]);

  const readinessPercent = useMemo(() => {
    const pct = (readiness.currentDailyOrders / Math.max(1, readiness.targetDailyOrders)) * 100;
    return Math.min(100, Math.max(0, Number(pct.toFixed(1))));
  }, [readiness.currentDailyOrders, readiness.targetDailyOrders]);

  const handleResolve = useCallback(
    (id: string) => {
      setExceptions((prev) => prev.filter((item) => item.id !== id));
      if (onResolveException) void onResolveException(id);
    },
    [onResolveException]
  );

  const handleSaveRules = useCallback(() => {
    const minEta = Number(zoneRules.etaMinMinutes);
    const maxEta = Number(zoneRules.etaMaxMinutes);
    const radius = Number(zoneRules.serviceRadiusKm);

    if (!Number.isFinite(radius) || radius <= 0) {
      setRulesError('Service radius must be greater than 0 km.');
      setRulesSavedNotice(null);
      return;
    }
    if (!Number.isFinite(minEta) || !Number.isFinite(maxEta) || minEta < 12 || maxEta < minEta) {
      setRulesError('Dynamic ETA bounds must be >= 12 min and max >= min.');
      setRulesSavedNotice(null);
      return;
    }

    setRulesError(null);
    setRulesSavedNotice('Makrana geofence & fee rules saved.');
    if (onSaveZoneRules) void onSaveZoneRules(zoneRules);
  }, [onSaveZoneRules, zoneRules]);

  const handleDarkStoreToggle = useCallback(
    (nextVal: boolean) => {
      if (nextVal && readiness.currentDailyOrders < readiness.targetDailyOrders) {
        setDarkStoreConfirmVisible(true);
        return;
      }
      setReadiness((prev) => ({ ...prev, enableDarkStore: nextVal }));
      if (onToggleFeatureFlag) void onToggleFeatureFlag('enableDarkStore', nextVal);
    },
    [onToggleFeatureFlag, readiness.currentDailyOrders, readiness.targetDailyOrders]
  );

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
          <Text style={styles.stateTitle}>Control Tower Sync Error</Text>
          <Text style={styles.stateBody}>
            Unable to load live Makrana ops board, geofence rules, or feature flags.
          </Text>
          <TouchableOpacity style={styles.primaryCta} onPress={handleRefresh} accessibilityRole="button">
            <Text style={styles.primaryCtaText}>Retry Ops Sync</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'empty') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateContainer}>
          <Text style={styles.stateTitle}>Ops Board Not Initialized</Text>
          <Text style={styles.stateBody}>
            Configure the Makrana service polygon and merchant zones to start monitoring.
          </Text>
          <TouchableOpacity style={styles.primaryCta} onPress={handleRefresh} accessibilityRole="button">
            <Text style={styles.primaryCtaText}>Reload Control Tower</Text>
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
        <View style={styles.topHeader}>
          <Text style={styles.eyebrow}>ADMIN CONTROL TOWER</Text>
          <Text style={styles.screenTitle}>Makrana Live Ops Board</Text>
        </View>

        {/* 1. Dark Store 500 Orders/Day Readiness Meter & Feature Flags */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Dark Store Readiness (500/day Gate)</Text>
            <Text style={styles.readinessPct}>{readinessPercent}%</Text>
          </View>

          <Text style={styles.readinessCount}>
            {readiness.currentDailyOrders} / {readiness.targetDailyOrders} orders/day
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${readinessPercent}%` }]} />
          </View>

          <View style={styles.readinessMetaRow}>
            <Text style={styles.metaChip}>
              {readiness.activeMerchantsCount} Active Merchants
            </Text>
            <Text style={styles.metaChip}>{readiness.activeRidersCount} Active Riders</Text>
          </View>

          <View style={styles.flagRow}>
            <View style={styles.flagTextCol}>
              <Text style={styles.flagLabel}>enable_dark_store</Text>
              <Text style={styles.flagSub}>
                Unlocks Dark Store & Batch Picker modules (recommended at 500/day)
              </Text>
            </View>
            <View style={styles.switchBox}>
              <Switch
                value={readiness.enableDarkStore}
                onValueChange={handleDarkStoreToggle}
                trackColor={{ false: SURFACE_DARK.surface3, true: BRAND_COLORS.electricGreen }}
                thumbColor={BRAND_COLORS.pureWhite}
                accessibilityLabel="Toggle enable_dark_store feature flag"
              />
            </View>
          </View>

          <View style={styles.flagRow}>
            <View style={styles.flagTextCol}>
              <Text style={styles.flagLabel}>enable_p1_verticals</Text>
              <Text style={styles.flagSub}>
                Enables Mohalla Group Orders & Request-It reverse bidding
              </Text>
            </View>
            <View style={styles.switchBox}>
              <Switch
                value={readiness.enableP1Verticals}
                onValueChange={(nextVal) => {
                  setReadiness((prev) => ({ ...prev, enableP1Verticals: nextVal }));
                  if (onToggleFeatureFlag) void onToggleFeatureFlag('enableP1Verticals', nextVal);
                }}
                trackColor={{ false: SURFACE_DARK.surface3, true: BRAND_COLORS.electricGreen }}
                thumbColor={BRAND_COLORS.pureWhite}
                accessibilityLabel="Toggle enable_p1_verticals feature flag"
              />
            </View>
          </View>
        </View>

        {/* 2. Live Order Exception Board */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Live Order Exceptions ({filteredExceptions.length})
            </Text>
          </View>

          <View style={styles.filterRow}>
            {(['all', 'critical', 'warning'] as const).map((sev) => {
              const selected = severityFilter === sev;
              return (
                <TouchableOpacity
                  key={sev}
                  style={[styles.filterChip, selected && styles.filterChipActive]}
                  onPress={() => setSeverityFilter(sev)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                    {sev.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {filteredExceptions.length === 0 ? (
            <View style={styles.inlineEmptyBox}>
              <Text style={styles.inlineEmptyText}>
                No active exceptions in this filter. Operations are running smoothly.
              </Text>
            </View>
          ) : (
            filteredExceptions.map((exc) => {
              const isCritical = exc.severity === 'critical';
              return (
                <View key={exc.id} style={styles.exceptionCard}>
                  <View style={styles.excHeader}>
                    <Text style={styles.excOrderCode}>
                      #{exc.orderCode} · {exc.type.replace(/_/g, ' ')}
                    </Text>
                    <View
                      style={[
                        styles.sevBadge,
                        {
                          backgroundColor: isCritical
                            ? STATUS_COLORS.errorBgDark
                            : STATUS_COLORS.warningBgDark,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sevBadgeText,
                          {
                            color: isCritical
                              ? STATUS_COLORS.errorBright
                              : STATUS_COLORS.warningBright,
                          },
                        ]}
                      >
                        {exc.elapsedMinutes}m · {exc.severity.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.excLocality}>{exc.locality}</Text>
                  <Text style={styles.excSummary}>{exc.summary}</Text>

                  <View style={styles.excActionRow}>
                    <TouchableOpacity
                      style={styles.excSecondaryBtn}
                      onPress={() => onReassignRider?.(exc.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.excSecondaryBtnText}>Reassign Rider</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.excResolveBtn}
                      onPress={() => handleResolve(exc.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.excResolveBtnText}>Mark Resolved</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* 3. Makrana Geofence & Service Zone Rules Editor */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Makrana Geofence & Zone Rules</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>Service Zone Name</Text>
            <TextInput
              style={styles.textInput}
              value={zoneRules.zoneName}
              onChangeText={(val) => setZoneRules((p) => ({ ...p, zoneName: val }))}
            />
          </View>

          <View style={styles.twoColRow}>
            <View style={styles.halfCol}>
              <Text style={styles.inputLabel}>Center Lat</Text>
              <TextInput
                style={styles.textInput}
                value={zoneRules.centerLat}
                keyboardType="decimal-pad"
                onChangeText={(val) => setZoneRules((p) => ({ ...p, centerLat: val }))}
              />
            </View>
            <View style={styles.halfCol}>
              <Text style={styles.inputLabel}>Center Lng</Text>
              <TextInput
                style={styles.textInput}
                value={zoneRules.centerLng}
                keyboardType="decimal-pad"
                onChangeText={(val) => setZoneRules((p) => ({ ...p, centerLng: val }))}
              />
            </View>
          </View>

          <View style={styles.twoColRow}>
            <View style={styles.halfCol}>
              <Text style={styles.inputLabel}>Radius (km)</Text>
              <TextInput
                style={styles.textInput}
                value={zoneRules.serviceRadiusKm}
                keyboardType="decimal-pad"
                onChangeText={(val) => setZoneRules((p) => ({ ...p, serviceRadiusKm: val }))}
              />
            </View>
            <View style={styles.halfCol}>
              <Text style={styles.inputLabel}>Surge Multiplier</Text>
              <TextInput
                style={styles.textInput}
                value={zoneRules.surgeMultiplier}
                keyboardType="decimal-pad"
                onChangeText={(val) => setZoneRules((p) => ({ ...p, surgeMultiplier: val }))}
              />
            </View>
          </View>

          <View style={styles.twoColRow}>
            <View style={styles.halfCol}>
              <Text style={styles.inputLabel}>Dynamic ETA Min (min)</Text>
              <TextInput
                style={styles.textInput}
                value={zoneRules.etaMinMinutes}
                keyboardType="number-pad"
                onChangeText={(val) => setZoneRules((p) => ({ ...p, etaMinMinutes: val }))}
              />
            </View>
            <View style={styles.halfCol}>
              <Text style={styles.inputLabel}>Dynamic ETA Max (min)</Text>
              <TextInput
                style={styles.textInput}
                value={zoneRules.etaMaxMinutes}
                keyboardType="number-pad"
                onChangeText={(val) => setZoneRules((p) => ({ ...p, etaMaxMinutes: val }))}
              />
            </View>
          </View>

          <View style={styles.twoColRow}>
            <View style={styles.halfCol}>
              <Text style={styles.inputLabel}>
                Base Fee (paise · {formatPaisePreview(zoneRules.baseDeliveryFeePaise)})
              </Text>
              <TextInput
                style={styles.textInput}
                value={zoneRules.baseDeliveryFeePaise}
                keyboardType="number-pad"
                onChangeText={(val) => setZoneRules((p) => ({ ...p, baseDeliveryFeePaise: val }))}
              />
            </View>
            <View style={styles.halfCol}>
              <Text style={styles.inputLabel}>
                Free Above (paise · {formatPaisePreview(zoneRules.freeDeliveryThresholdPaise)})
              </Text>
              <TextInput
                style={styles.textInput}
                value={zoneRules.freeDeliveryThresholdPaise}
                keyboardType="number-pad"
                onChangeText={(val) =>
                  setZoneRules((p) => ({ ...p, freeDeliveryThresholdPaise: val }))
                }
              />
            </View>
          </View>

          {rulesError ? <Text style={styles.errorText}>{rulesError}</Text> : null}
          {rulesSavedNotice ? <Text style={styles.savedText}>{rulesSavedNotice}</Text> : null}

          <TouchableOpacity
            style={styles.primaryCta}
            onPress={handleSaveRules}
            accessibilityRole="button"
          >
            <Text style={styles.primaryCtaText}>Save Makrana Zone Rules</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Dark Store Early Activation Guard Modal */}
      <Modal
        visible={darkStoreConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDarkStoreConfirmVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Below 500 Orders/Day Threshold</Text>
            <Text style={styles.modalBody}>
              Makrana is currently at {readiness.currentDailyOrders} orders/day (target: 500/day).
              Are you sure you want to force-enable Dark Store mode early?
            </Text>
            <View style={styles.excActionRow}>
              <TouchableOpacity
                style={styles.excSecondaryBtn}
                onPress={() => setDarkStoreConfirmVisible(false)}
                accessibilityRole="button"
              >
                <Text style={styles.excSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.excResolveBtn}
                onPress={() => {
                  setReadiness((prev) => ({ ...prev, enableDarkStore: true }));
                  if (onToggleFeatureFlag) void onToggleFeatureFlag('enableDarkStore', true);
                  setDarkStoreConfirmVisible(false);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.excResolveBtnText}>Enable Flag</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: SURFACE_DARK.background },
  container: { padding: SPACING.screenPadding, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  topHeader: { gap: SPACING.xxs },
  eyebrow: { ...TYPOGRAPHY.captionMin, color: BRAND_COLORS.goldenYellow, letterSpacing: 0.8 },
  screenTitle: { ...TYPOGRAPHY.headlineLg, color: SURFACE_DARK.textPrimary },
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
  readinessPct: {
    ...TYPOGRAPHY.headlineMd,
    color: BRAND_COLORS.goldenYellow,
    fontVariant: ['tabular-nums'],
  },
  readinessCount: {
    ...TYPOGRAPHY.bodyMd,
    color: SURFACE_DARK.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 12,
    borderRadius: RADII.full,
    backgroundColor: SURFACE_DARK.surface3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: RADII.full,
    backgroundColor: BRAND_COLORS.electricGreen,
  },
  readinessMetaRow: { flexDirection: 'row', gap: SPACING.sm },
  metaChip: {
    ...TYPOGRAPHY.captionMin,
    color: SURFACE_DARK.textSecondary,
    backgroundColor: SURFACE_DARK.surface2,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  flagTextCol: { flex: 1, gap: SPACING.xxs },
  flagLabel: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.textPrimary },
  flagSub: { ...TYPOGRAPHY.bodySm, color: SURFACE_DARK.textMuted },
  switchBox: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: { flexDirection: 'row', gap: SPACING.sm },
  filterChip: {
    minHeight: TOUCH_TARGETS.chipMinHeight,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.full,
    backgroundColor: SURFACE_DARK.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: BRAND_COLORS.goldenYellow },
  filterChipText: { ...TYPOGRAPHY.labelMd, color: SURFACE_DARK.textSecondary },
  filterChipTextActive: { color: SURFACE_DARK.onPrimary },
  inlineEmptyBox: {
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  inlineEmptyText: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary },
  exceptionCard: {
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    gap: SPACING.sm,
  },
  excHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  excOrderCode: {
    ...TYPOGRAPHY.labelLg,
    color: SURFACE_DARK.textPrimary,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  sevBadge: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADII.sm },
  sevBadgeText: { ...TYPOGRAPHY.captionMin },
  excLocality: { ...TYPOGRAPHY.bodySm, color: BRAND_COLORS.goldenYellow },
  excSummary: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary },
  excActionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  excSecondaryBtn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excSecondaryBtnText: { ...TYPOGRAPHY.labelMd, color: SURFACE_DARK.textPrimary },
  excResolveBtn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.electricGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excResolveBtnText: { ...TYPOGRAPHY.labelMd, color: SURFACE_DARK.onSuccess },
  fieldGroup: { gap: SPACING.xs },
  twoColRow: { flexDirection: 'row', gap: SPACING.md },
  halfCol: { flex: 1, gap: SPACING.xs },
  inputLabel: { ...TYPOGRAPHY.captionMin, color: SURFACE_DARK.textSecondary },
  textInput: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    paddingHorizontal: SPACING.md,
    color: SURFACE_DARK.textPrimary,
    ...TYPOGRAPHY.bodyMd,
    fontVariant: ['tabular-nums'],
  },
  errorText: { ...TYPOGRAPHY.bodySm, color: STATUS_COLORS.errorBright },
  savedText: { ...TYPOGRAPHY.bodySm, color: BRAND_COLORS.electricGreenLight },
  primaryCta: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  primaryCtaText: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onPrimary },
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
  skeletonCard: { height: 180, borderRadius: RADII.lg, backgroundColor: SURFACE_DARK.surface2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: SURFACE_DARK.surface3,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  modalTitle: { ...TYPOGRAPHY.headlineMd, color: SURFACE_DARK.textPrimary },
  modalBody: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary },
});

export default AdminOpsBoardScreen;
