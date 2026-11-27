import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BRAND_COLORS,
  BRAND_GRADIENTS,
  GLOW,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TOUCH_TARGETS,
  TYPOGRAPHY,
  pickProductArt,
} from '@zaff-it/shared/tokens';
import {
  computeLocalCartTotalsPaise,
  formatPaise,
  useAppStore,
  type CartItem,
} from '@/store/useAppStore';
import { getTranslation } from '@/i18n/translations';
import { ensureFreshSession, isSupabaseConfigured, supabase, SUPABASE_FUNCTIONS_URL } from '@/services/supabase';
import {
  EmptyState,
  ErrorRetryBanner,
  LoadingSkeleton,
  PrimaryButton,
} from '@/components/StateViews';
import { AssuranceStrip, GradientBanner } from '@/components/ui/PremiumKit';
import type { CustomerTabParamList } from '@/navigation/RootNavigator';

interface StoreRow {
  id: string;
  name: string;
  store_type: string;
  is_open: boolean;
  eta_min_minutes: number;
  eta_max_minutes: number;
}

interface CatalogueProduct {
  product_id: string;
  store_id: string;
  store_name: string;
  name: string;
  category_name: string;
  mrp_paise: number;
  selling_price_paise: number;
  available_to_sell: number;
  unit_label: string;
  eta_min_minutes: number;
  eta_max_minutes: number;
  image_url?: string | null;
}

interface CategoryTile {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  tintBg: string;
}

const TOP_CATEGORIES: CategoryTile[] = [
  { id: 'Fruits & Veggies', label: 'Fruits &\nVeggies', icon: 'nutrition-outline', tint: '#16A34A', tintBg: 'rgba(22,163,74,0.16)' },
  { id: 'Groceries', label: 'Groceries', icon: 'bag-handle-outline', tint: '#D97706', tintBg: 'rgba(217,119,6,0.16)' },
  { id: 'Dairy & Breakfast', label: 'Dairy &\nBreakfast', icon: 'cafe-outline', tint: '#2563EB', tintBg: 'rgba(37,99,235,0.16)' },
  { id: 'Snacks & Munchies', label: 'Snacks &\nMunchies', icon: 'fast-food-outline', tint: '#DC2626', tintBg: 'rgba(220,38,38,0.16)' },
  { id: 'Home Care', label: 'Home Care', icon: 'sparkles-outline', tint: '#0284C7', tintBg: 'rgba(2,132,199,0.16)' },
];

const ZAFFY_QUICK_PROMPTS = [
  {
    id: 'recipe',
    label: 'Recipe Shopping',
    icon: 'restaurant-outline' as const,
    prompt: 'Recipe Shopping: suggest ingredients for dinner from nearby Makrana stores',
  },
  {
    id: 'budget',
    label: '₹500 Budget',
    icon: 'basket-outline' as const,
    prompt: '₹500 Budget: build a daily essentials basket under ₹500',
  },
  {
    id: 'family',
    label: '4 Logon ke liye',
    icon: 'people-outline' as const,
    prompt: '4 Logon ke liye: groceries and breakfast staples for a family of 4',
  },
];

const FALLBACK_PRODUCTS: CatalogueProduct[] = [
  {
    product_id: 'prod_tomato_500g',
    store_id: 'str_makrana_kirana_01',
    store_name: 'Marwar Kirana & General Store',
    name: 'Fresh Hybrid Tomatoes',
    category_name: 'Fruits & Veggies',
    mrp_paise: 4500,
    selling_price_paise: 2500,
    available_to_sell: 30,
    unit_label: '500 g',
    eta_min_minutes: 22,
    eta_max_minutes: 28,
  },
  {
    product_id: 'prod_rice_5kg',
    store_id: 'str_makrana_kirana_01',
    store_name: 'Marwar Kirana & General Store',
    name: 'India Gate Basmati Rice',
    category_name: 'Groceries',
    mrp_paise: 49900,
    selling_price_paise: 45900,
    available_to_sell: 15,
    unit_label: '5 kg',
    eta_min_minutes: 22,
    eta_max_minutes: 28,
  },
  {
    product_id: 'prod_banana_6pc',
    store_id: 'str_makrana_kirana_01',
    store_name: 'Marwar Kirana & General Store',
    name: 'Fresh Robusta Bananas',
    category_name: 'Fruits & Veggies',
    mrp_paise: 5500,
    selling_price_paise: 4000,
    available_to_sell: 22,
    unit_label: '6 pcs',
    eta_min_minutes: 22,
    eta_max_minutes: 28,
  },
  {
    product_id: 'prod_milk_500ml',
    store_id: 'str_makrana_kirana_01',
    store_name: 'Marwar Kirana & General Store',
    name: 'Amul Taaza Toned Milk',
    category_name: 'Dairy & Breakfast',
    mrp_paise: 2800,
    selling_price_paise: 2700,
    available_to_sell: 24,
    unit_label: '500 ml',
    eta_min_minutes: 22,
    eta_max_minutes: 28,
  },
  {
    product_id: 'prod_lays_50g',
    store_id: 'str_makrana_kirana_01',
    store_name: 'Marwar Kirana & General Store',
    name: 'Lay’s Classic Salted Chips',
    category_name: 'Snacks & Munchies',
    mrp_paise: 2500,
    selling_price_paise: 2000,
    available_to_sell: 36,
    unit_label: '50 g',
    eta_min_minutes: 22,
    eta_max_minutes: 28,
  },
  {
    product_id: 'prod_detergent_1l',
    store_id: 'str_makrana_kirana_01',
    store_name: 'Marwar Kirana & General Store',
    name: 'Surf Excel Liquid Wash',
    category_name: 'Home Care',
    mrp_paise: 24000,
    selling_price_paise: 21000,
    available_to_sell: 12,
    unit_label: '1 L',
    eta_min_minutes: 22,
    eta_max_minutes: 28,
  },
];

type PromoSlide = import('@/components/ui/PremiumKit').BannerSlide & {
  image?: number;
  category: string;
  openZaffy?: boolean;
};

/** Auto-rotating premium promo carousel (2026 kinetic banner stack). */
const PROMO_SLIDES: PromoSlide[] = [
  {
    headline: 'Freshness at Best Price!',
    sub: 'Up to 50% OFF on daily staples',
    cta: 'Shop Now',
    image: require('../../../assets/banner-fresh-basket.jpg'),
    category: 'Fruits & Veggies',
  },
  {
    headline: 'Ask Zaffy, Shop Smart',
    sub: 'AI assistant · budget baskets · recipes',
    cta: 'Try Zaffy',
    icon: 'sparkles',
    category: 'All',
    openZaffy: true,
  },
  {
    headline: 'Munch Time Bonanza',
    sub: 'Flat 70% OFF on snacks & drinks',
    cta: 'Grab Deal',
    icon: 'flash',
    category: 'Snacks & Munchies',
  },
  {
    headline: 'FREE Delivery over ₹299',
    sub: 'Makrana pilot · live rider ETA',
    cta: 'Start Order',
    icon: 'bicycle',
    category: 'All',
  },
];

export const CustomerHomeScreen: React.FC = () => {
  const navigation =
    useNavigation<BottomTabNavigationProp<CustomerTabParamList> & NativeStackNavigationProp<CustomerStackParamList>>();
  const language = useAppStore((s) => s.language);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const zone = useAppStore((s) => s.zone);
  const cartItems = useAppStore((s) => s.cartItems);
  const addToCart = useAppStore((s) => s.addToCart);
  const replaceCartWithItem = useAppStore((s) => s.replaceCartWithItem);
  const updateItemQuantity = useAppStore((s) => s.updateItemQuantity);
  const t = getTranslation(language);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const unreadNotificationCount = useAppStore((s) => s.unreadNotificationCount);
  const setUnreadNotificationCount = useAppStore((s) => s.setUnreadNotificationCount);
  // ZaffCoin balance: live from wallet_ledger when a real session exists;
  // demo builds keep the established 425 display value.
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [promoIndex, setPromoIndex] = useState(0);
  const [products, setProducts] = useState<CatalogueProduct[]>(FALLBACK_PRODUCTS);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Record<string, boolean>>({});
  const [pendingSwitchItem, setPendingSwitchItem] = useState<Omit<
    CartItem,
    'quantity'
  > | null>(null);

  // Ask Zaffy AI modal state
  const [zaffyOpen, setZaffyOpen] = useState(false);
  const [zaffyPrompt, setZaffyPrompt] = useState('');
  const [zaffyReply, setZaffyReply] = useState<string | null>(null);
  const [zaffyLoading, setZaffyLoading] = useState(false);

  const loadCatalogue = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setProducts(FALLBACK_PRODUCTS);
      setErrorMsg(null);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('id, name, store_type, is_open, eta_min_minutes, eta_max_minutes')
        .eq('is_active', true)
        .limit(5);

      if (storesError) {
        setErrorMsg(storesError.message);
        return;
      }

      const activeStores = (storesData ?? []) as StoreRow[];
      if (activeStores.length === 0) {
        setProducts(FALLBACK_PRODUCTS);
        return;
      }

      const primaryStore = activeStores[0];
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_store_catalogue',
        {
          p_store_id: primaryStore.id,
          p_category_id: null,
          p_search: searchQuery.trim().length > 0 ? searchQuery.trim() : null,
          p_limit: 30,
          p_offset: 0,
        },
      );

      if (rpcError) {
        setErrorMsg(rpcError.message);
        return;
      }

      const mapped: CatalogueProduct[] = ((rpcData ?? []) as Array<Record<string, unknown>>).map(
        (row) => ({
          product_id: String(row.product_id),
          store_id: primaryStore.id,
          store_name: primaryStore.name,
          name: String(row.name),
          category_name: String(row.category_name ?? 'Groceries'),
          mrp_paise: Math.trunc(Number(row.mrp_paise ?? 0)),
          selling_price_paise: Math.trunc(Number(row.selling_price_paise ?? 0)),
          available_to_sell: Math.trunc(Number(row.available_to_sell ?? 0)),
          unit_label: String(row.unit_label ?? '1 unit'),
          eta_min_minutes: primaryStore.eta_min_minutes,
          eta_max_minutes: primaryStore.eta_max_minutes,
          image_url: typeof row.image_url === 'string' && row.image_url.length > 0 ? row.image_url : null,
        }),
      );
      setProducts(mapped);
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, t.errorGeneric]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .then(({ count }) => {
        setUnreadNotificationCount(count ?? 0);
      });
  }, [setUnreadNotificationCount]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // demo mode: no backend — keep the classic demo chip value
      setCoinBalance(425);
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data: sess }) => {
        const uid = sess.session?.user?.id;
        if (!uid) {
          setCoinBalance(425); // dev demo session (no Supabase JWT)
          return;
        }
        return supabase
          .from('wallet_ledger')
          .select('balance_after')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .then(({ data }) => setCoinBalance(data?.[0]?.balance_after ?? 0));
      })
      .catch(() => setCoinBalance((b) => b ?? null));
  }, []);

  useEffect(() => {
    const id = setInterval(
      () => setPromoIndex((i) => (i + 1) % PROMO_SLIDES.length),
      4200,
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  const filteredProducts = products.filter((item) => {
    const matchesCat =
      selectedCategory === 'All' ||
      item.category_name.toLowerCase().includes(selectedCategory.toLowerCase()) ||
      selectedCategory.toLowerCase().includes(item.category_name.toLowerCase());
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      q.length === 0 ||
      item.name.toLowerCase().includes(q) ||
      item.store_name.toLowerCase().includes(q) ||
      item.category_name.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const handleAddItem = (item: CatalogueProduct) => {
    const payload: Omit<CartItem, 'quantity'> = {
      productId: item.product_id,
      storeId: item.store_id,
      storeName: item.store_name,
      name: item.name,
      unitLabel: item.unit_label,
      unitPricePaise: item.selling_price_paise,
      mrpPaise: item.mrp_paise,
    };
    const res = addToCart(payload);
    if (res.switchedStore) {
      setPendingSwitchItem(payload);
    }
  };

  const toggleWishlist = (productId: string) => {
    setWishlistIds((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const openZaffyWithPrompt = (presetPrompt: string) => {
    setZaffyPrompt(presetPrompt);
    setZaffyReply(null);
    setZaffyOpen(true);
  };

  const handleAskZaffy = async () => {
    const trimmed = zaffyPrompt.trim();
    if (trimmed.length === 0) return;

    if (!isSupabaseConfigured()) {
      setZaffyReply(
        'Zaffy AI (Read-Only): Fresh Hybrid Tomatoes 500g (₹25), India Gate Basmati Rice 5kg (₹459), and Amul Taaza Milk 500ml (₹27) are available at Marwar Kirana.',
      );
      return;
    }

    setZaffyLoading(true);
    try {
      // Guarantee a fresh bearer: refresh proactively when the stored access
      // token is expired or about to expire (root-cause fix for the reported
      // "Invalid or expired Supabase JWT" error on Zaffy).
      const fresh = await ensureFreshSession();
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/zaffy-ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${fresh.token}`,
        },
        body: JSON.stringify({
          query: trimmed,
          // Backend zod enum: 'en-IN' | 'hi' | 'hinglish'. (Earlier code sent
          // 'hi-IN', which the backend rejected with 400 for Hindi users.)
          locale: language === 'hi' ? 'hi' : language === 'hi-Latn' ? 'hinglish' : 'en-IN',
          ...(products[0]?.store_id ? { store_id: products[0].store_id } : {}),
        }),
      });
      const json = (await response.json()) as { reply?: string; error?: { message?: string } };

      if (response.status === 401) {
        // One explicit refresh + retry; if it still 401s, the session is dead —
        // guide re-login instead of showing a raw token error.
        if (fresh.mode === 'user') {
          try {
            const { data: refreshed } = await supabase.auth.refreshSession();
            const retryToken = refreshed.session?.access_token;
            if (retryToken) {
              const retry = await fetch(`${SUPABASE_FUNCTIONS_URL}/zaffy-ai-assistant`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${retryToken}`,
                },
                body: JSON.stringify({
                  query: trimmed,
                  locale: language === 'hi' ? 'hi' : language === 'hi-Latn' ? 'hinglish' : 'en-IN',
                  ...(products[0]?.store_id ? { store_id: products[0].store_id } : {}),
                }),
              });
              if (retry.ok) {
                const retryJson = (await retry.json()) as { reply?: string };
                if (retryJson.reply) {
                  setZaffyReply(retryJson.reply);
                  return;
                }
              }
            }
          } catch {
            // fall through to re-auth guidance
          }
          setZaffyReply(
            'Session expire ho gayi. Profile → Logout karein aur dobara login karein — phir Zaffy poori shopping history ke saath jawab dega.',
          );
          return;
        }
        setZaffyReply(json.reply ?? json.error?.message ?? t.errorGeneric);
        return;
      }

      setZaffyReply(json.reply ?? json.error?.message ?? t.errorGeneric);
    } catch {
      setZaffyReply(t.errorGeneric);
    } finally {
      setZaffyLoading(false);
    }
  };

  const totals = computeLocalCartTotalsPaise(cartItems, zone);
  const totalCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const etaLabel = products[0]
    ? `${products[0].eta_min_minutes}-${products[0].eta_max_minutes} min`
    : '12 min';
  const freeDeliveryThresholdPaise = Math.trunc(zone.freeDeliveryThresholdPaise);
  const remainingForFreePaise = Math.max(0, freeDeliveryThresholdPaise - totals.subtotalPaise);
  const freeProgressPct = Math.min(
    1,
    totals.subtotalPaise / Math.max(1, freeDeliveryThresholdPaise),
  );

  const renderProductCard = ({ item }: { item: CatalogueProduct }) => {
    const inCart = cartItems.find((c) => c.productId === item.product_id);
    const outOfStock = item.available_to_sell <= 0;
    const isWishlisted = Boolean(wishlistIds[item.product_id]);
    const savingsPaise = Math.max(0, item.mrp_paise - item.selling_price_paise);
    const discountPct =
      item.mrp_paise > item.selling_price_paise
        ? Math.round(((item.mrp_paise - item.selling_price_paise) / item.mrp_paise) * 100)
        : 0;
    const imageUrl =
      typeof item.image_url === 'string' && item.image_url.length > 0
        ? item.image_url
        : null;

    return (
      <View
        style={[
          styles.productCard,
          {
            backgroundColor: surface.surface1,
            borderColor: surface.border,
          },
        ]}
      >
        {/* Visual: real photography (DB image_url) with emoji fallback */}
        <View style={[styles.productVisualBox, { backgroundColor: surface.surface2 }]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.productImage}
              resizeMode="contain"
              accessibilityLabel={item.name}
            />
          ) : (
            <Text style={styles.productArtText} accessibilityLabel={item.name}>
              {pickProductArt(item.name)}
            </Text>
          )}

          {/* Blinkit-style discount badge */}
          <View
            style={[
              styles.discountBadge,
              discountPct > 0 ? null : styles.freshBadge,
            ]}
          >
            <Text
              style={[
                styles.discountBadgeText,
                discountPct > 0 ? null : styles.freshBadgeText,
              ]}
            >
              {discountPct > 0 ? `${discountPct}% OFF` : 'FRESH'}
            </Text>
          </View>

          <Pressable
            onPress={() => toggleWishlist(item.product_id)}
            accessibilityRole="button"
            accessibilityLabel={`Wishlist ${item.name}`}
            style={styles.heartBtn}
            hitSlop={TOUCH_TARGETS.hitSlopDefault}
          >
            <Ionicons
              name={isWishlisted ? 'heart' : 'heart-outline'}
              size={17}
              color={isWishlisted ? STATUS_COLORS.error : surface.textMuted}
            />
          </Pressable>

          {/* ETA promise chip overlay (glass) */}
          <View style={styles.etaChip}>
            <Ionicons name="flash" size={10} color={BRAND_COLORS.electricGreen} />
            <Text style={[styles.etaText, { color: BRAND_COLORS.electricGreen }]}>
              {item.eta_min_minutes}-{item.eta_max_minutes} {t.etaUnit}
            </Text>
          </View>
        </View>

        <Text
          style={[styles.productName, { color: surface.textPrimary }]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        <Text style={[styles.unitLabel, { color: surface.textMuted }]}>
          {item.unit_label}
        </Text>

        <View style={styles.productBottomRow}>
          <View style={styles.priceStack}>
            <Text style={[styles.sellingPrice, { color: surface.textPrimary }]}>
              {formatPaise(item.selling_price_paise)}
            </Text>
            {item.mrp_paise > item.selling_price_paise ? (
              <Text style={[styles.mrpPrice, { color: surface.textMuted }]}>
                {formatPaise(item.mrp_paise)}
              </Text>
            ) : null}
          </View>

          {outOfStock ? (
            <View
              style={[
                styles.oosBadge,
                { backgroundColor: surface.surface2, borderColor: surface.border },
              ]}
            >
              <Text style={[styles.oosText, { color: surface.textMuted }]}>
                {t.outOfStock}
              </Text>
            </View>
          ) : inCart !== undefined ? (
            <View style={styles.stepperBox}>
              <Pressable
                onPress={() => updateItemQuantity(item.product_id, -1)}
                accessibilityRole="button"
                accessibilityLabel={`Decrease ${item.name}`}
                style={styles.stepperBtn}
                hitSlop={TOUCH_TARGETS.hitSlopDefault}
              >
                <Ionicons name="remove" size={15} color={BRAND_COLORS.pureWhite} />
              </Pressable>
              <Text style={styles.stepperQty}>{inCart.quantity}</Text>
              <Pressable
                onPress={() => updateItemQuantity(item.product_id, 1)}
                accessibilityRole="button"
                accessibilityLabel={`Increase ${item.name}`}
                style={styles.stepperBtn}
                hitSlop={TOUCH_TARGETS.hitSlopDefault}
              >
                <Ionicons name="add" size={15} color={BRAND_COLORS.pureWhite} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => handleAddItem(item)}
              accessibilityRole="button"
              accessibilityLabel={`${t.addBtn} ${item.name}`}
              style={({ pressed }) => [
                styles.addButton,
                { opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <Ionicons name="add" size={14} color={BRAND_COLORS.pureWhite} />
              <Text style={styles.addButtonText}>{t.addBtn}</Text>
            </Pressable>
          )}
        </View>

        {savingsPaise > 0 ? (
          <Text style={styles.savingsText}>
            You save {formatPaise(savingsPaise)}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderListHeader = () => (
    <View style={styles.headerSections}>
      {/* Top Header: Infinity-Z Logo + ZAFF-IT + Notification Bell + Golden Profile Avatar */}
      <View style={styles.topHeader}>
        <View style={styles.brandGroup}>
          <View style={styles.headerLogoWrap}>
            <Image
              source={require('../../../assets/zaff-it-logo.jpg')}
              style={styles.headerLogo}
              resizeMode="contain"
              accessibilityLabel="ZAFF-IT Logo"
            />
          </View>
          <View>
            <Text style={[styles.brandTitle, { color: surface.textPrimary }]}>
              ZAFF-IT
            </Text>
            <Text style={[styles.brandTagline, { color: surface.textMuted }]}>
              Shop Smart. Live Better.
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate('Wallet')}
            accessibilityRole="button"
            accessibilityLabel="Z-Coins Wallet"
            style={styles.coinsChip}
          >
            <Image
              source={require('../../../assets/zaffcoin.png')}
              style={styles.coinIcon}
              resizeMode="contain"
              accessibilityLabel="ZaffCoin"
            />
            <Text style={styles.coinsChipText}>{coinBalance ?? ''}</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('NotificationCenter')}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={styles.bellBtn}
          >
            <Ionicons
              name="notifications-outline"
              size={24}
              color={surface.textPrimary}
            />
            {unreadNotificationCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('AccountTab')}
            accessibilityRole="button"
            accessibilityLabel="Account Profile"
            style={styles.avatarBtn}
          >
            <Ionicons
              name="person"
              size={20}
              color={BRAND_COLORS.charcoalBlack}
            />
          </Pressable>
        </View>
      </View>

      {/* Location Pill */}
      <Pressable
        onPress={() => navigation.navigate('AccountTab')}
        accessibilityRole="button"
        accessibilityLabel="Delivery Location"
        style={[
          styles.locationPill,
          {
            backgroundColor: zone.serviceable
              ? surface.surface2
              : STATUS_COLORS.warningBgLight,
          },
        ]}
      >
        <Ionicons
          name={zone.serviceable ? 'location' : 'warning-outline'}
          size={18}
          color={BRAND_COLORS.goldenYellowPressed}
        />
        <View style={styles.locationTextWrap}>
          <Text style={[styles.locationSub, { color: surface.textMuted }]}>
            {zone.serviceable ? 'Delivering to' : t.outsideServiceArea}
          </Text>
          <Text
            style={[styles.locationMain, { color: surface.textPrimary }]}
            numberOfLines={1}
          >
            Home • {zone.city}
          </Text>
        </View>
        <View style={styles.etaPill}>
          <Ionicons name="flash" size={11} color={BRAND_COLORS.electricGreen} />
          <Text style={styles.etaPillText}>{etaLabel}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={surface.textSecondary} />
      </Pressable>

      {/* Dark Charcoal Search Pill */}
      <View style={styles.searchPill}>
        <Ionicons name="search" size={20} color={BRAND_COLORS.pureWhite} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() =>
            navigation.navigate('UniversalSearch', { initialQuery: searchQuery })
          }
          returnKeyType="search"
          placeholder="Need-It? Zaff-It. Search anything..."
          placeholderTextColor="#94A3B8"
          style={[styles.searchInput, { color: surface.textPrimary }]}
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => {
              setSearchQuery('');
              loadCatalogue();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear search text"
            style={styles.searchClearBtn}
          >
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => openZaffyWithPrompt('')}
          accessibilityRole="button"
          accessibilityLabel="Voice Search or Ask Zaffy"
          style={styles.micBtn}
        >
          <Ionicons name="mic-outline" size={20} color={BRAND_COLORS.pureWhite} />
        </Pressable>
      </View>

      {/* Warm Golden Ask Zaffy Card */}
      <View style={styles.askZaffyCard}>
        <View style={styles.askZaffyTopRow}>
          <View style={styles.zaffyMascotBadge}>
            <Image
              source={require('../../../assets/zaffy-mascot-v2.png')}
              style={styles.zaffyMascotImage}
              resizeMode="contain"
              accessibilityLabel="Zaffy AI Mascot"
            />
          </View>
          <View style={styles.askZaffyTitleWrap}>
            <Text style={styles.askZaffyTitle}>Ask Zaffy</Text>
            <Text style={styles.askZaffySub}>Kya mangwana hai?</Text>
          </View>
          <Pressable
            onPress={() => openZaffyWithPrompt('')}
            accessibilityRole="button"
            accessibilityLabel="Open Ask Zaffy"
            style={({ pressed }) => [
              styles.askZaffyGoBtn,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons
              name="arrow-forward"
              size={20}
              color={BRAND_COLORS.pureWhite}
            />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickPromptsRow}
        >
          {ZAFFY_QUICK_PROMPTS.map((chip) => (
            <Pressable
              key={chip.id}
              onPress={() => openZaffyWithPrompt(chip.prompt)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.quickPromptChip,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Ionicons
                name={chip.icon}
                size={15}
                color={BRAND_COLORS.charcoalBlack}
              />
              <Text style={styles.quickPromptText}>{chip.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Golden Promo Carousel — 2026 kinetic banner stack */}
      <View style={styles.promoBanner}>
        <GradientBanner
          slide={PROMO_SLIDES[promoIndex]}
          index={promoIndex}
          totalSlides={PROMO_SLIDES.length}
          image={PROMO_SLIDES[promoIndex].image}
          onPressCta={() => {
            const slide = PROMO_SLIDES[promoIndex];
            if (slide.openZaffy) openZaffyWithPrompt('Kya mangwana hai?');
            else setSelectedCategory(slide.category);
          }}
        />
        <View style={{ marginTop: SPACING.sm }}>
          <AssuranceStrip
            mode={colorScheme}
            items={[
              { icon: 'shield-checkmark', label: '100% Secure' },
              { icon: 'flash', label: 'Live ETA' },
              { icon: 'cash-outline', label: 'COD' },
              { icon: 'refresh-circle', label: 'Easy Refunds' },
            ]}
          />
        </View>
      </View>

      {/* Top Categories Horizontal Strip */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
          Top Categories
        </Text>
        <Pressable
          onPress={() =>
            navigation.navigate('CategoryDeepDive', {
              category: selectedCategory === 'All' ? undefined : selectedCategory,
            })
          }
          accessibilityRole="button"
          style={styles.seeAllBtn}
        >
          <Text style={[styles.seeAllText, { color: surface.textPrimary }]}>
            See All
          </Text>
          <Ionicons name="arrow-forward" size={15} color={surface.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesStrip}
      >
        {TOP_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.id;
          return (
            <Pressable
              key={cat.id}
              onPress={() =>
                setSelectedCategory(active ? 'All' : cat.id)
              }
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.catCard,
                {
                  backgroundColor: surface.surface1,
                  borderColor: active
                    ? BRAND_COLORS.goldenYellow
                    : surface.border,
                  borderWidth: active ? 2 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.catIconBox,
                  { backgroundColor: active ? BRAND_COLORS.goldenYellowGlow : cat.tintBg },
                ]}
              >
                <Ionicons name={cat.icon} size={24} color={cat.tint} />
              </View>
              <Text
                style={[styles.catLabel, { color: surface.textPrimary }]}
                numberOfLines={2}
              >
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Big Savings, Bigger Smiles Strip */}
      <Pressable
        onPress={() => setSelectedCategory('All')}
        accessibilityRole="button"
        style={styles.savingsStrip}
      >
        <View style={styles.savingsTagBadge}>
          <Ionicons name="pricetag" size={20} color={BRAND_COLORS.pureWhite} />
        </View>
        <View style={styles.savingsTextWrap}>
          <Text style={styles.savingsTitle}>Big Savings, Bigger Smiles!</Text>
          <Text style={styles.savingsSub}>
            Flat 70% OFF on your favourite brands
          </Text>
        </View>
        <Ionicons
          name="arrow-forward"
          size={18}
          color={BRAND_COLORS.charcoalBlack}
        />
      </Pressable>

      {/* Trending Right Now Section Header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
          Trending Right Now 🔥
        </Text>
        <Pressable
          onPress={() => navigation.navigate('CategoryDeepDive', { category: undefined })}
          accessibilityRole="button"
          style={styles.seeAllBtn}
        >
          <Text style={[styles.seeAllText, { color: surface.textPrimary }]}>
            See All
          </Text>
          <Ionicons name="arrow-forward" size={15} color={surface.textPrimary} />
        </Pressable>
      </View>

      {errorMsg !== null ? (
        <ErrorRetryBanner
          message={errorMsg}
          retryLabel={t.retryBtn}
          onRetry={loadCatalogue}
          mode={colorScheme}
        />
      ) : null}

      {loading ? <LoadingSkeleton rows={4} mode={colorScheme} /> : null}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.canvasLowest }]}
      edges={['top', 'left', 'right']}
    >
      {Platform.OS === 'web' ? (
        <FlatList
          data={loading ? [] : filteredProducts}
          numColumns={2}
          keyExtractor={(item) => item.product_id}
          renderItem={renderProductCard}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyPad}>
                <EmptyState
                  title={t.emptyCartTitle}
                  subtitle={t.emptyCartSubtitle}
                  mode={colorScheme}
                />
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlashList
          data={loading ? [] : filteredProducts}
          numColumns={2}
          keyExtractor={(item) => item.product_id}
          renderItem={renderProductCard}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyPad}>
                <EmptyState
                  title={t.emptyCartTitle}
                  subtitle={t.emptyCartSubtitle}
                  mode={colorScheme}
                />
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Cart Bar — free-delivery progress (Blinkit pattern) + gold CTA */}
      {totalCount > 0 ? (
        <View style={styles.floatingCartWrap}>
          <View
            style={[
              styles.freeDeliveryCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <Ionicons
              name={remainingForFreePaise > 0 ? 'bicycle-outline' : 'checkmark-circle'}
              size={16}
              color={
                remainingForFreePaise > 0
                  ? BRAND_COLORS.goldenYellowPressed
                  : BRAND_COLORS.electricGreen
              }
            />
            <Text
              style={[
                styles.freeDeliveryText,
                { color: surface.textSecondary },
              ]}
              numberOfLines={1}
            >
              {remainingForFreePaise > 0
                ? `${formatPaise(remainingForFreePaise)} more for FREE delivery`
                : 'FREE delivery unlocked!'}
            </Text>
            <View
              style={[styles.freeProgressTrack, { backgroundColor: surface.surface3 }]}
            >
              <View
                style={[
                  styles.freeProgressFill,
                  {
                    width: `${Math.round(freeProgressPct * 100)}%`,
                    backgroundColor:
                      remainingForFreePaise > 0
                        ? BRAND_COLORS.goldenYellow
                        : BRAND_COLORS.electricGreen,
                  },
                ]}
              />
            </View>
          </View>

          <Pressable
            onPress={() => navigation.navigate('CartTab')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.floatingCartBar,
              { opacity: pressed ? 0.92 : 1 },
            ]}
          >
            <LinearGradient
              colors={BRAND_GRADIENTS.gold}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.floatingCartGradient}
            >
              <View>
                <Text style={styles.floatingCartCount}>
                  {totalCount} {t.itemsInCart}
                </Text>
                <Text style={styles.floatingCartTotal}>
                  {formatPaise(totals.grandTotalPaise)}
                </Text>
              </View>
              <View style={styles.floatingCartCta}>
                <Text style={styles.floatingCartCtaText}>{t.viewCartBtn}</Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={BRAND_COLORS.charcoalBlack}
                />
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}

      {/* Single-store switch modal */}
      <Modal
        visible={pendingSwitchItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingSwitchItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: surface.textPrimary }]}>
              Replace Basket?
            </Text>
            <Text style={[styles.modalBody, { color: surface.textMuted }]}>
              ZAFF-IT delivers one store per order so your items arrive together.
              Replace your current basket with {pendingSwitchItem?.storeName ?? 'this store'}?
            </Text>
            <View style={styles.modalActions}>
              <PrimaryButton
                label={t.cancelBtn}
                variant="outline"
                onPress={() => setPendingSwitchItem(null)}
                mode={colorScheme}
                style={styles.modalBtn}
              />
              <PrimaryButton
                label={t.confirmBtn}
                onPress={() => {
                  if (pendingSwitchItem !== null) {
                    replaceCartWithItem(pendingSwitchItem);
                  }
                  setPendingSwitchItem(null);
                }}
                mode={colorScheme}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Ask Zaffy AI Modal */}
      <Modal
        visible={zaffyOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setZaffyOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <View style={styles.zaffyModalHeader}>
              <Text style={[styles.modalTitle, { color: surface.textPrimary }]}>
                {t.askZaffyTitle}
              </Text>
              <Pressable
                onPress={() => setZaffyOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color={surface.textPrimary} />
              </Pressable>
            </View>

            <TextInput
              value={zaffyPrompt}
              onChangeText={setZaffyPrompt}
              placeholder="Ask about atta, milk prices, or order status..."
              placeholderTextColor={surface.textMuted}
              multiline
              style={[
                styles.zaffyInput,
                {
                  backgroundColor: surface.surface2,
                  borderColor: surface.borderStrong,
                  color: surface.textPrimary,
                },
              ]}
            />

            {zaffyReply !== null ? (
              <View
                style={[
                  styles.zaffyReplyBox,
                  { backgroundColor: surface.surface2 },
                ]}
              >
                <Text style={[styles.zaffyReplyText, { color: surface.textPrimary }]}>
                  {zaffyReply}
                </Text>
              </View>
            ) : null}

            <PrimaryButton
              label={t.askZaffyTitle}
              onPress={handleAskZaffy}
              loading={zaffyLoading}
              mode={colorScheme}
              icon="sparkles"
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: 96,
  },
  headerSections: {
    gap: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.md,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerLogoWrap: {
    width: 48,
    height: 32,
    borderRadius: RADII.sm,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerLogo: {
    width: 44,
    height: 28,
  },
  brandTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  coinsChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#FFC703',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  coinIcon: {
    width: 18,
    height: 18,
    marginRight: 3,
  },
  coinsChipText: {
    fontSize: 12,
    fontWeight: '900' as const,
    color: '#121416',
    letterSpacing: 0.2,
  },
  bellBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: RADII.full,
    backgroundColor: STATUS_COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '800',
  },
  avatarBtn: {
    width: TOUCH_TARGETS.minSize,
    height: TOUCH_TARGETS.minSize,
    borderRadius: RADII.full,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  locationTextWrap: {
    flex: 1,
  },
  locationSub: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '500',
  },
  locationMain: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: BRAND_COLORS.charcoalBlack,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: 'rgba(255,199,3,0.32)',
    paddingHorizontal: SPACING.md,
    height: 50,
    ...GLOW.goldSoft,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    minHeight: TOUCH_TARGETS.minSize,
  },
  searchClearBtn: { padding: 4, marginLeft: 2 },
  micBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askZaffyCard: {
    backgroundColor: '#FFF3C4',
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: BRAND_COLORS.goldenYellow,
    padding: SPACING.md,
    gap: SPACING.md,
    overflow: 'hidden',
    ...GLOW.goldSoft,
  },
  askZaffyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  zaffyMascotBadge: {
    width: 52,
    height: 52,
    borderRadius: RADII.md,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zaffyMascotImage: {
    width: 46,
    height: 46,
  },
  askZaffyTitleWrap: {
    flex: 1,
  },
  askZaffyTitle: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '800',
  },
  askZaffySub: {
    color: '#334155',
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  askZaffyGoBtn: {
    width: TOUCH_TARGETS.minSize,
    height: TOUCH_TARGETS.minSize,
    borderRadius: RADII.full,
    backgroundColor: BRAND_COLORS.charcoalBlack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPromptsRow: {
    gap: SPACING.sm,
  },
  quickPromptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: BRAND_COLORS.pureWhite,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: TOUCH_TARGETS.minSize,
    paddingHorizontal: SPACING.md,
  },
  quickPromptText: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
  },
  promoBanner: {
    backgroundColor: '#FFD54F',
    borderRadius: RADII.lg,
    padding: SPACING.sm,
    gap: SPACING.sm,
    overflow: 'hidden',
  },
  promoLeft: {
    flex: 1,
    gap: SPACING.xs,
  },
  sponsoredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: BRAND_COLORS.charcoalBlack,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADII.full,
  },
  sponsoredText: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
  },
  promoHeadline: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '800',
    marginTop: 2,
  },
  promoSub: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
  },
  promoCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: BRAND_COLORS.charcoalBlack,
    borderRadius: RADII.full,
    minHeight: TOUCH_TARGETS.minSize,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.xs,
  },
  promoCtaText: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
  },
  promoRight: {
    paddingLeft: SPACING.md,
  },
  promoArtImage: {
    width: 112,
    height: 88,
    borderRadius: RADII.lg,
  },
  carouselDots: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: RADII.full,
    backgroundColor: 'rgba(18, 20, 22, 0.25)',
  },
  dotActive: {
    backgroundColor: BRAND_COLORS.charcoalBlack,
    width: 8,
    height: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '800',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: TOUCH_TARGETS.minSize,
    paddingHorizontal: SPACING.xs,
  },
  seeAllText: {
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
  },
  categoriesStrip: {
    gap: SPACING.sm,
  },
  catCard: {
    width: 82,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  catIconBox: {
    width: 52,
    height: 52,
    borderRadius: RADII.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLabel: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
    textAlign: 'center',
  },
  savingsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: '#FEF3C7',
    borderRadius: RADII.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    minHeight: TOUCH_TARGETS.recommendedSize,
  },
  savingsTagBadge: {
    width: 40,
    height: 40,
    borderRadius: RADII.md,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingsTextWrap: {
    flex: 1,
  },
  savingsTitle: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '800',
  },
  savingsSub: {
    color: '#334155',
    fontSize: TYPOGRAPHY.bodySm.fontSize,
  },
  emptyPad: {
    paddingVertical: SPACING.lg,
  },
  productCard: {
    flex: 1,
    margin: 4,
    padding: SPACING.sm,
    borderRadius: RADII.lg,
    borderWidth: 1,
    gap: SPACING.xs,
    overflow: 'hidden',
  },
  productVisualBox: {
    height: 96,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productArtText: {
    fontSize: 44,
  },
  discountBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: BRAND_COLORS.electricGreen,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  discountBadgeText: {
    color: BRAND_COLORS.pureWhite,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  freshBadge: {
    backgroundColor: BRAND_COLORS.goldenYellow,
  },
  freshBadgeText: {
    color: BRAND_COLORS.charcoalBlack,
  },
  heartBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaChip: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: RADII.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  etaText: {
    fontSize: 10,
    fontWeight: '800',
  },
  productName: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    minHeight: 36,
  },
  unitLabel: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
  },
  savingsText: {
    fontSize: 10,
    fontWeight: '700',
    color: BRAND_COLORS.electricGreen,
    marginTop: -2,
  },
  productBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: 4,
  },
  priceStack: {
    flexShrink: 1,
  },
  sellingPrice: {
    fontSize: 15,
    fontWeight: '800',
  },
  mrpPrice: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    textDecorationLine: 'line-through',
  },
  addButton: {
    minWidth: 68,
    minHeight: 42,
    borderRadius: RADII.sm,
    backgroundColor: BRAND_COLORS.electricGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    gap: 2,
  },
  addButtonText: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '800',
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND_COLORS.electricGreen,
    borderRadius: RADII.sm,
    minHeight: 42,
  },
  stepperBtn: {
    minWidth: 34,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '800',
    minWidth: 16,
    textAlign: 'center',
  },
  oosBadge: {
    minHeight: 42,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADII.sm,
    borderWidth: 1,
    justifyContent: 'center',
  },
  oosText: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '600',
  },
  floatingCartWrap: {
    position: 'absolute',
    left: SPACING.screenPadding,
    right: SPACING.screenPadding,
    bottom: SPACING.md,
  },
  freeDeliveryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  freeDeliveryText: {
    flex: 1,
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '700',
  },
  freeProgressTrack: {
    width: 64,
    height: 6,
    borderRadius: RADII.full,
    overflow: 'hidden',
  },
  freeProgressFill: {
    height: '100%',
    borderRadius: RADII.full,
  },
  floatingCartBar: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    borderRadius: RADII.md,
    overflow: 'hidden',
    ...GLOW.goldSoft,
  },
  floatingCartGradient: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingCartCount: {
    color: 'rgba(18,20,22,0.78)',
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
  },
  floatingCartTotal: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '800',
  },
  floatingCartCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  floatingCartCtaText: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '800',
  },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(12,131,31,0.12)',
    borderRadius: RADII.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  etaPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND_COLORS.electricGreen,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: SPACING.screenPadding,
  },
  modalCard: {
    borderRadius: RADII.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
  },
  modalBody: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: TYPOGRAPHY.bodyMd.lineHeight,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modalBtn: {
    flex: 1,
  },
  zaffyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zaffyInput: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  zaffyReplyBox: {
    padding: SPACING.md,
    borderRadius: RADII.md,
  },
  zaffyReplyText: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: TYPOGRAPHY.bodyMd.lineHeight,
  },
});
