import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import {
  EmptyState,
  ErrorRetryBanner,
  LoadingSkeleton,
  PrimaryButton,
} from '@/components/StateViews';

interface SavedAddress {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  is_default: boolean;
  delivery_instructions?: string | null;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
  };
}

const MAKRANA_CENTER = { lat: 27.0419, lng: 74.7253 };

const MAKRANA_FALLBACK_ADDRESSES: SavedAddress[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    label: 'Home',
    recipient_name: 'Customer',
    phone: '+91 9876543210',
    line1: 'Station Road, Near Railway Crossing',
    line2: 'Ward 14',
    landmark: 'Opposite SBI ATM',
    city: 'Makrana',
    state: 'Rajasthan',
    pincode: '341505',
    lat: 27.0424,
    lng: 74.7261,
    is_default: true,
    delivery_instructions: 'Call on arrival at main gate',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    label: 'Work',
    recipient_name: 'Customer',
    phone: '+91 9876543210',
    line1: 'Marble Mandi Road, Borawar Bypass',
    line2: 'Plot 18',
    landmark: 'Near Makrana Marble Association',
    city: 'Makrana',
    state: 'Rajasthan',
    pincode: '341505',
    lat: 27.0378,
    lng: 74.7185,
    is_default: false,
    delivery_instructions: 'Deliver to front office reception',
  },
];

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isMakranaServiceable(city: string, pincode: string, lat: number, lng: number): boolean {
  const cleanCity = city.trim().toLowerCase();
  const cleanPin = pincode.trim();
  if (cleanPin === '341505' || cleanCity.includes('makrana')) {
    return true;
  }
  return distanceKm(lat, lng, MAKRANA_CENTER.lat, MAKRANA_CENTER.lng) <= 12;
}

function formatAddressLabel(addr: Pick<SavedAddress, 'label' | 'line1' | 'city' | 'pincode'>): string {
  return `${addr.label} • ${addr.line1}, ${addr.city} ${addr.pincode}`.trim();
}

export const AddressBookScreen: React.FC = () => {
  const navigation = useNavigation();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const userId = useAppStore((s) => s.userId);
  const phone = useAppStore((s) => s.phone);
  const zone = useAppStore((s) => s.zone);
  const selectedAddressId = useAppStore((s) => s.selectedAddressId);
  const setSelectedAddress = useAppStore((s) => s.setSelectedAddress);
  const setZone = useAppStore((s) => s.setZone);

  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  // Add Address Modal + OSM Nominatim Search
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingGeo, setSearchingGeo] = useState(false);
  const [geoResults, setGeoResults] = useState<NominatimResult[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [newRecipient, setNewRecipient] = useState('');
  const [newPhone, setNewPhone] = useState(phone ?? '');
  const [newLine1, setNewLine1] = useState('');
  const [newLandmark, setNewLandmark] = useState('');
  const [newCity, setNewCity] = useState('Makrana');
  const [newState, setNewState] = useState('Rajasthan');
  const [newPincode, setNewPincode] = useState('341505');
  const [newLat, setNewLat] = useState(MAKRANA_CENTER.lat);
  const [newLng, setNewLng] = useState(MAKRANA_CENTER.lng);
  const [newInstructions, setNewInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    if (!isSupabaseConfigured() || userId === null) {
      setAddresses(MAKRANA_FALLBACK_ADDRESSES);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('addresses')
        .select(
          'id, label, recipient_name, phone, line1, line2, landmark, city, state, pincode, lat, lng, is_default',
        )
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        setErrorMsg(error.message);
        setAddresses(MAKRANA_FALLBACK_ADDRESSES);
      } else if (data && data.length > 0) {
        setAddresses(data as SavedAddress[]);
      } else {
        setAddresses(MAKRANA_FALLBACK_ADDRESSES);
      }
    } catch {
      setErrorMsg('Unable to load saved addresses. Showing Makrana defaults.');
      setAddresses(MAKRANA_FALLBACK_ADDRESSES);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const handleSelectAddress = (addr: SavedAddress) => {
    const serviceable = isMakranaServiceable(addr.city, addr.pincode, addr.lat, addr.lng);
    const labelWithInstructions =
      deliveryInstructions.trim().length > 0
        ? `${formatAddressLabel(addr)} (${deliveryInstructions.trim()})`
        : formatAddressLabel(addr);

    setSelectedAddress(addr.id, labelWithInstructions);
    setZone({
      ...zone,
      city: addr.city,
      serviceable,
      formattedAddress: `${addr.line1}, ${addr.city}, ${addr.state} ${addr.pincode}`,
    });

    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleSearchNominatim = async () => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      setGeoError('Enter at least 3 characters to search Makrana or nearby streets.');
      return;
    }

    setSearchingGeo(true);
    setGeoError(null);
    try {
      const query = trimmed.toLowerCase().includes('makrana')
        ? trimmed
        : `${trimmed}, Makrana, Rajasthan`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=in&limit=5&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ZAFF-IT-CustomerApp/1.0',
        },
      });
      if (!res.ok) {
        throw new Error(`Nominatim HTTP ${res.status}`);
      }
      const results = (await res.json()) as NominatimResult[];
      setGeoResults(results);
      if (results.length === 0) {
        setGeoError('No OpenStreetMap matches found. You can still enter your street manually below.');
      }
    } catch {
      setGeoError('Address lookup unavailable right now. Enter street details manually below.');
      setGeoResults([]);
    } finally {
      setSearchingGeo(false);
    }
  };

  const applyNominatimResult = (item: NominatimResult) => {
    const addr = item.address;
    const street = [addr?.road, addr?.suburb].filter(Boolean).join(', ');
    setNewLine1(street.length > 0 ? street : item.display_name.split(',').slice(0, 2).join(', ').trim());
    setNewCity(addr?.city ?? addr?.town ?? addr?.village ?? 'Makrana');
    setNewState(addr?.state ?? 'Rajasthan');
    setNewPincode(addr?.postcode ?? '341505');
    const parsedLat = Number.parseFloat(item.lat);
    const parsedLng = Number.parseFloat(item.lon);
    if (!Number.isNaN(parsedLat) && !Number.isNaN(parsedLng)) {
      setNewLat(parsedLat);
      setNewLng(parsedLng);
    }
    setGeoResults([]);
  };

  const newAddressServiceable = useMemo(
    () => isMakranaServiceable(newCity, newPincode, newLat, newLng),
    [newCity, newPincode, newLat, newLng],
  );

  const handleSaveNewAddress = async () => {
    if (newLine1.trim().length < 4) {
      setGeoError('Please enter house/shop number and street name.');
      return;
    }
    setSaving(true);
    setGeoError(null);

    const localCandidate: SavedAddress = {
      id: `addr_${Date.now()}`,
      label: newLabel,
      recipient_name: newRecipient.trim().length > 0 ? newRecipient.trim() : 'Customer',
      phone: newPhone.trim().length > 0 ? newPhone.trim() : '+91 9876543210',
      line1: newLine1.trim(),
      line2: null,
      landmark: newLandmark.trim().length > 0 ? newLandmark.trim() : null,
      city: newCity.trim() || 'Makrana',
      state: newState.trim() || 'Rajasthan',
      pincode: newPincode.trim() || '341505',
      lat: newLat,
      lng: newLng,
      is_default: addresses.length === 0,
      delivery_instructions:
        newInstructions.trim().length > 0 ? newInstructions.trim() : null,
    };

    try {
      if (isSupabaseConfigured() && userId !== null) {
        const { data, error } = await supabase
          .from('addresses')
          .insert({
            user_id: userId,
            label: localCandidate.label,
            recipient_name: localCandidate.recipient_name,
            phone: localCandidate.phone,
            line1: localCandidate.line1,
            landmark: localCandidate.landmark,
            city: localCandidate.city,
            state: localCandidate.state,
            pincode: localCandidate.pincode,
            lat: localCandidate.lat,
            lng: localCandidate.lng,
            is_default: localCandidate.is_default,
          })
          .select(
            'id, label, recipient_name, phone, line1, line2, landmark, city, state, pincode, lat, lng, is_default',
          )
          .single();

        if (error) {
          setGeoError(error.message);
          setSaving(false);
          return;
        }
        if (data) {
          const inserted = {
            ...(data as SavedAddress),
            delivery_instructions: localCandidate.delivery_instructions,
          };
          setAddresses((prev) => [inserted, ...prev]);
          setSelectedAddress(inserted.id, formatAddressLabel(inserted));
        }
      } else {
        setAddresses((prev) => [localCandidate, ...prev]);
        setSelectedAddress(localCandidate.id, formatAddressLabel(localCandidate));
      }

      if (newInstructions.trim().length > 0) {
        setDeliveryInstructions(newInstructions.trim());
      }
      setAddModalOpen(false);
      setNewLine1('');
      setNewLandmark('');
      setNewInstructions('');
      setSearchQuery('');
    } catch {
      setGeoError('Could not save address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <View style={styles.headerRow}>
          {navigation.canGoBack() ? (
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={[styles.backBtn, { borderColor: surface.border }]}
            >
              <Ionicons name="arrow-back" size={20} color={surface.textPrimary} />
            </Pressable>
          ) : null}
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
              Delivery Addresses
            </Text>
            <Text style={[styles.headerSub, { color: surface.textMuted }]}>
              Makrana Pilot Zone • 20–30 min delivery
            </Text>
          </View>
          <Pressable
            onPress={() => setAddModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add new address"
            style={styles.addTopBtn}
          >
            <Ionicons name="add" size={18} color={BRAND_COLORS.charcoalBlack} />
            <Text style={styles.addTopBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {errorMsg !== null ? (
          <ErrorRetryBanner
            message={errorMsg}
            retryLabel="Retry"
            onRetry={loadAddresses}
            mode={colorScheme}
          />
        ) : null}

        {/* Delivery Instructions Card */}
        <View
          style={[
            styles.card,
            { backgroundColor: surface.surface1, borderColor: surface.border },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: surface.textPrimary }]}>
            Delivery Instructions (Optional)
          </Text>
          <TextInput
            value={deliveryInstructions}
            onChangeText={setDeliveryInstructions}
            placeholder="e.g. Call on arrival, leave at gate, near Jama Masjid"
            placeholderTextColor={surface.textMuted}
            maxLength={200}
            style={[
              styles.input,
              {
                backgroundColor: surface.surface2,
                borderColor: surface.border,
                color: surface.textPrimary,
              },
            ]}
          />
        </View>

        {loading ? (
          <LoadingSkeleton rows={3} mode={colorScheme} />
        ) : addresses.length === 0 ? (
          <EmptyState
            icon="location-outline"
            title="No saved addresses yet"
            subtitle="Add your home or shop address in Makrana to start ordering."
            ctaLabel="Add Address"
            onCtaPress={() => setAddModalOpen(true)}
            mode={colorScheme}
          />
        ) : (
          addresses.map((addr) => {
            const isSelected = selectedAddressId === addr.id;
            const serviceable = isMakranaServiceable(
              addr.city,
              addr.pincode,
              addr.lat,
              addr.lng,
            );
            return (
              <View
                key={addr.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: surface.surface1,
                    borderColor: isSelected
                      ? BRAND_COLORS.electricGreen
                      : surface.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.addrTopRow}>
                  <View style={styles.addrLabelRow}>
                    <Ionicons
                      name={
                        addr.label.toLowerCase() === 'work'
                          ? 'briefcase-outline'
                          : 'home-outline'
                      }
                      size={18}
                      color={BRAND_COLORS.charcoalBlack}
                    />
                    <Text style={[styles.addrLabel, { color: surface.textPrimary }]}>
                      {addr.label}
                    </Text>
                    {addr.is_default ? (
                      <View style={styles.defaultPill}>
                        <Text style={styles.defaultPillText}>DEFAULT</Text>
                      </View>
                    ) : null}
                  </View>

                  <View
                    style={[
                      styles.serviceBadge,
                      {
                        backgroundColor: serviceable
                          ? STATUS_COLORS.successBgLight
                          : STATUS_COLORS.warningBgLight,
                      },
                    ]}
                  >
                    <Ionicons
                      name={serviceable ? 'checkmark-circle' : 'alert-circle'}
                      size={14}
                      color={
                        serviceable
                          ? STATUS_COLORS.successTextLight
                          : STATUS_COLORS.warningTextLight
                      }
                    />
                    <Text
                      style={[
                        styles.serviceBadgeText,
                        {
                          color: serviceable
                            ? STATUS_COLORS.successTextLight
                            : STATUS_COLORS.warningTextLight,
                        },
                      ]}
                    >
                      {serviceable ? 'Serviceable' : 'Outside Zone'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.addrLine, { color: surface.textPrimary }]}>
                  {addr.line1}
                  {addr.line2 !== null && addr.line2 !== '' ? `, ${addr.line2}` : ''}
                </Text>
                {addr.landmark !== null && addr.landmark !== '' ? (
                  <Text style={[styles.addrMeta, { color: surface.textMuted }]}>
                    Landmark: {addr.landmark}
                  </Text>
                ) : null}
                <Text style={[styles.addrMeta, { color: surface.textMuted }]}>
                  {addr.city}, {addr.state} — {addr.pincode} • {addr.phone}
                </Text>

                <Pressable
                  onPress={() => handleSelectAddress(addr)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${addr.label} address`}
                  style={({ pressed }) => [
                    styles.selectBtn,
                    {
                      backgroundColor: isSelected
                        ? BRAND_COLORS.electricGreen
                        : BRAND_COLORS.goldenYellow,
                      opacity: pressed ? 0.88 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name={isSelected ? 'checkmark-done' : 'location-sharp'}
                    size={18}
                    color={
                      isSelected
                        ? BRAND_COLORS.pureWhite
                        : BRAND_COLORS.charcoalBlack
                    }
                  />
                  <Text
                    style={[
                      styles.selectBtnText,
                      {
                        color: isSelected
                          ? BRAND_COLORS.pureWhite
                          : BRAND_COLORS.charcoalBlack,
                      },
                    ]}
                  >
                    {isSelected ? 'Selected for Delivery' : 'Deliver Here'}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}

        <PrimaryButton
          label="Add New Makrana Address"
          onPress={() => setAddModalOpen(true)}
          variant="outline"
          icon="add-circle-outline"
          mode={colorScheme}
        />
      </ScrollView>

      {/* Add Address Modal with OSM Nominatim Geocoding */}
      <Modal
        visible={addModalOpen}
        animationType="slide"
        onRequestClose={() => setAddModalOpen(false)}
      >
        <SafeAreaView
          style={[styles.safe, { backgroundColor: surface.background }]}
          edges={['top', 'bottom', 'left', 'right']}
        >
          <View style={[styles.header, { borderBottomColor: surface.border }]}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerTitle, { color: surface.textPrimary, flex: 1 }]}>
                Add Delivery Address
              </Text>
              <Pressable
                onPress={() => setAddModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close add address modal"
                style={[styles.backBtn, { borderColor: surface.border }]}
              >
                <Ionicons name="close" size={22} color={surface.textPrimary} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* OSM Nominatim Search */}
            <View
              style={[
                styles.card,
                { backgroundColor: surface.surface1, borderColor: surface.border },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: surface.textPrimary }]}>
                Search Area (OpenStreetMap Nominatim)
              </Text>
              <View style={styles.searchRow}>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="e.g. Station Road, Marble Mandi, Borawar"
                  placeholderTextColor={surface.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={handleSearchNominatim}
                  style={[
                    styles.input,
                    styles.searchInput,
                    {
                      backgroundColor: surface.surface2,
                      borderColor: surface.border,
                      color: surface.textPrimary,
                    },
                  ]}
                />
                <Pressable
                  onPress={handleSearchNominatim}
                  disabled={searchingGeo}
                  accessibilityRole="button"
                  accessibilityLabel="Search address on OpenStreetMap"
                  style={styles.searchBtn}
                >
                  {searchingGeo ? (
                    <ActivityIndicator size="small" color={BRAND_COLORS.charcoalBlack} />
                  ) : (
                    <Ionicons name="search" size={20} color={BRAND_COLORS.charcoalBlack} />
                  )}
                </Pressable>
              </View>

              {geoError !== null ? (
                <Text style={[styles.errorText, { color: STATUS_COLORS.error }]}>
                  {geoError}
                </Text>
              ) : null}

              {geoResults.length > 0 ? (
                <View style={styles.geoList}>
                  {geoResults.map((item) => (
                    <Pressable
                      key={String(item.place_id)}
                      onPress={() => applyNominatimResult(item)}
                      accessibilityRole="button"
                      style={[
                        styles.geoRow,
                        {
                          backgroundColor: surface.surface2,
                          borderColor: surface.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="pin-outline"
                        size={18}
                        color={BRAND_COLORS.electricGreen}
                      />
                      <Text
                        style={[styles.geoText, { color: surface.textPrimary }]}
                        numberOfLines={2}
                      >
                        {item.display_name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Address Form */}
            <View
              style={[
                styles.card,
                { backgroundColor: surface.surface1, borderColor: surface.border },
              ]}
            >
              <View style={styles.addrTopRow}>
                <Text style={[styles.sectionLabel, { color: surface.textPrimary }]}>
                  Address Details
                </Text>
                <View
                  style={[
                    styles.serviceBadge,
                    {
                      backgroundColor: newAddressServiceable
                        ? STATUS_COLORS.successBgLight
                        : STATUS_COLORS.warningBgLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.serviceBadgeText,
                      {
                        color: newAddressServiceable
                          ? STATUS_COLORS.successTextLight
                          : STATUS_COLORS.warningTextLight,
                      },
                    ]}
                  >
                    {newAddressServiceable ? 'Makrana Serviceable' : 'Check Zone'}
                  </Text>
                </View>
              </View>

              <View style={styles.chipRow}>
                {(['Home', 'Work', 'Other'] as const).map((lbl) => {
                  const active = newLabel === lbl;
                  return (
                    <Pressable
                      key={lbl}
                      onPress={() => setNewLabel(lbl)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      style={[
                        styles.labelChip,
                        {
                          backgroundColor: active
                            ? BRAND_COLORS.goldenYellow
                            : surface.surface2,
                          borderColor: active
                            ? BRAND_COLORS.goldenYellowPressed
                            : surface.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.labelChipText,
                          {
                            color: active
                              ? BRAND_COLORS.charcoalBlack
                              : surface.textPrimary,
                          },
                        ]}
                      >
                        {lbl}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={newRecipient}
                onChangeText={setNewRecipient}
                placeholder="Recipient Name"
                placeholderTextColor={surface.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: surface.surface2,
                    borderColor: surface.border,
                    color: surface.textPrimary,
                  },
                ]}
              />
              <TextInput
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="Phone (+91...)"
                placeholderTextColor={surface.textMuted}
                keyboardType="phone-pad"
                style={[
                  styles.input,
                  {
                    backgroundColor: surface.surface2,
                    borderColor: surface.border,
                    color: surface.textPrimary,
                  },
                ]}
              />
              <TextInput
                value={newLine1}
                onChangeText={setNewLine1}
                placeholder="House / Shop No., Street, Mohalla *"
                placeholderTextColor={surface.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: surface.surface2,
                    borderColor: surface.border,
                    color: surface.textPrimary,
                  },
                ]}
              />
              <TextInput
                value={newLandmark}
                onChangeText={setNewLandmark}
                placeholder="Nearby Landmark (optional)"
                placeholderTextColor={surface.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: surface.surface2,
                    borderColor: surface.border,
                    color: surface.textPrimary,
                  },
                ]}
              />
              <View style={styles.splitRow}>
                <TextInput
                  value={newCity}
                  onChangeText={setNewCity}
                  placeholder="City"
                  placeholderTextColor={surface.textMuted}
                  style={[
                    styles.input,
                    styles.splitInput,
                    {
                      backgroundColor: surface.surface2,
                      borderColor: surface.border,
                      color: surface.textPrimary,
                    },
                  ]}
                />
                <TextInput
                  value={newPincode}
                  onChangeText={setNewPincode}
                  placeholder="Pincode"
                  placeholderTextColor={surface.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={[
                    styles.input,
                    styles.splitInput,
                    {
                      backgroundColor: surface.surface2,
                      borderColor: surface.border,
                      color: surface.textPrimary,
                    },
                  ]}
                />
              </View>
              <TextInput
                value={newInstructions}
                onChangeText={setNewInstructions}
                placeholder="Delivery instructions (e.g. Ring bell twice)"
                placeholderTextColor={surface.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: surface.surface2,
                    borderColor: surface.border,
                    color: surface.textPrimary,
                  },
                ]}
              />
            </View>

            <PrimaryButton
              label="Save & Use Address"
              onPress={handleSaveNewAddress}
              loading={saving}
              variant="success"
              icon="checkmark-circle-outline"
              mode={colorScheme}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    marginTop: 2,
  },
  backBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTopBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  addTopBtnText: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
    color: BRAND_COLORS.charcoalBlack,
  },
  scrollContent: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  card: {
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  sectionLabel: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
  },
  input: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  addrTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  addrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  addrLabel: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
  },
  defaultPill: {
    backgroundColor: BRAND_COLORS.goldenYellowGlow,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADII.full,
  },
  defaultPillText: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
    color: BRAND_COLORS.charcoalBlack,
  },
  serviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADII.full,
  },
  serviceBadgeText: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
  },
  addrLine: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  addrMeta: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
  },
  selectBtn: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  selectBtnText: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
  },
  searchBtn: {
    minWidth: TOUCH_TARGETS.recommendedSize,
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '600',
  },
  geoList: {
    gap: SPACING.xs,
  },
  geoRow: {
    minHeight: TOUCH_TARGETS.minSize,
    padding: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  geoText: {
    flex: 1,
    fontSize: TYPOGRAPHY.bodySm.fontSize,
  },
  chipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  labelChip: {
    minHeight: TOUCH_TARGETS.chipMinHeight,
    minWidth: 76,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelChipText: {
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
  },
  splitRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  splitInput: {
    flex: 1,
  },
});
