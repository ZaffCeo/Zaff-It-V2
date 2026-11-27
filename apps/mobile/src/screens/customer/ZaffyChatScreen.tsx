import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BRAND_COLORS, TYPOGRAPHY, SPACING, RADII } from '@zaff-it/shared/tokens';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import {
  zaffyApi,
  ZaffyApiError,
  type ZaffyLocale,
  type ZaffyMemory,
  type ZaffyProposal,
  type ZaffyConversation,
} from '@/services/zaffy';

type Props = NativeStackScreenProps<CustomerStackParamList, 'ZaffyChat'>;

interface ChatBubble {
  id: string;
  kind: 'user' | 'assistant' | 'tool' | 'error' | 'system';
  text: string;
  tools?: Array<{ tool: string; ok: boolean; write: boolean }>;
  proposals?: ZaffyProposal[];
}

const SUGGESTIONS = [
  '2 kg aam aur 1 litre doodh chahiye',
  'Sabse sasta apple kahan milega?',
  'Mera order ZAF kahan tak pahuncha?',
  'Aaj ke liye fruits suggest karo',
];

const PERSONALITY_LABEL: Record<string, string> = {
  shopping: '🛍 Shopping mode',
  complaints: '🤝 Care mode',
  payments: '💳 Payments mode',
  merchant: '🏪 Merchant mode',
  casual: '✨ Chat mode',
};

function uid(): string {
  return `b-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function proposalTitle(p: ZaffyProposal): string {
  switch (p.action_type) {
    case 'place_order': {
      const pm = String((p.action_payload as { payment_method?: string }).payment_method ?? 'cod');
      return pm === 'razorpay' ? 'Order place karein (Razorpay se payment)' : 'Order place karein (Cash on Delivery)';
    }
    case 'update_product_price':
      return 'Product ka price update karein';
    case 'update_stock':
      return 'Stock update karein';
    case 'update_shop_availability':
      return 'Shop open/close karein';
    case 'bulk_update_stock':
      return 'Bulk stock update karein';
    default:
      return 'Action confirm karein';
  }
}

export const ZaffyChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const initialQuery = route.params?.initialQuery?.trim() ?? '';
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState(initialQuery);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState<'user' | 'anon'>('user');
  const [limitToast, setLimitToast] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ZaffyConversation[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [locale, setLocale] = useState<ZaffyLocale>('hinglish');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memories, setMemories] = useState<ZaffyMemory[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatBubble>>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await zaffyApi.getSettings();
        setLocale(s.settings.preferred_language);
        setMemoryEnabled(s.settings.memory_enabled);
      } catch {
        /* defaults are fine */
      }
      if (initialQuery && !autoSent.current) {
        autoSent.current = true;
        void send(initialQuery, null);
        setInput('');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushBubble = useCallback((b: ChatBubble) => {
    setBubbles((prev) => [...prev, b]);
  }, []);

  const send = useCallback(
    async (text: string, convId: string | null) => {
      const query = text.trim();
      if (!query || sending) return;
      pushBubble({ id: uid(), kind: 'user', text: query });
      setSending(true);
      setLimitToast(null);
      try {
        const res = await zaffyApi.chat(query, convId ?? conversationId, locale);
        setMode(res.mode);
        if (res.conversation_id) setConversationId(res.conversation_id);
        pushBubble({
          id: uid(),
          kind: 'assistant',
          text: res.reply,
          tools: res.tool_trace.length > 0 ? res.tool_trace : undefined,
          proposals: res.proposals.length > 0 ? res.proposals : undefined,
        });
      } catch (e) {
        const msg =
          e instanceof ZaffyApiError
            ? e.status === 429
              ? 'Zaffy thoda busy hai — 1 minute me phir try karein.'
              : e.status === 401
                ? 'Sign-in expire ho gaya — dobara login karein.'
                : e.message
            : 'Network nahi mil raha — internet check karein.';
        pushBubble({ id: uid(), kind: 'error', text: msg });
        if (e instanceof ZaffyApiError && e.status === 429) setLimitToast('Rate limit: ek minute me 10 messages.');
      } finally {
        setSending(false);
      }
    },
    [conversationId, locale, pushBubble, sending],
  );

  const confirmProposal = useCallback(
    async (p: ZaffyProposal) => {
      setConfirmingId(p.id);
      try {
        const res = await zaffyApi.confirmAction(p.id);
        pushBubble({
          id: uid(),
          kind: 'system',
          text:
            res.action === 'place_order'
              ? `✅ Order confirmed: ${String((res.result as { order_number?: string }).order_number ?? '')} — total ₹${(Number((res.result as { total_paise?: number }).total_paise ?? 0) / 100).toFixed(2)}. Backend se verify kiya gaya.`
              : '✅ Action backend par execute ho gaya.',
        });
        setBubbles((prev) => prev.map((b) => ({ ...b, proposals: b.proposals?.filter((x) => x.id !== p.id) })));
      } catch (e) {
        const msg =
          e instanceof ZaffyApiError
            ? e.status === 410
              ? 'Proposal expire ho gaya — Zaffy se dobara banwayein.'
              : e.status === 409
                ? `Confirm nahi ho paya: ${e.message}`
                : e.message
            : 'Network error — phir try karein.';
        pushBubble({ id: uid(), kind: 'error', text: msg });
      } finally {
        setConfirmingId(null);
      }
    },
    [pushBubble],
  );

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    try {
      const res = await zaffyApi.listConversations();
      setHistory(res.conversations);
    } catch {
      setHistory([]);
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setHistoryOpen(false);
    try {
      const res = await zaffyApi.getConversation(id);
      setConversationId(id);
      const loaded: ChatBubble[] = [];
      for (const m of res.messages) {
        if (m.role === 'user') loaded.push({ id: m.id, kind: 'user', text: m.content });
        else if (m.role === 'assistant') {
          const meta = m.message_metadata as { tool_trace?: Array<{ tool: string; ok: boolean; write: boolean }>; proposals?: string[] } | undefined;
          loaded.push({
            id: m.id,
            kind: 'assistant',
            text: m.content,
            tools: meta?.tool_trace,
            proposals: [],
          });
        }
      }
      setBubbles(loaded);
    } catch {
      pushBubble({ id: uid(), kind: 'error', text: 'Conversation load nahi hui.' });
    }
  }, [pushBubble]);

  const openSettings = useCallback(async () => {
    setSettingsOpen(true);
    try {
      const [s, m] = await Promise.all([zaffyApi.getSettings(), zaffyApi.listMemories()]);
      setLocale(s.settings.preferred_language);
      setMemoryEnabled(s.settings.memory_enabled);
      setMemories(m.memories);
    } catch {
      /* keep current */
    }
  }, []);

  const toggleMemory = useCallback(async (on: boolean) => {
    setMemoryEnabled(on);
    try {
      await zaffyApi.saveSettings({ memory_enabled: on });
    } catch {
      setMemoryEnabled(!on);
    }
  }, []);

  const changeLocale = useCallback(async (l: ZaffyLocale) => {
    setLocale(l);
    try {
      await zaffyApi.saveSettings({ preferred_language: l });
    } catch {
      /* keep */
    }
  }, []);

  const approveMemory = useCallback(async (m: ZaffyMemory) => {
    try {
      await zaffyApi.patchMemory(m.id, { user_approved: true });
      setMemories((prev) => prev.map((x) => (x.id === m.id ? { ...x, user_approved: true } : x)));
    } catch {
      /* ignore */
    }
  }, []);

  const removeMemory = useCallback(async (m: ZaffyMemory) => {
    try {
      await zaffyApi.deleteMemory(m.id);
      setMemories((prev) => prev.filter((x) => x.id !== m.id));
    } catch {
      /* ignore */
    }
  }, []);

  const startNewChat = useCallback(() => {
    setConversationId(null);
    setBubbles([]);
    setHistoryOpen(false);
  }, []);

  const personalityHint = useMemo(() => PERSONALITY_LABEL.shopping, []);

  const renderItem = ({ item }: { item: ChatBubble }) => {
    if (item.kind === 'user') {
      return (
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
        </View>
      );
    }
    if (item.kind === 'error') {
      return (
        <View style={styles.zaffyRow}>
          <View style={styles.errorBubble}>
            <Ionicons name="alert-circle" size={14} color={BRAND_COLORS.charcoalBlack} />
            <Text style={styles.errorText}>{item.text}</Text>
          </View>
        </View>
      );
    }
    if (item.kind === 'system') {
      return (
        <View style={styles.systemRow}>
          <Text style={styles.systemText}>{item.text}</Text>
        </View>
      );
    }
    return (
      <View style={styles.zaffyRow}>
        <View style={styles.zaffyBubble}>
          <View style={styles.zaffyHead}>
            <View style={styles.zaffyAvatar}>
              <Text style={styles.zaffyAvatarText}>🤖</Text>
            </View>
            <Text style={styles.zaffyName}>Zaffy</Text>
          </View>
          <Text style={styles.zaffyText}>{item.text}</Text>
          {item.tools ? (
            <View style={styles.toolRow}>
              {item.tools.map((t, i) => (
                <View key={`${t.tool}-${i}`} style={styles.toolChip}>
                  <Ionicons name={t.write ? 'construct' : 'search'} size={10} color={BRAND_COLORS.charcoalBlack} />
                  <Text style={styles.toolChipText}>
                    {t.tool} {t.ok ? '✓' : '✗'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {(item.proposals ?? []).map((p) => (
          <View key={p.id} style={styles.proposalCard}>
            <View style={styles.proposalHead}>
              <Ionicons name="hand-left" size={13} color={BRAND_COLORS.charcoalBlack} />
              <Text style={styles.proposalTitle}>{proposalTitle(p)}</Text>
            </View>
            <Text style={styles.proposalMeta}>Confirm karna zaroori hai · 10 min me expire</Text>
            <View style={styles.proposalActions}>
              <Pressable
                onPress={() => void confirmProposal(p)}
                disabled={confirmingId === p.id}
                style={({ pressed }) => [styles.proposalConfirm, pressed && { opacity: 0.9 }]}
                accessibilityRole="button"
                accessibilityLabel="Confirm action"
              >
                {confirmingId === p.id ? (
                  <ActivityIndicator size="small" color={BRAND_COLORS.charcoalBlack} />
                ) : (
                  <Text style={styles.proposalConfirmText}>Confirm</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() =>
                  setBubbles((prev) =>
                    prev.map((b) => ({ ...b, proposals: b.proposals?.filter((x) => x.id !== p.id) })),
                  )
                }
                style={styles.proposalReject}
                accessibilityRole="button"
                accessibilityLabel="Reject action"
              >
                <Text style={styles.proposalRejectText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'android' ? undefined : 'padding'}>
        {/* Header */}
        <LinearGradient colors={[BRAND_COLORS.goldenYellow, BRAND_COLORS.goldenYellowHover]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={20} color={BRAND_COLORS.charcoalBlack} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Zaffy AI</Text>
            <Text style={styles.headerSub}>
              {mode === 'anon' ? 'Demo mode · sign-in for full power' : personalityHint}
            </Text>
          </View>
          <Pressable onPress={() => void openHistory()} style={styles.headerBtn} accessibilityLabel="Chat history">
            <Ionicons name="time-outline" size={20} color={BRAND_COLORS.charcoalBlack} />
          </Pressable>
          <Pressable onPress={() => void openSettings()} style={styles.headerBtn} accessibilityLabel="Zaffy settings">
            <Ionicons name="settings-outline" size={19} color={BRAND_COLORS.charcoalBlack} />
          </Pressable>
        </LinearGradient>

        {limitToast ? (
          <View style={styles.limitToast}>
            <Text style={styles.limitToastText}>{limitToast}</Text>
          </View>
        ) : null}

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={bubbles}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyMascot}>🤖</Text>
              <Text style={styles.emptyTitle}>Main Zaffy hoon!</Text>
              <Text style={styles.emptySub}>
                Shopping, order tracking, support — sab me madad karunga. Hindi, Hinglish ya English, jaise chaho.
              </Text>
              <View style={styles.suggestionWrap}>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} onPress={() => void send(s, null)} style={styles.suggestionChip}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
        />

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Zaffy se kuch bhi poochho…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.input}
            multiline
            maxLength={1000}
            editable={!sending}
          />
          <Pressable
            onPress={() => {
              const t = input;
              setInput('');
              void send(t, null);
            }}
            disabled={sending || input.trim().length === 0}
            style={({ pressed }) => [styles.sendBtn, (pressed || sending || input.trim().length === 0) && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {sending ? <ActivityIndicator size="small" color={BRAND_COLORS.charcoalBlack} /> : <Ionicons name="send" size={18} color={BRAND_COLORS.charcoalBlack} />}
          </Pressable>
        </View>

        {/* History modal */}
        {historyOpen ? (
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setHistoryOpen(false)} />
            <View style={styles.modalSheet}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Chat history</Text>
                <Pressable onPress={startNewChat} style={styles.newChatBtn}>
                  <Ionicons name="add" size={16} color={BRAND_COLORS.charcoalBlack} />
                  <Text style={styles.newChatText}>New chat</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.historyList}>
                {history.length === 0 ? <Text style={styles.historyEmpty}>Abhi koi chat nahi.</Text> : null}
                {history.map((c) => (
                  <View key={c.id} style={styles.historyRow}>
                    <Pressable style={styles.historyMain} onPress={() => void openConversation(c.id)}>
                      <Text style={styles.historyTitle} numberOfLines={1}>
                        {c.title}
                      </Text>
                      <Text style={styles.historyTime}>{new Date(c.updated_at).toLocaleString()}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void zaffyApi
                          .deleteConversation(c.id)
                          .then(() => setHistory((prev) => prev.filter((x) => x.id !== c.id)))
                          .catch(() => undefined);
                      }}
                      style={styles.historyDelete}
                      accessibilityLabel="Delete conversation"
                    >
                      <Ionicons name="trash-outline" size={16} color={BRAND_COLORS.charcoalBlack} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {/* Settings modal */}
        {settingsOpen ? (
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSettingsOpen(false)} />
            <ScrollView style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Zaffy settings</Text>
              <Text style={styles.sectionLabel}>Language</Text>
              <View style={styles.langRow}>
                {(['hinglish', 'hi', 'en-IN'] as ZaffyLocale[]).map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => void changeLocale(l)}
                    style={[styles.langChip, locale === l && styles.langChipActive]}
                  >
                    <Text style={[styles.langText, locale === l && styles.langTextActive]}>
                      {l === 'hinglish' ? 'Hinglish' : l === 'hi' ? 'हिंदी' : 'English'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.memoryToggleRow}>
                <Text style={styles.sectionLabel}>Memory</Text>
                <Switch value={memoryEnabled} onValueChange={(v) => void toggleMemory(v)} />
              </View>
              <Text style={styles.memoryNote}>
                Zaffy sirf aapki approved preferences yaad rakhta hai. kabhi bhi delete kar sakte ho.
              </Text>
              {memories.map((m) => (
                <View key={m.id} style={styles.memoryRow}>
                  <Text style={styles.memoryText}>
                    {m.memory_content} {m.user_approved ? '' : '· (awaiting approval)'}
                  </Text>
                  <View style={styles.memoryActions}>
                    {!m.user_approved ? (
                      <Pressable onPress={() => void approveMemory(m)} style={styles.memoryBtn}>
                        <Text style={styles.memoryBtnText}>Approve</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => void removeMemory(m)} style={styles.memoryBtn}>
                      <Ionicons name="trash-outline" size={14} color={BRAND_COLORS.charcoalBlack} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND_COLORS.goldenYellow },
  flex: { flex: 1, backgroundColor: BRAND_COLORS.charcoalBlack },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    gap: SPACING.xs,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  headerCenter: { flex: 1, marginLeft: 2 },
  headerTitle: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  headerSub: { fontSize: TYPOGRAPHY.captionMin.fontSize, color: 'rgba(14,42,22,0.75)', fontWeight: '600' },
  limitToast: {
    backgroundColor: BRAND_COLORS.goldenYellowHover,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
  },
  limitToastText: { fontSize: TYPOGRAPHY.captionMin.fontSize, fontWeight: '700', color: BRAND_COLORS.charcoalBlack },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.lg },
  emptyWrap: { alignItems: 'center', paddingTop: '30%' as unknown as number, paddingHorizontal: SPACING.lg },
  emptyMascot: { fontSize: 52 },
  emptyTitle: { fontSize: TYPOGRAPHY.headlineLg.fontSize, fontWeight: '900', color: '#FFFFFF', marginTop: SPACING.sm },
  emptySub: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  suggestionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACING.lg, justifyContent: 'center' },
  suggestionChip: {
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,235,153,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,235,153,0.08)',
  },
  suggestionText: { fontSize: TYPOGRAPHY.captionMin.fontSize, color: '#FFE9A8', fontWeight: '600' },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 4 },
  userBubble: {
    maxWidth: '80%',
    backgroundColor: BRAND_COLORS.goldenYellowHover,
    borderTopRightRadius: 4,
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  userText: { fontSize: TYPOGRAPHY.bodyMd.fontSize, color: BRAND_COLORS.charcoalBlack, fontWeight: '600' },
  zaffyRow: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 4, gap: 8 },
  zaffyBubble: {
    maxWidth: '88%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,235,153,0.18)',
    borderRadius: RADII.md,
    borderTopLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  zaffyHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  zaffyAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zaffyAvatarText: { fontSize: 12 },
  zaffyName: { fontSize: TYPOGRAPHY.captionMin.fontSize, fontWeight: '900', color: '#FFE9A8' },
  zaffyText: { fontSize: TYPOGRAPHY.bodyMd.fontSize, lineHeight: 20, color: '#FFFFFF' },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,235,153,0.12)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  toolChipText: { fontSize: 10, fontWeight: '700', color: BRAND_COLORS.charcoalBlack },
  errorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,107,107,0.14)',
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: { fontSize: TYPOGRAPHY.bodySm.fontSize, color: '#FFD9D9', fontWeight: '600', flexShrink: 1 },
  systemRow: { alignItems: 'center', marginVertical: 6 },
  systemText: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
    color: BRAND_COLORS.charcoalBlack,
    backgroundColor: BRAND_COLORS.goldenYellowHover,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  proposalCard: {
    width: '88%',
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    marginTop: 2,
  },
  proposalHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proposalTitle: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack, flexShrink: 1 },
  proposalMeta: { fontSize: 10, color: 'rgba(14,42,22,0.7)', fontWeight: '600', marginTop: 2 },
  proposalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  proposalConfirm: {
    backgroundColor: BRAND_COLORS.charcoalBlack,
    borderRadius: RADII.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  proposalConfirmText: { color: '#FFE9A8', fontWeight: '900', fontSize: TYPOGRAPHY.bodySm.fontSize },
  proposalReject: {
    borderWidth: 1.5,
    borderColor: 'rgba(14,42,22,0.4)',
    borderRadius: RADII.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  proposalRejectText: { color: BRAND_COLORS.charcoalBlack, fontWeight: '800', fontSize: TYPOGRAPHY.bodySm.fontSize },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,235,153,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 42,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalSheet: {
    backgroundColor: BRAND_COLORS.charcoalBlack,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '72%',
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,235,153,0.2)',
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '900', color: '#FFFFFF' },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  newChatText: { color: BRAND_COLORS.charcoalBlack, fontWeight: '800', fontSize: TYPOGRAPHY.captionMin.fontSize },
  historyList: { maxHeight: 380 },
  historyEmpty: { color: 'rgba(255,255,255,0.5)', fontSize: TYPOGRAPHY.bodySm.fontSize, paddingVertical: 12 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  historyMain: { flex: 1 },
  historyTitle: { color: '#FFFFFF', fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '600' },
  historyTime: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2 },
  historyDelete: { padding: 6 },
  sectionLabel: { fontSize: TYPOGRAPHY.captionMin.fontSize, fontWeight: '800', color: '#FFE9A8', marginTop: 8 },
  langRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  langChip: {
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,235,153,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  langChipActive: { backgroundColor: BRAND_COLORS.goldenYellow, borderColor: BRAND_COLORS.goldenYellow },
  langText: { color: '#FFFFFF', fontWeight: '700', fontSize: TYPOGRAPHY.captionMin.fontSize },
  langTextActive: { color: BRAND_COLORS.charcoalBlack },
  memoryToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  memoryNote: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 15 },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADII.sm,
    padding: 10,
    marginTop: 8,
  },
  memoryText: { flex: 1, color: '#FFFFFF', fontSize: TYPOGRAPHY.bodySm.fontSize },
  memoryActions: { flexDirection: 'row', gap: 6 },
  memoryBtn: {
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  memoryBtnText: { color: BRAND_COLORS.charcoalBlack, fontWeight: '800', fontSize: 11 },
});
