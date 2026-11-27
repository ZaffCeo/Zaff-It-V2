import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import { supabase, isSupabaseConfigured } from '@/services/supabase';
import { EmptyState, ErrorRetryBanner, LoadingSkeleton } from '@/components/StateViews';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

function iconForKind(kind: string): keyof typeof Ionicons.glyphMap {
  if (kind.startsWith('order')) return 'bag-check-outline';
  if (kind.startsWith('payment')) return 'card-outline';
  if (kind.startsWith('rider')) return 'bicycle-outline';
  if (kind.startsWith('promo')) return 'gift-outline';
  return 'notifications-outline';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'abhi';
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ghante`;
  const days = Math.round(hours / 24);
  return `${days} din`;
}

export const NotificationCenterScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;
  const setUnreadCount = useAppStore((s) => s.setUnreadNotificationCount);

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const syncUnread = useCallback((list: NotificationRow[]) => {
    setUnreadCount(list.filter((r) => r.read_at === null).length);
  }, [setUnreadCount]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (!isSupabaseConfigured()) {
        setErrorMsg('Backend unavailable. Internet check karein.');
        return;
      }
      const { data, error } = await supabase
        .from('notifications')
        .select('id, kind, title, body, data, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      const list = (data ?? []) as NotificationRow[];
      setRows(list);
      syncUnread(list);
    } catch {
      setErrorMsg('Load nahi hua. Retry karein.');
    } finally {
      setLoading(false);
    }
  }, [syncUnread]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (row: NotificationRow) => {
    if (row.read_at !== null) return;
    setRows((prev) => {
      const next = prev.map((r) =>
        r.id === row.id ? { ...r, read_at: new Date().toISOString() } : r,
      );
      syncUnread(next);
      return next;
    });
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', row.id);
  };

  const markAllRead = async () => {
    const nowIso = new Date().toISOString();
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, read_at: r.read_at ?? nowIso }));
      syncUnread(next);
      return next;
    });
    await supabase
      .from('notifications')
      .update({ read_at: nowIso })
      .is('read_at', null);
  };

  const unread = rows.filter((r) => r.read_at === null).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: surface.background }]}>
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
          Notifications
        </Text>
        {unread > 0 && (
          <Pressable
            onPress={markAllRead}
            accessibilityRole="button"
            accessibilityLabel="Mark all read"
            style={styles.markAllBtn}
          >
            <Text style={[styles.markAllText, { color: BRAND_COLORS.goldenYellow }]}>
              Sab padh liya
            </Text>
          </Pressable>
        )}
      </View>

      {errorMsg ? (
        <ErrorRetryBanner message={errorMsg} retryLabel="Retry" onRetry={load} mode={colorScheme} />
      ) : null}

      <ScrollView contentContainerStyle={styles.listWrap} showsVerticalScrollIndicator={false}>
        {loading ? (
          <LoadingSkeleton rows={5} mode={colorScheme} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="Sab shant hai 🕊️"
            subtitle="Koi notification nahi. Order karte hi updates yahan dikhenge."
            mode={colorScheme}
          />
        ) : (
          rows.map((row) => {
            const isUnread = row.read_at === null;
            return (
              <Pressable
                key={row.id}
                onPress={() => markRead(row)}
                style={[
                  styles.item,
                  {
                    backgroundColor: isUnread ? surface.surface2 : surface.surface1,
                    borderColor: isUnread ? BRAND_COLORS.goldenYellow : surface.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: isUnread ? 'rgba(255,199,3,0.16)' : surface.surface1 },
                  ]}
                >
                  <Ionicons
                    name={iconForKind(row.kind)}
                    size={20}
                    color={isUnread ? BRAND_COLORS.goldenYellow : surface.textSecondary}
                  />
                </View>
                <View style={styles.itemBody}>
                  <View style={styles.itemTopRow}>
                    <Text
                      numberOfLines={1}
                      style={[styles.itemTitle, { color: surface.textPrimary }]}
                    >
                      {row.title}
                    </Text>
                    <Text style={[styles.itemTime, { color: surface.textMuted }]}>
                      {relativeTime(row.created_at)}
                    </Text>
                  </View>
                  {row.body ? (
                    <Text numberOfLines={2} style={[styles.itemBodyText, { color: surface.textSecondary }]}>
                      {row.body}
                    </Text>
                  ) : null}
                </View>
                {isUnread && <View style={styles.unreadDot} />}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '800', flex: 1 },
  markAllBtn: { padding: SPACING.xs },
  markAllText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '700' },
  listWrap: { padding: SPACING.screenPadding, paddingBottom: SPACING.xxl, gap: SPACING.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.lg,
    borderWidth: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: RADII.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { flex: 1, gap: 3 },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
  itemTitle: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '700', flexShrink: 1 },
  itemTime: { fontSize: TYPOGRAPHY.captionMin.fontSize },
  itemBodyText: { fontSize: TYPOGRAPHY.bodySm.fontSize, lineHeight: 17 },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: RADII.full,
    backgroundColor: BRAND_COLORS.goldenYellow,
  },
});
