import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ColorSchemeMode } from '@zaff-it/shared/tokens';
import type { AppLanguage } from '@/i18n/translations';

export type UserRole = 'customer' | 'merchant' | 'rider' | 'admin';

/**
 * UUID guard: Postgres uuid columns reject any non-uuid string. Older dev
 * builds persisted placeholder ids like "dev-customer-makrana" under the same
 * storage key; hydrating those into today's store makes PostgREST fail with
 * `invalid input syntax for type uuid`. Sanitize on rehydrate AND on set.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v);
/** Null out any persisted value that is non-null and not a uuid. */
const uuidOrNull = (v: unknown): string | null => (isUuid(v) ? v : null);

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'packing'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export interface CartItem {
  productId: string;
  storeId: string;
  storeName: string;
  name: string;
  unitLabel: string;
  unitPricePaise: number; // Strictly integer paise
  mrpPaise: number;       // Strictly integer paise
  quantity: number;
  imageUrl?: string | null;
}

export interface CartTotalsPaise {
  subtotalPaise: number;
  deliveryFeePaise: number;
  handlingFeePaise: number;
  discountPaise: number;
  grandTotalPaise: number;
}

export interface MakranaZoneInfo {
  id: string;
  name: string;
  city: string;
  serviceable: boolean;
  minOrderPaise: number;
  baseDeliveryFeePaise: number;
  freeDeliveryThresholdPaise: number;
  formattedAddress: string;
}

export interface AppState {
  // Session & Preferences
  userId: string | null;
  phone: string | null;
  role: UserRole;
  language: AppLanguage;
  colorScheme: ColorSchemeMode;
  hasCompletedOnboarding: boolean;

  // Zone, Address & Location
  zone: MakranaZoneInfo;
  selectedAddressId: string | null;
  selectedAddressLabel: string;

  // Runtime notification badge (not persisted intentionally via partialize)
  unreadNotificationCount: number;

  // Offline-persisted single-store Cart (integer paise)
  cartStoreId: string | null;
  cartStoreName: string | null;
  cartItems: CartItem[];
  couponCode: string | null;
  promoCode: string | null;
  /** bump to make Home open the Parchi list modal (cross-screen trigger) */
  parchiRequestTick: number;
  activeOrderId: string | null;

  // Actions
  setSession: (
    userId: string | null,
    phone: string | null,
    role?: UserRole,
    opts?: { allowNonUuid?: boolean },
  ) => void;
  setRole: (role: UserRole) => void;
  setLanguage: (language: AppLanguage) => void;
  setColorScheme: (mode: ColorSchemeMode) => void;
  completeOnboarding: () => void;
  setZone: (zone: MakranaZoneInfo) => void;
  setSelectedAddressId: (addressId: string | null) => void;
  setSelectedAddressLabel: (label: string) => void;
  setSelectedAddress: (addressId: string | null, label: string) => void;
  setActiveOrderId: (orderId: string | null) => void;
  setCouponCode: (code: string | null) => void;
  setPromoCode: (code: string | null) => void;
  setParchiRequestTick: (tick: number) => void;
  setUnreadNotificationCount: (count: number) => void;

  addToCart: (item: Omit<CartItem, 'quantity'>) => { switchedStore: boolean };
  replaceCartWithItem: (item: Omit<CartItem, 'quantity'>) => void;
  updateItemQuantity: (productId: string, delta: number) => void;
  clearCart: () => void;
  signOutReset: () => void;
}

const DEFAULT_MAKRANA_ZONE: MakranaZoneInfo = {
  id: 'zone_makrana_central',
  name: 'Makrana Central',
  city: 'Makrana',
  serviceable: true,
  minOrderPaise: 9900,
  baseDeliveryFeePaise: 2500,
  freeDeliveryThresholdPaise: 19900,
  formattedAddress: 'Station Road, Makrana, Rajasthan 341505',
};

/**
 * Strictly integer paise math. Never uses floating-point arithmetic.
 */
export function computeLocalCartTotalsPaise(
  items: CartItem[],
  zone: MakranaZoneInfo,
): CartTotalsPaise {
  const subtotalPaise = items.reduce((sum, item) => {
    const unit = Math.trunc(item.unitPricePaise);
    const qty = Math.max(0, Math.trunc(item.quantity));
    return sum + unit * qty;
  }, 0);

  if (subtotalPaise === 0) {
    return {
      subtotalPaise: 0,
      deliveryFeePaise: 0,
      handlingFeePaise: 0,
      discountPaise: 0,
      grandTotalPaise: 0,
    };
  }

  const deliveryFeePaise =
    subtotalPaise >= Math.trunc(zone.freeDeliveryThresholdPaise)
      ? 0
      : Math.trunc(zone.baseDeliveryFeePaise);
  // Handling fee — doc §6: ₹5 (cart < ₹199) · ₹10 (cart >= ₹199). Offline fallback estimate;
  // server cart-preview / create_checkout_order are authoritative.
  const handlingFeePaise = subtotalPaise < 19900 ? 500 : 1000;
  const discountPaise = 0; // Server-authoritative promos applied via cart-preview
  const grandTotalPaise = Math.max(
    0,
    subtotalPaise + deliveryFeePaise + handlingFeePaise - discountPaise,
  );

  return {
    subtotalPaise,
    deliveryFeePaise,
    handlingFeePaise,
    discountPaise,
    grandTotalPaise,
  };
}

/**
 * Formats integer paise into ₹ string without floating-point precision errors.
 */
export function formatPaise(paise: number): string {
  const safePaise = Math.trunc(paise);
  const sign = safePaise < 0 ? '-' : '';
  const absPaise = Math.abs(safePaise);
  const rupees = Math.floor(absPaise / 100);
  const rem = absPaise % 100;
  if (rem === 0) {
    return `${sign}₹${rupees}`;
  }
  const remStr = rem < 10 ? `0${rem}` : String(rem);
  return `${sign}₹${rupees}.${remStr}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      userId: null,
      phone: null,
      role: 'customer',
      language: 'en',
      colorScheme: 'light',
      hasCompletedOnboarding: false,
      unreadNotificationCount: 0,
      zone: DEFAULT_MAKRANA_ZONE,
      selectedAddressId: null,
      selectedAddressLabel: '',
      cartStoreId: null,
      cartStoreName: null,
      cartItems: [],
      couponCode: null,
      promoCode: null,
      activeOrderId: null,
      parchiRequestTick: 0,

      setSession: (userId, phone, role, opts) =>
        set((state) => ({
          // Never let a non-uuid session id leak into uuid-filtered queries —
          // except an explicit dev-mode session (backend NOT configured, so no
          // uuid query can ever run). Real logins always pass auth.uuid().
          userId:
            userId === null
              ? null
              : uuidOrNull(userId) ?? (opts?.allowNonUuid === true ? userId : null),
          phone,
          role: role ?? state.role,
        })),

      setRole: (role) => set({ role }),
      setLanguage: (language) => set({ language }),
      setColorScheme: (colorScheme) => set({ colorScheme }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      setUnreadNotificationCount: (count: number) => set({ unreadNotificationCount: Math.max(0, Math.trunc(count)) }),
      setZone: (zone) => set({ zone }),
      setSelectedAddressId: (selectedAddressId) => set({ selectedAddressId }),
      setSelectedAddressLabel: (selectedAddressLabel) =>
        set({ selectedAddressLabel }),
      setSelectedAddress: (selectedAddressId, selectedAddressLabel) =>
        set({ selectedAddressId, selectedAddressLabel }),
      setActiveOrderId: (activeOrderId) => set({ activeOrderId }),
      setCouponCode: (couponCode) =>
        set({ couponCode, promoCode: couponCode }),
      setPromoCode: (promoCode) =>
        set({ promoCode, couponCode: promoCode }),

      setParchiRequestTick: (tick) => set({ parchiRequestTick: tick }),

      addToCart: (incoming) => {
        const state = get();
        const safeItem: Omit<CartItem, 'quantity'> = {
          ...incoming,
          unitPricePaise: Math.trunc(incoming.unitPricePaise),
          mrpPaise: Math.trunc(incoming.mrpPaise),
        };

        // Single-store basket enforcement
        if (
          state.cartStoreId !== null &&
          state.cartItems.length > 0 &&
          state.cartStoreId !== safeItem.storeId
        ) {
          return { switchedStore: true };
        }

        const existingIndex = state.cartItems.findIndex(
          (i) => i.productId === safeItem.productId,
        );
        const nextItems = [...state.cartItems];
        if (existingIndex >= 0) {
          const existing = nextItems[existingIndex];
          nextItems[existingIndex] = {
            ...existing,
            quantity: existing.quantity + 1,
          };
        } else {
          nextItems.push({ ...safeItem, quantity: 1 });
        }

        set({
          cartStoreId: safeItem.storeId,
          cartStoreName: safeItem.storeName,
          cartItems: nextItems,
        });
        return { switchedStore: false };
      },

      replaceCartWithItem: (incoming) =>
        set({
          cartStoreId: incoming.storeId,
          cartStoreName: incoming.storeName,
          couponCode: null,
          promoCode: null,
          cartItems: [
            {
              ...incoming,
              unitPricePaise: Math.trunc(incoming.unitPricePaise),
              mrpPaise: Math.trunc(incoming.mrpPaise),
              quantity: 1,
            },
          ],
        }),

      updateItemQuantity: (productId, delta) => {
        const state = get();
        const nextItems = state.cartItems
          .map((item) => {
            if (item.productId !== productId) return item;
            return { ...item, quantity: Math.trunc(item.quantity + delta) };
          })
          .filter((item) => item.quantity > 0);

        set({
          cartItems: nextItems,
          cartStoreId: nextItems.length > 0 ? state.cartStoreId : null,
          cartStoreName: nextItems.length > 0 ? state.cartStoreName : null,
        });
      },

      clearCart: () =>
        set({
          cartItems: [],
          cartStoreId: null,
          cartStoreName: null,
          couponCode: null,
          promoCode: null,
        }),

      signOutReset: () =>
        set({
          userId: null,
          phone: null,
          role: 'customer',
          activeOrderId: null,
          selectedAddressId: null,
          selectedAddressLabel: '',
        }),
    }),
    {
      name: 'zaff-it-app-storage-v1',
      version: 2, // v2: purge pre-V2 dev ids (e.g. "dev-customer-makrana") on hydrate
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        return {
          ...p,
          // Session ids are intentionally not persisted in v2 — stale or fake
          // ids from older builds must never reach uuid-filtered queries.
          userId: null,
          phone: null,
          activeOrderId: uuidOrNull(p.activeOrderId),
          selectedAddressId: uuidOrNull(p.selectedAddressId),
          cartStoreId: uuidOrNull(p.cartStoreId),
        };
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        language: state.language,
        colorScheme: state.colorScheme,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        cartStoreId: state.cartStoreId,
        cartStoreName: state.cartStoreName,
        cartItems: state.cartItems,
        couponCode: state.couponCode,
        promoCode: state.promoCode,
        zone: state.zone,
        selectedAddressId: state.selectedAddressId,
        selectedAddressLabel: state.selectedAddressLabel,
        activeOrderId: state.activeOrderId,
      }),
    },
  ),
);
